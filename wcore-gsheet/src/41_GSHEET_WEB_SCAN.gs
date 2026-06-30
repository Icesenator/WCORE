/************************************************************
 * 41_GSHEET_WEB_SCAN.gs - Delegated scans via WCORE Web
 *
 * v4.16.20 - Purge confirmed Base scam contracts during degraded Web cache merges.
 * v4.16.19 - Conservatively merge useful degraded Web scans with existing wallet cache.
 * v4.16.18 - Allow cache-backed balance fallback degraded Web payloads to refresh DeFi labels.
 * v4.16.17 - Allow price-gap-only degraded Web payloads to overwrite stale corrupted cache.
 * v4.16.16 - Allow sanitized absurd-price Web payloads to overwrite corrupted cache.
 * v4.16.15 - Preserve existing wallet cache on any degraded Web scan with errors.
 * v4.16.14 - Remove per-address Web-scan denylist; WCORE Web returns Wallet - Chain labels.
 * v4.16.10 - Preserve existing wallet cache on degraded native-zero Web scans.
 * v4.16.9 - Preserve Web debt tokens with negative balances.
 * v4.16.8 - Expose Web INFO_NO_MARKET row for illiquid tokens filtered by the API.
 * v4.16.7 - Expose Web INFO_NATIVE/INFO_TIMING/INFO_RPC rows for Recap.
 * v4.16.6 - Expose Web scan exec_ms and last_cache_update META rows for Recap.
 * v4.16.5 - Expose Web API HTTP failures in DIAG_WEB_SCAN_CHAIN.
 * v4.16.4 - Normalize VM-suffixed cache prefixes (INJECTIVE_COSMOS -> INJECTIVE).
 * v4.16.3 - Add GSHEET_WEB_SCAN_REQUIRE to stop native fallback for Web chains.
 * v4.16.2 - Retry transient UrlFetch failures before native fallback.
 * v4.16.1 - Resolve WCORE Web chain keys from canonical factory cache prefix.
 * v4.16.0 - Add web scan adapter for EVM/SVM/Cosmos/TON refresh paths.
 ************************************************************/

var GSHEET_WEB_SCAN_VERSION = "4.16.20";
var GSHEET_WEB_SCAN_MAX_ATTEMPTS = 2;

var GSHEET_WEB_SCAN_BLOCKED_CONTRACTS = {
  "0x30eba82795fe0f7e5b1fc51a1109ffe47c941ba3": true, // BASE: AGI
  "0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2": true, // BASE: DRB
  "0x1b9371e474aac1337b327ff8c30c1036dcecb7b6": true, // BASE: dick
  "0x9f86db9fc6f7c9408e8fda3ff8ce4e78ac7a6b07": true, // BASE: CLAWD
  "0x06a4665fd49c1c959e982a9ed22ea83e9f6be7df": true, // BASE: BALDYS
  "0x1626691e26c985f98fbc22193f24b719d3ae9491": true, // BASE: singularity-coin
  "0x3142b47221a8e9418e161bf5f747d65459f5535e": true  // BASE: TIMES
};

function _webScanProps_() {
  try { return PropertiesService.getScriptProperties(); } catch (e) { return null; }
}

function _webScanProp_(key) {
  try {
    var props = _webScanProps_();
    return props ? String(props.getProperty(key) || "") : "";
  } catch (e) { return ""; }
}

function _webScanEnabled_() {
  var enabledProp = String(_webScanProp_("GSHEET_WEB_SCAN_ENABLED") || "").toLowerCase();
  if (enabledProp === "false" || enabledProp === "0" || enabledProp === "off") return false;
  if (!_webScanProp_("WCORE_WEB_API_URL")) return false;
  if (!_webScanProp_("GSHEET_API_TOKEN")) return false;
  return true;
}

function _webScanChainKey_(config) {
  var raw = "";
  try {
    raw = (config && config.CHAIN && config.CHAIN.KEY) || "";
    if (!raw && config && config.KEYS && config.KEYS.PREFIX) raw = String(config.KEYS.PREFIX || "").replace(/_(?:COSMOS|SVM|EVM)?_?CACHE_?$/i, "");
    if (!raw) raw = (config && config.CHAIN && (config.CHAIN.NAME || config.CHAIN.DISPLAY_NAME)) || "";
  } catch (e) { raw = ""; }
  raw = String(raw || "").replace(/^Ledger\s*-\s*/i, "").trim();
  return raw.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

function _webScanAllowed_(chainKey) {
  var allow = String(_webScanProp_("GSHEET_WEB_SCAN_ALLOWLIST") || "ALL").trim();
  if (!allow || allow.toUpperCase() === "ALL") return true;
  var want = String(chainKey || "").trim().toUpperCase();
  var parts = allow.split(",");
  for (var i = 0; i < parts.length; i++) {
    if (String(parts[i] || "").trim().toUpperCase() === want) return true;
  }
  return false;
}

function _webScanRequireEnabled_() {
  var required = String(_webScanProp_("GSHEET_WEB_SCAN_REQUIRE") || "").toLowerCase();
  return required === "true" || required === "1" || required === "on";
}

function _webScanRequiredFor_(config) {
  if (!_webScanRequireEnabled_()) return false;
  if (!_webScanEnabled_()) return false;
  var chainKey = _webScanChainKey_(config);
  return !!(chainKey && _webScanAllowed_(chainKey));
}

function _webScanErrorStatus_(config) {
  var chainKey = _webScanChainKey_(config) || "UNKNOWN";
  return "[WEB_SCAN_ERROR] " + Format.now() + " chain=" + chainKey;
}

function _webScanSetLastError_(message, chainKey) {
  try {
    var props = _webScanProps_();
    if (!props) return;
    var msg = String(message || "").substring(0, 500);
    props.setProperty("GSHEET_WEB_SCAN_LAST_ERROR", msg);
    var ck = String(chainKey || "").trim().toUpperCase();
    if (ck) {
      var key = "GSHEET_WEB_SCAN_LAST_ERROR_" + ck.replace(/[^A-Z0-9]+/g, "_");
      props.setProperty(key, msg);
    }
  } catch (e) {}
}

function _webScanLogScanErrors_(payload, chainKey) {
  try {
    if (!payload) return;
    var errors = Array.isArray(payload.errors) ? payload.errors : [];
    if (!errors.length) return;
    var msg = "errors=" + errors.length + " first=" + String(errors[0] || "").substring(0, 200);
    _webScanSetLastError_(msg, chainKey);
  } catch (e) {}
}

function DIAG_WEB_SCAN_LAST_ERROR(chainKey) {
  var props = _webScanProps_();
  if (!props) return [["error", "no_script_properties"]];
  var out = [["Property", "Value"]];
  var global = String(props.getProperty("GSHEET_WEB_SCAN_LAST_ERROR") || "");
  out.push(["global", global]);
  var ck = String(chainKey || "").trim().toUpperCase();
  if (ck) {
    var perChain = String(props.getProperty("GSHEET_WEB_SCAN_LAST_ERROR_" + ck.replace(/[^A-Z0-9]+/g, "_")) || "");
    out.push([ck, perChain]);
  } else {
    var all = props.getProperties();
    for (var k in all) {
      if (k.indexOf("GSHEET_WEB_SCAN_LAST_ERROR_") === 0) {
        out.push([k.replace("GSHEET_WEB_SCAN_LAST_ERROR_", ""), String(all[k] || "").substring(0, 400)]);
      }
    }
  }
  try {
    var lines = ["[DIAG_WEB_SCAN_LAST_ERROR] BEGIN"];
    for (var li = 0; li < out.length; li++) lines.push("[DIAG_WEB_SCAN_LAST_ERROR] " + String(out[li][0] || "") + " = " + String(out[li][1] || "").substring(0, 480));
    lines.push("[DIAG_WEB_SCAN_LAST_ERROR] END");
    Logger.log(lines.join("\n"));
  } catch (eL) {}
  return out;
}

function _webScanResponseError_(code, text) {
  var err = "";
  try {
    var parsed = JSON.parse(String(text || "{}"));
    err = String(parsed.error || parsed.message || "");
  } catch (e) {
    err = String(text || "").substring(0, 160);
  }
  if (!err) err = "HTTP_ERROR";
  return { ok: false, status: "HTTP_" + code, error: err };
}

function _webScanTokenList_(tokensRange) {
  var out = [];
  var seen = {};
  function add(v) {
    var s = String(v || "").trim();
    if (!s || s.charAt(0) === "#") return;
    var k = s.toLowerCase();
    if (seen[k]) return;
    seen[k] = true;
    out.push(s);
  }
  if (Array.isArray(tokensRange)) {
    for (var r = 0; r < tokensRange.length; r++) {
      if (Array.isArray(tokensRange[r])) add(tokensRange[r][0]); else add(tokensRange[r]);
      if (out.length >= 200) break;
    }
  }
  return out;
}

function _webScanPriorityTokenSet_(tokensRange) {
  if (!Array.isArray(tokensRange)) return null;
  var list = _webScanTokenList_(tokensRange);
  var set = {};
  for (var i = 0; i < list.length; i++) set[String(list[i]).toLowerCase()] = true;
  return { set: set, count: list.length };
}

function _webScanNum_(v, fallback) {
  var n = Number(v);
  return isFinite(n) ? n : (fallback || 0);
}

function _webScanAssetFromNative_(nativeObj, config) {
  nativeObj = nativeObj || {};
  var symbol = String(nativeObj.symbol || (config && config.CHAIN && config.CHAIN.NATIVE_SYMBOL) || "NATIVE");
  return {
    contract: "native",
    symbol: symbol,
    name: symbol,
    balance: _webScanNum_(nativeObj.balance, 0),
    decimals: (config && config.CHAIN && config.CHAIN.NATIVE_DECIMALS) || 18,
    price_eur: _webScanNum_(nativeObj.priceEur, 0) || null,
    value_eur: _webScanNum_(nativeObj.valueEur, 0) || null
  };
}

function _webScanAssetFromToken_(tokenObj) {
  tokenObj = tokenObj || {};
  var contract = String(tokenObj.contract || tokenObj.address || tokenObj.mint || tokenObj.denom || "").trim();
  if (!contract) return null;
  var balance = _webScanNum_(tokenObj.balance, 0);
  if (balance === 0) return null;
  var priceEur = _webScanNum_(tokenObj.priceEur, 0) || null;
  var valueEur = _webScanNum_(tokenObj.valueEur, 0) || null;
  if (valueEur == null && priceEur != null) valueEur = balance * priceEur;
  return {
    contract: contract,
    symbol: String(tokenObj.symbol || ""),
    name: String(tokenObj.name || tokenObj.symbol || ""),
    balance: balance,
    decimals: tokenObj.decimals != null ? (_webScanNum_(tokenObj.decimals, 18) | 0) : 18,
    price_eur: priceEur,
    value_eur: valueEur
  };
}

function _webScanIsScamToken_(tokenObj) {
  tokenObj = tokenObj || {};
  var contract = String(tokenObj.contract || tokenObj.address || tokenObj.mint || tokenObj.denom || "").trim().toLowerCase();
  if (contract && GSHEET_WEB_SCAN_BLOCKED_CONTRACTS[contract]) return true;
  if (tokenObj.scam === true || tokenObj.isScam === true || tokenObj.suspicious === true || tokenObj.isSuspicious === true) return true;
  var level = String(tokenObj.scamLevel || tokenObj.riskLevel || tokenObj.level || "").toLowerCase();
  if (level === "scam" || level === "blocked") return true;
  var flags = tokenObj.flags || tokenObj.riskFlags || [];
  if (Array.isArray(flags)) {
    for (var i = 0; i < flags.length; i++) {
      var f = String(flags[i] || "").toLowerCase();
      if (f === "scam" || f === "blocked" || f === "airdrop_scam") return true;
    }
  }
  return false;
}

function _webScanConvertToWalletCache_(payload, config, tokensRange) {
  if (!payload || payload.ok !== true) return null;
  var now = Date.now();
  var assets = [];
  var priceMap = {};
  var priceTsMap = {};
  var balanceTsMap = {};
  var priority = _webScanPriorityTokenSet_(tokensRange);
  var filteredOut = 0;
  var scamFiltered = 0;
  var missingPrices = 0;
  var cleanTotalEur = 0;
  var priorityAssets = [];
  var extraAssets = [];

  var nativeAsset = _webScanAssetFromNative_(payload.native || {}, config || {});
  assets.push(nativeAsset);
  if (_webScanNum_(nativeAsset.value_eur, 0) > 0) cleanTotalEur += _webScanNum_(nativeAsset.value_eur, 0);
  if (nativeAsset.price_eur != null) {
    priceMap.native = nativeAsset.price_eur;
    priceTsMap.native = now;
  }
  balanceTsMap.native = now;

  var tokens = Array.isArray(payload.tokens) ? payload.tokens : [];
  for (var i = 0; i < tokens.length; i++) {
    if (_webScanIsScamToken_(tokens[i])) { scamFiltered++; continue; }
    var asset = _webScanAssetFromToken_(tokens[i]);
    if (!asset) continue;
    var isPriority = !!(priority && priority.set[String(asset.contract || "").toLowerCase()]);
    if (isPriority) priorityAssets.push(asset); else extraAssets.push(asset);
    if (_webScanNum_(asset.value_eur, 0) !== 0) cleanTotalEur += _webScanNum_(asset.value_eur, 0);
    if (asset.price_eur != null) {
      priceMap[asset.contract] = asset.price_eur;
      priceTsMap[asset.contract] = now;
    } else {
      missingPrices++;
    }
    balanceTsMap[asset.contract] = now;
  }
  assets = assets.concat(priorityAssets, extraAssets);

  var native = payload.native || {};
  var nativeInfo = "native=" + String(native.symbol || ((config && config.CHAIN && config.CHAIN.NATIVE_SYMBOL) || "N/A"))
    + "; balance=" + _webScanNum_(native.balance, 0)
    + "; price_eur=" + (native.priceEur == null ? "N/A" : _webScanNum_(native.priceEur, 0))
    + "; value_eur=" + (native.valueEur == null ? "N/A" : _webScanNum_(native.valueEur, 0));
  var phases = payload.phases || {};
  var timingInfo = "scan=" + _webScanNum_(payload.scanMs, 0) + "ms"
    + "; native=" + _webScanNum_(phases.nativeMs, 0) + "ms"
    + "; discovery=" + _webScanNum_(phases.discoveryMs, 0) + "ms"
    + "; balances=" + _webScanNum_(phases.balancesMs, 0) + "ms"
    + "; pricing=" + _webScanNum_(phases.pricingMs, 0) + "ms";
  var rpcInfo = "web_api; httpCalls=1; degraded=" + (!!payload.degraded)
    + "; errors=" + (Array.isArray(payload.errors) ? payload.errors.length : 0);

  return {
    version: (config && config.CACHE_VERSION) || null,
    updatedAt: now,
    last_run_update_ms: now,
    assets: assets,
    priceMap: priceMap,
    priceTsMap: priceTsMap,
    balanceTsMap: balanceTsMap,
    usd_to_eur_rate: _webScanNum_(payload.fxRate, 0) || null,
    scanStats: {
      source: "wcore-web",
      vm: String(payload.vm || ""),
      degraded: !!payload.degraded,
      errors: Array.isArray(payload.errors) ? payload.errors.slice(0, 20).map(String) : [],
      scanMs: _webScanNum_(payload.scanMs, 0),
      httpCalls: 1,
      fetchAllItems: 0,
      totalValueEur: cleanTotalEur,
      priorityTokens: priority ? priority.count : 0,
      extraTokens: extraAssets.length,
      filteredOut: filteredOut,
      scamFiltered: scamFiltered,
      nonFungibleFiltered: _webScanNum_(payload.cacheStats && payload.cacheStats.nonFungibleFiltered, 0),
      noMarketFiltered: _webScanNum_(payload.cacheStats && payload.cacheStats.noMarketFiltered, 0),
      fullCycleComplete: true,
      priceComplete: missingPrices <= 0,
      totalContracts: Math.max(0, assets.length - 1),
      scannedCount: Math.max(0, assets.length - 1),
      missingPrices: missingPrices,
      missingMeta: 0
    },
    lastInfoMetaRows: [
      ["", "INFO_ROT", "chain=" + _webScanChainKey_(config) + "; rot=WEB; profile=WCORE_WEB; degraded=" + (!!payload.degraded), "", "", "", ""],
      ["", "INFO_NATIVE", nativeInfo, "", "", "", ""],
      ["", "INFO_FX", payload.fxRate ? ("USD->EUR=" + Number(payload.fxRate).toFixed(4)) : "USD->EUR=N/A", "", "", "", ""],
      ["", "INFO_TIMING", timingInfo, "", "", "", ""],
      ["", "INFO_RPC", rpcInfo, "", "", "", ""],
      ["", "INFO_TOTAL", "Total portefeuille (sum value_eur).", "", "", "", cleanTotalEur],
      ["META", "web_scan_version", GSHEET_WEB_SCAN_VERSION],
      ["META", "exec_ms", _webScanNum_(payload.scanMs, 0)],
      ["META", "last_cache_update", Format.now()]
    ]
  };
}

function _webScanShouldPreserveExistingCache_(payload, cache) {
  if (!payload || payload.ok !== true || payload.degraded !== true) return false;
  var errors = Array.isArray(payload.errors) ? payload.errors : [];
  if (errors.length) {
    var onlyNonDestructiveGaps = true;
    for (var e = 0; e < errors.length; e++) {
      var err = String(errors[e] || "");
      if (err.indexOf("ABSURD_PRICE") >= 0) continue;
      if (/\bprice:\s*NO_PRICE\b/i.test(err)) continue;
      if (/^explorer cooldown active\b/i.test(err)) continue;
      if (/^explorer error\s+[^:]+:\s+This operation was aborted\b/i.test(err)) continue;
      if (/^blockNumber consensus failed\b/i.test(err)) continue;
      if (/^\[DEGRADED\].*\bbalance:\s*cache_fallback_live_failed,\s*using cache fallback\b/i.test(err)) continue;
      onlyNonDestructiveGaps = false;
      break;
    }
    if (onlyNonDestructiveGaps) return false;
    return true;
  }
  var assets = cache && Array.isArray(cache.assets) ? cache.assets : [];
  if (assets.length !== 1) return false;
  var native = assets[0] || {};
  if (String(native.contract || "") !== "native") return false;
  return _webScanNum_(native.balance, 0) === 0;
}

function _webScanAssetKey_(asset) {
  return String(asset && asset.contract || "").trim().toLowerCase();
}

function _webScanClone_(obj) {
  if (!obj || typeof obj !== "object") return obj;
  try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return obj; }
}

function _webScanHasUsefulAssets_(cache) {
  var assets = cache && Array.isArray(cache.assets) ? cache.assets : [];
  if (assets.length > 1) return true;
  var native = assets[0] || {};
  return String(native.contract || "") === "native" && (_webScanNum_(native.balance, 0) > 0 || _webScanNum_(native.value_eur, 0) > 0);
}

function _webScanMergeAsset_(oldAsset, newAsset) {
  var out = _webScanClone_(oldAsset || {}) || {};
  newAsset = newAsset || {};
  if (newAsset.contract) out.contract = newAsset.contract;
  if (newAsset.symbol) out.symbol = newAsset.symbol;
  if (newAsset.name) out.name = newAsset.name;
  if (newAsset.decimals != null && isFinite(Number(newAsset.decimals))) out.decimals = Number(newAsset.decimals) | 0;
  if (newAsset.balance != null && isFinite(Number(newAsset.balance))) out.balance = Number(newAsset.balance);
  if (newAsset.price_eur != null && isFinite(Number(newAsset.price_eur)) && Math.abs(Number(newAsset.price_eur)) < 1000000000) out.price_eur = Number(newAsset.price_eur);
  if (newAsset.value_eur != null && isFinite(Number(newAsset.value_eur)) && Math.abs(Number(newAsset.value_eur)) < 1000000000000) out.value_eur = Number(newAsset.value_eur);
  return out;
}

function _webScanMergedTotal_(assets) {
  var total = 0;
  for (var i = 0; i < assets.length; i++) total += _webScanNum_(assets[i] && assets[i].value_eur, 0);
  return total;
}

function _webScanMergeWithExistingCache_(existing, incoming) {
  if (!existing || !incoming || !_webScanHasUsefulAssets_(incoming)) return null;
  var oldAssets = Array.isArray(existing.assets) ? existing.assets : [];
  var newAssets = Array.isArray(incoming.assets) ? incoming.assets : [];
  if (!oldAssets.length || !newAssets.length) return null;

  var out = _webScanClone_(existing) || {};
  var byKey = {};
  var order = [];
  var purgedScams = 0;
  for (var i = 0; i < oldAssets.length; i++) {
    var oldAsset = _webScanClone_(oldAssets[i]) || {};
    var oldKey = _webScanAssetKey_(oldAsset);
    if (!oldKey) continue;
    if (_webScanIsScamToken_(oldAsset)) { purgedScams++; continue; }
    if (!byKey[oldKey]) order.push(oldKey);
    byKey[oldKey] = oldAsset;
  }

  var updated = 0;
  for (var j = 0; j < newAssets.length; j++) {
    var newAsset = newAssets[j] || {};
    var key = _webScanAssetKey_(newAsset);
    if (!key) continue;
    if (!byKey[key]) order.push(key);
    byKey[key] = _webScanMergeAsset_(byKey[key], newAsset);
    updated++;
  }

  var mergedAssets = [];
  for (var k = 0; k < order.length; k++) if (byKey[order[k]]) mergedAssets.push(byKey[order[k]]);
  if (!mergedAssets.length || updated <= 0) return null;

  function purgeBlockedMapKeys(mapObj) {
    if (!mapObj) return;
    for (var mk in GSHEET_WEB_SCAN_BLOCKED_CONTRACTS) {
      try { delete mapObj[mk]; } catch (eDel) {}
    }
  }

  out.assets = mergedAssets;
  out.updatedAt = incoming.updatedAt || Date.now();
  out.last_run_update_ms = incoming.last_run_update_ms || out.updatedAt;
  out.usd_to_eur_rate = incoming.usd_to_eur_rate || existing.usd_to_eur_rate || null;
  out.priceMap = _webScanClone_(existing.priceMap || {}) || {};
  purgeBlockedMapKeys(out.priceMap);
  var newPriceMap = incoming.priceMap || {};
  for (var pk in newPriceMap) if (newPriceMap[pk] != null) out.priceMap[pk] = newPriceMap[pk];
  out.priceTsMap = _webScanClone_(existing.priceTsMap || {}) || {};
  purgeBlockedMapKeys(out.priceTsMap);
  var newPriceTsMap = incoming.priceTsMap || {};
  for (var ptk in newPriceTsMap) if (newPriceTsMap[ptk] != null) out.priceTsMap[ptk] = newPriceTsMap[ptk];
  out.balanceTsMap = _webScanClone_(existing.balanceTsMap || {}) || {};
  purgeBlockedMapKeys(out.balanceTsMap);
  var newBalanceTsMap = incoming.balanceTsMap || {};
  for (var btk in newBalanceTsMap) if (newBalanceTsMap[btk] != null) out.balanceTsMap[btk] = newBalanceTsMap[btk];
  out.scanStats = _webScanClone_(incoming.scanStats || existing.scanStats || {}) || {};
  out.scanStats.webMerged = true;
  out.scanStats.webMergeUpdatedAssets = updated;
  out.scanStats.webMergePreservedAssets = Math.max(0, oldAssets.length - purgedScams - updated);
  out.scanStats.webMergePurgedScamAssets = purgedScams;
  out.scanStats.totalValueEur = _webScanMergedTotal_(mergedAssets);
  out.lastInfoMetaRows = incoming.lastInfoMetaRows || existing.lastInfoMetaRows || [];
  return out;
}

function _webScanRequestPayload_(address, tokensRange, forceFull, config) {
  return {
    address: String(address || "").trim(),
    chain: _webScanChainKey_(config),
    forceRefresh: (forceFull === true || forceFull === "true" || forceFull === "TRUE"),
    strictTokens: false,
    customTokens: _webScanTokenList_(tokensRange)
  };
}

function _webScanQuotaTripped_() {
  try {
    if (typeof QuotaCircuitBreaker !== "undefined" && QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped()) return true;
    if (typeof BaseEngine !== "undefined" && BaseEngine.isSystemBlocked && BaseEngine.isSystemBlocked()) return true;
  } catch (e) {}
  return false;
}

function _webScanWallet_(address, tokensRange, forceFull, config, cacheKey) {
  try {
    if (!_webScanEnabled_()) return null;
    var chainKey = _webScanChainKey_(config);
    if (!chainKey || !_webScanAllowed_(chainKey)) return null;
    var baseUrl = _webScanProp_("WCORE_WEB_API_URL").replace(/\/$/, "");
    var token = _webScanProp_("GSHEET_API_TOKEN");
    var req = _webScanRequestPayload_(address, tokensRange, forceFull, config);
    if (!req.address || !req.chain) return null;
    var fetchFn = (typeof _originalUrlFetch === "function") ? _originalUrlFetch : UrlFetchApp.fetch;
    var lastErr = null;
    var resp = null;
    var attempts = Math.max(1, GSHEET_WEB_SCAN_MAX_ATTEMPTS || 1);
    for (var attempt = 1; attempt <= attempts; attempt++) {
      try {
        resp = fetchFn.call(UrlFetchApp, baseUrl + "/api/gsheet/scan", {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(req),
      headers: { "x-gsheet-token": token, accept: "application/json" },
      muteHttpExceptions: true
        });
        lastErr = null;
        break;
      } catch (fetchErr) {
        lastErr = fetchErr;
        if (attempt < attempts && Utilities && Utilities.sleep) Utilities.sleep(250);
      }
    }
    if (lastErr) throw lastErr;
    var code = resp && resp.getResponseCode ? resp.getResponseCode() : 0;
    if (code < 200 || code >= 300) {
      var httpFailure = _webScanResponseError_(code, resp && resp.getContentText ? resp.getContentText() : "");
      _webScanSetLastError_(httpFailure.status + " " + httpFailure.error);
      return httpFailure;
    }
    var payload = JSON.parse(resp.getContentText() || "{}");
    _webScanLogScanErrors_(payload, chainKey);
    var cache = _webScanConvertToWalletCache_(payload, config, tokensRange);
    if (!cache || !cache.assets || !cache.assets.length) {
      var payloadFailure = { ok: false, status: "INVALID_PAYLOAD", error: String(payload && (payload.error || payload.message) || "empty_assets") };
      _webScanSetLastError_(payloadFailure.status + " " + payloadFailure.error, chainKey);
      return payloadFailure;
    }
    if (_webScanShouldPreserveExistingCache_(payload, cache)) {
      var existingCache = null;
      try { existingCache = WalletCache.load(String(cacheKey || address || "").trim(), config); } catch (loadErr) { existingCache = null; }
      var mergedCache = _webScanMergeWithExistingCache_(existingCache, cache);
      if (mergedCache) {
        CacheManager.init();
        WalletCache.save(String(cacheKey || address || "").trim(), mergedCache, config);
        return {
          ok: true,
          status: "[WEB_SCAN_DEGRADED] " + Format.datetime(mergedCache.updatedAt),
          cache: mergedCache,
          degraded: true,
          merged: true
        };
      }
      _webScanSetLastError_("PRESERVED_DEGRADED_NATIVE_ZERO " + chainKey, chainKey);
      return {
        ok: true,
        status: "[WEB_SCAN_PRESERVED] " + Format.datetime(cache.updatedAt),
        cache: cache,
        degraded: true
      };
    }
    CacheManager.init();
    WalletCache.save(String(cacheKey || address || "").trim(), cache, config);
    return {
      ok: true,
      status: (payload.degraded ? "[WEB_SCAN_DEGRADED] " : "WEB_SCAN_OK ") + Format.datetime(cache.updatedAt),
      cache: cache
    };
  } catch (e) {
    var chainKeyCatch = (typeof chainKey === "string" && chainKey) ? chainKey : ((config && _webScanChainKey_ && _webScanChainKey_(config)) || "");
    _webScanSetLastError_(String(e && (e.message || e) || e), chainKeyCatch);
    return null;
  }
}

function DIAG_WEB_SCAN_STATUS() {
  return [
    ["Metric", "Value"],
    ["version", GSHEET_WEB_SCAN_VERSION],
    ["enabled", _webScanEnabled_()],
    ["required", _webScanRequireEnabled_()],
    ["allowlist", _webScanProp_("GSHEET_WEB_SCAN_ALLOWLIST") || "ALL"],
    ["api", _webScanProp_("WCORE_WEB_API_URL") ? "SET" : "MISSING"],
    ["token", _webScanProp_("GSHEET_API_TOKEN") ? "SET" : "MISSING"],
    ["last_error", _webScanProp_("GSHEET_WEB_SCAN_LAST_ERROR") || ""]
  ];
}

function DIAG_WEB_SCAN_CHAIN(chain, address) {
  var cfg = { CHAIN: { NAME: String(chain || "") }, CACHE_VERSION: null };
  var res = _webScanWallet_(address, [], false, cfg);
  if (!res) return [["status", "NO_RESULT"]];
  if (res.ok === false) return [["status", res.status || "ERROR"], ["error", res.error || ""]];
  return [["status", res.status], ["assets", res.cache && res.cache.assets ? res.cache.assets.length : 0]];
}
