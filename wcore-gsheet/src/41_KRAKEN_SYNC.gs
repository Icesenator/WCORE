// v4.16.43 - budget d appels PRIVES (plafond glissant 24 h) + cache court 4 min pour les
//            diagnostics + le refresh manuel A1 respecte la pause post-lockout.
//            But : pouvoir RAFRAICHIR PLUS SOUVENT (trigger 30 min) sans jamais risquer
//            un ban. Le plafond transforme "risque de ban" en " degradation visible et bornee".
// v4.16.42 - pause persistante 60 min apres Temporary lockout (aucun appel prive pendant la pause)
//            + un seul appel Balance/h : UPDATE_KRAKEN_SPOT ecrit Crypto ET Stocks, le trigger
//            Stocks saute si ce passage partage a moins de 55 min.
// v4.16.41 - nonce persistant strictement croissant + lock KRAKEN partage (anti Temporary lockout).
// v4.16.40 - UPDATE_KRAKEN_SPOT/STOCKS_FIAT flush HttpCounter en sortie (telemetrie budget pas perdue).
// v4.16.39 - tickers xStocks Kraken affichés avec x minuscule + prix Kraken direct.
// v4.16.38 - xStocks Kraken courts (MUX) whitelistes + routage fiat/xstocks v2`n// v4.16.37 - A1 de CEX - Kraken Stocks rafraîchit fiat + xStocks (KRAKEN_ON_EDIT).
// v4.16.36 - Routage fiat + xStocks vers CEX - Kraken Stocks (EUR en Stocks, crypto en Crypto).
// v4.16.34 - Dedicated hourly installer and non-mutating legacy watchdog.
// v4.15.119 - Kraken sync via official REST API (read-only Funds Query)
// Onglet de sortie: "CEX - Kraken Crypto" (crypto) et "CEX - Kraken Stocks" (fiat + actions).

var KRAKEN_SYNC_VERSION = "4.16.43";

var KRAKEN_SYNC_CONFIG = {
  BASE_URL: "https://api.kraken.com",
  API_KEY_PROP: "KRAKEN_API_KEY",
  PRIVATE_KEY_PROP: "KRAKEN_PRIVATE_KEY",
  NONCE_PROP: "KRAKEN_LAST_NONCE",
  LOCKOUT_UNTIL_PROP: "KRAKEN_LOCKOUT_UNTIL_MS",
  LOCKOUT_COOLDOWN_MS: 3600000,
  SHARED_OK_PROP: "KRAKEN_SHARED_BALANCE_OK_MS",
  SHARED_SKIP_MS: 3300000,
  // v4.16.43 - budget d appels PRIVES. Un seul POST /0/private/Balance consomme un
  // nonce ET compte dans le rate limit Kraken. Le budget HTTP Google (142/20000
  // observe) n'est PAS la contrainte : c'est le compteur de nonces/compteur
  // d appels de l API privee Kraken. On plafonne donc explicitement, et le depassement
  // degrade proprement au lieu de risquer un ban.
  PRIVATE_BUDGET_PROP: "KRAKEN_PRIVATE_CALLS_24H",
  PRIVATE_BUDGET_MAX: 220,          // plancher de securite sous les 240 compteurs API Kraken
  PRIVATE_BUDGET_WINDOW_MS: 86400000,
  // Cache court pour les diagnostics : 4 diagnostics consecutifs = 1 seul appel prive.
  DIAG_CACHE_PROP: "KRAKEN_DIAG_BUCKETS_JSON",
  DIAG_CACHE_TTL_MS: 240000,
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

function _krakenNextNonce_() {
  // Kraken exige un nonce STRICTEMENT croissant par cle API, tous clients
  // confondus. Deux executions GAS concurrentes (SPOT + STOCKS_FIAT horaires,
  // ou trigger + refresh manuel A1) avec Date.now()*1000 pouvaient generer un
  // nonce identique ou decroissant -> EGeneral:Invalid nonce, puis apres
  // repetitions -> EGeneral:Temporary lockout (ban IP ~15-60 min).
  // On persiste le dernier nonce en ScriptProperties pour garantir la croissance
  // meme entre executions (le lock CEX_ACQUIRE_LOCK serialise, ceci protege des
  // recouvrements residuels).
  var candidate = Date.now() * 1000;
  try {
    var props = PropertiesService.getScriptProperties();
    var raw = props.getProperty(KRAKEN_SYNC_CONFIG.NONCE_PROP);
    var last = raw ? parseInt(raw, 10) : 0;
    if (isFinite(last) && candidate <= last) candidate = last + 1;
    props.setProperty(KRAKEN_SYNC_CONFIG.NONCE_PROP, String(candidate));
  } catch (eNonce) {}
  return String(candidate);
}

// v4.16.42: fin de pause apres lockout (0 si aucune pause active).
function _krakenLockoutUntilMs_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(KRAKEN_SYNC_CONFIG.LOCKOUT_UNTIL_PROP);
    var until = raw ? parseInt(raw, 10) : 0;
    return isFinite(until) && until > Date.now() ? until : 0;
  } catch (e) { return 0; }
}

function _krakenArmLockoutCooldown_() {
  try {
    PropertiesService.getScriptProperties().setProperty(KRAKEN_SYNC_CONFIG.LOCKOUT_UNTIL_PROP, String(Date.now() + KRAKEN_SYNC_CONFIG.LOCKOUT_COOLDOWN_MS));
  } catch (e) {}
}

// v4.16.43 - compteur glissant d appels PRIVES sur 24 h, stocke en packed string
// "ts1,ts2,ts3,..." (les timestamps sont ~13 chiffres). 220 entrees ~ 3.1 KB, tres
// loin de la limite ScriptProperties. Le compteur protege le compteur d API de
// Kraken : au-dela, on degrade en echec VISIBLE plutot que de risquer un ban.
function _krakenPrivateCalls24h_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(KRAKEN_SYNC_CONFIG.PRIVATE_BUDGET_PROP) || "";
    if (!raw) return [];
    var now = Date.now();
    var out = [];
    var parts = String(raw).split(",");
    for (var i = 0; i < parts.length; i++) {
      var t = parseInt(parts[i], 10);
      if (isFinite(t) && now - t < KRAKEN_SYNC_CONFIG.PRIVATE_BUDGET_WINDOW_MS) out.push(t);
    }
    return out;
  } catch (e) { return []; }
}

function _krakenCountPrivateCall_() {
  try {
    var list = _krakenPrivateCalls24h_();
    list.push(Date.now());
    PropertiesService.getScriptProperties().setProperty(KRAKEN_SYNC_CONFIG.PRIVATE_BUDGET_PROP, list.join(","));
    return list.length;
  } catch (e) { return -1; }
}

// v4.16.43 - appel AVANT tout POST prive. Echec VISIBLE, jamais de retry, et les
// lignes existantes restent intactes : la degradation est identique a celle de la
// pause post-lockout, mais limittee au budget plutot qu au ban.
function _krakenAssertPrivateBudget_() {
  var used = _krakenPrivateCalls24h_().length;
  if (used >= KRAKEN_SYNC_CONFIG.PRIVATE_BUDGET_MAX) {
    throw new Error("Budget appels prives Kraken epuise (" + used + "/" + KRAKEN_SYNC_CONFIG.PRIVATE_BUDGET_MAX
      + " sur 24 h, aucun appel envoye, donnees non rafraichies) : reduire la frequence ou attendre la fenetre glissante");
  }
}

function _krakenPrivatePost_(path, params, creds) {
  // v4.16.42: pendant la pause post-lockout, AUCUN appel prive (un appel
  // prolongerait le ban). Echec visible, lignes existantes non reecrites.
  var lockoutUntil = _krakenLockoutUntilMs_();
  if (lockoutUntil) {
    var resume = Utilities.formatDate(new Date(lockoutUntil), "Europe/Paris", "HH:mm");
    throw new Error("Kraken en pause apres Temporary lockout jusqu'a " + resume + " (aucun appel envoye, donnees non rafraichies)");
  }
  // v4.16.43 : garde de budget AVANT de consommer un nonce, pour qu'un budget epuise
  // ne gaspille pas de nonce et ne fasse pas avancer la sequence.
  _krakenAssertPrivateBudget_();
  params = params || {};
  params.nonce = _krakenNextNonce_();
  var parts = [];
  for (var k in params) {
    if (Object.prototype.hasOwnProperty.call(params, k)) {
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(params[k])));
    }
  }
  var postData = parts.join("&");
  _krakenCountPrivateCall_();
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
  if (data && data.error && data.error.length) {
    var krakenErr = data.error.join(", ").substring(0, 300);
    // EGeneral:Temporary lockout = ban temporaire cote Kraken (trop d'appels ou
    // nonces invalides repetes). Ne JAMAIS retry en boucle : attendre 15-60 min
    // sans aucun appel, sinon le ban est prolonge.
    if (/temporary lockout/i.test(krakenErr)) {
      _krakenArmLockoutCooldown_();
      throw new Error("Kraken API error: EGeneral:Temporary lockout (ban temporaire Kraken ~15-60 min : ne pas relancer, attendre puis reessayer une seule fois)");
    }
    throw new Error("Kraken API error: " + krakenErr);
  }
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

// v4.16.43 - variante DIAGNOSTIQUE avec cache court (4 min). Les quatre fonctions
// DIAG_KRAKEN_* (API, TICKERS, XSTOCK_PRICES, LOOP) interrogeaient chacune
// /0/private/Balance : 4 executions de diagnostic = 4 nonces consommes pour une
// information identique. Le cache supprime ces gaspillages SANS jamais servir de
// donnee perimee au pipeline horaire, qui appelle toujours _krakenFetchBuckets_.
function _krakenDiagBuckets_() {
  var cache = null;
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(KRAKEN_SYNC_CONFIG.DIAG_CACHE_PROP);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.at && Date.now() - parsed.at < KRAKEN_SYNC_CONFIG.DIAG_CACHE_TTL_MS) cache = parsed.buckets;
    }
  } catch (e) {}
  if (cache) return cache;
  var buckets = _krakenFetchBuckets_(_krakenGetCreds_());
  try {
    PropertiesService.getScriptProperties().setProperty(KRAKEN_SYNC_CONFIG.DIAG_CACHE_PROP, JSON.stringify({ at: Date.now(), buckets: buckets }));
  } catch (e) {}
  return buckets;
}

// v4.16.43 - purge du cache de diagnostic. Appele apres chaque ecriture reussie
// pour qu'un diagnostic lance juste apres un refresh lise l'etat frais.
function _krakenInvalidateDiagCache_() {
  try { PropertiesService.getScriptProperties().deleteProperty(KRAKEN_SYNC_CONFIG.DIAG_CACHE_PROP); } catch (e) {}
}

function DIAG_KRAKEN_API() {
  try {
    var buckets = _krakenDiagBuckets_();
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
    // v4.16.43 : le refresh vient d'ecrire l'etat reel, un diagnostic ulterieur doit le lire.
    _krakenInvalidateDiagCache_();
    // v4.16.42: le meme appel Balance alimente aussi l'onglet Stocks (fiat + xStocks),
    // pour eviter un second appel prive par heure avec la meme cle.
    try {
      var stockRows = buckets.fiat.concat(buckets.xstocks);
      status.stocksRows = _krakenWriteSheet_(ss, KRAKEN_SYNC_CONFIG.SHEET_STOCKS, stockRows);
      try { PropertiesService.getScriptProperties().setProperty(KRAKEN_SYNC_CONFIG.SHARED_OK_PROP, String(Date.now())); } catch (eShared) {}
    } catch (eStocks) {
      status.stocksError = String(eStocks && eStocks.message ? eStocks.message : eStocks).substring(0, 200);
    }
    _krakenSetStatus_(status);
    return JSON.stringify(status);
  } catch (err) {
    var statusErr = { ok: false, ts: new Date().toISOString(), error: String(err) };
    _krakenSetStatus_(statusErr);
    Logger.log("UPDATE_KRAKEN_SPOT ERROR: " + err);
    return JSON.stringify(statusErr);
  } finally {
    if (typeof CEX_RELEASE_LOCK === "function") CEX_RELEASE_LOCK("KRAKEN");
    try { HttpCallCounter.clearTrigger(); } catch(e){}
    try { if (typeof HttpCounter !== "undefined" && HttpCounter.flush) HttpCounter.flush(); } catch(eFlush){}
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
    // v4.16.43 : pendant une pause post-lockout OU un budget epuise, un clic A1
    // ne doit PAS poser un job manuel. Le job echouerait dans la pause, et le
    // retry/queue aurait alors tendance a relancer Kraken au pire moment. On
    // refuse proprement avec un message lisible, l'onglet garde son horodatage.
    var lockoutUntil = _krakenLockoutUntilMs_();
    if (lockoutUntil) {
      try {
        sheet.getRange("B1").setValue("PAUSE post-lockout jusqu'a " + Utilities.formatDate(new Date(lockoutUntil), "Europe/Paris", "HH:mm")).setNumberFormat("@");
      } catch (ePause) {}
      Logger.log("KRAKEN_ON_EDIT: refresh manuel ignore, pause post-lockout jusqu'a " + lockoutUntil);
      return true;
    }
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

// v4.16.43 - cadence 30 min au lieu de 1 h.
//
// ASTUCE POUR RAFRAICHIR PLUS SOUVENT : Apps Script n'accepte QUE everyMinutes(1),
// everyHours(1), everyDays(1) ou un horaire horloge via atHour/atMinute.
// everyMinutes(30) est REJETE. On obtient donc 2 passages/h par des triggers horloge
// decales (minute 0 et minute 30).
//
// Cout reel : 48 appels prives/jour au lieu de 24, tres loin du plafond de
// securite de 220 et du compteur d API Kraken. Le passage UPDATE_KRAKEN_SPOT ecrit
// les DEUX onglets (Crypto + Stocks) avec UN seul appel Balance, donc doubler la
// cadence ne double pas la charge sur l onglet Stocks : son propre trigger est
// decale de 15 min et saute via KRAKEN_SHARED_BALANCE_OK_MS quand le passage
// partage a moins de 55 min.
//
// Le decalage de 15 min est aussi un filet de securite : si UPDATE_KRAKEN_SPOT
// echoue (pause, budget), KRAKEN_SHARED_BALANCE_OK_MS n'est pas horodate, donc
// UPDATE_KRAKEN_STOCKS_FIAT tente sa chance a la place.
// v4.16.43 - helper UNIQUE d installation des triggers Kraken, appele par
// INSTALL_KRAKEN_SYNC_TRIGGER *et* par _wcoreAutoHealCreateManagedTriggers_.
// Sans ce partage, un WCORE_AUTO_HEAL_FORCE recreerait les triggers everyHours(1)
// et annulerait silencieusement la cadence 30 min.
//
// SEMANTIQUE Apps Script (verifiee par erreur runtime, pas supposee) :
// atHour() et atMinute() sont des methodes TERMINALES qui retournent void :
//   .atHour(0).atMinute(30)  -> TypeError: atMinute is not a function
// C'est atTime(hour, minute, second) qui fixe les trois d'un coup. Forme valide :
//   .everyDays(1).atTime(0, 30, 0).create()
// everyMinutes(30) est REJETE par l'API, d'ou les deux triggers horloge decales
// (h:00 et h:30) pour simuler une cadence de 30 min.
function _krakenInstallCadenceTriggers_() {
  var trs = ScriptApp.getProjectTriggers();
  for (var i = 0; i < trs.length; i++) {
    var fn = trs[i].getHandlerFunction();
    if (fn === "UPDATE_KRAKEN_SPOT" || fn === "UPDATE_KRAKEN_STOCKS_FIAT" || fn === "KRAKEN_REFRESH_WATCHDOG") ScriptApp.deleteTrigger(trs[i]);
  }
  // SPOT : minute 0 et minute 30 de chaque heure. Un SEUL appel Balance ecrit
  // les deux onglets (Crypto + Stocks).
  ScriptApp.newTrigger("UPDATE_KRAKEN_SPOT").timeBased().everyDays(1).atTime(0, 0, 0).create();
  ScriptApp.newTrigger("UPDATE_KRAKEN_SPOT").timeBased().everyDays(1).atTime(0, 30, 0).create();
  // STOCKS : minute 15 et minute 45. Filet de securite : si SPOT echoue (pause
  // post-lockout, budget epuise), KRAKEN_SHARED_BALANCE_OK_MS n'est pas horodate
  // et ce trigger tente sa chance. Sinon il saute (passage partage < 55 min).
  ScriptApp.newTrigger("UPDATE_KRAKEN_STOCKS_FIAT").timeBased().everyDays(1).atTime(0, 15, 0).create();
  ScriptApp.newTrigger("UPDATE_KRAKEN_STOCKS_FIAT").timeBased().everyDays(1).atTime(0, 45, 0).create();
  return 4;
}

function INSTALL_KRAKEN_SYNC_TRIGGER() {
  var n = _krakenInstallCadenceTriggers_();
  return "Triggers installed (cadence 30 min, " + n + " triggers): UPDATE_KRAKEN_SPOT (h:00, h:30) + UPDATE_KRAKEN_STOCKS_FIAT (h:15, h:45, filet de securite)";
}

// v4.16.36: écrit le fiat (EUR) + les xStocks Kraken (normalisés vers le canonique
// WCORE, ex. SKHYx -> SKHY) dans l'onglet CEX - Kraken Stocks, via le même pipeline
// que Bitpanda Stocks (INFO_TOTAL + Vérif). Les cryptos restent sur
// UPDATE_KRAKEN_SPOT -> CEX - Kraken Crypto.
function UPDATE_KRAKEN_STOCKS_FIAT(e) {
  // v4.16.42: le trigger horaire saute si UPDATE_KRAKEN_SPOT a deja ecrit Stocks
  // depuis moins de 55 min (meme appel Balance). Un refresh manuel (sans event
  // trigger) interroge toujours Kraken, hors pause post-lockout.
  if (e && e.triggerUid) {
    try {
      var lastShared = parseInt(PropertiesService.getScriptProperties().getProperty(KRAKEN_SYNC_CONFIG.SHARED_OK_PROP) || "0", 10);
      if (isFinite(lastShared) && lastShared > 0 && Date.now() - lastShared < KRAKEN_SYNC_CONFIG.SHARED_SKIP_MS) {
        return JSON.stringify({ ok: true, skipped: "shared_balance_recent", ts: new Date().toISOString() });
      }
    } catch (eSkip) {}
  }
  try { HttpCallCounter.setTrigger('UPDATE_KRAKEN_STOCKS_FIAT'); } catch (eCounter) {}
  // Lock partage "KRAKEN" (et non un lock dedie) : les deux jobs horaires SPOT et
  // STOCKS_FIAT appellent /0/private/Balance avec la MEME cle API. En parallele,
  // leurs nonces se collisionnent -> Invalid nonce -> Temporary lockout.
  if (typeof CEX_ACQUIRE_LOCK === "function" && !CEX_ACQUIRE_LOCK("KRAKEN")) return "BUSY";
  try {
    var ss = SpreadsheetApp.openById(KRAKEN_SYNC_CONFIG.SPREADSHEET_ID);
    var buckets = _cexRelayFetchWithRetry_(function() { return _krakenFetchBuckets_(_krakenGetCreds_()); }, "KRAKEN_STOCKS");
    var rows = buckets.fiat.concat(buckets.xstocks);
    var written = _krakenWriteSheet_(ss, KRAKEN_SYNC_CONFIG.SHEET_STOCKS, rows);
    var status = { ok: true, ts: new Date().toISOString(), fiat: buckets.fiat.length, xstocks: buckets.xstocks.length, rows: written };
    _krakenInvalidateDiagCache_();
    _krakenSetStatus_(status);
    return JSON.stringify(status);
  } catch (err) {
    var statusErr = { ok: false, ts: new Date().toISOString(), error: String(err) };
    _krakenSetStatus_(statusErr);
    Logger.log("UPDATE_KRAKEN_STOCKS_FIAT ERROR: " + err);
    return JSON.stringify(statusErr);
  } finally {
    if (typeof CEX_RELEASE_LOCK === "function") CEX_RELEASE_LOCK("KRAKEN");
    try { HttpCallCounter.clearTrigger(); } catch(e){}
    try { if (typeof HttpCounter !== "undefined" && HttpCounter.flush) HttpCounter.flush(); } catch(eFlush){}
  }
}

function DIAG_KRAKEN_TICKERS() {
  try {
    var buckets = _krakenDiagBuckets_();
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
    var buckets = _krakenDiagBuckets_();
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
    // v4.16.43 : purge du cache de diagnostic, ce diagnostic vient d interroger
    // Kraken et l information est maintenant fraiche.
    _krakenInvalidateDiagCache_();
    Logger.log(lines.join("\n"));
    return lines.join("\n");
  } catch (err) {
    return "ERROR: " + (err && err.message ? err.message : err);
  }
}

// v4.16.43 - observabilite du budget et de la pause, SANS aucun appel a Kraken.
// C'est la seule commande de diagnostic a consulter en cas de lockout : elle ne
// consomme ni nonce ni compteur, elle ne peut donc pas aggraver la situation.
function KRAKEN_BUDGET_STATUS() {
  var used = _krakenPrivateCalls24h_();
  var lockoutUntil = _krakenLockoutUntilMs_();
  var now = Date.now();
  var oldest = used.length ? Math.min.apply(null, used) : null;
  return JSON.stringify({
    version: KRAKEN_SYNC_VERSION,
    private_calls_24h: used.length,
    private_budget_max: KRAKEN_SYNC_CONFIG.PRIVATE_BUDGET_MAX,
    budget_remaining: Math.max(0, KRAKEN_SYNC_CONFIG.PRIVATE_BUDGET_MAX - used.length),
    oldest_call_ms_ago: oldest === null ? null : (now - oldest),
    budget_window_resets_in_min: oldest === null ? null : Math.ceil((oldest + KRAKEN_SYNC_CONFIG.PRIVATE_BUDGET_WINDOW_MS - now) / 60000),
    lockout_active: !!lockoutUntil,
    lockout_resume_local: lockoutUntil ? Utilities.formatDate(new Date(lockoutUntil), "Europe/Paris", "yyyy-MM-dd HH:mm:ss") : null,
    lockout_remaining_min: lockoutUntil ? Math.ceil((lockoutUntil - now) / 60000) : 0,
    cadence: "30 min (SPOT h:00 et h:30 ecrit Crypto+Stocks en 1 appel ; STOCKS h:15 et h:45 en filet)",
    projected_calls_per_day: 48,
    next_safe_manual_refresh: lockoutUntil ? "apres " + Utilities.formatDate(new Date(lockoutUntil), "Europe/Paris", "HH:mm") : "maintenant"
  });
}
