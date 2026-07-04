// v4.15.103 - PERMANENT FIX: re-install dead CEX time-based triggers on A1 click (per "triggers présents mais mal autorisés" v4.15.61).
// v4.15.88 - Use shared CEX manual-refresh helpers.
// v4.15.87 - Manual refresh writes visible B1 REQUEST flag for trigger-context safe handoff.
// v4.15.86 - Manual refresh flag falls back to UserProperties when ScriptProperties is full.
// v4.15.85 - B1 = date pure "yyyy-MM-dd HH:mm:ss" (harmonie Recap Portfolio).
// v4.15.80 - Binance sync via relais Railway (Spot + Simple Earn flexible/locked)
// Onglet de sortie: "CEX - Binance" (renomme depuis "Binance Crypto").
//
// Recupere les soldes Binance et les ecrit dans l'onglet "CEX - Binance".
// Cles API stockees dans ScriptProperties, jamais dans la spreadsheet.
//
// Setup (Apps Script editor ou bootstrap):
//   SET_BINANCE_API_KEYS("apiKey", "apiSecret")
// Diagnostic sans ecriture:
//   DIAG_BINANCE_API()
// Mise a jour:
//   UPDATE_BINANCE_SPOT()
// Installation triggers:
//   INSTALL_BINANCE_SYNC_TRIGGER()

var BINANCE_SYNC_VERSION = "4.15.88";

var BINANCE_SYNC_CONFIG = {
  BASE_URL: "https://api.binance.com",
  API_KEY_PROP: "BINANCE_API_KEY",
  API_SECRET_PROP: "BINANCE_API_SECRET",
  RELAY_URL_PROP: "BINANCE_RELAY_URL",
  RELAY_TOKEN_PROP: "BINANCE_RELAY_TOKEN",
  STATUS_PROP: "BINANCE_SYNC_STATUS",
  REFRESH_FLAG_PROP: "BINANCE_REFRESH_REQUESTED",
  SHEET: "CEX - Binance",
  RECV_WINDOW: 60000,
  PAGE_SIZE: 100,
  MAX_PAGES: 50,
  SPREADSHEET_ID: "1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4"
};

// v4.15.79: Binance bloque les IP datacenter Google (HTTP 451). On passe par un
// relais Railway (IP non bloquee) qui signe les requetes. Apps Script n'envoie
// qu'un token; le secret Binance reste dans Railway.
function SET_BINANCE_RELAY(url, token) {
  if (!url || String(url).indexOf("http") !== 0) throw new Error("URL relais invalide");
  if (!token || String(token).length < 20) throw new Error("Token relais invalide");
  var props = PropertiesService.getUserProperties();
  props.setProperty(BINANCE_SYNC_CONFIG.RELAY_URL_PROP, String(url).trim().replace(/\/+$/, ""));
  props.setProperty(BINANCE_SYNC_CONFIG.RELAY_TOKEN_PROP, String(token).trim());
  return "OK: BINANCE_RELAY_URL + BINANCE_RELAY_TOKEN saved (UserProperties)";
}

function _binGetRelay_() {
  var props = PropertiesService.getUserProperties();
  var url = props.getProperty(BINANCE_SYNC_CONFIG.RELAY_URL_PROP);
  var token = props.getProperty(BINANCE_SYNC_CONFIG.RELAY_TOKEN_PROP);
  if (!url || !token) {
    throw new Error("Missing BINANCE_RELAY_URL/BINANCE_RELAY_TOKEN. Run SET_BINANCE_RELAY(url, token)");
  }
  return { url: url, token: token };
}

// Recupere les buckets depuis le relais Railway (un seul appel HTTP).
function _binFetchBucketsViaRelay_() {
  var relay = _binGetRelay_();
  var url = relay.url + "/binance?token=" + encodeURIComponent(relay.token);
  var resp = UrlFetchApp.fetch(url, { method: "get", muteHttpExceptions: true });
  if (!resp) throw new Error("Binance relay HTTP blocked/null response");
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error("Relay HTTP " + code + ": " + text.substring(0, 300));
  }
  var data = JSON.parse(text);
  if (!data || !data.ok) {
    throw new Error("Relay error: " + (data && data.error ? data.error : "unknown").toString().substring(0, 300));
  }
  function norm(list) {
    var out = [];
    var arr = list || [];
    for (var i = 0; i < arr.length; i++) {
      var sym = String(arr[i][0] || "").trim().toUpperCase();
      var amt = _binParseAmount_(arr[i][1]);
      if (sym && amt > 0) out.push([sym, amt]);
    }
    return out;
  }
  return {
    spot: norm(data.spot),
    "earn-flexible": norm(data["earn-flexible"]),
    "earn-locked": norm(data["earn-locked"])
  };
}

// v4.15.78: les cles Binance sont stockees dans UserProperties (quota 500KB
// dedie, distinct de ScriptProperties qui est sature par GLOBAL_WALLET_CACHE_V1).
function SET_BINANCE_API_KEYS(apiKey, apiSecret) {
  if (!apiKey || String(apiKey).length < 20) throw new Error("API key invalide ou trop courte");
  if (!apiSecret || String(apiSecret).length < 20) throw new Error("API secret invalide ou trop court");
  var props = PropertiesService.getUserProperties();
  props.setProperty(BINANCE_SYNC_CONFIG.API_KEY_PROP, String(apiKey).trim());
  props.setProperty(BINANCE_SYNC_CONFIG.API_SECRET_PROP, String(apiSecret).trim());
  return "OK: BINANCE_API_KEY + BINANCE_API_SECRET saved (UserProperties)";
}

function CLEAR_BINANCE_API_KEYS() {
  var props = PropertiesService.getUserProperties();
  props.deleteProperty(BINANCE_SYNC_CONFIG.API_KEY_PROP);
  props.deleteProperty(BINANCE_SYNC_CONFIG.API_SECRET_PROP);
  return "OK: Binance API keys cleared";
}

function _binGetCreds_() {
  // Lecture UserProperties (stockage actuel) avec repli ScriptProperties pour
  // compat si des cles y avaient ete posees historiquement.
  var up = PropertiesService.getUserProperties();
  var key = up.getProperty(BINANCE_SYNC_CONFIG.API_KEY_PROP);
  var secret = up.getProperty(BINANCE_SYNC_CONFIG.API_SECRET_PROP);
  if (!key || !secret) {
    var sp = PropertiesService.getScriptProperties();
    key = key || sp.getProperty(BINANCE_SYNC_CONFIG.API_KEY_PROP);
    secret = secret || sp.getProperty(BINANCE_SYNC_CONFIG.API_SECRET_PROP);
  }
  if (!key || !secret) {
    throw new Error("Missing BINANCE_API_KEY/BINANCE_API_SECRET. Run SET_BINANCE_API_KEYS(...)");
  }
  return { key: key, secret: secret };
}

function _binSetStatus_(status) {
  try {
    PropertiesService.getScriptProperties().setProperty(
      BINANCE_SYNC_CONFIG.STATUS_PROP, JSON.stringify(status)
    );
  } catch (err) {
    Logger.log("BINANCE_SYNC_STATUS skipped: " + err);
  }
}

function BINANCE_SYNC_STATUS() {
  return PropertiesService.getScriptProperties().getProperty(BINANCE_SYNC_CONFIG.STATUS_PROP) || "NO_STATUS";
}

function _binSign_(queryString, secret) {
  var raw = Utilities.computeHmacSha256Signature(queryString, secret);
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

// GET signe. params = objet de parametres (hors timestamp/signature).
function _binSignedGet_(path, params, creds) {
  params = params || {};
  params.timestamp = Date.now();
  params.recvWindow = BINANCE_SYNC_CONFIG.RECV_WINDOW;
  var qs = [];
  for (var k in params) {
    if (Object.prototype.hasOwnProperty.call(params, k)) {
      qs.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k]));
    }
  }
  var queryString = qs.join("&");
  var signature = _binSign_(queryString, creds.secret);
  var url = BINANCE_SYNC_CONFIG.BASE_URL + path + "?" + queryString + "&signature=" + signature;
  var resp = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
    headers: { "X-MBX-APIKEY": creds.key }
  });
  if (!resp) throw new Error("Binance " + path + " HTTP blocked/null response");
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code === 451 || code === 403) {
    throw new Error("Binance IP/geo blocked (HTTP " + code + "): " + text.substring(0, 200));
  }
  if (code < 200 || code >= 300) {
    throw new Error("Binance " + path + " HTTP " + code + ": " + text.substring(0, 300));
  }
  return JSON.parse(text);
}

function _binParseAmount_(value) {
  var n = Number(String(value == null ? "0" : value).replace(",", "."));
  return isFinite(n) ? n : 0;
}

// Ajoute/cumule un (symbole, montant) dans une liste de lignes d'un meme bucket
// source. Cumule seulement les doublons EXACTS de la meme source (defensif).
function _binPushRow_(rows, seen, symbol, amount) {
  var s = String(symbol || "").trim().toUpperCase();
  if (!s) return;
  var amt = _binParseAmount_(amount);
  if (Object.prototype.hasOwnProperty.call(seen, s)) {
    rows[seen[s]][1] = _binParseAmount_(rows[seen[s]][1]) + amt;
    return;
  }
  seen[s] = rows.length;
  rows.push([s, amt]);
}

function _binFetchSpot_(creds) {
  var rows = [], seen = {};
  var acc = _binSignedGet_("/api/v3/account", {}, creds);
  var balances = (acc && acc.balances) || [];
  for (var i = 0; i < balances.length; i++) {
    var b = balances[i];
    var total = _binParseAmount_(b.free) + _binParseAmount_(b.locked);
    if (total > 0) _binPushRow_(rows, seen, b.asset, total);
  }
  return rows;
}

// Pagine /sapi/v1/simple-earn/{kind}/position. amountKey = champ du montant.
function _binFetchEarn_(creds, kind, amountKey) {
  var rows = [], seen = {};
  var page = 1;
  while (page <= BINANCE_SYNC_CONFIG.MAX_PAGES) {
    var data = _binSignedGet_(
      "/sapi/v1/simple-earn/" + kind + "/position",
      { current: page, size: BINANCE_SYNC_CONFIG.PAGE_SIZE },
      creds
    );
    var list = (data && data.rows) || [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var amt = _binParseAmount_(r[amountKey]);
      if (amt > 0) _binPushRow_(rows, seen, r.asset, amt);
    }
    var total = data && typeof data.total !== "undefined" ? Number(data.total) : list.length;
    if (list.length < BINANCE_SYNC_CONFIG.PAGE_SIZE) break;
    if (page * BINANCE_SYNC_CONFIG.PAGE_SIZE >= total) break;
    page++;
  }
  return rows;
}

// v4.15.79: passe par le relais Railway (les fetchers directs _binFetchSpot_/
// _binFetchEarn_ restent presents mais inutilises car Binance bloque l'IP GAS).
function _binFetchBuckets_(creds) {
  return _binFetchBucketsViaRelay_();
}

function DIAG_BINANCE_API() {
  try {
    var buckets = _binFetchBucketsViaRelay_();
    var msg = [
      "Binance API diag " + BINANCE_SYNC_VERSION,
      "spot=" + buckets.spot.length,
      "earn-flexible=" + buckets["earn-flexible"].length,
      "earn-locked=" + buckets["earn-locked"].length,
      "spot sample=" + JSON.stringify(buckets.spot.slice(0, 8)),
      "earn-flexible sample=" + JSON.stringify(buckets["earn-flexible"].slice(0, 8)),
      "earn-locked sample=" + JSON.stringify(buckets["earn-locked"].slice(0, 8))
    ].join("\n");
    Logger.log(msg);
    return msg;
  } catch (err) {
    var m = "Binance API diag ERROR: " + (err && err.message ? err.message : err);
    Logger.log(m);
    return m;
  }
}

function _binFormatStamp_(stamp) {
  return "Refresh Binance API. Last updated " + stamp + " via Apps Script binance-api";
}

function SETUP_BINANCE_SHEET() {
  var ss = SpreadsheetApp.openById(BINANCE_SYNC_CONFIG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(BINANCE_SYNC_CONFIG.SHEET);
  if (!sh) sh = ss.insertSheet(BINANCE_SYNC_CONFIG.SHEET);
  sh.getRange("A1").insertCheckboxes().setValue(false);
  // v4.15.82: B1 = date pure "yyyy-MM-dd HH:mm:ss" (harmonie avec onglets on-chain Recap).
  sh.getRange("B1").setValue(
    Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss")
  ).setNumberFormat("@");
  sh.getRange(2, 1, 1, 4).setValues([["cryptocoin_symbol", "balance", "source", "updated_at"]]);
  return "OK_BINANCE_SHEET_READY";
}

// buckets = { spot:[...], "earn-flexible":[...], "earn-locked":[...] }
function _binBuildValues_(buckets, stamp) {
  var values = [];
  var order = ["spot", "earn-flexible", "earn-locked"];
  for (var o = 0; o < order.length; o++) {
    var src = order[o];
    var list = buckets[src] || [];
    for (var i = 0; i < list.length; i++) {
      values.push([list[i][0], _binParseAmount_(list[i][1]), src, stamp]);
    }
  }
  return values;
}

function _binWriteSheet_(ss, buckets) {
  var sh = ss.getSheetByName(BINANCE_SYNC_CONFIG.SHEET);
  if (!sh) sh = ss.insertSheet(BINANCE_SYNC_CONFIG.SHEET);
  // v4.15.82: B1 = date pure "yyyy-MM-dd HH:mm:ss" (harmonie avec onglets on-chain Recap).
  var stamp = Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss");
  var header = [];
  header.push([false, stamp, "", ""]);
  header.push(["cryptocoin_symbol", "balance", "source", "updated_at"]);
  var dataRows = _binBuildValues_(buckets, stamp);
  var values = header.concat(dataRows);
  // v4.15.120: clear only data columns A:D so the user-managed "Vérif" column (E) survives syncs.
  var _clearRows = Math.max(values.length, Math.min(sh.getMaxRows(), values.length));
  sh.getRange(1, 1, _clearRows, 4).clearContent();
  sh.getRange(1, 1, values.length, 4).setValues(values);
  sh.getRange("A1").insertCheckboxes().setValue(false);
  sh.getRange("B1:D1").setNumberFormat("@");
  if (values.length > 2) sh.getRange(3, 2, values.length - 2, 1).setNumberFormat("0.########");
  // v4.15.121: append INFO_TOTAL row.
  try { _cexComputeAndAppendTotal_(ss, BINANCE_SYNC_CONFIG.SHEET, dataRows, "binance"); } catch (eTot) { Logger.log("[CEX_TOTAL] binance append failed: " + eTot); }
  return dataRows.length;
}

function UPDATE_BINANCE_SPOT() {
  // v4.15.109: per-connector lock instead of shared global ScriptLock.
  if (typeof CEX_ACQUIRE_LOCK === "function" && !CEX_ACQUIRE_LOCK("BINANCE")) return "BUSY";
  try {
    var ss = SpreadsheetApp.openById(BINANCE_SYNC_CONFIG.SPREADSHEET_ID);
    var buckets = _binFetchBucketsViaRelay_();
    var written = _binWriteSheet_(ss, buckets);
    var status = {
      ok: true,
      ts: new Date().toISOString(),
      spot: buckets.spot.length,
      "earn-flexible": buckets["earn-flexible"].length,
      "earn-locked": buckets["earn-locked"].length,
      rows: written
    };
    _binSetStatus_(status);
    return JSON.stringify(status);
  } catch (err) {
    var statusErr = { ok: false, ts: new Date().toISOString(), error: String(err) };
    _binSetStatus_(statusErr);
    Logger.log("UPDATE_BINANCE_SPOT ERROR: " + err);
    return JSON.stringify(statusErr);
  } finally {
    if (typeof CEX_RELEASE_LOCK === "function") CEX_RELEASE_LOCK("BINANCE");
  }
}

function BINANCE_ON_EDIT(e) {
  try {
    if (!e || !e.range) return false;
    var range = e.range;
    var cell = range.getA1Notation ? range.getA1Notation() : "";
    if (cell !== "A1") return false;
    var sheet = range.getSheet ? range.getSheet() : null;
    if (!sheet || sheet.getName() !== BINANCE_SYNC_CONFIG.SHEET) return false;
    var v = (typeof e.value !== "undefined") ? e.value : range.getValue();
    if (String(v).toUpperCase() !== "TRUE") return true;
    if (!e.triggerUid) {
      try { range.setValue(false); } catch (eResetSimple) {}
      return true;
    }
    try { range.setValue(false); } catch (eResetEarly) {}
    if (typeof CEX_QUEUE_OR_MARK_MANUAL_JOB === "function") CEX_QUEUE_OR_MARK_MANUAL_JOB(sheet, BINANCE_SYNC_CONFIG.REFRESH_FLAG_PROP, "BINANCE", UPDATE_BINANCE_SPOT, e);
    else if (typeof CEX_RUN_DIRECT_OR_QUEUE === "function") CEX_RUN_DIRECT_OR_QUEUE(sheet, BINANCE_SYNC_CONFIG.REFRESH_FLAG_PROP, "BINANCE", UPDATE_BINANCE_SPOT, e);
    else if (typeof CEX_SET_MANUAL_REQUEST === "function") CEX_SET_MANUAL_REQUEST(sheet, BINANCE_SYNC_CONFIG.REFRESH_FLAG_PROP);
    else {
      _binSetRefreshFlag_();
      try { sheet.getRange("B1").setValue("REQUEST: " + Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss")).setNumberFormat("@"); } catch (eB1) {}
    }
    return true;
  } catch (err) {
    try { Logger.log("[BINANCE_ON_EDIT] " + (err && err.message ? err.message : err)); } catch (eLog) {}
    try { if (e && e.range) e.range.setValue(false); } catch (eReset) {}
    return true;
  }
}

function _binSetRefreshFlag_() {
  var value = String(Date.now());
  try {
    PropertiesService.getScriptProperties().setProperty(BINANCE_SYNC_CONFIG.REFRESH_FLAG_PROP, value);
    return "SCRIPT";
  } catch (eScript) {
    PropertiesService.getUserProperties().setProperty(BINANCE_SYNC_CONFIG.REFRESH_FLAG_PROP, value);
    return "USER";
  }
}

function BINANCE_REFRESH_WATCHDOG() {
  return "LEGACY_DISABLED: central BITPANDA_REFRESH_WATCHDOG handles CEX requests";
}

function BINANCE_TRIGGER_STATUS() {
  var trs = ScriptApp.getProjectTriggers();
  var hourly = 0, watchdog = 0;
  for (var i = 0; i < trs.length; i++) {
    var fn = trs[i].getHandlerFunction();
    if (fn === "UPDATE_BINANCE_SPOT") hourly++;
    else if (fn === "BINANCE_REFRESH_WATCHDOG") watchdog++;
  }
  return "hourly=" + hourly + " refreshWatchdog=" + watchdog;
}

function INSTALL_BINANCE_SYNC_TRIGGER() {
  var trs = ScriptApp.getProjectTriggers();
  for (var i = 0; i < trs.length; i++) {
    var fn = trs[i].getHandlerFunction();
    if (fn === "UPDATE_BINANCE_SPOT" || fn === "BINANCE_REFRESH_WATCHDOG") ScriptApp.deleteTrigger(trs[i]);
  }
  ScriptApp.newTrigger("UPDATE_BINANCE_SPOT").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("BINANCE_REFRESH_WATCHDOG").timeBased().everyMinutes(1).create();
  return "Triggers installed: UPDATE_BINANCE_SPOT (1h) + BINANCE_REFRESH_WATCHDOG (1min)";
}
