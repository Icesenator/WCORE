// v4.16.31 - Bulk write now applies per-provider symbol canonicalizers (OKSOL->SOL, Bybit aliases)
//            + merges duplicate (symbol, source) rows — parity with the per-connector paths.
//            v4.16.30 wrote raw relay rows, reintroducing OKSOL every 4h bulk refresh.
// v4.16.30 - Bulk relay-based CEX refresh: 1 HTTP call instead of 4.
// Replaces hourly UPDATE_BINANCE_SPOT / UPDATE_BYBIT_SPOT / UPDATE_COINBASE_SPOT / UPDATE_OKX_SPOT.
// The relay exposes GET /all?token=... which runs all 4 providers in parallel server-side.
//
// Non-relay CEXs (Bitpanda direct API, Bitfinex direct API, Kraken direct API) keep
// their own hourly triggers — they don't use the relay.

var CEX_BULK_VERSION = "4.16.31";

// Per-provider symbol canonicalizers. Binance/Coinbase are normalized server-side
// by the relay; OKX (OKSOL->SOL) and Bybit (aliases) normalize GAS-side, so the
// bulk path must apply the exact same functions as the per-connector paths.
function _cexBulkCanonicalSymbol_(provider, sym) {
  var s = String(sym || "").trim().toUpperCase();
  if (!s) return s;
  try {
    if (provider === "okx" && typeof _okxCanonicalSymbol_ === "function") return _okxCanonicalSymbol_(s);
    if (provider === "bybit" && typeof _bybitCanonicalSymbol_ === "function") return _bybitCanonicalSymbol_(s);
  } catch (e) {}
  return s;
}

// Merge duplicate (symbol, source) rows: sum balances/values, recompute avg price.
// Row layout: [sym, amt, src, stamp, valueUsd, priceUsd]
function _cexBulkMergeRows_(rows) {
  var merged = [];
  var byKey = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var key = r[0] + "|" + r[2];
    var ex = byKey[key];
    if (ex) {
      ex[1] += r[1];
      ex[4] += r[4];
      ex[5] = ex[1] > 0 ? ex[4] / ex[1] : r[5];
    } else {
      byKey[key] = r;
      merged.push(r);
    }
  }
  return merged;
}

var CEX_BULK_CONFIG = {
  PROVIDERS: ["binance", "bybit", "coinbase", "okx"],
  LOCK_NAME: "CEX_RELAY_ALL",
  LOCK_TTL_MS: 120000
};

function _cexBulkGetRelayUrl_() {
  var up = PropertiesService.getUserProperties();
  var keys = ["BINANCE_RELAY_URL", "BYBIT_RELAY_URL", "OKX_RELAY_URL", "COINBASE_RELAY_URL"];
  for (var i = 0; i < keys.length; i++) {
    try {
      var url = up.getProperty(keys[i]);
      if (url && String(url).indexOf("http") === 0) return String(url).trim().replace(/\/+$/, "");
    } catch (e) {}
  }
  try {
    var dp = PropertiesService.getDocumentProperties();
    for (var j = 0; j < keys.length; j++) {
      var durl = dp.getProperty(keys[j]);
      if (durl && String(durl).indexOf("http") === 0) return String(durl).trim().replace(/\/+$/, "");
    }
  } catch (eDoc) {}
  throw new Error("No relay URL found. Run SET_BINANCE_RELAY(url, token) or equivalent");
}

function _cexBulkGetRelayToken_() {
  var up = PropertiesService.getUserProperties();
  try {
    var token = up.getProperty("BINANCE_RELAY_TOKEN");
    if (token && String(token).length >= 10) return String(token).trim();
  } catch (e) {}
  try { token = up.getProperty("BYBIT_RELAY_TOKEN"); if (token && String(token).length >= 10) return String(token).trim(); } catch (e) {}
  try { token = up.getProperty("OKX_RELAY_TOKEN"); if (token && String(token).length >= 10) return String(token).trim(); } catch (e) {}
  try { token = up.getProperty("COINBASE_RELAY_TOKEN"); if (token && String(token).length >= 10) return String(token).trim(); } catch (e) {}
  try {
    var dp = PropertiesService.getDocumentProperties();
    token = dp.getProperty("BINANCE_RELAY_TOKEN");
    if (token && String(token).length >= 10) return String(token).trim();
  } catch (eDoc) {}
  throw new Error("No relay token found. Run SET_BINANCE_RELAY(url, token) or equivalent");
}

function _cexBulkFetchAll_() {
  var url = _cexBulkGetRelayUrl_() + "/all?token=" + encodeURIComponent(_cexBulkGetRelayToken_());
  var resp = UrlFetchApp.fetch(url, { method: "get", muteHttpExceptions: true });
  if (!resp) throw new Error("CEX bulk relay: null response");
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code < 200 || code >= 300) throw new Error("CEX bulk HTTP " + code + ": " + text.substring(0, 300));
  var data = JSON.parse(text);
  if (!data || !data.ok) throw new Error("CEX bulk error: " + ((data && data.error) || "unknown"));
  return data;
}

function _cexBulkWriteOne_(ss, sheetName, buckets, config) {
  // buckets = { spot: [[sym, amt, src, valueUsd, priceUsd], ...], ... }
  // Delegates to the per-connector write sheet function if available,
  // otherwise writes directly.
  var spot = (buckets && Array.isArray(buckets.spot)) ? buckets.spot : [];
  var sh = ss.getSheetByName(sheetName);
  if (!sh) sh = ss.insertSheet(sheetName);
  if (sh.getMaxColumns() < 7) sh.insertColumnsAfter(sh.getMaxColumns(), 7 - sh.getMaxColumns());
  var stamp = Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm:ss");
  var dataRows = [];
  for (var i = 0; i < spot.length; i++) {
    var sym = _cexBulkCanonicalSymbol_(config, spot[i][0]);
    var amt = Number(String(spot[i][1] == null ? "0" : spot[i][1]).replace(",", "."));
    if (!isFinite(amt)) amt = 0;
    var src = String(spot[i][2] || "spot").trim().toLowerCase() || "spot";
    var valueUsd = Number(String(spot[i][3] == null ? "0" : spot[i][3]).replace(",", "."));
    if (!isFinite(valueUsd)) valueUsd = 0;
    var priceUsd = Number(String(spot[i][4] == null ? "0" : spot[i][4]).replace(",", "."));
    if (!isFinite(priceUsd)) priceUsd = 0;
    if (sym && amt > 0) dataRows.push([sym, amt, src, stamp, valueUsd, priceUsd]);
  }
  // Also handle Binance earn buckets
  var earnFlex = (buckets && Array.isArray(buckets["earn-flexible"])) ? buckets["earn-flexible"] : [];
  for (var ef = 0; ef < earnFlex.length; ef++) {
    var eSym = _cexBulkCanonicalSymbol_(config, earnFlex[ef][0]);
    var eAmt = Number(String(earnFlex[ef][1] == null ? "0" : earnFlex[ef][1]).replace(",", "."));
    if (!isFinite(eAmt)) eAmt = 0;
    var eSrc = "earn-flexible";
    var eVal = Number(String(earnFlex[ef][3] == null ? "0" : earnFlex[ef][3]).replace(",", "."));
    if (!isFinite(eVal)) eVal = 0;
    var ePrc = Number(String(earnFlex[ef][4] == null ? "0" : earnFlex[ef][4]).replace(",", "."));
    if (!isFinite(ePrc)) ePrc = 0;
    if (eSym && eAmt > 0) dataRows.push([eSym, eAmt, eSrc, stamp, eVal, ePrc]);
  }
  var earnLocked = (buckets && Array.isArray(buckets["earn-locked"])) ? buckets["earn-locked"] : [];
  for (var el = 0; el < earnLocked.length; el++) {
    var lSym = _cexBulkCanonicalSymbol_(config, earnLocked[el][0]);
    var lAmt = Number(String(earnLocked[el][1] == null ? "0" : earnLocked[el][1]).replace(",", "."));
    if (!isFinite(lAmt)) lAmt = 0;
    var lSrc = "earn-locked";
    var lVal = Number(String(earnLocked[el][3] == null ? "0" : earnLocked[el][3]).replace(",", "."));
    if (!isFinite(lVal)) lVal = 0;
    var lPrc = Number(String(earnLocked[el][4] == null ? "0" : earnLocked[el][4]).replace(",", "."));
    if (!isFinite(lPrc)) lPrc = 0;
    if (lSym && lAmt > 0) dataRows.push([lSym, lAmt, lSrc, stamp, lVal, lPrc]);
  }
  // v4.16.31: merge duplicates created by aliasing (e.g. OKSOL+SOL -> single SOL row)
  dataRows = _cexBulkMergeRows_(dataRows);
  var values = [[false, stamp, "", ""], ["cryptocoin_symbol", "balance", "source", "updated_at"]].concat(dataRows);
  if (typeof _cexComputeAndAppendTotal_ === "function") {
    _cexComputeAndAppendTotal_(ss, sheetName, dataRows, config, values);
  } else {
    if (sh.getMaxRows() < values.length + 10) sh.insertRowsAfter(sh.getMaxRows(), values.length + 10 - sh.getMaxRows());
    sh.getRange(1, 1, values.length, Math.max(values[0] ? values[0].length : 4, 7)).setValues(values);
  }
  return dataRows.length;
}

function UPDATE_CEX_RELAY_ALL() {
  try { HttpCallCounter.setTrigger('UPDATE_CEX_RELAY_ALL'); } catch(e){}
  if (typeof CEX_ACQUIRE_LOCK === "function" && !CEX_ACQUIRE_LOCK(CEX_BULK_CONFIG.LOCK_NAME)) return "BUSY";
  try {
    var data = _cexBulkFetchAll_();
    var providers = (data && data.providers) || {};
    var ss = null;
    var results = {};
    var providerToSheet = {
      binance: "CEX - Binance",
      bybit: "CEX - Bybit",
      coinbase: "CEX - Coinbase",
      okx: "CEX - OKX"
    };
    for (var p = 0; p < CEX_BULK_CONFIG.PROVIDERS.length; p++) {
      var prov = CEX_BULK_CONFIG.PROVIDERS[p];
      var bucket = providers[prov];
      var sheetName = providerToSheet[prov];
      if (!sheetName) continue;
      try {
        if (!bucket || !bucket.ok) {
          results[prov] = { ok: false, error: (bucket && bucket.error) || "provider missing/failed" };
          continue;
        }
        if (!ss) ss = SpreadsheetApp.openById("1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4");
        var written = _cexBulkWriteOne_(ss, sheetName, bucket, prov);
        results[prov] = { ok: true, rows: written };
      } catch (eProv) {
        results[prov] = { ok: false, error: String(eProv && eProv.message ? eProv.message : eProv) };
      }
    }
    var status = { ok: true, ts: new Date().toISOString(), results: results };
    try { PropertiesService.getUserProperties().setProperty("CEX_BULK_STATUS", JSON.stringify(status)); } catch (eStatus) {}
    return JSON.stringify(status);
  } catch (err) {
    var statusErr = { ok: false, ts: new Date().toISOString(), error: String(err && err.message ? err.message : err) };
    try { PropertiesService.getUserProperties().setProperty("CEX_BULK_STATUS", JSON.stringify(statusErr)); } catch (eStatusErr) {}
    Logger.log("UPDATE_CEX_RELAY_ALL ERROR: " + err);
    return JSON.stringify(statusErr);
  } finally {
    if (typeof CEX_RELEASE_LOCK === "function") CEX_RELEASE_LOCK(CEX_BULK_CONFIG.LOCK_NAME);
  }
}

function CEX_RELAY_ALL_STATUS() {
  try { return PropertiesService.getUserProperties().getProperty("CEX_BULK_STATUS") || "NO_STATUS"; } catch (e) { return "NO_STATUS"; }
}
