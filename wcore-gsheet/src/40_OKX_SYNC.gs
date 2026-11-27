// v4.16.103 - OKX scinde en "CEX - OKX Crypto" et "CEX - OKX Stocks" (comme Kraken et Bitpanda) :
//   une seule lecture du relais alimente les deux onglets ; les actions tokenisees OKX (X+ticker)
//   vont dans Stocks, tout le reste (y compris un X+ticker inconnu) reste dans Crypto.
// v4.16.34 - Relay rotation scheduling and non-mutating legacy watchdog.
// v4.16.30 - OKSOL (OKX liquid-staked SOL) aliased to SOL in "CEX - OKX Crypto" output.
// v4.15.97 - OKX sync via Railway cex-relay (HMAC signed relay-side).
// Onglets de sortie: "CEX - OKX Crypto" et "CEX - OKX Stocks".
//
// Recupere les soldes OKX et les ecrit dans les onglets ci-dessus.
// Les secrets OKX restent dans Railway. Apps Script stocke seulement URL+token relais.

var OKX_SYNC_VERSION = "4.16.103";

// Actions tokenisees listees par OKX (liste publique des instruments SPOT, 27/11/2026) : symbole OKX -> ticker boursier.
// Liste EXPLICITE : un X+ticker absent d'ici reste en Crypto (jamais deviné) ; a completer quand OKX en ajoute.
var OKX_STOCK_TOKENS = {
  "XNFLX": "NFLX",
  "XSPCX": "SPCX",
  "XLRCX": "LRCX",
  "XCGNX": "CGNX",
  "XFLEX": "FLEX"
  // XSNXX et XMINIMAX figurent aussi dans les instruments OKX mais leur ticker boursier n'est pas etabli
  // (ex. SNX est aussi une crypto) : absents de la liste, ils restent en Crypto, donc visibles, jamais mal valorises.
};

// Interrupteur du routage Crypto / Stocks. TRUE depuis la phase 2 (v4.16.104) : Portefeuille Action (quantites) et
// Action Details (une ligne par titre OKX Stocks) lisent « CEX - OKX Stocks ». Repasser a FALSE remet tout en Crypto
// (les lignes de l'autre classe encore presentes sont alors ignorees par la reprise : filtre de classe, 35).
var OKX_STOCKS_ROUTING_ENABLED = true;

/** True si le symbole OKX (casse indifferente) figure dans la liste des actions tokenisees connues. */
function _okxIsListedStockToken_(sym) {
  var s = String(sym == null ? "" : sym).trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(OKX_STOCK_TOKENS, s);
}

/** True si la ligne doit etre routee en Stocks : action connue ET routage active. */
function _okxIsStockToken_(sym) {
  return OKX_STOCKS_ROUTING_ENABLED === true && _okxIsListedStockToken_(sym);
}

/** Ticker boursier canonique d'une action tokenisee OKX ; le symbole inchange sinon. */
function _okxCanonicalStockSymbol_(sym) {
  var s = String(sym == null ? "" : sym).trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(OKX_STOCK_TOKENS, s) ? OKX_STOCK_TOKENS[s] : s;
}

// v4.16.30: aliases appliques apres fetch relay, AVANT ecriture sheet.
// OKSOL = SOL liquid-staked par OKX -> consolide sous SOL (pattern BITFINEX_SYMBOL_ALIASES).
var OKX_SYMBOL_ALIASES = {
  "OKSOL": "SOL"
};

function _okxCanonicalSymbol_(sym) {
  var s = String(sym == null ? "" : sym).trim().toUpperCase();
  return OKX_SYMBOL_ALIASES[s] || s;
}

var OKX_SYNC_CONFIG = {
  RELAY_URL_PROP: "OKX_RELAY_URL",
  RELAY_TOKEN_PROP: "OKX_RELAY_TOKEN",
  STATUS_PROP: "OKX_SYNC_STATUS",
  REFRESH_FLAG_PROP: "OKX_REFRESH_REQUESTED",
  SHEET: "CEX - OKX Crypto",
  SHEET_STOCKS: "CEX - OKX Stocks",
  LEGACY_SHEET: "CEX - OKX",
  SPREADSHEET_ID: "1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4"
};

function SET_OKX_RELAY(url, token) {
  if (!_cexRelayUrlAllowed_(url)) throw new Error("URL relais invalide (https et hote de relais connu requis)");
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
  // Token as a header, not in the URL: a query string leaks it into access logs.
  var url = relay.url + "/okx";
  var resp = UrlFetchApp.fetch(url, { method: "get", muteHttpExceptions: true, followRedirects: false, headers: { "x-relay-token": relay.token } });
  if (!resp) throw new Error("OKX relay HTTP blocked/null response");
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code < 200 || code >= 300) throw new Error("Relay HTTP " + code + ": " + text.substring(0, 300));
  var data = JSON.parse(text);
  if (!data || !data.ok) throw new Error("Relay error: " + (data && data.error ? data.error : "unknown").toString().substring(0, 300));
  var out = [];
  var byKey = {};
  var spot = data.spot || [];
  for (var i = 0; i < spot.length; i++) {
    // v4.16.30: alias (OKSOL->SOL) + merge des doublons par (symbole, source).
    var sym = _okxCanonicalSymbol_(spot[i][0]);
    var amt = _okxParseAmount_(spot[i][1]);
    var src = String(spot[i][2] || "spot").trim().toLowerCase() || "spot";
    var valueUsd = _okxParseAmount_(spot[i][3]);
    var priceUsd = _okxParseAmount_(spot[i][4]);
    if (!sym || amt <= 0) continue;
    var key = sym + "|" + src;
    var existing = byKey[key];
    if (existing) {
      existing[1] += amt;
      existing[3] += valueUsd;
      existing[4] = existing[1] > 0 ? existing[3] / existing[1] : priceUsd;
    } else {
      var row = [sym, amt, src, valueUsd, priceUsd];
      byKey[key] = row;
      out.push(row);
    }
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

function DIAG_OKX_RELAY_CONFIG() {
  try {
    var relay = _okxGetRelay_();
    return "OKX relay url=" + relay.url + " token=" + (relay.token ? "SET" : "MISSING");
  } catch (err) {
    return "OKX relay config ERROR: " + (err && err.message ? err.message : err);
  }
}

/**
 * Onglet de sortie OKX. Si le nouvel onglet Crypto n'existe pas encore alors que l'ancien « CEX - OKX » existe,
 * l'ancien est renomme (les formules du classeur suivent le renommage) au lieu d'en creer un second vide.
 */
function _okxGetOrCreateSheet_(ss, name, legacyName) {
  var sh = ss.getSheetByName(name);
  if (sh) {
    // Les deux onglets existent (ex. « CEX - OKX Crypto » cree a la main alors que l'ancien porte encore les soldes) :
    // ecrire dans le nouveau laisserait l'ancien perime. La lecture s'arrete, a resoudre a la main.
    var coexisting = legacyName ? ss.getSheetByName(legacyName) : null;
    // Seul un ancien onglet CONFIRME etranger a OKX laisse passer ; illisible a cet instant = dans le doute, on s'arrete.
    if (coexisting && coexisting !== sh && _okxSheetKind_(coexisting) !== "OTHER") {
      throw new Error("OKX_LEGACY_AND_NEW_SHEETS_COEXIST: '" + legacyName + "' and '" + name + "' both exist; nothing written");
    }
    return sh;
  }
  if (legacyName) {
    var old = ss.getSheetByName(legacyName);
    if (old) {
      // Renomme seulement un onglet qui a bien la forme d'une sortie OKX (en-tete « cryptocoin_symbol » en A2).
      if (_okxLooksLikeOutputSheet_(old)) { old.setName(name); return old; }
      // Ancien onglet present mais non reconnu (ou illisible a cet instant) : on ne cree JAMAIS un second onglet
      // a cote (il laisserait l'ancien avec ses soldes) ; la lecture echoue proprement et reessaie au passage suivant.
      throw new Error("OKX_LEGACY_SHEET_UNRECOGNISED: '" + legacyName + "' exists but is not an OKX output tab; not renamed, nothing written");
    }
  }
  return ss.insertSheet(name);
}

/** "OKX" : en-tete de sortie OKX (A2 = cryptocoin_symbol) ; "OTHER" : lu, autre chose ; "UNREADABLE" : lecture impossible. */
function _okxSheetKind_(sh) {
  try { return String(sh.getRange(2, 1).getValue() || "").trim() === "cryptocoin_symbol" ? "OKX" : "OTHER"; } catch (e) { return "UNREADABLE"; }
}

function _okxLooksLikeOutputSheet_(sh) {
  return _okxSheetKind_(sh) === "OKX";
}

function _okxSetupOneSheet_(ss, name, legacyName) {
  var sh = _okxGetOrCreateSheet_(ss, name, legacyName);
  if (sh.getMaxColumns() < 7) sh.insertColumnsAfter(sh.getMaxColumns(), 7 - sh.getMaxColumns());
  sh.getRange("A1").insertCheckboxes().setValue(false);
  sh.getRange("B1").setValue(Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss")).setNumberFormat("@");
  sh.getRange(2, 1, 1, 4).setValues([["cryptocoin_symbol", "balance", "source", "updated_at"]]);
  return sh;
}

function SETUP_OKX_SHEET() {
  var ss = SpreadsheetApp.openById(OKX_SYNC_CONFIG.SPREADSHEET_ID);
  _okxSetupOneSheet_(ss, OKX_SYNC_CONFIG.SHEET, OKX_SYNC_CONFIG.LEGACY_SHEET);
  _okxSetupOneSheet_(ss, OKX_SYNC_CONFIG.SHEET_STOCKS, null);
  return "OK_OKX_SHEET_READY";
}

/** Repartit les lignes du relais : actions tokenisees connues -> stocks, tout le reste -> crypto. */
function _okxSplitSpot_(buckets) {
  var crypto = [], stocks = [];
  var list = (buckets && buckets.spot) || [];
  for (var i = 0; i < list.length; i++) {
    if (_okxIsStockToken_(list[i][0])) stocks.push(list[i]); else crypto.push(list[i]);
  }
  return { crypto: { spot: crypto }, stocks: { spot: stocks } };
}

function _okxBuildValues_(buckets, stamp) {
  var values = [];
  var list = (buckets && buckets.spot) || [];
  for (var i = 0; i < list.length; i++) {
    var src = String(list[i][2] || "spot").trim().toLowerCase() || "spot";
    values.push([list[i][0], _okxParseAmount_(list[i][1]), src, stamp, _okxParseAmount_(list[i][3]), _okxParseAmount_(list[i][4])]);
  }
  return values;
}

function _okxWriteOneSheet_(ss, sheetName, legacyName, buckets, stamp) {
  var sh = _okxGetOrCreateSheet_(ss, sheetName, legacyName);
  if (sh.getMaxColumns() < 7) sh.insertColumnsAfter(sh.getMaxColumns(), 7 - sh.getMaxColumns());
  var dataRows = _okxBuildValues_(buckets, stamp);
  var values = [[false, stamp, "", ""], ["cryptocoin_symbol", "balance", "source", "updated_at"]].concat(dataRows);
  _cexComputeAndAppendTotal_(ss, sheetName, dataRows, "okx", values);
  return dataRows.length;
}

/**
 * Un titre OKX Stocks detenu sans ligne dans « Portefeuille Action Details » laisse sa valeur a zero dans Portefeuille Action
 * (colonne G = SUMIFS sur Details) et la Verif de l'onglet a X. Rien d'autre ne reconstruit Details : si un ticker detenu n'y a
 * pas sa ligne (source = OKX Stocks, ticker brut en F), on la fait reconstruire (REFRESH_STOCK_PORTFOLIO_DETAILS).
 * Jamais fatal : la lecture OKX a deja reussi. Retourne un statut court.
 */
function _okxEnsureActionDetails_(ss, stockRows) {
  try {
    var wanted = {};
    var list = stockRows || [];
    for (var i = 0; i < list.length; i++) {
      var sym = String(list[i][0] == null ? "" : list[i][0]).trim().toUpperCase();
      if (sym && _okxParseAmount_(list[i][1]) > 0) wanted[sym] = true;
    }
    var keys = Object.keys(wanted);
    if (!keys.length) return "NONE";
    var sh = ss.getSheetByName("Portefeuille Action Details");
    if (!sh) return "NO_DETAILS_SHEET";
    var have = {};
    var last = Number(sh.getLastRow()) || 0;
    if (last >= 2) {
      var vals = sh.getRange(2, 5, last - 1, 2).getValues();
      for (var r = 0; r < vals.length; r++) {
        if (String(vals[r][0]).trim() === OKX_SYNC_CONFIG.SHEET_STOCKS) have[String(vals[r][1]).trim().toUpperCase()] = true;
      }
    }
    var missing = keys.filter(function (k) { return !have[k]; });
    if (!missing.length) return "OK";
    if (typeof REFRESH_STOCK_PORTFOLIO_DETAILS !== "function") return "NO_REFRESH_FUNCTION";
    var out = String(REFRESH_STOCK_PORTFOLIO_DETAILS());
    Logger.log("[OKX_STOCKS] Action Details rebuild requested for " + missing.join(",") + " : " + out.substring(0, 120));
    return (out.indexOf("OK") === 0 ? "REFRESHED:" : "NOT_REFRESHED:") + out.substring(0, 60);
  } catch (e) {
    try { Logger.log("[OKX_STOCKS] Action Details check failed: " + (e && e.message ? e.message : e)); } catch (eLog) {}
    return "ERROR";
  }
}

/** Ecrit les deux onglets OKX depuis UNE lecture du relais. Retourne {crypto, stocks, details} (lignes de chacun, statut Details). */
function _okxWriteSheet_(ss, buckets) {
  var stamp = Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss");
  var split = _okxSplitSpot_(buckets);
  var nCrypto = _okxWriteOneSheet_(ss, OKX_SYNC_CONFIG.SHEET, OKX_SYNC_CONFIG.LEGACY_SHEET, split.crypto, stamp);
  var nStocks = _okxWriteOneSheet_(ss, OKX_SYNC_CONFIG.SHEET_STOCKS, null, split.stocks, stamp);
  var details = (OKX_STOCKS_ROUTING_ENABLED === true && nStocks > 0) ? _okxEnsureActionDetails_(ss, split.stocks.spot) : "SKIPPED";
  return { crypto: nCrypto, stocks: nStocks, details: details };
}

function UPDATE_OKX_SPOT() {
  // v4.15.109: per-connector lock instead of shared global ScriptLock.
  if (typeof CEX_ACQUIRE_LOCK === "function" && !CEX_ACQUIRE_LOCK("OKX")) return "BUSY";
  try {
    var ss = SpreadsheetApp.openById(OKX_SYNC_CONFIG.SPREADSHEET_ID);
    var buckets = _cexRelayFetchWithRetry_(function() { return _okxFetchBucketsViaRelay_(); }, "OKX");
    var written = _okxWriteSheet_(ss, buckets);
    var status = { ok: true, ts: new Date().toISOString(), spot: buckets.spot.length, rows: written.crypto + written.stocks, crypto: written.crypto, stocks: written.stocks, details: written.details };
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
    var okxSheetName = sheet ? sheet.getName() : "";
    // Le clic A1 de l'un ou l'autre onglet (ou l'ancien nom, avant renommage) relance la meme lecture : elle alimente les deux.
    if (!sheet || (okxSheetName !== OKX_SYNC_CONFIG.SHEET && okxSheetName !== OKX_SYNC_CONFIG.SHEET_STOCKS && okxSheetName !== OKX_SYNC_CONFIG.LEGACY_SHEET)) return false;
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
  return "LEGACY_DISABLED: manual requests use CEX_MANUAL_REFRESH_WORKER";
}
