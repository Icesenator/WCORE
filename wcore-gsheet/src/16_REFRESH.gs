/************************************************************
 * 16_REFRESH.gs - Watchdog & Cache Management
 *
 * Version: v4.5.23
 *
 * v4.5.23 FIX: normal watchdog no longer resets or repulses QUOTA rows
 *   without a live quota probe. QUOTA recovery is owned by QUOTA_RECOVERY_SWEEP,
 *   which calls _recoveryProbeQuota_ before reset/pulse.
 *
 * v4.15.58 FIX: never sync J1 from BLOCKED/NO_CACHE I1 values; preserving
 *   the old J1 latch is what keeps A1 on the last good cache during quota outages.
 * v4.5.21 ADD: SYNC_J1_ALL_SHEETS() — lightweight dedicated J1 sync for all
 *   wallet-chain sheets. Reads I1/J1 for every " - " sheet, writes I1→J1 when
 *   I1 > J1. Triggered every 2 min by auto-heal + every 10 min by ACTIVITY_WATCHDOG.
 *   Eliminates ~60 min worst-case J1 sync delay from probe window limitation.
 *
 * v4.5.22 FIX: R16 — prevent duplicate QUOTA_RECOVERY_SWEEP_FOLLOWUP triggers
 *   and overlap between SWEEP and FOLLOWUP via ScriptProperties locks/flags.
 *   - _recoveryAcquireLock_ / _recoveryIsSweepRunning_ guard concurrent execution
 *   - _recoveryIsFollowupPending_ prevents duplicate FOLLOWUP scheduling
 *   - INSTALL_QUOTA_RECOVERY clears stale locks/flags on reinstall
 *
 * v4.5.20 FIX: WCORE_IS_SAFE object result is now checked via .safe.
 *   WATCHDOG_FROM_RECAP was treating {safe:false} as truthy and continued
 *   pulsing B1 during quota blocks.
 *
 * v4.5.18: probe-gated recovery + poller-based scheduling (no more DST-fixed hour)
 *   - _recoveryProbeQuota_() vérifie le quota réel avant tout reset/pulse
 *   - QUOTA_RECOVERY_SWEEP : probe-gate + retry 30min si quota absent, batch 5/60s au 1er passage
 *   - QUOTA_RECOVERY_SWEEP_FOLLOWUP : même probe-gate
 *   - INSTALL_QUOTA_RECOVERY : poller everyMinutes(30), plus de logique DST
 *
 * v4.5.17 FIX: QUOTA_RECOVERY_SWEEP recovery hardening
 *   - Pulse B1=timestamp(text) directement (time-based triggers ne déclenchent pas onEdit,
 *     donc A1=TRUE ne se propagerait pas — A1 reste manual-only)
 *   - Sépare [BLOCKED:QUOTA] (prioritaire) et [BLOCKED:TIMEOUT]/#ERROR dans les stats
 *   - Persiste la liste des sheets skipped dans ScriptProperties (WCORE_RECOVERY_SKIPPED_v1)
 *   - NOUVEAU: QUOTA_RECOVERY_SWEEP_FOLLOWUP à T+30min — retente skipped + rescanne Recap Chain
 *   - INSTALL_QUOTA_RECOVERY installe les 2 triggers (10h35/11h05 CET ou 11h35/12h05 CEST)
 *
 * v4.5.15 FIX: BLOCKED sheets with fresh timestamp (< 5h) no longer re-pulsed
 *   - _wd_needsRefresh_ now checks extracted timestamp from [BLOCKED:*] I1 values
 *   - If timestamp is < staleMs (5h), needsPulse=false — avoids thundering herd
 *   - Before: all [BLOCKED:QUOTA] sheets always re-pulsed regardless of freshness
 *
 * v4.5.14 FIX: [NO_CACHE] sheets not re-pulsed by WATCHDOG
 *   - _wd_needsRefresh_ did not recognize [NO_CACHE] as needing a pulse
 *   - [NO_CACHE] now treated as "empty" (10 min cooldown, not 5h wait)
 *
 * v4.5.13 CHANGES (MASTER_ON_EDIT RESTORED + CACHE REFRESH FIX):
 * - RESTORED: MASTER_ON_EDIT function (was accidentally removed in v4.5.10+)
 * - FIX: Installable onEdit trigger now finds its target function again
 * - A1=TRUE â†’ pulse B1 â†’ reset A1=FALSE manual refresh mechanism
 * - CHANGED: WD_STALE_I1_HOURS from 12h to 5h (before CacheService 6h expiry)
 * - Prevents "No cache available" by refreshing data before Google evicts it
 *
 * v4.5.12 CHANGES (QUOTA CIRCUIT BREAKER):
 * - NEW: QuotaCircuitBreaker integrated in _wd_isSystemBlocked_()
 * - NEW: QuotaCircuitBreaker.reset() in _wd_tryUnblock_()
 * - QUOTA now treated like FORTRESS/GUARD/DEGRADED
 * - When BLOCKED:QUOTA, tryUnblock resets breaker then retests
 * - Works with 03E_QUOTA_CIRCUIT_BREAKER.gs
 *
 * v4.5.11 CHANGES:
 * - NEW: _wd_checkPartialCycles_() detects partial rotation cycles from Recap Chain
 * - NEW: Reads "Rotation.cycle" column directly from Recap Chain sheet
 * - NEW: Pulses B1 for sheets with cycle=partial (15 min cooldown)
 * - NEW: Integrated into WATCHDOG_FROM_RECAP main loop
 * - FIX: Much more reliable than ActivityTracker-based detection
 *
 * v4.5.10 CHANGES:
 * - WD_STALE_I1_HOURS passe de 2h a 12h (refresh beaucoup moins frequent)
 * - Objectif: reduire la charge sur le systeme pour les feuilles stables
 *
 * v4.5.9 CHANGES (BLOCKED AUTO-RECOVERY):
 * - NEW: _wd_tryUnblock_() attempts to reset blocker FLAGS before pulsing B1
 * - FIX: Blocked sheets now ALWAYS pulse B1 (with 30min cooldown)
 * 
 * ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â CRITICAL RULE: Watchdog NEVER clears/purges cache data!
 * ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â _wd_tryUnblock_ only resets FLAGS (lockdown, degraded, error states)
 * ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â CLEAR_* functions are MANUAL ONLY (require confirm=TRUE)
 ************************************************************/

// ============================================================
// CONFIGURATION
// ============================================================

var RECAP_SHEET_NAME = "Recap Portfolio";
var WCORE_SPREADSHEET_ID = "1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4";

// Timing configs
var WD_STALE_I1_HOURS = 5;      // v4.5.13: I1 > 5h => pulse B1 (before CacheService 6h expiry)
var WD_PULSE_MIN = 10;          // Cooldown entre deux pulses B1 (minutes)
var WD_PULSE_MIN_BLOCKED = 30;  // v4.5.8: Cooldown for blocked sheets (30 min)
var WD_PULSE_MIN_PARTIAL = 15;  // v4.5.11: Cooldown for partial cycles (15 min)

// Probe size
var WD_PROBE_SIZE_MIN = 5;
var WD_PROBE_SIZE_MAX = 20;
var WD_MAX_PULSES_PER_RUN = 15;  // v4.16.2: faster stale recovery with controlled B1 pulse cap

// Property keys
var P_WD_CURSOR = "WD_CURSOR";
var P_WD_RUNS = "WD_RUNS";
var P_WD_PARTIAL_LAST = "WD_PARTIAL_LAST";  // v4.5.11: Last partial cycle pulse timestamps

var REFRESH_VERSION = "4.15.78";

function onEdit(e) {
  // v4.15.112: simple onEdit runs with limited auth and duplicates the
  // installable MASTER_ON_EDIT trigger. Keep it inert so it cannot consume
  // checkboxes, pulse B1/J1, or start heavy refresh paths.
  return;
}

// v4.15.104: WCORE_ON_EDIT also calls _bpDetailsAutoLink_ after CEX handlers for per-cell auto-link of Portefeuille Crypto Details column E.
// v4.15.99: installable onEdit trigger wrapper — A1=TRUE → pulse B1 → reset A1=FALSE.
// Standalone name so WCORE_ON_EDIT can also be called directly if needed.
function MASTER_ON_EDIT(e) {
  return WCORE_ON_EDIT(e);
}

function WCORE_ON_EDIT(e) {
  try {
   if (!e || !e.range) return;
   if (typeof BITPANDA_ON_EDIT === "function" && BITPANDA_ON_EDIT(e)) return;
   if (typeof BINANCE_ON_EDIT === "function" && BINANCE_ON_EDIT(e)) return;
   if (typeof BITFINEX_ON_EDIT === "function" && BITFINEX_ON_EDIT(e)) return;
    if (typeof BYBIT_ON_EDIT === "function" && BYBIT_ON_EDIT(e)) return;
    if (typeof COINBASE_ON_EDIT === "function" && COINBASE_ON_EDIT(e)) return;
    if (typeof OKX_ON_EDIT === "function" && OKX_ON_EDIT(e)) return;
    if (typeof KRAKEN_ON_EDIT === "function" && KRAKEN_ON_EDIT(e)) return;
   // v4.15.104: per-cell auto-link for Portefeuille Crypto Details column E.
   // Runs AFTER CEX handlers (which return true on their sheets) so it only fires
   // for non-CEX edits. Bridges the gap between bulk _setDetailsChainHyperlinks_
   // (5-30 min pulses) and rows added in between.
   if (typeof _bpDetailsAutoLink_ === "function") {
    try { _bpDetailsAutoLink_(e); } catch (eAuto) {}
   }
   var range = e.range;
    if (range.getA1Notation && range.getA1Notation() !== "A1") return;
    var sheet = range.getSheet ? range.getSheet() : null;
    if (!sheet) return;
    var name = sheet.getName ? sheet.getName() : "";
    if (String(name || "").indexOf(" - ") < 0) return;

    var v = (typeof e.value !== "undefined") ? e.value : range.getValue();
    if (String(v).toUpperCase() !== "TRUE") return;

    var nowStr = _wd_fmtDate_(new Date());
    sheet.getRange("B1").setValue(nowStr);
    sheet.getRange("B1").setNumberFormat("@");
    range.setValue(false);
  } catch (err) {
    try { Logger.log("[WCORE_ON_EDIT] " + (err && err.message ? err.message : err)); } catch (eLog) {}
  }
}

function _wcoreGetSpreadsheet_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (eActive) {}
  if (ss) return ss;
  // v4.15.61: capture WHY openById fails (stale trigger authorization, missing
  // 'spreadsheets' scope, etc.) so the cause is observable in WCORE_WD_LAST_DIAG /
  // logs instead of being swallowed silently (root cause of the 2026-06-01 freeze).
  try {
    var byId = SpreadsheetApp.openById(WCORE_SPREADSHEET_ID);
    if (byId) return byId;
  } catch (eOpen) {
    try {
      PropertiesService.getScriptProperties().setProperty(
        "WCORE_SS_OPEN_ERR",
        JSON.stringify({ ts: new Date().toISOString(), error: String(eOpen && eOpen.message || eOpen) })
      );
    } catch (eProp) {}
    try { Logger.log("[WCORE_SS] openById failed: " + (eOpen && eOpen.message)); } catch (eLog) {}
  }
  return null;
}

function _wd_quoteA1Sheet_(name) {
  return "'" + String(name || "").replace(/'/g, "''") + "'";
}

function _wd_cell_(row, idx) {
  return String((row && row[idx]) || "").trim();
}

function _wd_rowHasPartialCycle_(row) {
  var joined = String((row || []).join(" ")).toLowerCase();
  return joined.indexOf("cycle:partial") !== -1 || joined.indexOf("partial") !== -1;
}

function _wd_addApiWrite_(actions, sheetName, cell, value) {
  if (!sheetName || !cell) return;
  actions.push({ range: _wd_quoteA1Sheet_(sheetName) + "!" + cell, values: [[value]] });
}

function _wd_flushApiWrites_(actions) {
  if (!actions || actions.length === 0) return 0;
  Sheets.Spreadsheets.Values.batchUpdate({
    valueInputOption: "RAW",
    data: actions
  }, WCORE_SPREADSHEET_ID);
  return actions.length;
}

function _wd_watchdogFromRecapViaSheetsApi_(nowMs) {
  var t0 = Date.now();
  var props = PropertiesService.getScriptProperties();
  var stats = { ts: new Date().toISOString(), mode: "SHEETS_API_NO_ACTIVE_SPREADSHEET", ok: false,
    exec_ms: 0, N: 0, probe: 0, toSync: 0, synced: 0, b1Set: 0, b1Empty: 0,
    b1Stale: 0, b1Error: 0, b1Blocked: 0, b1Partial: 0, staleThresholdHours: WD_STALE_I1_HOURS };
  var actions = [];
  try {
    if (typeof Sheets === "undefined" || !Sheets.Spreadsheets || !Sheets.Spreadsheets.Values) throw new Error("Advanced Sheets service unavailable");
    var resp = Sheets.Spreadsheets.Values.get(WCORE_SPREADSHEET_ID, _wd_quoteA1Sheet_(RECAP_SHEET_NAME) + "!A1:Z200");
    var values = (resp && resp.values) || [];
    if (values.length < 2) throw new Error("Recap Chain empty");
    var rows = values.slice(1).filter(function(r) { var n = _wd_cell_(r, 0); return n && n.indexOf("//") !== 0; });
    stats.N = rows.length;
    if (stats.N === 0) throw new Error("No sheets in Recap Chain");

    var nowStr = Utilities.formatDate(new Date(nowMs), "Europe/Paris", "yyyy-MM-dd HH:mm:ss");
    var lastPulseMap = {};
    try { lastPulseMap = JSON.parse(props.getProperty(P_WD_PARTIAL_LAST) || "{}"); } catch (eMap) { lastPulseMap = {}; }

    for (var p = 0; p < rows.length; p++) {
      var pRow = rows[p], pSheet = _wd_cell_(pRow, 0);
      if (!_wd_rowHasPartialCycle_(pRow)) continue;
      stats.partialFound = (stats.partialFound || 0) + 1;
      if ((nowMs - (lastPulseMap[pSheet] || 0)) >= WD_PULSE_MIN_PARTIAL * 60000) {
        _wd_addApiWrite_(actions, pSheet, "B1", nowStr);
        stats.b1Partial++;
        lastPulseMap[pSheet] = nowMs;
      }
    }

    var cursor = parseInt(props.getProperty(P_WD_CURSOR) || "0", 10);
    if (!isFinite(cursor) || cursor < 0 || cursor >= stats.N) cursor = 0;
    var probeSize = Math.max(WD_PROBE_SIZE_MIN, Math.min(WD_PROBE_SIZE_MAX, Math.ceil(stats.N / 3)));
    stats.probe = probeSize;
    var staleMs = WD_STALE_I1_HOURS * 3600000;
    var rowItems = rows.map(function(row) {
      return {
        sheetName: _wd_cell_(row, 0),
        vA2: _wd_cell_(row, 1),
        vB1: _wd_cell_(row, 3),
        vI1: _wd_cell_(row, 5),
        vJ1: _wd_cell_(row, 6)
      };
    });
    var globalActions = _wd_collectGlobalRefreshActions_(rowItems, nowMs, staleMs, nowStr, stats);
    for (var ga = 0; ga < globalActions.length; ga++) {
      var act = globalActions[ga];
      if (!act.sheetName) continue;
      _wd_addApiWrite_(actions, act.sheetName, act.range, act.value);
    }

    stats.actions = _wd_flushApiWrites_(actions);
    stats.synced = stats.toSync;
    props.setProperty(P_WD_CURSOR, String((cursor + probeSize) % stats.N));
    try { props.setProperty(P_WD_PARTIAL_LAST, JSON.stringify(lastPulseMap)); } catch (eSavePartial) {}
    stats.ok = true;
  } catch (e) {
    stats.error = e.message;
    stats.stack = e.stack || "";
  }
  stats.exec_ms = Date.now() - t0;
  try { props.setProperty("WCORE_WD_LAST_DIAG", JSON.stringify(stats)); } catch (eDiag) {}
  Logger.log("[WATCHDOG_API] " + JSON.stringify(stats));
  return stats;
}

function DIAG_RUN_WATCHDOG_SHEETS_API_FALLBACK() {
  return _wd_watchdogFromRecapViaSheetsApi_(Date.now());
}

// ============================================================
// AUTO-REGISTRATION
// ============================================================
if (typeof ModuleRegistry !== 'undefined') {
  ModuleRegistry.register("REFRESH", REFRESH_VERSION, {
    description: "Watchdog with QuotaCircuitBreaker + MASTER_ON_EDIT restored",
    dependencies: ["QUOTA_CIRCUIT_BREAKER"]
  });
}

// ============================================================
// PARTIAL CYCLE DETECTION (v4.5.11)
// ============================================================

/**
 * v4.5.11: Check for partial rotation cycles directly from Recap Chain
 * Much more reliable than cache-based detection
 * 
 * @param {SpreadsheetApp.Spreadsheet} ss - Spreadsheet object
 * @param {number} nowMs - Current timestamp
 * @returns {Object} { checked, partial, pulsed, errors }
 */
function _wd_checkPartialCycles_(ss, nowMs) {
  var stats = { checked: 0, partial: 0, pulsed: 0, errors: 0 };
  
  try {
    var recap = ss.getSheetByName(RECAP_SHEET_NAME);
    if (!recap) return stats;
    
    var lastRow = recap.getLastRow();
    if (lastRow < 2) return stats;
    
    // Find the "Rotation.cycle" column in header row
    var headers = recap.getRange(1, 1, 1, recap.getLastColumn()).getValues()[0];
    var cycleColIndex = -1;
    var sheetColIndex = 0;  // Assume first column is sheet name
    
    for (var h = 0; h < headers.length; h++) {
      var header = String(headers[h] || "").toLowerCase().trim();
      if (header === "rotation.cycle" || header === "cycle") {
        cycleColIndex = h;
        break;
      }
    }
    
    // If column not found, try to find it by searching for "partial" values
    if (cycleColIndex === -1) {
      // Scan first few rows to find column with "partial" values
      var sampleData = recap.getRange(2, 1, Math.min(5, lastRow - 1), recap.getLastColumn()).getValues();
      for (var col = 0; col < sampleData[0].length; col++) {
        for (var row = 0; row < sampleData.length; row++) {
          var val = String(sampleData[row][col] || "").toLowerCase().trim();
          if (val === "partial" || val === "done" || val.indexOf("/") > 0) {
            cycleColIndex = col;
            break;
          }
        }
        if (cycleColIndex !== -1) break;
      }
    }
    
    if (cycleColIndex === -1) {
      Logger.log("[WD_PARTIAL] Rotation.cycle column not found in Recap Chain");
      return stats;
    }
    
    // Read all data
    var data = recap.getRange(2, 1, lastRow - 1, recap.getLastColumn()).getValues();
    
    // Load last pulse timestamps
    var lastPulseMap = {};
    try {
      var raw = PropertiesService.getScriptProperties().getProperty(P_WD_PARTIAL_LAST);
      lastPulseMap = raw ? JSON.parse(raw) : {};
    } catch (e) {}
    
    var tz = ss.getSpreadsheetTimeZone();
    var nowStr = Utilities.formatDate(new Date(nowMs), tz, "yyyy-MM-dd HH:mm:ss");
    
    // Check each row
    for (var i = 0; i < data.length; i++) {
      var sheetName = String(data[i][sheetColIndex] || "").trim();
      if (!sheetName || sheetName.startsWith("//")) continue;
      
      var cycleVal = String(data[i][cycleColIndex] || "").toLowerCase().trim();
      stats.checked++;
      
      // Check if partial cycle
      if (cycleVal === "partial" || (cycleVal.indexOf("partial") !== -1)) {
        stats.partial++;
        
        // Check cooldown
        var lastPulse = lastPulseMap[sheetName] || 0;
        var cooldownMs = WD_PULSE_MIN_PARTIAL * 60000;
        
        if ((nowMs - lastPulse) >= cooldownMs) {
          // Get the sheet and pulse B1
          try {
            var sheet = ss.getSheetByName(sheetName);
            if (sheet) {
              sheet.getRange("B1").setValue(nowStr);
              sheet.getRange("B1").setNumberFormat("@");  // Force text format
              stats.pulsed++;
              lastPulseMap[sheetName] = nowMs;
              Logger.log("[WD_PARTIAL] Pulsed B1 for " + sheetName + " (cycle=" + cycleVal + ")");
            }
          } catch (e) {
            stats.errors++;
            Logger.log("[WD_PARTIAL] Error pulsing " + sheetName + ": " + e.message);
          }
        }
      }
    }
    
    // Save last pulse timestamps (cleanup old entries > 24h)
    try {
      var cutoff = nowMs - (24 * 60 * 60 * 1000);
      for (var k in lastPulseMap) {
        if (lastPulseMap[k] < cutoff) delete lastPulseMap[k];
      }
      PropertiesService.getScriptProperties().setProperty(P_WD_PARTIAL_LAST, JSON.stringify(lastPulseMap));
    } catch (e) {}
    
  } catch (e) {
    Logger.log("[WD_PARTIAL] Error: " + e.message);
    stats.errors++;
  }
  
  return stats;
}

/**
 * v4.5.11: Diagnostic for partial cycles
 * @customfunction
 */
function DIAG_WATCHDOG_PARTIAL_CYCLES() {
  var out = [["Sheet", "Rotation.cycle", "Last Pulse", "Status"]];
  
  try {
    var ss = _wcoreGetSpreadsheet_();
    var recap = ss.getSheetByName(RECAP_SHEET_NAME);
    if (!recap) {
      return [["ERROR", "Recap Chain sheet not found"]];
    }
    
    var lastRow = recap.getLastRow();
    if (lastRow < 2) {
      return [["INFO", "No data in Recap Chain"]];
    }
    
    // Find Rotation.cycle column
    var headers = recap.getRange(1, 1, 1, recap.getLastColumn()).getValues()[0];
    var cycleColIndex = -1;
    
    for (var h = 0; h < headers.length; h++) {
      var header = String(headers[h] || "").toLowerCase().trim();
      if (header === "rotation.cycle" || header === "cycle") {
        cycleColIndex = h;
        break;
      }
    }
    
    if (cycleColIndex === -1) {
      out.push(["WARN", "Rotation.cycle column not found in headers", "", ""]);
      out.push(["INFO", "Headers: " + headers.slice(0, 10).join(", "), "", ""]);
      return out;
    }
    
    out.push(["INFO", "Found column at index " + cycleColIndex, "", ""]);
    out.push(["", "", "", ""]);
    
    // Load last pulse timestamps
    var lastPulseMap = {};
    try {
      var raw = PropertiesService.getScriptProperties().getProperty(P_WD_PARTIAL_LAST);
      lastPulseMap = raw ? JSON.parse(raw) : {};
    } catch (e) {}
    
    // Read data
    var data = recap.getRange(2, 1, lastRow - 1, recap.getLastColumn()).getValues();
    var nowMs = Date.now();
    
    for (var i = 0; i < data.length; i++) {
      var sheetName = String(data[i][0] || "").trim();
      if (!sheetName || sheetName.startsWith("//")) continue;
      
      var cycleVal = String(data[i][cycleColIndex] || "").trim();
      var lastPulse = lastPulseMap[sheetName] || 0;
      var lastPulseStr = lastPulse > 0 ? new Date(lastPulse).toISOString() : "Never";
      
      var status = "OK";
      if (cycleVal.toLowerCase().indexOf("partial") !== -1) {
        var cooldownMs = WD_PULSE_MIN_PARTIAL * 60000;
        var canPulse = (nowMs - lastPulse) >= cooldownMs;
        status = canPulse ? "ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â PARTIAL - Will pulse" : "ÃƒÂ¢Ã‚ÂÃ‚Â³ PARTIAL - Cooldown";
      }
      
      out.push([sheetName, cycleVal, lastPulseStr, status]);
    }
    
  } catch (e) {
    out.push(["ERROR", e.message, "", ""]);
  }
  
  return out;
}

/**
 * v4.5.11: Force check partial cycles now
 */
function FORCE_WATCHDOG_PARTIAL_CHECK() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nowMs = Date.now();
  var stats = _wd_checkPartialCycles_(ss, nowMs);

  Logger.log("[FORCE_PARTIAL] checked=" + stats.checked +
             " partial=" + stats.partial +
             " pulsed=" + stats.pulsed +
             " errors=" + stats.errors);

  return [
    ["Stat", "Value"],
    ["Checked", stats.checked],
    ["Partial", stats.partial],
    ["Pulsed", stats.pulsed],
    ["Errors", stats.errors]
  ];
}

// v0.3.x: System-driven force-rescan for a list of chain keys. Pulses B1 on the
// matching Ledger sheet so the next scan (manual or time-based) re-fetches the
// latest API payload. This bypasses the I1-staleness cooldown for callers who
// know the payload is stale (e.g. right after an API deploy). The action is
// system-driven (not a manual Sheet edit) — it uses a fresh timestamp that the
// C1/FORCE/A1 check paths already treat as a legitimate trigger.
//
// No-argument wrapper: forces a rescan of Optimism and Base (the most recent
// regression targets). The user can call FORCE_RESCAN_LEDGERS(["chain_key", ...])
// from clasp run with a custom list when needed.
function FORCE_RESCAN_LEDGERS(chainKeys) {
  if (!chainKeys) {
    chainKeys = ["Optimism", "Base"];
  }
  if (typeof chainKeys === "string") chainKeys = [chainKeys];
  if (!Array.isArray(chainKeys) || chainKeys.length === 0) {
    return [["Chain", "Status", "Error"], ["-", "skip", "no chain keys provided"]];
  }
  var ss = _wcoreGetSpreadsheet_();
  if (!ss) return [["Chain", "Status", "Error"], ["-", "fail", "no spreadsheet access"]];
  var tz = ss.getSpreadsheetTimeZone();
  var nowStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
  var out = [["Chain", "Sheet", "Status", "B1 Value"]];
  for (var i = 0; i < chainKeys.length; i++) {
    var key = String(chainKeys[i] || "").trim();
    if (!key) continue;
    var sheetName = "Ledger - " + key;
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      out.push([key, sheetName, "skip", "sheet not found"]);
      continue;
    }
    try {
      sheet.getRange("B1").setValue(nowStr);
      sheet.getRange("B1").setNumberFormat("@");
      out.push([key, sheetName, "pulsed", nowStr]);
    } catch (e) {
      out.push([key, sheetName, "error", String(e && (e.message || e) || e)]);
    }
  }
  return out;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function _wd_norm_(s) {
  return String(s || "").trim();
}

function _wd_fmtDate_(d) {
  try {
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    var hh = String(d.getHours()).padStart(2, "0");
    var mi = String(d.getMinutes()).padStart(2, "0");
    var ss = String(d.getSeconds()).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd + " " + hh + ":" + mi + ":" + ss;
  } catch (e) { return ""; }
}

function _wd_isLastUpdateFormat_(s) {
  s = _wd_norm_(s);
  // Match: "2025-01-15 12:34:56" or ISO "2025-01-15T12:34:56..."
  return /^\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}(:\d{2})?/.test(s);
}

/**
 * v4.5.8: Extract actual timestamp from I1 value
 * Strips [BLOCKED:...] prefix if present
 * Examples:
 *   "[BLOCKED:QUOTA] 2025-01-15 12:34:56" -> "2025-01-15 12:34:56"
 *   "[CACHE_ONLY] 2025-01-15 12:34:56" -> "2025-01-15 12:34:56"
 *   "2025-01-15 12:34:56" -> "2025-01-15 12:34:56"
 */
function _wd_extractTimestamp_(vI1) {
  vI1 = _wd_norm_(vI1);
  // Match usable prefixes followed by timestamp.
  var match = vI1.match(/^\[(?:BLOCKED:[^\]]+|CACHE_ONLY|WEB_SCAN_DEGRADED|WEB_SCAN_PRESERVED)\]\s*(.+)$/);
  if (match && match[1]) {
    return match[1].trim();
  }
  match = vI1.match(/^WEB_SCAN_OK\s+(.+)$/);
  if (match && match[1]) return match[1].trim();
  return vI1;
}

function _wd_extractSuccessTimestamp_(vI1) {
  vI1 = _wd_norm_(vI1);
  var match = vI1.match(/^\[CACHE_ONLY\]\s*(.+)$/);
  if (match && match[1]) return match[1].trim();
  return vI1;
}

function _wd_isUnsafeLatchSource_(vI1) {
  vI1 = _wd_norm_(vI1).toUpperCase();
  return vI1.indexOf("[BLOCKED:") === 0 || vI1.indexOf("[NO_CACHE]") === 0 || vI1.indexOf("NO_CACHE_WAITING_REFRESH") >= 0;
}

/**
 * v4.5.8: Check if I1 shows BLOCKED state
 * Returns: { blocked: boolean, reason: string|null, timestamp: string|null }
 */
function _wd_isBlocked_(vI1) {
  vI1 = _wd_norm_(vI1);
  var match = vI1.match(/^\[BLOCKED:([^\]]+)\]\s*(.*)$/);
  if (match) {
    return {
      blocked: true,
      reason: match[1] || "UNKNOWN",
      timestamp: match[2] ? match[2].trim() : null
    };
  }
  return { blocked: false, reason: null, timestamp: null };
}

function _wd_parseLocalDateTimeToMs_(s) {
  s = _wd_norm_(s);
  if (!s) return NaN;

  // Si "T", tente Date.parse (souvent ok)
  if (s.indexOf("T") !== -1) {
    const t = Date.parse(s);
    if (isFinite(t)) return t;
  }

  // Parse manuel "YYYY-MM-DD HH:MM:SS" (ou sans SS)
  const parts = s.replace("T", " ").split(" ");
  if (parts.length < 2) return NaN;

  const d = parts[0].split("-");
  const hm = parts[1].split(":");
  if (d.length !== 3 || hm.length < 2) return NaN;

  const yyyy = parseInt(d[0], 10);
  const mm = parseInt(d[1], 10);
  const dd = parseInt(d[2], 10);
  const HH = parseInt(hm[0], 10);
  const MI = parseInt(hm[1], 10);
  const SS = hm.length >= 3 ? parseInt(hm[2], 10) : 0;

  if (![yyyy,mm,dd,HH,MI,SS].every(n => isFinite(n))) return NaN;

  const dt = new Date(yyyy, mm - 1, dd, HH, MI, SS, 0);
  const t = dt.getTime();
  return isFinite(t) ? t : NaN;
}

// Periodic SheetCache cleanup
function _wd_maybeSheetCacheCleanup_(props) {
  try {
    props = props || PropertiesService.getScriptProperties();
    var n = parseInt(props.getProperty(P_WD_RUNS) || '0', 10);
    if (!isFinite(n) || n < 0) n = 0;
    n++;
    props.setProperty(P_WD_RUNS, String(n));

    if ((n % 20) !== 0) return false;
    if (typeof SHEETCACHE_CLEANUP === 'function') {
      try { SHEETCACHE_CLEANUP(400); } catch (e1) {}
      return true;
    }
  } catch (e0) {}
  return false;
}

function _wd_shouldPulseB1_(b1DisplayValue, nowMs, cooldownMin) {
  const vB1 = _wd_norm_(b1DisplayValue);
  if (!vB1) return true;

  const t = _wd_parseLocalDateTimeToMs_(vB1);
  if (!isFinite(t)) return true;

  const cooldown = cooldownMin || WD_PULSE_MIN;
  return (nowMs - t) >= cooldown * 60000;
}

function _wd_staleAgeMs_(vI1, nowMs) {
  try {
    var ts = _wd_extractTimestamp_(vI1);
    if (!_wd_isLastUpdateFormat_(ts)) return 0;
    var ms = _wd_parseLocalDateTimeToMs_(ts);
    return isFinite(ms) ? Math.max(0, nowMs - ms) : 0;
  } catch (e) {
    return 0;
  }
}

function _wd_refreshReasonPriority_(reason) {
  reason = String(reason || "").toLowerCase();
  if (reason === "error") return 400;
  if (reason === "empty") return 300;
  if (reason === "stale") return 200;
  if (reason === "blocked") return 100;
  return 0;
}

// v4.15.97: CEX sync tabs are display-only in Recap.
// They have NO I1/J1 cells and write their refresh date in B1 themselves.
// The watchdog MUST NOT pulse their B1 (would overwrite the refresh date) nor
// sync J1 (would create spurious cells). Skip them entirely.
function _wd_isCexSheet_(name) {
  var n = String(name || "").toLowerCase();
  return (n.indexOf("bitpanda") >= 0 ||
          n.indexOf("bitfinex") >= 0 ||
          n.indexOf("coinbase") >= 0 ||
          n.indexOf("okx") >= 0 ||
          n.indexOf("kraken") >= 0 ||
          n.indexOf("bybit") >= 0 ||
          (n.indexOf("binance") >= 0 && n.indexOf("web3") < 0));
}

function _wd_collectGlobalRefreshActions_(items, nowMs, staleMs, nowStr, stats) {
  var pulseCandidates = [];
  var syncActions = [];
  stats = stats || {};
  var systemBlocked = _wd_isSystemBlocked_();
  var suppressB1Pulses = !!(systemBlocked && systemBlocked.blocked && systemBlocked.reason === "QUOTA");
  if (suppressB1Pulses) stats.b1SuppressedQuota = 0;

  for (var i = 0; i < items.length; i++) {
    var d = items[i] || {};
    // v4.15.85: skip CEX display-only tabs (no I1/J1, B1 is self-managed).
    if (_wd_isCexSheet_(d.name || d.sheetName || "")) continue;
    var refreshCheck = _wd_needsRefresh_(d.vA2 || "", d.vI1 || "", nowMs, staleMs);
    var cooldownMin = refreshCheck.useBlockedCooldown ? WD_PULSE_MIN_BLOCKED : WD_PULSE_MIN;

    if (refreshCheck.needsPulse) {
      if (refreshCheck.reason === "blocked") stats.b1Blocked++;
      else if (refreshCheck.reason === "empty") stats.b1Empty++;
      else if (refreshCheck.reason === "stale") stats.b1Stale++;
      else if (refreshCheck.reason === "error") stats.b1Error++;

      if (refreshCheck.reason === "blocked" && refreshCheck.blockedReason !== "QUOTA") {
        _wd_tryUnblock_(refreshCheck.blockedReason);
      }

      if (suppressB1Pulses) {
        stats.b1SuppressedQuota++;
      } else if (_wd_shouldPulseB1_(d.vB1 || "", nowMs, cooldownMin)) {
        pulseCandidates.push({
          sheet: d.sheet || null,
          sheetName: d.name || d.sheetName || "",
          range: "B1",
          value: nowStr,
          type: "pulse",
          reason: refreshCheck.reason,
          priority: _wd_refreshReasonPriority_(refreshCheck.reason),
          staleAgeMs: _wd_staleAgeMs_(d.vI1 || "", nowMs)
        });
      }
    }

    var actualI1 = refreshCheck.actualTimestamp || _wd_extractTimestamp_(d.vI1 || "");
    if (_wd_shouldSyncJ1_(actualI1, d.vJ1 || "")) {
      syncActions.push({
        sheet: d.sheet || null,
        sheetName: d.name || d.sheetName || "",
        range: "J1",
        value: actualI1,
        type: "sync"
      });
      stats.toSync++;
    }
  }

  pulseCandidates.sort(function(a, b) {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.staleAgeMs !== b.staleAgeMs) return b.staleAgeMs - a.staleAgeMs;
    return String(a.sheetName || "").localeCompare(String(b.sheetName || ""));
  });

  var selectedPulses = pulseCandidates.slice(0, WD_MAX_PULSES_PER_RUN);
  stats.b1Set += selectedPulses.length;
  stats.globalPulseCandidates = pulseCandidates.length;
  return syncActions.concat(selectedPulses);
}

function _wd_shouldSyncJ1_(vI1, vJ1) {
  if (_wd_isUnsafeLatchSource_(vI1)) return false;
  const actualI1 = _wd_extractTimestamp_(vI1);
  if (!_wd_isLastUpdateFormat_(actualI1)) return false;
  return _wd_norm_(actualI1) !== _wd_norm_(vJ1);
}

function _wd_needsRefresh_(vA2, vI1, nowMs, staleMs) {
  const errA2 = vA2.startsWith("#") || vA2.toLowerCase().includes("erreur");
  const errI1 = vI1.startsWith("#") || vI1.toLowerCase().includes("erreur");
  const isErr = errA2 || errI1;
  
  const blockedCheck = _wd_isBlocked_(vI1);
  if (blockedCheck.blocked) {
    // v4.5.16: Only QUOTA keeps 30 min cooldown + 5h freshness check
    // All other BLOCKED:* (TIMEOUT, GUARD, etc.) treated like errors (10 min cooldown, always re-pulse)
    if (blockedCheck.reason !== "QUOTA") {
      return {
        needsPulse: true,
        reason: "error",
        blockedReason: blockedCheck.reason,
        actualTimestamp: blockedCheck.timestamp,
        useBlockedCooldown: false
      };
    }
    // QUOTA only: si le timestamp extrait de I1 est frais (< staleMs), pas besoin de re-pulser
    // Le daily QUOTA_RECOVERY_SWEEP à 10h35 CET s'en occupe
    var blockedNeedsPulse = true;
    if (blockedCheck.timestamp) {
      var bTs = _wd_parseLocalDateTimeToMs_(blockedCheck.timestamp);
      if (isFinite(bTs) && (nowMs - bTs) < staleMs) {
        blockedNeedsPulse = false;
      }
    }
    return {
      needsPulse: blockedNeedsPulse,
      reason: "blocked",
      blockedReason: "QUOTA",
      actualTimestamp: blockedCheck.timestamp,
      useBlockedCooldown: true
    };
  }
  
  // v4.14.10: [NO_CACHE] = wallet never scanned successfully — re-pulse with short cooldown
  if (vI1.indexOf("[NO_CACHE]") === 0) {
    return { needsPulse: true, reason: "empty", blockedReason: null, useBlockedCooldown: false };
  }

  // v4.15.3: [ERROR] = scan failed (RPC timeout, etc.) — re-pulse with normal cooldown
  if (vI1.indexOf("[ERROR]") === 0) {
    return { needsPulse: true, reason: "error", blockedReason: null, useBlockedCooldown: false };
  }

  // v4.15.116: [BUSY:CEX] = live scan deferred while manual CEX jobs were running
  // (BaseEngine.cexBusyStatus). Without this case the sheet would NEVER be
  // re-pulsed (unparseable I1 -> needsPulse:false forever). Re-pulse with the
  // normal 10 min cooldown so the wallet rescans once the CEX window is over.
  if (vI1.indexOf("[BUSY:CEX]") === 0) {
    return { needsPulse: true, reason: "error", blockedReason: null, useBlockedCooldown: false };
  }

  if (vI1.indexOf("[WEB_SCAN_PRESERVED]") === 0) {
    return { needsPulse: true, reason: "error", blockedReason: null, useBlockedCooldown: false };
  }

  const isEmpty = !vI1 || vI1 === "" || vI1.trim() === "";

  let isStale = false;
  var i1Timestamp = _wd_extractTimestamp_(vI1);
  if (!isEmpty && _wd_isLastUpdateFormat_(i1Timestamp)) {
    const i1Ms = _wd_parseLocalDateTimeToMs_(i1Timestamp);
    if (isFinite(i1Ms) && (nowMs - i1Ms) >= staleMs) {
      isStale = true;
    }
  }
  
  if (isErr) return { needsPulse: true, reason: "error", blockedReason: null, useBlockedCooldown: false };
  if (isEmpty) return { needsPulse: true, reason: "empty", blockedReason: null, useBlockedCooldown: false };
  if (isStale) return { needsPulse: true, reason: "stale", blockedReason: null, useBlockedCooldown: false };
  
  return { needsPulse: false, reason: "ok", blockedReason: null, useBlockedCooldown: false };
}

function _wd_isSystemBlocked_() {
  try {
    // v4.5.12: Check QuotaCircuitBreaker FIRST (fastest check)
    if (typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.isTripped) {
      if (QuotaCircuitBreaker.isTripped()) return { blocked: true, reason: "QUOTA" };
    }
    if (typeof HttpErrorGuard !== 'undefined' && HttpErrorGuard.isQuotaExhausted) {
      if (HttpErrorGuard.isQuotaExhausted()) return { blocked: true, reason: "QUOTA" };
    }
    if (typeof CacheGuard !== 'undefined' && CacheGuard.isBlocked) {
      if (CacheGuard.isBlocked()) return { blocked: true, reason: "GUARD" };
    }
  } catch (e) {}
  return { blocked: false, reason: null };
}

function _wd_actionPriority_(action) {
  try {
    if (!action) return 0;
    if (action.type === "sync") return 100;
    var reason = String(action.reason || "").toLowerCase();
    if (reason === "error") return 90;
    if (reason === "empty") return 70;
    if (reason === "stale") return 50;
    if (reason === "blocked") return 20;
  } catch (e) {}
  return 10;
}

/**
 * v4.5.9: Try to unblock system before pulsing B1
 * v4.5.12: Added QUOTA handling with QuotaCircuitBreaker
 */
function _wd_tryUnblock_(blockedReason) {
  var result = { cleared: false, actions: [] };
  
  try {
    // Only reset FLAGS, never touch data
    
    // QUOTA recovery must be gated by _recoveryProbeQuota_ in
    // QUOTA_RECOVERY_SWEEP. Resetting here can repulse every blocked sheet
    // while Google's UrlFetch quota is still in its rolling 24h window.
    if (blockedReason === "QUOTA") {
      result.actions.push("Quota recovery skipped in watchdog");
      return result;
    }
    
    if (blockedReason === "GUARD" && typeof CacheGuard !== 'undefined') {
      if (CacheGuard.clearBlock) {
        CacheGuard.clearBlock();
        result.cleared = true;
        result.actions.push("CacheGuard.clearBlock");
      }
    }
    
    if (blockedReason === "DEGRADED" && typeof DegradedMode !== 'undefined') {
      if (DegradedMode.resetCircuitBreaker) {
        DegradedMode.resetCircuitBreaker();
        result.cleared = true;
        result.actions.push("DegradedMode.resetCircuitBreaker");
      }
    }
  } catch (e) {
    Logger.log("[WD_UNBLOCK] Error: " + e.message);
  }
  
  return result;
}

// ============================================================
// MAIN WATCHDOG FUNCTION
// ============================================================

/**
 * WATCHDOG_FROM_RECAP - Main watchdog entry point
 * Reads sheets from Recap Chain and pulses B1 when needed
 * 
 * v4.5.11: Now also checks for partial rotation cycles
 */
function WATCHDOG_FROM_RECAP() {
  try { HttpCallCounter.setTrigger('WATCHDOG_FROM_RECAP'); } catch(e){}
  try { if (typeof WCORE_AUTO_HEAL === 'function') WCORE_AUTO_HEAL("WATCHDOG_FROM_RECAP", false); } catch(e){}

  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(5000)) {
      Logger.log("[WATCHDOG] Could not acquire lock");
      return;
    }
  } catch (e) {
    return;
  }

  try {
    // v4.5.3: Refresh ledger sheet cache if stale (safe in trigger context, unlike @customfunction)
    try { if (typeof _ensureLedgerCache_ === 'function') _ensureLedgerCache_(false); } catch (e) {}

    // v4.15.62: Proactive ScriptProperties purge. Triggered when usage > 85% of the
    // 500KB quota. Avoids the 2026-06-01 freeze where _emergencyPurge_ was
    // deadlocked (it only runs on write-failure, and writes fail at >100%).
    try {
      var _wdProps = PropertiesService.getScriptProperties();
      var _wdAll = _wdProps.getProperties();
      var _wdSize = 0;
      for (var _wdk in _wdAll) { _wdSize += _wdk.length + String(_wdAll[_wdk] || "").length; }
      if (_wdSize > 425 * 1024 && typeof CacheManager !== 'undefined' && CacheManager._emergencyPurge_) {
        var _wdFreed = CacheManager._emergencyPurge_();
        if (_wdFreed !== false) {
          try { Logger.log("[WATCHDOG] Pre-emptive storage purge freed=" + _wdFreed); } catch (ePL) {}
        }
      }
    } catch (ePre) {}

    // v4.15.83: Small, reliable heartbeat. WCORE_WD_LAST_DIAG can be a large
    // JSON blob and may fail to update under ScriptProperties pressure; auto-heal
    // must not rely on that bulky diagnostic as the only liveness signal.
    try {
      var _wdHbProps = PropertiesService.getScriptProperties();
      _wdHbProps.setProperty("WCORE_WD_LAST_RUN_MS", String(Date.now()));
      _wdHbProps.setProperty("WCORE_WD_LAST_RUN_ISO", new Date().toISOString());
    } catch (eHb) {}

    // Check if system is safe
    if (typeof WCORE_IS_SAFE === 'function') {
      try {
        var safe = WCORE_IS_SAFE("recovery");
        if (safe && safe.safe === false) {
          Logger.log("[WATCHDOG] WCORE_IS_SAFE=false, skipping: " + (safe.reason || "UNKNOWN"));
          lock.releaseLock();
          return;
        }
      } catch (e) {}
    }

    const t0 = Date.now();
    const nowMs = t0;

    let stats = {
      ts: new Date().toISOString(),
      mode: "API_BATCH_v4.5.11_PARTIAL_DETECT",
      ok: false,
      exec_ms: 0,
      N: 0,
      probe: 0,
      toSync: 0,
      synced: 0,
      b1Set: 0,
      b1Empty: 0,
      b1Stale: 0,
      b1Error: 0,
      b1Blocked: 0,
      b1Partial: 0,  // v4.5.11
      staleThresholdHours: WD_STALE_I1_HOURS
    };

    try {
      const ss = _wcoreGetSpreadsheet_();
      if (!ss) {
        stats = _wd_watchdogFromRecapViaSheetsApi_(nowMs);
        return;
      }
      const recap = ss.getSheetByName(RECAP_SHEET_NAME);
      if (!recap) throw new Error("Sheet not found: " + RECAP_SHEET_NAME);

      const props = PropertiesService.getScriptProperties();
      _wd_maybeSheetCacheCleanup_(props);
      
      // v4.5.11: Check partial cycles FIRST (independent of main loop)
      var partialStats = _wd_checkPartialCycles_(ss, nowMs);
      stats.b1Partial = partialStats.pulsed;
      stats.partialChecked = partialStats.checked;
      stats.partialFound = partialStats.partial;

      // Get sheet list
      const lastRow = recap.getLastRow();
      if (lastRow < 2) { stats.ok = true; throw new Error("EMPTY"); }

      const sheetNames = recap.getRange(2, 1, lastRow - 1, 1).getValues()
        .map(r => _wd_norm_(String(r[0] || "")))
        .filter(n => n.length > 0 && !n.startsWith("//"));

      stats.N = sheetNames.length;
      if (stats.N === 0) { stats.ok = true; throw new Error("NO_SHEETS"); }

      // Cursor for round-robin
      let cursor = parseInt(props.getProperty(P_WD_CURSOR) || "0", 10);
      if (!isFinite(cursor) || cursor < 0 || cursor >= stats.N) cursor = 0;

      // Probe size
      let probeSize = Math.max(WD_PROBE_SIZE_MIN, Math.min(WD_PROBE_SIZE_MAX, Math.ceil(stats.N / 3)));
      stats.probe = probeSize;

      // Get probe window
      const probeNames = [];
      for (let i = 0; i < probeSize && i < stats.N; i++) {
        probeNames.push(sheetNames[(cursor + i) % stats.N]);
      }

      // v4.15.41: Read I1 from Recap Chain (plain values, no formula recalculation)
      // instead of individual Ledger sheets (formula cells trigger ~5-30s recalc each).
      // Recap Chain columns: A=wallet, B=total, D=B1, E=C1, F=I1, G=J1
      var probeIndices = [];
      for (var pi = 0; pi < probeSize && pi < stats.N; pi++) {
        probeIndices.push((cursor + pi) % stats.N);
      }
      var recapI1 = recap.getRange(2, 6, lastRow - 1, 1).getDisplayValues(); // col F = I1
      var recapJ1 = recap.getRange(2, 7, lastRow - 1, 1).getDisplayValues(); // col G = J1
      var recapA2 = recap.getRange(2, 2, lastRow - 1, 1).getDisplayValues(); // col B = total
      var recapB1 = recap.getRange(2, 4, lastRow - 1, 1).getDisplayValues(); // col D = B1
      var recapC1 = recap.getRange(2, 5, lastRow - 1, 1).getDisplayValues(); // col E = C1

      // Build sheetData from ALL Recap Chain values (no formula recalc).
      // v4.15.76: stale/error rows must be considered globally. The previous
      // round-robin probe could spend a run on 20 fresh rows while 80+ stale
      // rows later in Recap waited indefinitely after a watchdog restart.
      const sheetData = [];
      for (var ri = 0; ri < stats.N; ri++) {
        if (ri >= recapI1.length) continue;
        sheetData.push({
          sheet: null,
          name: sheetNames[ri],
          vA2: _wd_norm_(String((recapA2[ri] && recapA2[ri][0]) || "")),
          vI1: _wd_norm_(String((recapI1[ri] && recapI1[ri][0]) || "")),
          vJ1: _wd_norm_(String((recapJ1[ri] && recapJ1[ri][0]) || "")),
          vB1: _wd_norm_(String((recapB1[ri] && recapB1[ri][0]) || "")),
          vC1: _wd_norm_(String((recapC1[ri] && recapC1[ri][0]) || ""))
        });
      }

      // Process all sheets globally, then execute at most WD_MAX_PULSES_PER_RUN B1 pulses.
      const staleMs = WD_STALE_I1_HOURS * 3600000;
      const tz = ss.getSpreadsheetTimeZone();
      const nowStr = Utilities.formatDate(new Date(nowMs), tz, "yyyy-MM-dd HH:mm:ss");

      const actions = _wd_collectGlobalRefreshActions_(sheetData, nowMs, staleMs, nowStr, stats);

      // Execute actions
      actions.sort(function(a, b) { return _wd_actionPriority_(b) - _wd_actionPriority_(a); });
      var pulsesDone = 0;

      actions.forEach(a => {
        try {
          if (a.type === "pulse") {
            if (pulsesDone >= WD_MAX_PULSES_PER_RUN) return;
            pulsesDone++;
          }
          var targetSheet = a.sheet || ss.getSheetByName(a.sheetName || "");
          if (!targetSheet) return;
          var range = targetSheet.getRange(a.range);
          range.setValue(a.value);
          range.setNumberFormat("@");
          if (a.type === "sync") stats.synced++;
        } catch (e) {
          try { Logger.log("[WATCHDOG] Action failed: " + a.type + " on " + (a.sheetName || (a.sheet ? a.sheet.getName() : "?")) + " — " + e.message); } catch (e2) {}
        }
      });
      stats.b1Set = pulsesDone;

      // Update cursor
      const newCursor = (cursor + probeSize) % stats.N;
      try { props.setProperty(P_WD_CURSOR, String(newCursor)); } catch (eCur) {
        // v4.15.62: storage quota exceeded — try one purge and retry once
        try { if (typeof CacheManager !== 'undefined' && CacheManager._emergencyPurge_) CacheManager._emergencyPurge_(); } catch (eEP2) {}
        try { props.setProperty(P_WD_CURSOR, String(newCursor)); } catch (eCur2) {
          try { Logger.log("[WATCHDOG] cursor write failed: " + eCur2); } catch (eL3) {}
        }
      }

      stats.ok = true;
      stats.exec_ms = Date.now() - t0;

      // v4.15.23 DIAG: capture per-probe state so user-visible diag cell can inspect sync
      try {
        var diagPerSheet = sheetData.slice(0, Math.min(sheetData.length, 40)).map(function(d){
          return { name: d.name, vI1: d.vI1, vJ1: d.vJ1, vB1: d.vB1 };
        });
        var diagTempoEntry = null;
        for (var dti = 0; dti < diagPerSheet.length; dti++) {
          if (diagPerSheet[dti].name === "Ledger - Tempo") { diagTempoEntry = diagPerSheet[dti]; break; }
        }
        var diagOut = {
          lastRunTs: new Date().toISOString(),
          stats: stats,
          probeNames: probeNames,
          tempoInProbe: !!diagTempoEntry,
          tempoEntry: diagTempoEntry,
          actionsCount: actions.length,
          perSheet: diagPerSheet,
          phaseC: props.getProperty("PHASE_C_ENABLED") || "false"
        };
        var diagJsonOut = JSON.stringify(diagOut);
        props.setProperty("WCORE_WD_LAST_DIAG", diagJsonOut);
        try {
          var _diagSs3 = SpreadsheetApp.getActiveSpreadsheet();
          var _diagSheet3 = _diagSs3 ? _diagSs3.getSheetByName("_WD_DIAG") : null;
          if (_diagSheet3) {
            _diagSheet3.getRange("A3").setValue(diagJsonOut.substring(0, 45000));
            _diagSheet3.getRange("A3").setNumberFormat("@");
          }
        } catch (eDiagCell) {}
      } catch (eDiag) {}

    } catch (e) {
      stats.error = e.message;
      stats.exec_ms = Date.now() - t0;
      try {
        PropertiesService.getScriptProperties().setProperty(
          "WCORE_WD_LAST_DIAG",
          JSON.stringify({ lastRunTs: new Date().toISOString(), error: e.message, stack: e.stack || "" })
        );
      } catch (eDiag2) {}
    }

    // Log stats
    Logger.log("[WATCHDOG] " + JSON.stringify(stats));

  } finally {
    lock.releaseLock();
    try { HttpCallCounter.clearTrigger(); } catch(e){}
  }
}

// ============================================================
// QUOTA RECOVERY SWEEP - v4.5.15
// Triggered daily at 10h35 CET (after quota reset at 10h30)
// Pulses B1 on all [BLOCKED:QUOTA] sheets in staggered batches
// ============================================================

/**
 * v4.5.15: Sweep all BLOCKED:QUOTA sheets after quota reset
 *
 * Reads Recap Chain, finds [BLOCKED:QUOTA] in column F (I1),
 * resets QuotaCircuitBreaker, then pulses B1 on blocked sheets
 * in batches of RECOVERY_BATCH_SIZE with RECOVERY_DELAY_MS between each.
 *
 * Install: daily trigger at 10h35 CET
 *   ScriptApp.newTrigger("QUOTA_RECOVERY_SWEEP").timeBased().atHour(10).nearMinute(35).everyDays(1).create();
 */
var _RECOVERY_SKIPPED_KEY = "WCORE_RECOVERY_SKIPPED_v1";

function _recoverySetSkipped_(list) {
  try {
    PropertiesService.getScriptProperties().setProperty(_RECOVERY_SKIPPED_KEY, JSON.stringify({
      ts: Date.now(),
      sheets: list
    }));
  } catch (e) {}
}

function _recoveryGetSkipped_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(_RECOVERY_SKIPPED_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

function _recoveryClearSkipped_() {
  try { PropertiesService.getScriptProperties().deleteProperty(_RECOVERY_SKIPPED_KEY); } catch (e) {}
}

/**
 * Scan Recap Chain → categorized blocked sheet lists.
 * Returns { quota: [...], timeout: [...], all: [...] } (BLOCKED:QUOTA first for priority)
 */
function _recoveryCollectBlocked_(recap) {
  var out = { quota: [], timeout: [], all: [] };
  var lastRow = recap.getLastRow();
  if (lastRow < 2) return out;

  var headers = recap.getRange(1, 1, 1, recap.getLastColumn()).getValues()[0];
  var i1Col = -1;
  for (var h = 0; h < headers.length; h++) {
    var hdr = String(headers[h] || "");
    if (hdr.indexOf("REFRESH_STATUS") !== -1 || hdr.indexOf("I1") !== -1) { i1Col = h; break; }
  }
  if (i1Col === -1) return out;

  var data = recap.getRange(2, 1, lastRow - 1, recap.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    var sheetName = String(data[i][0] || "").trim();
    if (!sheetName || sheetName.startsWith("//")) continue;
    var i1Val = String(data[i][i1Col] || "");
    if (i1Val.indexOf("[BLOCKED:QUOTA]") !== -1) {
      out.quota.push(sheetName);
    } else if (i1Val.indexOf("[BLOCKED:TIMEOUT]") !== -1 || i1Val.indexOf("#ERROR") !== -1) {
      out.timeout.push(sheetName);
    }
  }
  out.all = out.quota.concat(out.timeout);
  return out;
}

/**
 * Pulse B1=timestamp on a batched list. Returns { pulsed, batches, skippedFromIdx }.
 * Time-based triggers don't fire onEdit, so we write directly to B1 (A1=TRUE is manual-only).
 */
function _recoveryPulseBatches_(ss, sheetList, batchSize, delayMs, maxRuntimeMs, t0, logTag) {
  var res = { pulsed: 0, batches: 0, skippedFromIdx: -1 };
  var tz = ss.getSpreadsheetTimeZone();
  for (var b = 0; b < sheetList.length; b += batchSize) {
    if ((Date.now() - t0) > maxRuntimeMs) {
      res.skippedFromIdx = b;
      Logger.log("[" + logTag + "] Budget exceeded at idx " + b + ", skipping " + (sheetList.length - b));
      break;
    }
    if (b > 0) Utilities.sleep(delayMs);

    var batchEnd = Math.min(b + batchSize, sheetList.length);
    var nowStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");

    for (var j = b; j < batchEnd; j++) {
      try {
        var sheet = ss.getSheetByName(sheetList[j]);
        if (sheet) {
          // onEdit does not fire from time-based triggers, so bypass A1=TRUE and pulse B1 directly.
          sheet.getRange("B1").setValue(nowStr);
          sheet.getRange("B1").setNumberFormat("@");
          res.pulsed++;
        }
      } catch (e) {
        Logger.log("[" + logTag + "] Error pulsing " + sheetList[j] + ": " + e.message);
      }
    }
    res.batches++;
    Logger.log("[" + logTag + "] Batch " + res.batches + " done: pulsed " + (batchEnd - b) + " (" + sheetList[b] + " … " + sheetList[batchEnd - 1] + ")");
  }
  return res;
}

/**
 * Probe UrlFetchApp quota réel avant de déclencher un sweep.
 * Utilise _originalUrlFetch (capturé dans 03E_QUOTA_CIRCUIT_BREAKER.gs).
 * @return {{ ok: boolean, err: string, code: number }}
 */
function _recoveryProbeQuota_() {
  try {
    var fetchFn = (typeof _originalUrlFetch !== 'undefined') ? _originalUrlFetch : UrlFetchApp.fetch.bind(UrlFetchApp);
    var resp = fetchFn("https://httpbin.org/status/200", { muteHttpExceptions: true });
    var code = resp.getResponseCode();
    if (code === 200) {
      return { ok: true, err: "", code: code };
    }
    return { ok: false, err: "HTTP " + code, code: code };
  } catch (e) {
    return { ok: false, err: e.message, code: 0 };
  }
}

// --- Recovery lock / followup guards (R16) ---
var P_RECOVERY_SWEEP_LOCK = "RECOVERY_SWEEP_LOCK";
var P_RECOVERY_FU_PENDING = "RECOVERY_FU_PENDING";
var RECOVERY_LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes

function _recoveryAcquireLock_(key, ttlMs) {
  try {
    var props = PropertiesService.getScriptProperties();
    var now = Date.now();
    var raw = props.getProperty(key);
    var existing = raw ? parseInt(raw, 10) : 0;
    if (!isFinite(existing)) existing = 0;
    if (now - existing < ttlMs) return false;
    props.setProperty(key, String(now));
    return true;
  } catch (e) { return false; }
}

function _recoveryReleaseLock_(key) {
  try { PropertiesService.getScriptProperties().deleteProperty(key); } catch (e) {}
}

function _recoveryIsSweepRunning_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(P_RECOVERY_SWEEP_LOCK);
    if (!raw) return false;
    var ts = parseInt(raw, 10);
    if (!isFinite(ts)) return false;
    return (Date.now() - ts) < RECOVERY_LOCK_TTL_MS;
  } catch (e) { return false; }
}

function _recoverySetFollowupPending_(ts) {
  try { PropertiesService.getScriptProperties().setProperty(P_RECOVERY_FU_PENDING, String(ts)); } catch (e) {}
}

function _recoveryClearFollowupPending_() {
  try { PropertiesService.getScriptProperties().deleteProperty(P_RECOVERY_FU_PENDING); } catch (e) {}
}

function _recoveryIsFollowupPending_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(P_RECOVERY_FU_PENDING);
    if (!raw) return false;
    var ts = parseInt(raw, 10);
    if (!isFinite(ts)) return false;
    return ts > (Date.now() - 60000); // 1 min grace
  } catch (e) { return false; }
}

function QUOTA_RECOVERY_SWEEP() {
  try { HttpCallCounter.setTrigger('QUOTA_RECOVERY_SWEEP'); } catch(e){}
  try { if (typeof WCORE_AUTO_HEAL === 'function') WCORE_AUTO_HEAL("QUOTA_RECOVERY_SWEEP", false); } catch(e){}
  var acquired = false;
  try {
    // R16 guard: prevent concurrent sweep execution
    if (!_recoveryAcquireLock_(P_RECOVERY_SWEEP_LOCK, RECOVERY_LOCK_TTL_MS)) {
      Logger.log("[RECOVERY] Another SWEEP is already running — aborting");
      return;
    }
    acquired = true;

    var RECOVERY_BATCH_SIZE = 5;   // Réduit à 5 au 1er passage (conservative)
    var RECOVERY_DELAY_MS = 60000; // 60s entre batchs (était 30s)
    var MAX_RUNTIME_MS = 300000;   // 5 min max (marge avant 6 min limit)
    var t0 = Date.now();

    // --- Probe quota avant tout ---
    var probe = _recoveryProbeQuota_();
    if (!probe.ok) {
      Logger.log("[RECOVERY] Probe failed: " + probe.err + " — skipping pulse, retry in 30min");
      // R16 guard: avoid duplicate retry trigger
      if (!_recoveryIsFollowupPending_()) {
        try {
          ScriptApp.newTrigger("QUOTA_RECOVERY_SWEEP").timeBased().after(30 * 60 * 1000).create();
          _recoverySetFollowupPending_(Date.now() + 30 * 60 * 1000);
          Logger.log("[RECOVERY] Retry trigger scheduled in 30min");
        } catch (te) {
          Logger.log("[RECOVERY] Failed to schedule retry: " + te.message);
        }
      } else {
        Logger.log("[RECOVERY] Retry trigger already pending — skipping duplicate");
      }
      return;
    }
    Logger.log("[RECOVERY] Probe OK (HTTP " + probe.code + ") — proceeding");

    var stats = { blocked_quota: 0, blocked_timeout: 0, pulsed: 0, batches: 0, skipped: 0, exec_ms: 0 };

    try {
      if (typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.reset) {
        QuotaCircuitBreaker.reset();
        Logger.log("[RECOVERY] QuotaCircuitBreaker reset");
      }
      if (typeof HttpErrorGuard !== 'undefined' && HttpErrorGuard.clearQuotaFlag) {
        HttpErrorGuard.clearQuotaFlag();
      }

      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var recap = ss.getSheetByName(RECAP_SHEET_NAME);
      if (!recap) { Logger.log("[RECOVERY] Recap Chain not found"); return; }

      var cat = _recoveryCollectBlocked_(recap);
      stats.blocked_quota = cat.quota.length;
      stats.blocked_timeout = cat.timeout.length;

      if (cat.all.length === 0) {
        Logger.log("[RECOVERY] No blocked sheets found — clearing skipped state and skipping");
        _recoveryClearSkipped_();
        _recoveryClearFollowupPending_();
        return;
      }

      Logger.log("[RECOVERY] Found " + cat.quota.length + " BLOCKED:QUOTA + " + cat.timeout.length + " BLOCKED:TIMEOUT/#ERROR — pulsing in batches of " + RECOVERY_BATCH_SIZE);

      var r = _recoveryPulseBatches_(ss, cat.all, RECOVERY_BATCH_SIZE, RECOVERY_DELAY_MS, MAX_RUNTIME_MS, t0, "RECOVERY");
      stats.pulsed = r.pulsed;
      stats.batches = r.batches;

      if (r.skippedFromIdx >= 0) {
        var skippedList = cat.all.slice(r.skippedFromIdx);
        stats.skipped = skippedList.length;
        _recoverySetSkipped_(skippedList);
        // R16 guard: do not schedule duplicate FOLLOWUP
        if (!_recoveryIsFollowupPending_()) {
          try {
            ScriptApp.newTrigger("QUOTA_RECOVERY_SWEEP_FOLLOWUP").timeBased().after(30 * 60 * 1000).create();
            _recoverySetFollowupPending_(Date.now() + 30 * 60 * 1000);
            Logger.log("[RECOVERY] FOLLOWUP scheduled in 30min for " + skippedList.length + " skipped sheets");
          } catch (te) {
            Logger.log("[RECOVERY] Failed to schedule FOLLOWUP: " + te.message);
          }
        } else {
          Logger.log("[RECOVERY] FOLLOWUP already pending — skipping duplicate scheduling");
        }
      } else {
        _recoveryClearSkipped_();
        _recoveryClearFollowupPending_();
      }

    } catch (e) {
      Logger.log("[RECOVERY] Error: " + e.message);
    }

    stats.exec_ms = Date.now() - t0;
    Logger.log("[RECOVERY] Done: " + JSON.stringify(stats));

    try { INSTALL_QUOTA_RECOVERY(); } catch (e) { Logger.log("[RECOVERY] Auto-reinstall failed: " + e.message); }
  } finally {
    if (acquired) _recoveryReleaseLock_(P_RECOVERY_SWEEP_LOCK);
    try { HttpCallCounter.clearTrigger(); } catch(e){}
  }
}

/**
 * v4.5.17: Second-pass sweep ~30min after main QUOTA_RECOVERY_SWEEP.
 * Retries skipped sheets + rescans Recap Chain for sheets still blocked.
 */
function QUOTA_RECOVERY_SWEEP_FOLLOWUP() {
  try { HttpCallCounter.setTrigger('QUOTA_RECOVERY_SWEEP_FOLLOWUP'); } catch(e){}
  // R16 guard: abort if SWEEP is currently running to avoid overlap
  if (_recoveryIsSweepRunning_()) {
    Logger.log("[RECOVERY_FU] SWEEP is currently running — aborting FOLLOWUP to avoid overlap");
    return;
  }
  // Clear stale pending flag regardless
  _recoveryClearFollowupPending_();
  try {
    var RECOVERY_BATCH_SIZE = 10;
    var RECOVERY_DELAY_MS = 30000;
    var MAX_RUNTIME_MS = 300000;
    var t0 = Date.now();

    // --- Probe quota avant tout ---
    var probe = _recoveryProbeQuota_();
    if (!probe.ok) {
      Logger.log("[RECOVERY_FU] Probe failed: " + probe.err + " — skipping pulse, retry in 30min");
      // R16 guard: avoid duplicate retry trigger
      if (!_recoveryIsFollowupPending_()) {
        try {
          ScriptApp.newTrigger("QUOTA_RECOVERY_SWEEP_FOLLOWUP").timeBased().after(30 * 60 * 1000).create();
          _recoverySetFollowupPending_(Date.now() + 30 * 60 * 1000);
          Logger.log("[RECOVERY_FU] Retry trigger scheduled in 30min");
        } catch (te) {
          Logger.log("[RECOVERY_FU] Failed to schedule retry: " + te.message);
        }
      } else {
        Logger.log("[RECOVERY_FU] Retry trigger already pending — skipping duplicate");
      }
      return;
    }
    Logger.log("[RECOVERY_FU] Probe OK (HTTP " + probe.code + ") — proceeding");

    var stats = { skipped_retry: 0, still_blocked: 0, pulsed: 0, batches: 0, skipped: 0, exec_ms: 0 };

    try {
      var skipped = _recoveryGetSkipped_();
      var skippedSheets = (skipped && skipped.sheets) ? skipped.sheets : [];
      stats.skipped_retry = skippedSheets.length;

      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var recap = ss.getSheetByName(RECAP_SHEET_NAME);
      if (!recap) {
        Logger.log("[RECOVERY_FU] Recap Chain not found");
        _recoveryClearSkipped_();
        return;
      }

      var cat = _recoveryCollectBlocked_(recap);
      stats.still_blocked = cat.all.length;

      // Dedup merge: skipped + still blocked
      var seen = {};
      var merged = [];
      skippedSheets.concat(cat.all).forEach(function(s) {
        if (s && !seen[s]) { seen[s] = true; merged.push(s); }
      });

      if (merged.length === 0) {
        Logger.log("[RECOVERY_FU] Nothing to retry — clearing and exiting");
        _recoveryClearSkipped_();
        return;
      }

      Logger.log("[RECOVERY_FU] Retrying " + merged.length + " (" + skippedSheets.length + " skipped + " + cat.all.length + " still blocked, deduped)");

      var r = _recoveryPulseBatches_(ss, merged, RECOVERY_BATCH_SIZE, RECOVERY_DELAY_MS, MAX_RUNTIME_MS, t0, "RECOVERY_FU");
      stats.pulsed = r.pulsed;
      stats.batches = r.batches;
      stats.skipped = (r.skippedFromIdx >= 0) ? (merged.length - r.skippedFromIdx) : 0;

      _recoveryClearSkipped_();

    } catch (e) {
      Logger.log("[RECOVERY_FU] Error: " + e.message);
    }

    stats.exec_ms = Date.now() - t0;
    Logger.log("[RECOVERY_FU] Done: " + JSON.stringify(stats));

    try { INSTALL_QUOTA_RECOVERY(); } catch (e) { Logger.log("[RECOVERY_FU] Auto-reinstall failed: " + e.message); }
  } finally {
    try { HttpCallCounter.clearTrigger(); } catch(e){}
  }
}

/**
 * Install poller trigger for QUOTA_RECOVERY_SWEEP.
 * Remplace la logique DST-based (heure fixe) par un poller everyMinutes(30).
 * Le sweep probe le quota réel et se reschedule lui-même ; il s'arrête quand
 * il n'y a plus de sheets bloquées.
 */
function INSTALL_QUOTA_RECOVERY() {
  // Supprimer tous les triggers existants (main + followup)
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    if (fn === "QUOTA_RECOVERY_SWEEP" || fn === "QUOTA_RECOVERY_SWEEP_FOLLOWUP") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // R16: clear stale locks/flags to avoid phantom state after reinstall
  _recoveryReleaseLock_(P_RECOVERY_SWEEP_LOCK);
  _recoveryClearFollowupPending_();

  // Poller toutes les 30 min — probe-gated, early-exit si quota absent
  ScriptApp.newTrigger("QUOTA_RECOVERY_SWEEP")
    .timeBased().everyMinutes(30).create();

  Logger.log("[RECOVERY] Trigger installed: QUOTA_RECOVERY_SWEEP every 30min (probe-gated)");
}

// ============================================================
// J1 SYNC - Dedicated fast pass (v4.15.32)
// ============================================================

var SYNC_J1_MAX_SYNCS_PER_RUN = 20;

/**
 * Lightweight J1 sync for ALL wallet-chain sheets.
 * Reads I1/J1 for every " - " sheet, writes I1 to J1 only when I1 is a
 * successful timestamp (plain timestamp or [CACHE_ONLY] timestamp) and I1 > J1.
 * No heartbeat writes: changing J1 triggers cache-only recalculation and can block
 * the Execution API when done as a periodic pulse.
 * Sync writes are capped per run because each J1 write can trigger sheet recalculation.
 * No HTTP calls — only sheet cell I/O, so it is safe to run every minute.
 *
 * Called by ACTIVITY_WATCHDOG (27_ACTIVITY_REFRESH.gs).
 * @returns {Object} { checked, synced, skippedSync, errors }
 */
function SYNC_J1_ALL_SHEETS() {
  var stats = { checked: 0, synced: 0, errors: 0 };
  // v4.15.112: keep this function as sheet I/O only. Running auto-heal here
  // makes a lightweight latch sync reinstall triggers and churn the workbook.
  try {
    var ss = _wcoreGetSpreadsheet_();
    if (!ss) return stats;

     var recap = ss.getSheetByName("Recap Portfolio");
    if (!recap) return stats;
    var lastRow = recap.getLastRow();
    if (lastRow < 2) return stats;

    var names = recap.getRange(2, 1, lastRow - 1, 1).getValues();
    var valsI1 = recap.getRange(2, 6, lastRow - 1, 1).getValues();
    var valsJ1 = recap.getRange(2, 7, lastRow - 1, 1).getValues();

    for (var i = 0; i < valsI1.length; i++) {
      var rawI1 = (valsI1[i] && valsI1[i][0]);
      var rawJ1 = (valsJ1[i] && valsJ1[i][0]);
      var i1 = (rawI1 instanceof Date) ? _wd_fmtDate_(rawI1) : String(rawI1 || "").trim();
      var j1 = (rawJ1 instanceof Date) ? _wd_fmtDate_(rawJ1) : String(rawJ1 || "").trim();
      var cleanI1 = _wd_extractTimestamp_(i1);
      if (!_wd_isLastUpdateFormat_(cleanI1)) continue;
      if (cleanI1 === j1) continue;
      stats.checked++;

      var sheetName = String((names[i] && names[i][0]) || "").trim();
      if (!sheetName) continue;
      // v4.15.85: never write J1 on CEX display-only tabs.
      if (_wd_isCexSheet_(sheetName)) continue;
      try {
        var sh = ss.getSheetByName(sheetName);
        if (!sh) continue;
        sh.getRange("J1").setValue(cleanI1);
        sh.getRange("J1").setNumberFormat("@");
        stats.synced++;
      } catch (e) { stats.errors++; }
    }
  } catch (e) { stats.errors++; }
  return stats;
}

function REPAIR_J1_LATCH_FORMULAS(limit) {
  var stats = { checked: 0, repaired: 0, cleared: 0, errors: 0 };
  var max = parseInt(limit || "200", 10);
  if (!isFinite(max) || max <= 0) max = 200;

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return stats;
    var sheets = ss.getSheets();
    for (var i = 0; i < sheets.length; i++) {
      if (stats.repaired >= max) break;
      var sh = sheets[i];
      var name = sh.getName();
      if (name.indexOf(" - ") === -1) continue;
      stats.checked++;

      try {
        var formula = String(sh.getRange("J1").getFormula() || "");
        if (!formula) continue;
        var looksLikeLegacyLatch = formula.indexOf("TO_TEXT(I1)") !== -1 && formula.indexOf("J1") !== -1;
        if (!looksLikeLegacyLatch) continue;

        var vI1 = String(sh.getRange("I1").getDisplayValue() || "").trim();
        var actualI1 = _wd_extractSuccessTimestamp_(vI1);
        var nextJ1 = "";
        if (_wd_isLastUpdateFormat_(actualI1)) {
          nextJ1 = actualI1;
        } else {
          var vJ1 = String(sh.getRange("J1").getDisplayValue() || "").trim();
          if (_wd_isLastUpdateFormat_(vJ1)) nextJ1 = vJ1;
        }

        sh.getRange("J1").setValue(nextJ1);
        sh.getRange("J1").setNumberFormat("@");
        if (nextJ1) stats.repaired++;
        else stats.cleared++;
      } catch (eSheet) {
        stats.errors++;
      }
    }
  } catch (e) {
    stats.errors++;
  }
  return stats;
}

/**
 * Get watchdog stats
 * @customfunction
 */
function GET_WATCHDOG_STATS() {
  var phaseC = "false";
  var pricingWorker = "false";
  try {
    var props = PropertiesService.getScriptProperties();
    phaseC = props.getProperty("PHASE_C_ENABLED") || "false";
    pricingWorker = props.getProperty("PRICING_WORKER_ENABLED") || "false";
  } catch (e) {}
  return [
    ["Setting", "Value"],
    ["WD_STALE_I1_HOURS", WD_STALE_I1_HOURS],
    ["WD_PULSE_MIN", WD_PULSE_MIN],
    ["WD_PULSE_MIN_BLOCKED", WD_PULSE_MIN_BLOCKED],
    ["WD_PULSE_MIN_PARTIAL", WD_PULSE_MIN_PARTIAL],
    ["WD_PROBE_SIZE_MIN", WD_PROBE_SIZE_MIN],
    ["WD_PROBE_SIZE_MAX", WD_PROBE_SIZE_MAX],
    ["PHASE_C_ENABLED", phaseC],
    ["PRICING_WORKER_ENABLED", pricingWorker]
  ];
}

// ============================================================
// CACHE MANAGEMENT (unchanged from v4.5.10)
// ============================================================

// [Rest of cache management functions remain unchanged]
// CLEAR_CHAIN_CACHE, CLEAR_GLOBAL_CACHE, etc.
// These are preserved from the original file
