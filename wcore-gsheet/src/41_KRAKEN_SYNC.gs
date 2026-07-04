// v4.15.119 - Kraken sync via official REST API (read-only Funds Query)
// Onglet de sortie: "CEX - Kraken".

var KRAKEN_SYNC_VERSION = "4.15.119";

var KRAKEN_SYNC_CONFIG = {
  BASE_URL: "https://api.kraken.com",
  API_KEY_PROP: "KRAKEN_API_KEY",
  PRIVATE_KEY_PROP: "KRAKEN_PRIVATE_KEY",
  STATUS_PROP: "KRAKEN_SYNC_STATUS",
  REFRESH_FLAG_PROP: "KRAKEN_REFRESH_REQUESTED",
  SHEET: "CEX - Kraken",
  SPREADSHEET_ID: "1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4"
};

var KRAKEN_SYMBOL_ALIASES = {
  "XXBT": "BTC",
  "XBT": "BTC",
  "XETH": "ETH",
  "XLTC": "LTC",
  "XXRP": "XRP",
  "XXDG": "DOGE",
  "XETC": "ETC",
  "XMLN": "MLN",
  "ZEUR": "EURC",
  "EUR": "EURC",
  "ZUSD": "USDT",
  "USD": "USDT",
  "USDC": "USDT",
  "USDT": "USDT",
  "TUSD": "USDT",
  "EURT": "EURC",
  "EURI": "EURC"
};

function SET_KRAKEN_API_KEYS(apiKey, privateKey) {
  if (!apiKey || String(apiKey).length < 20) throw new Error("API key invalide ou trop courte");
  if (!privateKey || String(privateKey).length < 40) throw new Error("Private key invalide ou trop courte");
  var key = String(apiKey).trim();
  var secret = String(privateKey).trim();
  var up = PropertiesService.getUserProperties();
  up.setProperty(KRAKEN_SYNC_CONFIG.API_KEY_PROP, key);
  up.setProperty(KRAKEN_SYNC_CONFIG.PRIVATE_KEY_PROP, secret);
  try {
    var dp = PropertiesService.getDocumentProperties();
    dp.setProperty(KRAKEN_SYNC_CONFIG.API_KEY_PROP, key);
    dp.setProperty(KRAKEN_SYNC_CONFIG.PRIVATE_KEY_PROP, secret);
  } catch (eDoc) {}
  return "OK: KRAKEN_API_KEY + KRAKEN_PRIVATE_KEY saved (UserProperties + DocumentProperties)";
}

function CLEAR_KRAKEN_API_KEYS() {
  var up = PropertiesService.getUserProperties();
  up.deleteProperty(KRAKEN_SYNC_CONFIG.API_KEY_PROP);
  up.deleteProperty(KRAKEN_SYNC_CONFIG.PRIVATE_KEY_PROP);
  try {
    var dp = PropertiesService.getDocumentProperties();
    dp.deleteProperty(KRAKEN_SYNC_CONFIG.API_KEY_PROP);
    dp.deleteProperty(KRAKEN_SYNC_CONFIG.PRIVATE_KEY_PROP);
  } catch (eDoc) {}
  return "OK: Kraken API keys cleared";
}

function _krakenGetCreds_() {
  var up = PropertiesService.getUserProperties();
  var key = up.getProperty(KRAKEN_SYNC_CONFIG.API_KEY_PROP);
  var secret = up.getProperty(KRAKEN_SYNC_CONFIG.PRIVATE_KEY_PROP);
  if (!key || !secret) {
    try {
      var dp = PropertiesService.getDocumentProperties();
      key = key || dp.getProperty(KRAKEN_SYNC_CONFIG.API_KEY_PROP);
      secret = secret || dp.getProperty(KRAKEN_SYNC_CONFIG.PRIVATE_KEY_PROP);
    } catch (eDoc) {}
  }
  if (!key || !secret) {
    var sp = PropertiesService.getScriptProperties();
    key = key || sp.getProperty(KRAKEN_SYNC_CONFIG.API_KEY_PROP);
    secret = secret || sp.getProperty(KRAKEN_SYNC_CONFIG.PRIVATE_KEY_PROP);
  }
  if (!key || !secret) throw new Error("Missing KRAKEN_API_KEY/KRAKEN_PRIVATE_KEY. Run SET_KRAKEN_API_KEYS(...)");
  return { key: key, secret: secret };
}

function _krakenSetStatus_(obj) {
  try { PropertiesService.getUserProperties().setProperty(KRAKEN_SYNC_CONFIG.STATUS_PROP, JSON.stringify(obj)); } catch (eUser) {}
  try { PropertiesService.getDocumentProperties().setProperty(KRAKEN_SYNC_CONFIG.STATUS_PROP, JSON.stringify(obj)); } catch (eDoc) {}
}

function KRAKEN_SYNC_STATUS() {
  var raw = "";
  try { raw = PropertiesService.getUserProperties().getProperty(KRAKEN_SYNC_CONFIG.STATUS_PROP) || ""; } catch (eUser) {}
  if (!raw) { try { raw = PropertiesService.getDocumentProperties().getProperty(KRAKEN_SYNC_CONFIG.STATUS_PROP) || ""; } catch (eDoc) {} }
  return raw || "NO_STATUS";
}

function _krakenBytesConcat_(a, b) {
  var out = [];
  for (var i = 0; i < a.length; i++) out.push(a[i]);
  for (var j = 0; j < b.length; j++) out.push(b[j]);
  return out;
}

function _krakenSign_(path, nonce, postData, privateKey) {
  var sha = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(nonce) + String(postData || "")
  );
  var pathBytes = Utilities.newBlob(path).getBytes();
  var payload = _krakenBytesConcat_(pathBytes, sha);
  var secretBytes = Utilities.base64Decode(privateKey);
  var hmac = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_512, payload, secretBytes);
  return Utilities.base64Encode(hmac);
}

function _krakenPrivatePost_(path, params, creds) {
  params = params || {};
  params.nonce = String(Date.now() * 1000);
  var parts = [];
  for (var k in params) {
    if (Object.prototype.hasOwnProperty.call(params, k)) {
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(params[k])));
    }
  }
  var postData = parts.join("&");
  var resp = UrlFetchApp.fetch(KRAKEN_SYNC_CONFIG.BASE_URL + path, {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    muteHttpExceptions: true,
    payload: postData,
    headers: {
      "API-Key": creds.key,
      "API-Sign": _krakenSign_(path, params.nonce, postData, creds.secret)
    }
  });
  if (!resp) throw new Error("Kraken " + path + " HTTP blocked/null response");
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code < 200 || code >= 300) throw new Error("Kraken " + path + " HTTP " + code + ": " + text.substring(0, 300));
  var data = JSON.parse(text);
  if (data && data.error && data.error.length) throw new Error("Kraken API error: " + data.error.join(", ").substring(0, 300));
  return data.result || {};
}

function _krakenParseAmount_(value) {
  var n = Number(String(value == null ? "0" : value).replace(",", "."));
  return isFinite(n) ? n : 0;
}

function _krakenCanonicalSymbol_(symbol) {
  var s = String(symbol || "").trim().toUpperCase();
  if (!s) return "";
  s = s.replace(/\..*$/, "");
  if (KRAKEN_SYMBOL_ALIASES[s]) return KRAKEN_SYMBOL_ALIASES[s];
  if (s.length > 3 && (s.charAt(0) === "X" || s.charAt(0) === "Z")) {
    var stripped = s.substring(1);
    if (KRAKEN_SYMBOL_ALIASES[stripped]) return KRAKEN_SYMBOL_ALIASES[stripped];
    return stripped;
  }
  return s;
}

function _krakenFetchBuckets_(creds) {
  var balances = _krakenPrivatePost_("/0/private/Balance", {}, creds);
  var rows = [];
  var seen = {};
  for (var raw in balances) {
    if (!Object.prototype.hasOwnProperty.call(balances, raw)) continue;
    var amount = _krakenParseAmount_(balances[raw]);
    if (amount <= 0) continue;
    var sym = _krakenCanonicalSymbol_(raw);
    if (!sym) continue;
    if (Object.prototype.hasOwnProperty.call(seen, sym)) rows[seen[sym]][1] += amount;
    else { seen[sym] = rows.length; rows.push([sym, amount]); }
  }
  return { spot: rows };
}

function DIAG_KRAKEN_API() {
  try {
    var buckets = _krakenFetchBuckets_(_krakenGetCreds_());
    var msg = [
      "Kraken API diag " + KRAKEN_SYNC_VERSION,
      "spot=" + buckets.spot.length,
      "spot sample=" + JSON.stringify(buckets.spot.slice(0, 12))
    ].join("\n");
    Logger.log(msg);
    return msg;
  } catch (err) {
    var m = "Kraken API diag ERROR: " + (err && err.message ? err.message : err);
    Logger.log(m);
    return m;
  }
}

function SETUP_KRAKEN_SHEET() {
  var ss = SpreadsheetApp.openById(KRAKEN_SYNC_CONFIG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(KRAKEN_SYNC_CONFIG.SHEET);
  if (!sh) sh = ss.insertSheet(KRAKEN_SYNC_CONFIG.SHEET);
  sh.getRange("A1").insertCheckboxes().setValue(false);
  sh.getRange("B1").setValue(Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss")).setNumberFormat("@");
  sh.getRange(2, 1, 1, 4).setValues([["cryptocoin_symbol", "balance", "source", "updated_at"]]);
  return "OK_KRAKEN_SHEET_READY";
}

function _krakenBuildValues_(buckets, stamp) {
  var values = [];
  var list = (buckets && buckets.spot) || [];
  for (var i = 0; i < list.length; i++) values.push([list[i][0], _krakenParseAmount_(list[i][1]), "spot", stamp]);
  return values;
}

function _krakenWriteSheet_(ss, buckets) {
  var sh = ss.getSheetByName(KRAKEN_SYNC_CONFIG.SHEET);
  if (!sh) sh = ss.insertSheet(KRAKEN_SYNC_CONFIG.SHEET);
  var stamp = Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss");
  var dataRows = _krakenBuildValues_(buckets, stamp);
  var values = [[false, stamp, "", ""], ["cryptocoin_symbol", "balance", "source", "updated_at"]].concat(dataRows);
  // v4.15.120: clear only data columns A:D so the user-managed "Vérif" column (E) survives syncs.
  var _clearRows = Math.max(values.length, Math.min(sh.getMaxRows(), values.length));
  sh.getRange(1, 1, _clearRows, 4).clearContent();
  sh.getRange(1, 1, values.length, 4).setValues(values);
  sh.getRange("A1").insertCheckboxes().setValue(false);
  sh.getRange("B1:D1").setNumberFormat("@");
  if (values.length > 2) sh.getRange(3, 2, values.length - 2, 1).setNumberFormat("0.########");
  // v4.15.121: append INFO_TOTAL row.
  try { _cexComputeAndAppendTotal_(ss, KRAKEN_SYNC_CONFIG.SHEET, dataRows, "kraken"); } catch (eTot) { Logger.log("[CEX_TOTAL] kraken append failed: " + eTot); }
  return dataRows.length;
}

function UPDATE_KRAKEN_SPOT() {
  if (typeof CEX_ACQUIRE_LOCK === "function" && !CEX_ACQUIRE_LOCK("KRAKEN")) return "BUSY";
  try {
    var ss = SpreadsheetApp.openById(KRAKEN_SYNC_CONFIG.SPREADSHEET_ID);
    var buckets = _krakenFetchBuckets_(_krakenGetCreds_());
    var written = _krakenWriteSheet_(ss, buckets);
    var status = { ok: true, ts: new Date().toISOString(), spot: buckets.spot.length, rows: written };
    _krakenSetStatus_(status);
    return JSON.stringify(status);
  } catch (err) {
    var statusErr = { ok: false, ts: new Date().toISOString(), error: String(err) };
    _krakenSetStatus_(statusErr);
    Logger.log("UPDATE_KRAKEN_SPOT ERROR: " + err);
    return JSON.stringify(statusErr);
  } finally {
    if (typeof CEX_RELEASE_LOCK === "function") CEX_RELEASE_LOCK("KRAKEN");
  }
}

function KRAKEN_ON_EDIT(e) {
  try {
    if (!e || !e.range) return false;
    var range = e.range;
    var cell = range.getA1Notation ? range.getA1Notation() : "";
    if (cell !== "A1") return false;
    var sheet = range.getSheet ? range.getSheet() : null;
    if (!sheet || sheet.getName() !== KRAKEN_SYNC_CONFIG.SHEET) return false;
    var v = (typeof e.value !== "undefined") ? e.value : range.getValue();
    if (String(v).toUpperCase() !== "TRUE") return true;
    if (!e.triggerUid) {
      try { range.setValue(false); } catch (eResetSimple) {}
      return true;
    }
    try { range.setValue(false); } catch (eResetEarly) {}
    if (typeof CEX_QUEUE_OR_MARK_MANUAL_JOB === "function") CEX_QUEUE_OR_MARK_MANUAL_JOB(sheet, KRAKEN_SYNC_CONFIG.REFRESH_FLAG_PROP, "KRAKEN", UPDATE_KRAKEN_SPOT, e);
    else if (typeof CEX_RUN_DIRECT_OR_QUEUE === "function") CEX_RUN_DIRECT_OR_QUEUE(sheet, KRAKEN_SYNC_CONFIG.REFRESH_FLAG_PROP, "KRAKEN", UPDATE_KRAKEN_SPOT, e);
    else if (typeof CEX_SET_MANUAL_REQUEST === "function") CEX_SET_MANUAL_REQUEST(sheet, KRAKEN_SYNC_CONFIG.REFRESH_FLAG_PROP);
    else {
      _krakenSetRefreshFlag_();
      try { sheet.getRange("B1").setValue("REQUEST: " + Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss")).setNumberFormat("@"); } catch (eB1) {}
    }
    return true;
  } catch (err) {
    try { Logger.log("[KRAKEN_ON_EDIT] " + (err && err.message ? err.message : err)); } catch (eLog) {}
    try { if (e && e.range) e.range.setValue(false); } catch (eReset) {}
    return true;
  }
}

function _krakenSetRefreshFlag_() {
  var value = String(Date.now());
  try {
    PropertiesService.getScriptProperties().setProperty(KRAKEN_SYNC_CONFIG.REFRESH_FLAG_PROP, value);
    return "SCRIPT";
  } catch (eScript) {
    PropertiesService.getUserProperties().setProperty(KRAKEN_SYNC_CONFIG.REFRESH_FLAG_PROP, value);
    return "USER";
  }
}

function KRAKEN_REFRESH_WATCHDOG() {
  return "LEGACY_DISABLED: central CEX manual queue handles Kraken requests";
}
