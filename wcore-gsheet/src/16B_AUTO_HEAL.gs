// v4.16.30 - Auto-heal: delete stale _runPricingWorker triggers (disabled since v4.15.34 but old triggers may persist).
// v4.15.142 - Add hourly Portefeuille Action refresh trigger.
// v4.15.140 - Install dedicated Bitpanda stocks/fiat trigger so Bitpanda stocks cannot starve behind crypto/fiat writes
// v4.15.136 - Reinstall CEX triggers when any individual CEX sheet is stale
/************************************************************
 * 16B_AUTO_HEAL.gs - WCORE Automatic Self-Heal
 *
 * Keeps installable triggers and activity bootstrap state healthy without
 * requiring UI menu clicks or Apps Script editor actions.
 *
 * v4.15.39 - Restore script-driven J1 sync. J1 must be a stored timestamp value,
 *   not a self-referencing Sheet formula.
 * v4.15.38 - J1 is now a Sheet-side latch formula; keep sync trigger disabled.
 * v4.15.37 - Re-enable SYNC_J1_ALL_SHEETS trigger for successful I1 only.
 *   Ledger cache formulas depend on J1 to avoid recalculation during I1 loading.
 * v4.15.36 - Disable SYNC_J1_ALL_SHEETS trigger: Ledger cache formulas
 *   now depend directly on I1, so J1 sync writes are obsolete.
 * v4.15.35 - SYNC_J1_ALL_SHEETS trigger every 1 min with 60s heartbeat
 * v4.15.32 - Added SYNC_J1_ALL_SHEETS trigger (every 2 min) for fast
 *   J1 sync after I1 scan completes. Eliminates ~60 min worst-case delay
 *   when waiting for WATCHDOG_FROM_RECAP probe window.
 ************************************************************/

var WCORE_AUTO_HEAL_VERSION = "4.16.30";
var WCORE_AUTO_HEAL_COOLDOWN_MS = 10 * 60 * 1000;
var WCORE_AUTO_HEAL_SPREADSHEET_ID = "1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4";
var WCORE_AUTO_HEAL_WD_STALE_MS = 30 * 60 * 1000;
// v4.16.30: _runPricingWorker added to managed trigger list + active cleanup.
// v4.15.51: J1 staleness self-repair (_wcoreAutoHealJ1Staleness_) — detects a
// SYNC_J1 trigger that is present but silently stopped firing, force-syncs J1
// and revives the trigger. Spec bumped to force a clean trigger reinstall.
// v4.15.99: MASTER_ON_EDIT re-enabled — A1 checkbox manual refresh for Ledger sheets.
// Installable onEdit trigger pulses B1 then resets A1=FALSE when user checks A1.
var WCORE_AUTO_HEAL_TRIGGER_SPEC = "v4.16.30:autoHealTimer10:recap5:recovery30:syncJ1Script:ledgerChange:pricingWorker:cexManualQueue:cexHourlyPerConnector:bitpandaStocksHourly:stockPortfolioHourly:topMarketcapWeekly:masterOnEdit:ssAccessProbe:pricingWorkerCleanup:activityDisabled:cexRelayAll";
var WCORE_AUTO_HEAL_CEX_STALE_MS = 5 * 60 * 60 * 1000;

function _wcoreAutoHealRow_(out, step, status, details) {
  out.push([step, status, details || ""]);
}

function _wcoreAutoHealDeleteHandlers_(handlers) {
  var wanted = {};
  for (var h = 0; h < handlers.length; h++) wanted[handlers[h]] = true;
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    var fn = "";
    try { fn = triggers[i].getHandlerFunction(); } catch (e) {}
    if (wanted[fn]) {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  return removed;
}

function _wcoreAutoHealCountHandlers_(handlers) {
  var wanted = {};
  var counts = {};
  for (var h = 0; h < handlers.length; h++) {
    wanted[handlers[h]] = true;
    counts[handlers[h]] = 0;
  }
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var fn = "";
    try { fn = triggers[i].getHandlerFunction(); } catch (e) {}
    if (wanted[fn]) counts[fn]++;
  }
  return counts;
}

function _wcoreAutoHealCreateManagedTriggers_() {
  var stats = { timeTriggers: 0, spreadsheetTriggers: 0, spreadsheetSkipped: "" };
  ScriptApp.newTrigger("WCORE_AUTO_HEAL_TIMER").timeBased().everyMinutes(10).create();
  stats.timeTriggers++;
  // v4.16.30: ACTIVITY_WATCHDOG DISABLED — was consuming ~5760 UrlFetch calls/day
  // (120+ wallets × eth_getTransactionCount via fetchAll, every 30 min).
  // WATCHDOG_FROM_RECAP (every 5 min, I1 > 5h stale detection) is sufficient
  // for refresh scheduling. Activity-based refresh is not needed.
  ScriptApp.newTrigger("WATCHDOG_FROM_RECAP").timeBased().everyMinutes(5).create();
  stats.timeTriggers++;
  ScriptApp.newTrigger("QUOTA_RECOVERY_SWEEP").timeBased().everyMinutes(30).create();
  stats.timeTriggers++;
  // v4.15.34: _runPricingWorker DISABLED — WEB_SCAN handles pricing server-side on Railway
  ScriptApp.newTrigger("SYNC_J1_ALL_SHEETS").timeBased().everyMinutes(5).create();
  stats.timeTriggers++;
  // v4.15.120: hourly per-connector CEX triggers. The old central 4h refresh
  // made one long sequential execution a single point of failure.
  ScriptApp.newTrigger("UPDATE_BITPANDA_SPOT").timeBased().everyHours(1).create();
  stats.timeTriggers++;
  ScriptApp.newTrigger("UPDATE_BITPANDA_STOCKS_FIAT").timeBased().everyHours(1).create();
  stats.timeTriggers++;
  // v4.16.30: consolidated relay-based CEXs (Binance+Bybit+Coinbase+OKX) into 1 call.
  // Replaces 4 individual hourly triggers -> saves ~3 UrlFetch calls/hour.
  if (typeof UPDATE_CEX_RELAY_ALL === "function") {
    ScriptApp.newTrigger("UPDATE_CEX_RELAY_ALL").timeBased().everyHours(1).create();
    stats.timeTriggers++;
  } else {
    ScriptApp.newTrigger("UPDATE_BINANCE_SPOT").timeBased().everyHours(1).create();
    stats.timeTriggers++;
    ScriptApp.newTrigger("UPDATE_BYBIT_SPOT").timeBased().everyHours(1).create();
    stats.timeTriggers++;
    ScriptApp.newTrigger("UPDATE_COINBASE_SPOT").timeBased().everyHours(1).create();
    stats.timeTriggers++;
    ScriptApp.newTrigger("UPDATE_OKX_SPOT").timeBased().everyHours(1).create();
    stats.timeTriggers++;
  }
  ScriptApp.newTrigger("UPDATE_BITFINEX_SPOT").timeBased().everyHours(1).create();
  stats.timeTriggers++;
  ScriptApp.newTrigger("UPDATE_KRAKEN_SPOT").timeBased().everyHours(1).create();
  stats.timeTriggers++;
  if (typeof STOCK_PORTFOLIO_HOURLY_REFRESH === "function") {
    ScriptApp.newTrigger("STOCK_PORTFOLIO_HOURLY_REFRESH").timeBased().everyHours(1).create();
    stats.timeTriggers++;
  }
  if (typeof CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH === "function") {
    ScriptApp.newTrigger("CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH").timeBased().everyHours(1).create();
    stats.timeTriggers++;
  }
  // v4.15.118: 1-min safety net that drains the CEX_MANUAL_JOB_QUEUE.
  // GAS one-shot triggers (after(1s)) have ~1 min granularity and silently
  // miss in some saturation windows. A 1-min recurring trigger is reliable
  // and is a no-op when the queue is empty (NO_JOB return).
  ScriptApp.newTrigger("CEX_MANUAL_REFRESH_WORKER").timeBased().everyMinutes(1).create();
  stats.timeTriggers++;
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (eActive) { stats.spreadsheetSkipped = eActive.message; }
  if (!ss) {
    try { ss = SpreadsheetApp.openById(WCORE_AUTO_HEAL_SPREADSHEET_ID); } catch (eOpen) { if (!stats.spreadsheetSkipped) stats.spreadsheetSkipped = eOpen.message; }
  }
  if (ss) {
    ScriptApp.newTrigger("LEDGER_ON_CHANGE").forSpreadsheet(ss).onChange().create();
    stats.spreadsheetTriggers++;
    ScriptApp.newTrigger("MASTER_ON_EDIT").forSpreadsheet(ss).onEdit().create();
    stats.spreadsheetTriggers++;
  }
  return stats;
}

function _wcoreAutoHealWatchdogDiagAgeMs_(props) {
  try {
    var runMsRaw = props.getProperty("WCORE_WD_LAST_RUN_MS") || "";
    var runMs = parseInt(runMsRaw, 10);
    if (isFinite(runMs) && runMs > 0) return Date.now() - runMs;

    var raw = props.getProperty("WCORE_WD_LAST_DIAG") || "";
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    var ts = parsed && (parsed.lastRunTs || (parsed.stats && parsed.stats.ts));
    if (!ts) return null;
    var t = Date.parse(String(ts));
    if (!isFinite(t)) return null;
    return Date.now() - t;
  } catch (e) {
    return null;
  }
}

function _wcoreAutoHealParseStampMs_(value) {
  try {
    var m = String(value || "").match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?/);
    if (!m) return 0;
    var t = Date.parse(m[0].replace(" ", "T"));
    return isFinite(t) ? t : 0;
  } catch (e) {
    return 0;
  }
}

function _wcoreAutoHealCexStatus_(props) {
  var now = Date.now();
  var hb = parseInt(props.getProperty("CEX_HOURLY_REFRESH_LAST_MS") || "0", 10);
  var hbAgeMs = (isFinite(hb) && hb > 0) ? (now - hb) : null;

  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (eActive) {}
  if (!ss) {
    try { ss = SpreadsheetApp.openById(WCORE_AUTO_HEAL_SPREADSHEET_ID); } catch (eOpen) {}
  }
  if (!ss) return hbAgeMs == null ? null : { mode: "heartbeat", ageMs: hbAgeMs, staleCount: 0, total: 0 };

  var names = [
    "CEX - Binance",
    "CEX - Bitfinex",
    "CEX - Bitpanda Commodity",
    "CEX - Bitpanda Crypto",
    "CEX - Bitpanda Fiat",
    "CEX - Bitpanda Stocks",
    "CEX - Bybit",
    "CEX - Coinbase",
    "CEX - OKX",
    "CEX - Kraken"
  ];
  var newest = 0;
  var staleCount = 0;
  var total = 0;
  for (var i = 0; i < names.length; i++) {
    try {
      var sh = ss.getSheetByName(names[i]);
      if (!sh) continue;
      var t = _wcoreAutoHealParseStampMs_(sh.getRange("B1").getDisplayValue());
      if (t > 0) {
        total++;
        if ((now - t) > WCORE_AUTO_HEAL_CEX_STALE_MS) staleCount++;
      }
      if (t > newest) newest = t;
    } catch (eSheet) {}
  }
  if (newest > 0) {
    return {
      mode: hbAgeMs == null ? "sheetB1" : "heartbeat+sheetB1",
      ageMs: hbAgeMs == null ? (now - newest) : hbAgeMs,
      sheetAgeMs: now - newest,
      staleCount: staleCount,
      total: total
    };
  }
  return hbAgeMs == null ? null : { mode: "heartbeat", ageMs: hbAgeMs, staleCount: 0, total: 0 };
}

function _wcoreAutoHealEnsureTriggers_(out, props, force) {
  // v4.16.30: _runPricingWorker + UPDATE_CEX_RELAY_ALL in managed, ACTIVITY_WATCHDOG disabled
  var managed = ["WCORE_AUTO_HEAL_TIMER", "ACTIVITY_WATCHDOG", "WATCHDOG_FROM_RECAP", "QUOTA_RECOVERY_SWEEP", "QUOTA_RECOVERY_SWEEP_FOLLOWUP", "LEDGER_ON_CHANGE", "MASTER_ON_EDIT", "SYNC_J1_ALL_SHEETS", "BITPANDA_REFRESH_WATCHDOG", "CEX_HOURLY_REFRESH", "CEX_MANUAL_REFRESH_WORKER", "UPDATE_TOP_MARKETCAP", "UPDATE_BITPANDA_SPOT", "UPDATE_BITPANDA_STOCKS_FIAT", "UPDATE_CEX_RELAY_ALL", "UPDATE_BINANCE_SPOT", "UPDATE_BITFINEX_SPOT", "UPDATE_BYBIT_SPOT", "UPDATE_COINBASE_SPOT", "UPDATE_OKX_SPOT", "UPDATE_KRAKEN_SPOT", "STOCK_PORTFOLIO_HOURLY_REFRESH", "CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH", "BINANCE_REFRESH_WATCHDOG", "BITFINEX_REFRESH_WATCHDOG", "BYBIT_REFRESH_WATCHDOG", "KRAKEN_REFRESH_WATCHDOG", "_runPricingWorker"];
  var required = ["WCORE_AUTO_HEAL_TIMER", "WATCHDOG_FROM_RECAP", "QUOTA_RECOVERY_SWEEP", "LEDGER_ON_CHANGE", "SYNC_J1_ALL_SHEETS", "UPDATE_BITPANDA_SPOT", "UPDATE_BITPANDA_STOCKS_FIAT", "UPDATE_CEX_RELAY_ALL", "UPDATE_BITFINEX_SPOT", "UPDATE_KRAKEN_SPOT", "STOCK_PORTFOLIO_HOURLY_REFRESH", "CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH", "CEX_MANUAL_REFRESH_WORKER", "MASTER_ON_EDIT"];
  var spec = props.getProperty("WCORE_AUTO_HEAL_TRIGGER_SPEC") || "";
  var counts = _wcoreAutoHealCountHandlers_(required);
  var needsInstall = force || spec !== WCORE_AUTO_HEAL_TRIGGER_SPEC;

  for (var i = 0; i < required.length; i++) {
    if (counts[required[i]] !== 1) needsInstall = true;
  }

  if (needsInstall) {
    _wcoreAutoHealRow_(out, "Liveness probes", "SKIP", "force/spec/count mismatch -> reinstalling triggers first");
  } else {
    // v4.15.61: A trigger can be present (count=1) but run under a STALE
    // authorization (e.g. after repeated clasp pushes), making
    // SpreadsheetApp.openById() and the advanced Sheets service fail inside the
    // trigger context — the watchdog then silently writes nothing (root cause of
    // the 2026-06-01 freeze: B1/I1/J1 frozen while triggers showed "Completed").
    // Detect that "present-but-unauthorized" blind spot by probing real
    // spreadsheet access and force a reinstall so the handlers are re-authorized.
    var ssAccessOk = false;
    try { ssAccessOk = !!_wcoreGetSpreadsheet_(); } catch (eProbe) { ssAccessOk = false; }
    if (!ssAccessOk) {
      needsInstall = true;
      var openErr = "";
      try { openErr = props.getProperty("WCORE_SS_OPEN_ERR") || ""; } catch (eErr) {}
      _wcoreAutoHealRow_(out, "SS access", "FAIL", "openById/active unavailable -> forcing trigger reinstall " + openErr);
    } else {
      _wcoreAutoHealRow_(out, "SS access", "OK", "spreadsheet reachable");
    }

    // v4.15.83: The trigger inventory can be fresh while WATCHDOG_FROM_RECAP is
    // effectively dead (observed 2026-06-11: J1 kept syncing through cache-only
    // paths, but WCORE_WD_LAST_DIAG stayed on 2026-06-02 and B1 stayed on 08/06).
    // Treat the watchdog heartbeat as the real liveness signal and revive all
    // managed triggers when it stops moving.
    var wdAgeMs = _wcoreAutoHealWatchdogDiagAgeMs_(props);
    if (wdAgeMs == null) {
      _wcoreAutoHealRow_(out, "Watchdog heartbeat", "UNKNOWN", "WCORE_WD_LAST_RUN_MS/DIAG missing or unparseable");
    } else if (wdAgeMs > WCORE_AUTO_HEAL_WD_STALE_MS) {
      needsInstall = true;
      _wcoreAutoHealRow_(out, "Watchdog heartbeat", "STALE", "ageMin=" + Math.round(wdAgeMs / 60000) + " -> forcing trigger reinstall");
    } else {
      _wcoreAutoHealRow_(out, "Watchdog heartbeat", "OK", "ageMin=" + Math.round(wdAgeMs / 60000));
    }

    var cexStatus = _wcoreAutoHealCexStatus_(props);
    if (cexStatus == null) {
      _wcoreAutoHealRow_(out, "CEX heartbeat", "UNKNOWN", "no CEX heartbeat/B1 timestamp");
    } else if ((cexStatus.mode === "heartbeat" && cexStatus.ageMs > WCORE_AUTO_HEAL_CEX_STALE_MS) || (cexStatus.mode !== "heartbeat" && cexStatus.staleCount >= 1)) {
      needsInstall = true;
      _wcoreAutoHealRow_(out, "CEX heartbeat", "STALE", "mode=" + cexStatus.mode + " ageMin=" + Math.round(cexStatus.ageMs / 60000) + " stale=" + cexStatus.staleCount + "/" + cexStatus.total + " -> forcing trigger reinstall");
    } else {
      _wcoreAutoHealRow_(out, "CEX heartbeat", "OK", "mode=" + cexStatus.mode + " ageMin=" + Math.round(cexStatus.ageMs / 60000) + " stale=" + cexStatus.staleCount + "/" + cexStatus.total);
    }
  }

  if (!needsInstall) {
    _wcoreAutoHealRow_(out, "Triggers", "OK", "managed triggers already present");
    return;
  }

  var removed = _wcoreAutoHealDeleteHandlers_(managed);
  var createStats = _wcoreAutoHealCreateManagedTriggers_();
  props.setProperty("WCORE_AUTO_HEAL_TRIGGER_SPEC", WCORE_AUTO_HEAL_TRIGGER_SPEC);
  var details = "removed=" + removed + " spec=" + WCORE_AUTO_HEAL_TRIGGER_SPEC;
  if (createStats) {
    details += " time=" + createStats.timeTriggers + " sheet=" + createStats.spreadsheetTriggers;
    if (createStats.spreadsheetSkipped) details += " sheetSkipped=" + createStats.spreadsheetSkipped;
  }
  _wcoreAutoHealRow_(out, "Triggers", "REINSTALLED", details);
}

function _wcoreAutoHealEnsurePricingWorker_(out, props) {
  try {
    props.setProperty("PHASE_C_ENABLED", "true");
    // v4.15.34: PRICING_WORKER disabled — redundant with WEB_SCAN server-side pricing.
    // v4.16.30: Actively delete any stale _runPricingWorker triggers that may have
    // persisted from before v4.15.34, since the managed trigger list only deletes
    // triggers it knows about and _runPricingWorker was never added to it.
    var pwRemoved = 0;
    try {
      if (typeof UNINSTALL_PRICING_WORKER_TRIGGER === "function") {
        var uninstallResult = UNINSTALL_PRICING_WORKER_TRIGGER();
        pwRemoved = (uninstallResult && uninstallResult.match) ? parseInt(String(uninstallResult).match(/\d+/), 10) || 0 : 0;
      } else {
        var triggers = ScriptApp.getProjectTriggers();
        for (var pwi = 0; pwi < triggers.length; pwi++) {
          var pwFn = "";
          try { pwFn = triggers[pwi].getHandlerFunction(); } catch (e) {}
          if (pwFn === "_runPricingWorker") {
            ScriptApp.deleteTrigger(triggers[pwi]);
            pwRemoved++;
          }
        }
      }
    } catch (ePwClean) {}
    _wcoreAutoHealRow_(out, "Pricing worker", "DISABLED", "v4.15.34 — WEB_SCAN handles pricing" + (pwRemoved > 0 ? "; removed " + pwRemoved + " stale trigger(s)" : ""));
  } catch (eWorker) {
    _wcoreAutoHealRow_(out, "Pricing worker", "WARN", eWorker.message);
  }
}

function _wcoreAutoHealBootstrapState_(out, force) {
  try {
    if (typeof _wcoreAutoHealNewLedgers_ === "function") {
      _wcoreAutoHealNewLedgers_(out, force === true);
    } else if (typeof _ensureLedgerCache_ === "function") {
      _ensureLedgerCache_(false);
    }
    _wcoreAutoHealRow_(out, "Ledger cache", "OK", "checked");
  } catch (eLedger) {
    _wcoreAutoHealRow_(out, "Ledger cache", "WARN", eLedger.message);
  }

  try {
    var rpcBefore = (typeof _RpcLookup !== "undefined" && _RpcLookup.count) ? _RpcLookup.count() : 0;
    if (typeof REPAIR_RPC_LOOKUP_FROM_REGISTRY === "function") {
      REPAIR_RPC_LOOKUP_FROM_REGISTRY(force === true);
    }
    var rpcAfter = (typeof _RpcLookup !== "undefined" && _RpcLookup.count) ? _RpcLookup.count() : 0;
    // v4.15.42: Auto-run BUILD_RPC_LOOKUP if still empty (trigger-safe now)
    if (rpcAfter === 0 && typeof BUILD_RPC_LOOKUP === "function") {
      BUILD_RPC_LOOKUP();
      rpcAfter = (typeof _RpcLookup !== "undefined" && _RpcLookup.count) ? _RpcLookup.count() : 0;
    }
    _wcoreAutoHealRow_(out, "RPC lookup", rpcAfter > rpcBefore ? "REPAIRED" : "OK", "count=" + rpcAfter + " repaired=" + Math.max(0, rpcAfter - rpcBefore));
  } catch (eRpc) {
    _wcoreAutoHealRow_(out, "RPC lookup", "WARN", eRpc.message);
  }

  try {
    if (typeof REPAIR_J1_LATCH_FORMULAS === "function") {
      var j1Last = parseInt(PropertiesService.getScriptProperties().getProperty("WCORE_J1_LATCH_REPAIR_LAST_MS") || "0", 10);
      var j1Age = isFinite(j1Last) && j1Last > 0 ? (Date.now() - j1Last) : Infinity;
      if (j1Age < 24 * 60 * 60 * 1000) {
        _wcoreAutoHealRow_(out, "J1 latch repair", "SKIP", "ageMin=" + Math.round(j1Age / 60000));
      } else {
        var j1Repair = REPAIR_J1_LATCH_FORMULAS(25);
        try { PropertiesService.getScriptProperties().setProperty("WCORE_J1_LATCH_REPAIR_LAST_MS", String(Date.now())); } catch (eJ1Prop) {}
        _wcoreAutoHealRow_(out, "J1 latch repair", "OK", "repaired=" + (j1Repair.repaired || 0) + " cleared=" + (j1Repair.cleared || 0));
      }
    }
  } catch (eJ1) {
    _wcoreAutoHealRow_(out, "J1 latch repair", "WARN", eJ1.message);
  }

  try {
    if (typeof PRUNE_ACTIVITY_NONCE_MAP_STALE === "function") {
      PRUNE_ACTIVITY_NONCE_MAP_STALE(force === true);
      _wcoreAutoHealRow_(out, "Activity prune", "OK", force ? "forced" : "cooldown-aware");
    }
  } catch (ePrune) {
    _wcoreAutoHealRow_(out, "Activity prune", "WARN", ePrune.message);
  }

  try {
    if (typeof ActivityTracker !== "undefined" && ActivityTracker.count &&
        ActivityTracker.count() === 0 && typeof DISCOVER_AND_REGISTER_WALLETS === "function") {
      DISCOVER_AND_REGISTER_WALLETS();
      _wcoreAutoHealRow_(out, "Activity bootstrap", "RAN", "nonce map was empty");
    } else {
      _wcoreAutoHealRow_(out, "Activity bootstrap", "OK", "count=" + (typeof ActivityTracker !== "undefined" && ActivityTracker.count ? ActivityTracker.count() : "n/a"));
    }
  } catch (eNonce) {
    _wcoreAutoHealRow_(out, "Activity bootstrap", "WARN", eNonce.message);
  }

  // v4.15.51 (Layer 2): J1 staleness self-repair.
  // A SYNC_J1 trigger that is present (count=1) but silently stopped firing
  // freezes the display latch (A1 re-reads only on J1 change). Detect a stale
  // gap between I1 (live scan ts) and J1 (latch) across the Recap Chain; if too
  // many sheets are stale, force a J1 sync AND revive the trigger by
  // delete+recreate (wakes a dead GAS time-trigger).
  try {
    _wcoreAutoHealJ1Staleness_(out, force === true);
  } catch (eStale) {
    _wcoreAutoHealRow_(out, "J1 staleness", "WARN", eStale.message);
  }

}

/**
 * v4.5.18: Auto-detect new ledger-shaped sheets that are not yet in the
 * listing cache. Recap chain links, I1 pulse, J1 sync happen automatically
 * without manual intervention when a new "Ledger - X" / "UniSwap - X" / etc.
 * sheet is added.
 *
 * Sheet I/O only (no HTTP). Idempotent: re-running on the same set is a no-op.
 */
function _wcoreAutoHealNewLedgers_(out, force) {
  if (typeof _isLedgerLike_ !== "function" || typeof _ensureLedgerCache_ !== "function") return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;
  var sheets = ss.getSheets();
  var known = {};
  try {
    var key = (typeof LEDGER_MAP_KEY !== "undefined") ? LEDGER_MAP_KEY : "LEDGER_SHEET_MAP";
    var raw = PropertiesService.getScriptProperties().getProperty(key);
    if (raw) known = JSON.parse(raw) || {};
  } catch (eKnown) {}
  var newOnes = [];
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    if (!known[name] && _isLedgerLike_(name)) newOnes.push(name);
  }
  if (newOnes.length === 0) {
    var hasKnownLedgerCache = false;
    try { hasKnownLedgerCache = Object.keys(known || {}).length > 0; } catch (eKnownCount) {}
    if (!force || hasKnownLedgerCache) return;
  }
  // Rebuild cache (idempotent, writes Recap links + map)
  _ensureLedgerCache_(true);
  var tz = ss.getSpreadsheetTimeZone() || "Europe/Paris";
  var stamp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
  var pulsed = 0;
  for (var j = 0; j < newOnes.length; j++) {
    try {
      var sh = ss.getSheetByName(newOnes[j]);
      if (sh) { sh.getRange("B1").setValue(stamp); pulsed++; }
    } catch (ePulse) {}
  }
  _wcoreAutoHealRow_(out, "New ledgers",
    newOnes.length > 0 ? "PULSED" : "OK",
    "new=" + newOnes.join(",") + " pulsedB1=" + pulsed);
}

/**
 * v4.15.51: Detect & repair a frozen J1 latch.
 * Stale = I1 is a valid timestamp, J1 differs, and the gap exceeds threshold.
 * If stale sheets >= threshold count, force SYNC_J1_ALL_SHEETS and revive the
 * dedicated trigger. Sheet I/O only (no HTTP).
 */
function _wcoreAutoHealJ1Staleness_(out, force) {
  var STALE_GAP_MS = 30 * 60 * 1000;   // 30 min gap = suspicious
  var STALE_COUNT_THRESHOLD = 10;      // this many stale sheets => repair
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) { _wcoreAutoHealRow_(out, "J1 staleness", "SKIP", "no ss"); return; }
   var recap = ss.getSheetByName("Recap Portfolio");
  if (!recap) { _wcoreAutoHealRow_(out, "J1 staleness", "SKIP", "no recap"); return; }
  var lastRow = recap.getLastRow();
  if (lastRow < 2) { _wcoreAutoHealRow_(out, "J1 staleness", "SKIP", "empty recap"); return; }

  var valsI1 = recap.getRange(2, 6, lastRow - 1, 1).getValues();
  var valsJ1 = recap.getRange(2, 7, lastRow - 1, 1).getValues();
  var staleCount = 0, maxGapMs = 0;
  for (var i = 0; i < valsI1.length; i++) {
    var rawI1 = valsI1[i] && valsI1[i][0];
    var rawJ1 = valsJ1[i] && valsJ1[i][0];
    var i1 = (rawI1 instanceof Date) ? _wd_fmtDate_(rawI1) : String(rawI1 || "").trim();
    var j1 = (rawJ1 instanceof Date) ? _wd_fmtDate_(rawJ1) : String(rawJ1 || "").trim();
    var cleanI1 = _wd_extractTimestamp_(i1);
    if (!_wd_isLastUpdateFormat_(cleanI1)) continue;
    if (cleanI1 === j1) continue;
    // both are "YYYY-MM-DD HH:MM:SS" comparable as ISO-ish via Date
    var tI1 = Date.parse(cleanI1.replace(" ", "T"));
    var tJ1 = _wd_isLastUpdateFormat_(j1) ? Date.parse(j1.replace(" ", "T")) : 0;
    var gap = (isFinite(tI1) ? tI1 : 0) - (isFinite(tJ1) ? tJ1 : 0);
    if (gap > STALE_GAP_MS) { staleCount++; if (gap > maxGapMs) maxGapMs = gap; }
  }

  if (staleCount < STALE_COUNT_THRESHOLD) {
    _wcoreAutoHealRow_(out, "J1 staleness", "OK", "stale=" + staleCount + " maxGapMin=" + Math.round(maxGapMs / 60000));
    return;
  }

  // Repair: force a full J1 sync now...
  var synced = 0;
  try { var r = SYNC_J1_ALL_SHEETS(); synced = (r && r.synced) || 0; } catch (eSync) {}

  // ...and revive the dedicated trigger (delete + recreate wakes a dead one)
  var revived = false;
  try {
    var trigs = ScriptApp.getProjectTriggers();
    for (var t = 0; t < trigs.length; t++) {
      var fn = ""; try { fn = trigs[t].getHandlerFunction(); } catch (e) {}
      if (fn === "SYNC_J1_ALL_SHEETS") { ScriptApp.deleteTrigger(trigs[t]); }
    }
    ScriptApp.newTrigger("SYNC_J1_ALL_SHEETS").timeBased().everyMinutes(5).create();
    revived = true;
  } catch (eRevive) {}

  _wcoreAutoHealRow_(out, "J1 staleness", "REPAIRED",
    "stale=" + staleCount + " synced=" + synced + " triggerRevived=" + revived);
}

function WCORE_AUTO_HEAL_TIMER() {
  return WCORE_AUTO_HEAL("WCORE_AUTO_HEAL_TIMER", false);
}

function WCORE_AUTO_HEAL(reason, force) {
  var out = [["Step", "Status", "Details"]];
  var props = PropertiesService.getScriptProperties();
  var nowMs = Date.now();
  var lastMs = parseInt(props.getProperty("WCORE_AUTO_HEAL_LAST_MS") || "0", 10);

  if (!force && isFinite(lastMs) && lastMs > 0 && (nowMs - lastMs) < WCORE_AUTO_HEAL_COOLDOWN_MS) {
    _wcoreAutoHealRow_(out, "Cooldown", "SKIPPED", "ageMs=" + (nowMs - lastMs));
    return out;
  }

  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(force === true ? 30000 : 500)) {
      if (force === true) {
        _wcoreAutoHealRow_(out, "Lock", "BYPASSED", "busy force");
      } else {
      _wcoreAutoHealRow_(out, "Lock", "SKIPPED", "busy");
      return out;
      }
    }
  } catch (eLock) {
    _wcoreAutoHealRow_(out, "Lock", "WARN", eLock.message);
    return out;
  }

  try {
    _wcoreAutoHealRow_(out, "Start", "OK", String(reason || "auto"));
    // v4.15.133: trigger repair must run before heavier bootstrap work. If
    // bootstrap stalls, stale WATCHDOG/CEX triggers still get reinstalled first.
    _wcoreAutoHealEnsureTriggers_(out, props, force === true);
    if (force === true) {
      _wcoreAutoHealRow_(out, "Bootstrap", "SKIP", "force mode repairs triggers only");
    } else {
      _wcoreAutoHealBootstrapState_(out, false);
    }
    _wcoreAutoHealEnsurePricingWorker_(out, props);
    // v4.15.100: wrap each setProperty individually so one quota error
    // doesn't crash the entire heal (triggers are already reinstalled by line 347).
    try { props.setProperty("WCORE_AUTO_HEAL_LAST_MS", String(nowMs)); } catch (eW1) {}
    try { props.setProperty("WCORE_AUTO_HEAL_LAST_REASON", String(reason || "auto")); } catch (eW2) {}
    try { props.setProperty("WCORE_AUTO_HEAL_LAST_RESULT", JSON.stringify(out).substring(0, 8000)); } catch (eW3) {}
    return out;
  } finally {
    try { lock.releaseLock(); } catch (eRelease) {}
  }
}

function WCORE_AUTO_HEAL_STATUS() {
  var props = PropertiesService.getScriptProperties();
  var out = [["Property", "Value"]];
  out.push(["Version", WCORE_AUTO_HEAL_VERSION]);
  out.push(["Trigger spec", props.getProperty("WCORE_AUTO_HEAL_TRIGGER_SPEC") || ""]);
  out.push(["Last heal", props.getProperty("WCORE_AUTO_HEAL_LAST_MS") || ""]);
  out.push(["Last reason", props.getProperty("WCORE_AUTO_HEAL_LAST_REASON") || ""]);
  var wdAgeMs = _wcoreAutoHealWatchdogDiagAgeMs_(props);
  out.push(["WATCHDOG_FROM_RECAP heartbeat age min", wdAgeMs == null ? "UNKNOWN" : Math.round(wdAgeMs / 60000)]);
  try {
    var counts = _wcoreAutoHealCountHandlers_(["WCORE_AUTO_HEAL_TIMER", "ACTIVITY_WATCHDOG", "WATCHDOG_FROM_RECAP", "QUOTA_RECOVERY_SWEEP", "LEDGER_ON_CHANGE", "MASTER_ON_EDIT", "SYNC_J1_ALL_SHEETS", "CEX_HOURLY_REFRESH", "UPDATE_BITPANDA_SPOT", "UPDATE_BITPANDA_STOCKS_FIAT", "UPDATE_CEX_RELAY_ALL", "UPDATE_BINANCE_SPOT", "UPDATE_BITFINEX_SPOT", "UPDATE_BYBIT_SPOT", "UPDATE_COINBASE_SPOT", "UPDATE_OKX_SPOT", "UPDATE_KRAKEN_SPOT", "STOCK_PORTFOLIO_HOURLY_REFRESH", "CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH", "CEX_MANUAL_REFRESH_WORKER", "BITPANDA_REFRESH_WATCHDOG", "BINANCE_REFRESH_WATCHDOG", "BITFINEX_REFRESH_WATCHDOG", "BYBIT_REFRESH_WATCHDOG", "KRAKEN_REFRESH_WATCHDOG"]);
    out.push(["WCORE_AUTO_HEAL_TIMER", counts.WCORE_AUTO_HEAL_TIMER || 0]);
    out.push(["ACTIVITY_WATCHDOG", counts.ACTIVITY_WATCHDOG || 0]);
    out.push(["WATCHDOG_FROM_RECAP", counts.WATCHDOG_FROM_RECAP || 0]);
    out.push(["QUOTA_RECOVERY_SWEEP", counts.QUOTA_RECOVERY_SWEEP || 0]);
    out.push(["LEDGER_ON_CHANGE", counts.LEDGER_ON_CHANGE || 0]);
    out.push(["MASTER_ON_EDIT", counts.MASTER_ON_EDIT || 0]);
    out.push(["SYNC_J1_ALL_SHEETS", counts.SYNC_J1_ALL_SHEETS || 0]);
    out.push(["CEX_HOURLY_REFRESH", counts.CEX_HOURLY_REFRESH || 0]);
    out.push(["UPDATE_BITPANDA_SPOT", counts.UPDATE_BITPANDA_SPOT || 0]);
    out.push(["UPDATE_BITPANDA_STOCKS_FIAT", counts.UPDATE_BITPANDA_STOCKS_FIAT || 0]);
    out.push(["UPDATE_CEX_RELAY_ALL", counts.UPDATE_CEX_RELAY_ALL || 0]);
    out.push(["UPDATE_BINANCE_SPOT", counts.UPDATE_BINANCE_SPOT || 0]);
    out.push(["UPDATE_BITFINEX_SPOT", counts.UPDATE_BITFINEX_SPOT || 0]);
    out.push(["UPDATE_BYBIT_SPOT", counts.UPDATE_BYBIT_SPOT || 0]);
    out.push(["UPDATE_COINBASE_SPOT", counts.UPDATE_COINBASE_SPOT || 0]);
    out.push(["UPDATE_OKX_SPOT", counts.UPDATE_OKX_SPOT || 0]);
    out.push(["UPDATE_KRAKEN_SPOT", counts.UPDATE_KRAKEN_SPOT || 0]);
    out.push(["STOCK_PORTFOLIO_HOURLY_REFRESH", counts.STOCK_PORTFOLIO_HOURLY_REFRESH || 0]);
    out.push(["CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH", counts.CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH || 0]);
    out.push(["CEX_MANUAL_REFRESH_WORKER", counts.CEX_MANUAL_REFRESH_WORKER || 0]);
    out.push(["BITPANDA_REFRESH_WATCHDOG", counts.BITPANDA_REFRESH_WATCHDOG || 0]);
    out.push(["BINANCE_REFRESH_WATCHDOG", counts.BINANCE_REFRESH_WATCHDOG || 0]);
    out.push(["BITFINEX_REFRESH_WATCHDOG", counts.BITFINEX_REFRESH_WATCHDOG || 0]);
    out.push(["BYBIT_REFRESH_WATCHDOG", counts.BYBIT_REFRESH_WATCHDOG || 0]);
    out.push(["KRAKEN_REFRESH_WATCHDOG", counts.KRAKEN_REFRESH_WATCHDOG || 0]);
  } catch (eCounts) {
    out.push(["Trigger counts", "NO_AUTH_IN_CUSTOM_FUNCTION: run WCORE_AUTO_HEAL_FORCE from Apps Script editor"]);
  }
  var cexStatus = _wcoreAutoHealCexStatus_(props);
  out.push(["CEX heartbeat age min", cexStatus == null ? "UNKNOWN" : Math.round(cexStatus.ageMs / 60000)]);
  out.push(["CEX heartbeat mode", cexStatus == null ? "UNKNOWN" : cexStatus.mode + " stale=" + cexStatus.staleCount + "/" + cexStatus.total]);
  out.push(["CEX last result", props.getProperty("CEX_HOURLY_REFRESH_LAST_RESULT") || ""]);
  out.push(["PHASE_C_ENABLED", props.getProperty("PHASE_C_ENABLED") || ""]);
  // PRICING_WORKER removed v4.15.34 — WEB_SCAN handles pricing server-side on Railway
  return out;
}

function WCORE_UPDATE_CRYPTO_PORTFOLIO_V2_NOW() {
  if (typeof UPDATE_CRYPTO_PORTFOLIO_V2 !== "function") {
    throw new Error("UPDATE_CRYPTO_PORTFOLIO_V2 not available");
  }
  return UPDATE_CRYPTO_PORTFOLIO_V2();
}

function WCORE_AUTO_HEAL_FORCE() {
  return WCORE_AUTO_HEAL("force", true);
}

function WCORE_TRIGGER_REINSTALL_FORCE_ONLY() {
  var props = PropertiesService.getScriptProperties();
  // v4.16.30: _runPricingWorker + UPDATE_CEX_RELAY_ALL + ACTIVITY_WATCHDOG in managed (all cleaned up, only required ones recreated)
  var managed = ["WCORE_AUTO_HEAL_TIMER", "ACTIVITY_WATCHDOG", "WATCHDOG_FROM_RECAP", "QUOTA_RECOVERY_SWEEP", "QUOTA_RECOVERY_SWEEP_FOLLOWUP", "LEDGER_ON_CHANGE", "MASTER_ON_EDIT", "SYNC_J1_ALL_SHEETS", "BITPANDA_REFRESH_WATCHDOG", "CEX_HOURLY_REFRESH", "CEX_MANUAL_REFRESH_WORKER", "UPDATE_TOP_MARKETCAP", "UPDATE_BITPANDA_SPOT", "UPDATE_BITPANDA_STOCKS_FIAT", "UPDATE_CEX_RELAY_ALL", "UPDATE_BINANCE_SPOT", "UPDATE_BITFINEX_SPOT", "UPDATE_BYBIT_SPOT", "UPDATE_COINBASE_SPOT", "UPDATE_OKX_SPOT", "UPDATE_KRAKEN_SPOT", "STOCK_PORTFOLIO_HOURLY_REFRESH", "CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH", "BINANCE_REFRESH_WATCHDOG", "BITFINEX_REFRESH_WATCHDOG", "BYBIT_REFRESH_WATCHDOG", "KRAKEN_REFRESH_WATCHDOG", "_runPricingWorker"];
  var removed = _wcoreAutoHealDeleteHandlers_(managed);
  var createStats = _wcoreAutoHealCreateManagedTriggers_();
  props.setProperty("WCORE_AUTO_HEAL_TRIGGER_SPEC", WCORE_AUTO_HEAL_TRIGGER_SPEC);
  props.setProperty("WCORE_AUTO_HEAL_LAST_MS", String(Date.now()));
  props.setProperty("WCORE_AUTO_HEAL_LAST_REASON", "WCORE_TRIGGER_REINSTALL_FORCE_ONLY");
  var result = {
    version: WCORE_AUTO_HEAL_VERSION,
    spec: WCORE_AUTO_HEAL_TRIGGER_SPEC,
    removed: removed,
    createdTime: createStats.timeTriggers,
    createdSheet: createStats.spreadsheetTriggers,
    sheetSkipped: createStats.spreadsheetSkipped || ""
  };
  console.log(JSON.stringify(result));
  return result;
}

function WCORE_CEX_TRIGGER_CLEANUP_FORCE() {
  var names = ["BITPANDA_REFRESH_WATCHDOG", "BINANCE_REFRESH_WATCHDOG", "BITFINEX_REFRESH_WATCHDOG", "BYBIT_REFRESH_WATCHDOG", "KRAKEN_REFRESH_WATCHDOG", "UPDATE_BITPANDA_SPOT", "UPDATE_BITPANDA_STOCKS_FIAT", "UPDATE_CEX_RELAY_ALL", "UPDATE_BINANCE_SPOT", "UPDATE_BITFINEX_SPOT", "UPDATE_BYBIT_SPOT", "UPDATE_COINBASE_SPOT", "UPDATE_OKX_SPOT", "UPDATE_KRAKEN_SPOT", "STOCK_PORTFOLIO_HOURLY_REFRESH", "CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH", "MASTER_ON_EDIT", "CEX_HOURLY_REFRESH", "CEX_MANUAL_REFRESH_WORKER"];
  var wanted = {};
  for (var n = 0; n < names.length; n++) wanted[names[n]] = true;
  var triggers = ScriptApp.getProjectTriggers();
  var removed = [];
  for (var i = 0; i < triggers.length; i++) {
    var fn = "";
    try { fn = triggers[i].getHandlerFunction(); } catch (eFn) {}
    if (wanted[fn]) {
      ScriptApp.deleteTrigger(triggers[i]);
      removed.push(fn);
    }
  }
  var installed = [];
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (eActive) {}
  if (!ss) {
    try { ss = SpreadsheetApp.openById(WCORE_AUTO_HEAL_SPREADSHEET_ID); } catch (eOpen) {}
  }
  if (ss) {
    ScriptApp.newTrigger("MASTER_ON_EDIT").forSpreadsheet(ss).onEdit().create();
    installed.push("MASTER_ON_EDIT");
  }
  ScriptApp.newTrigger("UPDATE_BITPANDA_SPOT").timeBased().everyHours(1).create();
  installed.push("UPDATE_BITPANDA_SPOT_1H");
  ScriptApp.newTrigger("UPDATE_BITPANDA_STOCKS_FIAT").timeBased().everyHours(1).create();
  installed.push("UPDATE_BITPANDA_STOCKS_FIAT_1H");
  ScriptApp.newTrigger("UPDATE_BINANCE_SPOT").timeBased().everyHours(1).create();
  installed.push("UPDATE_BINANCE_SPOT_1H");
  ScriptApp.newTrigger("UPDATE_BITFINEX_SPOT").timeBased().everyHours(1).create();
  installed.push("UPDATE_BITFINEX_SPOT_1H");
  ScriptApp.newTrigger("UPDATE_BYBIT_SPOT").timeBased().everyHours(1).create();
  installed.push("UPDATE_BYBIT_SPOT_1H");
  ScriptApp.newTrigger("UPDATE_COINBASE_SPOT").timeBased().everyHours(1).create();
  installed.push("UPDATE_COINBASE_SPOT_1H");
  ScriptApp.newTrigger("UPDATE_OKX_SPOT").timeBased().everyHours(1).create();
  installed.push("UPDATE_OKX_SPOT_1H");
  ScriptApp.newTrigger("UPDATE_KRAKEN_SPOT").timeBased().everyHours(1).create();
  installed.push("UPDATE_KRAKEN_SPOT_1H");
  if (typeof STOCK_PORTFOLIO_HOURLY_REFRESH === "function") {
    ScriptApp.newTrigger("STOCK_PORTFOLIO_HOURLY_REFRESH").timeBased().everyHours(1).create();
    installed.push("STOCK_PORTFOLIO_HOURLY_REFRESH_1H");
  }
  if (typeof CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH === "function") {
    ScriptApp.newTrigger("CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH").timeBased().everyHours(1).create();
    installed.push("CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH_1H");
  }
  // v4.15.118: 1-min safety net to drain the manual CEX queue reliably.
  try { ScriptApp.newTrigger("CEX_MANUAL_REFRESH_WORKER").timeBased().everyMinutes(1).create(); installed.push("CEX_MANUAL_REFRESH_WORKER_1MIN"); } catch (eNet) {}
  return "Removed CEX/manual triggers: " + (removed.length ? removed.join(", ") : "none") + ". Installed: " + installed.join(", ") + ".";
}

function WCORE_REMOVE_SYNC_J1_TRIGGER_FORCE() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    var fn = "";
    try { fn = triggers[i].getHandlerFunction(); } catch (e) {}
    if (fn === "SYNC_J1_ALL_SHEETS") {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  try {
    PropertiesService.getScriptProperties().setProperty("WCORE_AUTO_HEAL_TRIGGER_SPEC", WCORE_AUTO_HEAL_TRIGGER_SPEC);
  } catch (eProps) {}
  return { removed: removed, spec: WCORE_AUTO_HEAL_TRIGGER_SPEC };
}
