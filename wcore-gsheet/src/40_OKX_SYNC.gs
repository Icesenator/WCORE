// v4.15.97 - OKX sync via Railway cex-relay (HMAC signed relay-side).
// Onglet de sortie: "CEX - OKX".
//
// Recupere les soldes OKX et les ecrit dans l'onglet "OKX Crypto".
// Les secrets OKX restent dans Railway. Apps Script stocke seulement URL+token relais.

var OKX_SYNC_VERSION = "4.15.97";

var OKX_SYNC_CONFIG = {
  RELAY_URL_PROP: "OKX_RELAY_URL",
  RELAY_TOKEN_PROP: "OKX_RELAY_TOKEN",
  STATUS_PROP: "OKX_SYNC_STATUS",
  REFRESH_FLAG_PROP: "OKX_REFRESH_REQUESTED",
  SHEET: "CEX - OKX",
  SPREADSHEET_ID: "1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4"
};

function SET_OKX_RELAY(url, token) {
  if (!url || String(url).indexOf("http") !== 0) throw new Error("URL relais invalide");
  if (!token || String(token).length < 20) throw new Error("Token relais invalide");
  var cleanUrl = String(url).trim().replace(/\/+$/, "");
  var cleanToken = String(token).trim();
  var up = PropertiesService.getUserProperties();
  up.setProperty(OKX_SYNC_CONFIG.RELAY_URL_PROP, cleanUrl);
  up.setProperty(OKX_SYNC_CONFIG.RELAY_TOKEN_PROP, cleanToken);
  try {
    var dp = PropertiesService.getDocumentProperties();
    dp.setProperty(OKX_SYNC_CONFIG.RELAY_URL_PROP, cleanUrl);
    dp.setProperty(OKX_SYNC_CONFIG.RELAY_TOKEN_PROP, cleanToken);
  } catch (eDoc) {}
  return "OK: OKX_RELAY_URL + OKX_RELAY_TOKEN saved (UserProperties + DocumentProperties)";
}

function CLEAR_OKX_RELAY() {
  var up = PropertiesService.getUserProperties();
  up.deleteProperty(OKX_SYNC_CONFIG.RELAY_URL_PROP);
  up.deleteProperty(OKX_SYNC_CONFIG.RELAY_TOKEN_PROP);
  try {
    var dp = PropertiesService.getDocumentProperties();
    dp.deleteProperty(OKX_SYNC_CONFIG.RELAY_URL_PROP);
    dp.deleteProperty(OKX_SYNC_CONFIG.RELAY_TOKEN_PROP);
  } catch (eDoc) {}
  return "OK: OKX relay config cleared";
}

function _okxGetRelay_() {
  var up = PropertiesService.getUserProperties();
  var url = up.getProperty(OKX_SYNC_CONFIG.RELAY_URL_PROP);
  var token = up.getProperty(OKX_SYNC_CONFIG.RELAY_TOKEN_PROP);
  if (!url || !token) {
    try {
      var dp = PropertiesService.getDocumentProperties();
      url = url || dp.getProperty(OKX_SYNC_CONFIG.RELAY_URL_PROP);
      token = token || dp.getProperty(OKX_SYNC_CONFIG.RELAY_TOKEN_PROP);
    } catch (eDoc) {}
  }
  if ((!url || !token) && typeof BYBIT_SYNC_CONFIG !== "undefined") {
    url = url || up.getProperty(BYBIT_SYNC_CONFIG.RELAY_URL_PROP);
    token = token || up.getProperty(BYBIT_SYNC_CONFIG.RELAY_TOKEN_PROP);
    try {
      var bybitDp = PropertiesService.getDocumentProperties();
      url = url || bybitDp.getProperty(BYBIT_SYNC_CONFIG.RELAY_URL_PROP);
      token = token || bybitDp.getProperty(BYBIT_SYNC_CONFIG.RELAY_TOKEN_PROP);
    } catch (eBybitDoc) {}
  }
  if ((!url || !token) && typeof BINANCE_SYNC_CONFIG !== "undefined") {
    url = url || up.getProperty(BINANCE_SYNC_CONFIG.RELAY_URL_PROP);
    token = token || up.getProperty(BINANCE_SYNC_CONFIG.RELAY_TOKEN_PROP);
  }
  if (!url || !token) throw new Error("Missing OKX_RELAY_URL/OKX_RELAY_TOKEN. Run SET_OKX_RELAY(url, token)");
  return { url: String(url).replace(/\/+$/, ""), token: token };
}

function _okxParseAmount_(value) {
  var n = Number(String(value == null ? "0" : value).replace(",", "."));
  return isFinite(n) ? n : 0;
}

function _okxSetStatus_(obj) {
  try { PropertiesService.getUserProperties().setProperty(OKX_SYNC_CONFIG.STATUS_PROP, JSON.stringify(obj)); } catch (eUser) {}
  try { PropertiesService.getDocumentProperties().setProperty(OKX_SYNC_CONFIG.STATUS_PROP, JSON.stringify(obj)); } catch (eDoc) {}
}

function OKX_SYNC_STATUS() {
  var raw = "";
  try { raw = PropertiesService.getUserProperties().getProperty(OKX_SYNC_CONFIG.STATUS_PROP) || ""; } catch (eUser) {}
  if (!raw) { try { raw = PropertiesService.getDocumentProperties().getProperty(OKX_SYNC_CONFIG.STATUS_PROP) || ""; } catch (eDoc) {} }
  return raw || "NO_STATUS";
}

function _okxFetchBucketsViaRelay_() {
  var relay = _okxGetRelay_();
  var url = relay.url + "/okx?token=" + encodeURIComponent(relay.token);
  var resp = UrlFetchApp.fetch(url, { method: "get", muteHttpExceptions: true });
  if (!resp) throw new Error("OKX relay HTTP blocked/null response");
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code < 200 || code >= 300) throw new Error("Relay HTTP " + code + ": " + text.substring(0, 300));
  var data = JSON.parse(text);
  if (!data || !data.ok) throw new Error("Relay error: " + (data && data.error ? data.error : "unknown").toString().substring(0, 300));
  var out = [];
  var spot = data.spot || [];
  for (var i = 0; i < spot.length; i++) {
    var sym = String(spot[i][0] || "").trim().toUpperCase();
    var amt = _okxParseAmount_(spot[i][1]);
    if (sym && amt > 0) out.push([sym, amt]);
  }
  return { spot: out };
}

function DIAG_OKX_API() {
  try {
    var buckets = _okxFetchBucketsViaRelay_();
    var msg = ["OKX API diag " + OKX_SYNC_VERSION, "spot=" + buckets.spot.length, "spot sample=" + JSON.stringify(buckets.spot.slice(0, 12))].join("\n");
    Logger.log(msg);
    return msg;
  } catch (err) {
    var m = "OKX API diag ERROR: " + (err && err.message ? err.message : err);
    Logger.log(m);
    return m;
  }
}

function SETUP_OKX_SHEET() {
  var ss = SpreadsheetApp.openById(OKX_SYNC_CONFIG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(OKX_SYNC_CONFIG.SHEET);
  if (!sh) sh = ss.insertSheet(OKX_SYNC_CONFIG.SHEET);
  sh.getRange("A1").insertCheckboxes().setValue(false);
  sh.getRange("B1").setValue(Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss")).setNumberFormat("@");
  sh.getRange(2, 1, 1, 4).setValues([["cryptocoin_symbol", "balance", "source", "updated_at"]]);
  return "OK_OKX_SHEET_READY";
}

function _okxBuildValues_(buckets, stamp) {
  var values = [];
  var list = (buckets && buckets.spot) || [];
  for (var i = 0; i < list.length; i++) values.push([list[i][0], _okxParseAmount_(list[i][1]), "spot", stamp]);
  return values;
}

function _okxWriteSheet_(ss, buckets) {
  var sh = ss.getSheetByName(OKX_SYNC_CONFIG.SHEET);
  if (!sh) sh = ss.insertSheet(OKX_SYNC_CONFIG.SHEET);
  var stamp = Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss");
  var dataRows = _okxBuildValues_(buckets, stamp);
  var values = [[false, stamp, "", ""], ["cryptocoin_symbol", "balance", "source", "updated_at"]].concat(dataRows);
  // v4.15.120: clear only data columns A:D so the user-managed "Vérif" column (E) survives syncs.
  var _clearRows = Math.max(values.length, Math.min(sh.getMaxRows(), values.length + 50));
  sh.getRange(1, 1, _clearRows, 4).clearContent();
  sh.getRange(1, 1, values.length, 4).setValues(values);
  sh.getRange("A1").insertCheckboxes().setValue(false);
  sh.getRange("B1:D1").setNumberFormat("@");
  if (values.length > 2) sh.getRange(3, 2, values.length - 2, 1).setNumberFormat("0.########");
  // v4.15.121: append INFO_TOTAL row.
  try { _cexComputeAndAppendTotal_(ss, OKX_SYNC_CONFIG.SHEET, dataRows, "okx"); } catch (eTot) { Logger.log("[CEX_TOTAL] okx append failed: " + eTot); }
  return dataRows.length;
}

function UPDATE_OKX_SPOT() {
  // v4.15.109: per-connector lock instead of shared global ScriptLock.
  if (typeof CEX_ACQUIRE_LOCK === "function" && !CEX_ACQUIRE_LOCK("OKX")) return "BUSY";
  try {
    var ss = SpreadsheetApp.openById(OKX_SYNC_CONFIG.SPREADSHEET_ID);
    var buckets = _okxFetchBucketsViaRelay_();
    var written = _okxWriteSheet_(ss, buckets);
    var status = { ok: true, ts: new Date().toISOString(), spot: buckets.spot.length, rows: written };
    _okxSetStatus_(status);
    return JSON.stringify(status);
  } catch (err) {
    var statusErr = { ok: false, ts: new Date().toISOString(), error: String(err) };
    _okxSetStatus_(statusErr);
    Logger.log("UPDATE_OKX_SPOT ERROR: " + err);
    return JSON.stringify(statusErr);
  } finally {
    if (typeof CEX_RELEASE_LOCK === "function") CEX_RELEASE_LOCK("OKX");
  }
}

function OKX_ON_EDIT(e) {
  try {
    if (!e || !e.range) return false;
    var range = e.range;
    var cell = range.getA1Notation ? range.getA1Notation() : "";
    if (cell !== "A1") return false;
    var sheet = range.getSheet ? range.getSheet() : null;
    if (!sheet || sheet.getName() !== OKX_SYNC_CONFIG.SHEET) return false;
    var v = (typeof e.value !== "undefined") ? e.value : range.getValue();
    if (String(v).toUpperCase() !== "TRUE") return true;
    if (!e.triggerUid) {
      try { range.setValue(false); } catch (eResetSimple) {}
      return true;
    }
    try { range.setValue(false); } catch (eResetEarly) {}
    if (typeof CEX_QUEUE_OR_MARK_MANUAL_JOB === "function") CEX_QUEUE_OR_MARK_MANUAL_JOB(sheet, OKX_SYNC_CONFIG.REFRESH_FLAG_PROP, "OKX", UPDATE_OKX_SPOT, e);
    else if (typeof CEX_RUN_DIRECT_OR_QUEUE === "function") CEX_RUN_DIRECT_OR_QUEUE(sheet, OKX_SYNC_CONFIG.REFRESH_FLAG_PROP, "OKX", UPDATE_OKX_SPOT, e);
    else if (typeof CEX_SET_MANUAL_REQUEST === "function") CEX_SET_MANUAL_REQUEST(sheet, OKX_SYNC_CONFIG.REFRESH_FLAG_PROP);
    else {
      _okxSetRefreshFlag_();
      try { sheet.getRange("B1").setValue("REQUEST: " + Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss")).setNumberFormat("@"); } catch (eB1) {}
    }
    return true;
  } catch (err) {
    try { Logger.log("[OKX_ON_EDIT] " + (err && err.message ? err.message : err)); } catch (eLog) {}
    try { if (e && e.range) e.range.setValue(false); } catch (eReset) {}
    return true;
  }
}

function _okxSetRefreshFlag_() {
  var value = String(Date.now());
  try {
    PropertiesService.getScriptProperties().setProperty(OKX_SYNC_CONFIG.REFRESH_FLAG_PROP, value);
    return "SCRIPT";
  } catch (eScript) {
    PropertiesService.getUserProperties().setProperty(OKX_SYNC_CONFIG.REFRESH_FLAG_PROP, value);
    return "USER";
  }
}

function OKX_REFRESH_WATCHDOG() {
  if (typeof CEX_GET_SPREADSHEET === "function" && typeof CEX_HAS_MANUAL_REQUEST === "function") {
    var ss = CEX_GET_SPREADSHEET();
    if (!CEX_HAS_MANUAL_REQUEST(ss, OKX_SYNC_CONFIG.SHEET, OKX_SYNC_CONFIG.REFRESH_FLAG_PROP)) return "NO_REQUEST";
    CEX_CLEAR_MANUAL_REQUEST(OKX_SYNC_CONFIG.REFRESH_FLAG_PROP);
    return CEX_RUN_MANUAL_UPDATE(ss, OKX_SYNC_CONFIG.SHEET, "OKX", UPDATE_OKX_SPOT);
  }
  var props = PropertiesService.getScriptProperties();
  var userProps = PropertiesService.getUserProperties();
  var flag = props.getProperty(OKX_SYNC_CONFIG.REFRESH_FLAG_PROP) || userProps.getProperty(OKX_SYNC_CONFIG.REFRESH_FLAG_PROP);
  if (!flag) return "NO_REQUEST";
  props.deleteProperty(OKX_SYNC_CONFIG.REFRESH_FLAG_PROP);
  userProps.deleteProperty(OKX_SYNC_CONFIG.REFRESH_FLAG_PROP);
  return UPDATE_OKX_SPOT();
}
