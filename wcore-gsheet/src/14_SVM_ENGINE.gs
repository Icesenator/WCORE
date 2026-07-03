/************************************************************
 * 14_SVM_ENGINE.gs (v4.15.15) - Solana Virtual Machine Engine
 *
 * v4.15.15 - budget guard: forceFull rétrogradé si HTTP >70% (_normalizeForceWithBudgetGuard_)
 * v4.15.14 - FIX: Align force/activityForced handling with EVM
 *   - budget.force now surfaces forceFull=YES in INFO_ROT when C1=TRUE.
 *   - force/activityForced suppresses token cache preservation on empty token scans.
 *
 * v4.14.11 - FIX: Ne plus effacer state.priceMap[nativeKey] après échec Llama
 *   en autoForced/dueFullPrice. Même anti-pattern que le pre-delete EVM fixé
 *   en v4.15.7 côté EVM. La fallback préservée peut réutiliser l'ancien prix
 *   cached plutôt que de laisser une cellule vide.
 *
 * v4.14.10 - FIX: Native balance cache fallback when getBalance RPC fails
 *   If getBalance returns error but token fetch succeeds, nativeBalance was
 *   set to 0 and saved to cache — overwriting the correct previous value.
 *   Now falls back to cached native balance when RPC fails (same pattern
 *   as token protection at lines 580-601).
 *
 * v4.14.9 - FIX: Parallel RPC calls via fetchAll to fix SOL balance=0
 *   GAS ignores UrlFetchApp.fetch() timeout param — sequential calls
 *   could block 10-15s each, causing 30s GAS limit to expire before
 *   completing balance fetch. Now uses fetchAll for parallel calls.
 *   Also added solana-rpc.publicnode.com as 3rd Solana endpoint.
 *
 * MIGRATED TO BaseEngine - Unified execution for SVM chains.
 *
 * v4.14.0 - OPT: SVM now loads/saves GlobalPriceCache for cross-chain price sharing
 *   Solana prices are now shared between Ledger-Solana, Seeker-Solana, Layer3-Solana etc.
 *   Also merges GPC prices on startup (with TTL freshness check via BaseEngine).
 *
 * v4.13.9 - FIX: forceFull now bypasses L1 price cache for fresh prices
 *   Same fix as EVM v4.13.10: skipL1 on forceFull ensures DexScreener/Jupiter
 *   are always called for fresh USD prices on tokens with non-stablecoin pairs.
 *
 * v4.13.8 - FIX: SVM metadata loss causing partial cycles in loop
 *   - Use WalletCache metadata as fallback during token resolve
 *   - Previously, metadata resolved in cycle N was lost in cycle N+1 (RPC returns no meta)
 *   - Now cachedMetaByMint preserves symbol/name/decimals across cycles
 *
 * v4.13.7 - CRITICAL FIX: Prevent cache wipe on RPC failure
 *   - fallbackToCache was overwriting state.assets with incomplete data
 *   - When all RPCs fail, assets=[native only] → cache save loses all SPL tokens
 *   - Fix: Preserve cached assets when RPCs return no token data
 *
 * v4.13.5 - CRITICAL FIX: Add HTTP timeout to SvmRpcClient.call
 *   - UrlFetchApp.fetch was using default ~60s timeout (no timeout param)
 *   - With 4 Solana RPCs failing, cascade exceeded 30s GAS limit → #ERROR!
 *   - Now uses SVM_DEFAULT_CONFIG.TIMEOUTS.HTTP_MS (2000ms) per RPC call
 *   - Worst case 4 RPCs × 2s = 8s, safely within 30s budget
 *   - Fogo was unaffected (fast single RPC), Solana chains all broken since ~12:00
 *
 * v4.13.4 - METADATA CLEANUP + CYCLE COMPLETENESS
 * - FIX: "SPL"/"SPL Token" placeholders replaced with empty strings
 *   These generic labels provided no useful info to the user
 * - FIX: Rotation.cycle = DONE even when tokens had no metadata
 *   Now cycle = partial when any token with balance lacks symbol/name
 * - Added sanitization in both getWalletAssets and getCachedWalletAssets
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
 * (Changelog v4.11.0..v4.13.0: 4 entries removed for brevity)
 * checkAutoForce, checkMinRefresh, checkTooOld,
 * restoreFromCache, getFxRate, fallbackToCache, buildStatsBase
 * - CODE REDUCTION: ~150 lines saved
 *
 * DEPENDENCIES: 10A_BASE_ENGINE.gs (must be loaded before)
 ************************************************************/

// ============================================================
// AUTO-REGISTRATION
// ============================================================
if (typeof ModuleRegistry !== 'undefined') {
  ModuleRegistry.register("SVM_ENGINE", SVM_ENGINE_VERSION, {
    description: "SVM Engine with parallel RPC calls (fetchAll) and GlobalPriceCache sharing",
    dependencies: ["BASE_ENGINE", "CACHE_CORE"]
  });
}

// ============================================================
// MODULE VERSION (for diagnostics)
// ============================================================
var SVM_ENGINE_VERSION = "4.15.66";

// ============================================================
// SVM CONFIG DEFAULTS
// ============================================================

var SVM_DEFAULT_CONFIG = {
 TIMEOUTS: {
 MAX_EXECUTION_MS: 30000, HTTP_MS: 2000, SAFE_MARGIN_MS: 750,
 SAFE_SAVE_MARGIN_MS: 1500, SAFE_PRICE_MARGIN_MS: 6500,
 NATIVE_PRICE_MIN_LEFT_MS: 5000, HARD_GUARD_MS: 24000, HARD_PRICE_CUTOFF_MS: 4500
 },
 CACHE: {
 WALLET_TTL_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.WALLET_TTL_MS : 86400000,
 PRICE_TTL_MS: 43200000,
 MIN_REFRESH_INTERVAL_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.MIN_REFRESH_INTERVAL_MS : 60000,
 TOO_OLD_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.TOO_OLD_MS : 172800000,
 AUTO_FORCE_FULL_SCAN_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.AUTO_FORCE_FULL_SCAN_MS : 86400000,
 AUTO_FORCE_FULL_PRICE_MS: 86400000
 },
 LIMITS: { MAX_TOKENS_RANGE_SCAN: 500, MAX_PRICE_TARGETS: 180 },
 RPC: { COMMITMENT: "confirmed" },
 CHAIN: {
 VM: "SVM", NAME: "Solana", NATIVE_SYMBOL: "SOL", NATIVE_NAME: "Solana",
 NATIVE_DECIMALS: 9, NATIVE_LLAMA_ID: "coingecko:solana",
 NATIVE_GECKO_ID: "solana", DEX_SLUG: "solana", GT_NETWORK: "solana"
 }
};

// ============================================================
// SVM CONFIG BUILDER
// ============================================================

var SvmConfigBuilder = {
 build: function(chainConfig) {
 if (!chainConfig) return Obj.deepClone(SVM_DEFAULT_CONFIG);
 return Obj.deepMerge(Obj.deepClone(SVM_DEFAULT_CONFIG), chainConfig);
 },
 generateKeys: function(chainName) {
 var prefix = String(chainName).toUpperCase();
 return {
 PREFIX: prefix + "_CACHE_", GLOBAL_PRICE: prefix + "_GLOBAL_PRICE_CACHE",
 META: prefix + "_META_CACHE", RPC_HEALTH: prefix + "_RPC_HEALTH_CACHE",
 LOCK_SUFFIX: "_LOCK", DYNAMIC_BUDGET_PREFIX: prefix + "_DYNAMIC_BUDGET_STATS_",
 NATIVE_PRICE: "native@" + String(chainName).toLowerCase().replace(/_/g, "-")
 };
 }
};

// ============================================================
// SVM RPC CLIENT
// ============================================================

var SvmRpcClient = {
 _httpTimeoutMs: (SVM_DEFAULT_CONFIG.TIMEOUTS && SVM_DEFAULT_CONFIG.TIMEOUTS.HTTP_MS) || 2500,
 _maxFallbackMs: 8000,

 // v4.14.9: Single RPC call (kept for compatibility)
 call: function(rpcUrl, method, params) {
 try {
 var payload = { jsonrpc: "2.0", id: 1, method: method, params: params || [] };
 var options = { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true };
 var response = UrlFetchApp.fetch(rpcUrl, options);
 var json = JSON.parse(response.getContentText());
 if (json && json.error) return { error: json.error.message || "RPC error", rpc: rpcUrl };
 return { result: json ? json.result : null, rpc: rpcUrl };
 } catch (e) { return { error: String(e.message || e), rpc: rpcUrl }; }
 },

 // v4.14.9: PARALLEL-FIRST RPC calls via fetchAll
 // GAS ignores `timeout` param in UrlFetchApp.fetch() — sequential calls can block 10-15s each.
 // fetchAll fires all RPCs simultaneously: total time = slowest RPC, not sum of all.
 callWithFallback: function(rpcUrls, method, params) {
 if (!rpcUrls || !rpcUrls.length) return { error: "No RPC URLs", attempts: 0, errors: [] };
 var errors = [];

 // Build parallel requests
 var payloadStr = JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params || [] });
 var requests = [];
 for (var i = 0; i < rpcUrls.length; i++) {
  requests.push({ url: rpcUrls[i], method: "post", contentType: "application/json", payload: payloadStr, muteHttpExceptions: true });
 }

 try {
  var responses = UrlFetchApp.fetchAll(requests);
  for (var r = 0; r < responses.length; r++) {
  try {
   var json = JSON.parse(responses[r].getContentText());
   if (json && !json.error && json.result !== undefined && json.result !== null) {
   return { result: json.result, rpc: rpcUrls[r], rpcIndex: r, attempts: r + 1, errors: errors };
   }
   errors.push({ rpc: rpcUrls[r], error: (json && json.error) ? (json.error.message || "RPC error") : "null result" });
  } catch (eParse) {
   errors.push({ rpc: rpcUrls[r], error: "Parse error: " + String(eParse.message || eParse).substring(0, 50) });
  }
  }
 } catch (eFetchAll) {
  errors.push({ error: "fetchAll error: " + String(eFetchAll.message || eFetchAll).substring(0, 80) });
 }

 return { error: "All RPCs failed", attempts: rpcUrls.length, errors: errors, lastError: errors.length > 0 ? errors[errors.length - 1].error : "unknown" };
 },

  // v4.15.42: Native balance consensus for SVM (multi-RPC vote)
  // Replaces simple first-success with majority vote to prevent stale-RPC zero balances
  getBalanceWithConsensus: function(rpcUrls, address, commitment) {
    if (!rpcUrls || rpcUrls.length < 2) {
      var params = [address]; if (commitment) params.push({ commitment: commitment });
      return this.callWithFallback(rpcUrls, "getBalance", params);
    }
    var params = [address]; if (commitment) params.push({ commitment: commitment });
    var payloadStr = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: params || [] });
    var requests = [];
    for (var i = 0; i < rpcUrls.length; i++) {
      requests.push({ url: rpcUrls[i], method: "post", contentType: "application/json", payload: payloadStr, muteHttpExceptions: true });
    }
    var votes = {};
    var errors = [];
    var bestValue = null, bestRpc = null, maxCount = 0;
    try {
      var responses = UrlFetchApp.fetchAll(requests);
      for (var r = 0; r < responses.length; r++) {
        try {
          var json = JSON.parse(responses[r].getContentText());
          if (json && !json.error && json.result && json.result.value != null) {
            var val = String(json.result.value);
            votes[val] = (votes[val] || 0) + 1;
            if (votes[val] > maxCount) { maxCount = votes[val]; bestValue = val; bestRpc = rpcUrls[r]; }
          } else {
            errors.push({ rpc: rpcUrls[r], error: (json && json.error) ? (json.error.message || "RPC error") : "null result" });
          }
        } catch (eParse) {
          errors.push({ rpc: rpcUrls[r], error: "Parse error" });
        }
      }
    } catch (eFetchAll) {
      errors.push({ error: "fetchAll error: " + String(eFetchAll.message || eFetchAll).substring(0, 80) });
    }
    if (bestValue !== null) {
      return { result: { value: Number(bestValue) }, rpc: bestRpc, attempts: rpcUrls.length, consensus: maxCount + "/" + rpcUrls.length, errors: errors };
    }
    return { error: "All RPCs failed", attempts: rpcUrls.length, errors: errors, lastError: errors.length > 0 ? errors[errors.length - 1].error : "unknown" };
  },

  getBalanceWithFallback: function(rpcUrls, address, commitment) {
  var params = [address]; if (commitment) params.push({ commitment: commitment });
  return this.callWithFallback(rpcUrls, "getBalance", params);
  },

 getTokenAccountsByOwnerWithFallback: function(rpcUrls, owner, commitment) {
 var params = [owner, { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }, { encoding: "jsonParsed" }];
 if (commitment) params[2].commitment = commitment;
 return this.callWithFallback(rpcUrls, "getTokenAccountsByOwner", params);
 }
};

// ============================================================
// INTERNAL HELPERS
// ============================================================

function _svmHex(bytes) { var out = ""; for (var i = 0; i < bytes.length; i++) { var b = bytes[i]; if (b < 0) b += 256; out += (b < 16 ? "0" : "") + b.toString(16); } return out; }
function _svmWalletKey(address) { try { var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(address || ""), Utilities.Charset.UTF_8); return "svm_" + _svmHex(digest); } catch (e) { return "svm_" + String(address || "").length; } }
function _svmChainName(address, config, walletNames) { var base = (config && config.CHAIN && config.CHAIN.NAME) ? String(config.CHAIN.NAME) : "Solana"; try { if (walletNames && typeof walletNames.get === "function") return walletNames.get(String(address || ""), base); } catch (e) {} return "Ledger - " + base; }
function _svmIsValidAddress(address) { if (!address || typeof address !== "string") return false; var s = address.trim(); return (s.length >= 32 && s.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(s)); }
function _svmIsBase58(s) { if (!s) return false; s = String(s).trim(); return (s.length >= 32 && s.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(s)); }

function _svmParseTokensRange(tokensRange, config) {
 if (!tokensRange) return [];
 var result = [], seen = {}, maxScan = (config && config.LIMITS && config.LIMITS.MAX_TOKENS_RANGE_SCAN) || 500;
 
 if (typeof tokensRange === "string") {
 var raw = String(tokensRange).trim(); if (!raw) return [];
 if (TokenRange && TokenRange.isA1Reference && TokenRange.isA1Reference(raw)) {
 var values = TokenRange.readFromA1(raw, maxScan, config);
 if (values && Array.isArray(values)) tokensRange = values; else return [];
 } else {
 var parts = raw.split(",");
 for (var i = 0; i < parts.length && result.length < maxScan; i++) {
 var part = String(parts[i]).trim(); if (!part) continue;
 var subParts = part.split(":"); var mint = String(subParts[0] || "").trim();
 if (!_svmIsBase58(mint) || seen[mint]) continue; seen[mint] = true;
 result.push({ contract: mint, symbol: subParts[1] ? String(subParts[1]).trim() : null, name: subParts[2] ? String(subParts[2]).trim() : null, decimals: subParts[3] ? parseInt(subParts[3], 10) : null });
 }
 return result;
 }
 }
 
 if (Array.isArray(tokensRange)) {
 for (var j = 0; j < tokensRange.length && result.length < maxScan; j++) {
 var row = tokensRange[j]; var cell = (row && row.length) ? row[0] : null;
 if (cell === null || cell === undefined) break;
 if (typeof cell === "string" && cell.charAt(0) === "#") continue;
 var mint2 = String(cell).replace(/\u00A0/g, " ").trim();
 if (!mint2) break; if (mint2.toLowerCase() === "native") continue;
 if (!_svmIsBase58(mint2)) continue;
 if (!seen[mint2]) { seen[mint2] = true; result.push({ contract: mint2, symbol: null, name: null, decimals: null }); }
 }
 }
 return result;
}

// ============================================================
// SVM TOKEN METADATA HELPER
// ============================================================

var SvmTokenMeta = (function() {
 var NS = "__SVM_MINT_META__", MAX = 800;
 function _load(t, c) { var o = {}; try { o = MetaCache.load(t, c) || {}; } catch (e) {} if (!o[NS]) o[NS] = {}; return o; }
 function _save(o, c) { try { MetaCache.save(o, null, c); } catch (e) {} }
 function _ph(s) { s = String(s || "").trim(); return !s || s === "SPL" || s.toUpperCase() === "SPLTOKEN" || s === "Unknown"; }
 function _pn(n) { n = String(n || "").trim(); return !n || n === "SPL Token" || n === "Unknown Token"; }
 function _mg(b, a) { b = b || {}; a = a || {}; var o = { symbol: b.symbol || "", name: b.name || "", decimals: b.decimals != null ? b.decimals : null }; if ((_ph(o.symbol) || !o.symbol) && a.symbol && !_ph(a.symbol)) o.symbol = String(a.symbol).trim(); if ((_pn(o.name) || !o.name) && a.name && !_pn(a.name)) o.name = String(a.name).trim(); if (!Num.isValid(o.decimals) && Num.isValid(a.decimals)) o.decimals = Number(a.decimals) | 0; return o; }
 
 function resolve(m, ov, t, c, skipApi) {
 m = String(m || "").trim(); if (!_svmIsBase58(m)) return { symbol: "", name: "", decimals: null };
 var mt = { symbol: "", name: "", decimals: null }; if (ov) mt = _mg(mt, ov);
 var co = _load(t, c); try { var l = co[NS] ? co[NS][m] : null; if (l) mt = _mg(mt, l); } catch (e) {}
 if ((!_ph(mt.symbol) && !_pn(mt.name)) || skipApi) return mt;
 try { if (typeof PriceSources !== 'undefined' && PriceSources.getGeckoTerminalMeta) { var gtMeta = PriceSources.getGeckoTerminalMeta(m, t, c); if (gtMeta) { mt = _mg(mt, gtMeta); if (!_ph(mt.symbol) || !_pn(mt.name)) learn(m, mt, t, c); } } } catch (eGt) {}
 if (!_ph(mt.symbol) && !_pn(mt.name)) return mt;
 try { if (typeof PriceSources !== 'undefined' && PriceSources.getJupiterTokenMeta) { var jupMeta = PriceSources.getJupiterTokenMeta(m, t, c); if (jupMeta) { mt = _mg(mt, jupMeta); if (!_ph(mt.symbol) || !_pn(mt.name)) learn(m, mt, t, c); } } } catch (eJup) {}
 return mt;
 }
 
 function learn(m, p, t, c) {
 if (!m || !p) return; m = String(m).trim(); if (!_svmIsBase58(m)) return;
 var o = _load(t, c), mm = o[NS] || (o[NS] = {}), ex = mm[m] || {}, up = _mg(ex, { symbol: p.symbol || "", name: p.name || "" });
 var imp = (!_ph(up.symbol) && _ph(ex.symbol)) || (!_pn(up.name) && _pn(ex.name));
 if (imp) { up.ts = Date.now(); mm[m] = up; if (Object.keys(mm).length > MAX) { var a = []; for (var k in mm) a.push({ k: k, ts: mm[k].ts || 0 }); a.sort(function(x, y) { return x.ts - y.ts; }); for (var i = 0; i < a.length - MAX; i++) delete mm[a[i].k]; } _save(o, c); }
 }
 return { resolve: resolve, learnFromPrice: learn };
})();

// ============================================================
// SVM ENGINE (v4.11.0 BaseEngine Migration)
// ============================================================

var SvmEngine = {

 getWalletAssets: function(address, rpc, tokensRange, forceFull, triggerRefresh, config, walletNames) {
 config = config || SVM_DEFAULT_CONFIG;
 var force = (typeof _normalizeForceWithBudgetGuard_ === 'function') ? _normalizeForceWithBudgetGuard_(forceFull) : Bool.parse(forceFull);

 // === BASEENGINE: Initialize ===
 BaseEngine.initCaches();
 var state = BaseEngine.initExecution(config);
 state.force = force;
 
 // === v4.13.5: EARLY QUOTA CHECK (centralized) ===
 // v4.14.9: forceFull still runs testOnce() for auto-recovery, but doesn't return cached
 if (force) {
   if (typeof QuotaCircuitBreaker !== 'undefined') {
     if (QuotaCircuitBreaker.disableTripping) QuotaCircuitBreaker.disableTripping();
     if (QuotaCircuitBreaker.reset) QuotaCircuitBreaker.reset();
   }
 } else if (BaseEngine.testQuotaBlocked()) {
   return this.getCachedWalletAssets(address, config, walletNames);
 }
 
 var cache = null, assets = [], lastError = "", allContractsCount = 0;

 try {
 if (!address) return OutputBuilder.error((config.CHAIN && config.CHAIN.NAME) || "Solana", "Missing address", config);
 address = String(address).trim();
 if (!_svmIsValidAddress(address)) return OutputBuilder.error((config.CHAIN && config.CHAIN.NAME) || "Solana", "Invalid address", config);

 var chainName = _svmChainName(address, config, walletNames);
 var walletKey = _svmWalletKey(address);

 cache = WalletCache.load(walletKey, state.timer, config);
 if (!cache) cache = BaseEngine.createEmptyCache(config);

 // === BASEENGINE: Cache version check ===
 cache = BaseEngine.checkCacheVersion(cache, config, state);
 if (!cache) cache = BaseEngine.createEmptyCache(config);
 state.cache = cache;

 // === BASEENGINE: Restore from cache ===
 BaseEngine.restoreFromCache(cache, state);

 // === v4.13.6: Evict stale prices ===
 BaseEngine.evictStalePrices(state, config);

 // === v4.14.0: Merge global prices (cross-chain sharing) ===
 var globalPrices = null;
 try { globalPrices = GlobalPriceCache.load(state.timer, config); } catch (eGpc) {}
 BaseEngine.mergeGlobalPrices(globalPrices, state, config);

 // === v4.13.0: SIMPLIFIED BUDGET (no complex profiles for SVM) ===
 // SVM uses single RPC call to get all tokens - no rotation needed
 var budget = {
    profileName: "SIMPLE",
    force: !!force,
    dueFullScan: !!force,
    dueFullPrice: !!force,
   allowPrices: true,
   allowDexBulk: true,
   allowGT: true,
   maxPriceLookups: 8
 };
 var autoForceResult = BaseEngine.checkAutoForce(cache, config, state, force, address);
 if (autoForceResult.dueFullScan) { budget.dueFullScan = true; budget.dueFullPrice = true; }

 // === BASEENGINE: Min refresh check ===
 if (!BaseEngine.checkMinRefresh(cache, config, state, force)) {
 return this.getCachedWalletAssets(address, config, walletNames);
 }

 // === BASEENGINE: Too-old check ===
 if (BaseEngine.checkTooOld(cache, config, state)) { budget.dueFullScan = true; budget.dueFullPrice = true; }

 // Build RPC list
 var rpcUrls = [];
 var userRpc = String(rpc || "").trim(); if (userRpc) rpcUrls.push(userRpc);
 if (config.RPC && config.RPC.ENDPOINTS) { for (var ri = 0; ri < config.RPC.ENDPOINTS.length; ri++) { var ep = config.RPC.ENDPOINTS[ri]; if (ep && rpcUrls.indexOf(ep) === -1) rpcUrls.push(ep); } }
 if (rpcUrls.length === 0) return OutputBuilder.error(chainName, "No RPC URL", config);

 var commitment = (config.RPC && config.RPC.COMMITMENT) || "confirmed";
 var rpcUsed = "", rpcAttempts = 0;

 // Fallback function
 // v4.13.7 FIX: Don't overwrite cached assets with incomplete data on RPC failure
 // Previously, state.assets = assets would replace cached tokens with just [native]
 // when RPCs failed, causing total cache loss on next save
 var self = this;
 function fallbackToCache(reason) {
 var hasRealTokens = assets.length > 1; // More than just native = RPC partially succeeded
 if (hasRealTokens) {
   state.assets = assets;
 } else if (state.cache && state.cache.assets && state.cache.assets.length > 0) {
   state.assets = state.cache.assets; // Preserve cached assets on total RPC failure
 } else {
   state.assets = assets;
 }
 state.priceMap = state.priceMap || {}; state.priceTsMap = state.priceTsMap || {};
 try { if (state.cache) { state.cache.last_error = String(reason || "").substring(0, 500); state.cache.last_error_ts = Date.now(); WalletCache.save(walletKey, state.cache, config); } } catch (e) {}
 var out = BaseEngine.fallbackToCache(walletKey, reason, state, config, chainName, "SVM");
 try { PriceRunCache.reset(); } catch (e) {}
 return out;
 }

 // === BASEENGINE: Get FX rate ===
 BaseEngine.getFxRate(state, cache);

 // Native balance
 state._tBalanceStart = Date.now();
 var nativeBalance = 0, nativePriceEur = null, nativeKey = (config.KEYS && config.KEYS.NATIVE_PRICE) || "native";
 try {
  var balResp = SvmRpcClient.getBalanceWithConsensus(rpcUrls, address, commitment);
 if (balResp && balResp.result && balResp.result.value != null) {
 nativeBalance = Number(balResp.result.value) / Math.pow(10, (config.CHAIN && config.CHAIN.NATIVE_DECIMALS) || 9);
 rpcUsed = balResp.rpc || ""; rpcAttempts = balResp.attempts || 1;
 }
 if (balResp && balResp.error) {
 // v4.14.10: Fallback to cached native balance when RPC fails
 // Prevents overwriting correct balance with 0 on transient RPC errors
 lastError = "Native: " + String(balResp.lastError || balResp.error).substring(0, 50);
 if (nativeBalance === 0 && cache && cache.assets && Array.isArray(cache.assets)) {
  for (var cn = 0; cn < cache.assets.length; cn++) {
   if (cache.assets[cn] && cache.assets[cn].contract === "native" && cache.assets[cn].balance > 0) {
    nativeBalance = cache.assets[cn].balance;
    lastError += " [cached fallback]";
    break;
   }
  }
 }
 }
 state.balanceTsMap["native"] = state.nowMs;
 } catch (e) { lastError = "Native balance error: " + String(e); }

 state._balMs = Date.now() - state._tBalanceStart;
 state._tPriceStart = Date.now();

 // Native price
 try {
 var llamaId = (config.CHAIN && config.CHAIN.NATIVE_LLAMA_ID) || "coingecko:solana";
 var nativeUsd = PriceSources.llamaPriceUsd(llamaId, state.timer, config);
 if (Num.isValidPositive(nativeUsd) && Num.isValidPositive(state.fxRate)) nativePriceEur = nativeUsd * state.fxRate;
 } catch (e) {}

 if (Num.isValidPositive(nativePriceEur)) {
 state.priceMap[nativeKey] = nativePriceEur; state.priceTsMap[nativeKey] = state.nowMs;
 state.priceMap["native"] = nativePriceEur; state.priceTsMap["native"] = state.nowMs;
 state.pricesFetched++;
 }
 // v4.14.11 FIX: Ne plus supprimer le cache natif après un fetch échoué même
 // en mode autoForced/dueFullPrice. L'ancien prix reste disponible pour la
 // restitution (cf. principe preserve-cache v4.15.6 / feedback memory).

 assets.push({ contract: "native", symbol: (config.CHAIN && config.CHAIN.NATIVE_SYMBOL) || "SOL", name: (config.CHAIN && config.CHAIN.NATIVE_NAME) || "Solana", decimals: (config.CHAIN && config.CHAIN.NATIVE_DECIMALS) || 9, balance: nativeBalance, price_eur: nativePriceEur });

 // Token fetch (SVM SINGLE-CALL)
 var tokensList = _svmParseTokensRange(tokensRange, config);
 var tokensScanned = 0, tokensWithBalance = 0;
 var hasFilter = tokensList.length > 0;
 var mintFilter = {}; for (var tf = 0; tf < tokensList.length; tf++) { var tkn = tokensList[tf]; if (tkn && tkn.contract) mintFilter[tkn.contract] = tkn; }

 try {
 if (BaseEngine.hasTimeLeft(state, config.TIMEOUTS.SAFE_MARGIN_MS)) {
 var tokenResp = SvmRpcClient.getTokenAccountsByOwnerWithFallback(rpcUrls, address, commitment);
 if (tokenResp && tokenResp.result && tokenResp.result.value && Array.isArray(tokenResp.result.value)) {
 var tokenAccounts = tokenResp.result.value;
 tokensScanned = tokenAccounts.length;
 if (!rpcUsed && tokenResp.rpc) rpcUsed = tokenResp.rpc;
 
 var balanceByMint = {};
 for (var ta = 0; ta < tokenAccounts.length; ta++) {
 var acc = tokenAccounts[ta];
 if (!acc || !acc.account || !acc.account.data || !acc.account.data.parsed || !acc.account.data.parsed.info) continue;
 var info = acc.account.data.parsed.info;
 var tMint = info.mint; if (!tMint) continue;
 if (hasFilter && !mintFilter[tMint]) continue;
 var tDecimals = (info.tokenAmount && info.tokenAmount.decimals != null) ? info.tokenAmount.decimals : 0;
 var tRawAmt = (info.tokenAmount && info.tokenAmount.amount) ? Number(info.tokenAmount.amount) : 0;
 if (!balanceByMint[tMint]) balanceByMint[tMint] = { decimals: tDecimals, rawAmount: 0 };
 balanceByMint[tMint].rawAmount += tRawAmt;
 }
 
 // v4.13.8: Build metadata fallback from previous cache
 var cachedMetaByMint = {};
 if (cache && cache.assets && Array.isArray(cache.assets)) {
   for (var cm = 0; cm < cache.assets.length; cm++) {
     var ca = cache.assets[cm];
     if (ca && ca.contract && ca.contract !== "native" && (ca.symbol || ca.name)) {
       cachedMetaByMint[ca.contract] = { symbol: ca.symbol || "", name: ca.name || "", decimals: ca.decimals };
     }
   }
 }

 var mintKeys = Object.keys(balanceByMint);
 for (var mk = 0; mk < mintKeys.length; mk++) {
 var mint = mintKeys[mk]; var mintData = balanceByMint[mint];
 if (mintData.rawAmount <= 0) continue;
 var bal = mintData.rawAmount / Math.pow(10, mintData.decimals);
 if (!Num.isPositive(bal)) continue;
 tokensWithBalance++;
 var tokenDef = mintFilter[mint] || {};
 var cachedMeta = cachedMetaByMint[mint];
 var overrides = {
   symbol: tokenDef.symbol || (cachedMeta && cachedMeta.symbol) || "",
   name: tokenDef.name || (cachedMeta && cachedMeta.name) || "",
   decimals: mintData.decimals
 };
 var meta = SvmTokenMeta.resolve(mint, overrides, state.timer, config, true);
 assets.push({ contract: mint, symbol: meta.symbol || overrides.symbol || "", name: meta.name || overrides.name || "", decimals: mintData.decimals, balance: bal, price_eur: null });
 state.balanceTsMap[mint] = state.nowMs;
 }
 }
 }
 } catch (eTokens) { lastError = "Token fetch error: " + String(eTokens.message || eTokens).substring(0, 100); }

 allContractsCount = tokensWithBalance;

 // SPL pricing
 var splPricesFetched = 0;
 try {
 if (budget.allowPrices && assets.length > 1) {
 var targets = [];
 for (var j = 1; j < assets.length; j++) { var at = assets[j]; if (at && at.contract !== "native" && Num.isPositive(at.balance) && _svmIsBase58(at.contract)) targets.push(at.contract); }
 if (targets.length > 0) {
 var workerCacheApplied = BaseEngine.applyPricingWorkerCache(targets, assets, state, config);
 if (workerCacheApplied && workerCacheApplied.remaining) targets = workerCacheApplied.remaining;
 budget.pricingMode = state.pricingMode || BaseEngine.getPricingMode(state);
 var priceUsdMap = BulkPriceFetch.fetch(targets, { dex: budget.allowDexBulk, gt: budget.allowGT, skipL1: state.force }, state.timer, config);
 for (var k = 0; k < assets.length; k++) {
 if (state.timer.isLow(config.TIMEOUTS.SAFE_MARGIN_MS || 750)) break;
 var a3 = assets[k]; if (!a3 || a3.contract === "native" || !Num.isPositive(a3.balance)) continue;
 var k0 = a3.contract, kl = k0.toLowerCase();
 var px = priceUsdMap[kl] || priceUsdMap[k0];
 if (px && Num.isValidPositive(px.priceUsd) && Num.isValidPositive(state.fxRate)) {
 var pE = px.priceUsd * state.fxRate;
 if (Num.isValidPositive(pE)) {
 a3.price_eur = pE; state.priceMap[k0] = pE; state.priceTsMap[k0] = state.nowMs;
 splPricesFetched++;
 if ((!a3.symbol || a3.symbol === "SPL") && px.symbol) a3.symbol = px.symbol;
 if ((!a3.name || a3.name === "SPL Token") && px.name) a3.name = px.name;
 try { SvmTokenMeta.learnFromPrice(k0, px, state.timer, config); } catch (e) {}
 }
 }
 }
 }
 }
 } catch (e) {}

 state.pricesFetched += splPricesFetched;
 
 // ============================================================
 // KNOWN_TOKENS PRICING (v4.12.5)
 // Apply hardcoded prices for tokens not found by DexScreener/GT
 // This ensures priceMap contains known token prices BEFORE cache save
 // ============================================================
 var knownTokensPriced = 0;
 try {
 var knownTokens = config.KNOWN_TOKENS || {};
 if (Obj.keyCount(knownTokens) > 0 && Num.isValidPositive(state.fxRate)) {
 for (var kt = 0; kt < assets.length; kt++) {
 var assetKt = assets[kt];
 if (!assetKt || assetKt.contract === "native") continue;
 if (Num.isValidPositive(assetKt.price_eur)) continue; // Already priced
 
 var known = knownTokens[assetKt.contract];
 if (!known) continue;
 
 var priceEur = null;
 
 // Stablecoins: use FX rate
 if (known.isStable) {
 if (known.peg === "USD") {
 priceEur = state.fxRate; // 1 USD = fxRate EUR
 } else if (known.peg === "EUR") {
 priceEur = 1.0;
 } else {
 priceEur = state.fxRate; // Default to USD peg
 }
 }
 // Non-stables with hardcoded price
 else if (Num.isValidPositive(known.hardcodedPriceUsd)) {
 priceEur = known.hardcodedPriceUsd * state.fxRate;
 }
 
 if (Num.isValidPositive(priceEur)) {
 assetKt.price_eur = priceEur;
 state.priceMap[assetKt.contract] = priceEur;
 state.priceTsMap[assetKt.contract] = state.nowMs;
 knownTokensPriced++;
 
 // Also update metadata if available
 if (known.symbol && (!assetKt.symbol || assetKt.symbol === "SPL")) {
 assetKt.symbol = known.symbol;
 }
 if (known.name && (!assetKt.name || assetKt.name === "SPL Token")) {
 assetKt.name = known.name;
 }
 }
 }
 }
 } catch (eKnown) {}
 
 if (knownTokensPriced > 0) state.pricesFetched += knownTokensPriced;
 
 state._priceMs = Date.now() - state._tPriceStart;
 budget.pricingMode = budget.pricingMode || BaseEngine.getPricingMode(state);

 // Metadata enrichment
 try {
 var metaEnriched = 0;
 for (var me = 1; me < assets.length && metaEnriched < 10; me++) {
 if (state.timer.isLow(config.TIMEOUTS.SAFE_SAVE_MARGIN_MS || 1500)) break;
 var assetMe = assets[me]; if (!assetMe || assetMe.contract === "native") continue;
 var needsSymbol = !assetMe.symbol || assetMe.symbol === "SPL";
 var needsName = !assetMe.name || assetMe.name === "SPL Token";
 if (needsSymbol || needsName) {
 var enrichedMeta = SvmTokenMeta.resolve(assetMe.contract, null, state.timer, config, false);
 if (enrichedMeta) {
 if (needsSymbol && enrichedMeta.symbol && enrichedMeta.symbol !== "SPL") assetMe.symbol = enrichedMeta.symbol;
 if (needsName && enrichedMeta.name && enrichedMeta.name !== "SPL Token") assetMe.name = enrichedMeta.name;
 metaEnriched++;
 }
 }
 }
 } catch (eMetaEnrich) {}

 if (state.autoForced || budget.dueFullPrice) state.lastFullPriceMs = state.nowMs;
 state.lastFullScanMs = state.nowMs;
 try { if (cache) { cache.last_error = null; cache.last_error_ts = null; } } catch (e) {}

 // PROTECTION: If scan returned 0 tokens but cache had tokens, preserve cached assets
 var cachedAssets = (cache && cache.assets && Array.isArray(cache.assets)) ? cache.assets : [];
 var cachedTokenCount = cachedAssets.length > 1 ? cachedAssets.length - 1 : 0; // Exclude native
 var scanPreserved = false;
 
 if (!force && !state.activityForced && tokensScanned === 0 && tokensWithBalance === 0 && cachedTokenCount > 0) {
 // RPC returned empty but cache had tokens - likely rate-limited
 // Preserve cached tokens, only update native balance
 scanPreserved = true;
 lastError = "RPC returned 0 tokens (cache had " + cachedTokenCount + ") - preserving cached data";
 
 // Keep native from current scan, restore tokens from cache
 var preservedAssets = [assets[0]]; // Native with fresh balance
 for (var pa = 1; pa < cachedAssets.length; pa++) {
 var cachedAsset = cachedAssets[pa];
 if (cachedAsset && cachedAsset.contract && cachedAsset.contract !== "native") {
 preservedAssets.push(cachedAsset);
 }
 }
 assets = preservedAssets;
 tokensWithBalance = assets.length - 1;
 }

 var fullScanStats = { did: true, batches: 1, scanned: tokensScanned, withBalance: tokensWithBalance, scanPreserved: scanPreserved };
 budget.diagTiming = "bal=" + (state._balMs | 0) + "ms; price=" + (state._priceMs | 0) + "ms; found=" + tokensWithBalance + "/" + tokensScanned + (scanPreserved ? " (preserved)" : "");
 budget.diagRpc = "rpc=" + (rpcUsed ? rpcUsed.substring(0, 45) : "N/A") + "; attempts=" + rpcAttempts;

 // Save cache
 var newCache = cache || BaseEngine.createEmptyCache(config);
 newCache.version = config.CACHE_VERSION || 0; newCache.updatedAt = state.nowMs; newCache.last_cache_update = Format.now();
 newCache.wallet_original = address; newCache.assets = assets; newCache.priceMap = state.priceMap; newCache.priceTsMap = state.priceTsMap;
 newCache.balanceTsMap = state.balanceTsMap; newCache.attemptTsMap = state.attemptTsMap; newCache.purgedTsMap = state.purgedTsMap;
 newCache.usd_to_eur_rate = Num.isValidPositive(state.fxRate) ? state.fxRate : null;
 newCache.last_full_scan_ms = state.lastFullScanMs; newCache.last_full_price_ms = state.lastFullPriceMs;
 newCache.last_error = lastError || ""; newCache.last_error_ts = lastError ? state.nowMs : 0;
 
 // v4.13.4: Count tokens with balance but missing real metadata
 // "SPL"/"SPL Token" are legacy placeholders, empty strings are new default
 var svmMissingMeta = 0;
 for (var mm = 0; mm < assets.length; mm++) {
 var mmA = assets[mm];
 if (!mmA || mmA.contract === "native") continue;
 if (!Num.isPositive(mmA.balance)) continue;
 var symMissing = !mmA.symbol || mmA.symbol === "SPL";
 var nameMissing = !mmA.name || mmA.name === "SPL Token";
 if (symMissing || nameMissing) svmMissingMeta++;
 }
 
 // v4.14.2: Count assets with balance but no price — must match Pricing.missing_count from BASE_ENGINE
 // Uses same 3-tier lookup: asset.price_eur → priceMap[key] → priceMap["native"]
 var svmMissingPrices = 0;
 var _svmPm = state.priceMap || {};
 var _svmNatKey = (config.KEYS && config.KEYS.NATIVE_PRICE) ? config.KEYS.NATIVE_PRICE : "native";
 for (var smp = 0; smp < assets.length; smp++) {
 var smpA = assets[smp];
 if (!smpA) continue;
 var smpBal = Number(smpA.balance || 0);
 if (!Num.isPositive(smpBal)) continue;
 var smpContract = smpA.contract || smpA.mint || "";
 var smpPxKey = (smpContract === "native") ? _svmNatKey : smpContract;
 var smpPx = 0;
 if (Num.isValidPositive(smpA.price_eur)) { smpPx = Number(smpA.price_eur); }
 if (!Num.isValidPositive(smpPx) && _svmPm[smpPxKey]) { smpPx = Number(_svmPm[smpPxKey]); }
 if (!Num.isValidPositive(smpPx) && smpContract === "native" && _svmPm["native"]) { smpPx = Number(_svmPm["native"]); }
 if (!Num.isValidPositive(smpPx)) svmMissingPrices++;
 }

 // v4.13.0: SVM always scans all tokens in one RPC call (no rotation)
 // v4.13.4: Cycle NOT complete if metadata is missing
 // v4.14.1: Cycle NOT complete if prices are missing
 newCache.scanStats = {
   fullCycleComplete: svmMissingMeta === 0 && svmMissingPrices === 0,
   totalContracts: tokensScanned || 0,
   scannedCount: tokensScanned || 0,
   cursor: 0,
   hasActivity: false,
   fallbackCount: 0,
   missingMeta: svmMissingMeta,
   missingPrices: svmMissingPrices
 };

 // v4.13.4: Sanitize legacy "SPL"/"SPL Token" placeholders to empty strings
 // Covers both fresh assets and restored cache data
 for (var san = 0; san < assets.length; san++) {
 var sanA = assets[san];
 if (!sanA || sanA.contract === "native") continue;
 if (sanA.symbol === "SPL") sanA.symbol = "";
 if (sanA.name === "SPL Token") sanA.name = "";
 }
 
 var outFull = OutputBuilder.full(chainName, assets, state.priceMap, state.fxRate, budget, "RPC balance", fullScanStats, state.timer, state.rrCursor, allContractsCount, state.pricesFetched, config, state.autoForced, { cacheVersionMismatch: state.cacheVersionMismatch, staleCachePreserved: state._staleCachePreserved, pricingMode: budget.pricingMode || state.pricingMode });

 var infoMeta = [];
 for (var r = 0; r < outFull.length; r++) { var row = outFull[r]; if (row && (row[0] === "META" || (row[0] === chainName && String(row[1] || "").indexOf("INFO") === 0))) infoMeta.push(row); }
 newCache.lastInfoMetaRows = infoMeta;

 WalletCache.save(walletKey, newCache, config);

 // v4.14.0: Save prices to GlobalPriceCache for cross-chain sharing
 if (state.timer.remaining() > 250) {
 try { GlobalPriceCache.save(state.priceMap, state.priceTsMap, config); } catch (eGpc) {}
 }

 // v4.13.0: Removed BudgetStats and ChainBudgetStats tracking
 try { PriceRunCache.reset(); } catch (e) {}

 return outFull;

 } catch (e) {
 var cn = (config && config.CHAIN && config.CHAIN.NAME) || "Solana";
 return fallbackToCache("Exception: " + String(e.message || e));
 }
 },

 getCachedWalletAssets: function(address, config, walletNames) {
 try {
 if (!address) return OutputBuilder.error((config && config.CHAIN && config.CHAIN.NAME) || "Solana", "Missing address", config);
 address = String(address).trim();
 if (!_svmIsValidAddress(address)) return OutputBuilder.error((config && config.CHAIN && config.CHAIN.NAME) || "Solana", "Invalid address", config);
 config = config || SVM_DEFAULT_CONFIG;

 var chainName = _svmChainName(address, config, walletNames);
  var walletKey = _svmWalletKey(address);
  CacheManager.init();
  var cache = WalletCache.load(walletKey, null, config);
  if (!cache) {
  var snap = null;
  try {
  var blocked = (typeof BaseEngine !== 'undefined' && BaseEngine.isSystemBlocked && BaseEngine.isSystemBlocked()) ||
  (typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped());
  if (blocked && typeof OutputSnapshotCache !== 'undefined') snap = OutputSnapshotCache.load(config, walletKey, "NO_CACHE_BLOCKED_QUOTA");
  } catch (eSnapLoad) {}
  if (snap) return snap;
  var emptyCache = (typeof BaseEngine !== "undefined" && BaseEngine.createEmptyCache) ? BaseEngine.createEmptyCache(config) : { assets: [], priceMap: {} };
  emptyCache.wallet_original = address;
  return OutputBuilder.fromCacheFallback(chainName, emptyCache, null, "NO_CACHE_WAITING_REFRESH", config);
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
       WalletCache.save(walletKey, cache, config);
     }
   }
 } catch (eTouchBlocked) {}

 var out = OutputBuilder.fromCacheOnly(chainName, cache, config);

 // v4.13.4: Sanitize legacy "SPL"/"SPL Token" placeholders in output
 for (var san = 0; san < out.length; san++) {
 var sanRow = out[san];
 if (sanRow && sanRow.length >= 3 && sanRow[0] === chainName) {
   if (sanRow[1] === "SPL") sanRow[1] = "";
   if (sanRow[2] === "SPL Token") sanRow[2] = "";
 }
 }

 // Native price fallback
 try {
 var nativeKey = (config.KEYS && config.KEYS.NATIVE_PRICE) || null;
 var fx = (cache && Num.isValidPositive(cache.usd_to_eur_rate)) ? cache.usd_to_eur_rate : null;
 var cachedPriceMap = cache.priceMap || {};
 if (nativeKey && fx) {
 for (var r = 0; r < out.length; r++) {
 var row = out[r];
 if (row && row.length >= 7 && String(row[3]) === "native") {
 if (config.CHAIN && config.CHAIN.NATIVE_SYMBOL) row[1] = config.CHAIN.NATIVE_SYMBOL;
 if (config.CHAIN && config.CHAIN.NATIVE_NAME) row[2] = config.CHAIN.NATIVE_NAME;
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
 out.push(OutputBuilder.metaRow("script_version", config.VERSION || "SVM_v4.13.1"));
  try { if (typeof OutputSnapshotCache !== 'undefined') OutputSnapshotCache.save(config, walletKey, out); } catch (eSnapSave) {}
  return out;
 } catch (e) { return OutputBuilder.error((config && config.CHAIN && config.CHAIN.NAME) || "Solana", String(e.message || e), config); }
 },

 getRefreshStatus: function(address, rpc, tokensRange, forceFull, triggerRefresh, config, walletNames) {
   config = config || SVM_DEFAULT_CONFIG;
    var addr = String(address || "").trim();
    if (!addr) return "N/A";
    var svmCexBusyStatus = BaseEngine.cexBusyStatus ? BaseEngine.cexBusyStatus(_svmWalletKey(addr), config) : "";
    if (svmCexBusyStatus) return svmCexBusyStatus;
    
    // v4.13.3: Centralized quota pre-check via BaseEngine
   // v4.14.5: forceFull bypasses quota check — user explicitly wants fresh data
    var svmForce = (forceFull === false || forceFull === "false" || forceFull === "FALSE") ? false : true;

    // v4.15.122: Load cache BEFORE web scan so the I1 guard (J1 >= B1) can
    // prevent unnecessary rescans (web scan was returning early, bypassing the guard).
    var _httpBefore = BaseEngine.httpSnapshot();
    try {
      CacheManager.init();
      var svmCacheBefore = WalletCache.load(_svmWalletKey(addr), null, config);
      if (BaseEngine.shouldSkipRefreshForSameTrigger && BaseEngine.shouldSkipRefreshForSameTrigger(_svmWalletKey(addr), config, svmCacheBefore, forceFull, triggerRefresh)) {
        var svmSkipTs = (WalletCache.getLastRunUpdateStr ? WalletCache.getLastRunUpdateStr(svmCacheBefore) : "") || WalletCache.getLastUpdateStr(svmCacheBefore);
        return svmSkipTs ? BaseEngine.wrapCacheOnlyMarker(svmSkipTs, _httpBefore) : ("[NO_CACHE] " + Format.now());
      }
      if (BaseEngine.shouldSkipNoTriggerRecentScan && BaseEngine.shouldSkipNoTriggerRecentScan(_svmWalletKey(addr), config, svmCacheBefore, forceFull, triggerRefresh)) {
        var svmFreshTs = (WalletCache.getLastRunUpdateStr ? WalletCache.getLastRunUpdateStr(svmCacheBefore) : "") || WalletCache.getLastUpdateStr(svmCacheBefore);
        return svmFreshTs ? BaseEngine.wrapCacheOnlyMarker("[FRESH] " + svmFreshTs, _httpBefore) : ("[NO_CACHE] " + Format.now());
      }
    } catch (eLatch) {}

      try {
        if (typeof _webScanWallet_ === "function") {
          var svmWebScan = _webScanWallet_(addr, tokensRange, forceFull, config, _svmWalletKey(addr));
          if (svmWebScan && svmWebScan.ok && svmWebScan.status) return svmWebScan.status;
        }
      } catch (eWebScan) {}
      if (typeof _webScanRequiredFor_ === "function" && _webScanRequiredFor_(config)) {
        return (typeof _webScanErrorStatus_ === "function") ? _webScanErrorStatus_(config) : ("[WEB_SCAN_ERROR] " + Format.now());
      }
      if (typeof _webScanQuotaTripped_ === "function" && _webScanQuotaTripped_()) {
       var svmWebQuotaBlocked = BaseEngine.quotaPreCheck(_svmWalletKey(addr), config);
       if (svmWebQuotaBlocked) return svmWebQuotaBlocked;
     }
     if (!svmForce) {
       var quotaBlocked = BaseEngine.quotaPreCheck(_svmWalletKey(addr), config);
       if (quotaBlocked) return quotaBlocked;
     }

    // v4.15.50: Busy-guard — avoid 30s GAS timeout (#ERROR!) under heavy load.
    if (!svmForce && BaseEngine.isBusy && BaseEngine.isBusy(config)) {
      var svmBusyTs = "";
      try {
        CacheManager.init();
        var svmBusyCache = WalletCache.load(_svmWalletKey(addr), null, config);
        if (svmBusyCache && svmBusyCache.updatedAt) svmBusyTs = Format.datetime(svmBusyCache.updatedAt);
      } catch (eBusy) {}
      return "[BUSY] " + (svmBusyTs || Format.now());
    }

    // v4.15.3: Capture scan errors instead of swallowing silently
   var refreshError = null;
   try { this.getWalletAssets(address, rpc, tokensRange, forceFull, triggerRefresh, config, walletNames); } catch (e) {
     refreshError = String(e && (e.message || e) || "refresh_error");
   }
   try {
     CacheManager.init();
      var cache = WalletCache.load(_svmWalletKey(addr), null, config);
      var _svmRefreshTrigger = BaseEngine.normalizeRefreshTrigger ? BaseEngine.normalizeRefreshTrigger(triggerRefresh) : String(triggerRefresh || "").trim();
      if (_svmRefreshTrigger && cache) {
        cache.last_refresh_trigger = _svmRefreshTrigger;
        try { WalletCache.save(_svmWalletKey(addr), cache, config); } catch (eSaveTrigger) {}
      }
      var ts = (WalletCache.getLastRunUpdateStr ? WalletCache.getLastRunUpdateStr(cache) : "") || WalletCache.getLastUpdateStr(cache);
     // v4.15.19: Add [CACHE_ONLY] marker if no HTTP calls were made during scan
     if (ts) return BaseEngine.wrapCacheOnlyMarker(ts, _httpBefore);
     // No cache timestamp — report error or no_cache
     if (refreshError) return "[ERROR] " + refreshError.substring(0, 200);
     return "[NO_CACHE] " + Format.now();
   } catch (e) {
     if (refreshError) return "[ERROR] " + refreshError.substring(0, 200);
     return "[NO_CACHE] " + Format.now();
   }
 },

 getStats: function(address, config, walletNames) {
 try {
 if (!address) return [["Metric", "Value"], ["Error", "Missing address"]];
 address = String(address).trim();
 if (!_svmIsValidAddress(address)) return [["Metric", "Value"], ["Error", "Invalid address: " + address]];
 config = config || SVM_DEFAULT_CONFIG;
 CacheManager.init();
 var timer = createTimer((config.TIMEOUTS && config.TIMEOUTS.MAX_EXECUTION_MS) || 30000);
 var chainLabel = _svmChainName(address, config, walletNames);
 var walletKey = _svmWalletKey(address);
 var cache = WalletCache.load(walletKey, timer, config);

 // === BASEENGINE: Use shared stats builder (returns 2 columns) ===
 var out = BaseEngine.buildStatsBase(walletKey, cache, config, chainLabel, "SVM", timer);
 out.splice(4, 0, ["WalletCacheKey", walletKey + " (hashed)"]);
 if (config.RPC && config.RPC.ENDPOINTS && config.RPC.ENDPOINTS.length) {
 out.push(["RPC.primary", config.RPC.ENDPOINTS[0].substring(0, 60)]);
 out.push(["RPC.total", config.RPC.ENDPOINTS.length + " endpoints"]);
 }
 return out;
 } catch (e) { return [["Metric", "Value"], ["Error", String(e.message || e)]]; }
 }
};
