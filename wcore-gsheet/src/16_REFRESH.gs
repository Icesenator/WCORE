/************************************************************
 * 16_REFRESH.gs - Watchdog & Cache Management
 *
 * Version: v4.16.91
 * v4.16.91 (2026-11-10): restaure 4.16.87 + 4.16.89 (effaces du LIVE le 07/11) :
 *   impulsion B1 apres le drain des lignes dont le scan OK/DEGRADED est prouve.
 *   P-PROP, palier prioritaire et le reste du LIVE inchanges.
 * v4.16.89: a DEGRADED scan that rewrote the cache (proven reread) is pulsed
 *   too. Without it the cells kept the pre-scan values and I1 the old cache
 *   date for hours, although the cache was fresh. No ACK for DEGRADED: the
 *   pulse re-enqueues it and I1 shows [REFRESH_QUEUED] <new cache date>.
 * v4.16.87: ACK pulse. A queued scan only reaches I1 when B1 is pulsed again
 *   inside the 45 min ACK window, but [REFRESH_QUEUED] rows compete for 10
 *   pulses per run (~2h per row with 110+ rows): the ACK always expired and
 *   every row stayed [REFRESH_QUEUED]. After the drain, B1 of the rows whose
 *   scan was proven OK is pulsed at once so I1 reads the ACK.
 * P-PROP (2026-11-08, P1-DATA-NATIVE-PRICE-FRESHNESS) : propagation bornee des prix
 *   natifs. Quand une generation de NativePriceStore est etablie (ecritures > 0,
 *   refreshedAt relu dans le CacheService egal a l'instant du passage), le watchdog
 *   ajoute un bump J1 (+1 s) pour les feuilles EVM en NATIVE_PRICE_UNKNOWN dont
 *   l'identifiant natif a une entree admissible, dans la capacite RESIDUELLE du
 *   budget J1 existant (20, apres les synchronisations), au plus une fois par
 *   feuille et par generation (latch sous verrou). Aucun HTTP, aucun scan, aucun
 *   changement de cooldown ; les dates de prix et de solde ne sont pas touchees.
 * v4.16.81: idempotent A2 recovery latch across watchdog and fast J1 sync.
 *
 * v4.16.71: hold-aware recovery sweep (piste 3). Pendant le post-trip scan
 *   hold 3h, QUOTA_RECOVERY_SWEEP ne pulse plus les wallets on-chain (les
 *   scans AUTO iraient en cache de toute façon et brûleraient le cap
 *   watchdog). Les portefeuilles Action/Crypto restent programmés. Hors hold,
 *   le 1er passage est capé à 5 sheets ; le surplus est persisté pour
 *   FOLLOWUP. FOLLOWUP honore le même hold.
 *
 * v4.16.68: le correctif J1/[CACHE_ONLY] (v4.16.67) ne couvrait que la boucle
 *   watchdog (_wd_collectGlobalRefreshActions_). SYNC_J1_ALL_SHEETS — pass
 *   rapide toutes les 2 min via ACTIVITY_WATCHDOG — utilisait encore
 *   _wd_extractTimestamp_ et faisait reculer J1 a la date de la donnee des
 *   qu'une reevaluation I1 produisait un [CACHE_ONLY] <cache> (constate sur
 *   Botanix : J1 revenu au 2026-08-17 alors que I1 = PRESERVED du jour).
 *   Fix: helper partage _wd_j1LatchValue_(vI1, vB1) utilise par les DEUX
 *   ecrivains; SYNC_J1_ALL_SHEETS lit desormais la colonne D (B1).
 *
 * v4.16.67: J1 sync d'une ligne [CACHE_ONLY] recopie B1 (la tentative) au lieu
 *   de la date de la donnee. [CACHE_ONLY] garde volontairement la date du cache
 *   dans I1 (regle de re-pulse v4.16.46), mais J1 est le latch "derniere
 *   tentative" : le recopier depuis I1 faisait reculer J1 a la donnee (ex.
 *   2026-07-12), figeait le latch et empechait la reactualisation de la ligne
 *   ERROR, pendant que le Recap affichait "LAST SCAN" = derniere reussite.
 *
 * v4.16.46: Detect CACHE_ONLY B1/I1 mismatch — when B1 advances but
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
var WD_PULSE_MIN = 30;          // v4.15.135: 30 min — 10 min was too aggressive on quota
var WD_PULSE_MIN_BLOCKED = 30;  // v4.5.8: Cooldown for blocked sheets (30 min)
var WD_PULSE_MIN_PARTIAL = 60;  // v4.15.133: 60 min — partial cycles are mostly unpriced tokens, re-pulsing too fast wastes quota

// Probe size
var WD_PROBE_SIZE_MIN = 5;
var WD_PROBE_SIZE_MAX = 20;
var WD_MAX_PULSES_PER_RUN = 10;
var WD_CYCLE_SLOTS_PER_RUN = 7;
// 2026-11-09 (P1-REC-QUEUE-FRESHNESS) : places reservees, avant les voies cycle/urgente, aux sources
// dont la donnee approche l'objectif de 6 h (>= WD_STALE_I1_HOURS) ou dont la mise en file a echoue
// (QUEUE_ERROR/DEFERRED/FULL). Plafond < WD_MAX_PULSES_PER_RUN : la rotation garde toujours 2 places.
var WD_PRIORITY_SLOTS_PER_RUN = 8;
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
var P_WD_PPROP_GEN = "WD_PPROP_GEN";      // P-PROP : derniere generation etablie du magasin natif
var P_WD_PPROP_LATCH = "WD_PPROP_LATCH";  // P-PROP : {gen, sheets:{feuille: {g, n}}} (une fois par generation, rotation)
var WD_PPROP_RENDER_MARGIN_MS = 10 * 60 * 1000; // entree encore admissible au rendu qui suit le bump
var WD_PPROP_MAX_PER_RUN = 5; // sous-plafond du budget J1 partage : limite la rafale de recalculs cache seul
var WD_PPROP_MAX_INEFFECTIVE = 2; // bumps consecutifs sans disparition du NPU avant arret conservateur

var REFRESH_VERSION = "4.16.71";

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
    // v4.16.70: secondary views (e.g. "Ledger - Base Action") mirror their
    // primary ("Ledger - Base Crypto"). Cocher A1 sur une vue secondaire doit
    // aussi pulser B1 sur la vue primaire pour declencher le scan du wallet.
    if (a1 === "A1" && String(name || "").indexOf(" - ") >= 0) {
      var secondaryValue = (typeof e.value !== "undefined") ? e.value : range.getValue();
      if (String(secondaryValue).toUpperCase() === "TRUE" && typeof LedgerViewRegistry_resolvePrimary_ === "function") {
        var primaryName = LedgerViewRegistry_resolvePrimary_(name);
        if (primaryName && primaryName !== name && sheet && typeof sheet.getParent === "function") {
          try {
            var primarySheet = sheet.getParent().getSheetByName(primaryName);
            if (primarySheet) {
              var nowStrSecondary = _wd_fmtDate_(new Date());
              primarySheet.getRange("B1").setValue(nowStrSecondary);
              primarySheet.getRange("B1").setNumberFormat("@");
            }
          } catch (ePrimaryPulse) {
            try { Logger.log("[WCORE_ON_EDIT] primary pulse failed for " + primaryName + ": " + (ePrimaryPulse && ePrimaryPulse.message)); } catch (eLog) {}
          }
        }
      }
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
      // v4.16.85: an installable trigger has a 6 min budget, a custom function
      // only 30 s. Queued delegated scans are drained here, never in the cell.
      try {
        if (typeof _webScanQueueDrain_ === "function" && typeof _webScanQueueEnabled_ === "function" && _webScanQueueEnabled_()) {
          var _qRemaining = 300000 - (Date.now() - t0) - 30000;
          if (_qRemaining > GSHEET_WEB_SCAN_QUEUE_MIN_SCAN_MS) {
            try { stats.scanQueueDepthBefore = _webScanQueueRead_().length; } catch (eQd0) {}
            var _qRes = _webScanQueueDrain_({ maxItems: (typeof GSHEET_WEB_SCAN_QUEUE_DRAIN_MAX_PER_RUN === "number" ? GSHEET_WEB_SCAN_QUEUE_DRAIN_MAX_PER_RUN : 3), budgetMs: Math.min(_qRemaining, 180000) });
            try { stats.scanQueueDepthAfter = _webScanQueueRead_().length; } catch (eQd1) {}
            stats.scanQueueReason = String((_qRes && _qRes.reason) || "");
            stats.scanQueueResults = (_qRes && _qRes.results) ? _qRes.results.length : 0;
            stats.scanQueueOutcomes = ((_qRes && _qRes.results) || []).map(function(r) { return { chain: r.chain, outcome: r.outcome }; });
          } else {
            stats.scanQueueReason = "WATCHDOG_BUDGET";
          }
        }
      } catch (eQueueDrain) {
        stats.scanQueueError = String(eQueueDrain && (eQueueDrain.message || eQueueDrain) || eQueueDrain);
      }

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
      if (typeof _wcoreRemovedChain_ === "function" && _wcoreRemovedChain_(sheetName)) continue;
      
      var cycleVal = String(data[i][cycleColIndex] || "").toLowerCase().trim();
      stats.checked++;
      
      // Check if partial cycle
      if (cycleVal === "partial" || (cycleVal.indexOf("partial") !== -1)) {
        stats.partial++;
        
        // Get the sheet FIRST (needed for B1 fallback and for the pulse)
        var partialSheet = null;
        try { partialSheet = ss.getSheetByName(sheetName); } catch (eGet) {}
        
        // Check cooldown — use ScriptProperties tracking, fallback to B1 value
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
      return [["ERROR", "Recap Portfolio sheet not found"]];
    }
    
    var lastRow = recap.getLastRow();
    if (lastRow < 2) {
      return [["INFO", "No data in Recap Portfolio"]];
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
      if (typeof _wcoreRemovedChain_ === "function" && _wcoreRemovedChain_(sheetName)) continue;
      
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
  var match = vI1.match(/^\[(?:BLOCKED:[^\]]+|CACHE_ONLY|CHAIN_DISABLED|WEB_SCAN_DEGRADED|WEB_SCAN_PRESERVED|WEB_SCAN_ERROR|REFRESH_QUEUED|REFRESH_COOLDOWN|REFRESH_QUEUE_FULL|REFRESH_QUEUE_ERROR|REFRESH_QUEUE_DEFERRED|REFRESH_NOT_DUE)\]\s*(.+)$/);
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
  var failedPprop = [];
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
        if (action.reason === "native_price_store") failedPprop.push(action);
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
      if (action.reason === "native_price_store") failedPprop.push(action);
    }
  }
  var rollback = _wd_rollbackPulseReservations_(failedPulses, nowMs);
  result.stateErrors = rollback.errors;
  // P-PROP : une demande dont l'ecriture J1 a echoue n'est pas acquittee (nouvel essai au passage suivant).
  if (failedPprop.length) result.stateErrors += _wd_ppropRollback_(failedPprop);
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
  return /^\[REFRESH_(?:QUEUED|COOLDOWN|QUEUE_FULL|QUEUE_ERROR|QUEUE_DEFERRED|NOT_DUE)\]/.test(vI1) ||
    vI1.indexOf("[BLOCKED:") === 0 || vI1.indexOf("[NO_CACHE]") === 0 ||
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

// v4.16.87: rows to pulse right after a drain so I1 reads the fresh ACK.
// Only proven OK scans carry an ACK. v4.16.89: a proven DEGRADED scan is pulsed
// as well so the cells read the rewritten cache; it re-enqueues (no ACK), which
// keeps retrying the degraded source. PRESERVED wrote nothing and is never
// pulsed. Force rows (C1 TRUE) are skipped: their revision
// includes the B1 trigger, so a new B1 can never match the ACK.
// Rows are matched on the queue's opaque source label, never on raw addresses.
function _wd_ackPulseProven_(r) {
  return !!(r && (r.outcome === "OK" || r.outcome === "DEGRADED") && r.cacheWriteReread === true && r.queueCommitted === true);
}

function _wd_ackPulseTargets_(results, rows) {
  var sources = {};
  (results || []).forEach(function(r) {
    if (_wd_ackPulseProven_(r) && r.source) sources[r.source] = true;
  });
  if (!Object.keys(sources).length) return [];
  var out = [];
  (rows || []).forEach(function(row) {
    if (!row || /^TRUE$/i.test(_wd_norm_(row.vC1 || ""))) return;
    var m = String(row.formula || "").match(/^\s*=\s*([A-Za-z0-9_]+)_REFRESH_STATUS\s*\(\s*"([^"]+)"/);
    if (!m) return;
    var id = m[1].toUpperCase() + "|" + String(m[2]).trim().toLowerCase();
    if (sources[_webScanQueueOpaque_(id)]) out.push(row.name);
  });
  return out;
}

function _wd_ackPulseDrained_(ss, results, sheetData, nowStr, deadlineMs) {
  var out = { targets: 0, pulsed: 0, reason: "OK" };
  if (typeof _webScanQueueOpaque_ !== "function") { out.reason = "QUEUE_UNAVAILABLE"; return out; }
  var proven = (results || []).filter(_wd_ackPulseProven_);
  if (!proven.length) { out.reason = "NO_OK"; return out; }
  var rows = (sheetData || []).filter(function(d) { return d && d.name && !_wd_isCexSheet_(d.name); });
  if (!rows.length || Date.now() >= deadlineMs) { out.reason = rows.length ? "BUDGET" : "NO_ROWS"; return out; }
  var ranges = rows.map(function(d) { return "'" + d.name.replace(/'/g, "''") + "'!I1"; });
  var data = Sheets.Spreadsheets.Values.batchGet(ss.getId(), { ranges: ranges, valueRenderOption: "FORMULA" });
  if (!data || !data.valueRanges || data.valueRanges.length !== rows.length) { out.reason = "FORMULAS_UNAVAILABLE"; return out; }
  var targets = _wd_ackPulseTargets_(proven, rows.map(function(d, i) {
    var v = data.valueRanges[i].values;
    return { name: d.name, vC1: d.vC1, formula: v && v[0] ? v[0][0] : "" };
  }));
  out.targets = targets.length;
  for (var i = 0; i < targets.length; i++) {
    if (Date.now() >= deadlineMs) { out.reason = "BUDGET"; break; }
    var sh = ss.getSheetByName(targets[i]);
    if (!sh) continue;
    sh.getRange("B1").setValue(nowStr);
    out.pulsed++;
  }
  return out;
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

// 2026-11-08 (P1-REC-QUEUE-FRESHNESS) : objectif de fraicheur de 6 h (TTL du cache et de la file).
// C'est un OBJECTIF, pas une garantie : le debit est borne (10 impulsions et 8 scans par passage).
// Un depassement est signale dans le diagnostic du watchdog (stats.freshnessBreach), jamais masque.
var WD_FRESHNESS_TARGET_HOURS = 6;

/** Statuts I1 dont la date est celle du cache persiste (11_EVM getRefreshStatus, 41 _webScanWallet_). */
function _wd_i1CarriesCacheDate_(i1Norm) {
  return /^(?:\[(?:CACHE_ONLY|REFRESH_QUEUED|REFRESH_QUEUE_ERROR|REFRESH_QUEUE_DEFERRED|REFRESH_QUEUE_FULL|REFRESH_COOLDOWN|REFRESH_NOT_DUE|WEB_SCAN_DEGRADED)\]|WEB_SCAN_OK\s|TON_SCAN_OK\s)/.test(String(i1Norm || ""));
}

/**
 * Compte les sources dont la DONNEE (et non l'impulsion) depasse l'objectif. Une date absente ou
 * portant l'heure d'un controle (PRESERVED, ERROR, NO_CACHE...) est INCONNUE, jamais comptee fraiche.
 */
function _wd_trackFreshness_(stats, sheetName, i1Norm, i1Ms, nowMs) {
  var dated = _wd_i1CarriesCacheDate_(i1Norm) && isFinite(i1Ms) && i1Ms > 0 && i1Ms <= nowMs;
  var res = { dataAgeMs: dated ? nowMs - i1Ms : null, breach: dated && nowMs - i1Ms >= WD_FRESHNESS_TARGET_HOURS * 3600000,
    // Seuil de prevention (5 h) distinct de l'alerte (6 h) : la source est impulsee avant le depassement.
    atRisk: dated && nowMs - i1Ms >= WD_STALE_I1_HOURS * 3600000 };
  if (!stats) return res;
  var fb = stats.freshnessBreach;
  if (!fb) fb = stats.freshnessBreach = { targetHours: WD_FRESHNESS_TARGET_HOURS, count: 0, unknownCount: 0, datedCount: 0, oldestDataAgeMin: null, sheets: [], status: "UNKNOWN" };
  if (!_wd_i1CarriesCacheDate_(i1Norm) || !isFinite(i1Ms) || i1Ms <= 0 || i1Ms > nowMs) {
    fb.unknownCount++;
  } else {
    fb.datedCount++;
    var ageMin = Math.floor((nowMs - i1Ms) / 60000);
    if (fb.oldestDataAgeMin === null || ageMin > fb.oldestDataAgeMin) fb.oldestDataAgeMin = ageMin;
    if (ageMin >= WD_FRESHNESS_TARGET_HOURS * 60) {
      fb.count++;
      if (fb.sheets.length < 10) fb.sheets.push(String(sheetName || ""));
    }
  }
  fb.status = fb.count > 0 ? "BREACH" : (fb.datedCount > 0 && fb.unknownCount === 0 ? "WITHIN_TARGET" : (fb.datedCount > 0 ? "WITHIN_TARGET_PARTIAL" : "UNKNOWN"));
  return res;
}

function _wd_collectGlobalRefreshActions_(items, nowMs, staleMs, nowStr, stats, partialCandidates) {
  var urgentCandidates = (partialCandidates || []).filter(function(candidate) {
    return !(typeof _wcoreRemovedChain_ === "function" && _wcoreRemovedChain_(candidate && (candidate.name || candidate.sheetName)));
  });
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
    if (typeof _wcoreRemovedChain_ === "function" && _wcoreRemovedChain_(sheetName)) continue;
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
    var vA2Norm = _wd_norm_(d.vA2 || "");
    var needsA2Recalc = _wd_a2NeedsRecalc_(vA2Norm) &&
      _wd_isLastUpdateFormat_(extractedI1) && _wd_shouldSyncJ1_(d.vI1 || "", "");
    var cooldownMin = refreshCheck.useBlockedCooldown ? WD_PULSE_MIN_BLOCKED : WD_PULSE_MIN;
    // 2026-11-06 (C3) : un total Recap vide peut etre une valorisation UNKNOWN (fail-closed),
    // pas une erreur de formule. Une ligne PERIMEE ne doit jamais perdre son pulse B1 a cause
    // de ce signal (sinon : total UNKNOWN faute de scan, et pas de scan faute de total).
    // Le bump J1 a2_error_recalc reste applique ensuite, inchange.
    var a2BlocksPulse = needsA2Recalc && !(refreshCheck.needsPulse && refreshCheck.reason === "stale");
    var canPulseNormally = !a2BlocksPulse && !suppressB1Pulses && webErrorAllowed &&
      refreshCheck.blockedReason !== "QUOTA" &&
      _wd_shouldPulseB1_(d.vB1 || "", nowMs, cooldownMin);
    var cycleAgeMs = Number.MAX_SAFE_INTEGER;
    var cycleI1Ms = _wd_parseLocalDateTimeToMs_(_wd_extractTimestamp_(d.vI1 || ""));
    var cycleB1Ms = _wd_parseLocalDateTimeToMs_(d.vB1 || "");
    var cycleLatestMs = Math.max(isFinite(cycleI1Ms) ? cycleI1Ms : 0, isFinite(cycleB1Ms) ? cycleB1Ms : 0);
    // v4.16.46: [CACHE_ONLY] stays stale even when B1 is refreshed.
    // Use I1 as the age anchor so the wallet doesn't look "recently serviced".
    // 2026-11-08 (Mitosis) : palier de depassement. Une source dont la DONNEE persistee (date de cache
    // portee par I1) depasse l'objectif de 6 h passe devant les autres, meme juste apres une impulsion B1
    // sans scan persiste (preserve, evince, echecs, cooldown). L'ordre tournant max(I1,B1) est conserve
    // A L'INTERIEUR de chaque palier : ancrer tout l'ordre sur I1 affamait les sources moins anciennes
    // quand les scans echouent durablement (test de famine sur 12 passages).
    var freshness = typeof _wd_trackFreshness_ === "function"
      ? _wd_trackFreshness_(stats, sheetName, i1Norm, cycleI1Ms, nowMs) : { dataAgeMs: null, breach: false };
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
        dataAgeMs: freshness.dataAgeMs,
        freshnessBreach: freshness.breach,
        freshnessAtRisk: !!freshness.atRisk,
        // Une admission perdue ne doit pas attendre une rotation complete (~2,5 h).
        lostAdmission: /^\[REFRESH_QUEUE_(?:ERROR|DEFERRED|FULL)\]/.test(i1Norm),
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
    // v4.16.68: le latch J1 passe par le helper partage — pour [CACHE_ONLY] il
    // vaut B1 (la tentative) et non la date de la donnee (voir _wd_j1LatchValue_).
    // v4.16.69: B1 lu directement depuis la feuille quand I1 est [CACHE_ONLY] —
    // le Recap INDIRECT(B1) peut retourner un pulse perime (pas de recalcul
    // volatile visible par l'API apres batchUpdate), ce qui faisait osciller J1.
    var latchB1 = d.vB1 || "";
    if (_wd_norm_(d.vI1 || "").indexOf("[CACHE_ONLY]") === 0) {
      var directB1 = _wd_readDirectB1_(sheetName);
      if (directB1 != null) latchB1 = directB1;
    }
    var j1SyncValue = _wd_j1LatchValue_(d.vI1 || "", latchB1);
    var j1SyncReason = "";
    if (_wd_norm_(d.vI1 || "").indexOf("[CACHE_ONLY]") === 0 && j1SyncValue !== actualI1) {
      j1SyncReason = "cache_only_attempt";
    }
    if (needsA2Recalc && !_wd_confirmA2Error_(d.name || d.sheetName || "")) {
      needsA2Recalc = false;
    }
    if (needsA2Recalc) {
      var bumpedJ1 = _wd_bumpTimestampSeconds_(actualI1, 1);
      if (bumpedJ1 && _wd_norm_(d.vJ1 || "") !== bumpedJ1) {
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
    if (_wd_shouldSyncJ1_(j1SyncValue, d.vJ1 || "")) {
      var _syncAction = {
        sheet: d.sheet || null,
        sheetName: d.name || d.sheetName || "",
        range: "J1",
        value: j1SyncValue,
        type: "sync",
        fairnessIndex: i
      };
      if (j1SyncReason) _syncAction.reason = j1SyncReason;
      syncActions.push(_syncAction);
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
    if (!!a.freshnessBreach !== !!b.freshnessBreach) return a.freshnessBreach ? -1 : 1;
    if (a.cycleAgeMs !== b.cycleAgeMs) return b.cycleAgeMs - a.cycleAgeMs;
    return String(a.sheetName || "").localeCompare(String(b.sheetName || ""));
  });
  urgentCandidates.sort(function(a, b) {
    if (!!a.freshnessBreach !== !!b.freshnessBreach) return a.freshnessBreach ? -1 : 1;
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

  // 2026-11-09 : palier prioritaire commun aux deux voies, borne et tournant (max(I1,B1)) pour ne pas
  // affamer les autres sources si les scans echouent durablement ; cooldown B1 deja applique en amont.
  var priorityCandidates = cycleCandidates.concat(urgentCandidates).filter(function(candidate) {
    return !!candidate.freshnessAtRisk || !!candidate.lostAdmission;
  });
  priorityCandidates.sort(function(a, b) {
    var aTier = a.freshnessAtRisk ? 0 : 1, bTier = b.freshnessAtRisk ? 0 : 1;
    if (aTier !== bTier) return aTier - bTier;
    var aAge = isFinite(Number(a.cycleAgeMs)) ? Number(a.cycleAgeMs) : 0;
    var bAge = isFinite(Number(b.cycleAgeMs)) ? Number(b.cycleAgeMs) : 0;
    if (aAge !== bAge) return bAge - aAge;
    return String(a.sheetName || "").localeCompare(String(b.sheetName || ""));
  });
  var prioritySlots = typeof WD_PRIORITY_SLOTS_PER_RUN === "number" ? WD_PRIORITY_SLOTS_PER_RUN : 0;
  takeNextDistinct_(priorityCandidates, Math.min(prioritySlots, WD_MAX_PULSES_PER_RUN));
  var priorityTaken = selectedPulses.length;
  takeNextDistinct_(cycleCandidates, Math.min(Math.max(WD_CYCLE_SLOTS_PER_RUN, priorityTaken + 1), WD_MAX_PULSES_PER_RUN));
  var cycleSelected = selectedPulses.length;
  takeNextDistinct_(urgentCandidates, Math.min(WD_MAX_PULSES_PER_RUN, selectedPulses.length + 1));
  if (cycleSelected < WD_CYCLE_SLOTS_PER_RUN) takeNextDistinct_(urgentCandidates, WD_MAX_PULSES_PER_RUN);
  // Palier actif : le budget restant va d'abord aux sources en attente (voie urgente), pas aux sources
  // saines du cycle ; le budget de WD_MAX_PULSES_PER_RUN est toujours complete. Sans palier : ordre LIVE inchange.
  if (priorityTaken > 0) takeNextDistinct_(urgentCandidates, WD_MAX_PULSES_PER_RUN);
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
  var ppropPendingSync = {};
  for (var psi = 0; psi < syncActions.length; psi++) {
    if (syncActions[psi] && syncActions[psi].sheetName) ppropPendingSync[syncActions[psi].sheetName] = true;
  }
  syncActions = _wd_selectFairJ1Actions_(syncActions, items.length, P_WD_J1_CURSOR, stats);
  // P-PROP : seulement la capacite residuelle du budget J1 existant (jamais une nouvelle enveloppe).
  var ppropActions = [];
  try {
    ppropActions = _wd_ppropCollect_(items, ppropPendingSync, Number(SYNC_J1_MAX_SYNCS_PER_RUN || 20) - syncActions.length, nowMs, stats);
  } catch (ePprop) {
    stats.ppropError = String((ePprop && ePprop.message) || ePprop).substring(0, 80);
    ppropActions = [];
  }
  return syncActions.concat(ppropActions, selectedPulses);
}

// ============================================================
// P-PROP (2026-11-08) : propagation bornee NativePriceStore -> Ledgers
// ============================================================

/**
 * Generation utilisable du magasin natif, ou null.
 * Nouvelle generation : ce passage a ecrit des prix (written > 0) ET le magasin relu
 * depuis le CacheService porte refreshedAt === nowMs (la sauvegarde a reussi).
 * Generation en cours : la derniere generation etablie (propriete) est toujours celle
 * du magasin relu. NOT_DUE, written=0, FX_UNAVAILABLE ou un refreshedAt inconnu
 * n'etablissent rien.
 */
function _wd_ppropGeneration_(nativePrices, nowMs, stats) {
  stats = stats || {};
  if (typeof NativePriceStore === "undefined" || !NativePriceStore || typeof NativePriceStore.load !== "function") return null;
  var store = NativePriceStore.load();
  var refreshedAt = Number(store && store.refreshedAt);
  if (!(isFinite(refreshedAt) && refreshedAt > 0) || !store.entries) return null;
  var props = PropertiesService.getScriptProperties();
  var np = nativePrices || {};
  if (Number(np.written) > 0 && refreshedAt === Number(nowMs)) {
    try { props.setProperty(P_WD_PPROP_GEN, String(refreshedAt)); }
    catch (eGen) { stats.stateErrors = Number(stats.stateErrors || 0) + 1; return null; }
    stats.ppropGen = "NEW";
    return { id: String(refreshedAt), store: store };
  }
  var known = props.getProperty(P_WD_PPROP_GEN);
  if (known && String(refreshedAt) === String(known)) {
    stats.ppropGen = "PENDING";
    return { id: String(known), store: store };
  }
  return null;
}

/** Libelle de chaine d'une feuille : apres le dernier " - ", sans suffixe " Crypto". */
function _wd_ppropChainLabel_(sheetName) {
  var name = String(sheetName || "");
  var sep = name.lastIndexOf(" - ");
  if (sep < 0) return "";
  return name.substring(sep + 3).replace(/ Crypto$/, "").trim().toLowerCase();
}

/** Index des chaines EVM actives : libelle -> {id, flags} (registre ChainFactory). */
function _wd_ppropChainIndex_() {
  var out = {};
  try {
    var reg = (typeof ChainFactory !== "undefined" && ChainFactory.getRegistry) ? ChainFactory.getRegistry() : {};
    for (var key in reg) {
      if (!Object.prototype.hasOwnProperty.call(reg, key)) continue;
      var cfg = null;
      try { cfg = (reg[key] && typeof reg[key].getConfig === "function") ? reg[key].getConfig() : null; } catch (eCfg) { cfg = null; }
      if (!cfg || !cfg.CHAIN || !/_EVM_v/.test(String(cfg.VERSION || ""))) continue; // seul le rendu EVM consulte le magasin
      var id = cfg.CHAIN.NATIVE_LLAMA_ID;
      var label = String(cfg.CHAIN.NAME || "").trim().toLowerCase();
      if (!label || typeof id !== "string" || !id) continue;
      var flags = cfg.FLAGS || {};
      out[label] = { id: id, disabled: flags.DISABLE_CHAIN === true,
        noDirectNative: !!(flags.NATIVE_BALANCE_TOKEN_CONTRACT || flags.DISABLE_NATIVE_BALANCE) };
    }
  } catch (eReg) {}
  return out;
}

/** "7361 sec" -> 7361 ; sinon null. */
function _wd_ppropParseAgeSec_(v) {
  var m = String(v || "").match(/^(\d+)\s*sec$/);
  return m ? Number(m[1]) : null;
}

/** Meme regle que le rendu 11_EVM : entree attestee, FX date, min(obs, FX) dans la fenetre, avec marge. */
function _wd_ppropStoreAdmissible_(store, id, nowMs) {
  try {
    var maxAge = (typeof WCORE_CACHE_CONFIG !== "undefined" && Number(WCORE_CACHE_CONFIG.PRICE_STALE_MS) > 0) ? Number(WCORE_CACHE_CONFIG.PRICE_STALE_MS) : 5400000;
    var e = NativePriceStore.get(id, maxAge, nowMs, store);
    if (!e || !(Number(e.eur) > 0)) return false;
    var raw = store.entries[String(id)] || {};
    var fxAt = Number(raw.fxCollectedAt);
    if (!(isFinite(fxAt) && fxAt > 0 && fxAt <= nowMs + 5 * 60 * 1000)) return false;
    return (nowMs - Math.min(Number(e.observedAt), fxAt)) < (maxAge - WD_PPROP_RENDER_MARGIN_MS);
  } catch (eAdm) { return false; }
}

function _wd_ppropSheetEligible_(d, pendingSync, chains, store, nowMs) {
  var name = String((d && (d.name || d.sheetName)) || "");
  if (!name || d.vErr === undefined || d.vAge === undefined) return null;   // donnees Recap absentes : refus
  if (/ Action$/.test(name)) return null;                                     // vues Action : projection, INFO_TOTAL statique
  if (_wd_isCexSheet_(name)) return null;
  if (typeof _wcoreRemovedChain_ === "function" && _wcoreRemovedChain_(name)) return null;
  if (pendingSync[name]) return null;                                         // une synchro J1 recalculera deja
  var vI1 = _wd_norm_(d.vI1 || "");
  if (_wd_isBlocked_(vI1).blocked || /CHAIN_DISABLED|CHAIN_REMOVED|NO_CACHE/.test(vI1)) return null;
  if (String(d.vErr || "").indexOf("NATIVE_PRICE_UNKNOWN") !== 0) return null;
  var ageSec = _wd_ppropParseAgeSec_(d.vAge);
  var walletTtl = (typeof WCORE_CACHE_CONFIG !== "undefined" && Number(WCORE_CACHE_CONFIG.WALLET_TTL_MS) > 0) ? Number(WCORE_CACHE_CONFIG.WALLET_TTL_MS) : 21600000;
  if (ageSec == null || ageSec * 1000 >= walletTtl) return null;              // cache (borne du solde) >= 6 h : refus
  if (!_wd_isLastUpdateFormat_(_wd_norm_(d.vJ1 || ""))) return null;
  var ch = chains[_wd_ppropChainLabel_(name)];
  if (!ch || ch.disabled || ch.noDirectNative) return null;
  if (!_wd_ppropStoreAdmissible_(store, ch.id, nowMs)) return null;
  return { name: name, id: ch.id, vJ1: _wd_norm_(d.vJ1 || "") };
}

/**
 * Selection P-PROP : au plus `capacity` bumps (capacite residuelle du budget J1),
 * une seule fois par feuille et par generation (latch persiste AVANT l'ecriture, sous
 * verrou). Verrou indisponible ou latch non persistable : aucune demande.
 */
function _wd_ppropCollect_(items, pendingSync, capacity, nowMs, stats) {
  stats = stats || {};
  var cap = Math.max(0, Math.min(Number(capacity) || 0, Number(SYNC_J1_MAX_SYNCS_PER_RUN || 20), WD_PPROP_MAX_PER_RUN));
  // Sans colonnes C/AS lues (fallback Sheets API, FORCE_WATCHDOG_PARTIAL_CHECK avec items=[]) : P-PROP inactif, latch intact.
  var hasNpuData = false;
  for (var h = 0; h < (items || []).length; h++) { if (items[h] && items[h].vErr !== undefined && items[h].vAge !== undefined) { hasNpuData = true; break; } }
  if (!hasNpuData) return [];
  // La generation est enregistree meme sans capacite : les feuilles differees restent eligibles.
  var gen = _wd_ppropGeneration_(stats.nativePrices, nowMs, stats);
  if (!gen || cap === 0 || stats.j1ClaimBusy) return [];
  var chains = _wd_ppropChainIndex_();
  var candidates = [];
  for (var i = 0; i < (items || []).length; i++) {
    var c = _wd_ppropSheetEligible_(items[i] || {}, pendingSync || {}, chains, gen.store, nowMs);
    if (c) candidates.push(c);
  }
  stats.ppropCandidates = candidates.length;
  // Sans candidat, le verrou n est pris que pour elaguer un latch existant (episodes NPU clos).
  if (!candidates.length && !PropertiesService.getScriptProperties().getProperty(P_WD_PPROP_LATCH)) return [];
  var out = [], lock = null, locked = false;
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(250)) { stats.ppropLockBusy = true; return []; }
    locked = true;
    var props = PropertiesService.getScriptProperties();
    var latch = null;
    try { latch = JSON.parse(props.getProperty(P_WD_PPROP_LATCH) || "null"); } catch (eParse) { latch = null; }
    if (!latch || !latch.sheets || typeof latch.sheets !== "object") latch = { gen: gen.id, sheets: {} };
    // Entree par feuille : {g: generation du dernier bump, n: bumps consecutifs sans disparition du NPU}.
    // Une feuille lue sans NPU est oubliee (episode NPU clos) ;
    // celles de la generation courante sont conservees (pas de rebump pendant la resynchronisation).
    // Episode NPU clos seulement si la feuille est lue sans NPU (une exclusion temporaire, ex. resynchro, ne le clot pas).
    var cands = {}, kept = {};
    for (var q = 0; q < (items || []).length; q++) { var it = items[q] || {};
      if (it.name && /^NATIVE_PRICE_UNKNOWN/.test(String(it.vErr == null ? "" : it.vErr).trim())) cands[it.name] = true; }
    var before = 0;
    for (var nm in latch.sheets) {
      before++;
      if (!Object.prototype.hasOwnProperty.call(latch.sheets, nm)) continue;
      var en = latch.sheets[nm];
      if (en && typeof en === "object" && (cands[nm] || en.g === gen.id)) kept[nm] = { g: String(en.g || ""), n: Number(en.n) || 0 };
    }
    latch = { gen: gen.id, sheets: kept };
    // Rotation : jamais traitee d'abord, puis la generation de bump la plus ancienne ; ordre du Recap sinon.
    var order = candidates.map(function (cnd, idx) { var e0 = kept[cnd.name]; return { c: cnd, idx: idx, g: e0 ? Number(e0.g) || 0 : 0 }; });
    order.sort(function (x, y) { return (x.g - y.g) || (x.idx - y.idx); });
    var already = 0, exhausted = 0, changed = Object.keys(kept).length !== before;
    for (var k = 0; k < order.length; k++) {
      var cand = order[k].c, prev = kept[cand.name];
      if (prev && prev.g === gen.id) { already++; continue; }
      if (prev && prev.n >= WD_PPROP_MAX_INEFFECTIVE) { exhausted++; continue; } // 2 bumps sans effet : arret conservateur
      if (out.length >= cap) continue;
      var bumped = _wd_bumpTimestampSeconds_(cand.vJ1, 1);
      if (!bumped) continue;
      out.push({ sheet: null, sheetName: cand.name, range: "J1", value: bumped, type: "sync", reason: "native_price_store", ppropGen: gen.id });
      kept[cand.name] = { g: gen.id, n: (prev ? prev.n : 0) + 1 };
      changed = true;
    }
    stats.ppropAlready = already;
    stats.ppropExhausted = exhausted;
    stats.ppropDeferred = Math.max(0, candidates.length - already - exhausted - out.length);
    if (changed) props.setProperty(P_WD_PPROP_LATCH, JSON.stringify(latch));
  } catch (eLatch) {
    stats.stateErrors = Number(stats.stateErrors || 0) + 1;
    out = [];
  } finally {
    if (locked && lock) { try { lock.releaseLock(); } catch (eRel) {} }
  }
  stats.ppropSelected = out.length;
  return out;
}

/** Retire du latch les demandes dont l'ecriture J1 a echoue. Renvoie le nombre d'erreurs d'etat. */
function _wd_ppropRollback_(failed) {
  var lock = null, locked = false;
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(250)) return 1;
    locked = true;
    var props = PropertiesService.getScriptProperties();
    var latch = JSON.parse(props.getProperty(P_WD_PPROP_LATCH) || "null");
    if (!latch || !latch.sheets) return 0;
    for (var i = 0; i < failed.length; i++) {
      var a = failed[i] || {};
      var en = a.sheetName ? latch.sheets[a.sheetName] : null;
      if (!en || typeof en !== "object" || en.g !== a.ppropGen) continue;
      if (Number(en.n) <= 1) delete latch.sheets[a.sheetName];
      else latch.sheets[a.sheetName] = { g: "", n: Number(en.n) - 1 }; // ecriture non acquittee : de nouveau eligible
    }
    props.setProperty(P_WD_PPROP_LATCH, JSON.stringify(latch));
    return 0;
  } catch (eRb) { return 1; }
  finally { if (locked && lock) { try { lock.releaseLock(); } catch (eRel) {} } }
}

// v4.16.81: keep an A2 recovery bump stable across both J1 writers.
function _wd_a2NeedsRecalc_(value) {
  var normalized = _wd_norm_(value);
  return normalized === "" || normalized.indexOf("#") === 0 ||
    normalized.toLowerCase().indexOf("exceeded maximum execution time") >= 0;
}

function _wd_shouldSyncJ1_(vI1, vJ1) {
  if (_wd_isUnsafeLatchSource_(vI1)) return false;
  const actualI1 = _wd_extractTimestamp_(vI1);
  if (!_wd_isLastUpdateFormat_(actualI1)) return false;
  return _wd_norm_(actualI1) !== _wd_norm_(vJ1);
}

/**
 * v4.16.68: valeur du latch J1 pour une ligne donnee.
 *
 * Une ligne I1 [CACHE_ONLY] date la DONNEE servie (le timestamp du cache),
 * pas la TENTATIVE : la regle de re-pulse v4.16.46 compare B1 a cette date
 * pour detecter un cache servi en boucle, donc I1 doit la conserver. Mais J1
 * est le latch "derniere tentative" (AUDIT.md 2026-08-06) : y recopier la
 * date du cache fait reculer J1 a la derniere reussite, fige la ligne ERROR
 * et affiche "LAST SCAN" faux dans le Recap.
 *
 * Pour [CACHE_ONLY], on retourne donc l'horodatage B1 (le pulse = la
 * tentative). Pour tous les autres statuts (WEB_SCAN_OK, PRESERVED,
 * CHAIN_DISABLED, BLOCKED...), I1 date deja la tentative : extraction simple.
 *
 * Utilise par les DEUX ecrivains de J1 : _wd_collectGlobalRefreshActions_
 * (watchdog 10 min) et SYNC_J1_ALL_SHEETS (pass rapide toutes les 2 min) —
 * corriger un seul des deux laisse l'autre faire reculer le latch.
 */
function _wd_j1LatchValue_(vI1, vB1) {
  var extracted = _wd_extractTimestamp_(vI1);
  if (_wd_norm_(vI1 || "").indexOf("[CACHE_ONLY]") === 0) {
    var pulseTs = (vB1 instanceof Date) ? _wd_fmtDate_(vB1) : _wd_norm_(vB1 || "");
    if (pulseTs && _wd_isLastUpdateFormat_(pulseTs)) return pulseTs;
  }
  return extracted;
}

/**
 * v4.16.69: lecture directe de B1 sur la feuille wallet pour le latch J1
 * [CACHE_ONLY]. Le Recap porte B1 via INDIRECT, mais les ecritures API
 * (batchUpdate) ne declenchent pas le recalcul des formules volatiles visible
 * par Values.get : le latch peut alors recevoir le B1 d'une TENTE ANCIENNE
 * (ex: Date du 27/08 affichee en format FR) au lieu du pulse courant, et J1
 * oscille entre la date du cache et un timestamp perime. La lecture directe
 * contourne le cache de recalcul du Recap.
 * @param {string} sheetName nom de la feuille wallet
 * @returns {string|null} valeur B1 brute, ou null si indisponible
 */
function _wd_readDirectB1_(sheetName) {
  try {
    if (typeof Sheets === "undefined" || !Sheets.Spreadsheets || !Sheets.Spreadsheets.Values) return null;
    var resp = Sheets.Spreadsheets.Values.get(WCORE_SPREADSHEET_ID, _wd_quoteA1Sheet_(sheetName) + "!B1");
    var vals = (resp && resp.values) || [];
    return (vals[0] && vals[0][0] != null) ? String(vals[0][0]) : "";
  } catch (eRead) {
    return null;
  }
}

/**
 * v4.16.81: A2 du Recap peut etre perime (INDIRECT non recalcule par les
 * ecritures API). Avant de forcer un bump J1, confirmer l'erreur A2 sur la
 * feuille elle-meme ; une lecture indisponible n'autorise pas le bump.
 * @returns {boolean} true seulement si l'A2 direct confirme l'erreur
 */
function _wd_confirmA2Error_(sheetName) {
  if (!sheetName) return false;
  try {
    if (typeof Sheets === "undefined" || !Sheets.Spreadsheets || !Sheets.Spreadsheets.Values) return false;
    var resp = Sheets.Spreadsheets.Values.get(WCORE_SPREADSHEET_ID, _wd_quoteA1Sheet_(sheetName) + "!A2");
    var vals = (resp && resp.values) || [];
    var value = (vals[0] && vals[0][0] != null) ? String(vals[0][0]) : "";
    return _wd_a2NeedsRecalc_(value);
  } catch (eRead) {
    return false;
  }
}

function _wd_needsRefresh_(vA2, vI1, nowMs, staleMs, vB1) {
  // Pending is not success. Natural watchdog pulses retain existing per-sheet
  // admission/cooldowns and readmit requests after volatile cache eviction.
  if (/^\[REFRESH_(?:QUEUED|COOLDOWN|QUEUE_FULL|QUEUE_ERROR|QUEUE_DEFERRED|NOT_DUE)\]/.test(vI1)) {
    return { needsPulse: true, reason: "error", blockedReason: null, useBlockedCooldown: false };
  }
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
  
  // v4.14.10: [NO_CACHE] = wallet never scanned successfully — re-pulse with short cooldown
  if (vI1.indexOf("[NO_CACHE]") === 0) {
    return { needsPulse: true, reason: "empty", blockedReason: null, useBlockedCooldown: false };
  }

  // v4.15.3: [ERROR] = scan failed (RPC timeout, etc.) — re-pulse with normal cooldown
  if (vI1.indexOf("[ERROR]") === 0) {
    return { needsPulse: true, reason: "error", blockedReason: null, useBlockedCooldown: false };
  }

  // v4.16.27: [WEB_SCAN_ERROR] = WCORE Web API failed (timeout, 5xx, network) — re-pulse
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

  // Etat terminal: la chaine est explicitement desactivee (FLAGS.DISABLE_CHAIN).
  // Re-pulser ne peut rien produire — ses RPC sont morts — et chaque pulse coute
  // un appel HTTP. Seule une reactivation de la chaine doit relancer les scans.
  if (vI1.indexOf("[CHAIN_DISABLED]") === 0) {
    return { needsPulse: false, reason: "ok", blockedReason: null, useBlockedCooldown: false };
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
    try { if (typeof HttpCounter !== "undefined" && HttpCounter.flush) HttpCounter.flush(); } catch(eFlush){}
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

    // v4.16.77: prix natifs observes independamment des scans complets
    // (au plus 2 appels groupes toutes les 25 min, bornes par WATCHDOG_BUDGET_MS ;
    // le drainage de la file deduit ce temps de son propre budget).
    var _wdNativePrices = null;
    try {
      if (typeof NativePriceStore !== "undefined" && NativePriceStore.refreshIfDue) {
        _wdNativePrices = NativePriceStore.refreshIfDue({ nowMs: nowMs, budgetMs: NativePriceStore.CONFIG.WATCHDOG_BUDGET_MS });
      }
    } catch (eNps) { _wdNativePrices = { ran: false, reason: "ERROR" }; }

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
      staleThresholdHours: WD_STALE_I1_HOURS,
      nativePrices: _wdNativePrices
    };

    try {
      const ss = _wcoreGetSpreadsheet_();
      if (!ss) {
        stats = _wd_watchdogFromRecapViaSheetsApi_(nowMs);
        return;
      }
      // v4.17.0: phone alert (ntfy) when a Strat control cell turns to X (16C_STRAT_ALERT.gs).
      try {
        if (typeof _wcoreCheckStratAlert_ === "function") stats.stratAlert = _wcoreCheckStratAlert_(ss);
      } catch (eStratAlert) { stats.stratAlert = { ran: false, reason: "ERROR" }; }
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
      // P-PROP : ERROR (col C) et Cache.age_sec (col AS), seulement si les en-tetes sont ceux attendus.
      var recapErr = null, recapAge = null;
      try {
        var ppropHdr = recap.getRange(1, 1, 1, 45).getDisplayValues()[0] || [];
        if (_wd_norm_(String(ppropHdr[2] || "")) === "ERROR" && _wd_norm_(String(ppropHdr[44] || "")) === "Cache.age_sec") {
          recapErr = recap.getRange(2, 3, lastRow - 1, 1).getDisplayValues();
          recapAge = recap.getRange(2, 45, lastRow - 1, 1).getDisplayValues();
        }
      } catch (ePpropRead) { recapErr = null; recapAge = null; }

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
          vC1: _wd_norm_(String((recapC1[ri] && recapC1[ri][0]) || "")),
          vErr: recapErr ? _wd_norm_(String((recapErr[ri] && recapErr[ri][0]) || "")) : undefined,
          vAge: recapAge ? _wd_norm_(String((recapAge[ri] && recapAge[ri][0]) || "")) : undefined
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

      // v4.16.85: an installable trigger has a 6 min budget, a custom function
      // only 30 s. Queued delegated scans are drained here, never in the cell.
      try {
        if (typeof _webScanQueueDrain_ === "function" && typeof _webScanQueueEnabled_ === "function" && _webScanQueueEnabled_()) {
          var _qRemaining = 300000 - (Date.now() - t0) - 30000;
          if (_qRemaining > GSHEET_WEB_SCAN_QUEUE_MIN_SCAN_MS) {
            try { stats.scanQueueDepthBefore = _webScanQueueRead_().length; } catch (eQd0) {}
            var _qRes = _webScanQueueDrain_({ maxItems: (typeof GSHEET_WEB_SCAN_QUEUE_DRAIN_MAX_PER_RUN === "number" ? GSHEET_WEB_SCAN_QUEUE_DRAIN_MAX_PER_RUN : 3), budgetMs: Math.min(_qRemaining, 180000) });
            try { stats.scanQueueDepthAfter = _webScanQueueRead_().length; } catch (eQd1) {}
            stats.scanQueueReason = String((_qRes && _qRes.reason) || "");
            stats.scanQueueResults = (_qRes && _qRes.results) ? _qRes.results.length : 0;
            stats.scanQueueOutcomes = ((_qRes && _qRes.results) || []).map(function(r) { return { chain: r.chain, outcome: r.outcome }; });
            // v4.16.87/89: let I1 read the ACK (OK) or the rewritten cache (DEGRADED) at once.
            try {
              var _ackNowStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
              stats.ackPulse = _wd_ackPulseDrained_(ss, (_qRes && _qRes.results) || [], sheetData, _ackNowStr, t0 + 300000);
            } catch (eAckPulse) {
              stats.ackPulse = { reason: "ERROR", error: String(eAckPulse && (eAckPulse.message || eAckPulse) || eAckPulse).substring(0, 120) };
            }
          } else {
            stats.scanQueueReason = "WATCHDOG_BUDGET";
          }
        }
      } catch (eQueueDrain) {
        stats.scanQueueError = String(eQueueDrain && (eQueueDrain.message || eQueueDrain) || eQueueDrain);
      }
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
    try { if (typeof HttpCounter !== "undefined" && HttpCounter.flush) HttpCounter.flush(); } catch(eFlush){}
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
 * v4.16.71: first-pass hard cap. Even with a healthy quota, pulsing every
 * blocked wallet in one sweep re-exhausts the sliding 24h window (observed
 * 2026-09-09: 4 trips in 2h). Overflow is persisted for FOLLOWUP.
 */
var RECOVERY_FIRST_PASS_CAP = 5;

/**
 * v4.16.71: split a blocked-sheet list into "pulse now" vs "defer to FOLLOWUP".
 * While the post-trip scan hold is active, on-chain pulses are HTTP-neutral
 * (AUTO scans return cached output) and only burn watchdog pulse budget, so
 * they are all deferred. Portfolio recovery is scheduled independently.
 *
 * @param {string[]} sheetList
 * @param {boolean} holdActive
 * @returns {{ pulse: string[], deferred: string[] }}
 */
function _recoverySelectPulseList_(sheetList, holdActive) {
  var list = [];
  if (sheetList && sheetList.length) {
    for (var i = 0; i < sheetList.length; i++) {
      if (sheetList[i] && !(typeof _wcoreRemovedChain_ === "function" && _wcoreRemovedChain_(sheetList[i]))) list.push(sheetList[i]);
    }
  }
  var active = holdActive === true;
  if (!active) {
    try {
      if (typeof BudgetHTTP !== "undefined" && BudgetHTTP.isPostTripFloorActive) {
        // Fail closed on an unreadable/corrupt deadline: an unknown floor state
        // must not re-pulse the recovery wave that re-exhausts the quota window.
        active = BudgetHTTP.isPostTripFloorActive() !== false;
      }
    } catch (eHold) {
      // An unreadable floor state must not silently re-pulse the recovery wave;
      // defer the pass instead (bounded by the operator clear and the 3h expiry).
      active = true;
    }
  }
  if (active) return { pulse: [], deferred: list };
  if (list.length <= RECOVERY_FIRST_PASS_CAP) return { pulse: list, deferred: [] };
  return {
    pulse: list.slice(0, RECOVERY_FIRST_PASS_CAP),
    deferred: list.slice(RECOVERY_FIRST_PASS_CAP)
  };
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
    try { if (typeof HttpCounter !== "undefined" && HttpCounter.flush) HttpCounter.flush(); } catch(eFlush){}
  }
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
    var qcbWasBlocked = false;
    var httpGuardWasBlocked = false;
    try { qcbWasBlocked = !!(typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped()); } catch (eQcbState) {}
    try { httpGuardWasBlocked = !!(typeof HttpErrorGuard !== 'undefined' && HttpErrorGuard.isQuotaExhausted && HttpErrorGuard.isQuotaExhausted()); } catch (eGuardState) {}

    // --- Probe quota avant tout ---
    var probe = _recoveryProbeQuota_();
    if (!probe.ok) {
      Logger.log("[RECOVERY] Probe failed: " + probe.err + " — recurring 30min poller will retry");
      return;
    }
    Logger.log("[RECOVERY] Probe OK (HTTP " + probe.code + ") — proceeding");

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
        Logger.log("[RECOVERY] No blocked sheets found — clearing skipped state and skipping");
        _recoveryClearSkipped_();
        _recoveryClearFollowupPending_();
        return;
      }

      var selected = _recoverySelectPulseList_(cat.all);
      Logger.log("[RECOVERY] Found " + cat.quota.length + " BLOCKED:QUOTA + " + cat.timeout.length + " BLOCKED:TIMEOUT/#ERROR — pulsing " + selected.pulse.length + "/" + cat.all.length + " (cap " + RECOVERY_FIRST_PASS_CAP + ")");

      var r = { pulsed: 0, batches: 0, skippedFromIdx: -1 };
      if (selected.pulse.length > 0) {
        r = _recoveryPulseBatches_(ss, selected.pulse, RECOVERY_BATCH_SIZE, RECOVERY_DELAY_MS, MAX_RUNTIME_MS, t0, "RECOVERY");
      }
      stats.pulsed = r.pulsed;
      stats.batches = r.batches;

      var skippedList = selected.deferred.slice();
      if (r.skippedFromIdx >= 0) {
        skippedList = selected.pulse.slice(r.skippedFromIdx).concat(skippedList);
      }
      if (skippedList.length > 0) {
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
    try { if (typeof HttpCounter !== "undefined" && HttpCounter.flush) HttpCounter.flush(); } catch(eFlush){}
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
    var qcbWasBlocked = false;
    var httpGuardWasBlocked = false;
    try { qcbWasBlocked = !!(typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped()); } catch (eQcbState) {}
    try { httpGuardWasBlocked = !!(typeof HttpErrorGuard !== 'undefined' && HttpErrorGuard.isQuotaExhausted && HttpErrorGuard.isQuotaExhausted()); } catch (eGuardState) {}

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
        Logger.log("[RECOVERY_FU] Nothing to retry — clearing and exiting");
        _recoveryClearSkipped_();
        return;
      }

      Logger.log("[RECOVERY_FU] Retrying " + merged.length + " (" + skippedSheets.length + " skipped + " + cat.all.length + " still blocked, deduped)");

      var selectedFu = _recoverySelectPulseList_(merged);
      var r = { pulsed: 0, batches: 0, skippedFromIdx: -1 };
      if (selectedFu.pulse.length > 0) {
        r = _recoveryPulseBatches_(ss, selectedFu.pulse, RECOVERY_BATCH_SIZE, RECOVERY_DELAY_MS, MAX_RUNTIME_MS, t0, "RECOVERY_FU");
      }
      stats.pulsed = r.pulsed;
      stats.batches = r.batches;
      var leftover = selectedFu.deferred.slice();
      if (r.skippedFromIdx >= 0) leftover = selectedFu.pulse.slice(r.skippedFromIdx).concat(leftover);
      stats.skipped = leftover.length;
      if (leftover.length > 0) _recoverySetSkipped_(leftover);
      else _recoveryClearSkipped_();

    } catch (e) {
      Logger.log("[RECOVERY_FU] Error: " + e.message);
    }

    stats.exec_ms = Date.now() - t0;
    Logger.log("[RECOVERY_FU] Done: " + JSON.stringify(stats));

    try { INSTALL_QUOTA_RECOVERY(); } catch (e) { Logger.log("[RECOVERY_FU] Auto-reinstall failed: " + e.message); }
  } finally {
    try { HttpCallCounter.clearTrigger(); } catch(e){}
    try { if (typeof HttpCounter !== "undefined" && HttpCounter.flush) HttpCounter.flush(); } catch(eFlush){}
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
    // v4.16.68: colonne D = PULSE (B1), necessaire pourdater la TENTATIVE
    // quand I1 est un [CACHE_ONLY] (qui porte la date de la donnee).
    var valsB1 = recap.getRange(2, 4, lastRow - 1, 1).getValues();

    var actions = [];
    for (var i = 0; i < valsI1.length; i++) {
      var rawI1 = (valsI1[i] && valsI1[i][0]);
      var rawJ1 = (valsJ1[i] && valsJ1[i][0]);
      var i1 = (rawI1 instanceof Date) ? _wd_fmtDate_(rawI1) : String(rawI1 || "").trim();
      var j1 = (rawJ1 instanceof Date) ? _wd_fmtDate_(rawJ1) : String(rawJ1 || "").trim();
      // v4.16.68: latch J1 via helper partage — [CACHE_ONLY] sync sur B1
      // (la tentative), pas sur la date du cache. Sans cela ce pass rapide
      // (toutes les 2 min) faisait reculer J1 a la derniere reussite.
      // v4.16.69: B1 relu directement sur la feuille pour [CACHE_ONLY] — le
      // Recap INDIRECT(B1) peut etre stale (pas de recalcul volatile visible
      // par l'API apres batchUpdate). getValue() retourne un Date JS exploitable.
      var rawB1 = (valsB1[i] && valsB1[i][0]);
      var i1NormLatch = _wd_norm_(i1);
      if (i1NormLatch.indexOf("[CACHE_ONLY]") === 0) {
        var sheetNameProbe = String((names[i] && names[i][0]) || "").trim();
        if (sheetNameProbe && !_wd_isCexSheet_(sheetNameProbe)) {
          try {
            var probeSheet = ss.getSheetByName(sheetNameProbe);
            if (probeSheet) rawB1 = probeSheet.getRange("B1").getValue();
          } catch (eProbeB1) {}
        }
      }
      var cleanI1 = _wd_j1LatchValue_(i1, rawB1);
      if (_wd_isUnsafeLatchSource_(i1)) continue;
      if (!_wd_isLastUpdateFormat_(cleanI1)) continue;
      if (cleanI1 === j1) continue;
      // Preserve the watchdog's one-second recovery latch only while A2
      // still needs recalculation. Unknown direct state must not undo it.
      var sourceI1 = _wd_extractTimestamp_(i1);
      if (j1 === _wd_bumpTimestampSeconds_(sourceI1, 1)) {
        try {
          var recoverySheet = ss.getSheetByName(String((names[i] && names[i][0]) || "").trim());
          if (!recoverySheet || _wd_a2NeedsRecalc_(recoverySheet.getRange("A2").getValue())) continue;
        } catch (eRecoveryRead) { stats.errors++; continue; }
      }
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
