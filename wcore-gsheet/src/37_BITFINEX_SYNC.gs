// v4.15.89 - Use shared CEX manual-refresh helpers.
// v4.15.88 - Store Bitfinex credentials in DocumentProperties so time triggers can read them.
// v4.15.87 - Manual refresh writes visible B1 REQUEST flag for trigger-context safe handoff.
// v4.15.86 - Manual refresh flag falls back to UserProperties when ScriptProperties is full.
// v4.15.85 - B1 = date pure "yyyy-MM-dd HH:mm:ss" (harmonie Recap Portfolio).
// v4.15.84 - Bitfinex sync via API officielle v2 (auth HMAC-SHA384)
// Onglet de sortie: "CEX - Bitfinex".
//
// Recupere les soldes Bitfinex (wallet "exchange" = spot) et les ecrit dans
// l'onglet "Bitfinex Crypto". Cles API stockees dans UserProperties, jamais
// dans la spreadsheet.
//
// Setup (Apps Script editor ou bootstrap):
//   SET_BITFINEX_API_KEYS("apiKey", "apiSecret")
// Diagnostic sans ecriture:
//   DIAG_BITFINEX_API()
// Mise a jour:
//   UPDATE_BITFINEX_SPOT()
// Installation triggers:
//   INSTALL_BITFINEX_SYNC_TRIGGER()
//
// NOTE: contrairement a Binance (HTTP 451 sur IP datacenter Google), Bitfinex
// ne bloque PAS l'IP Apps Script. On appelle l'API directement, sans relais.

var BITFINEX_SYNC_VERSION = "4.15.89";

var BITFINEX_SYNC_CONFIG = {
  BASE_URL: "https://api.bitfinex.com",
  API_KEY_PROP: "BITFINEX_API_KEY",
  API_SECRET_PROP: "BITFINEX_API_SECRET",
  STATUS_PROP: "BITFINEX_SYNC_STATUS",
  REFRESH_FLAG_PROP: "BITFINEX_REFRESH_REQUESTED",
  SHEET: "CEX - Bitfinex",
  // Seul le wallet "exchange" (spot) est synchronise (cf. demande utilisateur).
  WALLET_TYPES: ["exchange"],
  SPREADSHEET_ID: "1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4"
};

// Bitfinex utilise des codes devises courts/historiques. On les normalise vers
// les tickers canoniques attendus par le reste de la spreadsheet (cumul si
// plusieurs codes Bitfinex pointent vers le meme ticker).
var BITFINEX_SYMBOL_ALIASES = {
  "UST": "USDT",   // Tether (code court Bitfinex) - aussi couvert par STABLE_MAP
  "ATO": "ATOM",   // Cosmos
  "DOG": "DOGE",   // Dogecoin (variante courte)
  "DAT": "DATA",   // Streamr
  "QSH": "QASH",
  "QTM": "QTUM",
  "IOT": "IOTA",   // ancien code Bitfinex
  "MIOTA": "IOTA",
  "BTCF0": "BTC",  // derive perp settle
  "ETHF0": "ETH"
};

// v4.15.84: comme Binance/Bitpanda, on consolide les stablecoins/fiat:
//   tout USD ou stable USD -> USDT
//   tout EUR ou stable EUR -> EURC
// Applique APRES les alias de tickers (ex: UST->USDT puis USDT->USDT).
var BITFINEX_STABLE_MAP = {
  // USD side
  "USD": "USDT",
  "USDT": "USDT",
  "UST": "USDT",
  "USDC": "USDT",
  "UDC": "USDT",   // code Bitfinex pour USDC
  "TUSD": "USDT",
  "USTF0": "USDT", // derive perp settle USD
  // EUR side
  "EUR": "EURC",
  "EURC": "EURC",
  "EURT": "EURC",  // Tether EURt
  "EUT": "EURC",   // code court Bitfinex pour EURt
  "EURS": "EURC",  // STASIS EURO
  "EUS": "EURC",   // code court Bitfinex pour EURS
  "EURI": "EURC",
  "EUTF0": "EURC"  // derive perp settle EUR
};

function _bfxCanonicalSymbol_(symbol) {
  var s = String(symbol || "").trim().toUpperCase();
  if (!s) return "";
  // 1) alias de tickers historiques (codes courts Bitfinex)
  s = BITFINEX_SYMBOL_ALIASES[s] || s;
  // 2) consolidation stables/fiat USD->USDT, EUR->EURC
  s = BITFINEX_STABLE_MAP[s] || s;
  return s;
}

function SET_BITFINEX_API_KEYS(apiKey, apiSecret) {
  if (!apiKey || String(apiKey).length < 20) throw new Error("API key invalide ou trop courte");
  if (!apiSecret || String(apiSecret).length < 20) throw new Error("API secret invalide ou trop court");
  var key = String(apiKey).trim();
  var secret = String(apiSecret).trim();
  var up = PropertiesService.getUserProperties();
  up.setProperty(BITFINEX_SYNC_CONFIG.API_KEY_PROP, key);
  up.setProperty(BITFINEX_SYNC_CONFIG.API_SECRET_PROP, secret);
  var dp = PropertiesService.getDocumentProperties();
  dp.setProperty(BITFINEX_SYNC_CONFIG.API_KEY_PROP, key);
  dp.setProperty(BITFINEX_SYNC_CONFIG.API_SECRET_PROP, secret);
  return "OK: BITFINEX_API_KEY + BITFINEX_API_SECRET saved (UserProperties + DocumentProperties)";
}

function CLEAR_BITFINEX_API_KEYS() {
  var props = PropertiesService.getUserProperties();
  props.deleteProperty(BITFINEX_SYNC_CONFIG.API_KEY_PROP);
  props.deleteProperty(BITFINEX_SYNC_CONFIG.API_SECRET_PROP);
  try {
    var dp = PropertiesService.getDocumentProperties();
    dp.deleteProperty(BITFINEX_SYNC_CONFIG.API_KEY_PROP);
    dp.deleteProperty(BITFINEX_SYNC_CONFIG.API_SECRET_PROP);
  } catch (eDoc) {}
  return "OK: Bitfinex API keys cleared";
}

function _bfxGetCreds_() {
  // Lecture UserProperties (stockage actuel) avec repli ScriptProperties pour
  // compat si des cles y avaient ete posees historiquement.
  var up = PropertiesService.getUserProperties();
  var key = up.getProperty(BITFINEX_SYNC_CONFIG.API_KEY_PROP);
  var secret = up.getProperty(BITFINEX_SYNC_CONFIG.API_SECRET_PROP);
  if (!key || !secret) {
    var dp = PropertiesService.getDocumentProperties();
    key = key || dp.getProperty(BITFINEX_SYNC_CONFIG.API_KEY_PROP);
    secret = secret || dp.getProperty(BITFINEX_SYNC_CONFIG.API_SECRET_PROP);
  }
  if (!key || !secret) {
    var sp = PropertiesService.getScriptProperties();
    key = key || sp.getProperty(BITFINEX_SYNC_CONFIG.API_KEY_PROP);
    secret = secret || sp.getProperty(BITFINEX_SYNC_CONFIG.API_SECRET_PROP);
  }
  if (!key || !secret) {
    throw new Error("Missing BITFINEX_API_KEY/BITFINEX_API_SECRET. Run SET_BITFINEX_API_KEYS(...)");
  }
  return { key: key, secret: secret };
}

function _bfxSetStatus_(status) {
  try {
    PropertiesService.getScriptProperties().setProperty(
      BITFINEX_SYNC_CONFIG.STATUS_PROP, JSON.stringify(status)
    );
  } catch (err) {
    Logger.log("BITFINEX_SYNC_STATUS skipped: " + err);
  }
}

function BITFINEX_SYNC_STATUS() {
  return PropertiesService.getScriptProperties().getProperty(BITFINEX_SYNC_CONFIG.STATUS_PROP) || "NO_STATUS";
}

// HMAC-SHA384 hex (Bitfinex exige SHA384, pas SHA256).
function _bfxSign_(payload, secret) {
  var raw = Utilities.computeHmacSignature(
    Utilities.MacAlgorithm.HMAC_SHA_384, payload, secret
  );
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

// POST signe sur l'API auth v2. path = "v2/auth/r/wallets" (sans slash initial).
function _bfxAuthPost_(path, bodyObj, creds) {
  var body = JSON.stringify(bodyObj || {});
  // nonce strictement croissant (microsecondes).
  var nonce = String(Date.now() * 1000);
  var sigPayload = "/api/" + path + nonce + body;
  var signature = _bfxSign_(sigPayload, creds.secret);
  var url = BITFINEX_SYNC_CONFIG.BASE_URL + "/" + path;
  var resp = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: body,
    headers: {
      "bfx-nonce": nonce,
      "bfx-apikey": creds.key,
      "bfx-signature": signature
    }
  });
  if (!resp) throw new Error("Bitfinex " + path + " HTTP blocked/null response");
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code === 451 || code === 403) {
    throw new Error("Bitfinex IP/geo blocked (HTTP " + code + "): " + text.substring(0, 200));
  }
  if (code < 200 || code >= 300) {
    throw new Error("Bitfinex " + path + " HTTP " + code + ": " + text.substring(0, 300));
  }
  return JSON.parse(text);
}

function _bfxParseAmount_(value) {
  var n = Number(String(value == null ? "0" : value).replace(",", "."));
  return isFinite(n) ? n : 0;
}

// Ajoute/cumule un (symbole, montant) dans une liste de lignes.
function _bfxPushRow_(rows, seen, symbol, amount) {
  var s = _bfxCanonicalSymbol_(symbol);
  if (!s) return;
  var amt = _bfxParseAmount_(amount);
  if (Object.prototype.hasOwnProperty.call(seen, s)) {
    rows[seen[s]][1] = _bfxParseAmount_(rows[seen[s]][1]) + amt;
    return;
  }
  seen[s] = rows.length;
  rows.push([s, amt]);
}

// Recupere le wallet spot (exchange). Reponse Bitfinex:
//   [ [WALLET_TYPE, CURRENCY, BALANCE, UNSETTLED_INTEREST, AVAILABLE_BALANCE, ...], ... ]
function _bfxFetchSpot_(creds) {
  var rows = [], seen = {};
  var data = _bfxAuthPost_("v2/auth/r/wallets", {}, creds);
  var arr = Array.isArray(data) ? data : [];
  var allowed = BITFINEX_SYNC_CONFIG.WALLET_TYPES;
  for (var i = 0; i < arr.length; i++) {
    var w = arr[i];
    if (!Array.isArray(w) || w.length < 3) continue;
    var wtype = String(w[0] || "").trim().toLowerCase();
    if (allowed.indexOf(wtype) < 0) continue;
    var total = _bfxParseAmount_(w[2]); // BALANCE total (dispo + en cours)
    if (total > 0) _bfxPushRow_(rows, seen, w[1], total);
  }
  return rows;
}

// buckets = { spot:[...] }
function _bfxFetchBuckets_(creds) {
  return { spot: _bfxFetchSpot_(creds) };
}

function DIAG_BITFINEX_API() {
  try {
    var creds = _bfxGetCreds_();
    var buckets = _bfxFetchBuckets_(creds);
    var msg = [
      "Bitfinex API diag " + BITFINEX_SYNC_VERSION,
      "spot=" + buckets.spot.length,
      "spot sample=" + JSON.stringify(buckets.spot.slice(0, 12))
    ].join("\n");
    Logger.log(msg);
    return msg;
  } catch (err) {
    var m = "Bitfinex API diag ERROR: " + (err && err.message ? err.message : err);
    Logger.log(m);
    return m;
  }
}

function _bfxFormatStamp_(stamp) {
  return "Refresh Bitfinex API. Last updated " + stamp + " via Apps Script bitfinex-api";
}

function SETUP_BITFINEX_SHEET() {
  var ss = SpreadsheetApp.openById(BITFINEX_SYNC_CONFIG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(BITFINEX_SYNC_CONFIG.SHEET);
  if (!sh) sh = ss.insertSheet(BITFINEX_SYNC_CONFIG.SHEET);
  sh.getRange("A1").insertCheckboxes().setValue(false);
  // v4.15.82: B1 = date pure "yyyy-MM-dd HH:mm:ss" (harmonie avec onglets on-chain Recap).
  sh.getRange("B1").setValue(
    Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss")
  ).setNumberFormat("@");
  sh.getRange(2, 1, 1, 4).setValues([["cryptocoin_symbol", "balance", "source", "updated_at"]]);
  return "OK_BITFINEX_SHEET_READY";
}

// buckets = { spot:[...] }
function _bfxBuildValues_(buckets, stamp) {
  var values = [];
  var order = ["spot"];
  for (var o = 0; o < order.length; o++) {
    var src = order[o];
    var list = buckets[src] || [];
    for (var i = 0; i < list.length; i++) {
      values.push([list[i][0], _bfxParseAmount_(list[i][1]), src, stamp]);
    }
  }
  return values;
}

function _bfxWriteSheet_(ss, buckets) {
  var sh = ss.getSheetByName(BITFINEX_SYNC_CONFIG.SHEET);
  if (!sh) sh = ss.insertSheet(BITFINEX_SYNC_CONFIG.SHEET);
  // v4.15.82: B1 = date pure "yyyy-MM-dd HH:mm:ss" (harmonie avec onglets on-chain Recap).
  var stamp = Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss");
  var header = [];
  header.push([false, stamp, "", ""]);
  header.push(["cryptocoin_symbol", "balance", "source", "updated_at"]);
  var dataRows = _bfxBuildValues_(buckets, stamp);
  var values = header.concat(dataRows);
  sh.getRange(1, 1, Math.max(sh.getLastRow(), 2), Math.max(sh.getLastColumn(), 4)).clearContent();
  sh.getRange(1, 1, values.length, 4).setValues(values);
  sh.getRange("A1").insertCheckboxes().setValue(false);
  sh.getRange("B1:D1").setNumberFormat("@");
  if (values.length > 2) sh.getRange(3, 2, values.length - 2, 1).setNumberFormat("0.########");
  return dataRows.length;
}

function UPDATE_BITFINEX_SPOT() {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return "BUSY"; }
  try {
    var ss = SpreadsheetApp.openById(BITFINEX_SYNC_CONFIG.SPREADSHEET_ID);
    var creds = _bfxGetCreds_();
    var buckets = _bfxFetchBuckets_(creds);
    var written = _bfxWriteSheet_(ss, buckets);
    var status = {
      ok: true,
      ts: new Date().toISOString(),
      spot: buckets.spot.length,
      rows: written
    };
    _bfxSetStatus_(status);
    return JSON.stringify(status);
  } catch (err) {
    var statusErr = { ok: false, ts: new Date().toISOString(), error: String(err) };
    _bfxSetStatus_(statusErr);
    Logger.log("UPDATE_BITFINEX_SPOT ERROR: " + err);
    return JSON.stringify(statusErr);
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function BITFINEX_ON_EDIT(e) {
  try {
    if (!e || !e.range) return false;
    var range = e.range;
    var cell = range.getA1Notation ? range.getA1Notation() : "";
    if (cell !== "A1") return false;
    var sheet = range.getSheet ? range.getSheet() : null;
    if (!sheet || sheet.getName() !== BITFINEX_SYNC_CONFIG.SHEET) return false;
    var v = (typeof e.value !== "undefined") ? e.value : range.getValue();
    if (String(v).toUpperCase() !== "TRUE") return true;
    // onEdit SIMPLE ne peut pas faire UrlFetch: on pose un flag traite par le
    // trigger installable BITFINEX_REFRESH_WATCHDOG.
    if (typeof CEX_SET_MANUAL_REQUEST === "function") CEX_SET_MANUAL_REQUEST(sheet, BITFINEX_SYNC_CONFIG.REFRESH_FLAG_PROP);
    else {
      _bfxSetRefreshFlag_();
      try { sheet.getRange("B1").setValue("REQUEST: " + Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss")).setNumberFormat("@"); } catch (eB1) {}
    }
    range.setValue(false);
    return true;
  } catch (err) {
    try { Logger.log("[BITFINEX_ON_EDIT] " + (err && err.message ? err.message : err)); } catch (eLog) {}
    try { if (e && e.range) e.range.setValue(false); } catch (eReset) {}
    return true;
  }
}

function _bfxSetRefreshFlag_() {
  var value = String(Date.now());
  try {
    PropertiesService.getScriptProperties().setProperty(BITFINEX_SYNC_CONFIG.REFRESH_FLAG_PROP, value);
    return "SCRIPT";
  } catch (eScript) {
    PropertiesService.getUserProperties().setProperty(BITFINEX_SYNC_CONFIG.REFRESH_FLAG_PROP, value);
    return "USER";
  }
}

function BITFINEX_REFRESH_WATCHDOG() {
  if (typeof CEX_GET_SPREADSHEET === "function" && typeof CEX_HAS_MANUAL_REQUEST === "function") {
    var ss = CEX_GET_SPREADSHEET();
    if (!CEX_HAS_MANUAL_REQUEST(ss, BITFINEX_SYNC_CONFIG.SHEET, BITFINEX_SYNC_CONFIG.REFRESH_FLAG_PROP)) return "NO_REQUEST";
    CEX_CLEAR_MANUAL_REQUEST(BITFINEX_SYNC_CONFIG.REFRESH_FLAG_PROP);
    return CEX_RUN_MANUAL_UPDATE(ss, BITFINEX_SYNC_CONFIG.SHEET, "BITFINEX", UPDATE_BITFINEX_SPOT);
  }
  var props = PropertiesService.getScriptProperties();
  var userProps = PropertiesService.getUserProperties();
  var flag = props.getProperty(BITFINEX_SYNC_CONFIG.REFRESH_FLAG_PROP) || userProps.getProperty(BITFINEX_SYNC_CONFIG.REFRESH_FLAG_PROP);
  if (!flag) return "NO_REQUEST";
  props.deleteProperty(BITFINEX_SYNC_CONFIG.REFRESH_FLAG_PROP);
  userProps.deleteProperty(BITFINEX_SYNC_CONFIG.REFRESH_FLAG_PROP);
  return UPDATE_BITFINEX_SPOT();
}

function BITFINEX_TRIGGER_STATUS() {
  var trs = ScriptApp.getProjectTriggers();
  var hourly = 0, watchdog = 0;
  for (var i = 0; i < trs.length; i++) {
    var fn = trs[i].getHandlerFunction();
    if (fn === "UPDATE_BITFINEX_SPOT") hourly++;
    else if (fn === "BITFINEX_REFRESH_WATCHDOG") watchdog++;
  }
  return "hourly=" + hourly + " refreshWatchdog=" + watchdog;
}

function INSTALL_BITFINEX_SYNC_TRIGGER() {
  var trs = ScriptApp.getProjectTriggers();
  for (var i = 0; i < trs.length; i++) {
    var fn = trs[i].getHandlerFunction();
    if (fn === "UPDATE_BITFINEX_SPOT" || fn === "BITFINEX_REFRESH_WATCHDOG") ScriptApp.deleteTrigger(trs[i]);
  }
  ScriptApp.newTrigger("UPDATE_BITFINEX_SPOT").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("BITFINEX_REFRESH_WATCHDOG").timeBased().everyMinutes(1).create();
  return "Triggers installed: UPDATE_BITFINEX_SPOT (1h) + BITFINEX_REFRESH_WATCHDOG (1min)";
}
