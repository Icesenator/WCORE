// v4.15.103 - PERMANENT FIX: re-install dead CEX time-based triggers on A1 click (per "triggers présents mais mal autorisés" v4.15.61).
// v4.15.95 - Use shared CEX manual-refresh helpers.
// v4.15.94 - Manual refresh writes visible B1 REQUEST flag for trigger-context safe handoff.
// v4.15.93 - Manual A1 refresh flag falls back to UserProperties when ScriptProperties is full.
// v4.15.92 - Retry transient relay fetch failures; remove one-shot bootstrap with relay token.
// v4.15.91 - Railway relay flow (api.bybit.eu geo-blocks GAS IP; relay EU West passes). UNIFIED+FUND signed relay-side.
// v4.15.90 - Add Funding (FUND) wallet fetch to capture EURC/BTC (not in UNIFIED).
// v4.15.89 - Add ByBit EU SDK x-referer header (Cg000971) for third-party API keys.
// v4.15.88 - Increase recvWindow to 20000ms (ByBit EU clock skew rejected 5000ms).
// v4.15.87 - Use api.bybit.eu endpoint for ByBit EU accounts (CloudFront blocks api.bybit.com from GAS).
// v4.15.86 - ByBit sync via API v5 (third-party read-only key / HMAC-SHA256)
// Onglet de sortie: "CEX - Bybit".
//
// Recupere les soldes ByBit Unified Trading Account et les ecrit dans
// l'onglet "Bybit Crypto". Cles API stockees dans UserProperties, jamais
// dans la spreadsheet.
//
// Setup (Apps Script editor):
//   SET_BYBIT_API_KEYS("apiKey", "apiSecret")
// Diagnostic sans ecriture:
//   DIAG_BYBIT_API()
// Mise a jour:
//   UPDATE_BYBIT_SPOT()
// Installation triggers:
//   INSTALL_BYBIT_SYNC_TRIGGER()

var BYBIT_SYNC_VERSION = "4.15.95";

var BYBIT_SYNC_CONFIG = {
  BASE_URL: "https://api.bybit.eu",
  API_KEY_PROP: "BYBIT_API_KEY",
  API_SECRET_PROP: "BYBIT_API_SECRET",
  RELAY_URL_PROP: "BYBIT_RELAY_URL",
  RELAY_TOKEN_PROP: "BYBIT_RELAY_TOKEN",
  STATUS_PROP: "BYBIT_SYNC_STATUS",
  REFRESH_FLAG_PROP: "BYBIT_REFRESH_REQUESTED",
  SHEET: "CEX - Bybit",
  ACCOUNT_TYPE: "UNIFIED",
  RECV_WINDOW: "20000",
  API_ID_EU: "Cg000971",
  SPREADSHEET_ID: "1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4"
};

var BYBIT_SYMBOL_ALIASES = {
  "USDC": "USDT",
  "TUSD": "USDT",
  "USD": "USDT",
  "EUR": "EURC",
  "EURI": "EURC",
  "EURT": "EURC"
};

function _bybitCanonicalSymbol_(symbol) {
  var s = String(symbol || "").trim().toUpperCase();
  if (!s) return "";
  return BYBIT_SYMBOL_ALIASES[s] || s;
}

// Relais Railway (contourne le geo-block CloudFront sur api.bybit.eu depuis GAS).
// La cle Bybit vit cote Railway; GAS n'envoie que le RELAY_TOKEN.
function SET_BYBIT_RELAY(url, token) {
  if (!url || String(url).indexOf("http") !== 0) throw new Error("Relay URL invalide");
  if (!token || String(token).length < 10) throw new Error("Relay token invalide ou trop court");
  var props = PropertiesService.getUserProperties();
  props.setProperty(BYBIT_SYNC_CONFIG.RELAY_URL_PROP, String(url).trim().replace(/\/+$/, ""));
  props.setProperty(BYBIT_SYNC_CONFIG.RELAY_TOKEN_PROP, String(token).trim());
  return "OK: BYBIT_RELAY_URL + BYBIT_RELAY_TOKEN saved (UserProperties)";
}

function CLEAR_BYBIT_RELAY() {
  var props = PropertiesService.getUserProperties();
  props.deleteProperty(BYBIT_SYNC_CONFIG.RELAY_URL_PROP);
  props.deleteProperty(BYBIT_SYNC_CONFIG.RELAY_TOKEN_PROP);
  return "OK: ByBit relay cleared";
}

function _bybitGetRelay_() {
  var props = PropertiesService.getUserProperties();
  var url = props.getProperty(BYBIT_SYNC_CONFIG.RELAY_URL_PROP);
  var token = props.getProperty(BYBIT_SYNC_CONFIG.RELAY_TOKEN_PROP);
  if (!url || !token) return null;
  return { url: url, token: token };
}

// Recupere les buckets via le relais Railway (un seul appel HTTP, deja normalise).
function _bybitFetchBucketsViaRelay_(relay) {
  var url = relay.url + "/bybit?token=" + encodeURIComponent(relay.token);
  var resp = null;
  var lastErr = null;
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      resp = UrlFetchApp.fetch(url, { method: "get", muteHttpExceptions: true });
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < 2) Utilities.sleep(1000 * (attempt + 1));
    }
  }
  if (lastErr) throw lastErr;
  if (!resp) throw new Error("ByBit relay HTTP blocked/null response");
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error("ByBit relay HTTP " + code + ": " + text.substring(0, 300));
  }
  var data = JSON.parse(text);
  if (!data || !data.ok) {
    throw new Error("ByBit relay error: " + (data && data.error ? data.error : "unknown").toString().substring(0, 300));
  }
  var rows = [], seen = {};
  var arr = data.spot || [];
  for (var i = 0; i < arr.length; i++) {
    _bybitPushRow_(rows, seen, arr[i][0], arr[i][1]);
  }
  return { spot: rows };
}

function SET_BYBIT_API_KEYS(apiKey, apiSecret) {
  if (!apiKey || String(apiKey).length < 10) throw new Error("API key invalide ou trop courte");
  if (!apiSecret || String(apiSecret).length < 20) throw new Error("API secret invalide ou trop court");
  var props = PropertiesService.getUserProperties();
  props.setProperty(BYBIT_SYNC_CONFIG.API_KEY_PROP, String(apiKey).trim());
  props.setProperty(BYBIT_SYNC_CONFIG.API_SECRET_PROP, String(apiSecret).trim());
  return "OK: BYBIT_API_KEY + BYBIT_API_SECRET saved (UserProperties)";
}

function CLEAR_BYBIT_API_KEYS() {
  var props = PropertiesService.getUserProperties();
  props.deleteProperty(BYBIT_SYNC_CONFIG.API_KEY_PROP);
  props.deleteProperty(BYBIT_SYNC_CONFIG.API_SECRET_PROP);
  return "OK: ByBit API keys cleared";
}

function _bybitGetCreds_() {
  var up = PropertiesService.getUserProperties();
  var key = up.getProperty(BYBIT_SYNC_CONFIG.API_KEY_PROP);
  var secret = up.getProperty(BYBIT_SYNC_CONFIG.API_SECRET_PROP);
  if (!key || !secret) {
    var sp = PropertiesService.getScriptProperties();
    key = key || sp.getProperty(BYBIT_SYNC_CONFIG.API_KEY_PROP);
    secret = secret || sp.getProperty(BYBIT_SYNC_CONFIG.API_SECRET_PROP);
  }
  if (!key || !secret) throw new Error("Missing BYBIT_API_KEY/BYBIT_API_SECRET. Run SET_BYBIT_API_KEYS(...)");
  return { key: key, secret: secret };
}

function _bybitSetStatus_(status) {
  try {
    PropertiesService.getScriptProperties().setProperty(
      BYBIT_SYNC_CONFIG.STATUS_PROP, JSON.stringify(status)
    );
  } catch (err) {
    Logger.log("BYBIT_SYNC_STATUS skipped: " + err);
  }
}

function BYBIT_SYNC_STATUS() {
  return PropertiesService.getScriptProperties().getProperty(BYBIT_SYNC_CONFIG.STATUS_PROP) || "NO_STATUS";
}

function _bybitHex_(raw) {
  var hex = "";
  for (var i = 0; i < raw.length; i++) {
    var b = raw[i];
    if (b < 0) b += 256;
    var h = b.toString(16);
    if (h.length === 1) h = "0" + h;
    hex += h;
  }
  return hex;
}

// ByBit v5 HMAC payload (GET): timestamp + apiKey + recvWindow + queryString.
function _bybitSign_(timestamp, apiKey, recvWindow, queryString, secret) {
  var payload = String(timestamp) + String(apiKey) + String(recvWindow) + String(queryString || "");
  return _bybitHex_(Utilities.computeHmacSignature(
    Utilities.MacAlgorithm.HMAC_SHA_256, payload, secret
  ));
}

function _bybitAuthGet_(path, queryObj, creds) {
  var parts = [];
  for (var k in (queryObj || {})) {
    if (Object.prototype.hasOwnProperty.call(queryObj, k)) {
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(queryObj[k])));
    }
  }
  parts.sort();
  var query = parts.join("&");
  var ts = String(Date.now());
  var recv = BYBIT_SYNC_CONFIG.RECV_WINDOW;
  var sig = _bybitSign_(ts, creds.key, recv, query, creds.secret);
  var url = BYBIT_SYNC_CONFIG.BASE_URL + path + (query ? "?" + query : "");
  var resp = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
    headers: {
      "X-BAPI-API-KEY": creds.key,
      "X-BAPI-TIMESTAMP": ts,
      "X-BAPI-RECV-WINDOW": recv,
      "X-BAPI-SIGN": sig,
      "X-BAPI-SIGN-TYPE": "2",
      "x-referer": BYBIT_SYNC_CONFIG.API_ID_EU
    }
  });
  if (!resp) throw new Error("ByBit " + path + " HTTP blocked/null response");
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code === 451 || code === 403) throw new Error("ByBit IP/geo blocked (HTTP " + code + "): " + text.substring(0, 200));
  if (code < 200 || code >= 300) throw new Error("ByBit " + path + " HTTP " + code + ": " + text.substring(0, 300));
  var json = JSON.parse(text);
  if (json && json.retCode && Number(json.retCode) !== 0) {
    throw new Error("ByBit retCode " + json.retCode + ": " + (json.retMsg || text.substring(0, 250)));
  }
  return json;
}

function _bybitParseAmount_(value) {
  var n = Number(String(value == null ? "0" : value).replace(",", "."));
  return isFinite(n) ? n : 0;
}

function _bybitPushRow_(rows, seen, symbol, amount) {
  var s = _bybitCanonicalSymbol_(symbol);
  if (!s) return;
  var amt = _bybitParseAmount_(amount);
  if (amt <= 0) return;
  if (Object.prototype.hasOwnProperty.call(seen, s)) {
    rows[seen[s]][1] = _bybitParseAmount_(rows[seen[s]][1]) + amt;
    return;
  }
  seen[s] = rows.length;
  rows.push([s, amt]);
}

function _bybitFetchUnified_(rows, seen, creds) {
  var data = _bybitAuthGet_("/v5/account/wallet-balance", {
    accountType: BYBIT_SYNC_CONFIG.ACCOUNT_TYPE
  }, creds);
  var list = data && data.result && data.result.list;
  if (!Array.isArray(list)) return;
  for (var i = 0; i < list.length; i++) {
    var coins = list[i] && list[i].coin;
    if (!Array.isArray(coins)) continue;
    for (var j = 0; j < coins.length; j++) {
      var c = coins[j] || {};
      var total = c.walletBalance;
      if (total == null || total === "") total = c.equity;
      _bybitPushRow_(rows, seen, c.coin, total);
    }
  }
}

// Funding wallet (EURC, BTC, etc. live here, not in UNIFIED).
function _bybitFetchFund_(rows, seen, creds) {
  var data = _bybitAuthGet_("/v5/asset/transfer/query-account-coins-balance", {
    accountType: "FUND"
  }, creds);
  var bal = data && data.result && data.result.balance;
  if (!Array.isArray(bal)) return;
  for (var i = 0; i < bal.length; i++) {
    var c = bal[i] || {};
    var total = c.walletBalance;
    if (total == null || total === "") total = c.transferBalance;
    _bybitPushRow_(rows, seen, c.coin, total);
  }
}

function _bybitFetchSpot_(creds) {
  var rows = [], seen = {};
  _bybitFetchUnified_(rows, seen, creds);
  try {
    _bybitFetchFund_(rows, seen, creds);
  } catch (err) {
    Logger.log("BYBIT FUND fetch skipped: " + err);
  }
  return rows;
}

function _bybitFetchBuckets_(creds) {
  // Voie principale: relais Railway (contourne le geo-block api.bybit.eu).
  var relay = _bybitGetRelay_();
  if (relay) return _bybitFetchBucketsViaRelay_(relay);
  // Repli: appel direct (echoue avec HTTP 403 si IP GAS geo-bloquee).
  return { spot: _bybitFetchSpot_(creds) };
}

// Creds requis seulement en voie directe; le relais signe cote Railway.
function _bybitCredsOrNull_() {
  if (_bybitGetRelay_()) { try { return _bybitGetCreds_(); } catch (e) { return null; } }
  return _bybitGetCreds_();
}

function DIAG_BYBIT_API() {
  try {
    var creds = _bybitCredsOrNull_();
    var buckets = _bybitFetchBuckets_(creds);
    var msg = [
      "ByBit API diag " + BYBIT_SYNC_VERSION,
      "via=" + (_bybitGetRelay_() ? "relay" : "direct"),
      "spot=" + buckets.spot.length,
      "spot sample=" + JSON.stringify(buckets.spot.slice(0, 12))
    ].join("\n");
    Logger.log(msg);
    return msg;
  } catch (err) {
    var m = "ByBit API diag ERROR: " + (err && err.message ? err.message : err);
    Logger.log(m);
    return m;
  }
}

function SETUP_BYBIT_SHEET() {
  var ss = SpreadsheetApp.openById(BYBIT_SYNC_CONFIG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(BYBIT_SYNC_CONFIG.SHEET);
  if (!sh) sh = ss.insertSheet(BYBIT_SYNC_CONFIG.SHEET);
  sh.getRange("A1").insertCheckboxes().setValue(false);
  sh.getRange("B1").setValue(
    Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss")
  ).setNumberFormat("@");
  sh.getRange(2, 1, 1, 4).setValues([["cryptocoin_symbol", "balance", "source", "updated_at"]]);
  return "OK_BYBIT_SHEET_READY";
}

function _bybitBuildValues_(buckets, stamp) {
  var values = [];
  var order = ["spot"];
  for (var o = 0; o < order.length; o++) {
    var src = order[o];
    var list = buckets[src] || [];
    for (var i = 0; i < list.length; i++) {
      values.push([list[i][0], _bybitParseAmount_(list[i][1]), src, stamp]);
    }
  }
  return values;
}

function _bybitWriteSheet_(ss, buckets) {
  var sh = ss.getSheetByName(BYBIT_SYNC_CONFIG.SHEET);
  if (!sh) sh = ss.insertSheet(BYBIT_SYNC_CONFIG.SHEET);
  var stamp = Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss");
  var header = [];
  header.push([false, stamp, "", ""]);
  header.push(["cryptocoin_symbol", "balance", "source", "updated_at"]);
  var dataRows = _bybitBuildValues_(buckets, stamp);
  var values = header.concat(dataRows);
  sh.getRange(1, 1, Math.max(sh.getLastRow(), 2), Math.max(sh.getLastColumn(), 4)).clearContent();
  sh.getRange(1, 1, values.length, 4).setValues(values);
  sh.getRange("A1").insertCheckboxes().setValue(false);
  sh.getRange("B1:D1").setNumberFormat("@");
  if (values.length > 2) sh.getRange(3, 2, values.length - 2, 1).setNumberFormat("0.########");
  return dataRows.length;
}

function UPDATE_BYBIT_SPOT() {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return "BUSY"; }
  try {
    var ss = SpreadsheetApp.openById(BYBIT_SYNC_CONFIG.SPREADSHEET_ID);
    var creds = _bybitCredsOrNull_();
    var buckets = _bybitFetchBuckets_(creds);
    var written = _bybitWriteSheet_(ss, buckets);
    var status = { ok: true, ts: new Date().toISOString(), spot: buckets.spot.length, rows: written };
    _bybitSetStatus_(status);
    return JSON.stringify(status);
  } catch (err) {
    var statusErr = { ok: false, ts: new Date().toISOString(), error: String(err) };
    _bybitSetStatus_(statusErr);
    Logger.log("UPDATE_BYBIT_SPOT ERROR: " + err);
    return JSON.stringify(statusErr);
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function BYBIT_ON_EDIT(e) {
  try {
    if (!e || !e.range) return false;
    var range = e.range;
    var cell = range.getA1Notation ? range.getA1Notation() : "";
    if (cell !== "A1") return false;
    var sheet = range.getSheet ? range.getSheet() : null;
    if (!sheet || sheet.getName() !== BYBIT_SYNC_CONFIG.SHEET) return false;
    // v4.15.103 PERMANENT FIX: re-install dead CEX time-based triggers on user A1 click.
    try { _bpEnsureCexTriggers_(); } catch (eHeal) {}
    var v = (typeof e.value !== "undefined") ? e.value : range.getValue();
    if (String(v).toUpperCase() !== "TRUE") return true;
    if (typeof CEX_SET_MANUAL_REQUEST === "function") CEX_SET_MANUAL_REQUEST(sheet, BYBIT_SYNC_CONFIG.REFRESH_FLAG_PROP);
    else {
      _bybitSetRefreshFlag_();
      try { sheet.getRange("B1").setValue("REQUEST: " + Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss")).setNumberFormat("@"); } catch (eB1) {}
    }
    range.setValue(false);
    return true;
  } catch (err) {
    try { Logger.log("[BYBIT_ON_EDIT] " + (err && err.message ? err.message : err)); } catch (eLog) {}
    try { if (e && e.range) e.range.setValue(false); } catch (eReset) {}
    return true;
  }
}

function _bybitSetRefreshFlag_() {
  var value = String(Date.now());
  try {
    PropertiesService.getScriptProperties().setProperty(BYBIT_SYNC_CONFIG.REFRESH_FLAG_PROP, value);
    return "SCRIPT";
  } catch (eScript) {
    PropertiesService.getUserProperties().setProperty(BYBIT_SYNC_CONFIG.REFRESH_FLAG_PROP, value);
    return "USER";
  }
}

function BYBIT_REFRESH_WATCHDOG() {
  if (typeof CEX_GET_SPREADSHEET === "function" && typeof CEX_HAS_MANUAL_REQUEST === "function") {
    var ss = CEX_GET_SPREADSHEET();
    if (!CEX_HAS_MANUAL_REQUEST(ss, BYBIT_SYNC_CONFIG.SHEET, BYBIT_SYNC_CONFIG.REFRESH_FLAG_PROP)) return "NO_REQUEST";
    CEX_CLEAR_MANUAL_REQUEST(BYBIT_SYNC_CONFIG.REFRESH_FLAG_PROP);
    return CEX_RUN_MANUAL_UPDATE(ss, BYBIT_SYNC_CONFIG.SHEET, "BYBIT", UPDATE_BYBIT_SPOT);
  }
  var props = PropertiesService.getScriptProperties();
  var userProps = PropertiesService.getUserProperties();
  var flag = props.getProperty(BYBIT_SYNC_CONFIG.REFRESH_FLAG_PROP) || userProps.getProperty(BYBIT_SYNC_CONFIG.REFRESH_FLAG_PROP);
  if (!flag) return "NO_REQUEST";
  props.deleteProperty(BYBIT_SYNC_CONFIG.REFRESH_FLAG_PROP);
  userProps.deleteProperty(BYBIT_SYNC_CONFIG.REFRESH_FLAG_PROP);
  return UPDATE_BYBIT_SPOT();
}

function BYBIT_TRIGGER_STATUS() {
  var trs = ScriptApp.getProjectTriggers();
  var hourly = 0, watchdog = 0;
  for (var i = 0; i < trs.length; i++) {
    var fn = trs[i].getHandlerFunction();
    if (fn === "UPDATE_BYBIT_SPOT") hourly++;
    else if (fn === "BYBIT_REFRESH_WATCHDOG") watchdog++;
  }
  return "hourly=" + hourly + " refreshWatchdog=" + watchdog;
}

function INSTALL_BYBIT_SYNC_TRIGGER() {
  var trs = ScriptApp.getProjectTriggers();
  for (var i = 0; i < trs.length; i++) {
    var fn = trs[i].getHandlerFunction();
    if (fn === "UPDATE_BYBIT_SPOT" || fn === "BYBIT_REFRESH_WATCHDOG") ScriptApp.deleteTrigger(trs[i]);
  }
  ScriptApp.newTrigger("UPDATE_BYBIT_SPOT").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("BYBIT_REFRESH_WATCHDOG").timeBased().everyMinutes(1).create();
  return "Triggers installed: UPDATE_BYBIT_SPOT (1h) + BYBIT_REFRESH_WATCHDOG (1min)";
}
