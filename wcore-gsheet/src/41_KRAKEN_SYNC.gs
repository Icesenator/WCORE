// v4.16.39 - tickers xStocks Kraken affichés avec x minuscule + prix Kraken direct.
// v4.16.38 - xStocks Kraken courts (MUX) whitelistes + routage fiat/xstocks v2`n// v4.16.37 - A1 de CEX - Kraken Stocks rafraîchit fiat + xStocks (KRAKEN_ON_EDIT).
// v4.16.36 - Routage fiat + xStocks vers CEX - Kraken Stocks (EUR en Stocks, crypto en Crypto).
// v4.16.34 - Dedicated hourly installer and non-mutating legacy watchdog.
// v4.15.119 - Kraken sync via official REST API (read-only Funds Query)
// Onglet de sortie: "CEX - Kraken Crypto" (crypto) et "CEX - Kraken Stocks" (fiat + actions).

var KRAKEN_SYNC_VERSION = "4.16.39";

var KRAKEN_SYNC_CONFIG = {
  BASE_URL: "https://api.kraken.com",
  API_KEY_PROP: "KRAKEN_API_KEY",
  PRIVATE_KEY_PROP: "KRAKEN_PRIVATE_KEY",
  STATUS_PROP: "KRAKEN_SYNC_STATUS",
  REFRESH_FLAG_PROP: "KRAKEN_REFRESH_REQUESTED",
  SHEET: "CEX - Kraken Crypto",
  SHEET_STOCKS: "CEX - Kraken Stocks",
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
  "ZEUR": "EUR",
  "EUR": "EUR",
  "ZUSD": "USD",
  "USD": "USD",
  "USDC": "USDT",
  "USDT": "USDT",
  "TUSD": "USDT",
  "EURT": "EURC",
  "EURI": "EURC"
};

// Devises fiat gérées côté Stocks (routées hors de l'onglet Crypto). EUR attendu
// principalement ; pas d'USD prévu sur ce compte mais la liste reste extensible.
var KRAKEN_FIAT_SYMBOLS = ["EUR", "USD"];

// Conversions de sous-jacent pour les xStocks Kraken vers le symbole canonique
// WCORE (Portefeuille Action). SK Hynix: le xStock Kraken SKHYx suit SKHY (Nasdaq,
// USD) tandis que le canonique est SKHY (ex-cotation coréenne KRX:000660). La forme
// avec et sans "x" est couverte. Les xStocks sans entrée sont normalisés en
// retirant le suffixe "x" (ex. NVDAx -> NVDA).
var KRAKEN_XSTOCK_CANONICAL = {
  "SKHY": "SKHY",
  "SKHYX": "SKHY",
  "MUX": "MU",
  "MUXUSD": "MU",
  "BRK.BX": "BRKB",
  "XOMX": "XOM"
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

function _krakenIsFiat_(symbol) {
  var s = String(symbol || "").trim().toUpperCase();
  return KRAKEN_FIAT_SYMBOLS.indexOf(s) >= 0;
}

function _krakenIsXStock_(symbol) {
  var raw = String(symbol || "").trim();
  if (!raw) return false;
  var up = raw.toUpperCase();
  if (KRAKEN_XSTOCK_CANONICAL[up]) return true;
  // Suffixe xStock Kraken sur la cle brute de la Balance API: "AAPLx.T",
  // "MUx.T", "SPCXx.T" (x minuscule, suffixe boursier .T). Le test se fait
  // AVANT toute normalisation de casse. Les tickers 100% majuscules finissant
  // par X (PAX, BGB) restent des cryptos: on exige le x minuscule ou le
  // passage par la whitelist KRAKEN_XSTOCK_CANONICAL.
  if (/x(\.[A-Z]+)?$/.test(raw)) return true;
  return false;
}

function _krakenDisplayStockSymbol_(symbol) {
  var s = String(symbol || "").trim();
  if (!s) return "";
  s = s.replace(/\.T$/i, "");
  var up = s.toUpperCase();
  if (/x$/i.test(s)) return s.slice(0, -1).toUpperCase() + "x";
  if (KRAKEN_XSTOCK_CANONICAL[up]) {
    var canonical = KRAKEN_XSTOCK_CANONICAL[up];
    return canonical === "BRKB" ? "BRK.Bx" : canonical + "x";
  }
  return up;
}

// Normalise une clé xStock Kraken ("AAPLx.T", "MUx.T") vers le symbole
// canonique WCORE pour le pricing et le portefeuille.
function _krakenCanonicalStockSymbol_(symbol) {
  var display = _krakenDisplayStockSymbol_(symbol);
  if (!display) return "";
  var up = display.toUpperCase();
  if (KRAKEN_XSTOCK_CANONICAL[up]) return KRAKEN_XSTOCK_CANONICAL[up];
  if (/X$/.test(up)) up = up.slice(0, -1);
  if (up === "BRK.B") return "BRKB";
  return up;
}

function _krakenPushBucket_(bucket, seen, sym, amount) {
  var key = String(sym || "").toUpperCase();
  if (!key) return;
  if (Object.prototype.hasOwnProperty.call(seen, key)) bucket[seen[key]][1] += amount;
  else { seen[key] = bucket.length; bucket.push([sym, amount]); }
}

function _krakenFetchBuckets_(creds) {
  var balances = _krakenPrivatePost_("/0/private/Balance", {}, creds);
  var buckets = { crypto: [], fiat: [], xstocks: [] };
  var seen = { crypto: {}, fiat: {}, xstocks: {} };
  for (var raw in balances) {
    if (!Object.prototype.hasOwnProperty.call(balances, raw)) continue;
    var amount = _krakenParseAmount_(balances[raw]);
    if (amount <= 0) continue;
    if (_krakenIsXStock_(raw)) {
      var stockSym = _krakenDisplayStockSymbol_(raw);
      if (stockSym) _krakenPushBucket_(buckets.xstocks, seen.xstocks, stockSym, amount);
      continue;
    }
    var sym = _krakenCanonicalSymbol_(raw);
    if (!sym) continue;
    if (_krakenIsFiat_(sym)) _krakenPushBucket_(buckets.fiat, seen.fiat, sym, amount);
    else _krakenPushBucket_(buckets.crypto, seen.crypto, sym, amount);
  }
  return buckets;
}

function DIAG_KRAKEN_API() {
  try {
    var buckets = _krakenFetchBuckets_(_krakenGetCreds_());
    var msg = [
      "Kraken API diag " + KRAKEN_SYNC_VERSION,
      "crypto=" + buckets.crypto.length,
      "fiat=" + buckets.fiat.length,
      "xstocks=" + buckets.xstocks.length,
      "crypto sample=" + JSON.stringify(buckets.crypto.slice(0, 12)),
      "fiat sample=" + JSON.stringify(buckets.fiat.slice(0, 6)),
      "xstocks sample=" + JSON.stringify(buckets.xstocks.slice(0, 12))
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
  if (sh.getMaxColumns() < 7) sh.insertColumnsAfter(sh.getMaxColumns(), 7 - sh.getMaxColumns());
  sh.getRange("A1").insertCheckboxes().setValue(false);
  sh.getRange("B1").setValue(Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss")).setNumberFormat("@");
  sh.getRange(2, 1, 1, 4).setValues([["cryptocoin_symbol", "balance", "source", "updated_at"]]);
  return "OK_KRAKEN_SHEET_READY";
}

function _krakenFetchXStockPricesUsd_(rows) {
  var out = {};
  var pairs = [];
  for (var i = 0; i < (rows || []).length; i++) {
    var symbol = _krakenDisplayStockSymbol_(rows[i] && rows[i][0]);
    if (!symbol || !/x$/.test(symbol)) continue;
    var pair = symbol + "/USD";
    if (pairs.indexOf(pair) < 0) pairs.push(pair);
  }
  if (!pairs.length) return out;
  var url = KRAKEN_SYNC_CONFIG.BASE_URL + "/0/public/Ticker?pair=" + encodeURIComponent(pairs.join(",")) + "&asset_class=tokenized_asset&assetVersion=1";
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (!resp || resp.getResponseCode() !== 200) return out;
  var data = JSON.parse(resp.getContentText() || "{}");
  var result = data && data.result ? data.result : {};
  for (var key in result) {
    if (!Object.prototype.hasOwnProperty.call(result, key)) continue;
    var ticker = result[key];
    var priceUsd = _krakenParseAmount_(ticker && ticker.c && ticker.c[0]);
    var slash = String(key).indexOf("/");
    var display = _krakenDisplayStockSymbol_(slash >= 0 ? String(key).slice(0, slash) : key);
    if (display && priceUsd > 0) out[display.toUpperCase()] = priceUsd;
  }
  return out;
}

function _krakenBuildValues_(rows, stamp, opt_pricesUsd) {
  var values = [];
  var pricesUsd = opt_pricesUsd || {};
  for (var i = 0; i < rows.length; i++) {
    var symbol = String(rows[i][0] || "");
    var amount = _krakenParseAmount_(rows[i][1]);
    var priceUsd = Number(pricesUsd[symbol.toUpperCase()] || 0);
    values.push([symbol, amount, "spot", stamp, priceUsd > 0 ? amount * priceUsd : "", priceUsd > 0 ? priceUsd : ""]);
  }
  return values;
}

function _krakenWriteSheet_(ss, sheetName, rows) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh) sh = ss.insertSheet(sheetName);
  if (sh.getMaxColumns() < 7) sh.insertColumnsAfter(sh.getMaxColumns(), 7 - sh.getMaxColumns());
  var stamp = Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss");
  var pricesUsd = sheetName === KRAKEN_SYNC_CONFIG.SHEET_STOCKS ? _krakenFetchXStockPricesUsd_(rows) : {};
  var dataRows = _krakenBuildValues_(rows, stamp, pricesUsd);
  var values = [[false, stamp, "", ""], ["cryptocoin_symbol", "balance", "source", "updated_at"]].concat(dataRows);
  // v4.15.121: append INFO_TOTAL row.
  _cexComputeAndAppendTotal_(ss, sheetName, dataRows, "kraken", values);
  return dataRows.length;
}

function UPDATE_KRAKEN_SPOT() {
  try { HttpCallCounter.setTrigger('UPDATE_KRAKEN_SPOT'); } catch(e){}
  if (typeof CEX_ACQUIRE_LOCK === "function" && !CEX_ACQUIRE_LOCK("KRAKEN")) return "BUSY";
  try {
    var ss = SpreadsheetApp.openById(KRAKEN_SYNC_CONFIG.SPREADSHEET_ID);
    var buckets = _cexRelayFetchWithRetry_(function() { return _krakenFetchBuckets_(_krakenGetCreds_()); }, "KRAKEN");
    var written = _krakenWriteSheet_(ss, KRAKEN_SYNC_CONFIG.SHEET, buckets.crypto);
    var status = { ok: true, ts: new Date().toISOString(), spot: buckets.crypto.length, rows: written };
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
    if (!sheet) return false;
    var name = sheet.getName();
    // v4.16.37: A1 de l'onglet Stocks (fiat + xStocks) est aussi un refresh
    // manuel -> job KRAKEN_STOCKS via UPDATE_KRAKEN_STOCKS_FIAT.
    var isStocksTab = name === KRAKEN_SYNC_CONFIG.SHEET_STOCKS;
    if (name !== KRAKEN_SYNC_CONFIG.SHEET && !isStocksTab) return false;
    var updateFn = isStocksTab ? UPDATE_KRAKEN_STOCKS_FIAT : UPDATE_KRAKEN_SPOT;
    var label = isStocksTab ? "KRAKEN_STOCKS" : "KRAKEN";
    var v = (typeof e.value !== "undefined") ? e.value : range.getValue();
    if (String(v).toUpperCase() !== "TRUE") return true;
    if (!e.triggerUid) {
      try { range.setValue(false); } catch (eResetSimple) {}
      return true;
    }
    try { range.setValue(false); } catch (eResetEarly) {}
    if (typeof CEX_QUEUE_OR_MARK_MANUAL_JOB === "function") CEX_QUEUE_OR_MARK_MANUAL_JOB(sheet, KRAKEN_SYNC_CONFIG.REFRESH_FLAG_PROP, label, updateFn, e);
    else if (typeof CEX_RUN_DIRECT_OR_QUEUE === "function") CEX_RUN_DIRECT_OR_QUEUE(sheet, KRAKEN_SYNC_CONFIG.REFRESH_FLAG_PROP, label, updateFn, e);
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
  return "LEGACY_DISABLED: manual requests use CEX_MANUAL_REFRESH_WORKER";
}

function INSTALL_KRAKEN_SYNC_TRIGGER() {
  var trs = ScriptApp.getProjectTriggers();
  for (var i = 0; i < trs.length; i++) {
    var fn = trs[i].getHandlerFunction();
    if (fn === "UPDATE_KRAKEN_SPOT" || fn === "UPDATE_KRAKEN_STOCKS_FIAT" || fn === "KRAKEN_REFRESH_WATCHDOG") ScriptApp.deleteTrigger(trs[i]);
  }
  ScriptApp.newTrigger("UPDATE_KRAKEN_SPOT").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("UPDATE_KRAKEN_STOCKS_FIAT").timeBased().everyHours(1).create();
  return "Triggers installed: UPDATE_KRAKEN_SPOT (1h) + UPDATE_KRAKEN_STOCKS_FIAT (1h)";
}

// v4.16.36: écrit le fiat (EUR) + les xStocks Kraken (normalisés vers le canonique
// WCORE, ex. SKHYx -> SKHY) dans l'onglet CEX - Kraken Stocks, via le même pipeline
// que Bitpanda Stocks (INFO_TOTAL + Vérif). Les cryptos restent sur
// UPDATE_KRAKEN_SPOT -> CEX - Kraken Crypto.
function UPDATE_KRAKEN_STOCKS_FIAT() {
  try { HttpCallCounter.setTrigger('UPDATE_KRAKEN_STOCKS_FIAT'); } catch (eCounter) {}
  if (typeof CEX_ACQUIRE_LOCK === "function" && !CEX_ACQUIRE_LOCK("KRAKEN_STOCKS")) return "BUSY";
  try {
    var ss = SpreadsheetApp.openById(KRAKEN_SYNC_CONFIG.SPREADSHEET_ID);
    var buckets = _cexRelayFetchWithRetry_(function() { return _krakenFetchBuckets_(_krakenGetCreds_()); }, "KRAKEN_STOCKS");
    var rows = buckets.fiat.concat(buckets.xstocks);
    var written = _krakenWriteSheet_(ss, KRAKEN_SYNC_CONFIG.SHEET_STOCKS, rows);
    var status = { ok: true, ts: new Date().toISOString(), fiat: buckets.fiat.length, xstocks: buckets.xstocks.length, rows: written };
    _krakenSetStatus_(status);
    return JSON.stringify(status);
  } catch (err) {
    var statusErr = { ok: false, ts: new Date().toISOString(), error: String(err) };
    _krakenSetStatus_(statusErr);
    Logger.log("UPDATE_KRAKEN_STOCKS_FIAT ERROR: " + err);
    return JSON.stringify(statusErr);
  } finally {
    if (typeof CEX_RELEASE_LOCK === "function") CEX_RELEASE_LOCK("KRAKEN_STOCKS");
  }
}

function DIAG_KRAKEN_TICKERS() {
  try {
    var buckets = _krakenFetchBuckets_(_krakenGetCreds_());
    var lines = [
      "DIAG_KRAKEN_TICKERS " + KRAKEN_SYNC_VERSION,
      "isXStock(AAPLX)=" + _krakenIsXStock_("AAPLX"),
      "isXStock(MUX)=" + _krakenIsXStock_("MUX"),
      "isXStock(PAX)=" + _krakenIsXStock_("PAX"),
      "canonStock(MUX)=" + _krakenCanonicalStockSymbol_("MUX"),
      "canonStock(AAPLX)=" + _krakenCanonicalStockSymbol_("AAPLX"),
      "canon(AAPLX)=" + _krakenCanonicalSymbol_("AAPLX"),
      "canon(MUX)=" + _krakenCanonicalSymbol_("MUX"),
      "xstocks=" + JSON.stringify(buckets.xstocks),
      "crypto=" + JSON.stringify(buckets.crypto),
      "fiat=" + JSON.stringify(buckets.fiat)
    ].join("\n");
    Logger.log(lines);
    return lines;
  } catch (err) {
    return "ERROR: " + (err && err.message ? err.message : err);
  }
}

function DIAG_KRAKEN_XSTOCK_PRICES() {
  try {
    var buckets = _krakenFetchBuckets_(_krakenGetCreds_());
    return JSON.stringify({ rows: buckets.xstocks, pricesUsd: _krakenFetchXStockPricesUsd_(buckets.xstocks) });
  } catch (err) {
    return "ERROR: " + (err && err.message ? err.message : err);
  }
}

function DIAG_KRAKEN_LOOP() {
  try {
    var balances = _krakenPrivatePost_("/0/private/Balance", {}, _krakenGetCreds_());
    var lines = ["DIAG_KRAKEN_LOOP " + KRAKEN_SYNC_VERSION];
    for (var raw in balances) {
      if (!Object.prototype.hasOwnProperty.call(balances, raw)) continue;
      var amount = _krakenParseAmount_(balances[raw]);
      if (amount <= 0) continue;
      lines.push(raw + " amt=" + amount + " xstock=" + _krakenIsXStock_(raw) + " canon=" + _krakenCanonicalSymbol_(raw));
    }
    Logger.log(lines.join("\n"));
    return lines.join("\n");
  } catch (err) {
    return "ERROR: " + (err && err.message ? err.message : err);
  }
}
