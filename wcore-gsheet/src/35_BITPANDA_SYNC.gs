// v4.15.103 - Self-heal: re-install dead BITPANDA_REFRESH_WATCHDOG/CEX_HOURLY_REFRESH on user CEX edit (per "triggers présents mais mal autorisés" gotcha, v4.15.61).
// v4.15.93 - External refresh checkboxes must not write REQUEST into business B1 cells.
// v4.15.92 - On BUSY, prefer fresh row timestamp over keeping REQUEST in B1.
// v4.15.91 - Do not let a concurrent BUSY overwrite a successful B1 timestamp.
// v4.15.90 - Keep CEX manual request pending on BUSY so next watchdog retries.
// v4.15.89 - Add shared CEX manual-refresh helpers used by all CEX connectors.
// v4.15.88 - CEX watchdog writes visible B1 error/busy diagnostics when a manual refresh fails.
// v4.15.87 - Manual CEX refresh uses visible B1 REQUEST flag (Properties are unreliable across trigger contexts).
// v4.15.86 - CEX central watchdog handles Binance/Bitfinex/Bybit flags; UserProperties fallback when ScriptProperties is full.
// v4.15.85 - B1 = date pure "yyyy-MM-dd HH:mm:ss" (harmonie Recap Portfolio).
// v4.15.84 - Bitpanda API sync replacement for SyncWith imports
//
// Objectif: remplacer progressivement SyncWith pour les onglets Bitpanda.
// API keys stockees dans ScriptProperties, jamais dans la spreadsheet.
//
// Setup manuel (Apps Script editor):
//   SET_BITPANDA_API_KEY("...")
//
// Diagnostic sans ecriture:
//   DIAG_BITPANDA_API()
//
// Mise a jour:
//   UPDATE_BITPANDA_SPOT()

var BITPANDA_SYNC_VERSION = "4.15.93";

var BITPANDA_SYNC_CONFIG = {
  BASE_URL: "https://api.bitpanda.com/v1",
  API_KEY_PROP: "BITPANDA_API_KEY",
  STATUS_PROP: "BITPANDA_SYNC_STATUS",
  REFRESH_FLAG_PROP: "BITPANDA_REFRESH_REQUESTED",
  ACTION_REBALANCING_REFRESH_FLAG_PROP: "BITPANDA_ACTION_REBALANCING_REFRESH_REQUESTED",
  CRYPTO_CEX_REFRESH_FLAG_PROP: "CRYPTO_CEX_REFRESH_REQUESTED",
  SPREADSHEET_ID: "1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4",
  SHEETS: {
    CRYPTO: "CEX - Bitpanda Crypto",
    COMMODITY: "CEX - Bitpanda Commodity",
    FIAT: "CEX - Bitpanda Fiat",
    STOCKS: "CEX - Bitpanda Stocks"
    // v4.15.68: l'onglet "Bitpanda Spot Action" a ete supprime. Le bucket action
    // de l'API est desormais fusionne dans STOCKS (voir UPDATE_BITPANDA_SPOT).
  }
};

function SET_BITPANDA_API_KEY(apiKey) {
  if (!apiKey || String(apiKey).length < 20) throw new Error("API key invalide ou trop courte");
  PropertiesService.getScriptProperties().setProperty(BITPANDA_SYNC_CONFIG.API_KEY_PROP, String(apiKey).trim());
  return "OK: BITPANDA_API_KEY saved";
}

function CLEAR_BITPANDA_API_KEYS() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(BITPANDA_SYNC_CONFIG.API_KEY_PROP);
  return "OK: Bitpanda API keys cleared";
}

function _bpGetApiKey_(propName, required) {
  var key = PropertiesService.getScriptProperties().getProperty(propName);
  if (!key && required) throw new Error("Missing ScriptProperty " + propName + ". Run SET_BITPANDA_API_KEY(...)");
  return key;
}

function _bpFetch_(path, apiKey) {
  var url = BITPANDA_SYNC_CONFIG.BASE_URL + path;
  var resp = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
    headers: { "X-Api-Key": apiKey, "Accept": "application/json" }
  });
  if (!resp) throw new Error("Bitpanda " + path + " HTTP blocked/null response");
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error("Bitpanda " + path + " HTTP " + code + ": " + text.substring(0, 300));
  }
  return JSON.parse(text);
}

function _bpSetStatus_(status) {
  try {
    PropertiesService.getScriptProperties().setProperty(BITPANDA_SYNC_CONFIG.STATUS_PROP, JSON.stringify(status));
  } catch (err) {
    Logger.log("BITPANDA_SYNC_STATUS skipped: " + err);
  }
}

function _bpSetRefreshFlag_(propName) {
  var value = String(Date.now());
  try {
    PropertiesService.getScriptProperties().setProperty(propName, value);
    return "SCRIPT";
  } catch (eScript) {
    PropertiesService.getUserProperties().setProperty(propName, value);
    return "USER";
  }
}

function _bpGetRefreshFlag_(propName) {
  var scriptFlag = "";
  var userFlag = "";
  try { scriptFlag = PropertiesService.getScriptProperties().getProperty(propName) || ""; } catch (eScript) {}
  try { userFlag = PropertiesService.getUserProperties().getProperty(propName) || ""; } catch (eUser) {}
  return scriptFlag || userFlag;
}

function _bpDeleteRefreshFlag_(propName) {
  try { PropertiesService.getScriptProperties().deleteProperty(propName); } catch (eScript) {}
  try { PropertiesService.getUserProperties().deleteProperty(propName); } catch (eUser) {}
}

function _bpFmtStamp_() {
  return Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss");
}

function _bpSetSheetRequestFlag_(sheet) {
  try { sheet.getRange("B1").setValue("REQUEST: " + _bpFmtStamp_()).setNumberFormat("@"); } catch (e) {}
}

function _bpGetSpreadsheet_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (eActive) {}
  if (!ss) ss = SpreadsheetApp.openById(BITPANDA_SYNC_CONFIG.SPREADSHEET_ID);
  return ss;
}

function _bpSheetHasRequest_(ss, sheetName) {
  try {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return false;
    return String(sh.getRange("B1").getDisplayValue() || "").indexOf("REQUEST:") === 0;
  } catch (e) {
    return false;
  }
}

function _bpSetSheetStatus_(ss, sheetName, status) {
  try {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return;
    sh.getRange("B1").setValue(String(status || "").substring(0, 500)).setNumberFormat("@");
  } catch (e) {}
}

function _bpExtractStampText_(value) {
  var m = String(value || "").match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?/);
  return m ? m[0] : "";
}

function _bpGetSheetCellText_(ss, sheetName, a1) {
  try {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return "";
    return String(sh.getRange(a1).getDisplayValue() || "");
  } catch (e) {
    return "";
  }
}

function _bpRunManualCexUpdate_(ss, sheetName, label, updateFn) {
  var result = "";
  try {
    result = String(updateFn());
  } catch (err) {
    result = "THREW: " + (err && err.message ? err.message : err);
  }
  if (result === "BUSY") {
    var reqStamp = _bpExtractStampText_(_bpGetSheetCellText_(ss, sheetName, "B1"));
    var rowStamp = _bpExtractStampText_(_bpGetSheetCellText_(ss, sheetName, "D3"));
    if (rowStamp && (!reqStamp || rowStamp.substring(0, 16) >= reqStamp.substring(0, 16))) {
      _bpSetSheetStatus_(ss, sheetName, rowStamp);
    } else if (_bpSheetHasRequest_(ss, sheetName)) {
      _bpSetSheetStatus_(ss, sheetName, "REQUEST: BUSY retry " + _bpFmtStamp_());
    }
  } else if (result.indexOf('"ok":false') >= 0 || result.indexOf("THREW:") === 0) {
    _bpSetSheetStatus_(ss, sheetName, label + " ERROR: " + result);
  }
  return result;
}

function CEX_SET_MANUAL_REQUEST(sheet, refreshFlagProp) {
  if (refreshFlagProp) _bpSetRefreshFlag_(refreshFlagProp);
  if (sheet) _bpSetSheetRequestFlag_(sheet);
  return true;
}

function CEX_GET_SPREADSHEET() {
  return _bpGetSpreadsheet_();
}

function CEX_HAS_MANUAL_REQUEST(ss, sheetName, refreshFlagProp) {
  return (refreshFlagProp && _bpGetRefreshFlag_(refreshFlagProp)) || (ss && _bpSheetHasRequest_(ss, sheetName));
}

function CEX_CLEAR_MANUAL_REQUEST(refreshFlagProp) {
  if (refreshFlagProp) _bpDeleteRefreshFlag_(refreshFlagProp);
}

function CEX_RUN_MANUAL_UPDATE(ss, sheetName, label, updateFn) {
  return _bpRunManualCexUpdate_(ss, sheetName, label, updateFn);
}

function CEX_REFRESH_WATCHDOG() {
  return BITPANDA_REFRESH_WATCHDOG();
}

// NOTE: le staking Bitpanda n'est PAS expose par l'API publique (verifie via la
// doc officielle 2026-06 et l'inspection de /asset-wallets: sections cryptocoin,
// commodity, index, security, equity_security uniquement; /staking* -> 401).
// Le balance /wallets ne reflete que le disponible, pas le montant stake.
// -> le staking doit etre saisi manuellement (voir onglet dedie si configure).

// Confirme 2026-06: un symbole stake/Earn (ex VSN) n'a qu'UNE entree dans
// /wallets et /asset-wallets = le solde disponible. Le montant Earn/stake n'est
// jamais expose par l'API Bitpanda. Diag retire.

function _bpWalletRow_(wallet, symbolKey) {
  var a = (wallet && wallet.attributes) || {};
  var symbol = String(a[symbolKey] || a.cryptocoin_symbol || a.fiat_symbol || a.symbol || "").trim();
  var balance = String(a.balance || "0").trim();
  if (!symbol) return null;
  return [_bpCanonicalSymbol_(symbol), balance];
}

function _bpParseBalance_(value) {
  var n = Number(String(value || "0").replace(",", "."));
  return isFinite(n) ? n : 0;
}

// v4.15.71: Bitpanda expose parfois deux variantes pour une meme action (ex un
// listing US suffixe "-US"/"US" + une entree de base a solde nul). On normalise
// la variante vers le symbole canonique attendu par Action Rebalancing afin de
// cumuler les soldes sur une seule ligne (sinon le VLOOKUP tombe sur la base=0).
var BITPANDA_SYMBOL_ALIASES = {
  // Variantes US suffixees -> ticker de base (la base a un solde nul).
  "AMD-US": "AMD",
  "WMT-US": "WMT",
  "JPM-US": "JPM",
  "LLYC-US": "LLY",
  "MRKUS": "MRK",
  // v4.15.72: doubles tickers Bitpanda (ancien code Bitpanda + ticker boursier
  // tous deux avec solde). On canonise vers UN seul symbole et on cumule, sinon
  // le VLOOKUP d'Action Rebalancing ne capte qu'une des deux lignes.
  "TSFA": "TSM",    // TSMC (TSFA = ancien code Bitpanda)
  "BROA": "AVGO",   // Broadcom (BROA = ancien code Bitpanda)
  "BRK": "BRKB",    // Berkshire Hathaway B (BRK base = 0)
  "SMSN": "SSU",    // Samsung (SMSN base = 0; SSU = receipt ~25 actions ord.)
  "NOVN": "NVS",    // Novartis (NOVN base = 0)
  "RDSA": "SHEL",   // Shell (ancien code Bitpanda RDSA)
  "TCTZF": "TCEHY"  // Tencent (TCTZF = ancien code Bitpanda)
};

function _bpCanonicalSymbol_(symbol) {
  var s = String(symbol || "").trim();
  var up = s.toUpperCase();
  return BITPANDA_SYMBOL_ALIASES[up] || s;
}

// v4.15.69: agrege par symbole (somme des balances) au lieu de dedupliquer.
// Bitpanda peut renvoyer plusieurs wallets pour un meme symbole (ex: plusieurs
// sous-comptes / lots). On cumule les soldes pour avoir une seule ligne par actif.
function _bpPushUniqueRow_(rows, seen, row) {
  if (!row || !row[0]) return;
  var key = String(row[0]).toUpperCase();
  var add = _bpParseBalance_(row[1]);
  if (Object.prototype.hasOwnProperty.call(seen, key)) {
    var idx = seen[key];
    rows[idx][1] = _bpParseBalance_(rows[idx][1]) + add;
    return;
  }
  seen[key] = rows.length;
  // conserve les colonnes additionnelles eventuelles (ex: unknown path)
  var copy = row.slice();
  copy[1] = add;
  rows.push(copy);
}

function _bpMergeBuckets_(primary, secondary) {
  var out = [];
  var seen = {};
  function add(list) {
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (!row || !row[0]) continue;
      _bpPushUniqueRow_(out, seen, row);
    }
  }
  add(primary);
  add(secondary);
  return out;
}

function _bpIsManagedSheet_(sheetName) {
  var sheets = BITPANDA_SYNC_CONFIG.SHEETS;
  for (var k in sheets) {
    if (Object.prototype.hasOwnProperty.call(sheets, k) && sheets[k] === sheetName) return true;
  }
  return false;
}

function _bpFormatStamp_(stamp, sourceLabel) {
  return "Refresh Bitpanda API. Last updated " + stamp + " via Apps Script " + sourceLabel;
}

function _bpWalkAssetWallets_(node, path, buckets, seen) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) _bpWalkAssetWallets_(node[i], path, buckets, seen);
    return;
  }
  if (typeof node !== "object") return;

  if (node.type === "wallet" && node.attributes) {
    var p = path.join(".").toLowerCase();
    var row = _bpWalletRow_(node, "cryptocoin_symbol");
    if (!row) return;
    if (p.indexOf("commodity") >= 0 || p.indexOf("metal") >= 0) _bpPushUniqueRow_(buckets.commodity, seen.commodity, row);
    else if (p.indexOf("action") >= 0) _bpPushUniqueRow_(buckets.action, seen.action, row);
    else if (p.indexOf("stock") >= 0 || p.indexOf("equity") >= 0 || p.indexOf("security") >= 0 || p.indexOf("etf") >= 0 || p.indexOf("index") >= 0) _bpPushUniqueRow_(buckets.stocks, seen.stocks, row);
    // v4.15.77: NE PAS re-ajouter les wallets crypto d'/asset-wallets: ils
    // doublonnent /wallets (deja charge), ce qui doublait les soldes crypto.
    else if (p.indexOf("crypto") >= 0 || p.indexOf("coin") >= 0) { /* skip: deja couvert par /wallets */ }
    else _bpPushUniqueRow_(buckets.unknown, seen.unknown, row.concat([p]));
    return;
  }

  for (var k in node) {
    if (Object.prototype.hasOwnProperty.call(node, k)) _bpWalkAssetWallets_(node[k], path.concat([k]), buckets, seen);
  }
}

// v4.15.73: certains produits cash (ex "BCPEUR" = Bitpanda Cash Plus EUR) sont
// renvoyes par /asset-wallets et classes a tort en stocks. On les reclasse vers
// le bucket fiat sous leur devise canonique, en cumulant sur la ligne existante.
var BITPANDA_CASH_LIKE = {
  "BCPEUR": "EUR"
};

function _bpReclassifyCashLike_(buckets) {
  var moved = [];
  var keptStocks = [];
  for (var i = 0; i < buckets.stocks.length; i++) {
    var row = buckets.stocks[i];
    var sym = String((row && row[0]) || "").toUpperCase();
    if (Object.prototype.hasOwnProperty.call(BITPANDA_CASH_LIKE, sym)) {
      moved.push([BITPANDA_CASH_LIKE[sym], _bpParseBalance_(row[1])]);
    } else {
      keptStocks.push(row);
    }
  }
  if (!moved.length) return;
  buckets.stocks = keptStocks;
  // Re-agrege le bucket fiat avec les montants deplaces (cumul par devise).
  var fiatSeen = {};
  var fiatOut = [];
  for (var f = 0; f < buckets.fiat.length; f++) _bpPushUniqueRow_(fiatOut, fiatSeen, buckets.fiat[f]);
  for (var m = 0; m < moved.length; m++) _bpPushUniqueRow_(fiatOut, fiatSeen, moved[m]);
  buckets.fiat = fiatOut;
}

function _bpFetchBuckets_(apiKey) {
  var buckets = { crypto: [], commodity: [], fiat: [], stocks: [], action: [], unknown: [] };
  var seen = { crypto: {}, commodity: {}, fiat: {}, stocks: {}, action: {}, unknown: {} };

  var wallets = _bpFetch_("/wallets", apiKey);
  var cryptoData = wallets.data || [];
  for (var i = 0; i < cryptoData.length; i++) _bpPushUniqueRow_(buckets.crypto, seen.crypto, _bpWalletRow_(cryptoData[i], "cryptocoin_symbol"));

  var fiat = _bpFetch_("/fiatwallets", apiKey);
  var fiatData = fiat.data || [];
  for (var f = 0; f < fiatData.length; f++) _bpPushUniqueRow_(buckets.fiat, seen.fiat, _bpWalletRow_(fiatData[f], "fiat_symbol"));

  // /asset-wallets contient les commodities et, selon le compte, peut aussi contenir stocks/ETFs.
  var assets = _bpFetch_("/asset-wallets", apiKey);
  _bpWalkAssetWallets_(assets.data, [], buckets, seen);

  _bpReclassifyCashLike_(buckets);

  return buckets;
}

function _bpWriteRows_(ss, sheetName, rows, sourceLabel) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error("Sheet missing: " + sheetName);
  // v4.15.82: B1 = date pure "yyyy-MM-dd HH:mm:ss" (harmonie avec onglets on-chain Recap).
  var stamp = Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss");
  var values = [];
  values.push([false, stamp, "", ""]);
  values.push(["cryptocoin_symbol", "balance", "source", "updated_at"]);
  for (var i = 0; i < rows.length; i++) values.push([rows[i][0], _bpParseBalance_(rows[i][1]), sourceLabel, stamp]);
  sh.getRange(1, 1, Math.max(sh.getLastRow(), 2), Math.max(sh.getLastColumn(), 4)).clearContent();
  sh.getRange(1, 1, values.length, 4).setValues(values);
  sh.getRange("A1").insertCheckboxes().setValue(false);
  sh.getRange("B1:D1").setNumberFormat("@");
  if (values.length > 2) sh.getRange(3, 2, values.length - 2, 1).setNumberFormat("0.########");
}

// v4.15.81: cellules de refresh manuel hors onglets Bitpanda.
// Z1 = Action Rebalancing (v4.15.100: Top Marketcap puis Stocks + Fiat).
// Portefeuille Crypto!AC2 = Crypto CEX (Bitpanda Crypto/Fiat + Binance + Bitfinex).
var BITPANDA_REFRESH_CELLS = {
  "Action Rebalancing": {
    "Z1": BITPANDA_SYNC_CONFIG.ACTION_REBALANCING_REFRESH_FLAG_PROP
  },
  "Portefeuille Crypto": {
    "AC2": BITPANDA_SYNC_CONFIG.CRYPTO_CEX_REFRESH_FLAG_PROP
  }
};

function BITPANDA_ON_EDIT(e) {
  try {
    if (!e || !e.range) return false;
    var range = e.range;
    var cell = range.getA1Notation ? range.getA1Notation() : "";
    var sheet = range.getSheet ? range.getSheet() : null;
    if (!sheet) return false;
    var name = sheet.getName();

    var refreshFlagProp = null;
    if (cell === "A1" && _bpIsManagedSheet_(name)) {
      refreshFlagProp = BITPANDA_SYNC_CONFIG.REFRESH_FLAG_PROP;
    } else if (BITPANDA_REFRESH_CELLS[name] && BITPANDA_REFRESH_CELLS[name][cell]) {
      refreshFlagProp = BITPANDA_REFRESH_CELLS[name][cell];
    }
    if (!refreshFlagProp) return false;

    // v4.15.103 PERMANENT FIX: re-install dead CEX time-based triggers.
    // Per AGENTS.md "triggers présents mais mal autorisés" (v4.15.61): after clasp
    // push, the installable trigger can be "present" (count=1) but unable to run with
    // full permissions (stale OAuth). Re-installing from a user-triggered context
    // captures the user's current auth, restoring the CEX pipeline. Any CEX A1
    // click (Bitpanda/Binance/Bitfinex/Bybit) re-authorizes all 4 watchdogs + hourly.
    try { _bpEnsureCexTriggers_(); } catch (eHeal) {}

    var v = (typeof e.value !== "undefined") ? e.value : range.getValue();
    if (String(v).toUpperCase() !== "TRUE") return true;
    // v4.15.76: onEdit SIMPLE ne peut pas appeler UrlFetchApp. On pose un flag que
    // le trigger installable BITPANDA_REFRESH_WATCHDOG traitera (lui peut faire HTTP).
    if (cell === "A1" && _bpIsManagedSheet_(name)) {
      CEX_SET_MANUAL_REQUEST(sheet, refreshFlagProp);
    } else {
      _bpSetRefreshFlag_(refreshFlagProp);
    }
    range.setValue(false);
    return true;
  } catch (err) {
    try { Logger.log("[BITPANDA_ON_EDIT] " + (err && err.message ? err.message : err)); } catch (eLog) {}
    try { if (e && e.range) e.range.setValue(false); } catch (eReset) {}
    return true;
  }
}

// v4.15.103 PERMANENT FIX: self-heal list + helpers.
// Per AGENTS.md "triggers présents mais mal autorisés" (v4.15.61).
// Any CEX A1 click re-installs missing 1-min and 1h CEX triggers with fresh user auth.
var _BP_CEX_TRIGGERS_TO_HEAL = [
  { name: "BITPANDA_REFRESH_WATCHDOG", unit: "minutes", value: 1 },
  { name: "BINANCE_REFRESH_WATCHDOG", unit: "minutes", value: 1 },
  { name: "BITFINEX_REFRESH_WATCHDOG", unit: "minutes", value: 1 },
  { name: "BYBIT_REFRESH_WATCHDOG", unit: "minutes", value: 1 },
  { name: "CEX_HOURLY_REFRESH", unit: "hours", value: 1 }
];

function _bpEnsureCexTriggers_() {
  // v4.15.103 PERMANENT FIX: force re-install (delete+create) to capture fresh user auth.
  // A trigger that is "present" (count=1) but tied to stale OAuth will NOT be reinstalled
  // by a "create-if-missing" check. Always delete+recreate so the new trigger captures
  // the user's current auth context. Per AGENTS.md v4.15.61.
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var j = 0; j < _BP_CEX_TRIGGERS_TO_HEAL.length; j++) {
      var t = _BP_CEX_TRIGGERS_TO_HEAL[j];
      // 1. Delete any existing instance of this trigger (dead or alive, with stale or fresh auth)
      for (var i = triggers.length - 1; i >= 0; i--) {
        try {
          if (triggers[i].getHandlerFunction() === t.name) {
            ScriptApp.deleteTrigger(triggers[i]);
          }
        } catch (eDel) {}
      }
      // 2. Re-install with fresh user auth (captured by the current onEdit invocation)
      try {
        var builder = ScriptApp.newTrigger(t.name).timeBased();
        if (t.unit === "hours") builder = builder.everyHours(t.value);
        else builder = builder.everyMinutes(t.value);
        builder.create();
        try { Logger.log("[bpEnsureCex] Force-reinstalled " + t.name + " every " + t.value + " " + t.unit); } catch (eLog) {}
      } catch (eCreate) {
        try { Logger.log("[bpEnsureCex] Failed to reinstall " + t.name + ": " + (eCreate && eCreate.message ? eCreate.message : eCreate)); } catch (eLog) {}
      }
    }
  } catch (e) {
    try { Logger.log("[bpEnsureCex] Error: " + (e && e.message ? e.message : e)); } catch (eLog) {}
  }
}

function BP_REINSTALL_CEX_TRIGGERS() {
  // User-facing: run this from the Apps Script editor to force a clean re-install
  // of all CEX time-based triggers (captures the current editor auth context).
  _bpEnsureCexTriggers_();
  return "Done. See Executions log for which triggers were reinstalled.";
}

// Trigger INSTALLABLE (peut faire des UrlFetch): traite les flags poses par les
// checkboxes et lance uniquement les refresh necessaires.
function BITPANDA_REFRESH_WATCHDOG() {
  var didWork = false;
  var results = [];
  var ss = null;
  try { ss = _bpGetSpreadsheet_(); } catch (eSs) {}

  var fullFlag = _bpGetRefreshFlag_(BITPANDA_SYNC_CONFIG.REFRESH_FLAG_PROP);
  if (fullFlag) {
    _bpDeleteRefreshFlag_(BITPANDA_SYNC_CONFIG.REFRESH_FLAG_PROP);
    didWork = true;
    results.push("bitpandaFull=" + UPDATE_BITPANDA_SPOT());
  }

  var actionFlag = _bpGetRefreshFlag_(BITPANDA_SYNC_CONFIG.ACTION_REBALANCING_REFRESH_FLAG_PROP);
  if (actionFlag) {
    didWork = true;
    // v4.15.100: Z1 reconstruit d'abord Top Marketcap (Google Finance +
    // Action Rebalancing) pour que rang/structure soient a jour, PUIS rafraichit
    // les soldes Bitpanda Stocks + Fiat.
    // v4.15.101: Delete flag ONLY after successful execution. If UPDATE_TOP_MARKETCAP
    // returns BUSY or fails, the flag survives and will be retried next cycle.
    var tmResult = "SKIPPED_MISSING_UPDATE_TOP_MARKETCAP";
    if (typeof UPDATE_TOP_MARKETCAP === "function") {
      tmResult = String(UPDATE_TOP_MARKETCAP());
      results.push("topMarketcap=" + tmResult);
    } else {
      results.push("topMarketcap=" + tmResult);
    }
    if (tmResult === "BUSY") {
      results.push("topMarketcap=BUSY_FLAG_KEPT_FOR_RETRY");
    } else {
      _bpDeleteRefreshFlag_(BITPANDA_SYNC_CONFIG.ACTION_REBALANCING_REFRESH_FLAG_PROP);
      results.push("bitpandaStocksFiat=" + UPDATE_BITPANDA_STOCKS_FIAT());
    }
  }

  var cryptoCexFlag = _bpGetRefreshFlag_(BITPANDA_SYNC_CONFIG.CRYPTO_CEX_REFRESH_FLAG_PROP);
  if (cryptoCexFlag) {
    _bpDeleteRefreshFlag_(BITPANDA_SYNC_CONFIG.CRYPTO_CEX_REFRESH_FLAG_PROP);
    didWork = true;
    results.push("bitpandaCryptoFiat=" + UPDATE_BITPANDA_CRYPTO_FIAT());
    if (typeof UPDATE_BINANCE_SPOT === "function") {
      results.push("binanceCrypto=" + UPDATE_BINANCE_SPOT());
    } else {
      results.push("binanceCrypto=SKIPPED_MISSING_UPDATE_BINANCE_SPOT");
    }
    if (typeof UPDATE_BITFINEX_SPOT === "function") {
      results.push("bitfinexCrypto=" + UPDATE_BITFINEX_SPOT());
    } else {
      results.push("bitfinexCrypto=SKIPPED_MISSING_UPDATE_BITFINEX_SPOT");
    }
    if (typeof UPDATE_BYBIT_SPOT === "function") {
      results.push("bybitCrypto=" + UPDATE_BYBIT_SPOT());
    } else {
      results.push("bybitCrypto=SKIPPED_MISSING_UPDATE_BYBIT_SPOT");
    }
    if (typeof UPDATE_COINBASE_SPOT === "function") {
      results.push("coinbaseCrypto=" + UPDATE_COINBASE_SPOT());
    } else {
      results.push("coinbaseCrypto=SKIPPED_MISSING_UPDATE_COINBASE_SPOT");
    }
    if (typeof UPDATE_OKX_SPOT === "function") {
      results.push("okxCrypto=" + UPDATE_OKX_SPOT());
    } else {
      results.push("okxCrypto=SKIPPED_MISSING_UPDATE_OKX_SPOT");
    }
  }

  if (typeof BINANCE_SYNC_CONFIG !== "undefined") {
    var binanceFlag = CEX_HAS_MANUAL_REQUEST(ss, BINANCE_SYNC_CONFIG.SHEET, BINANCE_SYNC_CONFIG.REFRESH_FLAG_PROP);
    if (binanceFlag) {
      CEX_CLEAR_MANUAL_REQUEST(BINANCE_SYNC_CONFIG.REFRESH_FLAG_PROP);
      didWork = true;
      results.push("binanceManual=" + CEX_RUN_MANUAL_UPDATE(ss, BINANCE_SYNC_CONFIG.SHEET, "BINANCE", UPDATE_BINANCE_SPOT));
    }
  }

  if (typeof BITFINEX_SYNC_CONFIG !== "undefined") {
    var bitfinexFlag = CEX_HAS_MANUAL_REQUEST(ss, BITFINEX_SYNC_CONFIG.SHEET, BITFINEX_SYNC_CONFIG.REFRESH_FLAG_PROP);
    if (bitfinexFlag) {
      CEX_CLEAR_MANUAL_REQUEST(BITFINEX_SYNC_CONFIG.REFRESH_FLAG_PROP);
      didWork = true;
      results.push("bitfinexManual=" + CEX_RUN_MANUAL_UPDATE(ss, BITFINEX_SYNC_CONFIG.SHEET, "BITFINEX", UPDATE_BITFINEX_SPOT));
    }
  }

  if (typeof BYBIT_SYNC_CONFIG !== "undefined") {
    var bybitFlag = CEX_HAS_MANUAL_REQUEST(ss, BYBIT_SYNC_CONFIG.SHEET, BYBIT_SYNC_CONFIG.REFRESH_FLAG_PROP);
    if (bybitFlag) {
      CEX_CLEAR_MANUAL_REQUEST(BYBIT_SYNC_CONFIG.REFRESH_FLAG_PROP);
      didWork = true;
      results.push("bybitManual=" + CEX_RUN_MANUAL_UPDATE(ss, BYBIT_SYNC_CONFIG.SHEET, "BYBIT", UPDATE_BYBIT_SPOT));
    }
  }

  if (typeof COINBASE_SYNC_CONFIG !== "undefined") {
    var coinbaseFlag = CEX_HAS_MANUAL_REQUEST(ss, COINBASE_SYNC_CONFIG.SHEET, COINBASE_SYNC_CONFIG.REFRESH_FLAG_PROP);
    if (coinbaseFlag) {
      CEX_CLEAR_MANUAL_REQUEST(COINBASE_SYNC_CONFIG.REFRESH_FLAG_PROP);
      didWork = true;
      results.push("coinbaseManual=" + CEX_RUN_MANUAL_UPDATE(ss, COINBASE_SYNC_CONFIG.SHEET, "COINBASE", UPDATE_COINBASE_SPOT));
    }
  }

  if (typeof OKX_SYNC_CONFIG !== "undefined") {
    var okxFlag = CEX_HAS_MANUAL_REQUEST(ss, OKX_SYNC_CONFIG.SHEET, OKX_SYNC_CONFIG.REFRESH_FLAG_PROP);
    if (okxFlag) {
      CEX_CLEAR_MANUAL_REQUEST(OKX_SYNC_CONFIG.REFRESH_FLAG_PROP);
      didWork = true;
      results.push("okxManual=" + CEX_RUN_MANUAL_UPDATE(ss, OKX_SYNC_CONFIG.SHEET, "OKX", UPDATE_OKX_SPOT));
    }
  }

  return didWork ? results.join("\n") : "NO_REQUEST";
}

function INSTALL_BITPANDA_REFRESH_WATCHDOG() {
  var trs = ScriptApp.getProjectTriggers();
  for (var i = 0; i < trs.length; i++) {
    if (trs[i].getHandlerFunction() === "BITPANDA_REFRESH_WATCHDOG") ScriptApp.deleteTrigger(trs[i]);
  }
  ScriptApp.newTrigger("BITPANDA_REFRESH_WATCHDOG").timeBased().everyMinutes(1).create();
  return "Trigger installed: BITPANDA_REFRESH_WATCHDOG every 1 min";
}

// v4.15.98: Refresh horaire centralise de TOUS les onglets CEX.
// Remplace les triggers horaires individuels (UPDATE_*_SPOT) par un seul
// trigger garanti par WCORE_AUTO_HEAL. Chaque update est protege individuellement
// pour qu'un CEX en erreur ne bloque pas les autres.
function CEX_HOURLY_REFRESH() {
  var results = [];
  function run(label, fn) {
    if (typeof fn !== "function") { results.push(label + "=SKIPPED_MISSING"); return; }
    try { results.push(label + "=" + fn()); }
    catch (e) { results.push(label + "=THREW:" + (e && e.message ? e.message : e)); }
  }
  run("bitpanda", typeof UPDATE_BITPANDA_SPOT === "function" ? UPDATE_BITPANDA_SPOT : null);
  run("binance", typeof UPDATE_BINANCE_SPOT === "function" ? UPDATE_BINANCE_SPOT : null);
  run("bitfinex", typeof UPDATE_BITFINEX_SPOT === "function" ? UPDATE_BITFINEX_SPOT : null);
  run("bybit", typeof UPDATE_BYBIT_SPOT === "function" ? UPDATE_BYBIT_SPOT : null);
  run("coinbase", typeof UPDATE_COINBASE_SPOT === "function" ? UPDATE_COINBASE_SPOT : null);
  run("okx", typeof UPDATE_OKX_SPOT === "function" ? UPDATE_OKX_SPOT : null);
  var summary = results.join("\n");
  Logger.log("CEX_HOURLY_REFRESH\n" + summary);
  return summary;
}

function INSTALL_CEX_HOURLY_REFRESH() {
  var trs = ScriptApp.getProjectTriggers();
  for (var i = 0; i < trs.length; i++) {
    if (trs[i].getHandlerFunction() === "CEX_HOURLY_REFRESH") ScriptApp.deleteTrigger(trs[i]);
  }
  ScriptApp.newTrigger("CEX_HOURLY_REFRESH").timeBased().everyHours(1).create();
  return "Trigger installed: CEX_HOURLY_REFRESH every 1 hour";
}

// Pose/garantit les checkboxes de refresh hors onglets Bitpanda (Z1 et AC2).
function SETUP_BITPANDA_REFRESH_CELL() {
  var ss = SpreadsheetApp.openById("1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4");
  var done = [];
  for (var name in BITPANDA_REFRESH_CELLS) {
    if (!Object.prototype.hasOwnProperty.call(BITPANDA_REFRESH_CELLS, name)) continue;
    var sh = ss.getSheetByName(name);
    if (!sh) continue;
    var cells = BITPANDA_REFRESH_CELLS[name];
    for (var cell in cells) {
      if (!Object.prototype.hasOwnProperty.call(cells, cell)) continue;
      sh.getRange(cell).insertCheckboxes().setValue(false);
      done.push(name + "!" + cell);
    }
  }
  return "OK_REFRESH_CELLS=" + done.join(",");
}

function DIAG_BITPANDA_API() {
  var apiKey = _bpGetApiKey_(BITPANDA_SYNC_CONFIG.API_KEY_PROP, true);
  var buckets = _bpFetchBuckets_(apiKey);
  var msg = [
    "Bitpanda API diag " + BITPANDA_SYNC_VERSION,
    "crypto=" + buckets.crypto.length,
    "commodity=" + buckets.commodity.length,
    "fiat=" + buckets.fiat.length,
    "stocks=" + buckets.stocks.length,
    "action=" + buckets.action.length,
    "unknown=" + buckets.unknown.length,
    "crypto sample=" + JSON.stringify(buckets.crypto.slice(0, 5)),
    "commodity sample=" + JSON.stringify(buckets.commodity.slice(0, 5)),
    "fiat sample=" + JSON.stringify(buckets.fiat.slice(0, 5)),
    "stocks sample=" + JSON.stringify(buckets.stocks.slice(0, 10)),
    "action sample=" + JSON.stringify(buckets.action.slice(0, 10)),
    "unknown sample=" + JSON.stringify(buckets.unknown.slice(0, 10))
  ].join("\n");
  Logger.log(msg);
  return msg;
}

function _bpUpdateSelectedBuckets_(writeMap, sourceLabel) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return "BUSY"; }
  try {
    var ss = SpreadsheetApp.openById("1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4");
    var apiKey = _bpGetApiKey_(BITPANDA_SYNC_CONFIG.API_KEY_PROP, true);
    var buckets = _bpFetchBuckets_(apiKey);

    // v4.15.68: fusionner le bucket "action" dans "stocks" (onglet Action supprime).
    var stocksRows = _bpMergeBuckets_(buckets.stocks, buckets.action);

    if (writeMap.crypto) _bpWriteRows_(ss, BITPANDA_SYNC_CONFIG.SHEETS.CRYPTO, buckets.crypto, sourceLabel);
    if (writeMap.commodity) _bpWriteRows_(ss, BITPANDA_SYNC_CONFIG.SHEETS.COMMODITY, buckets.commodity, sourceLabel);
    if (writeMap.fiat) _bpWriteRows_(ss, BITPANDA_SYNC_CONFIG.SHEETS.FIAT, buckets.fiat, sourceLabel);
    if (writeMap.stocks) _bpWriteRows_(ss, BITPANDA_SYNC_CONFIG.SHEETS.STOCKS, stocksRows, sourceLabel);

    var status = {
      ok: true,
      ts: new Date().toISOString(),
      mode: sourceLabel,
      wrote: {
        crypto: !!writeMap.crypto,
        commodity: !!writeMap.commodity,
        fiat: !!writeMap.fiat,
        stocks: !!writeMap.stocks
      },
      crypto: buckets.crypto.length,
      commodity: buckets.commodity.length,
      fiat: buckets.fiat.length,
      stocks: stocksRows.length,
      action: buckets.action.length,
      unknown: buckets.unknown.length
    };
    _bpSetStatus_(status);
    return JSON.stringify(status);
  } catch (err) {
    var statusErr = { ok: false, ts: new Date().toISOString(), error: String(err) };
    _bpSetStatus_(statusErr);
    Logger.log("_bpUpdateSelectedBuckets_ ERROR: " + err);
    return JSON.stringify(statusErr);
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function UPDATE_BITPANDA_SPOT() {
  return _bpUpdateSelectedBuckets_({ crypto: true, commodity: true, fiat: true, stocks: true }, "bitpanda-api");
}

function UPDATE_BITPANDA_STOCKS_FIAT() {
  return _bpUpdateSelectedBuckets_({ fiat: true, stocks: true }, "bitpanda-api-action-rebalancing");
}

function UPDATE_BITPANDA_CRYPTO_FIAT() {
  return _bpUpdateSelectedBuckets_({ crypto: true, fiat: true }, "bitpanda-api-crypto-cex");
}

function BITPANDA_SYNC_STATUS() {
  return PropertiesService.getScriptProperties().getProperty(BITPANDA_SYNC_CONFIG.STATUS_PROP) || "NO_STATUS";
}

function BITPANDA_TRIGGER_STATUS() {
  var trs = ScriptApp.getProjectTriggers();
  var hourly = 0, watchdog = 0;
  for (var i = 0; i < trs.length; i++) {
    var fn = trs[i].getHandlerFunction();
    if (fn === "UPDATE_BITPANDA_SPOT") hourly++;
    else if (fn === "BITPANDA_REFRESH_WATCHDOG") watchdog++;
  }
  return "hourly=" + hourly + " refreshWatchdog=" + watchdog;
}

// Installe les DEUX triggers: sync horaire + watchdog de refresh manuel (coche).
function INSTALL_BITPANDA_SYNC_TRIGGER() {
  var trs = ScriptApp.getProjectTriggers();
  for (var i = 0; i < trs.length; i++) {
    var fn = trs[i].getHandlerFunction();
    if (fn === "UPDATE_BITPANDA_SPOT" || fn === "BITPANDA_REFRESH_WATCHDOG") ScriptApp.deleteTrigger(trs[i]);
  }
  ScriptApp.newTrigger("UPDATE_BITPANDA_SPOT").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("BITPANDA_REFRESH_WATCHDOG").timeBased().everyMinutes(1).create();
  return "Triggers installed: UPDATE_BITPANDA_SPOT (1h) + BITPANDA_REFRESH_WATCHDOG (1min)";
}
