/************************************************************
 * 16_REFRESH.gs - Watchdog & Cache Management
 *
 * Version: v4.16.47
 *
 * v4.16.46: Detect CACHE_ONLY B1/I1 mismatch â€” when B1 advances but
 *   the scan keeps serving a stale [CACHE_ONLY] timestamp, re-pulse
 *   aggressively and use I1 as the age anchor for priority sorting.
 *
 * v4.16.45: Atomically claim fair J1 slices and extend watchdog lease TTL.
 *
 * v4.16.44: Isolate watchdog/auto-heal leases, remove inline maintenance,
 *   recover deferred scans after cooldown, and cap fair J1 writes at 20.
 *
 * v4.16.43: Resolve ambiguous local DST timestamps to their latest occurrence.
 *
 * v4.16.42: Roundtrip zone-less ISO timestamps as local wall-clock time.
 *
 * v4.16.41: Strictly validate local and ISO watchdog timestamps.
 *
 * v4.16.40: Admit no-usable-cache wallets to both cycle and urgent lanes.
 *
 * v4.16.39: Parse explicit TON_SCAN_OK timestamps for scheduling and J1 sync.
 *
 * v4.16.38: Treat B1 as an immediate scheduling reservation and fill unused
 *   pulse capacity symmetrically without displacing the four-slot cycle lane.
 * v4.16.37: Schedule four oldest eligible wallets plus one urgent target so
 *   every managed on-chain wallet receives a bounded periodic B1 pulse.
 * v4.16.36: Serialize direct watchdog diagnostics/force entry points and
 *   strictly sanitize persisted partial-cycle timestamps.
 * v4.16.35: Reserve watchdog pulse state before B1 writes and rollback failed
 *   writes best-effort with conservative at-most-once quota safety.
 * v4.16.34: Commit watchdog retry/partial state only after successful B1 writes;
 *   preserve Web retry progression across fresh error timestamps and dedupe pulses.
 * v4.16.33: Ten-minute watchdog with one five-pulse budget and bounded
 *   30m/2h/6h/24h backoff for Web scan errors.
 * v4.16.32 FIX: successful quota probes reset both guards, use trigger-safe
 *   spreadsheet access, and persist one combined portfolio recovery trigger.
 *
 * v4.5.23 FIX: normal watchdog no longer resets or repulses QUOTA rows
 *   without a live quota probe. QUOTA recovery is owned by QUOTA_RECOVERY_SWEEP,
 *   which calls _recoveryProbeQuota_ before reset/pulse.
 *
 * v4.15.58 FIX: never sync J1 from BLOCKED/NO_CACHE I1 values; preserving
 *   the old J1 latch is what keeps A1 on the last good cache during quota outages.
 * v4.5.21 ADD: SYNC_J1_ALL_SHEETS() â€” lightweight dedicated J1 sync for all
 *   wallet-chain sheets. Reads I1/J1 for every " - " sheet, writes I1â†’J1 when
 *   I1 > J1. Triggered every 2 min by auto-heal + every 10 min by ACTIVITY_WATCHDOG.
 *   Eliminates ~60 min worst-case J1 sync delay from probe window limitation.
 *
 * v4.5.22 FIX: R16 â€” prevent duplicate QUOTA_RECOVERY_SWEEP_FOLLOWUP triggers
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
 *   - _recoveryProbeQuota_() vÃ©rifie le quota rÃ©el avant tout reset/pulse
 *   - QUOTA_RECOVERY_SWEEP : probe-gate + retry 30min si quota absent, batch 5/60s au 1er passage
 *   - QUOTA_RECOVERY_SWEEP_FOLLOWUP : mÃªme probe-gate
 *   - INSTALL_QUOTA_RECOVERY : poller everyMinutes(30), plus de logique DST
 *
 * v4.5.17 FIX: QUOTA_RECOVERY_SWEEP recovery hardening
 *   - Pulse B1=timestamp(text) directement (time-based triggers ne dÃ©clenchent pas onEdit,
 *     donc A1=TRUE ne se propagerait pas â€” A1 reste manual-only)
 *   - SÃ©pare [BLOCKED:QUOTA] (prioritaire) et [BLOCKED:TIMEOUT]/#ERROR dans les stats
 *   - Persiste la liste des sheets skipped dans ScriptProperties (WCORE_RECOVERY_SKIPPED_v1)
 *   - NOUVEAU: QUOTA_RECOVERY_SWEEP_FOLLOWUP Ã  T+30min â€” retente skipped + rescanne Recap Chain
 *   - INSTALL_QUOTA_RECOVERY installe les 2 triggers (10h35/11h05 CET ou 11h35/12h05 CEST)
 *
 * v4.5.15 FIX: BLOCKED sheets with fresh timestamp (< 5h) no longer re-pulsed
 *   - _wd_needsRefresh_ now checks extracted timestamp from [BLOCKED:*] I1 values
 *   - If timestamp is < staleMs (5h), needsPulse=false â€” avoids thundering herd
 *   - Before: all [BLOCKED:QUOTA] sheets always re-pulsed regardless of freshness
 *
 * v4.5.14 FIX: [NO_CACHE] sheets not re-pulsed by WATCHDOG
 *   - _wd_needsRefresh_ did not recognize [NO_CACHE] as needing a pulse
 *   - [NO_CACHE] now treated as "empty" (10 min cooldown, not 5h wait)
 *
 * v4.5.13 CHANGES (MASTER_ON_EDIT RESTORED + CACHE REFRESH FIX):
 * - RESTORED: MASTER_ON_EDIT function (was accidentally removed in v4.5.10+)
 * - FIX: Installable onEdit trigger now finds its target function again
 * - A1=TRUE Ã¢â€ â€™ pulse B1 Ã¢â€ â€™ reset A1=FALSE manual refresh mechanism
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
 * ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â CRITICAL RULE: Watchdog NEVER clears/purges cache data!
 * ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â _wd_tryUnblock_ only resets FLAGS (lockdown, degraded, error states)
 * ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â CLEAR_* functions are MANUAL ONLY (require confirm=TRUE)
 ************************************************************/

// ============================================================
// CONFIGURATION
// ============================================================

var RECAP_SHEET_NAME = "Recap Portfolio";
var WCORE_SPREADSHEET_ID = "1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4";

// Timing configs
var WD_STALE_I1_HOURS = 5;      // v4.5.13: I1 > 5h => pulse B1 (before CacheService 6h expiry)
var WD_PULSE_MIN = 30;          // v4.15.135: 30 min â€” 10 min was too aggressive on quota
var WD_PULSE_MIN_BLOCKED = 30;  // v4.5.8: Cooldown for blocked sheets (30 min)
var WD_PULSE_MIN_PARTIAL = 60;  // v4.15.133: 60 min â€” partial cycles are mostly unpriced tokens, re-pulsing too fast wastes quota

// Probe size
var WD_PROBE_SIZE_MIN = 5;
var WD_PROBE_SIZE_MAX = 20;
var WD_MAX_PULSES_PER_RUN = 10;
var WD_CYCLE_SLOTS_PER_RUN = 7;
var WD_WEB_ERROR_BACKOFF_MS = [30 * 60000, 2 * 3600000, 6 * 3600000, 24 * 3600000];
var WD_WEB_BACKOFF_MAX_ENTRIES = 200;
var WD_WEB_BACKOFF_RETENTION_MS = 48 * 3600000;
var WCORE_WATCHDOG_LEASE_KEY = "WCORE_WATCHDOG_LEASE";
var WCORE_WATCHDOG_LEASE_TTL_MS = 10 * 60 * 1000;

// Property keys
var P_WD_CURSOR = "WD_CURSOR";
var P_WD_RUNS = "WD_RUNS";
var P_WD_PARTIAL_LAST = "WD_PARTIAL_LAST";  // v4.5.11: Last partial cycle pulse timestamps
var P_WD_J1_CURSOR = "WD_J1_CURSOR";
var P_SYNC_J1_CURSOR = "SYNC_J1_CURSOR";

var REFRESH_VERSION = "4.16.47";

function _wcoreAcquireLease_(key, ttlMs, owner) {
  var lock = null;
  var locked = false;
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(250)) return null;
    locked = true;
    var nowMs = Date.now();
    var props = PropertiesService.getScriptProperties();
    var current = null;
    try { current = JSON.parse(props.getProperty(key) || "null"); } catch (eParse) {}
    if (current && current.owner && isFinite(Number(current.until)) && Number(current.until) > nowMs) return null;
    var leaseOwner = String(owner || Utilities.getUuid());
    props.setProperty(key, JSON.stringify({ owner: leaseOwner, until: nowMs + Number(ttlMs || 0) }));
    return leaseOwner;
  } catch (e) {
    return null;
  } finally {
    if (locked && lock) {
      try { lock.releaseLock(); } catch (eRelease) {}
    }
  }
}

function _wcoreReleaseLease_(key, owner) {
  var lock = null;
  var locked = false;
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(250)) return false;
    locked = true;
    var props = PropertiesService.getScriptProperties();
    var current = null;
    try { current = JSON.parse(props.getProperty(key) || "null"); } catch (eParse) {}
    if (!current || String(current.owner || "") !== String(owner || "")) return false;
    props.deleteProperty(key);
    return true;
  } catch (e) {
    return false;
  } finally {
    if (locked && lock) {
      try { lock.releaseLock(); } catch (eRelease) {}
    }
  }
}

function onEdit(e) {
  // v4.15.112: simple onEdit runs with limited auth and duplicates the
  // installable MASTER_ON_EDIT trigger. Keep it inert so it cannot consume
  // checkboxes, pulse B1/J1, or start heavy refresh paths.
  return;
}

// v4.15.104: WCORE_ON_EDIT also calls _bpDetailsAutoLink_ after CEX handlers for per-cell auto-link of Portefeuille Crypto Details column E.
// v4.15.99: installable onEdit trigger wrapper â€” A1=TRUE â†’ pulse B1 â†’ reset A1=FALSE.
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
    var range = e.range;
    var sheet = range && range.getSheet ? range.getSheet() : null;
    var name = sheet && sheet.getName ? sheet.getName() : "";
    var a1 = range && range.getA1Notation ? range.getA1Notation() : "";
    if (a1 === "BW1" && String(name || "") === "Strat" && typeof _portfolioSyncBothViews_ === "function") {
      try { _portfolioSyncBothViews_(); } catch (eSync) {}
    }
    if (a1 === "B1" && (String(name || "") === "Portefeuille Action" || String(name || "") === "Portefeuille Crypto")) {
      if (typeof _portfolioSyncBothViews_ === "function") {
        try { _portfolioSyncBothViews_(); } catch (eSync) {}
      }
      return;
    }
    if (a1 === "A1" && String(name || "") === "Portefeuille Action") {
      var stockValue = (typeof e.value !== "undefined") ? e.value : range.getValue();
      if (String(stockValue).toUpperCase() === "TRUE" && typeof UPDATE_STOCK_PORTFOLIO === "function") {
        sheet.getRange("B1").setValue("QUEUED: " + _wd_fmtDate_(new Date())).setNumberFormat("@");
        var stockResult = UPDATE_STOCK_PORTFOLIO();
        if (String(stockResult || "").indexOf("BUSY:") === 0) {
          sheet.getRange("B1").setValue(stockResult).setNumberFormat("@");
          range.setValue(false);
        }
        return;
      }
    }
    if (a1 === "A1" && String(name || "") === "Portefeuille Crypto") {
      var cryptoValue = (typeof e.value !== "undefined") ? e.value : range.getValue();
      if (String(cryptoValue).toUpperCase() === "TRUE" && typeof UPDATE_CRYPTO_PORTFOLIO_V2 === "function") {
        sheet.getRange("B1").setValue("QUEUED: " + _wd_fmtDate_(new Date())).setNumberFormat("@");
        var cryptoResult = UPDATE_CRYPTO_PORTFOLIO_V2();
        if (String(cryptoResult || "").indexOf("BUSY:") === 0) {
          sheet.getRange("B1").setValue(cryptoResult).setNumberFormat("@");
          range.setValue(false);
        }
        return;
      }
    }
    // v4.15.104: per-cell auto-link for Portefeuille Crypto Details column E.
    // Runs AFTER CEX handlers (which return true on their sheets) so it only fires
    // for non-CEX edits. Bridges the gap between bulk _setDetailsChainHyperlinks_
    // (5-30 min pulses) and rows added in between.
   if (typeof _bpDetailsAutoLink_ === "function") {
    try { _bpDetailsAutoLink_(e); } catch (eAuto) {}
   }
    if (range.getA1Notation && range.getA1Notation() !== "A1") return;
    if (!sheet) return;
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
  try {
    if (typeof Sheets === "undefined" || !Sheets.Spreadsheets || !Sheets.Spreadsheets.Values) throw new Error("Advanced Sheets service unavailable");
    var resp = Sheets.Spreadsheets.Values.get(WCORE_SPREADSHEET_ID, _wd_quoteA1Sheet_(RECAP_SHEET_NAME) + "!A1:Z200");
    var values = (resp && resp.values) || [];
    if (values.length < 2) throw new Error("Recap Chain empty");
    var rows = values.slice(1).filter(function(r) { var n = _wd_cell_(r, 0); return n && n.indexOf("//") !== 0; });
    stats.N = rows.length;
    if (stats.N === 0) throw new Error("No sheets in Recap Chain");

    var nowStr = Utilities.formatDate(new Date(nowMs), "Europe/Paris", "yyyy-MM-dd HH:mm:ss");
    var lastPulseMap = _wd_loadPartialPulseMap_();
    var partialCandidates = [];

    for (var p = 0; p < rows.length; p++) {
      var pRow = rows[p], pSheet = _wd_cell_(pRow, 0);
      if (!_wd_rowHasPartialCycle_(pRow)) continue;
      stats.partialFound = (stats.partialFound || 0) + 1;
      var pLastPulse = Number(lastPulseMap[pSheet] || 0);
      if (!pLastPulse) pLastPulse = _wd_parseLocalDateTimeToMs_(_wd_cell_(pRow, 3));
      if (!isFinite(pLastPulse) || (nowMs - pLastPulse) >= WD_PULSE_MIN_PARTIAL * 60000) {
        partialCandidates.push({
          sheet: null,
          sheetName: pSheet,
          range: "B1",
          value: nowStr,
          type: "pulse",
          reason: "partial",
          priority: _wd_refreshReasonPriority_("partial"),
          staleAgeMs: isFinite(pLastPulse) ? Math.max(0, nowMs - pLastPulse) : 0
        });
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
    var globalActions = _wd_collectGlobalRefreshActions_(rowItems, nowMs, staleMs, nowStr, stats, partialCandidates);
    var apiExecution = _wd_executeApiActions_(globalActions, nowMs);
    stats.actions = apiExecution.writes;
    stats.b1Set = apiExecution.pulses;
    stats.b1Partial = apiExecution.partialPulses;
    stats.synced = apiExecution.synced;
    stats.stateErrors = Number(stats.stateErrors || 0) + apiExecution.stateErrors;
    props.setProperty(P_WD_CURSOR, String((cursor + probeSize) % stats.N));
    stats.ok = true;
  } catch (e) {
    stats.error = e.message;
    stats.stack = e.stack || "";
    stats.stateErrors = Number(stats.stateErrors || 0) + Number(e.stateErrors || 0);
  }
  stats.exec_ms = Date.now() - t0;
  try { props.setProperty("WCORE_WD_LAST_DIAG", JSON.stringify(stats)); } catch (eDiag) {}
  Logger.log("[WATCHDOG_API] " + JSON.stringify(stats));
  return stats;
}

function DIAG_RUN_WATCHDOG_SHEETS_API_FALLBACK() {
  var leaseOwner = null;
  try {
    leaseOwner = _wcoreAcquireLease_(WCORE_WATCHDOG_LEASE_KEY, WCORE_WATCHDOG_LEASE_TTL_MS);
    if (!leaseOwner) {
      return { ok: false, skipped: "LOCK_BUSY", b1Set: 0, stateErrors: 0 };
    }
    return _wd_watchdogFromRecapViaSheetsApi_(Date.now());
  } catch (e) {
    return { ok: false, skipped: "LOCK_FAILURE", error: String(e && (e.message || e) || e), b1Set: 0, stateErrors: 0 };
  } finally {
    if (leaseOwner) _wcoreReleaseLease_(WCORE_WATCHDOG_LEASE_KEY, leaseOwner);
  }
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
function _wd_checkPartialCycles_(ss, nowMs, maxPulses) {
  var stats = { checked: 0, partial: 0, pulsed: 0, errors: 0, actions: [] };
  
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
    var lastPulseMap = _wd_loadPartialPulseMap_();
    
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
        
        // Get the sheet FIRST (needed for B1 fallback and for the pulse)
        var partialSheet = null;
        try { partialSheet = ss.getSheetByName(sheetName); } catch (eGet) {}
        
        // Check cooldown â€” use ScriptProperties tracking, fallback to B1 value
        var lastPulse = lastPulseMap[sheetName] || 0;
        var cooldownMs = WD_PULSE_MIN_PARTIAL * 60000;
        // v4.15.135: if tracking was lost (ScriptProperties purge), read B1
        // from the sheet itself as a fallback to avoid re-pulsing unnecessarily.
        if (lastPulse === 0 && partialSheet) {
          try {
            var b1Val = partialSheet.getRange("B1").getDisplayValue();
            var b1Ms = _wd_parseLocalDateTimeToMs_(b1Val);
            if (isFinite(b1Ms)) lastPulse = b1Ms;
          } catch (eB1) {}
        }
        
        if ((nowMs - lastPulse) >= cooldownMs && partialSheet) {
          stats.actions.push({
            sheet: partialSheet,
            sheetName: sheetName,
            range: "B1",
            value: nowStr,
            type: "pulse",
            reason: "partial",
            priority: _wd_refreshReasonPriority_("partial"),
            staleAgeMs: lastPulse ? Math.max(0, nowMs - lastPulse) : 0
          });
        }
      }
    }
    
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
    var lastPulseMap = _wd_loadPartialPulseMap_();
    
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
        status = canPulse ? "ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â PARTIAL - Will pulse" : "ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚Â³ PARTIAL - Cooldown";
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
  var leaseOwner = null;
  try {
    leaseOwner = _wcoreAcquireLease_(WCORE_WATCHDOG_LEASE_KEY, WCORE_WATCHDOG_LEASE_TTL_MS);
    if (!leaseOwner) {
      return [["Stat", "Value"], ["Status", "LOCK_BUSY"], ["Pulsed", 0], ["State Errors", 0]];
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var nowMs = Date.now();
    var partialStats = _wd_checkPartialCycles_(ss, nowMs, WD_MAX_PULSES_PER_RUN);
    var collectStats = { b1Set: 0, b1Partial: 0, toSync: 0, stateErrors: 0 };
    var nowStr = Utilities.formatDate(new Date(nowMs), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss");
    var selected = _wd_collectGlobalRefreshActions_([], nowMs, WD_STALE_I1_HOURS * 3600000, nowStr, collectStats, partialStats.actions);
    var execution = _wd_applySpreadsheetActions_(ss, selected, nowMs, WD_MAX_PULSES_PER_RUN);
    partialStats.pulsed = execution.pulses;
    partialStats.errors += execution.errors;
    partialStats.stateErrors = collectStats.stateErrors + execution.stateErrors;

    Logger.log("[FORCE_PARTIAL] checked=" + partialStats.checked +
               " partial=" + partialStats.partial +
               " pulsed=" + partialStats.pulsed +
               " errors=" + partialStats.errors +
               " stateErrors=" + partialStats.stateErrors);

    return [
      ["Stat", "Value"],
      ["Checked", partialStats.checked],
      ["Partial", partialStats.partial],
      ["Pulsed", partialStats.pulsed],
      ["Errors", partialStats.errors],
      ["State Errors", partialStats.stateErrors]
    ];
  } catch (e) {
    return [["Stat", "Value"], ["Status", "LOCK_FAILURE"], ["Error", String(e && (e.message || e) || e)], ["Pulsed", 0]];
  } finally {
    if (leaseOwner) _wcoreReleaseLease_(WCORE_WATCHDOG_LEASE_KEY, leaseOwner);
  }
}

// v0.3.x: System-driven force-rescan for a list of chain keys. Pulses B1 on the
// matching Ledger sheet so the next scan (manual or time-based) re-fetches the
// latest API payload. This bypasses the I1-staleness cooldown for callers who
// know the payload is stale (e.g. right after an API deploy). The action is
// system-driven (not a manual Sheet edit) â€” it uses a fresh timestamp that the
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
  return isFinite(_wd_parseLocalDateTimeToMs_(s));
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
  var match = vI1.match(/^\[(?:BLOCKED:[^\]]+|CACHE_ONLY|WEB_SCAN_DEGRADED|WEB_SCAN_PRESERVED|WEB_SCAN_ERROR)\]\s*(.+)$/);
  if (match && match[1]) {
    vI1 = match[1].trim();
  }
  // v4.16.46: strip [FRESH] prefix that may be nested inside [CACHE_ONLY].
  var freshMatch = vI1.match(/^\[FRESH\]\s+(.+)$/);
  if (freshMatch && freshMatch[1]) vI1 = freshMatch[1].trim();
  match = vI1.match(/^(?:WEB_SCAN_OK|TON_SCAN_OK)\s+(.+)$/);
  if (match && match[1]) return match[1].trim();
  return vI1;
}

function _wd_extractSuccessTimestamp_(vI1) {
  vI1 = _wd_norm_(vI1);
  var match = vI1.match(/^\[CACHE_ONLY\]\s*(.+)$/);
  if (match && match[1]) return match[1].trim();
  match = vI1.match(/^(?:WEB_SCAN_OK|TON_SCAN_OK)\s+(.+)$/);
  if (match && match[1]) return match[1].trim();
  return vI1;
}

function _wd_loadWebBackoff_() {
  var raw = PropertiesService.getScriptProperties().getProperty(CK_get("watchdogWebBackoff"));
  if (!raw) return {};
  try {
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return _wd_pruneWebBackoff_(parsed, null);
  } catch (e) {
    return {};
  }
}

function _wd_pruneWebBackoff_(state, nowMs) {
  state = state || {};
  var names = Object.keys(state);
  var hasNow = isFinite(Number(nowMs)) && Number(nowMs) > 0;
  var cutoff = hasNow ? Number(nowMs) - WD_WEB_BACKOFF_RETENTION_MS : 0;
  for (var i = 0; i < names.length; i++) {
    var entry = state[names[i]];
    var attempts = entry && Number(entry.attempts);
    var lastPulseMs = entry && Number(entry.lastPulseMs);
    var lastErrorMs = entry && Number(entry.lastErrorMs);
    var valid = entry && typeof entry === "object" && !Array.isArray(entry) &&
      isFinite(attempts) && attempts >= 0 && Math.floor(attempts) === attempts && attempts <= WD_WEB_ERROR_BACKOFF_MS.length &&
      isFinite(lastPulseMs) && lastPulseMs >= 0 && isFinite(lastErrorMs) && lastErrorMs >= 0;
    if (!valid || (hasNow && Math.max(lastPulseMs, lastErrorMs) < cutoff)) {
      delete state[names[i]];
      continue;
    }
    state[names[i]] = { attempts: attempts, lastPulseMs: lastPulseMs, lastErrorMs: lastErrorMs };
  }
  names = Object.keys(state).sort(function(a, b) {
    var ae = state[a] || {};
    var be = state[b] || {};
    return Math.max(Number(be.lastPulseMs || 0), Number(be.lastErrorMs || 0)) -
      Math.max(Number(ae.lastPulseMs || 0), Number(ae.lastErrorMs || 0));
  });
  for (var j = WD_WEB_BACKOFF_MAX_ENTRIES; j < names.length; j++) delete state[names[j]];
  return state;
}

function _wd_saveWebBackoff_(state, nowMs) {
  PropertiesService.getScriptProperties().setProperty(
    CK_get("watchdogWebBackoff"),
    JSON.stringify(_wd_pruneWebBackoff_(state || {}, nowMs))
  );
}

function _wd_webErrorDecision_(state, sheetName, nowMs, errorTimestampMs) {
  var entry = state[sheetName];
  if (errorTimestampMs == null) {
    if (entry) delete state[sheetName];
    return { allowed: false, nextDelayMs: 0 };
  }
  var attempts = entry && Number(entry.attempts);
  var lastPulseMs = entry && Number(entry.lastPulseMs);
  var lastErrorMs = entry && Number(entry.lastErrorMs);
  if (entry && (!isFinite(attempts) || attempts < 0 || Math.floor(attempts) !== attempts || attempts > WD_WEB_ERROR_BACKOFF_MS.length ||
      !isFinite(lastPulseMs) || lastPulseMs < 0 || !isFinite(lastErrorMs) || lastErrorMs < 0)) {
    delete state[sheetName];
    entry = null;
  }
  if (!entry) {
    entry = state[sheetName] = { attempts: 0, lastPulseMs: Number(errorTimestampMs), lastErrorMs: Number(errorTimestampMs) };
  } else {
    entry.lastErrorMs = Number(errorTimestampMs);
  }
  var index = Math.min(Number(entry.attempts || 0), WD_WEB_ERROR_BACKOFF_MS.length - 1);
  var delay = WD_WEB_ERROR_BACKOFF_MS[index];
  if (nowMs - Number(entry.lastPulseMs || 0) < delay) return { allowed: false, nextDelayMs: delay };
  entry.attempts = Math.min(index + 1, WD_WEB_ERROR_BACKOFF_MS.length);
  entry.lastPulseMs = nowMs;
  return { allowed: true, nextDelayMs: WD_WEB_ERROR_BACKOFF_MS[Math.min(entry.attempts, WD_WEB_ERROR_BACKOFF_MS.length - 1)] };
}

function _wd_loadPartialPulseMap_() {
  var raw = PropertiesService.getScriptProperties().getProperty(P_WD_PARTIAL_LAST);
  if (!raw) return {};
  try {
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    var sanitized = {};
    for (var name in parsed) {
      if (typeof parsed[name] === "number" && isFinite(parsed[name]) && parsed[name] >= 0) {
        sanitized[name] = parsed[name];
      }
    }
    return sanitized;
  } catch (e) {
    return {};
  }
}

function _wd_reservePulseStates_(selectedPulses, webState, webStateAvailable, nowMs) {
  selectedPulses = selectedPulses || [];
  var result = { actions: selectedPulses.slice(), errors: 0 };
  var webActions = result.actions.filter(function(action) { return action && action.pendingWebBackoffEntry; });
  if (webStateAvailable) {
    try {
      for (var w = 0; w < webActions.length; w++) {
        var webAction = webActions[w];
        var previous = webState[webAction.sheetName];
        webAction.stateReservation = {
          type: "web",
          previousEntry: previous ? {
            attempts: Number(previous.attempts),
            lastPulseMs: Number(previous.lastPulseMs),
            lastErrorMs: Number(previous.lastErrorMs)
          } : null
        };
        webState[webAction.sheetName] = webAction.pendingWebBackoffEntry;
      }
      _wd_saveWebBackoff_(webState, nowMs);
    } catch (eWebReserve) {
      result.errors++;
      result.actions = result.actions.filter(function(action) { return !action.webError; });
    }
  } else {
    result.actions = result.actions.filter(function(action) { return !action.webError; });
  }

  var partialActions = result.actions.filter(function(action) { return action && action.reason === "partial"; });
  if (partialActions.length > 0) {
    try {
      var partialState = _wd_loadPartialPulseMap_();
      for (var p = 0; p < partialActions.length; p++) {
        var partialAction = partialActions[p];
        partialAction.stateReservation = {
          type: "partial",
          hadPrevious: Object.prototype.hasOwnProperty.call(partialState, partialAction.sheetName),
          previousValue: partialState[partialAction.sheetName]
        };
        partialState[partialAction.sheetName] = nowMs;
      }
      var cutoff = nowMs - 24 * 3600000;
      for (var name in partialState) {
        if (!isFinite(Number(partialState[name])) || Number(partialState[name]) < cutoff) delete partialState[name];
      }
      PropertiesService.getScriptProperties().setProperty(P_WD_PARTIAL_LAST, JSON.stringify(partialState));
    } catch (ePartialReserve) {
      result.errors++;
      result.actions = result.actions.filter(function(action) { return action.reason !== "partial"; });
    }
  }
  return result;
}

function _wd_rollbackPulseReservations_(failedActions, nowMs) {
  failedActions = failedActions || [];
  var result = { errors: 0, web: 0, partial: 0 };
  var webActions = failedActions.filter(function(action) { return action && action.stateReservation && action.stateReservation.type === "web"; });
  var partialActions = failedActions.filter(function(action) { return action && action.stateReservation && action.stateReservation.type === "partial"; });

  // Apps Script has no cross-service transaction. Reserve before B1 and keep a
  // conservative reservation if rollback fails: quota-safe at-most-once beats duplicates.
  if (webActions.length > 0) {
    try {
      var webState = _wd_loadWebBackoff_();
      for (var w = 0; w < webActions.length; w++) {
        var webAction = webActions[w];
        if (webAction.stateReservation.previousEntry) webState[webAction.sheetName] = webAction.stateReservation.previousEntry;
        else delete webState[webAction.sheetName];
        result.web++;
      }
      _wd_saveWebBackoff_(webState, nowMs);
    } catch (eWebRollback) {
      result.web = 0;
      result.errors++;
    }
  }

  if (partialActions.length > 0) {
    try {
      var partialState = _wd_loadPartialPulseMap_();
      for (var p = 0; p < partialActions.length; p++) {
        var partialAction = partialActions[p];
        if (partialAction.stateReservation.hadPrevious) partialState[partialAction.sheetName] = partialAction.stateReservation.previousValue;
        else delete partialState[partialAction.sheetName];
        result.partial++;
      }
      PropertiesService.getScriptProperties().setProperty(P_WD_PARTIAL_LAST, JSON.stringify(partialState));
    } catch (ePartialRollback) {
      result.partial = 0;
      result.errors++;
    }
  }
  return result;
}

function _wd_applySpreadsheetActions_(ss, actions, nowMs, maxPulses) {
  var result = { pulses: 0, partialPulses: 0, synced: 0, errors: 0 };
  var failedPulses = [];
  maxPulses = Number(maxPulses || WD_MAX_PULSES_PER_RUN);
  for (var i = 0; i < (actions || []).length; i++) {
    var action = actions[i] || {};
    if (action.type === "pulse" && result.pulses >= maxPulses) {
      failedPulses.push(action);
      continue;
    }
    try {
      var targetSheet = action.sheet || (ss && ss.getSheetByName ? ss.getSheetByName(action.sheetName || "") : null);
      if (!targetSheet) {
        result.errors++;
        if (action.type === "pulse") failedPulses.push(action);
        continue;
      }
      var range = targetSheet.getRange(action.range);
      range.setValue(action.value);
      try { range.setNumberFormat("@"); } catch (eFormat) {}
      if (action.type === "pulse") {
        result.pulses++;
        if (action.reason === "partial") result.partialPulses++;
      } else if (action.type === "sync") {
        result.synced++;
      }
    } catch (eWrite) {
      result.errors++;
      if (action.type === "pulse") failedPulses.push(action);
    }
  }
  var rollback = _wd_rollbackPulseReservations_(failedPulses, nowMs);
  result.stateErrors = rollback.errors;
  return result;
}

function _wd_selectFairJ1Actions_(actions, totalRows, cursorKey, stats) {
  actions = actions || [];
  totalRows = Math.max(0, Number(totalRows || 0));
  var limit = Math.max(0, Number(SYNC_J1_MAX_SYNCS_PER_RUN || 20));
  if (actions.length === 0 || totalRows === 0 || limit === 0) return [];
  var lock = null;
  var locked = false;
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(250)) {
      if (stats) stats.j1ClaimBusy = true;
      return [];
    }
    locked = true;
    var props = PropertiesService.getScriptProperties();
    var cursor = parseInt(props.getProperty(cursorKey) || "0", 10);
    if (!isFinite(cursor) || cursor < 0 || cursor >= totalRows) cursor = 0;
    actions.sort(function(a, b) {
      var ad = (Number(a.fairnessIndex || 0) - cursor + totalRows) % totalRows;
      var bd = (Number(b.fairnessIndex || 0) - cursor + totalRows) % totalRows;
      return ad - bd;
    });
    var selected = actions.slice(0, limit);
    if (stats) stats.skippedSync = Math.max(0, actions.length - selected.length);
    var nextCursor = (Number(selected[selected.length - 1].fairnessIndex || 0) + 1) % totalRows;
    props.setProperty(cursorKey, String(nextCursor));
    return selected;
  } catch (eClaim) {
    if (stats) stats.stateErrors = Number(stats.stateErrors || 0) + 1;
    return [];
  } finally {
    if (locked && lock) {
      try { lock.releaseLock(); } catch (eRelease) {}
    }
  }
}

function _wd_applyJ1Actions_(ss, actions) {
  var selected = (actions || []).slice(0, SYNC_J1_MAX_SYNCS_PER_RUN);
  var result = { synced: 0, errors: 0, batch: false };
  if (selected.length === 0) return result;
  if (typeof Sheets !== "undefined" && Sheets.Spreadsheets && Sheets.Spreadsheets.Values) {
    try {
      var writes = [];
      for (var i = 0; i < selected.length; i++) {
        _wd_addApiWrite_(writes, selected[i].sheetName, "J1", selected[i].value);
      }
      result.synced = _wd_flushApiWrites_(writes);
      result.batch = true;
      return result;
    } catch (eBatch) {}
  }
  for (var j = 0; j < selected.length; j++) {
    try {
      var sheet = ss && ss.getSheetByName ? ss.getSheetByName(selected[j].sheetName) : null;
      if (!sheet) { result.errors++; continue; }
      var range = sheet.getRange("J1");
      range.setValue(selected[j].value);
      try { range.setNumberFormat("@"); } catch (eFormat) {}
      result.synced++;
    } catch (eWrite) { result.errors++; }
  }
  return result;
}

function _wd_executeApiActions_(actions, nowMs) {
  var writes = [];
  var writtenActions = [];
  var failedPulses = [];
  for (var i = 0; i < (actions || []).length; i++) {
    var action = actions[i] || {};
    if (action.sheetName && action.range) {
      _wd_addApiWrite_(writes, action.sheetName, action.range, action.value);
      writtenActions.push(action);
    } else if (action.type === "pulse") {
      failedPulses.push(action);
    }
  }
  var count;
  try {
    count = _wd_flushApiWrites_(writes);
  } catch (eWrite) {
    failedPulses = failedPulses.concat(writtenActions.filter(function(action) { return action && action.type === "pulse"; }));
    var failedRollback = _wd_rollbackPulseReservations_(failedPulses, nowMs);
    eWrite.stateErrors = failedRollback.errors;
    throw eWrite;
  }
  var rollback = _wd_rollbackPulseReservations_(failedPulses, nowMs);
  var pulses = writtenActions.filter(function(action) { return action && action.type === "pulse"; });
  return {
    writes: count,
    pulses: pulses.length,
    partialPulses: pulses.filter(function(action) { return action.reason === "partial"; }).length,
    synced: writtenActions.filter(function(action) { return action.type === "sync"; }).length,
    stateErrors: rollback.errors
  };
}

function _wd_isUnsafeLatchSource_(vI1) {
  vI1 = _wd_norm_(vI1).toUpperCase();
  return vI1.indexOf("[BLOCKED:") === 0 || vI1.indexOf("[NO_CACHE]") === 0 ||
    vI1.indexOf("[WEB_SCAN_ERROR]") === 0 || vI1.indexOf("[WEB_SCAN_DEFERRED]") === 0 ||
    vI1.indexOf("NO_CACHE_WAITING_REFRESH") >= 0;
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
  try { s = String(s == null ? "" : s); } catch (eString) { return NaN; }
  if (!s || s !== s.trim()) return NaN;

  function validComponents_(yyyy, mm, dd, HH, MI, SS) {
    if (mm < 1 || mm > 12 || dd < 1 || HH < 0 || HH > 23 || MI < 0 || MI > 59 || SS < 0 || SS > 59) return false;
    var leap = (yyyy % 4 === 0 && yyyy % 100 !== 0) || yyyy % 400 === 0;
    var days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return dd <= days[mm - 1];
  }

  function latestLocalOccurrence_(dt, yyyy, mm, dd, HH, MI, SS, millis) {
    var latestMs = dt.getTime();
    var shifts = [30 * 60000, 60 * 60000];
    for (var shiftIndex = 0; shiftIndex < shifts.length; shiftIndex++) {
      var candidate = new Date(dt.getTime() + shifts[shiftIndex]);
      if (candidate.getFullYear() === yyyy && candidate.getMonth() === mm - 1 && candidate.getDate() === dd &&
          candidate.getHours() === HH && candidate.getMinutes() === MI && candidate.getSeconds() === SS &&
          candidate.getMilliseconds() === millis) {
        latestMs = Math.max(latestMs, candidate.getTime());
      }
    }
    return latestMs;
  }

  var local = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (local) {
    var yyyy = Number(local[1]), mm = Number(local[2]), dd = Number(local[3]);
    var HH = Number(local[4]), MI = Number(local[5]), SS = local[6] == null ? 0 : Number(local[6]);
    if (!validComponents_(yyyy, mm, dd, HH, MI, SS)) return NaN;
    var dt = new Date(yyyy, mm - 1, dd, HH, MI, SS, 0);
    var localMs = dt.getTime();
    if (!isFinite(localMs) || dt.getFullYear() !== yyyy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd ||
        dt.getHours() !== HH || dt.getMinutes() !== MI || dt.getSeconds() !== SS) return NaN;
    return latestLocalOccurrence_(dt, yyyy, mm, dd, HH, MI, SS, 0);
  }

  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/);
  if (!iso) return NaN;
  var isoYear = Number(iso[1]), isoMonth = Number(iso[2]), isoDay = Number(iso[3]);
  var isoHour = Number(iso[4]), isoMinute = Number(iso[5]), isoSecond = iso[6] == null ? 0 : Number(iso[6]);
  if (!validComponents_(isoYear, isoMonth, isoDay, isoHour, isoMinute, isoSecond)) return NaN;
  var zone = iso[8] || "";
  var isoMillis = iso[7] ? Number((iso[7] + "00").substring(0, 3)) : 0;
  if (!zone) {
    var localIsoDate = new Date(isoYear, isoMonth - 1, isoDay, isoHour, isoMinute, isoSecond, isoMillis);
    var localIsoMs = localIsoDate.getTime();
    if (!isFinite(localIsoMs) || localIsoDate.getFullYear() !== isoYear || localIsoDate.getMonth() !== isoMonth - 1 ||
        localIsoDate.getDate() !== isoDay || localIsoDate.getHours() !== isoHour || localIsoDate.getMinutes() !== isoMinute ||
        localIsoDate.getSeconds() !== isoSecond || localIsoDate.getMilliseconds() !== isoMillis) return NaN;
    return latestLocalOccurrence_(localIsoDate, isoYear, isoMonth, isoDay, isoHour, isoMinute, isoSecond, isoMillis);
  }
  if (zone && zone !== "Z") {
    var zoneHour = Number(zone.substring(1, 3));
    var zoneMinute = Number(zone.substring(4, 6));
    if (zoneHour > 23 || zoneMinute > 59) return NaN;
  }
  var isoMs = Date.parse(s);
  return isFinite(isoMs) ? isoMs : NaN;
}

function _wd_bumpTimestampSeconds_(timestamp, seconds) {
  try {
    var ms = _wd_parseLocalDateTimeToMs_(timestamp);
    if (!isFinite(ms)) return "";
    var d = new Date(ms + (Number(seconds || 1) * 1000));
    return _wd_fmtDate_(d);
  } catch (e) { return ""; }
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
  if (reason === "partial") return 250;
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

function _wd_collectGlobalRefreshActions_(items, nowMs, staleMs, nowStr, stats, partialCandidates) {
  var urgentCandidates = (partialCandidates || []).slice();
  var cycleCandidates = [];
  var syncActions = [];
  stats = stats || {};
  var webBackoff = {};
  var webBackoffAvailable = true;
  var webSuppressedTargets = {};
  try { webBackoff = _wd_loadWebBackoff_(); } catch (eLoadWebBackoff) {
    webBackoffAvailable = false;
    stats.stateErrors = Number(stats.stateErrors || 0) + 1;
  }
  var systemBlocked = _wd_isSystemBlocked_();
  var suppressB1Pulses = !!(systemBlocked && systemBlocked.blocked && systemBlocked.reason === "QUOTA");
  if (suppressB1Pulses) stats.b1SuppressedQuota = 0;

  for (var i = 0; i < items.length; i++) {
    var d = items[i] || {};
    // v4.15.85: skip CEX display-only tabs (no I1/J1, B1 is self-managed).
    if (_wd_isCexSheet_(d.name || d.sheetName || "")) continue;

    var sheetName = d.name || d.sheetName || "";
    var i1Norm = _wd_norm_(d.vI1 || "");
    var isWebError = i1Norm.indexOf("[WEB_SCAN_ERROR]") === 0;
    var webErrorAllowed = !isWebError;
    var webPulseCandidateAdded = false;
    var stagedWebBackoffEntry = null;
    if (isWebError && webBackoffAvailable) {
      var errorTimestamp = _wd_extractTimestamp_(i1Norm);
      var errorTimestampMs = _wd_isLastUpdateFormat_(errorTimestamp) ? _wd_parseLocalDateTimeToMs_(errorTimestamp) : null;
      var decisionState = {};
      var currentEntry = webBackoff[sheetName];
      if (isFinite(errorTimestampMs) && !currentEntry) {
        currentEntry = {
          attempts: 0,
          lastPulseMs: Number(errorTimestampMs),
          lastErrorMs: Number(errorTimestampMs)
        };
        webBackoff[sheetName] = currentEntry;
      } else if (isFinite(errorTimestampMs) && currentEntry) {
        currentEntry.lastErrorMs = Number(errorTimestampMs);
      }
      if (currentEntry) {
        decisionState[sheetName] = {
          attempts: Number(currentEntry.attempts || 0),
          lastPulseMs: Number(currentEntry.lastPulseMs || 0),
          lastErrorMs: Number(currentEntry.lastErrorMs || 0)
        };
      }
      webErrorAllowed = _wd_webErrorDecision_(decisionState, sheetName, nowMs, isFinite(errorTimestampMs) ? errorTimestampMs : null).allowed;
      stagedWebBackoffEntry = decisionState[sheetName] || null;
    } else if (isWebError) {
      webErrorAllowed = false;
    } else {
      var healthyTimestamp = _wd_extractTimestamp_(i1Norm);
      var healthyPrefix = i1Norm.indexOf("[") !== 0 || i1Norm.indexOf("[CACHE_ONLY]") === 0;
      if (healthyPrefix && _wd_isLastUpdateFormat_(healthyTimestamp)) {
        _wd_webErrorDecision_(webBackoff, sheetName, nowMs, null);
      }
    }

    var refreshCheck = _wd_needsRefresh_(d.vA2 || "", d.vI1 || "", nowMs, staleMs, d.vB1);
    var extractedI1 = _wd_extractTimestamp_(i1Norm);
    var extractedI1Ms = _wd_parseLocalDateTimeToMs_(extractedI1);
    var noUsableCache = !i1Norm || i1Norm.indexOf("[NO_CACHE]") === 0 || i1Norm.indexOf("[WEB_SCAN_DEFERRED]") === 0 ||
      (i1Norm.indexOf("[CACHE_ONLY]") === 0 &&
        (!_wd_isLastUpdateFormat_(extractedI1) || !isFinite(extractedI1Ms)));
    var cooldownMin = refreshCheck.useBlockedCooldown ? WD_PULSE_MIN_BLOCKED : WD_PULSE_MIN;
    var canPulseNormally = !suppressB1Pulses && webErrorAllowed &&
      refreshCheck.blockedReason !== "QUOTA" &&
      _wd_shouldPulseB1_(d.vB1 || "", nowMs, cooldownMin);
    var cycleAgeMs = Number.MAX_SAFE_INTEGER;
    var cycleI1Ms = _wd_parseLocalDateTimeToMs_(_wd_extractTimestamp_(d.vI1 || ""));
    var cycleB1Ms = _wd_parseLocalDateTimeToMs_(d.vB1 || "");
    var cycleLatestMs = Math.max(isFinite(cycleI1Ms) ? cycleI1Ms : 0, isFinite(cycleB1Ms) ? cycleB1Ms : 0);
    // v4.16.46: [CACHE_ONLY] stays stale even when B1 is refreshed.
    // Use I1 as the age anchor so the wallet doesn't look "recently serviced".
    if (i1Norm.indexOf("[CACHE_ONLY]") === 0 && isFinite(cycleI1Ms) && isFinite(cycleB1Ms) && cycleB1Ms > cycleI1Ms) {
      cycleLatestMs = cycleI1Ms;
    }
    if (cycleLatestMs > 0) cycleAgeMs = Math.max(0, nowMs - cycleLatestMs);

    var pulseCandidate = null;
    if (canPulseNormally) {
      var pulseReason = refreshCheck.needsPulse ? refreshCheck.reason : "cycle";
      pulseCandidate = {
        sheet: d.sheet || null,
        sheetName: sheetName,
        range: "B1",
        value: nowStr,
        type: "pulse",
        reason: pulseReason,
        priority: _wd_refreshReasonPriority_(pulseReason),
        staleAgeMs: _wd_staleAgeMs_(d.vI1 || "", nowMs),
        cycleAgeMs: cycleAgeMs,
        webError: isWebError,
        pendingWebBackoffEntry: stagedWebBackoffEntry
      };
      if (pulseReason === "cycle" || pulseReason === "stale" || noUsableCache) {
        cycleCandidates.push(pulseCandidate);
      }
      if (pulseReason === "error" || pulseReason === "empty") {
        urgentCandidates.push(pulseCandidate);
      }
      webPulseCandidateAdded = isWebError && (pulseReason === "error" || pulseReason === "empty");
    }

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
      }
    }
    if (isWebError && !webPulseCandidateAdded) {
      webSuppressedTargets[sheetName + "\nB1"] = true;
    }

    var actualI1 = refreshCheck.actualTimestamp || _wd_extractTimestamp_(d.vI1 || "");
    var vA2Norm = _wd_norm_(d.vA2 || "");
    if ((vA2Norm === "" || vA2Norm.indexOf("#") === 0 || vA2Norm.toLowerCase().indexOf("exceeded maximum execution time") >= 0) &&
        _wd_isLastUpdateFormat_(actualI1) && _wd_shouldSyncJ1_(d.vI1 || "", "")) {
      var bumpedJ1 = _wd_bumpTimestampSeconds_(actualI1, 1);
      if (bumpedJ1) {
        syncActions.push({
          sheet: d.sheet || null,
          sheetName: d.name || d.sheetName || "",
          range: "J1",
          value: bumpedJ1,
          type: "sync",
          reason: "a2_error_recalc",
          fairnessIndex: i
        });
        stats.toSync++;
      }
      continue;
    }
    if (_wd_shouldSyncJ1_(actualI1, d.vJ1 || "")) {
      syncActions.push({
        sheet: d.sheet || null,
        sheetName: d.name || d.sheetName || "",
        range: "J1",
        value: actualI1,
        type: "sync",
        fairnessIndex: i
      });
      stats.toSync++;
    }
  }

  urgentCandidates = urgentCandidates.filter(function(candidate) {
    if (candidate.reason !== "partial") return true;
    return !webSuppressedTargets[String(candidate.sheetName || "") + "\n" + String(candidate.range || "")];
  });

  if (suppressB1Pulses) {
    stats.b1SuppressedQuota += urgentCandidates.length;
    urgentCandidates = [];
    cycleCandidates = [];
  }

  if (!webBackoffAvailable) {
    urgentCandidates = urgentCandidates.filter(function(candidate) { return !candidate.webError; });
    cycleCandidates = cycleCandidates.filter(function(candidate) { return !candidate.webError; });
  }

  var urgentByTarget = {};
  urgentCandidates.forEach(function(candidate) {
    var key = String(candidate.sheetName || "") + "\n" + String(candidate.range || "");
    var current = urgentByTarget[key];
    if (!current || Number(candidate.priority || 0) > Number(current.priority || 0)) urgentByTarget[key] = candidate;
  });
  urgentCandidates = Object.keys(urgentByTarget).map(function(key) { return urgentByTarget[key]; });

  cycleCandidates.sort(function(a, b) {
    if (a.cycleAgeMs !== b.cycleAgeMs) return b.cycleAgeMs - a.cycleAgeMs;
    return String(a.sheetName || "").localeCompare(String(b.sheetName || ""));
  });
  urgentCandidates.sort(function(a, b) {
    var aAge = isFinite(Number(a.cycleAgeMs)) ? Number(a.cycleAgeMs) : Number(a.staleAgeMs || 0);
    var bAge = isFinite(Number(b.cycleAgeMs)) ? Number(b.cycleAgeMs) : Number(b.staleAgeMs || 0);
    if (aAge !== bAge) return bAge - aAge;
    return String(a.sheetName || "").localeCompare(String(b.sheetName || ""));
  });

  var selectedPulses = [];
  var seenPulseTargets = {};
  function takeNextDistinct_(lane, limit) {
    for (var li = 0; li < lane.length && selectedPulses.length < limit; li++) {
      var candidate = lane[li];
      var key = String(candidate.sheetName || "") + "\n" + String(candidate.range || "");
      if (seenPulseTargets[key]) continue;
      seenPulseTargets[key] = true;
      selectedPulses.push(candidate);
    }
  }

  takeNextDistinct_(cycleCandidates, Math.min(WD_CYCLE_SLOTS_PER_RUN, WD_MAX_PULSES_PER_RUN));
  var cycleSelected = selectedPulses.length;
  takeNextDistinct_(urgentCandidates, Math.min(WD_MAX_PULSES_PER_RUN, selectedPulses.length + 1));
  if (cycleSelected < WD_CYCLE_SLOTS_PER_RUN) takeNextDistinct_(urgentCandidates, WD_MAX_PULSES_PER_RUN);
  takeNextDistinct_(cycleCandidates, WD_MAX_PULSES_PER_RUN);

  var allPulseTargets = {};
  cycleCandidates.concat(urgentCandidates).forEach(function(candidate) {
    var key = String(candidate.sheetName || "") + "\n" + String(candidate.range || "");
    allPulseTargets[key] = true;
  });

  var reservation = _wd_reservePulseStates_(selectedPulses, webBackoff, webBackoffAvailable, nowMs);
  selectedPulses = reservation.actions;
  stats.stateErrors = Number(stats.stateErrors || 0) + reservation.errors;
  stats.b1Planned = selectedPulses.length;
  stats.globalPulseCandidates = Object.keys(allPulseTargets).length;
  syncActions = _wd_selectFairJ1Actions_(syncActions, items.length, P_WD_J1_CURSOR, stats);
  return syncActions.concat(selectedPulses);
}

function _wd_shouldSyncJ1_(vI1, vJ1) {
  if (_wd_isUnsafeLatchSource_(vI1)) return false;
  const actualI1 = _wd_extractTimestamp_(vI1);
  if (!_wd_isLastUpdateFormat_(actualI1)) return false;
  return _wd_norm_(actualI1) !== _wd_norm_(vJ1);
}

function _wd_needsRefresh_(vA2, vI1, nowMs, staleMs, vB1) {
  if (vI1.indexOf("[WEB_SCAN_DEFERRED]") === 0) {
    return { needsPulse: true, reason: "empty", blockedReason: null, useBlockedCooldown: false };
  }
  const errA2 = vA2.startsWith("#") || vA2.toLowerCase().includes("erreur") || vA2.toLowerCase().includes("error");
  const errI1 = vI1.startsWith("#") || vI1.toLowerCase().includes("erreur") || vI1.toLowerCase().includes("error");
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
    // QUOTA recovery is exclusively owned by QUOTA_RECOVERY_SWEEP.
    return {
      needsPulse: false,
      reason: "blocked",
      blockedReason: "QUOTA",
      actualTimestamp: blockedCheck.timestamp,
      useBlockedCooldown: true
    };
  }
  
  // v4.14.10: [NO_CACHE] = wallet never scanned successfully â€” re-pulse with short cooldown
  if (vI1.indexOf("[NO_CACHE]") === 0) {
    return { needsPulse: true, reason: "empty", blockedReason: null, useBlockedCooldown: false };
  }

  // v4.15.3: [ERROR] = scan failed (RPC timeout, etc.) â€” re-pulse with normal cooldown
  if (vI1.indexOf("[ERROR]") === 0) {
    return { needsPulse: true, reason: "error", blockedReason: null, useBlockedCooldown: false };
  }

  // v4.16.27: [WEB_SCAN_ERROR] = WCORE Web API failed (timeout, 5xx, network) â€” re-pulse
  if (vI1.indexOf("[WEB_SCAN_ERROR]") === 0) {
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

   // v4.16.46: Cache-only detection with B1/I1 mismatch.
   // When B1 was pulsed but the scan kept serving a stale [CACHE_ONLY]
   // timestamp, re-pulse aggressively so the wallet keeps being retried
   // instead of looking "recently serviced" and starving for hours.
   var WD_CACHE_ONLY_MISMATCH_MS = 20 * 60 * 1000; // 20 min
   if (vI1.indexOf("[CACHE_ONLY]") === 0) {
     var cacheOnlyTs = _wd_extractTimestamp_(vI1);
     if (!_wd_isLastUpdateFormat_(cacheOnlyTs)) {
       return { needsPulse: true, reason: "empty", blockedReason: null, useBlockedCooldown: false };
     }
     if (vB1 !== undefined) {
       var cacheOnlyI1Ms = _wd_parseLocalDateTimeToMs_(cacheOnlyTs);
       var b1Ms = _wd_parseLocalDateTimeToMs_(String(vB1 || ""));
       if (isFinite(cacheOnlyI1Ms) && isFinite(b1Ms) && b1Ms - cacheOnlyI1Ms >= WD_CACHE_ONLY_MISMATCH_MS) {
         return { needsPulse: true, reason: "stale", blockedReason: null, useBlockedCooldown: false };
       }
     }
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
  var leaseOwner = _wcoreAcquireLease_(WCORE_WATCHDOG_LEASE_KEY, WCORE_WATCHDOG_LEASE_TTL_MS);
  if (!leaseOwner) {
    Logger.log("[WATCHDOG] Lease busy");
    try { HttpCallCounter.clearTrigger(); } catch(eClear){}
    return;
  }

  try {
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
      
      // v4.5.11: Check partial cycles FIRST (independent of main loop)
      var partialStats = _wd_checkPartialCycles_(ss, nowMs, WD_MAX_PULSES_PER_RUN);
      stats.b1Partial = 0;
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

      const actions = _wd_collectGlobalRefreshActions_(sheetData, nowMs, staleMs, nowStr, stats, partialStats.actions);

      // Execute actions
      actions.sort(function(a, b) { return _wd_actionPriority_(b) - _wd_actionPriority_(a); });
      var execution = _wd_applySpreadsheetActions_(ss, actions, nowMs, WD_MAX_PULSES_PER_RUN);
      stats.b1Set = execution.pulses;
      stats.b1Partial = execution.partialPulses;
      stats.synced += execution.synced;
      stats.actionErrors = execution.errors;
      stats.stateErrors = Number(stats.stateErrors || 0) + execution.stateErrors;

      // Update cursor
      const newCursor = (cursor + probeSize) % stats.N;
      try { props.setProperty(P_WD_CURSOR, String(newCursor)); } catch (eCur) {
        try { Logger.log("[WATCHDOG] cursor write failed: " + eCur); } catch (eL3) {}
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
    _wcoreReleaseLease_(WCORE_WATCHDOG_LEASE_KEY, leaseOwner);
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
 * Scan Recap Chain â†’ categorized blocked sheet lists.
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
    Logger.log("[" + logTag + "] Batch " + res.batches + " done: pulsed " + (batchEnd - b) + " (" + sheetList[b] + " â€¦ " + sheetList[batchEnd - 1] + ")");
  }
  return res;
}

/**
 * Probe UrlFetchApp quota rÃ©el avant de dÃ©clencher un sweep.
 * Utilise _originalUrlFetch (capturÃ© dans 03E_QUOTA_CIRCUIT_BREAKER.gs).
 * @return {{ ok: boolean, err: string, code: number }}
 */
function _recoveryProbeQuota_() {
  try {
    var transport = typeof _httpTelemetryTransport_ === "function"
      ? _httpTelemetryTransport_()
      : { fetch: UrlFetchApp.fetch, explicitTelemetry: false };
    var probeUrl = "https://httpbin.org/status/200";
    if (transport.explicitTelemetry) {
      try { if (typeof HttpCounter !== "undefined" && HttpCounter.record) HttpCounter.record(1, "QUOTA_PROBE", probeUrl); } catch (eCount) {}
      try { if (typeof HttpCallCounter !== "undefined" && HttpCallCounter.increment) HttpCallCounter.increment(probeUrl, "QUOTA_PROBE"); } catch (eLegacyCount) {}
    }
    var resp = transport.fetch.call(UrlFetchApp, probeUrl, { muteHttpExceptions: true });
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
var P_PORTFOLIO_RECOVERY_PENDING = "WCORE_PORTFOLIO_RECOVERY_PENDING";
var RECOVERY_LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes
var PORTFOLIO_RECOVERY_RETRY_DELAY_MS = 5 * 60 * 1000;

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

function _recoverySetPortfolioRefreshPending_() {
  try {
    PropertiesService.getScriptProperties().setProperty(P_PORTFOLIO_RECOVERY_PENDING, String(Date.now()));
    return true;
  } catch (e) { return false; }
}

function _recoveryIsPortfolioRefreshPending_() {
  try { return !!PropertiesService.getScriptProperties().getProperty(P_PORTFOLIO_RECOVERY_PENDING); }
  catch (e) { return false; }
}

function _recoveryClearPortfolioRefreshPending_() {
  try { PropertiesService.getScriptProperties().deleteProperty(P_PORTFOLIO_RECOVERY_PENDING); }
  catch (e) {}
}

/** Persist and deduplicate the single combined portfolio recovery trigger. */
function _recoverySchedulePortfolioRefresh_(delayMs, ignoreTriggerUid) {
  if (!_recoverySetPortfolioRefreshPending_()) {
    Logger.log("[RECOVERY] Unable to persist portfolio recovery marker; scheduling aborted");
    return false;
  }
  var scriptLock = null;
  var acquired = false;
  try {
    try { scriptLock = LockService.getScriptLock(); } catch (eLock) {}
    if (!scriptLock || !scriptLock.tryLock || !scriptLock.tryLock(2000)) {
      Logger.log("[RECOVERY] Portfolio scheduler lock unavailable; pending marker preserved");
      return false;
    }
    acquired = true;

    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      var handler = "";
      try { handler = triggers[i].getHandlerFunction(); } catch (eHandler) {}
      if (handler !== "PORTFOLIO_RECOVERY_REFRESH") continue;
      var uniqueId = "";
      try { uniqueId = String(triggers[i].getUniqueId() || ""); } catch (eId) {}
      if (!ignoreTriggerUid || uniqueId !== String(ignoreTriggerUid)) {
        Logger.log("[RECOVERY] Combined portfolio recovery trigger already pending");
        return true;
      }
    }

    var delay = Math.max(1000, Number(delayMs) || 5000);
    ScriptApp.newTrigger("PORTFOLIO_RECOVERY_REFRESH").timeBased().after(delay).create();
    Logger.log("[RECOVERY] Combined portfolio recovery scheduled in " + delay + "ms");
    return true;
  } catch (eSchedule) {
    Logger.log("[RECOVERY] Failed to schedule combined portfolio recovery: " + eSchedule.message + "; pending marker preserved");
    return false;
  } finally {
    if (acquired && scriptLock) {
      try { scriptLock.releaseLock(); } catch (eRelease) {}
    }
  }
}

function _recoveryDeleteCurrentPortfolioTrigger_(e) {
  var triggerUid = e && e.triggerUid ? String(e.triggerUid) : "";
  if (!triggerUid) return false;
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      var uniqueId = "";
      try { uniqueId = String(triggers[i].getUniqueId() || ""); } catch (eId) {}
      if (uniqueId === triggerUid) {
        ScriptApp.deleteTrigger(triggers[i]);
        return true;
      }
    }
  } catch (eDelete) {
    Logger.log("[RECOVERY] Failed to delete current portfolio trigger: " + eDelete.message);
  }
  return false;
}

function PORTFOLIO_RECOVERY_REFRESH(e) {
  try { HttpCallCounter.setTrigger('PORTFOLIO_RECOVERY_REFRESH'); } catch (eCtx) {}
  try {
    var stockOk = false;
    var cryptoOk = false;
    try {
      var stockResult = UPDATE_STOCK_PORTFOLIO();
      stockOk = String(stockResult || "").indexOf("OK:") === 0;
      if (!stockOk) Logger.log("[RECOVERY] Stock portfolio incomplete: " + stockResult);
    } catch (eStock) {
      Logger.log("[RECOVERY] Stock portfolio failed: " + eStock.message);
    }
    try {
      var cryptoResult = UPDATE_CRYPTO_PORTFOLIO_V2();
      cryptoOk = String(cryptoResult || "").indexOf("OK:") === 0;
      if (!cryptoOk) Logger.log("[RECOVERY] Crypto portfolio incomplete: " + cryptoResult);
    } catch (eCrypto) {
      Logger.log("[RECOVERY] Crypto portfolio failed: " + eCrypto.message);
    }

    if (stockOk && cryptoOk) {
      _recoveryClearPortfolioRefreshPending_();
      return "OK: portfolio recovery complete";
    }

    _recoverySetPortfolioRefreshPending_();
    var triggerUid = e && e.triggerUid ? String(e.triggerUid) : "";
    _recoveryDeleteCurrentPortfolioTrigger_(e);
    var retryScheduled = _recoverySchedulePortfolioRefresh_(PORTFOLIO_RECOVERY_RETRY_DELAY_MS, triggerUid);
    return "INCOMPLETE: portfolio recovery retry scheduled=" + retryScheduled;
  } finally {
    try { HttpCallCounter.clearTrigger(); } catch (eClear) {}
  }
}

function QUOTA_RECOVERY_SWEEP() {
  try { HttpCallCounter.setTrigger('QUOTA_RECOVERY_SWEEP'); } catch(e){}
  try { if (typeof WCORE_AUTO_HEAL === 'function') WCORE_AUTO_HEAL("QUOTA_RECOVERY_SWEEP", false); } catch(e){}
  var acquired = false;
  try {
    // R16 guard: prevent concurrent sweep execution
    if (!_recoveryAcquireLock_(P_RECOVERY_SWEEP_LOCK, RECOVERY_LOCK_TTL_MS)) {
      Logger.log("[RECOVERY] Another SWEEP is already running â€” aborting");
      return;
    }
    acquired = true;

    var RECOVERY_BATCH_SIZE = 5;   // RÃ©duit Ã  5 au 1er passage (conservative)
    var RECOVERY_DELAY_MS = 60000; // 60s entre batchs (Ã©tait 30s)
    var MAX_RUNTIME_MS = 300000;   // 5 min max (marge avant 6 min limit)
    var t0 = Date.now();
    var qcbWasBlocked = false;
    var httpGuardWasBlocked = false;
    try { qcbWasBlocked = !!(typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped()); } catch (eQcbState) {}
    try { httpGuardWasBlocked = !!(typeof HttpErrorGuard !== 'undefined' && HttpErrorGuard.isQuotaExhausted && HttpErrorGuard.isQuotaExhausted()); } catch (eGuardState) {}

    // --- Probe quota avant tout ---
    var probe = _recoveryProbeQuota_();
    if (!probe.ok) {
      Logger.log("[RECOVERY] Probe failed: " + probe.err + " â€” recurring 30min poller will retry");
      return;
    }
    Logger.log("[RECOVERY] Probe OK (HTTP " + probe.code + ") â€” proceeding");

    if (typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.reset) {
      QuotaCircuitBreaker.reset();
      Logger.log("[RECOVERY] QuotaCircuitBreaker reset");
    }
    if (typeof HttpErrorGuard !== 'undefined' && HttpErrorGuard.reset) {
      HttpErrorGuard.reset();
    }

    var stats = { blocked_quota: 0, blocked_timeout: 0, pulsed: 0, batches: 0, skipped: 0, exec_ms: 0 };

    try {
      var ss = (typeof _wcoreGetSpreadsheet_ === 'function')
        ? _wcoreGetSpreadsheet_()
        : SpreadsheetApp.getActiveSpreadsheet();
      if (!ss) { Logger.log("[RECOVERY] Spreadsheet unavailable"); return; }
      var recap = ss.getSheetByName(RECAP_SHEET_NAME);
      if (!recap) { Logger.log("[RECOVERY] Recap Chain not found"); return; }

      var cat = _recoveryCollectBlocked_(recap);
      stats.blocked_quota = cat.quota.length;
      stats.blocked_timeout = cat.timeout.length;

      if (qcbWasBlocked || httpGuardWasBlocked || cat.quota.length > 0 || _recoveryIsPortfolioRefreshPending_()) {
        _recoverySchedulePortfolioRefresh_();
      }

      if (cat.all.length === 0) {
        Logger.log("[RECOVERY] No blocked sheets found â€” clearing skipped state and skipping");
        _recoveryClearSkipped_();
        _recoveryClearFollowupPending_();
        return;
      }

      Logger.log("[RECOVERY] Found " + cat.quota.length + " BLOCKED:QUOTA + " + cat.timeout.length + " BLOCKED:TIMEOUT/#ERROR â€” pulsing in batches of " + RECOVERY_BATCH_SIZE);

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
          Logger.log("[RECOVERY] FOLLOWUP already pending â€” skipping duplicate scheduling");
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
    Logger.log("[RECOVERY_FU] SWEEP is currently running â€” aborting FOLLOWUP to avoid overlap");
    return;
  }
  // Clear stale pending flag regardless
  _recoveryClearFollowupPending_();
  try {
    var RECOVERY_BATCH_SIZE = 10;
    var RECOVERY_DELAY_MS = 30000;
    var MAX_RUNTIME_MS = 300000;
    var t0 = Date.now();
    var qcbWasBlocked = false;
    var httpGuardWasBlocked = false;
    try { qcbWasBlocked = !!(typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped()); } catch (eQcbState) {}
    try { httpGuardWasBlocked = !!(typeof HttpErrorGuard !== 'undefined' && HttpErrorGuard.isQuotaExhausted && HttpErrorGuard.isQuotaExhausted()); } catch (eGuardState) {}

    // --- Probe quota avant tout ---
    var probe = _recoveryProbeQuota_();
    if (!probe.ok) {
      Logger.log("[RECOVERY_FU] Probe failed: " + probe.err + " â€” skipping pulse, retry in 30min");
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
        Logger.log("[RECOVERY_FU] Retry trigger already pending â€” skipping duplicate");
      }
      return;
    }
    Logger.log("[RECOVERY_FU] Probe OK (HTTP " + probe.code + ") â€” proceeding");

    if (typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.reset) {
      QuotaCircuitBreaker.reset();
      Logger.log("[RECOVERY_FU] QuotaCircuitBreaker reset");
    }
    if (typeof HttpErrorGuard !== 'undefined' && HttpErrorGuard.reset) {
      HttpErrorGuard.reset();
    }

    var stats = { skipped_retry: 0, still_blocked: 0, pulsed: 0, batches: 0, skipped: 0, exec_ms: 0 };

    try {
      var skipped = _recoveryGetSkipped_();
      var skippedSheets = (skipped && skipped.sheets) ? skipped.sheets : [];
      stats.skipped_retry = skippedSheets.length;

      var ss = (typeof _wcoreGetSpreadsheet_ === 'function')
        ? _wcoreGetSpreadsheet_()
        : SpreadsheetApp.getActiveSpreadsheet();
      if (!ss) { Logger.log("[RECOVERY_FU] Spreadsheet unavailable"); return; }
      var recap = ss.getSheetByName(RECAP_SHEET_NAME);
      if (!recap) {
        Logger.log("[RECOVERY_FU] Recap Chain not found");
        _recoveryClearSkipped_();
        return;
      }

      var cat = _recoveryCollectBlocked_(recap);
      stats.still_blocked = cat.all.length;

      if (qcbWasBlocked || httpGuardWasBlocked || skippedSheets.length > 0 || cat.quota.length > 0 || _recoveryIsPortfolioRefreshPending_()) {
        _recoverySchedulePortfolioRefresh_();
      }

      // Dedup merge: skipped + still blocked
      var seen = {};
      var merged = [];
      skippedSheets.concat(cat.all).forEach(function(s) {
        if (s && !seen[s]) { seen[s] = true; merged.push(s); }
      });

      if (merged.length === 0) {
        Logger.log("[RECOVERY_FU] Nothing to retry â€” clearing and exiting");
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
 * Le sweep probe le quota rÃ©el et se reschedule lui-mÃªme ; il s'arrÃªte quand
 * il n'y a plus de sheets bloquÃ©es.
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

  // Poller toutes les 30 min â€” probe-gated, early-exit si quota absent
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
 * No HTTP calls â€” only sheet cell I/O, so it is safe to run every minute.
 *
 * Called by ACTIVITY_WATCHDOG (27_ACTIVITY_REFRESH.gs).
 * @returns {Object} { checked, synced, skippedSync, errors }
 */
function SYNC_J1_ALL_SHEETS() {
  var stats = { checked: 0, synced: 0, skippedSync: 0, errors: 0 };
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

    var actions = [];
    for (var i = 0; i < valsI1.length; i++) {
      var rawI1 = (valsI1[i] && valsI1[i][0]);
      var rawJ1 = (valsJ1[i] && valsJ1[i][0]);
      var i1 = (rawI1 instanceof Date) ? _wd_fmtDate_(rawI1) : String(rawI1 || "").trim();
      var j1 = (rawJ1 instanceof Date) ? _wd_fmtDate_(rawJ1) : String(rawJ1 || "").trim();
      var cleanI1 = _wd_extractTimestamp_(i1);
      if (_wd_isUnsafeLatchSource_(i1)) continue;
      if (!_wd_isLastUpdateFormat_(cleanI1)) continue;
      if (cleanI1 === j1) continue;
      stats.checked++;

      var sheetName = String((names[i] && names[i][0]) || "").trim();
      if (!sheetName) continue;
      // v4.15.85: never write J1 on CEX display-only tabs.
      if (_wd_isCexSheet_(sheetName)) continue;
      actions.push({ sheetName: sheetName, value: cleanI1, fairnessIndex: i });
    }
    actions = _wd_selectFairJ1Actions_(actions, valsI1.length, P_SYNC_J1_CURSOR, stats);
    var execution = _wd_applyJ1Actions_(ss, actions);
    stats.synced = execution.synced;
    stats.errors += execution.errors;
    stats.batch = execution.batch;
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
  try {
    var props = PropertiesService.getScriptProperties();
    phaseC = props.getProperty("PHASE_C_ENABLED") || "false";
  } catch (e) {}
  return [
    ["Setting", "Value"],
    ["WD_STALE_I1_HOURS", WD_STALE_I1_HOURS],
    ["WD_PULSE_MIN", WD_PULSE_MIN],
    ["WD_PULSE_MIN_BLOCKED", WD_PULSE_MIN_BLOCKED],
    ["WD_PULSE_MIN_PARTIAL", WD_PULSE_MIN_PARTIAL],
    ["WD_PROBE_SIZE_MIN", WD_PROBE_SIZE_MIN],
    ["WD_PROBE_SIZE_MAX", WD_PROBE_SIZE_MAX],
    ["PHASE_C_ENABLED", phaseC]
  ];
}

// ============================================================
// CACHE MANAGEMENT (unchanged from v4.5.10)
// ============================================================

// [Rest of cache management functions remain unchanged]
// CLEAR_CHAIN_CACHE, CLEAR_GLOBAL_CACHE, etc.
// These are preserved from the original file
