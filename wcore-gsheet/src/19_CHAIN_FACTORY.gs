/************************************************************
 * 19_CHAIN_FACTORY.gs - Chain Factory Pattern (v4.15.51)
 *
 * v4.15.51 - Added TON registration wrapper for @wcore/chains extraction.
 * v4.15.14 - ChainFactory registry for background workers.
 *   Workers can resolve chain configs deterministically without relying on
 *   global variable enumeration in Apps Script.
 * 
 * Provides factory methods to create chain configurations.
 * Chain files use explicit function declarations for GAS compatibility.
 * 
 * v4.15.12 - version sync
 *
 * v4.15.11:
 * - VERSION aligned with WCORE so META script_version exposes current deployed code.
 *
 * v4.13.0:
 * - VERSION updated to 4.13.0 for simplified rotation model
 * - Added auto-registration with ModuleRegistry
 * 
 * v4.12.4 FIX:
 * - DegradedMode.wrap now receives engine parameter (5th argument)
 * - This allows correct cache key handling for SVM and Cosmos
 * - SVM uses _svmWalletKey(), Cosmos uses address directly, EVM uses Addr.normalize()
 * 
 * v4.12.1 NEW:
 * - getCachedWalletAssets now uses DegradedMode.getCachedWithDegradedInfo()
 * - CACHED_* shows INFO_QUOTA when cache is in degraded mode
 * - Proper chainName with WalletNames mapping in degraded mode
 * 
 * v4.12.0 NEW:
 * - Added DegradedMode support for UrlFetch quota handling
 * - getWalletAssets now wraps calls with DegradedMode.wrap()
 * - Returns cache data with INFO_QUOTA instead of #ERROR!
 * 
 * Usage:
 * var _BASE = ChainFactory.createEvmChain("BASE", { ... });
 * function GET_WALLET_ASSETS_BASE(a,r,t,f,g){return _BASE.getWalletAssets(a,r,t,f,g);}
 ************************************************************/

var CHAIN_FACTORY_VERSION = "4.15.51";

var ChainFactory = ChainFactory || {};

// ============================================================
// AUTO-REGISTRATION (v4.13.0)
// ============================================================
if (typeof ModuleRegistry !== 'undefined') {
  ModuleRegistry.register("CHAIN_FACTORY", CHAIN_FACTORY_VERSION, {
    description: "Chain factory for EVM/SVM/Cosmos configurations"
  });
}

ChainFactory.VERSION = CHAIN_FACTORY_VERSION;

ChainFactory._registry = ChainFactory._registry || {};

ChainFactory.registerChain = function(chainName, api) {
 if (!api || typeof api.getConfig !== "function") return api;
 var name = String(chainName || api.name || "").toUpperCase();
 if (name) this._registry[name] = api;
 return api;
};

ChainFactory.getRegistry = function() {
 return this._registry || {};
};

// ============================================================
// DEFAULT TIMEOUTS (v4.6.0+ harmonization)
// v4.12.4: Added HTTP_MS and FAST_FAIL_MS to prevent slow RPC blocking
// ============================================================

ChainFactory.DEFAULT_TIMEOUTS = {
 HTTP_MS: 2500, // Max time per HTTP call (prevents 15s+ delays)
 FAST_FAIL_MS: 2000, // Fast fail timeout for native balance
 MAX_EXECUTION_MS: 18000,
 SAFE_MARGIN_MS: 900,
 SAFE_SAVE_MARGIN_MS: 1400,
 SAFE_PRICE_MARGIN_MS: 5000,
 NATIVE_PRICE_MIN_LEFT_MS: 4000,
 HARD_GUARD_MS: 16000,
 HARD_PRICE_CUTOFF_MS: 3500
};

ChainFactory.DEFAULT_RPC = {
 CONSENSUS_MIN_RPCS: 2,
 CONSENSUS_MAX_RPCS: 3
};

// ============================================================
// VM CACHE VERSIONS (references WCORE_VM_CACHE_VERSIONS from 01_INIT)
// ============================================================

ChainFactory.getCacheVersion = function(vmType) {
 // Use centralized WCORE_VM_CACHE_VERSIONS if available
 if (typeof WCORE_VM_CACHE_VERSIONS !== 'undefined') {
 return WCORE_VM_CACHE_VERSIONS.get(vmType);
 }
 // Fallback values
 var fallbacks = { EVM: 63, SVM: 64, COSMOS: 67 };
 return fallbacks[String(vmType).toUpperCase()] || 63;
};

// ============================================================
// EVM CHAIN FACTORY
// ============================================================

ChainFactory.createEvmChain = function(chainName, chainConfig) {
 var _config = null;
 var name = String(chainName).toUpperCase();
 
 var getConfig = function() {
 if (_config) return _config;
 
 var cfg = {};
 for (var k in chainConfig) {
 if (chainConfig.hasOwnProperty(k)) cfg[k] = chainConfig[k];
 }
 
 if (!cfg.VERSION) cfg.VERSION = name + "_EVM_v" + ChainFactory.VERSION;
 if (!cfg.KEYS) cfg.KEYS = EvmConfigBuilder.generateKeys(name);
 if (!cfg.TIMEOUTS) cfg.TIMEOUTS = ChainFactory.DEFAULT_TIMEOUTS;
 if (cfg.RPC && !cfg.RPC.CONSENSUS_MIN_RPCS) {
 cfg.RPC.CONSENSUS_MIN_RPCS = ChainFactory.DEFAULT_RPC.CONSENSUS_MIN_RPCS;
 cfg.RPC.CONSENSUS_MAX_RPCS = ChainFactory.DEFAULT_RPC.CONSENSUS_MAX_RPCS;
 }
 
 // Set cache version from centralized source
 if (!cfg.CACHE_VERSION) {
 cfg.CACHE_VERSION = ChainFactory.getCacheVersion('EVM');
 }
 
 _config = EvmConfigBuilder.build(cfg);
 if (chainConfig.LLAMA_ID_MAP) _config.LLAMA_ID_MAP = chainConfig.LLAMA_ID_MAP;
 if (chainConfig.LLAMA_CONTRACT_MAP) _config.LLAMA_CONTRACT_MAP = chainConfig.LLAMA_CONTRACT_MAP;

 return _config;
 };

 var api = {
 name: name,
 type: 'EVM',
 getConfig: getConfig,
 
 // v4.12.0: Added DegradedMode wrapper for quota handling
 getWalletAssets: function(address, rpc, tokensRange, forceFull, triggerRefresh) {
 var cfg = getConfig();
 
 // v4.12.0: Wrap with DegradedMode to handle UrlFetch quota errors
 // v4.12.4: Pass EvmEngine for correct cache key handling
 // v4.14.5: Pass forceFull so circuit breaker can be overridden
 if (typeof DegradedMode !== 'undefined' && DegradedMode.wrap) {
 return DegradedMode.wrap(function() {
 return EvmEngine.getWalletAssets(address, rpc, tokensRange, forceFull, triggerRefresh, cfg, WalletNames);
 }, address, cfg, WalletNames, EvmEngine, forceFull);
 }
 
 // Fallback if DegradedMode not available
 return EvmEngine.getWalletAssets(address, rpc, tokensRange, forceFull, triggerRefresh, cfg, WalletNames);
 },
 
 // v4.12.1: getCachedWalletAssets now handles degraded mode state
 getCachedWalletAssets: function(address) {
 var cfg = getConfig();
 
 // Check if cache has degraded mode flag
 if (typeof DegradedMode !== 'undefined' && DegradedMode.getCachedWithDegradedInfo) {
 return DegradedMode.getCachedWithDegradedInfo(address, cfg, WalletNames, EvmEngine);
 }
 
 return EvmEngine.getCachedWalletAssets(address, cfg, WalletNames);
 },
 getRefreshStatus: function(address, rpc, tokensRange, forceFull, triggerRefresh) {
 try {
   return EvmEngine.getRefreshStatus(address, rpc, tokensRange, forceFull, triggerRefresh, getConfig(), WalletNames);
 } catch (e) {
   // v4.15.3: Catch RPC failures — return error info instead of #ERROR!
   var msg = String(e.message || e);
   Logger.log("[" + name + "] getRefreshStatus ERROR: " + msg);
   return "[ERROR] " + msg.substring(0, 80);
 }
 },
 getStats: function(address, trigger) {
 void trigger;
 return EvmEngine.getStats(address, getConfig(), WalletNames);
 },
 
 diag: {
 tokenBalance: function(w,t,r){return Diagnostic.tokenBalance(getConfig(),w,t,r);},
 compareRpcs: function(w,t){return Diagnostic.compareRpcs(getConfig(),w,t);},
 checkErc20: function(t){return Diagnostic.checkErc20(getConfig(),t);},
 rpcHealth: function(){return Diagnostic.rpcHealth(getConfig());},
 nativeBalance: function(w){return Diagnostic.nativeBalance(getConfig(),w);},
 cacheInspect: function(w){return Diagnostic.cacheInspect(getConfig(),w);},
 cacheFindToken: function(w,t){return Diagnostic.cacheFindToken(getConfig(),w,t);},
 cacheListAssets: function(w){return Diagnostic.cacheListAssets(getConfig(),w);},
 tokenPrice: function(t){return Diagnostic.tokenPrice(getConfig(),t);},
 nativePrice: function(){return Diagnostic.nativePrice(getConfig());},
 walletFull: function(w){return Diagnostic.walletFull(getConfig(),w);},
 cacheStats: function(){return Diagnostic.cacheStats(getConfig());},
 clearCache: function(w,c){return Diagnostic.clearCache(getConfig(),w,c);}
 }
 };
 return ChainFactory.registerChain(name, api);
};

// ============================================================
// TON CHAIN FACTORY
// ============================================================

ChainFactory.createTonChain = function(chainName, chainConfig) {
 var _config = null;
 var name = String(chainName).toUpperCase();

 var getConfig = function() {
  if (_config) return _config;
  var cfg = {};
  for (var k in chainConfig) {
   if (chainConfig.hasOwnProperty(k)) cfg[k] = chainConfig[k];
  }
  if (!cfg.VERSION) cfg.VERSION = name + "_TON_v" + ChainFactory.VERSION;
  if (!cfg.CACHE_VERSION) cfg.CACHE_VERSION = 1;
  _config = cfg;
  return _config;
 };

 var api = {
  name: name,
  type: 'TON',
  getConfig: getConfig,
  getWalletAssets: function(a,r,t,f,g){ return GET_WALLET_ASSETS_TON(a,r,t,f,g); },
  getCachedWalletAssets: function(a){ return CACHED_WALLET_ASSETS_TON(a); },
  getRefreshStatus: function(a,r,t,f,g){ return TON_REFRESH_STATUS(a,r,t,f,g); },
  getStats: function(a,t){ return TON_STATS(a,t); }
 };
 return ChainFactory.registerChain(name, api);
};

// ============================================================
// SVM CHAIN FACTORY
// ============================================================

ChainFactory.createSvmChain = function(chainName, chainConfig) {
 var _config = null;
 var name = String(chainName).toUpperCase();
 
 var getConfig = function() {
 if (_config) return _config;
 
 var cfg = {};
 for (var k in chainConfig) {
 if (chainConfig.hasOwnProperty(k)) cfg[k] = chainConfig[k];
 }
 
 if (!cfg.VERSION) cfg.VERSION = name + "_SVM_v" + ChainFactory.VERSION;
 if (!cfg.KEYS) cfg.KEYS = SvmConfigBuilder.generateKeys(name);
 
 // Set cache version from centralized source
 if (!cfg.CACHE_VERSION) {
 cfg.CACHE_VERSION = ChainFactory.getCacheVersion('SVM');
 }
 
 _config = SvmConfigBuilder.build(cfg);
 return _config;
 };
 
 var api = {
 name: name,
 type: 'SVM',
 getConfig: getConfig,
 
 // v4.12.0: Added DegradedMode wrapper for quota handling
 getWalletAssets: function(address, rpc, tokensRange, forceFull, triggerRefresh) {
 var cfg = getConfig();
 
 // v4.12.0: Wrap with DegradedMode to handle UrlFetch quota errors
 // v4.12.4: Pass SvmEngine for correct cache key handling
 // v4.14.5: Pass forceFull so circuit breaker can be overridden
 if (typeof DegradedMode !== 'undefined' && DegradedMode.wrap) {
 return DegradedMode.wrap(function() {
 return SvmEngine.getWalletAssets(address, rpc, tokensRange, forceFull, triggerRefresh, cfg, WalletNames);
 }, address, cfg, WalletNames, SvmEngine, forceFull);
 }
 
 // Fallback if DegradedMode not available
 return SvmEngine.getWalletAssets(address, rpc, tokensRange, forceFull, triggerRefresh, cfg, WalletNames);
 },
 
 // v4.12.1: getCachedWalletAssets now handles degraded mode state
 getCachedWalletAssets: function(address) {
 var cfg = getConfig();
 
 // Check if cache has degraded mode flag
 if (typeof DegradedMode !== 'undefined' && DegradedMode.getCachedWithDegradedInfo) {
 return DegradedMode.getCachedWithDegradedInfo(address, cfg, WalletNames, SvmEngine);
 }
 
 return SvmEngine.getCachedWalletAssets(address, cfg, WalletNames);
 },
 getRefreshStatus: function(address, rpc, tokensRange, forceFull, triggerRefresh) {
 try {
   return SvmEngine.getRefreshStatus(address, rpc, tokensRange, forceFull, triggerRefresh, getConfig(), WalletNames);
 } catch (e) {
   var msg = String(e.message || e);
   Logger.log("[" + name + "] getRefreshStatus ERROR: " + msg);
   return "[ERROR] " + msg.substring(0, 80);
 }
 },
 getStats: function(address, trigger) {
 void trigger;
 return SvmEngine.getStats(address, getConfig(), WalletNames);
 },
 
 diag: {
 tokenMeta: function(t){return Diagnostic.svmTokenMeta(getConfig(),t);},
 rpcHealth: function(){return Diagnostic.rpcHealth(getConfig());},
 nativeBalance: function(w,r){return Diagnostic.svmNativeBalance(getConfig(),w,r);},
 tokenPrice: function(t){return Diagnostic.svmTokenPrice(getConfig(),t);},
 nativePrice: function(){return Diagnostic.nativePrice(getConfig());},
 wallet: function(w,r){return Diagnostic.svmWallet(getConfig(),w,r);},
 cacheStats: function(){return Diagnostic.cacheStats(getConfig());}
 }
 };
 return ChainFactory.registerChain(name, api);
};

// ============================================================
// COSMOS CHAIN FACTORY
// ============================================================

ChainFactory.createCosmosChain = function(chainName, chainConfig) {
 var _config = null;
 var name = String(chainName).toUpperCase();
 
 var getConfig = function() {
 if (_config) return _config;
 
 var cfg = {};
 for (var k in chainConfig) {
 if (chainConfig.hasOwnProperty(k)) cfg[k] = chainConfig[k];
 }
 
 if (!cfg.VERSION) cfg.VERSION = name + "_COSMOS_v" + ChainFactory.VERSION;
 if (!cfg.KEYS) cfg.KEYS = CosmosConfigBuilder.generateKeys(name);
 
 // Set cache version from centralized source
 if (!cfg.CACHE_VERSION) {
 cfg.CACHE_VERSION = ChainFactory.getCacheVersion('COSMOS');
 }
 
 _config = CosmosConfigBuilder.build(cfg);
 if (chainConfig.LLAMA_ID_MAP) _config.LLAMA_ID_MAP = chainConfig.LLAMA_ID_MAP;
 if (chainConfig.LLAMA_CONTRACT_MAP) _config.LLAMA_CONTRACT_MAP = chainConfig.LLAMA_CONTRACT_MAP;

 return _config;
 };

 var api = {
 name: name,
 type: 'COSMOS',
 getConfig: getConfig,
 
 // v4.12.0: Added DegradedMode wrapper for quota handling
 getWalletAssets: function(address, forceFull) {
 var cfg = getConfig();
 
 // v4.12.0: Wrap with DegradedMode to handle UrlFetch quota errors
 // v4.12.4: Pass CosmosEngine for correct cache key handling
 // v4.14.5: Pass forceFull so circuit breaker can be overridden
 if (typeof DegradedMode !== 'undefined' && DegradedMode.wrap) {
 return DegradedMode.wrap(function() {
 return CosmosEngine.getWalletAssets(address, forceFull, cfg, WalletNames);
 }, address, cfg, WalletNames, CosmosEngine, forceFull);
 }
 
 // Fallback if DegradedMode not available
 return CosmosEngine.getWalletAssets(address, forceFull, cfg, WalletNames);
 },
 
 // v4.12.1: getCachedWalletAssets now handles degraded mode state
 getCachedWalletAssets: function(address) {
 var cfg = getConfig();
 
 // Check if cache has degraded mode flag
 if (typeof DegradedMode !== 'undefined' && DegradedMode.getCachedWithDegradedInfo) {
 return DegradedMode.getCachedWithDegradedInfo(address, cfg, WalletNames, CosmosEngine);
 }
 
 return CosmosEngine.getCachedWalletAssets(address, cfg, WalletNames);
 },
 
 getRefreshStatus: function(address, forceFull) {
 try {
   var cfg = getConfig();
   return CosmosEngine.getRefreshStatus(address, forceFull, cfg, WalletNames);
 } catch (e) {
   var msg = String(e.message || e);
   Logger.log("[" + name + "] getRefreshStatus ERROR: " + msg);
   return "[ERROR] " + msg.substring(0, 80);
 }
 },
 
 getStats: function(address, trigger) {
 void trigger;
 var cfg = getConfig();
 return CosmosEngine.getStats(address, cfg, WalletNames);
 },
 
 diag: {
 nativePrice: function(){
 return (typeof Diagnostic!=="undefined"&&Diagnostic.nativePrice)?Diagnostic.nativePrice(getConfig()):[["Metric","Value","Details"],["Info","Not supported",""]];
 },
 cacheStats: function(){
 return (typeof Diagnostic!=="undefined"&&Diagnostic.cacheStats)?Diagnostic.cacheStats(getConfig()):[["Metric","Value","Details"],["Info","Not supported",""]];
 },
 rpcHealth: function(){
 return (typeof Diagnostic!=="undefined"&&Diagnostic.rpcHealth)?Diagnostic.rpcHealth(getConfig()):[["Metric","Value","Details"],["Info","Not supported",""]];
 }
 }
 };
 return ChainFactory.registerChain(name, api);
};

// ============================================================
// STABLECOIN LISTS
// ============================================================

ChainFactory.STABLECOINS = WCORE_STABLECOINS;

// ============================================================
// VERSION CHECK HELPER
// ============================================================

ChainFactory.checkVersionSync = function() {
 var results = [];
 var expected = CHAIN_FACTORY_VERSION;
 
 results.push({
 component: 'ChainFactory.VERSION',
 current: ChainFactory.VERSION,
 expected: expected,
 synced: ChainFactory.VERSION === expected
 });
 
 if (typeof WCORE_VERSION !== 'undefined') {
 var wcoreVer = WCORE_VERSION.MAJOR + '.' + WCORE_VERSION.MINOR + '.' + WCORE_VERSION.PATCH;
 var wcoreExpected = WCORE_VERSION.toString ? WCORE_VERSION.toString().replace(/^v/, "") : wcoreVer;
 results.push({
 component: 'WCORE_VERSION',
 current: wcoreVer,
 expected: wcoreExpected,
 synced: wcoreVer === wcoreExpected
 });
 }
 
 if (typeof BaseEngine !== 'undefined' && BaseEngine.VERSION) {
 var baseExpected = (typeof BASE_ENGINE_VERSION !== 'undefined') ? BASE_ENGINE_VERSION : BaseEngine.VERSION;
 results.push({
 component: 'BaseEngine.VERSION',
 current: BaseEngine.VERSION,
 expected: baseExpected,
 synced: BaseEngine.VERSION === baseExpected
 });
 }
 
 return results;
};
