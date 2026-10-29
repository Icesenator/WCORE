// v4.16.45 - CANDIDAT LOCAL recovery Balance seul (non publie)
// Parseurs/projection 4.16.44 conservés, réservations UNKNOWN ; historique : P1-DATA-KRAKEN-STOCKS-OPEN-ORDERS : Balance remplace
//            par BalanceEx + OpenOrders (2 appels prives/cycle partage, aucun rejeu apres un
//            appel prive), AssetPairs public reduit, projection H:Q (hold_trade + ordres),
//            erreurs distantes allowlistees, diagnostics sous lock KRAKEN, compteur et nonce
//            fail-closed, observabilite lockout (evenements fixes), formules Details locales.
// v4.16.43 - budget d appels PRIVES (plafond glissant 24 h) + cache court 4 min pour les
//            diagnostics + le refresh manuel A1 respecte la pause post-lockout.
//            But : pouvoir RAFRAICHIR SANS jamais risquer un ban. Le plafond
//            transforme "risque de ban" en " degradation visible et bornee" ; la
//            frequence horaire reste la cadence prouvee en production.
//            REGRESSION corrigee le 2026-09-30 : une tentative de cadence 30 min
//            (everyDays(1).atHour().nearMinute()) produisait des triggers
//            QUOTIDIENS, donc un seul passage par jour et un PULSE fige 18 h.
// v4.16.42 - pause persistante 60 min apres Temporary lockout (aucun appel prive pendant la pause)
//            + un seul appel Balance/h : UPDATE_KRAKEN_SPOT ecrit Crypto ET Stocks, le trigger
//            Stocks saute si ce passage partage a moins de 55 min.
// v4.16.41 - nonce persistant strictement croissant + lock KRAKEN partage (anti Temporary lockout).
// v4.16.40 - UPDATE_KRAKEN_SPOT/STOCKS_FIAT flush HttpCounter en sortie (telemetrie budget pas perdue).
// v4.16.39 - tickers xStocks Kraken affichés avec x minuscule + prix Kraken direct.
// v4.16.38 - xStocks Kraken courts (MUX) whitelistes + routage fiat/xstocks v2
// v4.16.37 - A1 de CEX - Kraken Stocks rafraîchit fiat + xStocks (KRAKEN_ON_EDIT).
// v4.16.36 - Routage fiat + xStocks vers CEX - Kraken Stocks (EUR en Stocks, crypto en Crypto).
// v4.16.34 - Dedicated hourly installer and non-mutating legacy watchdog.
// v4.15.119 - Kraken sync via official REST API (read-only Funds Query)
// Onglet de sortie: "CEX - Kraken Crypto" (crypto) et "CEX - Kraken Stocks" (fiat + actions).

var KRAKEN_SYNC_VERSION = "4.16.45";

var KRAKEN_SYNC_CONFIG = {
  BASE_URL: "https://api.kraken.com",
  API_KEY_PROP: "KRAKEN_API_KEY",
  PRIVATE_KEY_PROP: "KRAKEN_PRIVATE_KEY",
  NONCE_PROP: "KRAKEN_LAST_NONCE",
  LOCKOUT_UNTIL_PROP: "KRAKEN_LOCKOUT_UNTIL_MS",
  LOCKOUT_COOLDOWN_MS: 3600000,
  LAST_REMOTE_ERROR_PROP: "KRAKEN_LAST_REMOTE_ERROR",
  LAST_LOCAL_REFUSAL_PROP: "KRAKEN_LAST_LOCAL_REFUSAL",
  LAST_SUCCESS_PROP: "KRAKEN_LAST_SUCCESS",
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

// Bornes de travail locales : refus explicite, jamais troncature ou zéro fabriqué.
// 10k métadonnées/30k alias couvrent le marché public ; 2k ordres et 5k lignes
// bornent la projection GAS. 95k octets laisse une marge sous CacheService (100KB).
var KRAKEN_LOCAL_LIMITS = { PAIRS: 10000, ALIASES: 30000, ORDERS: 2000, ROWS: 5000, CACHE_BYTES: 95000, FIELD_CHARS: 256 };

function _krakenLimitFail_() { return _krakenFail_("LOCAL", "Kraken UNKNOWN (limite locale depassee)"); }

function _krakenBoundedKeys_(obj, max) {
  var keys = Object.keys(obj);
  if (keys.length > max) throw _krakenLimitFail_();
  return keys;
}

function _krakenSafeStockTicker_(ticker) {
  return typeof ticker === "string" && /^[A-Z0-9][A-Z0-9.]{0,22}x$/.test(ticker);
}

function _krakenCacheSize_(text) {
  // Comptage UTF-8 borné sans tableau d'octets ni copie encodée de tout le cache.
  if (typeof text !== "string" || text.length > KRAKEN_LOCAL_LIMITS.CACHE_BYTES) throw _krakenLimitFail_();
  var bytes = 0;
  for (var i = 0; i < text.length; i++) {
    var c = text.charCodeAt(i);
    if (c < 128) bytes++;
    else if (c < 2048) bytes += 2;
    else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < text.length && text.charCodeAt(i + 1) >= 0xDC00 && text.charCodeAt(i + 1) <= 0xDFFF) { bytes += 4; i++; }
    else bytes += 3;
    if (bytes > KRAKEN_LOCAL_LIMITS.CACHE_BYTES) throw _krakenLimitFail_();
  }
  return bytes;
}

function _krakenValidateReduced_(reduced) {
  if (!reduced || !Array.isArray(reduced.t) || !Array.isArray(reduced.c)
      || reduced.t.length > KRAKEN_LOCAL_LIMITS.PAIRS || reduced.c.length > KRAKEN_LOCAL_LIMITS.ALIASES) throw _krakenLimitFail_();
  var bytes = 15;
  function account(value) {
    var fields = Array.isArray(value) ? value : [value];
    if (fields.length > 5) throw _krakenLimitFail_();
    for (var j = 0; j < fields.length; j++) {
      if (typeof fields[j] !== "string" || fields[j].length > KRAKEN_LOCAL_LIMITS.FIELD_CHARS) throw _krakenLimitFail_();
    }
    bytes += _krakenCacheSize_(JSON.stringify(value)) + 1;
    if (bytes > KRAKEN_LOCAL_LIMITS.CACHE_BYTES) throw _krakenLimitFail_();
  }
  reduced.t.forEach(account);
  reduced.c.forEach(account);
  return reduced;
}

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
    var last = raw == null || raw === "" ? 0 : Number(raw);
    if ((raw != null && raw !== "" && !/^\d+$/.test(raw)) || !Number.isSafeInteger(last) || last < 0) throw new Error("Kraken nonce persistant invalide");
    if (candidate <= last) candidate = last + 1;
    if (!Number.isSafeInteger(candidate) || candidate <= last || !/^\d+$/.test(String(candidate))) throw new Error("Kraken nonce hors limite sure");
    props.setProperty(KRAKEN_SYNC_CONFIG.NONCE_PROP, String(candidate));
  } catch (eNonce) { throw eNonce; }
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
    // 220 horodatages entiers sûrs (16 chiffres + séparateur) au maximum.
    if (raw.length > KRAKEN_SYNC_CONFIG.PRIVATE_BUDGET_MAX * 17) throw new Error("COUNTER_LIMIT");
    var now = Date.now();
    var out = [];
    var parts = String(raw).split(",");
    for (var i = 0; i < parts.length; i++) {
      var t = Number(parts[i]);
      if (!/^\d+$/.test(parts[i]) || !Number.isSafeInteger(t) || t < 0 || t > now) throw new Error("INVALID_COUNTER");
      if (now - t < KRAKEN_SYNC_CONFIG.PRIVATE_BUDGET_WINDOW_MS) out.push(t);
    }
    return out;
  } catch (e) { throw _krakenFail_("LOCAL", "Kraken compteur prive indisponible (lecture, aucun appel envoye)"); }
}

// Incrément 3 : fail-closed comme le nonce. Un appel non compté ne part jamais.
function _krakenCountPrivateCall_() {
  var list = _krakenPrivateCalls24h_();
  list.push(Date.now());
  try { PropertiesService.getScriptProperties().setProperty(KRAKEN_SYNC_CONFIG.PRIVATE_BUDGET_PROP, list.join(",")); }
  catch (eCount) { throw _krakenFail_("LOCAL", "Kraken compteur prive indisponible (ecriture, aucun appel envoye)"); }
  return list.length;
}

// v4.16.43 - appel AVANT tout POST prive. Echec VISIBLE, jamais de retry, et les
// lignes existantes restent intactes : la degradation est identique a celle de la
// pause post-lockout, mais limittee au budget plutot qu au ban.
function _krakenAssertPrivateBudget_() {
  var used = _krakenPrivateCalls24h_().length;
  if (used >= KRAKEN_SYNC_CONFIG.PRIVATE_BUDGET_MAX) {
    _krakenRecordEvent_(KRAKEN_SYNC_CONFIG.LAST_LOCAL_REFUSAL_PROP, "PRIVATE_BUDGET");
    throw new Error("Budget appels prives Kraken epuise (" + used + "/" + KRAKEN_SYNC_CONFIG.PRIVATE_BUDGET_MAX
      + " sur 24 h, aucun appel envoye, donnees non rafraichies) : reduire la frequence ou attendre la fenetre glissante");
  }
}

// v4.16.44 : trois enregistrements fixes, sans payload, cle, nonce ni signature.
function _krakenRecordEvent_(prop, kind) {
  try {
    PropertiesService.getScriptProperties().setProperty(prop, JSON.stringify({ ts: new Date().toISOString(), kind: kind }));
  } catch (e) {}
}

function _krakenReadEvent_(prop) {
  try {
    var event = JSON.parse(PropertiesService.getScriptProperties().getProperty(prop) || "null");
    if (event && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(event.ts)
        && /^(TEMPORARY_LOCKOUT|INVALID_NONCE|RATE_LIMIT|AUTH|HTTP|OTHER|LOCKOUT_COOLDOWN|PRIVATE_BUDGET|SUCCESS)$/.test(event.kind)) {
      return { ts: event.ts, kind: event.kind };
    }
  } catch (e) {}
  return null;
}

function _krakenRemoteErrorKind_(err) {
  var message = String(err && err.message ? err.message : err);
  if (/temporary lockout/i.test(message)) return "TEMPORARY_LOCKOUT";
  if (/invalid nonce/i.test(message)) return "INVALID_NONCE";
  if (/rate limit/i.test(message)) return "RATE_LIMIT";
  if (/invalid key|invalid signature|permission denied|authentication/i.test(message)) return "AUTH";
  if (/ HTTP \d{3}/.test(message)) return "HTTP";
  return "OTHER";
}

// Incrément 3 (revue sécurité) : erreur LOCALE à message fixe. Jamais le texte distant
// brut (corps HTTP, error[] Kraken, message transport) vers statut/B1/retour. Les
// messages ne contiennent jamais "blocked/null response" ni "Address unavailable:" :
// le wrapper partagé _cexRelayFetchWithRetry_ ne rejoue donc jamais un cycle Kraken
// ayant déjà émis un appel privé (plafond strict 2 appels privés par cycle).
function _krakenFail_(kind, message) {
  var e = new Error(message);
  e._krakenKind = kind;
  return e;
}

// Revue finale : nombre d'appels privés émis dans le cycle courant (remis à 0 par
// chaque UPDATE_KRAKEN_*). Une fois > 0, aucun retour du cycle ne peut contenir un
// motif que _cexIsTransientResult_ / _cexRelayFetchWithRetry_ rejouerait (timed out,
// Service Spreadsheets, internal error, blocked/null...) : le worker manuel A1 ne
// relance alors jamais un cycle ayant déjà consommé des appels privés.
var _KRAKEN_CYCLE_PRIVATE_CALLS = 0;
var _KRAKEN_TRANSIENT_PATTERN = /blocked\/null response|Address unavailable:|timed out|Service Spreadsheets|Service invoked too many times|internal error|^BUSY$/i;

function _krakenCycleSafeMessage_(message) {
  var m = String(message || "");
  if (_KRAKEN_CYCLE_PRIVATE_CALLS > 0 && _KRAKEN_TRANSIENT_PATTERN.test(m)) {
    return "Kraken cycle interrompu apres " + _KRAKEN_CYCLE_PRIVATE_CALLS + " appel(s) prive(s) (ecriture/locale) : aucun rejeu automatique";
  }
  return m;
}

function _krakenPrivatePost_(path, params, creds) {
  // v4.16.42: pendant la pause post-lockout, AUCUN appel prive (un appel
  // prolongerait le ban). Echec visible, lignes existantes non reecrites.
  var lockoutUntil = _krakenLockoutUntilMs_();
  if (lockoutUntil) {
    _krakenRecordEvent_(KRAKEN_SYNC_CONFIG.LAST_LOCAL_REFUSAL_PROP, "LOCKOUT_COOLDOWN");
    var resume = Utilities.formatDate(new Date(lockoutUntil), "Europe/Paris", "HH:mm");
    throw new Error("Kraken en pause apres Temporary lockout jusqu'a " + resume + " (aucun appel envoye, donnees non rafraichies)");
  }
  // v4.16.43 : garde de budget AVANT de consommer un nonce, pour qu'un budget epuise
  // ne gaspille pas de nonce et ne fasse pas avancer la sequence.
  _krakenAssertPrivateBudget_();
  params = params || {};
  try { params.nonce = _krakenNextNonce_(); }
  catch (eNonce) { throw _krakenFail_("LOCAL", "Kraken nonce persistant indisponible (aucun appel envoye)"); }
  var parts = [];
  for (var k in params) {
    if (Object.prototype.hasOwnProperty.call(params, k)) {
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(params[k])));
    }
  }
  var postData = parts.join("&");
  _krakenCountPrivateCall_();
  _KRAKEN_CYCLE_PRIVATE_CALLS++;
  try {
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
    if (!resp) throw _krakenFail_("OTHER", "Kraken " + path + " reponse transport vide (aucun rejeu)");
    var code = resp.getResponseCode();
    if (code < 200 || code >= 300) throw _krakenFail_("HTTP", "Kraken " + path + " HTTP " + code);
    var data;
    try { data = JSON.parse(resp.getContentText()); } catch (eJson) { throw _krakenFail_("OTHER", "Kraken " + path + " reponse illisible"); }
    if (data && data.error && data.error.length) {
      var krakenKind = _krakenRemoteErrorKind_(data.error.join(", "));
      // EGeneral:Temporary lockout = ban temporaire cote Kraken (trop d'appels ou
      // nonces invalides repetes). Ne JAMAIS retry en boucle : attendre 15-60 min
      // sans aucun appel, sinon le ban est prolonge.
      if (krakenKind === "TEMPORARY_LOCKOUT") {
        _krakenArmLockoutCooldown_();
        throw _krakenFail_(krakenKind, "Kraken API error: EGeneral:Temporary lockout (ban temporaire Kraken ~15-60 min : ne pas relancer, attendre puis reessayer une seule fois)");
      }
      throw _krakenFail_(krakenKind, "Kraken API error: " + krakenKind);
    }
    _krakenRecordEvent_(KRAKEN_SYNC_CONFIG.LAST_SUCCESS_PROP, "SUCCESS");
    return data.result || {};
  } catch (err) {
    if (!err || !err._krakenKind) err = _krakenFail_(_krakenRemoteErrorKind_(err), "Kraken " + path + " erreur transport (aucun rejeu)");
    _krakenRecordEvent_(KRAKEN_SYNC_CONFIG.LAST_REMOTE_ERROR_PROP, err._krakenKind);
    throw err;
  }
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

// --- Parseurs purs BalanceEx / OpenOrders (P1-DATA-KRAKEN-STOCKS-OPEN-ORDERS) ---
// Aucun appel HTTP, aucun effet de bord : testables avec des fixtures locales.

/**
 * Parse la reponse de /0/private/BalanceEx.
 * Chaque entree : { balance: "0.1", hold_trade: "0.05" }
 * Retour : { symboleCanonique: { balance, hold_trade, available } }
 * hold_trade inconnu -> null ( jamais 0 ).
 */
function _krakenSnapshotNumber_(value) {
  if ((typeof value !== "string" && typeof value !== "number") || !/^\d+(?:\.\d+)?$/.test(String(value))) return null;
  var n = Number(value);
  return isFinite(n) && n >= 0 ? n : null;
}

function _krakenParseBalanceEx_(rawData) {
  var fail = { status: "UNKNOWN", _error: "INVALID_BALANCE_EX" };
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData) || (rawData.error && rawData.error.length)) return fail;
  var data = Object.prototype.hasOwnProperty.call(rawData, "result") ? rawData.result : rawData;
  if (!data || typeof data !== "object" || Array.isArray(data)) return fail;
  if (!Object.prototype.hasOwnProperty.call(rawData, "result") && Object.keys(data).filter(function(k) { return k !== "error"; }).length === 0) return fail;
  var out = { status: "OK" };
  Object.keys(data).forEach(function(raw) {
    if (raw === "error") return;
    var e = data[raw];
    var objectEntry = e && typeof e === "object" && !Array.isArray(e);
    var balance = _krakenSnapshotNumber_(objectEntry ? e.balance : e);
    var hold = _krakenSnapshotNumber_(objectEntry ? e.hold_trade : null);
    var credit = _krakenSnapshotNumber_(objectEntry ? e.credit : null);
    var used = _krakenSnapshotNumber_(objectEntry ? e.credit_used : null);
    // Identité du titre avant toute normalisation crypto (BRK.Bx.T, XOMx.T).
    var isStock = _krakenIsXStock_(raw);
    var sym = isStock ? _krakenDisplayStockSymbol_(raw) : _krakenCanonicalSymbol_(raw);
    if (isStock && !_krakenSafeStockTicker_(sym)) { out.status = "UNKNOWN"; out._error = "INVALID_STOCK_TICKER"; return; }
    // Seuls xStocks et fiat alimentent CEX - Kraken Stocks : une collision d'alias ou une
    // donnée inconnue côté crypto (USDC/USDT -> USDT, ETH.F) ne bloque pas la projection Stocks.
    var blocking = isStock || (!!sym && _krakenIsFiat_(sym));
    var available = balance !== null && hold !== null && credit !== null && used !== null ? balance + credit - used - hold : null;
    if (available !== null && available < 0) available = null;
    var item = { balance: balance, hold_trade: hold, credit: credit, credit_used: used, available: available };
    if (!sym || Object.prototype.hasOwnProperty.call(out, sym)) {
      if (blocking || !sym) { out.status = "UNKNOWN"; out._error = "ASSET_COLLISION"; }
      if (sym && !blocking) out[sym] = null;
      return;
    }
    out[sym] = item;
    if (available === null && blocking) out.status = "UNKNOWN";
  });
  return out;
}

/**
 * Parse la reponse de /0/private/OpenOrders.
 * result.open = { orderId: { descr: {type, pair, price}, vol, vol_exec, status } }
 * buy/sell agrègent uniquement vol - vol_exec des ordres actifs xStocks.
 * Les ordres terminés sont exclus même dans une fixture artificielle.
 * Erreur/format inconnu : status UNKNOWN, aucun compteur zéro fabriqué.
 * Aucun montant réservé n'est déduit des ordres : BalanceEx fait autorité.
 */
function _krakenBuildAssetPairIndex_(metadata) {
  var index = Object.create(null);
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return index;
  function add(alias, item) {
    if (!alias) return;
    if (Object.prototype.hasOwnProperty.call(index, alias)) {
      if (!index[alias] || index[alias].base !== item.base || index[alias].quote !== item.quote) index[alias] = null;
    } else index[alias] = item;
  }
  _krakenBoundedKeys_(metadata, KRAKEN_LOCAL_LIMITS.PAIRS).sort().forEach(function(id) {
    var entry = metadata[id];
    if (!entry || typeof entry.base !== "string" || typeof entry.quote !== "string" || !entry.base || !entry.quote) return;
    var ws = typeof entry.wsname === "string" ? entry.wsname.split("/") : [];
    var item = { base: entry.base, quote: entry.quote, ticker: _krakenIsXStock_(entry.base) ? _krakenDisplayStockSymbol_(entry.base) : null,
      pair: ws.length === 2 && ws[0] && ws[1] ? entry.wsname : entry.base + "/" + entry.quote };
    [id, entry.altname, entry.wsname, entry.base + entry.quote, entry.base + "/" + entry.quote].forEach(function(alias) { if (typeof alias === "string") add(alias, item); });
  });
  return index;
}

function _krakenResolveAssetPair_(pair, index) {
  return index && Object.prototype.hasOwnProperty.call(index, pair) ? index[pair] : null;
}

function _krakenParseOpenOrders_(rawData, opt_pairIndex) {
  var fail = { status: "UNKNOWN", _error: "INVALID_OPEN_ORDERS" };
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) return fail;
  if (rawData.error && rawData.error.length) return fail;
  var data = Object.prototype.hasOwnProperty.call(rawData, "result") ? rawData.result : rawData;
  var open = data && data.open;
  if (!open || typeof open !== "object" || Array.isArray(open)) return fail;
  if (Object.keys(open).length > KRAKEN_LOCAL_LIMITS.ORDERS) return { status: "UNKNOWN", _error: "OPEN_ORDERS_LIMIT" };
  var byTicker = { status: "OK" };
  var xstockCount = 0;
  for (var orderId in open) {
    if (!Object.prototype.hasOwnProperty.call(open, orderId)) continue;
    var order = open[orderId];
    if (!order || typeof order !== "object") return fail;
    var status = String(order.status || "").toLowerCase();
    if (/^(closed|canceled|expired)$/.test(status)) continue;
    if (!/^(open|pending)$/.test(status)) return fail;
    var descr = order.descr || {};
    var pair = String(descr.pair || order.pair || "");
    var resolved = opt_pairIndex ? _krakenResolveAssetPair_(pair, opt_pairIndex) : null;
    if (opt_pairIndex && !resolved) return { status: "UNKNOWN", _error: "UNKNOWN_ASSET_PAIR" };
    if (resolved && resolved.crypto) continue; // paire crypto attestée par AssetPairs : hors Stocks
    if (resolved) pair = resolved.pair;
    // Anti-injection Sheets : id et paire écrits en I:Q ne commencent jamais par = + - @.
    if (!/^[A-Za-z0-9-]{1,64}$/.test(orderId) || !/^[A-Za-z0-9.]{1,24}\/[A-Za-z0-9.]{1,24}$/.test(pair)) return fail;
    if (!pair || pair.split("/").length !== 2) return fail;
    var parts = pair.split("/");
    var asset = resolved ? resolved.base : (parts[0] || "");
    if (!_krakenIsXStock_(asset)) continue;
    var displaySym = _krakenDisplayStockSymbol_(asset);
    if (!_krakenSafeStockTicker_(displaySym)) return fail;
    var side = String(descr.type || "").toLowerCase();
    if (side !== "buy" && side !== "sell") return fail;
    var qty = _krakenSnapshotNumber_(order.vol);
    var executed = _krakenSnapshotNumber_(order.vol_exec);
    if (qty === null || executed === null || executed > qty) return fail;
    var remaining = qty - executed;
    if (remaining === 0) continue;
    if (!byTicker[displaySym]) {
      byTicker[displaySym] = { buy: 0, sell: 0, orders: [] };
    }
    byTicker[displaySym].orders.push({
      id: orderId, side: side, price: _krakenSnapshotNumber_(descr.price),
      qty: qty, executed: executed, remaining: remaining, status: status, pair: pair
    });
    if (side === "buy") byTicker[displaySym].buy += remaining;
    else byTicker[displaySym].sell += remaining;
    xstockCount++;
  }
  byTicker._xstockCount = xstockCount;
  return byTicker;
}

function _krakenPushBucket_(bucket, seen, sym, amount) {
  var key = String(sym || "").toUpperCase();
  if (!key) return;
  if (Object.prototype.hasOwnProperty.call(seen, key)) bucket[seen[key]][1] += amount;
  else { seen[key] = bucket.length; bucket.push([sym, amount]); }
}

// Métadonnées publiques réduites : xStocks complets [id, base, quote, altname, wsname],
// paires crypto en simples alias (id/altname/wsname) pour savoir qu'un ordre crypto
// n'est PAS un xStock sans rendre la projection UNKNOWN. Format compact (< 100 KB cache).
function _krakenReduceAssetPairs_(stocksResult, cryptoResult) {
  var reduced = { t: [], c: [] };
  var stockKeys = _krakenBoundedKeys_(stocksResult || {}, KRAKEN_LOCAL_LIMITS.PAIRS);
  var cryptoKeys = _krakenBoundedKeys_(cryptoResult || {}, KRAKEN_LOCAL_LIMITS.PAIRS);
  stockKeys.sort().forEach(function(id) {
    var e = stocksResult[id];
    if (e && typeof e.base === "string" && typeof e.quote === "string") reduced.t.push([id, e.base, e.quote, e.altname || "", e.wsname || ""]);
  });
  cryptoKeys.sort().forEach(function(id) {
    var e = cryptoResult[id];
    if (!e || _krakenIsXStock_(e.base)) return;
    [id, e.altname, e.wsname].forEach(function(a) { if (typeof a === "string" && a) reduced.c.push(a); });
  });
  return _krakenValidateReduced_(reduced);
}

function _krakenIndexFromReduced_(reduced) {
  _krakenValidateReduced_(reduced);
  var meta = {};
  (reduced.t || []).forEach(function(r) { meta[r[0]] = { base: r[1], quote: r[2], altname: r[3] || undefined, wsname: r[4] || undefined }; });
  var index = _krakenBuildAssetPairIndex_(meta);
  (reduced.c || []).forEach(function(alias) {
    if (!Object.prototype.hasOwnProperty.call(index, alias)) index[alias] = { crypto: true };
    else if (index[alias] && !index[alias].crypto) index[alias] = null; // collision xStock/crypto : jamais devinée
  });
  return index;
}

function _krakenFetchPublicPairs_(query) {
  var response = UrlFetchApp.fetch(KRAKEN_SYNC_CONFIG.BASE_URL + "/0/public/AssetPairs" + query, { muteHttpExceptions: true });
  if (!response || response.getResponseCode() !== 200) throw new Error("Kraken AssetPairs indisponible");
  var body = JSON.parse(response.getContentText());
  if (!body || !body.result || typeof body.result !== "object" || (body.error && body.error.length)) throw new Error("Kraken AssetPairs invalide");
  return body.result;
}

function _krakenAssetPairIndex_() {
  if (_krakenLockoutUntilMs_()) throw new Error("Kraken en pause apres Temporary lockout");
  var cache = typeof CacheService !== "undefined" ? CacheService.getScriptCache() : { get: function() { return null; }, put: function() {} };
  var raw = cache.get("KRAKEN_PUBLIC_ASSET_PAIRS_V2");
  if (raw) {
    _krakenCacheSize_(raw);
    var cached;
    try { cached = JSON.parse(raw); } catch (eRaw) { throw _krakenLimitFail_(); }
    return _krakenIndexFromReduced_(cached);
  }
  var reduced = _krakenReduceAssetPairs_(_krakenFetchPublicPairs_("?asset_class=tokenized_asset"), _krakenFetchPublicPairs_(""));
  var packed = JSON.stringify(reduced);
  _krakenCacheSize_(packed);
  try { cache.put("KRAKEN_PUBLIC_ASSET_PAIRS_V2", packed, 3600); } catch (eCache) {}
  return _krakenIndexFromReduced_(reduced);
}

function _krakenFetchBuckets_(creds) {
  if (_krakenLockoutUntilMs_()) throw new Error("Kraken en pause apres Temporary lockout");
  _krakenAssertPrivateBudget_();
  if (_krakenPrivateCalls24h_().length + 1 > KRAKEN_SYNC_CONFIG.PRIVATE_BUDGET_MAX) throw new Error("Budget appels prives Kraken insuffisant pour snapshot");
  // Recovery statique : Balance SEUL, sans découverte de permissions ni fallback.
  // Balance ne renseigne pas les réservations : UNKNOWN n'est jamais un hold nul.
  var balances = _krakenPrivatePost_("/0/private/Balance", {}, creds);
  _krakenBoundedKeys_(balances || {}, KRAKEN_LOCAL_LIMITS.ROWS);
  var snapshotBalance = { status: "UNKNOWN" };
  var snapshotOrders = { status: "UNKNOWN" };
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
  buckets.snapshot = { balance: snapshotBalance, orders: snapshotOrders, collectedAt: Date.now() };
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
      _krakenCacheSize_(raw);
      var parsed = JSON.parse(raw);
      if (parsed && parsed.at && Date.now() - parsed.at < KRAKEN_SYNC_CONFIG.DIAG_CACHE_TTL_MS) cache = parsed.buckets;
    }
  } catch (e) { if (e && e._krakenKind) throw e; }
  if (cache) return cache;
  var buckets = _krakenWithDiagLock_(function() { return _krakenFetchBuckets_(_krakenGetCreds_()); });
  // Le snapshot (ordres, holds, crédits) n'est jamais persisté dans le cache de diagnostic.
  var diagnostic = { at: Date.now(), buckets: { crypto: buckets.crypto, fiat: buckets.fiat, xstocks: buckets.xstocks } };
  var estimatedBytes = 100;
  [buckets.crypto, buckets.fiat, buckets.xstocks].forEach(function(rows) {
    if (!Array.isArray(rows) || rows.length > KRAKEN_LOCAL_LIMITS.ROWS) throw _krakenLimitFail_();
    rows.forEach(function(row) {
      if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== "string" || row[0].length > KRAKEN_LOCAL_LIMITS.FIELD_CHARS || typeof row[1] !== "number" || !isFinite(row[1])) throw _krakenLimitFail_();
      estimatedBytes += _krakenCacheSize_(JSON.stringify(row)) + 1;
      if (estimatedBytes > KRAKEN_LOCAL_LIMITS.CACHE_BYTES) throw _krakenLimitFail_();
    });
  });
  var diagnosticPacked = JSON.stringify(diagnostic);
  _krakenCacheSize_(diagnosticPacked);
  try { PropertiesService.getScriptProperties().setProperty(KRAKEN_SYNC_CONFIG.DIAG_CACHE_PROP, diagnosticPacked); } catch (e) {}
  return buckets;
}

// Incrément 3 : tout appel privé de diagnostic passe sous le lock partagé KRAKEN
// (nonce lu-modifié-écrit non atomique). Lock occupé => BUSY, aucun appel.
function _krakenWithDiagLock_(fn) {
  if (typeof CEX_ACQUIRE_LOCK === "function" && !CEX_ACQUIRE_LOCK("KRAKEN")) throw new Error("BUSY : sync Kraken en cours, diagnostic non lance (aucun appel)");
  try { return fn(); }
  finally { if (typeof CEX_RELEASE_LOCK === "function") CEX_RELEASE_LOCK("KRAKEN"); }
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
  if (!Array.isArray(rows) || rows.length > KRAKEN_LOCAL_LIMITS.ROWS) throw _krakenLimitFail_();
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
  var data;
  try {
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (!resp || resp.getResponseCode() !== 200) throw new Error("PUBLIC_PRICES_UNAVAILABLE");
    data = JSON.parse(resp.getContentText() || "{}");
    // Kraken peut fournir des prix partiels valides avec Unknown asset pair :
    // conserver ces seuls prix, sans propager le tableau d'erreurs distant.
    if (!data || !data.result || typeof data.result !== "object") throw new Error("PUBLIC_PRICES_INVALID");
    var result = data && data.result ? data.result : {};
    _krakenBoundedKeys_(result, KRAKEN_LOCAL_LIMITS.ROWS);
    for (var key in result) {
      if (!Object.prototype.hasOwnProperty.call(result, key)) continue;
      var ticker = result[key];
      var priceUsd = _krakenParseAmount_(ticker && ticker.c && ticker.c[0]);
      var slash = String(key).indexOf("/");
      var display = _krakenDisplayStockSymbol_(slash >= 0 ? String(key).slice(0, slash) : key);
      if (display && priceUsd > 0) out[display.toUpperCase()] = priceUsd;
    }
    return out;
  } catch (ePrice) { throw _krakenFail_("PUBLIC_PRICE", "Kraken prix xStocks UNKNOWN (prix publics indisponibles)"); }
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

// H:Q appartient exclusivement à cette projection ; A:G reste au writer commun.
var KRAKEN_STOCKS_PROJECTION_MAX_AGE_MS = 900000;
// Âge maximal (minutes) d'un snapshot OK pour que Details affiche Libre/Lock.
var KRAKEN_STOCKS_DETAILS_MAX_AGE_MIN = 90;

function _krakenStocksDetailsFormulas_(row) {
  if (!Number.isSafeInteger(row) || row < 2 || row > 10000000) throw new Error("Ligne Details invalide");
  var sheet = "'" + KRAKEN_SYNC_CONFIG.SHEET_STOCKS + "'!";
  var exact = "EXACT($E" + row + ";\"" + KRAKEN_SYNC_CONFIG.SHEET_STOCKS + "\")";
  var ticker = "EXACT(" + sheet + "$A$3:$A;$F" + row + ")*1";
  var stamp = sheet + "$J$1";
  // Lock connu SEULEMENT si : feuille exacte, I1="OK", J1 = date numérique écrite par la
  // projection, ni future ni plus vieille que 90 min (cadence horaire + gigue). Sinon ""
  // (inconnu) : jamais 0, jamais tout le détenu présenté comme libre. ISNUMBER est testé
  // dans un IF séparé : AND évalue tous ses arguments et NOW()-texte lèverait #VALUE!.
  var age = "NOW()-" + stamp;
  return {
    H: "=IF(J" + row + "=\"\";\"\";K" + row + "-J" + row + ")",
    J: "=IF(AND(" + exact + ";" + sheet + "$I$1=\"OK\";ISNUMBER(" + stamp + "));IF(AND(" + age + ">=0;" + age + "<=" + KRAKEN_STOCKS_DETAILS_MAX_AGE_MIN + "/1440);SUMPRODUCT(" + ticker + ";" + sheet + "$H$3:$H);\"\");\"\")",
    K: "=SUMPRODUCT(" + exact + "*" + ticker + ";" + sheet + "$B$3:$B)"
  };
}

function _krakenProjectionStatus_(snapshot) {
  if (!snapshot || !snapshot.balance || snapshot.balance.status !== "OK" || !snapshot.orders || snapshot.orders.status !== "OK") return "UNKNOWN";
  var age = Date.now() - Number(snapshot.collectedAt);
  if (!isFinite(age) || age < 0) return "UNKNOWN";
  return age > KRAKEN_STOCKS_PROJECTION_MAX_AGE_MS ? "STALE" : "OK";
}

function _krakenWriteStocksProjection_(sh, snapshot) {
  var status = _krakenProjectionStatus_(snapshot);
  var lastRow = sh.getLastRow();
  var orderRows = [["ticker", "id", "side", "price", "qty", "executed", "remaining", "status", "pair"]];
  if (!Number.isSafeInteger(lastRow) || lastRow < 0 || lastRow > KRAKEN_LOCAL_LIMITS.ROWS) status = "UNKNOWN";
  if (status === "OK") {
    var tickers = Object.keys(snapshot.orders);
    if (tickers.length > KRAKEN_LOCAL_LIMITS.ORDERS + 2) status = "UNKNOWN";
    for (var t = 0; status === "OK" && t < tickers.length; t++) {
      var tickerKey = tickers[t];
      if (tickerKey === "status" || tickerKey.charAt(0) === "_") continue;
      var tickerOrders = snapshot.orders[tickerKey] && snapshot.orders[tickerKey].orders;
      if (!_krakenSafeStockTicker_(tickerKey) || !Array.isArray(tickerOrders) || orderRows.length - 1 + tickerOrders.length > KRAKEN_LOCAL_LIMITS.ORDERS) { status = "UNKNOWN"; break; }
      for (var o = 0; o < tickerOrders.length; o++) {
        var item = tickerOrders[o];
        if (!item || !/^[A-Za-z0-9-]{1,64}$/.test(item.id) || !/^[A-Za-z0-9.]{1,24}\/[A-Za-z0-9.]{1,24}$/.test(item.pair)) { status = "UNKNOWN"; break; }
        orderRows.push([tickerKey, item.id, item.side, item.price === null ? "" : item.price, item.qty, item.executed, item.remaining, item.status, item.pair]);
      }
    }
  }
  if (status !== "OK") {
    sh.getRange(1, 9, 1, 1).setValues([[status]]);
    sh.getRange(1, 13, 1, 1).setValues([["historique non actuel (" + status + ")"]]);
    return status;
  }
  var rows = sh.getRange(1, 1, Math.max(lastRow, 2), 2).getValues();
  var holds = [], seen = {};
  for (var i = 2; i < rows.length; i++) {
    var ticker = rows[i][0];
    var entry = status === "OK" && typeof ticker === "string" && ticker !== "." && snapshot.balance[ticker];
    if (entry && !seen[ticker] && entry.balance === Number(rows[i][1]) && typeof entry.hold_trade === "number") holds.push([entry.hold_trade]);
    else {
      holds.push([""]);
      // Toute ligne de données (xStock OU fiat) sans hold fiable invalide la projection :
      // sinon J (Lock) vaudrait 0 et H (Libre) tout le détenu.
      if (status === "OK" && typeof ticker === "string" && ticker !== "" && ticker !== ".") status = "UNKNOWN";
    }
    seen[ticker] = true;
  }
  if (status !== "OK") {
    // Ordres I2:Q et métadonnées J1:L1 précédents conservés mais explicitement historiques.
    sh.getRange(1, 9, 1, 1).setValues([[status]]);
    sh.getRange(1, 13, 1, 1).setValues([["historique non actuel (" + status + ")"]]);
    return status;
  }
  if (holds.length) sh.getRange(3, 8, holds.length, 1).setValues(holds);
  var clearRows = Math.max(lastRow - 1, orderRows.length);
  var block = [];
  for (var r = 0; r < clearRows; r++) block.push(orderRows[r] || ["", "", "", "", "", "", "", "", ""]);
  sh.getRange(2, 9, block.length, 9).setValues(block);
  // J1 = Date (valeur numérique côté Sheets) : les formules Details en dépendent pour la fraîcheur.
  sh.getRange(1, 9, 1, 5).setValues([["OK", new Date(snapshot.collectedAt), orderRows.length - 1, false, "hold_trade / open orders"]]);
  return "OK";
}

function _krakenWriteSheet_(ss, sheetName, rows, opt_snapshot) {
  if (!Array.isArray(rows) || rows.length > KRAKEN_LOCAL_LIMITS.ROWS) throw _krakenLimitFail_();
  if (sheetName === KRAKEN_SYNC_CONFIG.SHEET_STOCKS) {
    for (var i = 0; i < rows.length; i++) {
      var symbol = rows[i] && rows[i][0];
      if (!_krakenSafeStockTicker_(symbol) && KRAKEN_FIAT_SYMBOLS.indexOf(symbol) < 0) throw _krakenFail_("LOCAL", "Kraken UNKNOWN (ticker Stocks invalide)");
    }
  }
  var sh = ss.getSheetByName(sheetName);
  if (!sh) sh = ss.insertSheet(sheetName);
  if (sh.getMaxColumns() < 7) sh.insertColumnsAfter(sh.getMaxColumns(), 7 - sh.getMaxColumns());
  var isStocks = sheetName === KRAKEN_SYNC_CONFIG.SHEET_STOCKS;
  if (isStocks) {
    if (sh.getMaxColumns() < 17) sh.insertColumnsAfter(sh.getMaxColumns(), 17 - sh.getMaxColumns());
    // Invalidation AVANT le tri/réécriture A:G : aucun hold ancien ne suit un ticker réordonné.
    sh.getRange(1, 9, 1, 1).setValues([["UNKNOWN"]]);
    var lastRow = sh.getLastRow();
    if (!Number.isSafeInteger(lastRow) || lastRow < 0 || lastRow > KRAKEN_LOCAL_LIMITS.ROWS) throw _krakenLimitFail_();
    var oldRows = Math.max(lastRow - 2, 0);
    if (oldRows) sh.getRange(3, 8, oldRows, 1).clearContent();
  }
  var stamp = Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss");
  var pricesUsd = sheetName === KRAKEN_SYNC_CONFIG.SHEET_STOCKS ? _krakenFetchXStockPricesUsd_(rows) : {};
  var dataRows = _krakenBuildValues_(rows, stamp, pricesUsd);
  var values = [[false, stamp, "", ""], ["cryptocoin_symbol", "balance", "source", "updated_at"]].concat(dataRows);
  // v4.15.121: append INFO_TOTAL row.
  _cexComputeAndAppendTotal_(ss, sheetName, dataRows, "kraken", values);
  if (isStocks) _krakenWriteStocksProjection_(sh, opt_snapshot);
  return dataRows.length;
}

function _krakenSharedRecent_(e) {
  if (!e || !e.triggerUid) return false;
  var last = Number(PropertiesService.getScriptProperties().getProperty(KRAKEN_SYNC_CONFIG.SHARED_OK_PROP) || 0);
  return last > 0 && Date.now() >= last && Date.now() - last < KRAKEN_SYNC_CONFIG.SHARED_SKIP_MS;
}

function UPDATE_KRAKEN_SPOT(e) {
  try { HttpCallCounter.setTrigger('UPDATE_KRAKEN_SPOT'); } catch(e){}
  if (typeof CEX_ACQUIRE_LOCK === "function" && !CEX_ACQUIRE_LOCK("KRAKEN")) return "BUSY";
  _KRAKEN_CYCLE_PRIVATE_CALLS = 0;
  try {
    if (_krakenSharedRecent_(e)) return JSON.stringify({ ok: true, skipped: "shared_balance_recent" });
    var ss = SpreadsheetApp.openById(KRAKEN_SYNC_CONFIG.SPREADSHEET_ID);
    // Avant Balance, invalider uniquement la réservation ; aucun solde A:G touché en cas d'échec.
    var stocksSheet = ss.getSheetByName(KRAKEN_SYNC_CONFIG.SHEET_STOCKS);
    if (stocksSheet) stocksSheet.getRange(1, 9, 1, 1).setValues([["UNKNOWN"]]);
    var buckets = _cexRelayFetchWithRetry_(function() { return _krakenFetchBuckets_(_krakenGetCreds_()); }, "KRAKEN");
    var written = _krakenWriteSheet_(ss, KRAKEN_SYNC_CONFIG.SHEET, buckets.crypto);
    var status = { ok: true, ts: new Date().toISOString(), spot: buckets.crypto.length, rows: written };
    // v4.16.43 : le refresh vient d'ecrire l'etat reel, un diagnostic ulterieur doit le lire.
    _krakenInvalidateDiagCache_();
    // v4.16.42: le meme appel Balance alimente aussi l'onglet Stocks (fiat + xStocks),
    // pour eviter un second appel prive par heure avec la meme cle.
    try {
      var stockRows = buckets.fiat.concat(buckets.xstocks);
      status.stocksRows = _krakenWriteSheet_(ss, KRAKEN_SYNC_CONFIG.SHEET_STOCKS, stockRows, buckets.snapshot);
      try { PropertiesService.getScriptProperties().setProperty(KRAKEN_SYNC_CONFIG.SHARED_OK_PROP, String(Date.now())); } catch (eShared) {}
    } catch (eStocks) {
      status.stocksError = _krakenCycleSafeMessage_(String(eStocks && eStocks.message ? eStocks.message : eStocks)).substring(0, 200);
    }
    _krakenSetStatus_(status);
    return JSON.stringify(status);
  } catch (err) {
    var statusErr = { ok: false, ts: new Date().toISOString(), error: _krakenCycleSafeMessage_(String(err)) };
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
      _krakenRecordEvent_(KRAKEN_SYNC_CONFIG.LAST_LOCAL_REFUSAL_PROP, "LOCKOUT_COOLDOWN");
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

// v4.16.43 - helper UNIQUE d installation des triggers Kraken, appele par
// INSTALL_KRAKEN_SYNC_TRIGGER *et* par _wcoreAutoHealCreateManagedTriggers_.
// Sans ce partage, un WCORE_AUTO_HEAL_FORCE recreerait ses propres triggers
// horaires en doublon (deux passages/h au lieu d un).
//
// SEMANTIQUE Apps Script — INTROSPECTEE puis VERIFIEE PAR OBSERVATION.
// PROBE_TRIGGER_API a liste les methodes reelles du builder timeBased() de ce
// runtime : at, after, atDate, everyWeeks, onWeekDay, atHour, nearMinute,
// onMonthDay, everyMinutes, everyHours, everyDays, inTimezone, create.
//
// REGRESSION OBSERVEE 2026-09-30 : everyDays(1).atHour(0).nearMinute(30)
// s interprete comme "UNE FOIS PAR JOUR a 00:30", PAS comme "toutes les 30 min".
// everyDays(1) fixe la PERIODE (1 jour) ; atHour/nearMinute ne precisent que le
// point de declenchement DANS cette periode. Resultat : les 4 triggers n ont
// tire qu'une fois (00:28-00:29) puis plus jamais, PULSE fige 18 h. C est un
// contresens : un trigger CLOCK sans everyXxx() ne s execute qu UNE fois.
//
// CORRECTIF : on revient a everyHours(1), cadence horaire provee en production
// avant le 2026-09-29 (4 triggers/jour d'appels prives). La frequence N est plus
// le rempart contre le lockout : c est le BUDGET (220 appels prives/24 h) et la
// PAUSE post-lockout qui jouent ce role. Le helper reste unique pour que l
// auto-heal ne recree pas ses propres triggers horaires en doublon.
function _krakenInstallCadenceTriggers_() {
  var trs = ScriptApp.getProjectTriggers();
  for (var i = 0; i < trs.length; i++) {
    var fn = trs[i].getHandlerFunction();
    if (fn === "UPDATE_KRAKEN_SPOT" || fn === "UPDATE_KRAKEN_STOCKS_FIAT" || fn === "KRAKEN_REFRESH_WATCHDOG") ScriptApp.deleteTrigger(trs[i]);
  }
  // SPOT horaire. Un SEUL appel Balance ecrit les deux onglets (Crypto + Stocks).
  ScriptApp.newTrigger("UPDATE_KRAKEN_SPOT").timeBased().everyHours(1).create();
  // STOCKS horaire, decale de 15 min : filet de securite. Si SPOT echoue (pause
  // post-lockout, budget epuise), KRAKEN_SHARED_BALANCE_OK_MS n est pas horodate
  // et ce trigger tente sa chance. Sinon il saute (passage partage < 55 min).
  ScriptApp.newTrigger("UPDATE_KRAKEN_STOCKS_FIAT").timeBased().everyHours(1).create();
  return 2;
}

function INSTALL_KRAKEN_SYNC_TRIGGER() {
  var n = _krakenInstallCadenceTriggers_();
  return "Triggers installed (cadence horaire, " + n + " triggers): UPDATE_KRAKEN_SPOT + UPDATE_KRAKEN_STOCKS_FIAT (filet). Le budget 220 appels prives/24 h et la pause post-lockout protigent du ban, PAS la frequence.";
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
  _KRAKEN_CYCLE_PRIVATE_CALLS = 0;
  try {
    if (_krakenSharedRecent_(e)) return JSON.stringify({ ok: true, skipped: "shared_balance_recent" });
    var ss = SpreadsheetApp.openById(KRAKEN_SYNC_CONFIG.SPREADSHEET_ID);
    // Avant Balance, invalider uniquement la réservation ; aucun solde A:G touché en cas d'échec.
    var stocksSheet = ss.getSheetByName(KRAKEN_SYNC_CONFIG.SHEET_STOCKS);
    if (stocksSheet) stocksSheet.getRange(1, 9, 1, 1).setValues([["UNKNOWN"]]);
    var buckets = _cexRelayFetchWithRetry_(function() { return _krakenFetchBuckets_(_krakenGetCreds_()); }, "KRAKEN_STOCKS");
    var rows = buckets.fiat.concat(buckets.xstocks);
    var written = _krakenWriteSheet_(ss, KRAKEN_SYNC_CONFIG.SHEET_STOCKS, rows, buckets.snapshot);
    _krakenWriteSheet_(ss, KRAKEN_SYNC_CONFIG.SHEET, buckets.crypto);
    PropertiesService.getScriptProperties().setProperty(KRAKEN_SYNC_CONFIG.SHARED_OK_PROP, String(Date.now()));
    var status = { ok: true, ts: new Date().toISOString(), fiat: buckets.fiat.length, xstocks: buckets.xstocks.length, rows: written };
    _krakenInvalidateDiagCache_();
    _krakenSetStatus_(status);
    return JSON.stringify(status);
  } catch (err) {
    var statusErr = { ok: false, ts: new Date().toISOString(), error: _krakenCycleSafeMessage_(String(err)) };
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
    var balances = _krakenWithDiagLock_(function() { return _krakenPrivatePost_("/0/private/Balance", {}, _krakenGetCreds_()); });
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
  var used = null;
  try { used = _krakenPrivateCalls24h_(); } catch (eBudget) {}
  var lockoutUntil = _krakenLockoutUntilMs_();
  var now = Date.now();
  var oldest = used && used.length ? Math.min.apply(null, used) : null;
  return JSON.stringify({
    version: KRAKEN_SYNC_VERSION,
    private_calls_24h: used === null ? null : used.length,
    private_budget_max: KRAKEN_SYNC_CONFIG.PRIVATE_BUDGET_MAX,
    budget_remaining: used === null ? null : Math.max(0, KRAKEN_SYNC_CONFIG.PRIVATE_BUDGET_MAX - used.length),
    oldest_call_ms_ago: oldest === null ? null : (now - oldest),
    budget_window_resets_in_min: oldest === null ? null : Math.ceil((oldest + KRAKEN_SYNC_CONFIG.PRIVATE_BUDGET_WINDOW_MS - now) / 60000),
    lastRemoteError: _krakenReadEvent_(KRAKEN_SYNC_CONFIG.LAST_REMOTE_ERROR_PROP),
    lastLocalRefusal: _krakenReadEvent_(KRAKEN_SYNC_CONFIG.LAST_LOCAL_REFUSAL_PROP),
    lastSuccess: _krakenReadEvent_(KRAKEN_SYNC_CONFIG.LAST_SUCCESS_PROP),
    lockout_until_ms: (function() {
      try {
        var until = Number(PropertiesService.getScriptProperties().getProperty(KRAKEN_SYNC_CONFIG.LOCKOUT_UNTIL_PROP));
        return isFinite(until) && until > 0 ? until : null;
      } catch (e) { return null; }
    })(),
    lockout_active: !!lockoutUntil,
    lockout_resume_local: lockoutUntil ? Utilities.formatDate(new Date(lockoutUntil), "Europe/Paris", "yyyy-MM-dd HH:mm:ss") : null,
    lockout_remaining_min: lockoutUntil ? Math.ceil((lockoutUntil - now) / 60000) : 0,
    cadence: "horaire nominale (1 appel prive Balance par cycle partage ; STOCKS en filet, saute si passage partage < 55 min ; hors manuels/diagnostics)",
    projected_calls_per_day: 24,
    next_safe_manual_refresh: used === null ? "UNKNOWN" : lockoutUntil ? "apres " + Utilities.formatDate(new Date(lockoutUntil), "Europe/Paris", "HH:mm") : "maintenant"
  });
}
