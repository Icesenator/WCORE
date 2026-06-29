// v4.15.96 - Coinbase sync via Railway cex-relay (CDP ES256 signed relay-side).
// Onglet de sortie: "CEX - Coinbase".
//
// Recupere les soldes Coinbase et les ecrit dans l'onglet "Coinbase Crypto".
// Les secrets Coinbase restent dans Railway. Apps Script stocke seulement URL+token relais.
//
// Setup (Apps Script editor):
//   SET_COINBASE_RELAY("https://cex-relay-production.up.railway.app", "...")
// Diagnostic sans ecriture:
//   DIAG_COINBASE_API()
// Mise a jour:
//   UPDATE_COINBASE_SPOT()

var COINBASE_SYNC_VERSION = "4.15.96";

var COINBASE_SYNC_CONFIG = {
  RELAY_URL_PROP: "COINBASE_RELAY_URL",
  RELAY_TOKEN_PROP: "COINBASE_RELAY_TOKEN",
  STATUS_PROP: "COINBASE_SYNC_STATUS",
  REFRESH_FLAG_PROP: "COINBASE_REFRESH_REQUESTED",
  SHEET: "CEX - Coinbase",
  SPREADSHEET_ID: "1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4"
};

function SET_COINBASE_RELAY(url, token) {
  if (!url || String(url).indexOf("http") !== 0) throw new Error("URL relais invalide");
  if (!token || String(token).length < 20) throw new Error("Token relais invalide");
  var props = PropertiesService.getUserProperties();
  props.setProperty(COINBASE_SYNC_CONFIG.RELAY_URL_PROP, String(url).trim().replace(/\/+$/, ""));
  props.setProperty(COINBASE_SYNC_CONFIG.RELAY_TOKEN_PROP, String(token).trim());
  try {
    var dp = PropertiesService.getDocumentProperties();
    dp.setProperty(COINBASE_SYNC_CONFIG.RELAY_URL_PROP, String(url).trim().replace(/\/+$/, ""));
    dp.setProperty(COINBASE_SYNC_CONFIG.RELAY_TOKEN_PROP, String(token).trim());
  } catch (eDoc) {}
  return "OK: COINBASE_RELAY_URL + COINBASE_RELAY_TOKEN saved (UserProperties + DocumentProperties)";
}

function CLEAR_COINBASE_RELAY() {
  var up = PropertiesService.getUserProperties();
  up.deleteProperty(COINBASE_SYNC_CONFIG.RELAY_URL_PROP);
  up.deleteProperty(COINBASE_SYNC_CONFIG.RELAY_TOKEN_PROP);
  try {
    var dp = PropertiesService.getDocumentProperties();
    dp.deleteProperty(COINBASE_SYNC_CONFIG.RELAY_URL_PROP);
    dp.deleteProperty(COINBASE_SYNC_CONFIG.RELAY_TOKEN_PROP);
  } catch (eDoc) {}
  return "OK: Coinbase relay config cleared";
}

function _cbGetRelay_() {
  var up = PropertiesService.getUserProperties();
  var url = up.getProperty(COINBASE_SYNC_CONFIG.RELAY_URL_PROP);
  var token = up.getProperty(COINBASE_SYNC_CONFIG.RELAY_TOKEN_PROP);
  if (!url || !token) {
    try {
      var dp = PropertiesService.getDocumentProperties();
      url = url || dp.getProperty(COINBASE_SYNC_CONFIG.RELAY_URL_PROP);
      token = token || dp.getProperty(COINBASE_SYNC_CONFIG.RELAY_TOKEN_PROP);
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
  if (!url || !token) {
    throw new Error("Missing COINBASE_RELAY_URL/COINBASE_RELAY_TOKEN. Run SET_COINBASE_RELAY(url, token)");
  }
  return { url: String(url).replace(/\/+$/, ""), token: token };
}

function _cbParseAmount_(value) {
  var n = Number(String(value == null ? "0" : value).replace(",", "."));
  return isFinite(n) ? n : 0;
}

function _cbSetStatus_(obj) {
  try { PropertiesService.getUserProperties().setProperty(COINBASE_SYNC_CONFIG.STATUS_PROP, JSON.stringify(obj)); } catch (eUser) {}
  try { PropertiesService.getDocumentProperties().setProperty(COINBASE_SYNC_CONFIG.STATUS_PROP, JSON.stringify(obj)); } catch (eDoc) {}
}

function COINBASE_SYNC_STATUS() {
  var raw = "";
  try { raw = PropertiesService.getUserProperties().getProperty(COINBASE_SYNC_CONFIG.STATUS_PROP) || ""; } catch (eUser) {}
  if (!raw) { try { raw = PropertiesService.getDocumentProperties().getProperty(COINBASE_SYNC_CONFIG.STATUS_PROP) || ""; } catch (eDoc) {} }
  return raw || "NO_STATUS";
}

function _cbFetchBucketsViaRelay_() {
  var relay = _cbGetRelay_();
  var url = relay.url + "/coinbase?token=" + encodeURIComponent(relay.token);
  var resp = UrlFetchApp.fetch(url, { method: "get", muteHttpExceptions: true });
  if (!resp) throw new Error("Coinbase relay HTTP blocked/null response");
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error("Relay HTTP " + code + ": " + text.substring(0, 300));
  }
  var data = JSON.parse(text);
  if (!data || !data.ok) {
    throw new Error("Relay error: " + (data && data.error ? data.error : "unknown").toString().substring(0, 300));
  }
  var out = [];
  var spot = data.spot || [];
  for (var i = 0; i < spot.length; i++) {
    var sym = String(spot[i][0] || "").trim().toUpperCase();
    var amt = _cbParseAmount_(spot[i][1]);
    if (sym && amt > 0) out.push([sym, amt]);
  }
  return { spot: out };
}

function DIAG_COINBASE_API() {
  try {
    var buckets = _cbFetchBucketsViaRelay_();
    var msg = [
      "Coinbase API diag " + COINBASE_SYNC_VERSION,
      "spot=" + buckets.spot.length,
      "spot sample=" + JSON.stringify(buckets.spot.slice(0, 12))
    ].join("\n");
    Logger.log(msg);
    return msg;
  } catch (err) {
    var m = "Coinbase API diag ERROR: " + (err && err.message ? err.message : err);
    Logger.log(m);
    return m;
  }
}

function SETUP_COINBASE_SHEET() {
  var ss = SpreadsheetApp.openById(COINBASE_SYNC_CONFIG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(COINBASE_SYNC_CONFIG.SHEET);
  if (!sh) sh = ss.insertSheet(COINBASE_SYNC_CONFIG.SHEET);
  sh.getRange("A1").insertCheckboxes().setValue(false);
  sh.getRange("B1").setValue(Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss")).setNumberFormat("@");
  sh.getRange(2, 1, 1, 4).setValues([["cryptocoin_symbol", "balance", "source", "updated_at"]]);
  return "OK_COINBASE_SHEET_READY";
}

function _cbBuildValues_(buckets, stamp) {
  var values = [];
  var list = (buckets && buckets.spot) || [];
  for (var i = 0; i < list.length; i++) {
    values.push([list[i][0], _cbParseAmount_(list[i][1]), "spot", stamp]);
  }
  return values;
}

function _cbWriteSheet_(ss, buckets) {
  var sh = ss.getSheetByName(COINBASE_SYNC_CONFIG.SHEET);
  if (!sh) sh = ss.insertSheet(COINBASE_SYNC_CONFIG.SHEET);
  var stamp = Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss");
  var dataRows = _cbBuildValues_(buckets, stamp);
  var values = [[false, stamp, "", ""], ["cryptocoin_symbol", "balance", "source", "updated_at"]].concat(dataRows);
  sh.getRange(1, 1, Math.max(sh.getLastRow(), 2), Math.max(sh.getLastColumn(), 4)).clearContent();
  sh.getRange(1, 1, values.length, 4).setValues(values);
  sh.getRange("A1").insertCheckboxes().setValue(false);
  sh.getRange("B1:D1").setNumberFormat("@");
  if (values.length > 2) sh.getRange(3, 2, values.length - 2, 1).setNumberFormat("0.########");
  return dataRows.length;
}

function UPDATE_COINBASE_SPOT() {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return "BUSY"; }
  try {
    var ss = SpreadsheetApp.openById(COINBASE_SYNC_CONFIG.SPREADSHEET_ID);
    var buckets = _cbFetchBucketsViaRelay_();
    var written = _cbWriteSheet_(ss, buckets);
    var status = { ok: true, ts: new Date().toISOString(), spot: buckets.spot.length, rows: written };
    _cbSetStatus_(status);
    return JSON.stringify(status);
  } catch (err) {
    var statusErr = { ok: false, ts: new Date().toISOString(), error: String(err) };
    _cbSetStatus_(statusErr);
    Logger.log("UPDATE_COINBASE_SPOT ERROR: " + err);
    return JSON.stringify(statusErr);
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function COINBASE_ON_EDIT(e) {
  try {
    if (!e || !e.range) return false;
    var range = e.range;
    var cell = range.getA1Notation ? range.getA1Notation() : "";
    if (cell !== "A1") return false;
    var sheet = range.getSheet ? range.getSheet() : null;
    if (!sheet || sheet.getName() !== COINBASE_SYNC_CONFIG.SHEET) return false;
    var v = (typeof e.value !== "undefined") ? e.value : range.getValue();
    if (String(v).toUpperCase() !== "TRUE") return true;
    if (typeof CEX_SET_MANUAL_REQUEST === "function") CEX_SET_MANUAL_REQUEST(sheet, COINBASE_SYNC_CONFIG.REFRESH_FLAG_PROP);
    else {
      _cbSetRefreshFlag_();
      try { sheet.getRange("B1").setValue("REQUEST: " + Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss")).setNumberFormat("@"); } catch (eB1) {}
    }
    range.setValue(false);
    return true;
  } catch (err) {
    try { Logger.log("[COINBASE_ON_EDIT] " + (err && err.message ? err.message : err)); } catch (eLog) {}
    try { if (e && e.range) e.range.setValue(false); } catch (eReset) {}
    return true;
  }
}

function _cbSetRefreshFlag_() {
  var value = String(Date.now());
  try {
    PropertiesService.getScriptProperties().setProperty(COINBASE_SYNC_CONFIG.REFRESH_FLAG_PROP, value);
    return "SCRIPT";
  } catch (eScript) {
    PropertiesService.getUserProperties().setProperty(COINBASE_SYNC_CONFIG.REFRESH_FLAG_PROP, value);
    return "USER";
  }
}

function COINBASE_REFRESH_WATCHDOG() {
  if (typeof CEX_GET_SPREADSHEET === "function" && typeof CEX_HAS_MANUAL_REQUEST === "function") {
    var ss = CEX_GET_SPREADSHEET();
    if (!CEX_HAS_MANUAL_REQUEST(ss, COINBASE_SYNC_CONFIG.SHEET, COINBASE_SYNC_CONFIG.REFRESH_FLAG_PROP)) return "NO_REQUEST";
    CEX_CLEAR_MANUAL_REQUEST(COINBASE_SYNC_CONFIG.REFRESH_FLAG_PROP);
    return CEX_RUN_MANUAL_UPDATE(ss, COINBASE_SYNC_CONFIG.SHEET, "COINBASE", UPDATE_COINBASE_SPOT);
  }
  var props = PropertiesService.getScriptProperties();
  var userProps = PropertiesService.getUserProperties();
  var flag = props.getProperty(COINBASE_SYNC_CONFIG.REFRESH_FLAG_PROP) || userProps.getProperty(COINBASE_SYNC_CONFIG.REFRESH_FLAG_PROP);
  if (!flag) return "NO_REQUEST";
  props.deleteProperty(COINBASE_SYNC_CONFIG.REFRESH_FLAG_PROP);
  userProps.deleteProperty(COINBASE_SYNC_CONFIG.REFRESH_FLAG_PROP);
  return UPDATE_COINBASE_SPOT();
}
