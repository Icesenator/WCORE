/************************************************************
 * 15_COSMOS_ENGINE.gs (v4.15.15) - Cosmos SDK Engine
 *
 * v4.15.15 - budget guard: forceFull rétrogradé si HTTP >70% (_normalizeForceWithBudgetGuard_)
 * v4.15.14 - FIX: INFO_ROT now surfaces forceFull=YES/NO like EVM/SVM.
 *
 * MIGRATED TO BaseEngine - Unified execution for Cosmos chains.
 *
 * v4.13.3 - QUOTA PRE-CHECK CENTRALIZED
 * - CHANGED: getRefreshStatus now uses BaseEngine.quotaPreCheck()
 *
 * v4.13.1 - QUOTA CIRCUIT BREAKER INTEGRATION
 * - NEW: Test quota at START of getWalletAssets and getRefreshStatus
 * - NEW: If quota exhausted, return cached data with [QUOTA] immediately
 * - NEW: Avoids 20-30s timeout waiting for failed HTTP calls
 * - REQUIRES: 03E_QUOTA_CIRCUIT_BREAKER.gs loaded before this file
 *
 * v4.13.0 - SIMPLIFIED MODEL
 * - REMOVED: BudgetStats and ChainBudgetStats tracking
 * - NEW: Simple budget object (no complex profiles)
 * - NOTE: Cosmos uses single LCD call for all denoms (no rotation needed)
 *
 * (Changelog v4.11.0..v4.12.13: 3 entries removed for brevity)
 * checkAutoForce, checkMinRefresh, checkTooOld,
 * restoreFromCache, getFxRate, fallbackToCache, buildStatsBase
 * - CODE REDUCTION: ~180 lines saved
 *
 * DEPENDENCIES: 10A_BASE_ENGINE.gs (must be loaded before)
 ************************************************************/

// ============================================================
// AUTO-REGISTRATION
// ============================================================
if (typeof ModuleRegistry !== 'undefined') {
  ModuleRegistry.register("COSMOS_ENGINE", COSMOS_ENGINE_VERSION, {
    description: "Cosmos SDK Engine with dynamic REST endpoints",
    dependencies: ["BASE_ENGINE", "CACHE_CORE"]
  });
}

// ============================================================
// MODULE VERSION (for diagnostics)
// ============================================================
var COSMOS_ENGINE_VERSION = "4.15.66";

// ============================================================
// CONFIG BUILDER
// ============================================================

var DEFAULT_COSMOS_CONFIG = {
 TIMEOUTS: {
 MAX_EXECUTION_MS: 30000, SAFE_MARGIN_MS: 750, SAFE_SAVE_MARGIN_MS: 1500,
 SAFE_PRICE_MARGIN_MS: 6500, NATIVE_PRICE_MIN_LEFT_MS: 5000,
 HARD_GUARD_MS: 24000, HTTP_MS: 1500
 },
 CACHE: {
 WALLET_TTL_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.WALLET_TTL_MS : 86400000,
 PRICE_TTL_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.PRICE_TTL_MS : 43200000,
 AUTO_FORCE_FULL_SCAN_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.AUTO_FORCE_FULL_SCAN_MS : 86400000,
 AUTO_FORCE_FULL_PRICE_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.AUTO_FORCE_FULL_PRICE_MS : 86400000,
 MIN_REFRESH_INTERVAL_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.MIN_REFRESH_INTERVAL_MS : 60000,
 TOO_OLD_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.TOO_OLD_MS : 172800000
 },
 LIMITS: { MAX_TOKENS_RANGE_SCAN: 500, MAX_PRICE_TARGETS: 180 },
 CHAIN: { VM: "COSMOS", NAME: "Cosmos", DISPLAY_NAME: "Ledger - Cosmos", NATIVE_SYMBOL: "", NATIVE_NAME: "", NATIVE_DENOM: "" }
};

var CosmosConfigBuilder = CosmosConfigBuilder || {
 build: function(chainCfg) { return Obj.deepMerge(Obj.deepClone(DEFAULT_COSMOS_CONFIG), chainCfg || {}); },
 generateKeys: function(name) {
 var prefix = String(name || "").toUpperCase();
 return {
 PREFIX: prefix + "_COSMOS_CACHE_", GLOBAL_PRICE: prefix + "_COSMOS_GLOBAL_PRICE_CACHE",
 META: prefix + "_COSMOS_META_CACHE", RPC_HEALTH: prefix + "_COSMOS_RPC_HEALTH_CACHE",
 LOCK_SUFFIX: "_LOCK", DYNAMIC_BUDGET_PREFIX: prefix + "_COSMOS_DYNAMIC_BUDGET_STATS_",
 NATIVE_PRICE: "native@" + String(name || "").toLowerCase()
 };
 }
};
var CosmosEvmConfigBuilder = CosmosConfigBuilder;

// ============================================================
// TokenRange (Cosmos denoms)
// ============================================================

var CosmosTokenRange = {
 parse: function(tokensRange, config) {
 var out = [], maxScan = (config && config.LIMITS && config.LIMITS.MAX_TOKENS_RANGE_SCAN) || 500;
 try {
 if (typeof tokensRange === "string" && typeof TokenRange !== "undefined" && TokenRange.isA1Reference && TokenRange.isA1Reference(tokensRange)) {
 var values = TokenRange.readFromA1(tokensRange, maxScan, config);
 if (values && Array.isArray(values)) tokensRange = values;
 }
 } catch (eA1) {}
 if (typeof tokensRange === "string" && tokensRange) tokensRange = [tokensRange];
 if (!tokensRange || !Array.isArray(tokensRange)) return out;
 for (var i = 0; i < tokensRange.length; i++) {
 var val = tokensRange[i];
 if (!val || (typeof val !== "string" && typeof val !== "number")) continue;
 var denom = String(val).trim(); if (!denom) continue;
 out.push(denom); if (out.length >= maxScan) break;
 }
 return out;
 }
};

// ============================================================
// PRICING - Native token pricing with fallbacks
// ============================================================

function _cosmosGetNativePriceEur(nativeSymbol, timer, config) {
 if (!nativeSymbol) return null;
 var fxRate = null;
 try { fxRate = FxRate.getUsdToEur(); } catch (eFx) { fxRate = null; }
 if (!Num.isValidPositive(fxRate)) return null;
 var priceUsd = null;
 
 // 1. DefiLlama (primary)
 var llamaId = null;
 try { if (config && config.CHAIN && config.CHAIN.NATIVE_LLAMA_ID) llamaId = String(config.CHAIN.NATIVE_LLAMA_ID); } catch (e) {}
 if (!llamaId) llamaId = "coingecko:" + String(nativeSymbol).toLowerCase();
 try { priceUsd = PriceSources.llamaPriceUsd(llamaId, timer, config); if (Num.isValidPositive(priceUsd)) return priceUsd * fxRate; } catch (eLlama) {}

 // 2. GeckoTerminal fallback
 var priceContract = null;
 try { if (config && config.CHAIN && config.CHAIN.NATIVE_PRICE_CONTRACT) priceContract = String(config.CHAIN.NATIVE_PRICE_CONTRACT); } catch (e) {}
 if (priceContract && typeof PriceSources !== 'undefined' && PriceSources.gtTokenPriceUsd) {
 try { priceUsd = PriceSources.gtTokenPriceUsd(priceContract, timer, config); if (Num.isValidPositive(priceUsd)) return priceUsd * fxRate; } catch (eGt) {}
 }

 // 3. CoinGecko fallback
 var geckoId = null;
 try { if (config && config.CHAIN && config.CHAIN.NATIVE_GECKO_ID) geckoId = String(config.CHAIN.NATIVE_GECKO_ID); } catch (e) {}
 if (geckoId && typeof PriceSources !== 'undefined' && PriceSources.coingeckoPriceUsd) {
 try { priceUsd = PriceSources.coingeckoPriceUsd(geckoId, timer, config); if (Num.isValidPositive(priceUsd)) return priceUsd * fxRate; } catch (eCg) {}
 }
 return null;
}

// ============================================================
// CACHE HELPERS
// ============================================================

function _cosmosExtractInfoMetaRows_(rows, chainName) {
 var out = []; if (!rows || !rows.length) return out;
 for (var i = 0; i < rows.length; i++) {
 var r = rows[i]; if (!r || !r.length) continue;
 var c0 = String(r[0] || ""), c1 = String(r[1] || "");
 if (c0 === "META" || (c0 === chainName && c1.indexOf("INFO_") === 0)) out.push(r.slice(0));
 }
 return out;
}

function _cosmosIsNativeDenom(denom, nativeDenom) {
 if (!denom || !nativeDenom) return false;
 denom = String(denom).toLowerCase(); nativeDenom = String(nativeDenom).toLowerCase();
 if (denom === nativeDenom) return true;
 var denomBase = (denom.charAt(0) === 'u') ? denom.slice(1) : denom;
 var nativeBase = (nativeDenom.charAt(0) === 'u') ? nativeDenom.slice(1) : nativeDenom;
 return (denom === nativeDenom) || (denom === 'u' + nativeDenom) || (nativeDenom === 'u' + denom) || (denomBase === nativeBase);
}

function _cosmosIsFilteredDenom(denom, allowedDenoms) {
 if (!denom) return true;
 if (allowedDenoms && allowedDenoms.length > 0 && allowedDenoms.indexOf(denom) >= 0) return false;
 if (denom.indexOf("ibc/") === 0) return true;
 if (denom.indexOf("factory/") === 0) return true;
 return false;
}

function _cosmosBuildRotInfo_(chainName, budget, rrCursor, allContractsCount, pricesFetched, autoForced) {
 var parts = [];
 parts.push("chain=" + chainName);
 parts.push("rot=" + (budget && budget.allowRotation ? "ON" : "OFF"));
 parts.push("profile=" + (budget ? (budget.profileName || "STATIC") : "STATIC"));
 parts.push("dynamic=" + (budget && budget.isDynamic ? "YES" : "NO"));
 parts.push("forceFull=" + (budget && budget.force ? "YES" : "NO"));
 parts.push("rrCursor=" + (Num.isValid(rrCursor) ? rrCursor : 0));
 parts.push("contracts=" + (allContractsCount || 0));
 parts.push("dueScan1h=" + (budget && budget.dueFullScan ? "YES" : "NO"));
 parts.push("duePrice6h=" + (budget && budget.dueFullPrice ? "YES" : "NO"));
 if (autoForced) parts.push("autoForced=YES");
 parts.push("pricingMode=" + ((budget && budget.pricingMode) || "legacy"));
 parts.push("pricing=" + (budget && budget.allowPrices ? "ON" : "OFF"));
 parts.push("pricesFetched=" + (pricesFetched | 0));
 return parts.join("; ");
}

// ============================================================
// COSMOS ENGINE (v4.11.0 BaseEngine Migration)
// ============================================================

var CosmosEngine = CosmosEngine || {};

CosmosEngine.getWalletAssets = function(address, arg2, arg3, arg4, arg5, arg6, arg7) {
 // Signature detection
 var forceFull, config, walletNames, rpc, tokensRange, usingNewSignature = false;
 if (arg3 && typeof arg3 === 'object' && !Array.isArray(arg3) && (arg3.CHAIN || arg3.CACHE || arg3.TIMEOUTS)) {
 usingNewSignature = true; forceFull = arg2; config = arg3; walletNames = arg4;
 } else {
 rpc = arg2; tokensRange = arg3; forceFull = arg4; config = arg6; walletNames = arg7;
 }

 var cfg = CosmosConfigBuilder.build(config || {});
 var force = (typeof _normalizeForceWithBudgetGuard_ === 'function') ? _normalizeForceWithBudgetGuard_(forceFull) : Bool.parse(forceFull);

 var chainName = (cfg.CHAIN && (cfg.CHAIN.DISPLAY_NAME || cfg.CHAIN.NAME)) 
 ? ("Ledger - " + (cfg.CHAIN.DISPLAY_NAME ? String(cfg.CHAIN.DISPLAY_NAME).replace(/^Ledger\s*-\s*/i, "") : String(cfg.CHAIN.NAME))) 
 : "Ledger - Cosmos";
 var scriptVersion = cfg.VERSION || "COSMOS_v4.11.0";

 // === BASEENGINE: Initialize ===
 BaseEngine.initCaches();
 var state = BaseEngine.initExecution(cfg);
 state.force = force;
 
 // === v4.13.5: EARLY QUOTA CHECK (centralized) ===
 // v4.14.9: forceFull still runs testOnce() for auto-recovery, but doesn't return cached
 if (force) {
   if (typeof QuotaCircuitBreaker !== 'undefined') {
     if (QuotaCircuitBreaker.disableTripping) QuotaCircuitBreaker.disableTripping();
     if (QuotaCircuitBreaker.reset) QuotaCircuitBreaker.reset();
   }
 } else if (BaseEngine.testQuotaBlocked()) {
   return CosmosEngine.getCachedWalletAssets(address, cfg, walletNames);
 }
 
 var cache = null, assets = [], lastError = "";

 // Budget simulation
 var budget = { profileName: "STATIC", allowPrices: true, allowRotation: false, isDynamic: false, dueFullScan: false, dueFullPrice: false, force: force };

 // Fallback function
 function fallbackToCache(reason) {
 state.assets = assets; state.priceMap = state.priceMap || {}; state.priceTsMap = state.priceTsMap || {};
 try { if (!cache) cache = {}; cache.last_error = String(reason || "").substring(0, 500); cache.last_error_ts = Date.now(); } catch (e) {}
 
 var hasNewAssets = assets && assets.length > 0;
 if (hasNewAssets) {
 try {
 var cacheData = {
 version: (cfg.CACHE_VERSION || 0), updatedAt: state.nowMs, last_cache_update: Format.now(), last_update: Format.now(),
 wallet_original: address, assets: assets, priceMap: state.priceMap, priceTsMap: state.priceTsMap,
 balanceTsMap: state.balanceTsMap, attemptTsMap: state.attemptTsMap, purgedTsMap: state.purgedTsMap,
 usd_to_eur_rate: Num.isValidPositive(state.fxRate) ? state.fxRate : null, rrCursor: state.rrCursor,
 last_full_scan_ms: state.lastFullScanMs || null, last_full_price_ms: state.lastFullPriceMs || null,
 last_error: String(reason || "").substring(0, 500), last_error_ts: Date.now()
 };
 WalletCache.save(address, cacheData, cfg);
 } catch (e) {}
 } else {
 try { if (cache) { cache.last_error = String(reason || "").substring(0, 500); cache.last_error_ts = Date.now(); WalletCache.save(address, cache, cfg); } } catch (e) {}
 }
 
 // v4.13.0: Removed BudgetStats and ChainBudgetStats tracking
 
 return OutputBuilder.fromCacheFallback(chainName, cache, state.timer, reason, cfg);
 }

 try {
 cache = WalletCache.load(address, null, cfg);
 if (!cache) cache = BaseEngine.createEmptyCache(cfg);

 // === BASEENGINE: Cache version check ===
 cache = BaseEngine.checkCacheVersion(cache, cfg, state);
 if (!cache) cache = BaseEngine.createEmptyCache(cfg);
 state.cache = cache;

 // === BASEENGINE: Restore from cache ===
 if (cache) BaseEngine.restoreFromCache(cache, state);

 // === v4.13.6: Evict stale prices ===
 BaseEngine.evictStalePrices(state, cfg);

 // === BASEENGINE: Auto-force checks ===
 var autoForceResult = BaseEngine.checkAutoForce(cache, cfg, state, force, address);
 if (autoForceResult.dueFullScan) { budget.dueFullScan = true; budget.dueFullPrice = true; }

 // === BASEENGINE: Min refresh check ===
 if (!force && !state.autoForced) {
 if (!BaseEngine.checkMinRefresh(cache, cfg, state, force)) {
 if (usingNewSignature) return CosmosEngine.getCachedWalletAssets(address, cfg, walletNames);
 else return CosmosEngine.getCachedWalletAssets(address, rpc, tokensRange, forceFull, null, config, walletNames);
 }
 }

 // === BASEENGINE: Too-old check ===
 if (BaseEngine.checkTooOld(cache, cfg, state)) { budget.dueFullScan = true; budget.dueFullPrice = true; }

 // ----------------------------------------------------------
 // LIVE FETCH
 // ----------------------------------------------------------
 var rows = [OutputBuilder.headerRow()];

 // v4.15.3: Dynamic REST endpoints (Cosmos Chain Registry + hardcoded fallback)
 var restUrls = [];
 if (!rpc) {
   try {
     if (typeof _getDynamicCosmosRestUrls === "function") {
       var cosmosChainKey = (cfg.CHAIN && cfg.CHAIN.NAME) ? String(cfg.CHAIN.NAME).toUpperCase().replace(/\s+/g, "_") : "";
       restUrls = _getDynamicCosmosRestUrls(cosmosChainKey, (cfg.API && cfg.API.REST_URL) ? cfg.API.REST_URL : null);
     }
   } catch (eDyn) {}
   if (!restUrls.length && cfg.API && cfg.API.REST_URL) restUrls = [cfg.API.REST_URL];
 } else {
   restUrls = [String(rpc)];
 }
 if (!restUrls.length) return fallbackToCache("No LCD endpoint configured in API.REST_URL");

 var allowedDenoms = CosmosTokenRange.parse(tokensRange, cfg);

 var nativeSymbol = (cfg.CHAIN && cfg.CHAIN.NATIVE_SYMBOL) ? String(cfg.CHAIN.NATIVE_SYMBOL) : "";
 var nativeName = (cfg.CHAIN && cfg.CHAIN.NATIVE_NAME) ? String(cfg.CHAIN.NATIVE_NAME) : "";
 var nativeDenom = (cfg.CHAIN && cfg.CHAIN.NATIVE_DENOM) ? String(cfg.CHAIN.NATIVE_DENOM) : "";
 var nativeDecimals = (cfg.CHAIN && cfg.CHAIN.NATIVE_DECIMALS) ? Number(cfg.CHAIN.NATIVE_DECIMALS) : 0;
 if (!nativeDecimals && cfg.DENOM_DECIMALS && nativeDenom) {
 nativeDecimals = cfg.DENOM_DECIMALS[nativeDenom] || cfg.DENOM_DECIMALS['u' + nativeDenom] || 0;
 }

 // === BASEENGINE: Get FX rate ===
 BaseEngine.getFxRate(state, cache);

 // Fetch balances — try each REST endpoint with fallback
 state._tBalanceStart = Date.now();
 var balances = [];
 var balanceFetchSuccess = false;
 for (var ri = 0; ri < restUrls.length && !balanceFetchSuccess; ri++) {
 try {
 var balUrl = String(restUrls[ri]).replace(/\/+$/, "") + "/cosmos/bank/v1beta1/balances/" + address;
 var balResp = Http.getJson(balUrl, { timeout: 5000 }, cfg);
 if (balResp && balResp.balances && Array.isArray(balResp.balances)) {
 balances = balResp.balances;
 balanceFetchSuccess = true;
 }
 } catch (eBal) { lastError = "Balance fetch failed on " + restUrls[ri] + ": " + String(eBal); }
 }
 state._balMs = Date.now() - state._tBalanceStart;
 
 // v4.12.13: If balance fetch failed, try to recover native balance from cache
 var cachedNativeBalance = null;
 if (!balanceFetchSuccess && cache && cache.assets && cache.assets.length > 0) {
 for (var ci = 0; ci < cache.assets.length; ci++) {
 var cachedAsset = cache.assets[ci];
 if (cachedAsset && (cachedAsset.contract_address === "native" || cachedAsset.contract === "native")) {
 cachedNativeBalance = cachedAsset.balance;
 break;
 }
 }
 }

 var denomSymbols = (cfg && cfg.DENOM_SYMBOLS) ? cfg.DENOM_SYMBOLS : {};
 var denomDecimals = (cfg && cfg.DENOM_DECIMALS) ? cfg.DENOM_DECIMALS : {};
 var denomNames = (cfg && cfg.DENOM_NAMES) ? cfg.DENOM_NAMES : {};

 var nativeBalance = 0;

 // Process balances - First pass: find native
 for (var i = 0; i < balances.length; i++) {
 var bal = balances[i]; if (!bal || !bal.denom || !bal.amount) continue;
 if (_cosmosIsNativeDenom(String(bal.denom), nativeDenom)) {
 nativeBalance = Num.parseOr(bal.amount, 0);
 state.balanceTsMap["native"] = state.nowMs;
 }
 }

 // Second pass: non-native tokens
 for (var j = 0; j < balances.length; j++) {
 var bal2 = balances[j]; if (!bal2 || !bal2.denom || !bal2.amount) continue;
 var denom2 = String(bal2.denom);
 if (_cosmosIsNativeDenom(denom2, nativeDenom)) continue;
 if (_cosmosIsFilteredDenom(denom2, allowedDenoms)) continue;
 if (allowedDenoms.length > 0 && allowedDenoms.indexOf(denom2) < 0) continue;

 var sym = denomSymbols[denom2] || denom2;
 var decimals = denomDecimals[denom2] || 0;
 var name = denomNames[denom2] || sym;
 var rawBal = Num.parseOr(bal2.amount, 0); if (rawBal === 0) continue;
 var humanBal = (decimals > 0) ? (rawBal / Math.pow(10, decimals)) : rawBal;

 rows.push([chainName, sym, name, denom2, humanBal, "", ""]);
 assets.push({ chain_name: chainName, token_ticker: sym, token_name: name, contract_address: denom2, contract: denom2, symbol: sym, name: name, denom: denom2, balance: humanBal, decimals: decimals, price_eur: null, value_eur: "" });
 state.balanceTsMap[denom2] = state.nowMs;
 }

 // ----------------------------------------------------------
 // NATIVE ROW AND PRICING
 // ----------------------------------------------------------
 state._tPriceStart = Date.now();
 var nativePriceEur = null;
 var nativeKey = (cfg.KEYS && cfg.KEYS.NATIVE_PRICE) ? cfg.KEYS.NATIVE_PRICE : "native";

 if (!nativeSymbol) {
 nativeSymbol = denomSymbols[nativeDenom] || denomSymbols['u' + nativeDenom] || "";
 if (!nativeSymbol && nativeDenom) { var nd = String(nativeDenom).replace(/^u/, ""); nativeSymbol = nd ? nd.toUpperCase() : "NATIVE"; }
 }
 if (!nativeName) nativeName = nativeSymbol || "Native";

 var humanNativeBalance = nativeBalance;
 if (nativeDecimals > 0 && nativeBalance > 0) humanNativeBalance = nativeBalance / Math.pow(10, nativeDecimals);
 
 // v4.12.13: If balance fetch failed and we have cached balance, use it
 if (!balanceFetchSuccess && cachedNativeBalance !== null && Num.isValidPositive(cachedNativeBalance)) {
 humanNativeBalance = cachedNativeBalance;
 // Note: cachedNativeBalance is already in human units (was divided when cached)
 }

 nativePriceEur = _cosmosGetNativePriceEur(nativeSymbol, state.timer, cfg);
 if (Num.isValidPositive(nativePriceEur)) {
 state.pricesFetched = 1;
 state.priceMap[nativeKey] = nativePriceEur; state.priceTsMap[nativeKey] = state.nowMs;
 state.priceMap['native'] = nativePriceEur; state.priceTsMap['native'] = state.nowMs;
 }

 var nativeValueEur = "";
 if (nativePriceEur && Num.isValidPositive(nativePriceEur) && humanNativeBalance > 0) nativeValueEur = humanNativeBalance * nativePriceEur;

 rows.splice(1, 0, [chainName, nativeSymbol, nativeName, "native", humanNativeBalance, nativePriceEur, nativeValueEur]);
 assets.unshift({ chain_name: chainName, token_ticker: nativeSymbol, token_name: nativeName, contract_address: "native", contract: "native", symbol: nativeSymbol, name: nativeName, balance: humanNativeBalance, decimals: nativeDecimals, price_eur: nativePriceEur, value_eur: nativeValueEur });

 if (state.autoForced || budget.dueFullPrice) state.lastFullPriceMs = state.nowMs;
 state.lastFullScanMs = state.nowMs;
 state._priceMs = Date.now() - state._tPriceStart;
 budget.pricingMode = BaseEngine.getPricingMode(state);

 try { if (cache) { cache.last_error = null; cache.last_error_ts = null; } } catch (e) {}

 // ----------------------------------------------------------
 // INFO / META
 // ----------------------------------------------------------
 try {
 var fxStr = Num.isValidPositive(state.fxRate) ? "USD->EUR=" + state.fxRate.toFixed(4) : "USD->EUR=N/A";
 var contractCount = (assets.length > 0) ? (assets.length - 1) : 0;
 var rotStr = _cosmosBuildRotInfo_(chainName, budget, state.rrCursor, contractCount, state.pricesFetched, state.autoForced);
 rows.push([chainName, "INFO_ROT", rotStr, "", "", "", ""]);
 var nativeStr = (nativeSymbol ? nativeSymbol : "NATIVE") + (nativeDenom ? ("; denom=" + nativeDenom) : "") + (nativeName ? ("; name=" + nativeName) : "");
 rows.push([chainName, "INFO_NATIVE", nativeStr, "", "", "", ""]);
 rows.push([chainName, "INFO_FX", fxStr, "", "", "", ""]);
 rows.push([chainName, "INFO_TIMING", "bal=" + (state._balMs|0) + "ms; price=" + (state._priceMs|0) + "ms", "", "", "", ""]);

 var total = 0;
 for (var ti = 0; ti < rows.length; ti++) { var rv = rows[ti]; if (rv && rv.length >= 7) { var valCol = rv[6]; if (Num.isValidPositive(valCol)) total += Number(valCol); } }
 rows.push([chainName, "INFO_TOTAL", "Total portefeuille (sum value_eur)", "", "", "", total]);
 } catch (eInfo) {}

 var lastUpdate = Format.now();
 rows.push(["META", "last_update", lastUpdate, "", "", "", ""]);
 rows.push(["META", "exec_ms", state.timer.elapsed(), "", "", "", ""]);
 rows.push(["META", "last_cache_update", lastUpdate, "", "", "", ""]);
 rows.push(["META", "script_version", scriptVersion, "", "", "", ""]);

 // ----------------------------------------------------------
 // SAVE CACHE
 // ----------------------------------------------------------
 try {
 var infoMetaRows = _cosmosExtractInfoMetaRows_(rows, chainName);
 
 // v4.13.0: Cosmos always scans all denoms in one LCD call (no rotation)
 // v4.14.2: Count must match Pricing.missing_count from BASE_ENGINE
 // Uses same 3-tier lookup: asset.price_eur → priceMap[key] → priceMap["native"]
 var cosmosTokenCount = (assets.length > 0) ? (assets.length - 1) : 0; // exclude native
 var cosmosMissingPrices = 0;
 var _cPm = state.priceMap || {};
 var _cNatKey = (cfg.KEYS && cfg.KEYS.NATIVE_PRICE) ? cfg.KEYS.NATIVE_PRICE : "native";
 for (var cmp = 0; cmp < assets.length; cmp++) {
 var cmpA = assets[cmp];
 if (!cmpA) continue;
 var cmpBal = Number(cmpA.balance || 0);
 if (!Num.isPositive(cmpBal)) continue;
 var cmpContract = cmpA.contract || cmpA.denom || "";
 var cmpPxKey = (cmpContract === "native") ? _cNatKey : cmpContract;
 var cmpPx = 0;
 if (Num.isValidPositive(cmpA.price_eur)) { cmpPx = Number(cmpA.price_eur); }
 if (!Num.isValidPositive(cmpPx) && _cPm[cmpPxKey]) { cmpPx = Number(_cPm[cmpPxKey]); }
 if (!Num.isValidPositive(cmpPx) && cmpContract === "native" && _cPm["native"]) { cmpPx = Number(_cPm["native"]); }
 if (!Num.isValidPositive(cmpPx)) cosmosMissingPrices++;
 }
 var cosmosScanStats = {
   fullCycleComplete: cosmosMissingPrices === 0,
   totalContracts: cosmosTokenCount,
   scannedCount: cosmosTokenCount,
   cursor: 0,
   hasActivity: false,
   fallbackCount: 0,
   missingPrices: cosmosMissingPrices
 };
 
 var cacheData = {
 version: (cfg.CACHE_VERSION || 0), updatedAt: state.nowMs, last_cache_update: lastUpdate, last_update: lastUpdate,
 wallet_original: address, assets: assets, priceMap: state.priceMap, priceTsMap: state.priceTsMap,
 balanceTsMap: state.balanceTsMap, attemptTsMap: state.attemptTsMap, purgedTsMap: state.purgedTsMap,
 usd_to_eur_rate: Num.isValidPositive(state.fxRate) ? state.fxRate : null, rrCursor: state.rrCursor,
 lastInfoMetaRows: infoMetaRows, im: infoMetaRows,
 last_full_scan_ms: state.lastFullScanMs, last_full_price_ms: state.lastFullPriceMs,
 last_error: lastError || null, last_error_ts: lastError ? state.nowMs : null,
 scanStats: cosmosScanStats
 };
 WalletCache.save(address, cacheData, cfg);
 } catch (eSave) {}

 // v4.13.0: Removed BudgetStats and ChainBudgetStats tracking
 try { PriceRunCache.reset(); } catch (e) {}

 return rows;

 } catch (e) {
 return fallbackToCache("Exception: " + String(e.message || e));
 }
};

CosmosEngine.getCachedWalletAssets = function(address, arg2, arg3, arg4, arg5, arg6, arg7) {
 var cfg;
 if (arg2 && typeof arg2 === 'object' && !Array.isArray(arg2) && (arg2.CHAIN || arg2.CACHE || arg2.TIMEOUTS)) {
 cfg = CosmosConfigBuilder.build(arg2 || {});
 } else {
 cfg = CosmosConfigBuilder.build(arg6 || {});
 }

  try {
  CacheManager.init();
  var cache = WalletCache.load(address, null, cfg);
  if (!cache) {
  var noCacheChainName = (cfg.CHAIN && (cfg.CHAIN.DISPLAY_NAME || cfg.CHAIN.NAME)) || "Cosmos";
  var snap = null;
   try {
   if (typeof OutputSnapshotCache !== 'undefined') snap = OutputSnapshotCache.load(cfg, address, "NO_CACHE_MISSING_WALLET_CACHE");
   } catch (eSnapLoad) {}
  if (snap) return snap;
  var emptyCache = (typeof BaseEngine !== "undefined" && BaseEngine.createEmptyCache) ? BaseEngine.createEmptyCache(cfg) : { assets: [], priceMap: {} };
  emptyCache.wallet_original = address;
  return OutputBuilder.fromCacheFallback(noCacheChainName, emptyCache, null, "NO_CACHE_WAITING_REFRESH", cfg);
  }

 // v4.13.5: TOUCH CACHE WHEN BLOCKED (centralized) - Prevent cache expiration during outages
 try {
   if (BaseEngine.isSystemBlocked() && cache.updatedAt) {
     var cacheAgeMs = Date.now() - cache.updatedAt;
     var touchThresholdMs = 3600000; // 1 hour
     if (cacheAgeMs > touchThresholdMs) {
       cache.updatedAt = Date.now();
       cache.last_cache_update = Format.now();
       cache._touchedWhileBlocked = true;
       WalletCache.save(address, cache, cfg);
     }
   }
 } catch (eTouchBlocked) {}

 var chainName = (cfg.CHAIN && (cfg.CHAIN.DISPLAY_NAME || cfg.CHAIN.NAME)) 
 ? ("Ledger - " + (cfg.CHAIN.DISPLAY_NAME ? String(cfg.CHAIN.DISPLAY_NAME).replace(/^Ledger\s*-\s*/i, "") : String(cfg.CHAIN.NAME))) 
 : "Ledger - Cosmos";

 var out = OutputBuilder.fromCacheOnly(chainName, cache, cfg);

 // Native price fallback
 try {
 var nativeKey = (cfg.KEYS && cfg.KEYS.NATIVE_PRICE) ? cfg.KEYS.NATIVE_PRICE : "native";
 var fx = (cache && Num.isValidPositive(cache.usd_to_eur_rate)) ? cache.usd_to_eur_rate : null;
 var cachedPriceMap = cache.priceMap || {};
 if (nativeKey && fx) {
 for (var r = 0; r < out.length; r++) {
 var row = out[r];
 if (row && row.length >= 7 && String(row[3]) === "native") {
 if (cfg.CHAIN && cfg.CHAIN.NATIVE_SYMBOL) row[1] = cfg.CHAIN.NATIVE_SYMBOL;
 if (cfg.CHAIN && cfg.CHAIN.NATIVE_NAME) row[2] = cfg.CHAIN.NATIVE_NAME;
 var bal = Num.parse(row[4]);
 var eur = cachedPriceMap[nativeKey] || cachedPriceMap["native"];
 if (Num.isValidPositive(eur) && Num.isValid(bal)) { row[5] = eur; row[6] = bal * eur; }
 break;
 }
 }
 }
 } catch (e) {}

 // v4.13.1: Recalculate total from actual asset rows (like EVM)
 var recalcTotal = 0;
 for (var t = 1; t < out.length; t++) {
   var val = out[t] && out[t][6];
   if (Num.isValidPositive(val)) recalcTotal += val;
 }

 // Append INFO/META, patching INFO_TOTAL with recalculated value
 if (cache.lastInfoMetaRows && cache.lastInfoMetaRows.length) {
 for (var i = 0; i < cache.lastInfoMetaRows.length; i++) {
 var ir = cache.lastInfoMetaRows[i]; if (!ir || ir.length < 2) continue;
 ir = ir.slice(0); // Clone to avoid mutating cache
 if (String(ir[0]) === "" && String(ir[1] || "").indexOf("INFO") === 0) { ir[0] = chainName; }
 // v4.13.1: Patch INFO_TOTAL with recalculated value
 if (ir[1] === "INFO_TOTAL") { ir[6] = recalcTotal; }
 if (ir[0] === "META" && ir[1] === "script_version") continue;
 out.push(ir);
 }
 } else { 
   // Fallback - add INFO_TOTAL if missing
   out.push([chainName, "INFO_TOTAL", "Total portefeuille (sum value_eur)", "", "", "", recalcTotal]);
   out.push(OutputBuilder.metaRow("last_cache_update", WalletCache.getLastUpdateStr(cache))); 
 }
 out.push(OutputBuilder.metaRow("script_version", cfg.VERSION || "COSMOS_v4.13.1"));
  try { if (typeof OutputSnapshotCache !== 'undefined') OutputSnapshotCache.save(cfg, address, out); } catch (eSnapSave) {}
  return out;
 } catch (e) { return OutputBuilder.error((cfg && cfg.CHAIN && cfg.CHAIN.NAME) || "Cosmos", String(e.message || e), cfg); }
};

CosmosEngine.getRefreshStatus = function(address, arg2, arg3, arg4, arg5, arg6, arg7) {
 // v4.10.5 FIX: Signature detection (like getWalletAssets)
 var forceFull, config, walletNames;
 if (arg3 && typeof arg3 === 'object' && !Array.isArray(arg3) && (arg3.CHAIN || arg3.CACHE || arg3.TIMEOUTS)) {
   // New signature from ChainFactory: (address, forceFull, config, walletNames)
   forceFull = arg2;
   config = arg3;
   walletNames = arg4;
 } else {
   // Old signature: (address, rpc, tokensRange, forceFull, triggerRefresh, config, walletNames)
   forceFull = arg4;
   config = arg6;
   walletNames = arg7;
 }
  var cfg = CosmosConfigBuilder.build(config || {});
  var cosmosCexBusyStatus = BaseEngine.cexBusyStatus ? BaseEngine.cexBusyStatus(address, cfg) : "";
  if (cosmosCexBusyStatus) return cosmosCexBusyStatus;
  
  // v4.13.3: Centralized quota pre-check via BaseEngine
 // v4.14.5: forceFull bypasses quota check — user explicitly wants fresh data
   var cosmosForce = (typeof Bool !== 'undefined') ? Bool.parse(forceFull) : false;
  // v4.15.72: Load cache before Web scan so B1 guards can prevent repeat
  // UrlFetch attempts when Sheets re-evaluates I1 without a new pulse.
  var _httpBefore = BaseEngine.httpSnapshot();
  var cosmosCacheBefore = null;
  try {
    CacheManager.init();
    cosmosCacheBefore = WalletCache.load(address, null, cfg);
    if (BaseEngine.shouldSkipRefreshForSameTrigger && BaseEngine.shouldSkipRefreshForSameTrigger(address, cfg, cosmosCacheBefore, forceFull, arg5)) {
      var cosmosSkipTs = WalletCache.getLastRunUpdateStr(cosmosCacheBefore) || WalletCache.getLastUpdateStr(cosmosCacheBefore);
      return cosmosSkipTs ? BaseEngine.wrapCacheOnlyMarker(cosmosSkipTs, _httpBefore) : ("[NO_CACHE] " + Format.now());
    }
    if (BaseEngine.shouldSkipNoTriggerRecentScan && BaseEngine.shouldSkipNoTriggerRecentScan(address, cfg, cosmosCacheBefore, forceFull, arg5)) {
      var cosmosFreshTs = WalletCache.getLastRunUpdateStr(cosmosCacheBefore) || WalletCache.getLastUpdateStr(cosmosCacheBefore);
      return cosmosFreshTs ? BaseEngine.wrapCacheOnlyMarker("[FRESH] " + cosmosFreshTs, _httpBefore) : ("[NO_CACHE] " + Format.now());
    }
  } catch (ePreLatch) {}
     try {
       if (typeof _webScanWallet_ === "function") {
         var cosmosWebScan = _webScanWallet_(address, arg3, forceFull, cfg);
        if (cosmosWebScan && cosmosWebScan.ok && cosmosWebScan.status) {
          if (cosmosWebScan.quotaBlocked && BaseEngine.rememberRefreshTriggerAttempt) {
            BaseEngine.rememberRefreshTriggerAttempt(address, cfg, cosmosCacheBefore, arg5);
          }
          return cosmosWebScan.status;
        }
       }
     } catch (eWebScan) {}
     if (typeof _webScanRequiredFor_ === "function" && _webScanRequiredFor_(cfg)) {
       return (typeof _webScanErrorStatus_ === "function") ? _webScanErrorStatus_(cfg) : ("[WEB_SCAN_ERROR] " + Format.now());
     }
     // v4.16.30: gate against direct RPC fallback when web scan is required.
     if (typeof _webScanMustUse_ === "function" && _webScanMustUse_()) {
       if (cosmosCacheBefore && cosmosCacheBefore.updatedAt) return BaseEngine.wrapCacheOnlyMarker(Format.datetime(cosmosCacheBefore.updatedAt), _httpBefore);
       return (typeof _webScanErrorStatus_ === "function") ? _webScanErrorStatus_(cfg) : ("[WEB_SCAN_ERROR] " + Format.now());
     }
    if (typeof _webScanQuotaTripped_ === "function" && _webScanQuotaTripped_()) {
     var cosmosWebQuotaBlocked = BaseEngine.quotaPreCheck(address, cfg);
     if (cosmosWebQuotaBlocked) return cosmosWebQuotaBlocked;
   }
   if (!cosmosForce) {
     var quotaBlocked = BaseEngine.quotaPreCheck(address, cfg);
     if (quotaBlocked) return quotaBlocked;
   }

  // v4.15.50: Busy-guard — avoid 30s GAS timeout (#ERROR!) under heavy load.
  if (!cosmosForce && BaseEngine.isBusy && BaseEngine.isBusy(cfg)) {
    var cosmosBusyTs = "";
    try {
      CacheManager.init();
      var cosmosBusyCache = WalletCache.load(address, null, cfg);
      if (cosmosBusyCache && cosmosBusyCache.updatedAt) cosmosBusyTs = Format.datetime(cosmosBusyCache.updatedAt);
    } catch (eBusy) {}
    return "[BUSY] " + (cosmosBusyTs || Format.now());
  }

  try {
    CacheManager.init();
    cosmosCacheBefore = WalletCache.load(address, null, cfg);
    if (BaseEngine.shouldSkipRefreshForSameTrigger && BaseEngine.shouldSkipRefreshForSameTrigger(address, cfg, cosmosCacheBefore, forceFull, arg5)) {
      var cosmosSkipTs = WalletCache.getLastRunUpdateStr(cosmosCacheBefore) || WalletCache.getLastUpdateStr(cosmosCacheBefore);
      return cosmosSkipTs ? BaseEngine.wrapCacheOnlyMarker(cosmosSkipTs, _httpBefore) : ("[NO_CACHE] " + Format.now());
    }
    // v4.15.122: I1 guard — skip if no explicit trigger and cache was updated recently.
    if (BaseEngine.shouldSkipNoTriggerRecentScan && BaseEngine.shouldSkipNoTriggerRecentScan(address, cfg, cosmosCacheBefore, forceFull, arg5)) {
      var cosmosFreshTs = WalletCache.getLastRunUpdateStr(cosmosCacheBefore) || WalletCache.getLastUpdateStr(cosmosCacheBefore);
      return cosmosFreshTs ? BaseEngine.wrapCacheOnlyMarker("[FRESH] " + cosmosFreshTs, _httpBefore) : ("[NO_CACHE] " + Format.now());
    }
 } catch (eLatch) {}

 // v4.15.3: Capture scan errors instead of swallowing silently
 var refreshError = null;
 try { this.getWalletAssets(address, forceFull, cfg, walletNames); } catch (e) {
   refreshError = String(e && (e.message || e) || "refresh_error");
 }
 try {
    CacheManager.init();
    var cache = WalletCache.load(address, null, cfg);
    var _cosmosRefreshTrigger = BaseEngine.normalizeRefreshTrigger ? BaseEngine.normalizeRefreshTrigger(arg5) : String(arg5 || "").trim();
    if (_cosmosRefreshTrigger && cache) {
      cache.last_refresh_trigger = _cosmosRefreshTrigger;
      try { WalletCache.save(address, cache, cfg); } catch (eSaveTrigger) {}
    }
    var ts = WalletCache.getLastRunUpdateStr(cache) || WalletCache.getLastUpdateStr(cache);
   // v4.15.19: Add [CACHE_ONLY] marker if no HTTP calls were made during scan
   if (ts) return BaseEngine.wrapCacheOnlyMarker(ts, _httpBefore);
   if (refreshError) return "[ERROR] " + refreshError.substring(0, 200);
   return "[NO_CACHE] " + Format.now();
 } catch (e) {
   if (refreshError) return "[ERROR] " + refreshError.substring(0, 200);
   return "[NO_CACHE] " + Format.now();
 }
};

CosmosEngine.getStats = function(address, rpcOrConfig, tokensRangeOrWalletNames, forceFull, triggerRefresh, config, walletNames) {
 var cfg;
 if (rpcOrConfig && typeof rpcOrConfig === 'object' && (rpcOrConfig.CHAIN || rpcOrConfig.API || rpcOrConfig.CACHE)) {
 cfg = CosmosConfigBuilder.build(rpcOrConfig || {});
 } else { cfg = CosmosConfigBuilder.build(config || {}); }
 
 try {
 if (!address) return [["Metric", "Value"], ["Error", "Missing address"]];
 CacheManager.init();
 var timer = createTimer((cfg && cfg.TIMEOUTS && cfg.TIMEOUTS.MAX_EXECUTION_MS) || 30000);
 var cache = WalletCache.load(address, timer, cfg);
 var chainLabel = (cfg.CHAIN && (cfg.CHAIN.DISPLAY_NAME || cfg.CHAIN.NAME)) 
 ? ("Ledger - " + (cfg.CHAIN.DISPLAY_NAME ? String(cfg.CHAIN.DISPLAY_NAME).replace(/^Ledger\s*-\s*/i, "") : String(cfg.CHAIN.NAME))) 
 : "Ledger - Cosmos";

 // === BASEENGINE: Use shared stats builder (returns 2 columns) ===
 var out = BaseEngine.buildStatsBase(address, cache, cfg, chainLabel, "COSMOS", timer);
 
 // Cosmos-specific: RPC endpoint info
 if (cfg.API && cfg.API.REST_URL) out.push(["RPC.primary", String(cfg.API.REST_URL).substring(0, 60)]);
 
 return out;
 } catch (e) { return [["Metric", "Value"], ["Error", String(e.message || e)]]; }
};
