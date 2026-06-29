// v4.15.55 - Central automatic self-heal, no menu/onOpen dependency
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

var WCORE_AUTO_HEAL_VERSION = "4.15.100";
var WCORE_AUTO_HEAL_COOLDOWN_MS = 10 * 60 * 1000;
var WCORE_AUTO_HEAL_SPREADSHEET_ID = "1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4";
var WCORE_AUTO_HEAL_WD_STALE_MS = 30 * 60 * 1000;
// v4.15.51: J1 staleness self-repair (_wcoreAutoHealJ1Staleness_) — detects a
// SYNC_J1 trigger that is present but silently stopped firing, force-syncs J1
// and revives the trigger. Spec bumped to force a clean trigger reinstall.
// v4.15.99: MASTER_ON_EDIT re-enabled — A1 checkbox manual refresh for Ledger sheets.
// Installable onEdit trigger pulses B1 then resets A1=FALSE when user checks A1.
var WCORE_AUTO_HEAL_TRIGGER_SPEC = "v4.15.100:activity10:recap5:recovery30:syncJ1Script:ledgerChange:pricingWorker:cexWatchdogCentralOnly:cexHourlyRefresh:topMarketcapWeekly:masterOnEdit:j1staleness:ssAccessProbe:quotaSelfReset:wdDiagHeartbeat";

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
  ScriptApp.newTrigger("ACTIVITY_WATCHDOG").timeBased().everyMinutes(10).create();
  stats.timeTriggers++;
  ScriptApp.newTrigger("WATCHDOG_FROM_RECAP").timeBased().everyMinutes(5).create();
  stats.timeTriggers++;
  ScriptApp.newTrigger("QUOTA_RECOVERY_SWEEP").timeBased().everyMinutes(30).create();
  stats.timeTriggers++;
  ScriptApp.newTrigger("_runPricingWorker").timeBased().everyMinutes(5).create();
  stats.timeTriggers++;
  ScriptApp.newTrigger("SYNC_J1_ALL_SHEETS").timeBased().everyMinutes(5).create();
  stats.timeTriggers++;
  ScriptApp.newTrigger("BITPANDA_REFRESH_WATCHDOG").timeBased().everyMinutes(1).create();
  stats.timeTriggers++;
  // v4.15.98: refresh horaire centralise de TOUS les onglets CEX.
  ScriptApp.newTrigger("CEX_HOURLY_REFRESH").timeBased().everyHours(1).create();
  stats.timeTriggers++;
  // v4.15.100: Top 300 market cap (Google Finance) refresh hebdomadaire (lundi ~06h).
  ScriptApp.newTrigger("UPDATE_TOP_MARKETCAP").timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
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

function _wcoreAutoHealEnsureTriggers_(out, props, force) {
  var managed = ["ACTIVITY_WATCHDOG", "WATCHDOG_FROM_RECAP", "QUOTA_RECOVERY_SWEEP", "QUOTA_RECOVERY_SWEEP_FOLLOWUP", "LEDGER_ON_CHANGE", "_runPricingWorker", "MASTER_ON_EDIT", "SYNC_J1_ALL_SHEETS", "BITPANDA_REFRESH_WATCHDOG", "CEX_HOURLY_REFRESH", "UPDATE_TOP_MARKETCAP", "UPDATE_BITPANDA_SPOT", "UPDATE_BINANCE_SPOT", "UPDATE_BITFINEX_SPOT", "UPDATE_BYBIT_SPOT", "BINANCE_REFRESH_WATCHDOG", "BITFINEX_REFRESH_WATCHDOG", "BYBIT_REFRESH_WATCHDOG"];
  var required = ["ACTIVITY_WATCHDOG", "WATCHDOG_FROM_RECAP", "QUOTA_RECOVERY_SWEEP", "LEDGER_ON_CHANGE", "_runPricingWorker", "SYNC_J1_ALL_SHEETS", "BITPANDA_REFRESH_WATCHDOG", "CEX_HOURLY_REFRESH", "UPDATE_TOP_MARKETCAP", "MASTER_ON_EDIT"];
  var spec = props.getProperty("WCORE_AUTO_HEAL_TRIGGER_SPEC") || "";
  var counts = _wcoreAutoHealCountHandlers_(required);
  var needsInstall = force || spec !== WCORE_AUTO_HEAL_TRIGGER_SPEC;

  for (var i = 0; i < required.length; i++) {
    if (counts[required[i]] !== 1) needsInstall = true;
  }

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
    props.setProperty("PRICING_WORKER_ENABLED", "true");
    props.setProperty("PRICING_WORKER_INTERVAL_MIN", "5");
    _wcoreAutoHealRow_(out, "Pricing worker", "OK", "enabled interval=5min");
  } catch (eWorker) {
    _wcoreAutoHealRow_(out, "Pricing worker", "WARN", eWorker.message);
  }
}

function _wcoreAutoHealBootstrapState_(out, force) {
  try {
    if (typeof _ensureLedgerCache_ === "function") _ensureLedgerCache_(false);
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
      var j1Repair = REPAIR_J1_LATCH_FORMULAS(200);
      _wcoreAutoHealRow_(out, "J1 latch repair", "OK", "repaired=" + (j1Repair.repaired || 0) + " cleared=" + (j1Repair.cleared || 0));
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

  if (!force && staleCount < STALE_COUNT_THRESHOLD) {
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
    _wcoreAutoHealEnsureTriggers_(out, props, force === true);
    _wcoreAutoHealEnsurePricingWorker_(out, props);
    _wcoreAutoHealBootstrapState_(out, force === true);
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
  var counts = _wcoreAutoHealCountHandlers_(["ACTIVITY_WATCHDOG", "WATCHDOG_FROM_RECAP", "QUOTA_RECOVERY_SWEEP", "LEDGER_ON_CHANGE", "MASTER_ON_EDIT", "_runPricingWorker", "SYNC_J1_ALL_SHEETS"]);
  out.push(["ACTIVITY_WATCHDOG", counts.ACTIVITY_WATCHDOG || 0]);
  out.push(["WATCHDOG_FROM_RECAP", counts.WATCHDOG_FROM_RECAP || 0]);
  out.push(["QUOTA_RECOVERY_SWEEP", counts.QUOTA_RECOVERY_SWEEP || 0]);
  out.push(["LEDGER_ON_CHANGE", counts.LEDGER_ON_CHANGE || 0]);
  out.push(["MASTER_ON_EDIT", counts.MASTER_ON_EDIT || 0]);
  out.push(["_runPricingWorker", counts._runPricingWorker || 0]);
  out.push(["SYNC_J1_ALL_SHEETS", counts.SYNC_J1_ALL_SHEETS || 0]);
  out.push(["PHASE_C_ENABLED", props.getProperty("PHASE_C_ENABLED") || ""]);
  out.push(["PRICING_WORKER_ENABLED", props.getProperty("PRICING_WORKER_ENABLED") || ""]);
  out.push(["PRICING_WORKER_INTERVAL_MIN", props.getProperty("PRICING_WORKER_INTERVAL_MIN") || ""]);
  return out;
}

function WCORE_AUTO_HEAL_FORCE() {
  return WCORE_AUTO_HEAL("force", true);
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
