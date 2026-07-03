// v4.15.105 - Action Rebalancing!Z1 runs direct refresh immediately, with watchdog fallback on BUSY/error.
// v4.15.103 - Self-heal: re-install dead BITPANDA_REFRESH_WATCHDOG/CEX_HOURLY_REFRESH on user CEX edit (per "triggers présents mais mal autorisés" gotcha, v4.15.61).
// v4.15.93 - External refresh checkboxes must not write REQUEST into business B1 cells.
// v4.15.92 - On BUSY, prefer fresh row timestamp over keeping REQUEST in B1.
// v4.15.91 - Do not let a concurrent BUSY overwrite a successful B1 timestamp.
// v4.15.90 - Keep CEX manual request pending on BUSY so next watchdog retries.
// v4.15.89 - Add shared CEX manual-refresh helpers used by all CEX connectors.
// v4.15.88 - CEX watchdog writes visible B1 error/busy diagnostics when a manual refresh fails.
// v4.15.87 - Manual CEX refresh uses visible B1 REQUEST flag (Properties are unreliable across trigger contexts).
// v4.15.86 - CEX central watchdog handles Binance/Bitfinex/Bybit flags; UserProperties fallback when ScriptProperties is full.
// v4.15.85 - B1 = date pure "yyyy-MM-dd HH:mm:ss" (harmonie Recap Portfolio).
// v4.15.84 - Bitpanda API sync replacement for SyncWith imports
//
// Objectif: remplacer progressivement SyncWith pour les onglets Bitpanda.
// API keys stockees dans ScriptProperties, jamais dans la spreadsheet.
//
// Setup manuel (Apps Script editor):
//   SET_BITPANDA_API_KEY("...")
//
// Diagnostic sans ecriture:
//   DIAG_BITPANDA_API()
//
// Mise a jour:
//   UPDATE_BITPANDA_SPOT()

var BITPANDA_SYNC_VERSION = "4.15.105";

var BITPANDA_SYNC_CONFIG = {
  BASE_URL: "https://api.bitpanda.com/v1",
  API_KEY_PROP: "BITPANDA_API_KEY",
  STATUS_PROP: "BITPANDA_SYNC_STATUS",
  REFRESH_FLAG_PROP: "BITPANDA_REFRESH_REQUESTED",
  ACTION_REBALANCING_REFRESH_FLAG_PROP: "BITPANDA_ACTION_REBALANCING_REFRESH_REQUESTED",
  CRYPTO_CEX_REFRESH_FLAG_PROP: "CRYPTO_CEX_REFRESH_REQUESTED",
  SPREADSHEET_ID: "1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4",
  SHEETS: {
    CRYPTO: "CEX - Bitpanda Crypto",
    COMMODITY: "CEX - Bitpanda Commodity",
    FIAT: "CEX - Bitpanda Fiat",
    STOCKS: "CEX - Bitpanda Stocks"
    // v4.15.68: l'onglet "Bitpanda Spot Action" a ete supprime. Le bucket action
    // de l'API est desormais fusionne dans STOCKS (voir UPDATE_BITPANDA_SPOT).
  }
};

function SET_BITPANDA_API_KEY(apiKey) {
  if (!apiKey || String(apiKey).length < 20) throw new Error("API key invalide ou trop courte");
  PropertiesService.getScriptProperties().setProperty(BITPANDA_SYNC_CONFIG.API_KEY_PROP, String(apiKey).trim());
  return "OK: BITPANDA_API_KEY saved";
}

function CLEAR_BITPANDA_API_KEYS() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(BITPANDA_SYNC_CONFIG.API_KEY_PROP);
  return "OK: Bitpanda API keys cleared";
}

function _bpGetApiKey_(propName, required) {
  var key = PropertiesService.getScriptProperties().getProperty(propName);
  if (!key && required) throw new Error("Missing ScriptProperty " + propName + ". Run SET_BITPANDA_API_KEY(...)");
  return key;
}

function _bpFetch_(path, apiKey) {
  var url = BITPANDA_SYNC_CONFIG.BASE_URL + path;
  var resp = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
    headers: { "X-Api-Key": apiKey, "Accept": "application/json" }
  });
  if (!resp) throw new Error("Bitpanda " + path + " HTTP blocked/null response");
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error("Bitpanda " + path + " HTTP " + code + ": " + text.substring(0, 300));
  }
  return JSON.parse(text);
}

function _bpSetStatus_(status) {
  try {
    PropertiesService.getScriptProperties().setProperty(BITPANDA_SYNC_CONFIG.STATUS_PROP, JSON.stringify(status));
  } catch (err) {
    Logger.log("BITPANDA_SYNC_STATUS skipped: " + err);
  }
}

function _bpSetRefreshFlag_(propName) {
  var value = String(Date.now());
  try {
    PropertiesService.getScriptProperties().setProperty(propName, value);
    return "SCRIPT";
  } catch (eScript) {
    PropertiesService.getUserProperties().setProperty(propName, value);
    return "USER";
  }
}

function _bpGetRefreshFlag_(propName) {
  var scriptFlag = "";
  var userFlag = "";
  try { scriptFlag = PropertiesService.getScriptProperties().getProperty(propName) || ""; } catch (eScript) {}
  try { userFlag = PropertiesService.getUserProperties().getProperty(propName) || ""; } catch (eUser) {}
  return scriptFlag || userFlag;
}

function _bpDeleteRefreshFlag_(propName) {
  try { PropertiesService.getScriptProperties().deleteProperty(propName); } catch (eScript) {}
  try { PropertiesService.getUserProperties().deleteProperty(propName); } catch (eUser) {}
}

function _bpFmtStamp_() {
  return Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss");
}

// v4.15.109: Per-connector logical lock. The global LockService.getScriptLock()
// is shared by the 1-min watchdog, MASTER_ON_EDIT, wallet cache, pricing and
// auto-heal. Under trigger load it stays held, so every UPDATE_*_SPOT hit
// waitLock timeout and returned BUSY silently (Binance/Bitfinex/Bybit frozen for
// hours). A named ScriptProperties lease isolates each CEX connector.
var _CEX_LOCK_TTL_MS = 90 * 1000;

function CEX_ACQUIRE_LOCK(name) {
  var key = "CEX_LOCK_" + name;
  var props = PropertiesService.getScriptProperties();
  var now = Date.now();
  try {
    var raw = props.getProperty(key);
    if (raw) {
      var heldUntil = parseInt(raw, 10);
      if (isFinite(heldUntil) && heldUntil > now) return false;
    }
    props.setProperty(key, String(now + _CEX_LOCK_TTL_MS));
    return true;
  } catch (e) {
    // ScriptProperties unavailable/full: fail open so the update still runs.
    return true;
  }
}

function CEX_RELEASE_LOCK(name) {
  try { PropertiesService.getScriptProperties().deleteProperty("CEX_LOCK_" + name); } catch (e) {}
}

function _bpSetSheetRequestFlag_(sheet) {
  try { sheet.getRange("B1").setValue("REQUEST: " + _bpFmtStamp_()).setNumberFormat("@"); } catch (e) {}
}

function _bpGetSpreadsheet_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (eActive) {}
  if (!ss) ss = SpreadsheetApp.openById(BITPANDA_SYNC_CONFIG.SPREADSHEET_ID);
  return ss;
}

function _bpSheetHasRequest_(ss, sheetName) {
  try {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return false;
    return String(sh.getRange("B1").getDisplayValue() || "").indexOf("REQUEST:") === 0;
  } catch (e) {
    return false;
  }
}

function _bpSetSheetStatus_(ss, sheetName, status) {
  try {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return;
    sh.getRange("B1").setValue(String(status || "").substring(0, 500)).setNumberFormat("@");
  } catch (e) {}
}

function _bpExtractStampText_(value) {
  var m = String(value || "").match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?/);
  return m ? m[0] : "";
}

function _bpGetSheetCellText_(ss, sheetName, a1) {
  try {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return "";
    return String(sh.getRange(a1).getDisplayValue() || "");
  } catch (e) {
    return "";
  }
}

function _bpRunManualCexUpdate_(ss, sheetName, label, updateFn) {
  var result = "";
  try {
    result = String(updateFn());
  } catch (err) {
    result = "THREW: " + (err && err.message ? err.message : err);
  }
  if (result === "BUSY") {
    var reqStamp = _bpExtractStampText_(_bpGetSheetCellText_(ss, sheetName, "B1"));
    var rowStamp = _bpExtractStampText_(_bpGetSheetCellText_(ss, sheetName, "D3"));
    if (rowStamp && (!reqStamp || rowStamp.substring(0, 16) >= reqStamp.substring(0, 16))) {
      _bpSetSheetStatus_(ss, sheetName, rowStamp);
    } else if (_bpSheetHasRequest_(ss, sheetName)) {
      _bpSetSheetStatus_(ss, sheetName, "REQUEST: BUSY retry " + _bpFmtStamp_());
    }
  } else if (result.indexOf('"ok":false') >= 0 || result.indexOf("THREW:") === 0) {
    _bpSetSheetStatus_(ss, sheetName, label + " ERROR: " + result);
  }
  return result;
}

function CEX_SET_MANUAL_REQUEST(sheet, refreshFlagProp) {
  // v4.15.107: write the visible sheet request first. Simple onEdit can fail on
  // PropertiesService/ScriptApp permissions; B1 is the watchdog-readable source
  // of truth and must be set before any best-effort property write.
  if (sheet) _bpSetSheetRequestFlag_(sheet);
  if (refreshFlagProp) {
    try { _bpSetRefreshFlag_(refreshFlagProp); } catch (eFlag) {}
  }
  return true;
}

function CEX_GET_SPREADSHEET() {
  return _bpGetSpreadsheet_();
}

function CEX_HAS_MANUAL_REQUEST(ss, sheetName, refreshFlagProp) {
  return (refreshFlagProp && _bpGetRefreshFlag_(refreshFlagProp)) || (ss && _bpSheetHasRequest_(ss, sheetName));
}

function CEX_CLEAR_MANUAL_REQUEST(refreshFlagProp) {
  if (refreshFlagProp) _bpDeleteRefreshFlag_(refreshFlagProp);
}

function CEX_RUN_MANUAL_UPDATE(ss, sheetName, label, updateFn) {
  return _bpRunManualCexUpdate_(ss, sheetName, label, updateFn);
}

function CEX_RUN_DIRECT_OR_QUEUE(sheet, refreshFlagProp, label, updateFn, event) {
  return CEX_QUEUE_OR_MARK_MANUAL_JOB(sheet, refreshFlagProp, label, updateFn, event);
}

function CEX_QUEUE_OR_MARK_MANUAL_JOB(sheet, refreshFlagProp, label, updateFn, event) {
  CEX_SET_MANUAL_REQUEST(sheet, refreshFlagProp);
  var sheetName = sheet && sheet.getName ? sheet.getName() : "";
  if (!event || !event.triggerUid) return "QUEUED";
  return CEX_QUEUE_MANUAL_JOB(_cexManualJobKindFromLabel_(label), sheetName, refreshFlagProp, sheetName, "B1");
}

function _cexManualJobKindFromLabel_(label) {
  var key = String(label || "").toUpperCase();
  if (key === "BITPANDA_CRYPTO") return "BITPANDA_CRYPTO_FIAT";
  if (key === "BITPANDA_STOCKS" || key === "BITPANDA_FIAT" || key === "BITPANDA_STOCKS_FIAT") return "BITPANDA_STOCKS_FIAT";
  if (key === "BITPANDA") return "BITPANDA_FULL";
  if (key === "BINANCE") return "BINANCE";
  if (key === "BITFINEX") return "BITFINEX";
  if (key === "BYBIT") return "BYBIT";
  if (key === "COINBASE") return "COINBASE";
  if (key === "OKX") return "OKX";
  return key || "UNKNOWN";
}

function CEX_QUEUE_MANUAL_JOB(kind, sheetName, refreshFlagProp, statusSheetName, statusCell) {
  return _cexEnqueueManualJobs_([{ kind: kind, sheetName: sheetName, refreshFlagProp: refreshFlagProp, statusSheetName: statusSheetName, statusCell: statusCell }]);
}

// v4.15.114: batch enqueue. Multi-job clicks (AC2 = 6 CEX, Z1 = 2 jobs) used to
// call CEX_QUEUE_MANUAL_JOB N times; each call re-ran getProjectTriggers() +
// deleteTrigger + newTrigger (2-5s each in GAS) -> MASTER_ON_EDIT at 50-75s.
// One queue write + one status write per cell + ONE worker trigger ensure.
function _cexEnqueueManualJobs_(jobs) {
  if (!jobs || !jobs.length) return "NO_JOBS";
  var props = PropertiesService.getScriptProperties();
  var raw = "";
  try { raw = props.getProperty("CEX_MANUAL_JOB_QUEUE") || ""; } catch (eRaw) {}
  var queue = [];
  try { queue = raw ? JSON.parse(raw) : []; } catch (eParse) { queue = []; }
  var now = Date.now();
  for (var i = 0; i < jobs.length; i++) {
    var j = jobs[i] || {};
    queue.push({ kind: String(j.kind || ""), sheetName: String(j.sheetName || ""), refreshFlagProp: String(j.refreshFlagProp || ""), statusSheetName: String(j.statusSheetName || ""), statusCell: String(j.statusCell || ""), ts: now });
  }
  props.setProperty("CEX_MANUAL_JOB_QUEUE", JSON.stringify(queue).substring(0, 8000));
  props.setProperty("CEX_MANUAL_ACTIVE_UNTIL_MS", String(now + 10 * 60 * 1000));
  _cexWriteManualQueuedStatusBatch_(jobs);
  _cexEnsureManualWorkerTrigger_();
  return "QUEUED";
}

function _cexWriteManualQueuedStatusBatch_(jobs) {
  try {
    var ss = _bpGetSpreadsheet_();
    var stamp = "QUEUED: " + _bpFmtStamp_() + " ";
    var statusMap = {};
    var b1Map = {};
    for (var i = 0; i < jobs.length; i++) {
      var j = jobs[i] || {};
      var kind = String(j.kind || "");
      if (j.statusSheetName && j.statusCell) {
        var key = j.statusSheetName + "!" + j.statusCell;
        if (!statusMap[key]) statusMap[key] = { sheetName: j.statusSheetName, cell: j.statusCell, kinds: [] };
        statusMap[key].kinds.push(kind);
      }
      if (j.sheetName && j.statusCell !== "B1") {
        if (!b1Map[j.sheetName]) b1Map[j.sheetName] = [];
        b1Map[j.sheetName].push(kind);
      }
    }
    for (var k in statusMap) {
      var entry = statusMap[k];
      var sh = ss.getSheetByName(entry.sheetName);
      if (sh) sh.getRange(entry.cell).setValue((stamp + entry.kinds.join("+")).substring(0, 500)).setNumberFormat("@");
    }
    for (var name in b1Map) {
      var shB = ss.getSheetByName(name);
      if (shB) shB.getRange("B1").setValue((stamp + b1Map[name].join("+")).substring(0, 500)).setNumberFormat("@");
    }
  } catch (e) {}
}

function _cexEnsureManualWorkerTrigger_(delayMs) {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    try {
      if (triggers[i].getHandlerFunction() === "CEX_MANUAL_REFRESH_WORKER") {
        ScriptApp.deleteTrigger(triggers[i]);
        removed++;
      }
    } catch (e) {}
  }
  ScriptApp.newTrigger("CEX_MANUAL_REFRESH_WORKER").timeBased().after(delayMs || 1000).create();
}

// v4.15.114: worker lease. _cexEnsureManualWorkerTrigger_ only deletes PENDING
// one-shot triggers; an instance already RUNNING cannot be cancelled. Without a
// lease, a new enqueue during a long job spawned a second concurrent worker
// (observed 2026-07-01: two CEX_MANUAL_REFRESH_WORKER running 177s + 58s) doing
// racy read-modify-write on CEX_MANUAL_JOB_QUEUE (jobs lost or run twice).
var _CEX_WORKER_LEASE_TTL_MS = 2 * 60 * 1000;

function _cexWorkerAcquireLease_() {
  var props = PropertiesService.getScriptProperties();
  var now = Date.now();
  try {
    var raw = props.getProperty("CEX_WORKER_LEASE");
    if (raw) {
      var heldUntil = parseInt(raw, 10);
      if (isFinite(heldUntil) && heldUntil > now) return false;
    }
    props.setProperty("CEX_WORKER_LEASE", String(now + _CEX_WORKER_LEASE_TTL_MS));
    return true;
  } catch (e) {
    return true;
  }
}

// v4.15.117: hard cap on a single lease. The auto CEX_HOURLY_REFRESH (4h) holds
// the lease too if it shares the same ScriptProperty -> worker would block for
// 5 min. Keep the lease short so the worker can resume once the auto trigger
// finishes; long per-connector locks (CEX_ACQUIRE_LOCK 90s) live separately.
var _CEX_WORKER_LEASE_TTL_MS = 2 * 60 * 1000;

function _cexWorkerReleaseLease_() {
  try { PropertiesService.getScriptProperties().deleteProperty("CEX_WORKER_LEASE"); } catch (e) {}
}

// v4.15.116: drain BUDGET. One job per run was far too slow in practice: GAS
// one-shot triggers (after(1s)) actually fire with ~1 min granularity, so a
// 6-job AC2 click took 10-20 min to drain (observed 2026-07-01 23:33->23:41:
// only BINANCE done, 5 jobs still QUEUED). The worker now drains as many jobs
// as fit in a ~3 min budget (GAS trigger hard limit = 6 min) and only
// reschedules for the leftovers.
var _CEX_WORKER_BUDGET_MS = 3 * 60 * 1000;

function CEX_MANUAL_REFRESH_WORKER() {
  if (!_cexWorkerAcquireLease_()) {
    // v4.15.118: another worker holds the lease. Schedule a retry 15s later
    // and let the next run try again. Do NOT touch the queue.
    try { _cexEnsureManualWorkerTrigger_(15 * 1000); } catch (eRetry) {}
    return "WORKER_BUSY";
  }
  var props = PropertiesService.getScriptProperties();
  var results = [];
  var lastResult = "NO_JOB";
  var remaining = 0;
  var t0 = Date.now();
  try {
    while ((Date.now() - t0) < _CEX_WORKER_BUDGET_MS) {
      var queue = [];
      try { queue = JSON.parse(props.getProperty("CEX_MANUAL_JOB_QUEUE") || "[]"); } catch (eParse) { queue = []; }
      if (!queue.length) { remaining = 0; break; }
      var job = queue.shift();
      props.setProperty("CEX_MANUAL_JOB_QUEUE", JSON.stringify(queue).substring(0, 8000));
      // v4.15.118: short BUSY:CEX window (90s) — must clear quickly after the
      // last job so on-chain wallets resume scans.
      props.setProperty("CEX_MANUAL_ACTIVE_UNTIL_MS", String(Date.now() + 90 * 1000));
      lastResult = _cexRunManualJob_(job);
      results.push(lastResult);
      try { props.setProperty("CEX_WORKER_LEASE", String(Date.now() + _CEX_WORKER_LEASE_TTL_MS)); } catch (eLease) {}
      // v4.15.118: transient failure (per-connector lock BUSY because the auto
      // CEX_HOURLY_REFRESH holds it, Spreadsheets timeout...): the job was
      // requeued at the TAIL — keep draining the OTHER jobs instead of stalling
      // the whole queue for 60s. Short pause to let the collision pass.
      if (String(lastResult).indexOf("=RETRY") >= 0) {
        try { Utilities.sleep(2000); } catch (eSleep) {}
      }
    }
    try { remaining = (JSON.parse(props.getProperty("CEX_MANUAL_JOB_QUEUE") || "[]")).length; } catch (eReread) { remaining = 0; }
    if (!remaining) {
      props.deleteProperty("CEX_MANUAL_ACTIVE_UNTIL_MS");
    }
  } finally {
    _cexWorkerReleaseLease_();
  }
  if (remaining) {
    // v4.15.118: 5s backoff on transient, 1s otherwise. Both are short — GAS
    // one-shot triggers have ~1 min granularity anyway, so this is just a hint.
    var nextDelayMs = (String(lastResult).indexOf("=RETRY") >= 0) ? 5 * 1000 : 1000;
    try { _cexEnsureManualWorkerTrigger_(nextDelayMs); } catch (eNext) {}
  }
  return results.length ? results.join("\n") : "NO_JOB";
}

function CEX_MANUAL_REFRESH_WORKER_FORCE() {
  var results = [];
  for (var i = 0; i < 20; i++) {
    var out = CEX_MANUAL_REFRESH_WORKER();
    results.push(out);
    if (out === "NO_JOB" || out === "WORKER_BUSY") break;
  }
  return results.join("\n");
}

// v4.15.114: transient failures (Spreadsheets service timeout under trigger
// saturation, quota bursts, per-connector lock BUSY) must not kill a manual job.
// Observed 2026-07-01: CEX - Bybit B1 = ERROR "Service Spreadsheets timed out"
// while _runPricingWorker + QUOTA_RECOVERY_SWEEP + double worker held the doc.
var _CEX_MANUAL_JOB_MAX_RETRIES = 2;

function _cexIsTransientResult_(result) {
  var s = String(result || "");
  return s === "BUSY" ||
         s.indexOf("timed out") >= 0 ||
         s.indexOf("Service Spreadsheets") >= 0 ||
         s.indexOf("Service invoked too many times") >= 0 ||
         s.indexOf("internal error") >= 0;
}

function _cexRequeueManualJob_(job) {
  var props = PropertiesService.getScriptProperties();
  var queue = [];
  try { queue = JSON.parse(props.getProperty("CEX_MANUAL_JOB_QUEUE") || "[]"); } catch (e) { queue = []; }
  queue.push(job);
  props.setProperty("CEX_MANUAL_JOB_QUEUE", JSON.stringify(queue).substring(0, 8000));
  props.setProperty("CEX_MANUAL_ACTIVE_UNTIL_MS", String(Date.now() + 10 * 60 * 1000));
}

function _cexWriteManualJobRetryStatus_(job, msg) {
  try {
    var ss = _bpGetSpreadsheet_();
    var status = String(msg || "").substring(0, 500);
    if (job.statusSheetName && job.statusCell) {
      var sh = ss.getSheetByName(job.statusSheetName);
      if (sh) sh.getRange(job.statusCell).setValue(status).setNumberFormat("@");
    }
    if (job.sheetName) _bpSetSheetStatus_(ss, job.sheetName, status);
  } catch (e) {}
}

// v4.15.117: a failed B1 status (B1 = "RETRY 1/2" stuck) is recovered by checking
// against D3 row stamp. If the row was updated AFTER the B1 QUEUED stamp, the
// update succeeded but the status write got lost. Force B1 to row stamp.
// v4.15.118: forced recovery for sheets left in QUEUED/RETRY state at boot.
// We do NOT call this from the worker (extra Sheet I/O per job); we let the
// watchdog (WATCHDOG_FROM_RECAP) re-process them through _bpSheetHasRequest_ —
// the request flag is cleared only on success or after MAX_RETRIES.

function _cexRunManualJob_(job) {
  var kind = String(job && job.kind || "");
  var result = "";
  try {
    if (kind === "TOP_MARKETCAP") result = typeof UPDATE_TOP_MARKETCAP === "function" ? String(UPDATE_TOP_MARKETCAP()) : "SKIPPED_MISSING_UPDATE_TOP_MARKETCAP";
    else if (kind === "BITPANDA_CRYPTO_FIAT") result = String(UPDATE_BITPANDA_CRYPTO_FIAT());
    else if (kind === "BITPANDA_CRYPTO") result = String(UPDATE_BITPANDA_CRYPTO());
    else if (kind === "BITPANDA_STOCKS_FIAT") result = String(UPDATE_BITPANDA_STOCKS_FIAT());
    else if (kind === "BITPANDA_FULL") result = String(UPDATE_BITPANDA_SPOT());
    else if (kind === "BINANCE") result = typeof UPDATE_BINANCE_SPOT === "function" ? String(UPDATE_BINANCE_SPOT()) : "SKIPPED_MISSING_UPDATE_BINANCE_SPOT";
    else if (kind === "BITFINEX") result = typeof UPDATE_BITFINEX_SPOT === "function" ? String(UPDATE_BITFINEX_SPOT()) : "SKIPPED_MISSING_UPDATE_BITFINEX_SPOT";
    else if (kind === "BYBIT") result = typeof UPDATE_BYBIT_SPOT === "function" ? String(UPDATE_BYBIT_SPOT()) : "SKIPPED_MISSING_UPDATE_BYBIT_SPOT";
    else if (kind === "COINBASE") result = typeof UPDATE_COINBASE_SPOT === "function" ? String(UPDATE_COINBASE_SPOT()) : "SKIPPED_MISSING_UPDATE_COINBASE_SPOT";
    else if (kind === "OKX") result = typeof UPDATE_OKX_SPOT === "function" ? String(UPDATE_OKX_SPOT()) : "SKIPPED_MISSING_UPDATE_OKX_SPOT";
    else if (kind === "KRAKEN") result = typeof UPDATE_KRAKEN_SPOT === "function" ? String(UPDATE_KRAKEN_SPOT()) : "SKIPPED_MISSING_UPDATE_KRAKEN_SPOT";
    else result = "UNKNOWN_JOB:" + kind;
  } catch (err) {
    result = "THREW:" + (err && err.message ? err.message : err);
  }
  var retries = (job && isFinite(job.retries)) ? Number(job.retries) : 0;
  if (_cexIsTransientResult_(result) && retries < _CEX_MANUAL_JOB_MAX_RETRIES) {
    job.retries = retries + 1;
    _cexRequeueManualJob_(job);
    _cexWriteManualJobRetryStatus_(job, "RETRY " + job.retries + "/" + _CEX_MANUAL_JOB_MAX_RETRIES + ": " + _bpFmtStamp_() + " " + kind + " (" + String(result).substring(0, 200) + ")");
    return kind + "=RETRY" + job.retries;
  }
  _cexWriteManualJobStatus_(job, result);
  if (job && job.refreshFlagProp && result !== "BUSY") CEX_CLEAR_MANUAL_REQUEST(job.refreshFlagProp);
  return kind + "=" + result;
}

function _cexWriteManualJobStatus_(job, result) {
  try {
    var ss = _bpGetSpreadsheet_();
    var status = String(result || "");
    if (status.length > 500) status = status.substring(0, 500);
    var isSuccess = status === "OK" || status.indexOf('"ok":true') >= 0 || /^\d{4}-\d{2}-\d{2}/.test(status);
    if (job.statusSheetName && job.statusCell) {
      var statusSheet = ss.getSheetByName(job.statusSheetName);
      if (statusSheet) {
        var display = isSuccess ? String(job.kind || "") + " OK: " + _bpFmtStamp_() : status;
        statusSheet.getRange(job.statusCell).setValue(display).setNumberFormat("@");
      }
    }
    // v4.15.117: on success or hard failure, restore the sheet B1 to the
    // canonical timestamp. B1 was set to QUEUED:/RETRY by enqueue/retry helpers;
    // it must NOT stay "RETRY 1/2" if the job actually succeeded, and it must
    // not stay QUEUED either. Always overwrite with the final state.
    if (job.sheetName) {
      try {
        var sh = ss.getSheetByName(job.sheetName);
        if (sh) {
          if (isSuccess) {
            // Read D3 (last update stamp on the data) and use it as the canonical B1.
            var rowStamp = _bpExtractStampText_(_bpGetSheetCellText_(ss, job.sheetName, "D3"));
            var b1 = rowStamp || _bpFmtStamp_();
            sh.getRange("B1").setValue(b1).setNumberFormat("@");
          } else if (status === "BUSY" || status.indexOf("THREW:") === 0 || status.indexOf('"ok":false') >= 0) {
            _bpSetSheetStatus_(ss, job.sheetName, "ERROR: " + status);
          }
        }
      } catch (eB1) {}
    }
  } catch (e) {}
}

function CEX_REFRESH_WATCHDOG() {
  return BITPANDA_REFRESH_WATCHDOG();
}

// NOTE: le staking Bitpanda n'est PAS expose par l'API publique (verifie via la
// doc officielle 2026-06 et l'inspection de /asset-wallets: sections cryptocoin,
// commodity, index, security, equity_security uniquement; /staking* -> 401).
// Le balance /wallets ne reflete que le disponible, pas le montant stake.
// -> le staking doit etre saisi manuellement (voir onglet dedie si configure).

// Confirme 2026-06: un symbole stake/Earn (ex VSN) n'a qu'UNE entree dans
// /wallets et /asset-wallets = le solde disponible. Le montant Earn/stake n'est
// jamais expose par l'API Bitpanda. Diag retire.

function _bpWalletRow_(wallet, symbolKey) {
  var a = (wallet && wallet.attributes) || {};
  var symbol = String(a[symbolKey] || a.cryptocoin_symbol || a.fiat_symbol || a.symbol || "").trim();
  var balance = String(a.balance || "0").trim();
  if (!symbol) return null;
  return [_bpCanonicalSymbol_(symbol), balance];
}

function _bpParseBalance_(value) {
  var n = Number(String(value || "0").replace(",", "."));
  return isFinite(n) ? n : 0;
}

// v4.15.71: Bitpanda expose parfois deux variantes pour une meme action (ex un
// listing US suffixe "-US"/"US" + une entree de base a solde nul). On normalise
// la variante vers le symbole canonique attendu par Action Rebalancing afin de
// cumuler les soldes sur une seule ligne (sinon le VLOOKUP tombe sur la base=0).
var BITPANDA_SYMBOL_ALIASES = {
  "USDC": "USDT",
  // Variantes US suffixees -> ticker de base (la base a un solde nul).
  "AMD-US": "AMD",
  "WMT-US": "WMT",
  "JPM-US": "JPM",
  "LLYC-US": "LLY",
  "MRKUS": "MRK",
  // v4.15.72: doubles tickers Bitpanda (ancien code Bitpanda + ticker boursier
  // tous deux avec solde). On canonise vers UN seul symbole et on cumule, sinon
  // le VLOOKUP d'Action Rebalancing ne capte qu'une des deux lignes.
  "TSFA": "TSM",    // TSMC (TSFA = ancien code Bitpanda)
  "BROA": "AVGO",   // Broadcom (BROA = ancien code Bitpanda)
  "BRK": "BRKB",    // Berkshire Hathaway B (BRK base = 0)
  "SMSN": "SSU",    // Samsung (SMSN base = 0; SSU = receipt ~25 actions ord.)
  "NOVN": "NVS",    // Novartis (NOVN base = 0)
  "RDSA": "SHEL",   // Shell (ancien code Bitpanda RDSA)
  "TCTZF": "TCEHY"  // Tencent (TCTZF = ancien code Bitpanda)
};

function _bpCanonicalSymbol_(symbol) {
  var s = String(symbol || "").trim();
  var up = s.toUpperCase();
  return BITPANDA_SYMBOL_ALIASES[up] || s;
}

// v4.15.69: agrege par symbole (somme des balances) au lieu de dedupliquer.
// Bitpanda peut renvoyer plusieurs wallets pour un meme symbole (ex: plusieurs
// sous-comptes / lots). On cumule les soldes pour avoir une seule ligne par actif.
function _bpPushUniqueRow_(rows, seen, row) {
  if (!row || !row[0]) return;
  var key = String(row[0]).toUpperCase();
  var add = _bpParseBalance_(row[1]);
  if (Object.prototype.hasOwnProperty.call(seen, key)) {
    var idx = seen[key];
    rows[idx][1] = _bpParseBalance_(rows[idx][1]) + add;
    return;
  }
  seen[key] = rows.length;
  // conserve les colonnes additionnelles eventuelles (ex: unknown path)
  var copy = row.slice();
  copy[1] = add;
  rows.push(copy);
}

function _bpMergeBuckets_(primary, secondary) {
  var out = [];
  var seen = {};
  function add(list) {
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (!row || !row[0]) continue;
      _bpPushUniqueRow_(out, seen, row);
    }
  }
  add(primary);
  add(secondary);
  return out;
}

function _bpIsManagedSheet_(sheetName) {
  var sheets = BITPANDA_SYNC_CONFIG.SHEETS;
  for (var k in sheets) {
    if (Object.prototype.hasOwnProperty.call(sheets, k) && sheets[k] === sheetName) return true;
  }
  return false;
}

function _bpFormatStamp_(stamp, sourceLabel) {
  return "Refresh Bitpanda API. Last updated " + stamp + " via Apps Script " + sourceLabel;
}

function _bpWalkAssetWallets_(node, path, buckets, seen) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) _bpWalkAssetWallets_(node[i], path, buckets, seen);
    return;
  }
  if (typeof node !== "object") return;

  if (node.type === "wallet" && node.attributes) {
    var p = path.join(".").toLowerCase();
    var row = _bpWalletRow_(node, "cryptocoin_symbol");
    if (!row) return;
    if (p.indexOf("commodity") >= 0 || p.indexOf("metal") >= 0) _bpPushUniqueRow_(buckets.commodity, seen.commodity, row);
    else if (p.indexOf("action") >= 0) _bpPushUniqueRow_(buckets.action, seen.action, row);
    else if (p.indexOf("stock") >= 0 || p.indexOf("equity") >= 0 || p.indexOf("security") >= 0 || p.indexOf("etf") >= 0 || p.indexOf("index") >= 0) _bpPushUniqueRow_(buckets.stocks, seen.stocks, row);
    // v4.15.77: NE PAS re-ajouter les wallets crypto d'/asset-wallets: ils
    // doublonnent /wallets (deja charge), ce qui doublait les soldes crypto.
    else if (p.indexOf("crypto") >= 0 || p.indexOf("coin") >= 0) { /* skip: deja couvert par /wallets */ }
    else _bpPushUniqueRow_(buckets.unknown, seen.unknown, row.concat([p]));
    return;
  }

  for (var k in node) {
    if (Object.prototype.hasOwnProperty.call(node, k)) _bpWalkAssetWallets_(node[k], path.concat([k]), buckets, seen);
  }
}

// v4.15.73: certains produits cash (ex "BCPEUR" = Bitpanda Cash Plus EUR) sont
// renvoyes par /asset-wallets et classes a tort en stocks. On les reclasse vers
// le bucket fiat sous leur devise canonique, en cumulant sur la ligne existante.
var BITPANDA_CASH_LIKE = {
  "BCPEUR": "EUR"
};

function _bpReclassifyCashLike_(buckets) {
  var moved = [];
  var keptStocks = [];
  for (var i = 0; i < buckets.stocks.length; i++) {
    var row = buckets.stocks[i];
    var sym = String((row && row[0]) || "").toUpperCase();
    if (Object.prototype.hasOwnProperty.call(BITPANDA_CASH_LIKE, sym)) {
      moved.push([BITPANDA_CASH_LIKE[sym], _bpParseBalance_(row[1])]);
    } else {
      keptStocks.push(row);
    }
  }
  if (!moved.length) return;
  buckets.stocks = keptStocks;
  // Re-agrege le bucket fiat avec les montants deplaces (cumul par devise).
  var fiatSeen = {};
  var fiatOut = [];
  for (var f = 0; f < buckets.fiat.length; f++) _bpPushUniqueRow_(fiatOut, fiatSeen, buckets.fiat[f]);
  for (var m = 0; m < moved.length; m++) _bpPushUniqueRow_(fiatOut, fiatSeen, moved[m]);
  buckets.fiat = fiatOut;
}

function _bpFetchBuckets_(apiKey) {
  var buckets = { crypto: [], commodity: [], fiat: [], stocks: [], action: [], unknown: [] };
  var seen = { crypto: {}, commodity: {}, fiat: {}, stocks: {}, action: {}, unknown: {} };

  var wallets = _bpFetch_("/wallets", apiKey);
  var cryptoData = wallets.data || [];
  for (var i = 0; i < cryptoData.length; i++) _bpPushUniqueRow_(buckets.crypto, seen.crypto, _bpWalletRow_(cryptoData[i], "cryptocoin_symbol"));

  var fiat = _bpFetch_("/fiatwallets", apiKey);
  var fiatData = fiat.data || [];
  for (var f = 0; f < fiatData.length; f++) _bpPushUniqueRow_(buckets.fiat, seen.fiat, _bpWalletRow_(fiatData[f], "fiat_symbol"));

  // /asset-wallets contient les commodities et, selon le compte, peut aussi contenir stocks/ETFs.
  var assets = _bpFetch_("/asset-wallets", apiKey);
  _bpWalkAssetWallets_(assets.data, [], buckets, seen);

  _bpReclassifyCashLike_(buckets);

  return buckets;
}

function _bpWriteRows_(ss, sheetName, rows, sourceLabel) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error("Sheet missing: " + sheetName);
  // v4.15.82: B1 = date pure "yyyy-MM-dd HH:mm:ss" (harmonie avec onglets on-chain Recap).
  var stamp = Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss");
  var values = [];
  values.push([false, stamp, "", ""]);
  values.push(["cryptocoin_symbol", "balance", "source", "updated_at"]);
  for (var i = 0; i < rows.length; i++) values.push([rows[i][0], _bpParseBalance_(rows[i][1]), sourceLabel, stamp]);
  // v4.15.120: clear only data columns A:D so the user-managed "Vérif" column (E) survives syncs.
  sh.getRange(1, 1, Math.max(sh.getLastRow(), 2), 4).clearContent();
  sh.getRange(1, 1, values.length, 4).setValues(values);
  sh.getRange("A1").insertCheckboxes().setValue(false);
  sh.getRange("B1:D1").setNumberFormat("@");
  if (values.length > 2) sh.getRange(3, 2, values.length - 2, 1).setNumberFormat("0.########");
  // v4.15.121: append INFO_TOTAL row at the bottom of the Bitpanda bucket sheet.
  try {
    var _bpDataRows = [];
    for (var j = 0; j < rows.length; j++) _bpDataRows.push([rows[j][0], _bpParseBalance_(rows[j][1]), sourceLabel, stamp]);
    _cexComputeAndAppendTotal_(ss, sheetName, _bpDataRows, "bitpanda");
  } catch (eTot) { Logger.log("[CEX_TOTAL] bitpanda " + sheetName + " append failed: " + eTot); }
}

// v4.15.81: cellules de refresh manuel hors onglets Bitpanda.
// Z1 = Action Rebalancing (v4.15.100: Top Marketcap puis Stocks + Fiat).
// Portefeuille Crypto!AC2 = Crypto CEX block (all CEX crypto tabs).
var BITPANDA_REFRESH_CELLS = {
  "Action Rebalancing": {
    "Z1": BITPANDA_SYNC_CONFIG.ACTION_REBALANCING_REFRESH_FLAG_PROP
  },
  "Portefeuille Crypto": {
    "AC2": BITPANDA_SYNC_CONFIG.CRYPTO_CEX_REFRESH_FLAG_PROP
  }
};

function BITPANDA_ON_EDIT(e) {
  try {
    if (!e || !e.range) return false;
    var range = e.range;
    var cell = range.getA1Notation ? range.getA1Notation() : "";
    var sheet = range.getSheet ? range.getSheet() : null;
    if (!sheet) return false;
    var name = sheet.getName();

    var isActionRebalancingZ1 = cell === "Z1" && name === "Action Rebalancing";
    if (isActionRebalancingZ1 && !e.triggerUid) {
      // Le trigger simple onEdit tourne en auth LIMITED et ne peut pas faire UrlFetch.
      // Les evenements de triggers installables portent triggerUid; eux traitent Z1.
      return false;
    }

    var refreshFlagProp = null;
    if (cell === "A1" && _bpIsManagedSheet_(name)) {
      refreshFlagProp = BITPANDA_SYNC_CONFIG.REFRESH_FLAG_PROP;
    } else if (BITPANDA_REFRESH_CELLS[name] && BITPANDA_REFRESH_CELLS[name][cell]) {
      refreshFlagProp = BITPANDA_REFRESH_CELLS[name][cell];
    }
    if (!refreshFlagProp) return false;

    var v = (typeof e.value !== "undefined") ? e.value : range.getValue();
    if (String(v).toUpperCase() !== "TRUE") return true;
    if (!e.triggerUid) return true;
    try { range.setValue(false); } catch (eResetEarly) {}

    // v4.15.76: onEdit SIMPLE ne peut pas appeler UrlFetchApp. En pratique ce
    // handler est appele par le trigger installable MASTER_ON_EDIT; Z1 passe donc
    // en direct pour eviter l'attente watchdog, avec flag conserve si le direct
    // ne peut pas terminer.
    if (cell === "A1" && _bpIsManagedSheet_(name)) {
      var bpPlan = _bpGetManagedSheetRefreshPlan_(name);
      CEX_QUEUE_OR_MARK_MANUAL_JOB(sheet, refreshFlagProp, bpPlan.label, bpPlan.updateFn, e);
    } else if (isActionRebalancingZ1) {
      _bpSetExternalRefreshStatus_(sheet, "AA1", "QUEUED: " + _bpFmtStamp_());
      // v4.15.114: single batch enqueue (1 queue write + 1 worker trigger ensure).
      _cexEnqueueManualJobs_([
        { kind: "TOP_MARKETCAP", sheetName: "", refreshFlagProp: refreshFlagProp, statusSheetName: name, statusCell: "AA1" },
        { kind: "BITPANDA_STOCKS_FIAT", sheetName: BITPANDA_SYNC_CONFIG.SHEETS.STOCKS, refreshFlagProp: refreshFlagProp, statusSheetName: name, statusCell: "AA1" }
      ]);
    } else if (name === "Portefeuille Crypto" && cell === "AC2") {
      _bpSetExternalRefreshStatus_(sheet, "AD2", "QUEUED: " + _bpFmtStamp_());
      // v4.15.114: single batch enqueue for the 6 CEX jobs. Per-job enqueue redid
      // getProjectTriggers()+delete+create 6 times -> MASTER_ON_EDIT 50-75s.
      _cexEnqueueManualJobs_([
        { kind: "BITPANDA_CRYPTO", sheetName: BITPANDA_SYNC_CONFIG.SHEETS.CRYPTO, refreshFlagProp: refreshFlagProp, statusSheetName: name, statusCell: "AD2" },
        { kind: "BINANCE", sheetName: typeof BINANCE_SYNC_CONFIG !== "undefined" ? BINANCE_SYNC_CONFIG.SHEET : "", refreshFlagProp: refreshFlagProp, statusSheetName: name, statusCell: "AD2" },
        { kind: "BITFINEX", sheetName: typeof BITFINEX_SYNC_CONFIG !== "undefined" ? BITFINEX_SYNC_CONFIG.SHEET : "", refreshFlagProp: refreshFlagProp, statusSheetName: name, statusCell: "AD2" },
        { kind: "BYBIT", sheetName: typeof BYBIT_SYNC_CONFIG !== "undefined" ? BYBIT_SYNC_CONFIG.SHEET : "", refreshFlagProp: refreshFlagProp, statusSheetName: name, statusCell: "AD2" },
        { kind: "COINBASE", sheetName: typeof COINBASE_SYNC_CONFIG !== "undefined" ? COINBASE_SYNC_CONFIG.SHEET : "", refreshFlagProp: refreshFlagProp, statusSheetName: name, statusCell: "AD2" },
        { kind: "OKX", sheetName: typeof OKX_SYNC_CONFIG !== "undefined" ? OKX_SYNC_CONFIG.SHEET : "", refreshFlagProp: refreshFlagProp, statusSheetName: name, statusCell: "AD2" },
        { kind: "KRAKEN", sheetName: typeof KRAKEN_SYNC_CONFIG !== "undefined" ? KRAKEN_SYNC_CONFIG.SHEET : "", refreshFlagProp: refreshFlagProp, statusSheetName: name, statusCell: "AD2" }
      ]);
    } else {
      _bpSetRefreshFlag_(refreshFlagProp);
    }
    return true;
  } catch (err) {
    try { Logger.log("[BITPANDA_ON_EDIT] " + (err && err.message ? err.message : err)); } catch (eLog) {}
    try { if (e && e.range) e.range.setValue(false); } catch (eReset) {}
    return true;
  }
}

function _bpSetExternalRefreshStatus_(sheet, cell, status) {
  try {
    var value = String(status || "");
    if (value.length > 500) value = value.substring(0, 500);
    sheet.getRange(cell).setValue(value === "OK" ? "OK: " + _bpFmtStamp_() : value).setNumberFormat("@");
  } catch (e) {}
}

function _bpRunCryptoCexRefreshDirect_() {
  var results = [];
  function run(label, fn) {
    if (typeof fn !== "function") { results.push(label + "=SKIPPED_MISSING"); return true; }
    var out = "";
    try { out = String(fn()); }
    catch (e) { out = "THREW:" + (e && e.message ? e.message : e); }
    results.push(label + "=" + out);
    return out !== "BUSY" && out.indexOf('"ok":false') < 0 && out.indexOf("THREW:") !== 0 && out.indexOf("ERROR:") !== 0;
  }
  var ok = true;
  ok = run("bitpandaCryptoFiat", UPDATE_BITPANDA_CRYPTO_FIAT) && ok;
  ok = run("binanceCrypto", typeof UPDATE_BINANCE_SPOT === "function" ? UPDATE_BINANCE_SPOT : null) && ok;
  ok = run("bitfinexCrypto", typeof UPDATE_BITFINEX_SPOT === "function" ? UPDATE_BITFINEX_SPOT : null) && ok;
  ok = run("bybitCrypto", typeof UPDATE_BYBIT_SPOT === "function" ? UPDATE_BYBIT_SPOT : null) && ok;
  ok = run("coinbaseCrypto", typeof UPDATE_COINBASE_SPOT === "function" ? UPDATE_COINBASE_SPOT : null) && ok;
  ok = run("okxCrypto", typeof UPDATE_OKX_SPOT === "function" ? UPDATE_OKX_SPOT : null) && ok;
  ok = run("krakenCrypto", typeof UPDATE_KRAKEN_SPOT === "function" ? UPDATE_KRAKEN_SPOT : null) && ok;
  var summary = results.join("\n");
  try { Logger.log("CRYPTO_CEX_DIRECT\n" + summary); } catch (eLog) {}
  if (ok) _bpDeleteRefreshFlag_(BITPANDA_SYNC_CONFIG.CRYPTO_CEX_REFRESH_FLAG_PROP);
  return ok ? "OK" : summary;
}

function _bpRunActionRebalancingRefreshDirect_() {
  try {
    var tmResult = "SKIPPED_MISSING_UPDATE_TOP_MARKETCAP";
    if (typeof UPDATE_TOP_MARKETCAP === "function") tmResult = String(UPDATE_TOP_MARKETCAP());
    var bpResult = String(UPDATE_BITPANDA_STOCKS_FIAT());

    var tmOk = tmResult !== "BUSY" && tmResult.indexOf("ERROR:") !== 0;
    var bpOk = bpResult !== "BUSY" && bpResult.indexOf('"ok":false') < 0 && bpResult.indexOf("ERROR:") !== 0;
    if (!tmOk || !bpOk) return "topMarketcap=" + tmResult + "\nbitpandaStocksFiat=" + bpResult;

    _bpDeleteRefreshFlag_(BITPANDA_SYNC_CONFIG.ACTION_REBALANCING_REFRESH_FLAG_PROP);
    return "OK";
  } catch (err) {
    try { Logger.log("[bpActionDirect] " + (err && err.message ? err.message : err)); } catch (eLog) {}
    return "THREW:" + (err && err.message ? err.message : err);
  }
}

function _bpGetManagedSheetRefreshPlan_(sheetName) {
  if (sheetName === BITPANDA_SYNC_CONFIG.SHEETS.CRYPTO) {
    return { label: "BITPANDA_CRYPTO", updateFn: UPDATE_BITPANDA_CRYPTO_FIAT };
  }
  if (sheetName === BITPANDA_SYNC_CONFIG.SHEETS.FIAT || sheetName === BITPANDA_SYNC_CONFIG.SHEETS.STOCKS) {
    return { label: "BITPANDA_STOCKS_FIAT", updateFn: UPDATE_BITPANDA_STOCKS_FIAT };
  }
  return { label: "BITPANDA", updateFn: UPDATE_BITPANDA_SPOT };
}

// v4.15.103 PERMANENT FIX: self-heal list + helpers.
// Per AGENTS.md "triggers présents mais mal autorisés" (v4.15.61).
// Any CEX A1 click re-installs the central fallback + hourly CEX triggers with fresh user auth.
var _BP_CEX_TRIGGERS_TO_HEAL = [
  { name: "UPDATE_BITPANDA_SPOT", unit: "hours", value: 1 },
  { name: "UPDATE_BINANCE_SPOT", unit: "hours", value: 1 },
  { name: "UPDATE_BITFINEX_SPOT", unit: "hours", value: 1 },
  { name: "UPDATE_BYBIT_SPOT", unit: "hours", value: 1 },
  { name: "UPDATE_COINBASE_SPOT", unit: "hours", value: 1 },
  { name: "UPDATE_OKX_SPOT", unit: "hours", value: 1 },
  { name: "UPDATE_KRAKEN_SPOT", unit: "hours", value: 1 },
  { name: "CEX_MANUAL_REFRESH_WORKER", unit: "minutes", value: 1 }
];
var _BP_CEX_LEGACY_TRIGGERS_TO_DELETE = [
  "CEX_HOURLY_REFRESH",
  "BITPANDA_REFRESH_WATCHDOG",
  "BINANCE_REFRESH_WATCHDOG",
  "BITFINEX_REFRESH_WATCHDOG",
  "BYBIT_REFRESH_WATCHDOG"
];

function _bpEnsureCexTriggers_() {
  // v4.15.103 PERMANENT FIX: force re-install (delete+create) to capture fresh user auth.
  // A trigger that is "present" (count=1) but tied to stale OAuth will NOT be reinstalled
  // by a "create-if-missing" check. Always delete+recreate so the new trigger captures
  // the user's current auth context. Per AGENTS.md v4.15.61.
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var l = 0; l < _BP_CEX_LEGACY_TRIGGERS_TO_DELETE.length; l++) {
      var legacy = _BP_CEX_LEGACY_TRIGGERS_TO_DELETE[l];
      for (var li = triggers.length - 1; li >= 0; li--) {
        try {
          if (triggers[li].getHandlerFunction() === legacy) ScriptApp.deleteTrigger(triggers[li]);
        } catch (eLegacyDel) {}
      }
    }
    for (var j = 0; j < _BP_CEX_TRIGGERS_TO_HEAL.length; j++) {
      var t = _BP_CEX_TRIGGERS_TO_HEAL[j];
      // 1. Delete any existing instance of this trigger (dead or alive, with stale or fresh auth)
      for (var i = triggers.length - 1; i >= 0; i--) {
        try {
          if (triggers[i].getHandlerFunction() === t.name) {
            ScriptApp.deleteTrigger(triggers[i]);
          }
        } catch (eDel) {}
      }
      // 2. Re-install with fresh user auth (captured by the current onEdit invocation)
      try {
        var builder = ScriptApp.newTrigger(t.name).timeBased();
        if (t.unit === "hours") builder = builder.everyHours(t.value);
        else builder = builder.everyMinutes(t.value);
        builder.create();
        try { Logger.log("[bpEnsureCex] Force-reinstalled " + t.name + " every " + t.value + " " + t.unit); } catch (eLog) {}
      } catch (eCreate) {
        try { Logger.log("[bpEnsureCex] Failed to reinstall " + t.name + ": " + (eCreate && eCreate.message ? eCreate.message : eCreate)); } catch (eLog) {}
      }
    }
  } catch (e) {
    try { Logger.log("[bpEnsureCex] Error: " + (e && e.message ? e.message : e)); } catch (eLog) {}
  }
}

function BP_REINSTALL_CEX_TRIGGERS() {
  // User-facing: run this from the Apps Script editor to force a clean re-install
  // of all CEX time-based triggers (captures the current editor auth context).
  _bpEnsureCexTriggers_();
  return "Done. See Executions log for which triggers were reinstalled.";
}

// Trigger INSTALLABLE (peut faire des UrlFetch): traite les flags poses par les
// checkboxes et lance uniquement les refresh necessaires.
function BITPANDA_REFRESH_WATCHDOG() {
  return "LEGACY_DISABLED: manual CEX refreshes are handled by MASTER_ON_EDIT; hourly refresh uses CEX_HOURLY_REFRESH";
}

function INSTALL_BITPANDA_REFRESH_WATCHDOG() {
  var trs = ScriptApp.getProjectTriggers();
  for (var i = 0; i < trs.length; i++) {
    if (trs[i].getHandlerFunction() === "BITPANDA_REFRESH_WATCHDOG") ScriptApp.deleteTrigger(trs[i]);
  }
  return "LEGACY_DISABLED: BITPANDA_REFRESH_WATCHDOG is no longer installed; use CEX_HOURLY_REFRESH";
}

// v4.15.98: Refresh horaire centralise de TOUS les onglets CEX.
// Remplace les triggers horaires individuels (UPDATE_*_SPOT) par un seul
// trigger garanti par WCORE_AUTO_HEAL. Chaque update est protege individuellement
// pour qu'un CEX en erreur ne bloque pas les autres.
function CEX_HOURLY_REFRESH() {
  try { PropertiesService.getScriptProperties().setProperty("CEX_HOURLY_REFRESH_LAST_START_MS", String(Date.now())); } catch (eStartProp) {}
  var results = [];
  // v4.15.108: each UPDATE_*_SPOT grabs the shared script lock. The 1-min
  // BITPANDA_REFRESH_WATCHDOG can hold it, so a plain call returns "BUSY" and
  // leaves that CEX tab frozen (observed: Binance/Bitfinex/Bybit stale for hours
  // while Coinbase/OKX refreshed). Retry a few times on BUSY so the hourly job
  // never silently skips a connector.
  function run(label, fn) {
    if (typeof fn !== "function") { results.push(label + "=SKIPPED_MISSING"); return; }
    var out = "";
    for (var attempt = 0; attempt < 4; attempt++) {
      try { out = String(fn()); }
      catch (e) { out = "THREW:" + (e && e.message ? e.message : e); }
      if (out !== "BUSY") break;
      Utilities.sleep(3000);
    }
    results.push(label + "=" + out);
  }
  run("bitpanda", typeof UPDATE_BITPANDA_SPOT === "function" ? UPDATE_BITPANDA_SPOT : null);
  run("binance", typeof UPDATE_BINANCE_SPOT === "function" ? UPDATE_BINANCE_SPOT : null);
  run("bitfinex", typeof UPDATE_BITFINEX_SPOT === "function" ? UPDATE_BITFINEX_SPOT : null);
  run("bybit", typeof UPDATE_BYBIT_SPOT === "function" ? UPDATE_BYBIT_SPOT : null);
  run("coinbase", typeof UPDATE_COINBASE_SPOT === "function" ? UPDATE_COINBASE_SPOT : null);
  run("okx", typeof UPDATE_OKX_SPOT === "function" ? UPDATE_OKX_SPOT : null);
  run("kraken", typeof UPDATE_KRAKEN_SPOT === "function" ? UPDATE_KRAKEN_SPOT : null);
  var summary = results.join("\n");
  Logger.log("CEX_HOURLY_REFRESH\n" + summary);
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty("CEX_HOURLY_REFRESH_LAST_MS", String(Date.now()));
    props.setProperty("CEX_HOURLY_REFRESH_LAST_RESULT", summary.substring(0, 8000));
  } catch (eEndProp) {}
  return summary;
}

/**
 * Diagnostic - returns the timestamp and full summary of the last
 * CEX_HOURLY_REFRESH run. Use to find out why a specific connector
 * (e.g. Bitfinex) is stale: BUSY=4 retries exhausted, THREW=<msg>=uncaught error.
 * @returns {Array<Array>} [[ts, summary]]
 * @customfunction
 */
function DIAG_CEX_LAST_RUN() {
  try {
    var props = PropertiesService.getScriptProperties();
    var ts = props.getProperty("CEX_HOURLY_REFRESH_LAST_MS") || "0";
    var summary = props.getProperty("CEX_HOURLY_REFRESH_LAST_RESULT") || "NO_RUN_RECORDED";
    var dt = "never";
    if (ts && Number(ts) > 0) {
      dt = Utilities.formatDate(new Date(Number(ts)), "Europe/Paris", "yyyy-MM-dd HH:mm:ss");
    }
    return [[dt, summary]];
  } catch (e) {
    return [["error", String(e && e.message ? e.message : e)]];
  }
}

function INSTALL_CEX_HOURLY_REFRESH() {
  var trs = ScriptApp.getProjectTriggers();
  var handlers = ["CEX_HOURLY_REFRESH", "UPDATE_BITPANDA_SPOT", "UPDATE_BINANCE_SPOT", "UPDATE_BITFINEX_SPOT", "UPDATE_BYBIT_SPOT", "UPDATE_COINBASE_SPOT", "UPDATE_OKX_SPOT", "UPDATE_KRAKEN_SPOT"];
  var wanted = {};
  for (var h = 0; h < handlers.length; h++) wanted[handlers[h]] = true;
  for (var i = 0; i < trs.length; i++) {
    if (wanted[trs[i].getHandlerFunction()]) ScriptApp.deleteTrigger(trs[i]);
  }
  ScriptApp.newTrigger("UPDATE_BITPANDA_SPOT").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("UPDATE_BINANCE_SPOT").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("UPDATE_BITFINEX_SPOT").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("UPDATE_BYBIT_SPOT").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("UPDATE_COINBASE_SPOT").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("UPDATE_OKX_SPOT").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("UPDATE_KRAKEN_SPOT").timeBased().everyHours(1).create();
  return "Triggers installed: per-connector CEX refresh every 1 hour";
}

// Pose/garantit les checkboxes de refresh hors onglets Bitpanda (Z1 et AC2).
function SETUP_BITPANDA_REFRESH_CELL() {
  var ss = SpreadsheetApp.openById("1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4");
  var done = [];
  for (var name in BITPANDA_REFRESH_CELLS) {
    if (!Object.prototype.hasOwnProperty.call(BITPANDA_REFRESH_CELLS, name)) continue;
    var sh = ss.getSheetByName(name);
    if (!sh) continue;
    var cells = BITPANDA_REFRESH_CELLS[name];
    for (var cell in cells) {
      if (!Object.prototype.hasOwnProperty.call(cells, cell)) continue;
      sh.getRange(cell).insertCheckboxes().setValue(false);
      done.push(name + "!" + cell);
    }
  }
  return "OK_REFRESH_CELLS=" + done.join(",");
}

function DIAG_BITPANDA_API() {
  var apiKey = _bpGetApiKey_(BITPANDA_SYNC_CONFIG.API_KEY_PROP, true);
  var buckets = _bpFetchBuckets_(apiKey);
  var msg = [
    "Bitpanda API diag " + BITPANDA_SYNC_VERSION,
    "crypto=" + buckets.crypto.length,
    "commodity=" + buckets.commodity.length,
    "fiat=" + buckets.fiat.length,
    "stocks=" + buckets.stocks.length,
    "action=" + buckets.action.length,
    "unknown=" + buckets.unknown.length,
    "crypto sample=" + JSON.stringify(buckets.crypto.slice(0, 5)),
    "commodity sample=" + JSON.stringify(buckets.commodity.slice(0, 5)),
    "fiat sample=" + JSON.stringify(buckets.fiat.slice(0, 5)),
    "stocks sample=" + JSON.stringify(buckets.stocks.slice(0, 10)),
    "action sample=" + JSON.stringify(buckets.action.slice(0, 10)),
    "unknown sample=" + JSON.stringify(buckets.unknown.slice(0, 10))
  ].join("\n");
  Logger.log(msg);
  return msg;
}

function _bpUpdateSelectedBuckets_(writeMap, sourceLabel) {
  // v4.15.109: per-connector lock instead of shared global ScriptLock.
  if (typeof CEX_ACQUIRE_LOCK === "function" && !CEX_ACQUIRE_LOCK("BITPANDA")) return "BUSY";
  try {
    var ss = SpreadsheetApp.openById("1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4");
    var apiKey = _bpGetApiKey_(BITPANDA_SYNC_CONFIG.API_KEY_PROP, true);
    var buckets = _bpFetchBuckets_(apiKey);

    // v4.15.68: fusionner le bucket "action" dans "stocks" (onglet Action supprime).
    var stocksRows = _bpMergeBuckets_(buckets.stocks, buckets.action);

    if (writeMap.crypto) _bpWriteRows_(ss, BITPANDA_SYNC_CONFIG.SHEETS.CRYPTO, buckets.crypto, sourceLabel);
    if (writeMap.commodity) _bpWriteRows_(ss, BITPANDA_SYNC_CONFIG.SHEETS.COMMODITY, buckets.commodity, sourceLabel);
    if (writeMap.fiat) _bpWriteRows_(ss, BITPANDA_SYNC_CONFIG.SHEETS.FIAT, buckets.fiat, sourceLabel);
    if (writeMap.stocks) _bpWriteRows_(ss, BITPANDA_SYNC_CONFIG.SHEETS.STOCKS, stocksRows, sourceLabel);

    var status = {
      ok: true,
      ts: new Date().toISOString(),
      mode: sourceLabel,
      wrote: {
        crypto: !!writeMap.crypto,
        commodity: !!writeMap.commodity,
        fiat: !!writeMap.fiat,
        stocks: !!writeMap.stocks
      },
      crypto: buckets.crypto.length,
      commodity: buckets.commodity.length,
      fiat: buckets.fiat.length,
      stocks: stocksRows.length,
      action: buckets.action.length,
      unknown: buckets.unknown.length
    };
    _bpSetStatus_(status);
    return JSON.stringify(status);
  } catch (err) {
    var statusErr = { ok: false, ts: new Date().toISOString(), error: String(err) };
    _bpSetStatus_(statusErr);
    Logger.log("_bpUpdateSelectedBuckets_ ERROR: " + err);
    return JSON.stringify(statusErr);
  } finally {
    if (typeof CEX_RELEASE_LOCK === "function") CEX_RELEASE_LOCK("BITPANDA");
  }
}

function UPDATE_BITPANDA_SPOT() {
  return _bpUpdateSelectedBuckets_({ crypto: true, commodity: true, fiat: true, stocks: true }, "bitpanda-api");
}

function UPDATE_BITPANDA_STOCKS_FIAT() {
  return _bpUpdateSelectedBuckets_({ fiat: true, stocks: true }, "bitpanda-api-action-rebalancing");
}

function UPDATE_BITPANDA_CRYPTO_FIAT() {
  return _bpUpdateSelectedBuckets_({ crypto: true, fiat: true }, "bitpanda-api-crypto-cex");
}

// v4.15.115: crypto uniquement — le bloc CEX de Portefeuille Crypto!AC2 n'a pas
// besoin de rafraichir CEX - Bitpanda Fiat (la fiat n'est pas trackee la-bas).
function UPDATE_BITPANDA_CRYPTO() {
  return _bpUpdateSelectedBuckets_({ crypto: true }, "bitpanda-api-crypto-only");
}

function BITPANDA_SYNC_STATUS() {
  return PropertiesService.getScriptProperties().getProperty(BITPANDA_SYNC_CONFIG.STATUS_PROP) || "NO_STATUS";
}

function BITPANDA_TRIGGER_STATUS() {
  var trs = ScriptApp.getProjectTriggers();
  var hourly = 0, watchdog = 0;
  for (var i = 0; i < trs.length; i++) {
    var fn = trs[i].getHandlerFunction();
    if (fn === "UPDATE_BITPANDA_SPOT") hourly++;
    else if (fn === "BITPANDA_REFRESH_WATCHDOG") watchdog++;
  }
  return "hourly=" + hourly + " refreshWatchdog=" + watchdog;
}

// Installe les DEUX triggers: sync horaire + watchdog de refresh manuel (coche).
function INSTALL_BITPANDA_SYNC_TRIGGER() {
  var trs = ScriptApp.getProjectTriggers();
  for (var i = 0; i < trs.length; i++) {
    var fn = trs[i].getHandlerFunction();
    if (fn === "UPDATE_BITPANDA_SPOT" || fn === "BITPANDA_REFRESH_WATCHDOG") ScriptApp.deleteTrigger(trs[i]);
  }
  ScriptApp.newTrigger("UPDATE_BITPANDA_SPOT").timeBased().everyHours(1).create();
  return "LEGACY_DISABLED: use CEX_HOURLY_REFRESH for hourly CEX refresh";
}

// ============================================================
// INFO_TOTAL CEX — v4.15.121
// Appends a TOTAL row at the bottom of a CEX sheet, summing
// balance × price_eur for each line. Idempotent: removes any
// prior TOTAL row before appending. Uses the existing
// PriceManager.computePriceEur(symbol) cascade.
// ============================================================

/**
 * Cached price map for CEX INFO_TOTAL.
 * Reads "Portefeuille Crypto" (CMC top 5000+) once, caches the result
 * in ScriptProperties for 1h. Avoids reading 5000+ rows on every CEX
 * sync (6 syncs × 4h = 36/day + manual A1), which was pushing
 * UPDATE_*_SPOT past the 6-min trigger limit.
 * To force a rebuild, call _cexClearPriceMapCache_() or set
 * CEX_PRICE_MAP_CACHE = "" in ScriptProperties.
 * @returns {Object<string, number>|null} symbol -> EUR price map, or null on failure
 */
function _cexGetPriceMap_() {
  var CACHE_KEY = "CEX_PRICE_MAP_CACHE";
  var TTL_MS = 60 * 60 * 1000;  // 1h
  var props = PropertiesService.getScriptProperties();
  try {
    var raw = props.getProperty(CACHE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.ts && (Date.now() - Number(parsed.ts)) < TTL_MS && parsed.map) {
        return parsed.map;
      }
    }
  } catch (eRead) {
    // Bad cache entry: rebuild.
  }

  var map = {};
  try {
    var ss = SpreadsheetApp.openById(BITPANDA_SYNC_CONFIG.SPREADSHEET_ID);
    var pc = ss.getSheetByName("Portefeuille Crypto");
    if (pc) {
      var pcLastRow = pc.getLastRow();
      if (pcLastRow >= 2) {
        var pcRange = pc.getRange(2, 1, pcLastRow - 1, 3).getValues();
        for (var pi = 0; pi < pcRange.length; pi++) {
          var sym = String(pcRange[pi][0] || "").trim().toUpperCase();
          var px = pcRange[pi][2];
          if (sym && px != null && isFinite(Number(px)) && Number(px) > 0) {
            map[sym] = Number(px);
          }
        }
      }
    }
  } catch (eMap) {
    Logger.log("[CEX_TOTAL] price map build failed: " + eMap);
    return null;
  }

  try {
    props.setProperty(CACHE_KEY, JSON.stringify({ ts: Date.now(), map: map }));
  } catch (eWrite) {
    // ScriptProperties full: skip cache, just return the live map.
  }
  return map;
}

/**
 * Clear the CEX price map cache (e.g., after a major CMC update or
 * when diagnosing stale prices).
 */
function _cexClearPriceMapCache_() {
  try { PropertiesService.getScriptProperties().deleteProperty("CEX_PRICE_MAP_CACHE"); } catch (e) {}
  return "CEX_PRICE_MAP_CACHE cleared";
}

/**
 * Bitpanda stock ticker aliases (obsolete / European variants) that differ
 * from the Action Rebalancing symbols. Resolves them in the stock
 * price map so the price lookup works without modifying the source data.
 */
function _cexAddStockAliases_(stockPriceMap) {
  if (!stockPriceMap) return;
  var aliases = [
    // Bitpanda ticker -> Action Rebalancing symbol (if different)
    ["FB", "META"],
    ["BRKB", "NYSE:BRK.B"],
    ["GOOGL", "GOOG"],
    ["BROA", "AVGO"],
    ["TSFA", "TSLA"],
    ["RDSA", "SHEL"],
    ["MRKUS", "MRK"],
    ["SSU", "KRX:005930"],
    ["SMSN", "KRX:005930"],
    ["HYXS", "KRX:000660"],
    ["MC", "EPA:MC"],
    ["OR", "EPA:OR"],
    ["RMS", "EPA:RMS"],
    ["TM", "TYO:7203"],
    // AMD-US -> AMD (some Bitpanda lines use a -US suffix)
    ["AMD-US", "AMD"],
    ["NESN", "NESN.SW"],
    ["NOVO", "NOVO-B.CO"],
    ["NOVO-B", "NOVO-B.CO"]
  ];
  for (var i = 0; i < aliases.length; i++) {
    var alias = aliases[i];
    if (stockPriceMap[alias[1]] != null && stockPriceMap[alias[0]] == null) {
      stockPriceMap[alias[0]] = stockPriceMap[alias[1]];
    }
  }
}

// v4.15.121: Hardcoded CEX symbol -> CoinGecko gecko id map. Used by
// _cexComputeAndAppendTotal_ to resolve CEX asset symbols (no contract
// available) to a CoinGecko id, then fetch the USD price via
// PriceSources.llamaPriceUsd and convert to EUR. Symbols not in this
// map fall back to the cached Portefeuille Crypto price map (top 5000+).
// To extend: add new entries {SYMBOL: "coingecko-id"} here.
var CEX_SYMBOL_GECKO_IDS = {
  "BTC": "bitcoin",
  "ETH": "ethereum",
  "WETH": "weth",
  "WBTC": "wrapped-bitcoin",
  "USDT": "tether",
  "USDC": "usd-coin",
  "DAI": "dai",
  "BUSD": "binance-usd",
  "FDUSD": "first-digital-usd",
  "TUSD": "true-usd",
  "EURC": "euro-coin",
  "EURI": "euri",
  "BNB": "binancecoin",
  "SOL": "solana",
  "XRP": "ripple",
  "TRX": "tron",
  "ADA": "cardano",
  "DOGE": "dogecoin",
  "AVAX": "avalanche-2",
  "DOT": "polkadot",
  "MATIC": "matic-network",
  "POL": "polygon-ecosystem-token",
  "LINK": "chainlink",
  "LTC": "litecoin",
  "BCH": "bitcoin-cash",
  "ATOM": "cosmos",
  "NEAR": "near",
  "APT": "aptos",
  "ARB": "arbitrum",
  "OP": "optimism",
  "UNI": "uniswap",
  "ETC": "ethereum-classic",
  "XLM": "stellar",
  "XMR": "monero",
  "ZEC": "zcash",
  "AAVE": "aave",
  "SUI": "sui",
  "SEI": "sei-network",
  "TIA": "celestia",
  "INJ": "injective-protocol",
  "QNT": "quant-network",
  "ALGO": "algorand",
  "FIL": "filecoin",
  "VET": "vechain",
  "HBAR": "hedera-hashgraph",
  "MKR": "maker",
  "COMP": "compound",
  "CRV": "curve-dao-token",
  "SNX": "synthetix",
  "YFI": "yearn-finance",
  "SUSHI": "sushi",
  "1INCH": "1inch",
  "GRT": "the-graph",
  "BAT": "basic-attention-token",
  "ZRX": "0x",
  "BAL": "balancer",
  "REN": "republic-protocol",
  "OMG": "omisego",
  "ANKR": "ankr",
  "ENJ": "enjincoin",
  "MANA": "decentraland",
  "SAND": "the-sandbox",
  "AXS": "axie-infinity",
  "CHZ": "chiliz",
  "FLOW": "flow",
  "NEAR": "near",
  "ROSE": "oasis-network",
  "KSM": "kusama",
  "ZIL": "zilliqa",
  "BAT": "basic-attention-token",
  "IOTA": "iota",
  "XEM": "nem",
  "DASH": "dash",
  "EOS": "eos",
  "XTZ": "tezos",
  "MKR": "maker",
  "REP": "augur",
  "KNC": "kyber-network-crystal",
  "LRC": "loopring",
  "NMR": "numeraire",
  "OXT": "orchid",
  "REN": "republic-protocol",
  "STORJ": "storj",
  "GRT": "the-graph",
  "FET": "fetch-ai",
  "GT": "gatechain-token",
  "HT": "huobi-token",
  "KCS": "kucoin-shares",
  "OKB": "okb",
  "GTX": "guarantee",
  "ETHW": "ethereum-pow",
  "ATA": "automata",
  "MBOX": "mobox",
  "HIGH": "highstreet",
  "RDNT": "radiant-capital",
  "ANC": "anchor-neural",
  "OG": "og-fan-token",
  "D": "darc-token",
  "OPG": "optimus-rgb",
  "SOLO": "solo-validator"
};

/**
 * Look up the CoinGecko gecko id for a CEX asset symbol.
 * @param {string} symbol - uppercase ticker (e.g. "BTC")
 * @returns {string|null} gecko id (without "coingecko:" prefix) or null
 */
function _cexSymbolToGeckoId_(symbol) {
  if (!symbol) return null;
  var s = String(symbol).trim().toUpperCase();
  if (!s) return null;
  // Direct map (most common CEX assets)
  if (CEX_SYMBOL_GECKO_IDS[s]) return CEX_SYMBOL_GECKO_IDS[s];
  // Strip common suffixes (w / wrapped variants) — best-effort only
  // for top-50 tokens; longer-tail assets should be added explicitly.
  if (s.indexOf("W") === 0 && s.length > 1) {
    var unwrapped = s.substring(1);
    if (CEX_SYMBOL_GECKO_IDS[unwrapped]) return CEX_SYMBOL_GECKO_IDS[unwrapped];
  }
  return null;
}

/**
 * Compute and append the INFO_TOTAL row to a CEX sheet.
 * @param {string} sheetName - e.g. "CEX - Binance"
 * @param {Array<[string, number, string, string]>} balances - rows [symbol, balance, source, stamp]
 * @param {string} provider - e.g. "binance", "kraken", "bitpanda"
 * @returns {number} total value in EUR written to the TOTAL row
 */
function _cexComputeAndAppendTotal_(ss, sheetName, balances, provider) {
  var sh = ss.getSheetByName(sheetName);

  // 1. Strip any prior TOTAL row near the expected position (3 + nbAssets).
  //    Do NOT scan the entire sheet — the Vérif MAP formula in column F
  //    produces content in thousands of rows, inflating getLastRow() and
  //    causing a 6-min timeout if we iterate from the bottom.
  var nb = (balances || []).length;
  var totalExpected = 3 + nb;
  var oldTotalRow = -1;
  for (var sr = totalExpected + 50; sr >= totalExpected && sr >= 3; sr--) {
    var srA = String(sh.getRange(sr, 1, 1, 1).getValue() || "").trim().toUpperCase();
    var srB = String(sh.getRange(sr, 2, 1, 1).getValue() || "").trim();
    if (srA === "TOTAL" || srB === "INFO_TOTAL") {
      oldTotalRow = sr;
      break;
    }
  }
  if (oldTotalRow >= 3) {
    sh.deleteRow(oldTotalRow);
  }

  // 2. Build a symbol -> price (EUR) map.
  //    Strategy: resolve symbol -> coingecko gecko id via the curated
  //    CEX_SYMBOL_MAP below, then call PriceSources.llamaPriceUsd on the
  //    gecko id. DefiLlama L1 (2h) + L2 (6h) cache absorbs the repeated
  //    lookups across syncs. For symbols outside the map, fall back to
  //    the cached Portefeuille Crypto price map (top 5000+ symbols, 1h
  //    ScriptProperties cache).
  //
  //    Bitpanda Stocks: stocks are not priced by DefiLlama/CoinGecko.
  //    Instead, read the "Action Rebalancing" sheet (column D = Price (€))
  //    which uses the same pricing pipeline as the user's stock portfolio.
  var priceMap = _cexGetPriceMap_();
  if (!priceMap) priceMap = {};
  var priceMapFallback = false;
  var isStocks = String(sheetName || "").toLowerCase().indexOf("stocks") >= 0;
  var stockPriceMap = {};
  if (isStocks) {
    try {
      var arS = ss.getSheetByName("Action Rebalancing");
      if (arS) {
        var arLast = arS.getLastRow();
        if (arLast >= 3) {
          var arVals = arS.getRange(3, 1, arLast - 2, 4).getValues();
          for (var asi = 0; asi < arVals.length; asi++) {
            var aSym = String(arVals[asi][0] || "").trim().toUpperCase();
            var aPx = arVals[asi][3]; // column D = Price (€)
            if (aSym && aPx != null && isFinite(Number(aPx)) && Number(aPx) > 0) {
              stockPriceMap[aSym] = Number(aPx);
            }
          }
        }
      }
    } catch (eStocks) {
      Logger.log("[CEX_TOTAL] stocks price map build failed: " + eStocks);
    }
    // Bitpanda uses its own ticker aliases (obsolètes / European variants)
    // that differ from the Action Rebalancing / companiesmarketcap symbols.
    // Resolve them here so the price lookup works without modifying the
    // source data written by the sync.
    _cexAddStockAliases_(stockPriceMap);
  }

  // 3. Sum balance x price. Stablecoins get 1.0 EUR via fast-path.
  //    Non-stables are priced via PriceSources.llamaPriceUsd on the gecko
  //    id from CEX_SYMBOL_MAP. Symbols not in the map fall back to the
  //    Portefeuille Crypto priceMap (top 5000+).
  var total = 0;
  var valued = 0;
  var skipped = 0;
  for (var i = 0; i < (balances || []).length; i++) {
    var row = balances[i] || [];
    var symbol = String(row[0] || "").trim().toUpperCase();
    var balance = Number(row[1] || 0);
    if (!symbol || balance <= 0) continue;

    var priceEur = null;
    try {
      // Fiat EUR: the Bitpanda Fiat bucket holds EUR balances, so EUR = 1.0.
      var t = null;
      if (symbol === "EUR") t = "EUR";
      if (!t && typeof WCORE_STABLECOINS !== "undefined" && WCORE_STABLECOINS.getType) {
        t = WCORE_STABLECOINS.getType(symbol);
      }
      if (!t && typeof ChainFactory !== "undefined" && ChainFactory.STABLECOINS && ChainFactory.STABLECOINS.getType) {
        t = ChainFactory.STABLECOINS.getType(symbol);
      }
      if (t === "EUR" || t === "USD") {
        priceEur = 1.0;
      } else if (isStocks && stockPriceMap[symbol] != null) {
        priceEur = stockPriceMap[symbol];
      } else if (_cexSymbolToGeckoId_(symbol)) {
        // Primary path: existing PriceSources.llamaPriceUsd on the gecko id.
        // L1 (2h CacheService) + L2 (6h ScriptProperties) absorb repeated
        // lookups. USD price is converted to EUR via the FxRate cascade.
        var geckoId = _cexSymbolToGeckoId_(symbol);
        var usd = PriceSources.llamaPriceUsd("coingecko:" + geckoId, null, {});
        if (isFinite(Number(usd)) && Number(usd) > 0) {
          var fx = null;
          try { fx = (typeof FxRate !== "undefined" && FxRate.getUsdToEur) ? FxRate.getUsdToEur() : null; } catch (eFx) { fx = null; }
          if (isFinite(Number(fx)) && Number(fx) > 0) {
            priceEur = Number(usd) * Number(fx);
          } else {
            // No FX: fall through to Portefeuille Crypto map (already EUR).
            if (priceMap[symbol] != null) priceEur = priceMap[symbol];
            priceMapFallback = true;
          }
        } else if (priceMap[symbol] != null) {
          // llama miss (token not in DefiLlama): use the Portefeuille Crypto map.
          priceEur = priceMap[symbol];
          priceMapFallback = true;
        }
      } else if (priceMap[symbol] != null) {
        priceEur = priceMap[symbol];
        priceMapFallback = true;
      }
    } catch (ePrice) {
      Logger.log("[CEX_TOTAL] skip no-price: " + symbol + " in " + sheetName + " (" + (ePrice && ePrice.message ? ePrice.message : ePrice) + ")");
    }
    if (priceEur == null || !isFinite(priceEur) || priceEur <= 0) {
      Logger.log("[CEX_TOTAL] skip no-price: " + symbol + " in " + sheetName);
      skipped++;
      continue;
    }
    total += balance * Number(priceEur);
    valued++;
  }

  // 3. Write per-row value_eur to column F (preserve column E "Vérif") and
  //    the INFO_TOTAL row at the bottom. The Recap Portfolio column B formula is:
  //      =INDEX(target!'G:G; MATCH("INFO_TOTAL"; target!'B:B; 0))
  //    so we write "INFO_TOTAL" in column B and the total in column G of the
  //    TOTAL row. This keeps the Recap!B formula dynamic (no scripted writes
  //    needed) and harmonises CEX sheets with the Ledger output format.
  //    Write per-row value_eur to F first before the INFO_TOTAL row.

  // Clear any stale value_eur from previous sync (column E only, column F
  // "Vérif" is user-managed and must be preserved). Use the sheet's actual
  // last row (inflated by the Vérif MAP formula) to clear all visible rows.
  var lastRow = sh.getLastRow();
  if (lastRow >= 3) sh.getRange(3, 5, lastRow - 2, 1).clearContent();

  // Write the value_eur header at E2.
  sh.getRange(2, 5, 1, 1).setValue("value_eur");

  for (var iVal = 0; iVal < (balances || []).length; iVal++) {
    var rowVal = balances[iVal] || [];
    var symVal = String(rowVal[0] || "").trim().toUpperCase();
    var balVal = Number(rowVal[1] || 0);
    var valEur = 0;
    if (symVal && balVal > 0) {
      // Reuse the same pricing logic as in step 2 above: stablecoin fast-path
      // then symbol map / priceMap fallback.
      var t2 = null;
      try {
        if (typeof WCORE_STABLECOINS !== "undefined" && WCORE_STABLECOINS.getType) t2 = WCORE_STABLECOINS.getType(symVal);
        if (!t2 && typeof ChainFactory !== "undefined" && ChainFactory.STABLECOINS && ChainFactory.STABLECOINS.getType) t2 = ChainFactory.STABLECOINS.getType(symVal);
      } catch (eT2) {}
      var px = null;
      if (t2 === "EUR" || t2 === "USD") {
        px = 1.0;
      } else if (symVal === "EUR") {
        px = 1.0;
      } else if (isStocks && stockPriceMap[symVal] != null) {
        px = stockPriceMap[symVal];
      } else if (_cexSymbolToGeckoId_(symVal)) {
        try {
          var geckoId = _cexSymbolToGeckoId_(symVal);
          var usd = PriceSources.llamaPriceUsd("coingecko:" + geckoId, null, {});
          if (isFinite(Number(usd)) && Number(usd) > 0) {
            var fx2 = null;
            try { fx2 = (typeof FxRate !== "undefined" && FxRate.getUsdToEur) ? FxRate.getUsdToEur() : null; } catch (eFx2) { fx2 = null; }
            if (isFinite(Number(fx2)) && Number(fx2) > 0) px = Number(usd) * Number(fx2);
          }
        } catch (eLlama2) {}
        if (px == null && priceMap[symVal] != null) px = priceMap[symVal];
      } else if (priceMap[symVal] != null) {
        px = priceMap[symVal];
      }
      if (px != null && isFinite(px) && px > 0) valEur = balVal * px;
    }
    // Write to column E (column 5), row 3 + iVal (rows 1-2 are checkbox + header).
    if (valEur > 0) {
      sh.getRange(3 + iVal, 5, 1, 1).setValue(valEur);
      sh.getRange(3 + iVal, 5, 1, 1).setNumberFormat("0.00");
    } else {
      sh.getRange(3 + iVal, 5, 1, 1).clearContent();
    }
  }

  // 4. Write the INFO_TOTAL row directly below the asset list (not at the
  //    bottom of the page — the Vérif MAP formula fills column F down to the
  //    sheet max, inflating getLastRow()).
  var totalRow = 3 + (balances || []).length;
  var stamp = Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss");
  var valueCell = Math.round(total * 100) / 100;
  var providerCell = String(provider || "").toLowerCase();

  // A="" (empty, avoids the Vérif MAP formula matching "TOTAL" or "INFO_TOTAL"
  // against Portefeuille Crypto Details), B="INFO_TOTAL" (text the Recap!B
  // formula matches), C: provider, D: stamp.
  sh.getRange(totalRow, 1, 1, 4).setValues([["", "INFO_TOTAL", providerCell, stamp]]);
  sh.getRange(totalRow, 4, 1, 1).setNumberFormat("@");
  // G (column 7): total value for the Recap!B INDEX formula.
  sh.getRange(totalRow, 7, 1, 1).setValue(valueCell);
  sh.getRange(totalRow, 7, 1, 1).setNumberFormat("0.00");

  Logger.log("[CEX_TOTAL] " + sheetName + " TOTAL=" + valueCell + " EUR valued=" + valued + " skipped=" + skipped);
  return valueCell;
}

/**
 * Write the CEX INFO_TOTAL value directly to Recap Portfolio column B
 * for a single CEX sheet. Called after each CEX sync writes its TOTAL row.
 * Matches the row by the exact sheet name in column A.
 * @param {Spreadsheet} ss - active spreadsheet
 * @param {string} sheetName - e.g. "CEX - Binance"
 * @param {number} totalValue - total in EUR to write to column B
 */
function _cexUpdateRecapColumnB_(ss, sheetName, totalValue) {
  try {
    if (!ss || !sheetName) return;
    var recap = ss.getSheetByName("Recap Portfolio");
    if (!recap) return;
    var lastRow = recap.getLastRow();
    if (lastRow < 2) return;
    // Column A already has the hyperlinks written by _setRecapHyperlinks_.
    // Read column A values and find the row whose text matches sheetName.
    var values = recap.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0] || "").trim() === sheetName) {
        recap.getRange(2 + i, 2, 1, 1).setValue(totalValue);
        return;
      }
    }
  } catch (e) {
    Logger.log("[CEX_TOTAL] Recap column B update failed: " + (e && e.message ? e.message : e));
  }
}
