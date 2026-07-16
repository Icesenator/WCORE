/************************************************************
 * 11_EVM_ENGINE.gs - EVM Chain Engine (v4.15.28)
 *
 * v4.15.28 - CACHE-ONLY: repair impossible micro balances for tokens with
 *   explicit RPC.TOKEN_DECIMALS before rendering/saving cached Ledger output.
 *   Prevents stale fallback=18 artifacts (WBTC/AICC/SNAP) from reappearing
 *   when A1 reads an old cache snapshot before the live scan refreshes it.
 *
 * v4.15.27 - PRESERVE: HTTP errors + incomplete cycle now preserve existing cache
 *   even when newCount >= prevCount. Delegated to BaseEngine.shouldPreserveScanCacheWrite.
 *
 * v4.15.26 - CACHE-ONLY: also apply worker prices stored as chainId entries.
 *   Pricing worker persists USD prices in GlobalPriceCache entries
 *   (chainId:contract); cached Ledger reads now consume those through
 *   BaseEngine.getWorkerCachedPriceEur without HTTP.
 *
 * v4.15.25 - CACHE-ONLY: apply GlobalPriceCache prices in Ledger reads.
 *   Background pricing worker writes GPC; CACHED_WALLET_ASSETS now merges
 *   those prices into rows without HTTP.
 *
 * v4.15.24 - FIX: visible no-market zero prices keep cycle partial.
 *
 * v4.15.23 - PRICING_WORKER: no-market zero prices are complete, not missing.
 *
 * MIGRATED TO BaseEngine - Unified execution engine for all EVM chains.
 *
 * v4.15.15 - cache write guard preserves previous assets on HTTP-error shrink.
 *
 * v4.15.14 - budget guard: forceFull rétrogradé si HTTP >70% (_normalizeForceWithBudgetGuard_)
 * v4.15.13 - HTTP: unconditional zero-balance skip + allContracts balance filter.
 *   - priceTargets ne pricent plus les tokens balance<=0 (value_eur=0 = pas d'intérêt)
 *   - Économie mesurée ~30-50% des GT/DEX calls sur chaînes type Base qui ont
 *     beaucoup de "zombies" (tokens reçus puis revendus) dans I2:I.
 *
 * v4.15.9 - PRIORITY: priceTargets trié par priorité avant BulkPriceFetch.
 *   - Tokens sans prix cached en premier (jamais pricés = urgent visible)
 *   - Puis tokens avec prix le plus ancien (priceTsMap ascending)
 *   - Garantit qu'en cas de timer/throttle serré, les tokens en retard
 *     sont servis avant ceux qui viennent d'être re-pricés.
 *
 * v4.15.7 - FIX: Ne plus pré-supprimer state.priceMap/priceTsMap avant fetch
 *   - Seul asset.price_eur est réinitialisé sur dueFullPrice (réarme fallback)
 *   - state.priceMap/priceTsMap conservés → la préservation stale (6h) peut
 *     restaurer l'ancien prix quand BulkPriceFetch + Llama/CG échouent tous.
 *   - Supprimé aussi le bloc `if (force)` qui effaçait le natif (rendait
 *     la fallback native ligne 700 inopérante).
 *   - Cause racine des cellules "balance mais pas de prix" sur Base (et autres
 *     chaînes EVM) : même anti-pattern que evictStalePrices corrigé en v4.15.6.
 *
 * v4.15.5 - QUOTA: Cached mode is cache-first by default
 *   - getCachedWalletAssets no longer live-fetches metadata unless a chain
 *     opts in with FLAGS.CACHED_LIVE_METADATA.
 *   - Native balance overrides are refreshed only when missing/stale/suspect,
 *     and never while quota protection is active.
 *
 * v4.15.4 - FIX: Native balance override prefers configured chain RPC
 *   - FLAGS.NATIVE_BALANCE_TOKEN_CONTRACT now uses FLAGS.NATIVE_BALANCE_RPC
 *     or config.RPC.ENDPOINTS[0] before dynamic RPC selection. This prevents
 *     Tempo native reads from being routed to slow/empty dynamic RPCs.
 *
 * v4.15.3 - FIX: Cached output also refreshes native balance override
 *   - getCachedWalletAssets reads FLAGS.NATIVE_BALANCE_TOKEN_CONTRACT live
 *     and injects native, preventing cached Ledger sheets from keeping stale
 *     eth_getBalance sentinel values.
 *
 * v4.15.2 - FIX: Per-chain native balance override/disable flags
 *   - FLAGS.NATIVE_BALANCE_TOKEN_CONTRACT reads native/fee balance through
 *     ERC20/TIP-20 balanceOf instead of eth_getBalance. Used by Tempo where
 *     eth_getBalance returns 424242... sentinel balances for every address.
 *   - FLAGS.DISABLE_NATIVE_BALANCE still skips native balance when needed.
 *
 * v4.15.1 - FIX: WATCHDOG TX detection now bypasses consensus cache voting
 *   - state.activityForced (set by ForceRefreshManager) now sets hasRecentActivity=true
 *   - Before: only C1=TRUE (force param) bypassed consensus, WATCHDOG pulse B1 did not
 *   - Result: balances updated correctly after WATCHDOG detects a transaction
 *
 * v4.14.5 - FIX: forceFull now bypasses consensus cache voting + quota checks
 *   - forceFull sets hasRecentActivity=true, disabling cache vote in consensus
 *     (prevents stale balance persisting when cache and RPC disagree)
 *   - budget.force added for correct INFO_ROT forceFull display
 *   - getRefreshStatus quotaPreCheck bypassed when forceFull=true
 *   - Auto-register EVM wallets with ActivityTracker after successful scan
 *
 * v4.14.4 - FIX: Stale price preservation for tokens not re-priced this cycle
 *   Tokens with cached price < 6h that BulkPriceFetch + fallback couldn't
 *   re-price keep their existing price_eur instead of losing it.
 *
 * v4.14.0 - OPT: Pass config to mergeGlobalPrices for TTL-based freshness check
 *
 * v4.13.10 - FIX: forceFull now bypasses L1 price cache for fresh prices
 *   Tokens paired against non-stablecoin quote tokens (e.g. TOKEN/CREATE on Base)
 *   had wrong prices persist even after forceFull because L1 CacheService (2h TTL)
 *   was never cleared. Now passes skipL1:true to BulkPriceFetch on forceFull,
 *   ensuring DexScreener/GeckoTerminal are always called for fresh USD prices.
 *
 * v4.13.9 - FIX: Stale price perpetuation in fallback pricing loop
 *   When computePriceEur returned a cached price (step 0), the engine
 *   refreshed priceTsMap timestamp, making the old price appear "fresh"
 *   indefinitely. Now only refreshes timestamp when price actually changes
 *   (>0.1% delta). This allows truly stale prices to expire and be
 *   re-fetched from GeckoTerminal on next run.
 *
 * v4.13.8 - OPTIMIZATION: HTTP Quota reduction
 *   - Batch decimals: _scanBatch now includes decimals() in same RPC batch
 *     as balanceOf(), eliminating per-token HTTP calls (saves ~10 calls/batch)
 *   - Cleaned dead RPC endpoints (HEMI YOUR_API_KEY, FOGO testnet)
 *
 * v4.13.7 - FIX: Race condition in getCachedWalletAssets metadata persistence
 *   getCachedWalletAssets loaded a cache snapshot at start, enriched metadata,
 *   then re-saved the ENTIRE stale snapshot. If GET_WALLET_ASSETS ran in parallel
 *   and purged zero-balance tokens, the stale save would overwrite the purge,
 *   causing tokens with balance=0 to persist indefinitely.
 *   Fix: Reload fresh cache before metadata save, apply only metadata changes.
 *
 * v4.13.4 - METADATA RPC FALLBACK + CYCLE COMPLETENESS
 * - FIX: Tokens not on DEX/GeckoTerminal had no metadata (symbol/name)
 *   because _fillStrings required allowMetaStrings=true which was never set.
 *   Added direct RPC fallback (symbol()/name()) in metadata resolution phase.
 * - FIX: Rotation.cycle = DONE even with missing metadata.
 *   Now cycle = partial when any token with balance lacks symbol or name.
 *   (Observed: 3 RealT tokens on Gnosis with zero metadata despite balances)
 *
 * v4.13.3 - QUOTA PRE-CHECK CENTRALIZED
 * - CHANGED: getRefreshStatus now uses BaseEngine.quotaPreCheck()
 * - CHANGED: Post-refresh reason detection includes QuotaCircuitBreaker.isTripped()
 * - Harmonized [BLOCKED:QUOTA] label with SVM/Cosmos engines
 *
 * v4.13.2 - QUOTA CIRCUIT BREAKER CHECK
 * - ADDED: Early QuotaCircuitBreaker.testOnce() check at entry
 * - BUG: EVM was the only engine WITHOUT quota check (SVM/Cosmos had it)
 * - This caused EVM chains to attempt HTTP calls even when quota was
 *   exhausted, while SVM/Cosmos correctly returned cached data
 *
 * (Changelog v4.10.5..v4.13.1: 21 entries removed for brevity)
 * EXPORTS:
 * - EvmConfigBuilder (aliased as ConfigBuilder)
 * - EvmEngine (aliased as WalletEngine)
 * - DEFAULT_CONFIG
 * 
 * DEPENDENCIES:
 * - 10A_BASE_ENGINE.gs (REQUIRED - must be loaded before this file)
 ************************************************************/

// ============================================================
// AUTO-REGISTRATION (v4.13.0)
// ============================================================
var EVM_ENGINE_VERSION = "4.15.66";

if (typeof ModuleRegistry !== 'undefined') {
  ModuleRegistry.register("EVM_ENGINE", EVM_ENGINE_VERSION, {
    description: "EVM Engine - preserve cached prices on dueFullPrice/force",
    dependencies: ["BASE_ENGINE", "SIMPLE_ROTATION", "CACHE_CORE"]
  });
}

// ============================================================
// DEFAULT CONFIG - References WCORE_CACHE_CONFIG for TTLs
// ============================================================

var DEFAULT_CONFIG = {
 
 TIMEOUTS: {
 MAX_EXECUTION_MS: 30000,
 HTTP_MS: 1500,
 SAFE_MARGIN_MS: 750,
 SAFE_SAVE_MARGIN_MS: 1500,
 SAFE_PRICE_MARGIN_MS: 6500,
 NATIVE_PRICE_MIN_LEFT_MS: 5000,
 HARD_GUARD_MS: 24000,
 HARD_PRICE_CUTOFF_MS: 4500
 },
 
 CACHE: {
 WALLET_TTL_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.WALLET_TTL_MS : 86400000,
 PRICE_TTL_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.PRICE_TTL_MS : 43200000,
 PRICE_STALE_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.PRICE_STALE_MS : 3600000,
 PRICE_ATTEMPT_COOLDOWN_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.PRICE_ATTEMPT_COOLDOWN_MS : 21600000,
 PRICE_REFRESH_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.PRICE_REFRESH_MS : 600000,
 META_TTL_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.META_TTL_MS : 604800000,
 META_REFRESH_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.META_REFRESH_MS : 259200000,
 AUTO_FORCE_FULL_SCAN_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.AUTO_FORCE_FULL_SCAN_MS : 86400000,
 AUTO_FORCE_FULL_PRICE_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.AUTO_FORCE_FULL_PRICE_MS : 86400000,
 TOO_OLD_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.TOO_OLD_MS : 172800000,
 FULL_SCAN_INTERVAL_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.FULL_SCAN_INTERVAL_MS : 28800000,
 FULL_PRICE_INTERVAL_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.FULL_PRICE_INTERVAL_MS : 21600000,
 MIN_REFRESH_INTERVAL_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.MIN_REFRESH_INTERVAL_MS : 60000,
 RECENT_RECHECK_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.RECENT_RECHECK_MS : 900000,
 LOCK_TTL_MS: (typeof WCORE_CACHE_CONFIG !== 'undefined') ? WCORE_CACHE_CONFIG.LOCK_TTL_MS : 2000
 },
 
 LIMITS: {
 MAX_TOKENS_PER_CALL: 10,
 MAX_REFRESH_PER_RUN: 10,
 MAX_GLOBAL_PRICE_ENTRIES: 800,
 MAX_META_ENTRIES: 800,
 MAX_TOKENS_RANGE_SCAN: 500,
 DECIMALS_FALLBACK: 18,
 DECIMALS_SANITY_MAX: 36,
 MAX_PRICE_TARGETS: 180
 },
 
 RPC: {
 MAX_FAILURES_BEFORE_BLOCK: 3,
 BLOCK_DURATION_MS: 300000,
 CONSENSUS_MIN_RPCS: 2,
 CONSENSUS_MAX_RPCS: 4
 },
 
 PRICE_APIS: {
 DEXSCREENER: { BASE_URL: "https://api.dexscreener.com/tokens/v1", BATCH_SIZE: 30, MAX_ADDRESSES: 30 },
 GECKOTERMINAL: { BASE_URL: "https://api.geckoterminal.com/api/v2/networks", MAX_ADDRESSES: 20 },
 LLAMA: { BASE_URL: "https://coins.llama.fi/prices/current" },
 COINGECKO: { BASE_URL: "https://api.coingecko.com/api/v3" }
 },
 
 BUDGET: {
 EXEC_HISTORY_SIZE: 10,
 THRESHOLDS: { MINIMAL_MAX_MS: 3000, CONSERVATIVE_MAX_MS: 7000, NORMAL_MAX_MS: 15000, AGGRESSIVE_MAX_MS: 30000 },
 PROFILES: {
 MINIMAL: { maxTokensPerCall: 3, maxRefreshPerRun: 3, maxPriceLookups: 0, allowMetaStrings: false },
 CONSERVATIVE: { maxTokensPerCall: 6, maxRefreshPerRun: 8, maxPriceLookups: 2, allowMetaStrings: true },
 NORMAL: { maxTokensPerCall: 10, maxRefreshPerRun: 10, maxPriceLookups: 4, allowMetaStrings: true },
 AGGRESSIVE: { maxTokensPerCall: 15, maxRefreshPerRun: 25, maxPriceLookups: 8, allowMetaStrings: true }
 }
 },
 
  FLAGS: { DISABLE_LIVE_PRICES: false, DEBUG_ENABLED: false, STRICT_TOKEN_RANGE: true },
 CACHE_VERSION: (typeof WCORE_CACHE_VERSION !== 'undefined') ? WCORE_CACHE_VERSION : 10
};

// ============================================================
// CONFIG BUILDER
// ============================================================

var EvmConfigBuilder = {
 build: function(chainConfig) {
 if (!chainConfig) return Obj.deepClone(DEFAULT_CONFIG);
 var merged = Obj.deepMerge(Obj.deepClone(DEFAULT_CONFIG), chainConfig);
 if (!merged.CACHE_VERSION) merged.CACHE_VERSION = (typeof WCORE_CACHE_VERSION !== 'undefined') ? WCORE_CACHE_VERSION : 10;
 return merged;
 },
 
 generateKeys: function(chainName) {
 var prefix = String(chainName).toUpperCase();
 return {
 PREFIX: prefix + "_CACHE_",
 GLOBAL_PRICE: prefix + "_GLOBAL_PRICE_CACHE",
 META: prefix + "_META_CACHE",
 RPC_HEALTH: prefix + "_RPC_HEALTH_CACHE",
 LOCK_SUFFIX: "_LOCK",
 DYNAMIC_BUDGET_PREFIX: prefix + "_DYNAMIC_BUDGET_STATS_",
 NATIVE_PRICE: "native@" + String(chainName).toLowerCase().replace(/_/g, "-")
 };
 }
};

// ============================================================
// EVM ENGINE - Main execution engine (v4.12.2 with fullCycleComplete fix)
// ============================================================

var EvmEngine = {
 
 /**
 * getWalletAssets - Main entry point for wallet asset retrieval
 * v4.12.2: Uses fullCycleComplete to prevent stale balances
 * v4.11.0: Migrated to use BaseEngine shared methods
 */
 getWalletAssets: function(address, rpc, tokensRange, forceFull, triggerRefresh, config, walletNames) {
 var chainName = this._getChainName(address, config, walletNames);
 var force = (typeof _normalizeForceWithBudgetGuard_ === 'function') ? _normalizeForceWithBudgetGuard_(forceFull) : Bool.parse(forceFull);
 var trig = Bool.parse(triggerRefresh);
 
 // === BASEENGINE: Initialize caches and execution state ===
 BaseEngine.initCaches();
 try { if (typeof RpcClient !== 'undefined' && RpcClient.resetStats) RpcClient.resetStats(); } catch (eRs) {}
 try { if (typeof Http !== 'undefined' && Http.resetStats) Http.resetStats(); } catch (eHs) {}
 var state = BaseEngine.initExecution(config);
 state.force = force;
 
 // === v4.13.5: EARLY QUOTA CHECK (centralized) ===
 // v4.14.9: forceFull still runs testOnce() for auto-recovery, but doesn't return cached
 // Without this, a stale QuotaCircuitBreaker tripped from yesterday blocks all HTTP via global patch
 if (force) {
   if (typeof QuotaCircuitBreaker !== 'undefined') {
     // v4.14.9: Disable tripping BEFORE testOnce — prevents testOnce from re-tripping
     // on stale quota errors. forceFull = user wants data, let individual calls fail naturally.
     if (QuotaCircuitBreaker.disableTripping) QuotaCircuitBreaker.disableTripping();
     if (QuotaCircuitBreaker.reset) QuotaCircuitBreaker.reset();
   }
 } else if (BaseEngine.testQuotaBlocked()) {
   return this.getCachedWalletAssets(address, config, walletNames);
 }
 
 var cache = null;
 var metaMap = {};
 var fullScanStats = { did: false, scanned: 0, batches: 0, rrCursor: 0, fullCycleComplete: false, tokensCovered: 0 };
 var nativeInfo = null;
 var allContracts = [];
 var dueFullScan = false;
 var dueFullPrice = false;
 
 // Fallback wrapper using BaseEngine
 var self = this;
 function fallbackToCache(reason) {
 // EVM-specific: Handle native price purge on dueFullPrice
 try {
 var needPurge = dueFullPrice || trig;
 if (needPurge && state.cache && state.cache.priceMap && config && config.KEYS && config.KEYS.NATIVE_PRICE) {
 delete state.cache.priceMap[config.KEYS.NATIVE_PRICE];
 if (state.cache.priceTsMap) delete state.cache.priceTsMap[config.KEYS.NATIVE_PRICE];
 delete state.cache.priceMap['native'];
 if (state.cache.priceTsMap) delete state.cache.priceTsMap['native'];
 }
 } catch (e) {}
 
 // Convert assetByKey to assets array for BaseEngine
 state.assets = AssetManager.toArray(state.assetByKey);
 
 // Use BaseEngine fallback
 var out = BaseEngine.fallbackToCache(Addr.normalize(address), reason, state, config, chainName, "EVM");
 
 // EVM-specific: Patch native price in output
 try {
 self._patchOutputNativePrice(out, state, config, chainName);
 } catch (e) {}
 
 RpcHealth.saveToCache(config);
 PriceRunCache.reset();
 RpcClient.resetStats();
 
 return out;
 }
 
 try {
 // === Validation ===
 if (!address) {
 var funcName = 'GET_WALLET_ASSETS_' + config.CHAIN.NAME.toUpperCase().replace(/ /g, "_");
 return [["Error", '=' + funcName + '("0x...")', "", "", "", "", ""]];
 }
 var addrLower = Addr.normalize(address);
 if (!Addr.isValid(addrLower)) {
 return OutputBuilder.error(chainName, "Invalid address: " + String(address), config);
 }
 
 // === Load caches ===
 RpcHealth.loadFromCache(state.timer, config);
 cache = WalletCache.load(addrLower, state.timer, config);
 var globalPrices = GlobalPriceCache.load(state.timer, config);
 metaMap = MetaCache.load(state.timer, config);
 
 // === BASEENGINE: Check cache version ===
 cache = BaseEngine.checkCacheVersion(cache, config, state);
 state.cache = cache;
 
 // === BASEENGINE: Restore from cache ===
 if (cache) {
 BaseEngine.restoreFromCache(cache, state);
 }
 
 // v4.15.2: Some EVM-like chains expose an unreliable native balance RPC.
 // When disabled, remove any previously cached native row before building the
 // rotation plan or saving/outputting cache so a bad value cannot persist.
 if (config && config.FLAGS && (config.FLAGS.DISABLE_NATIVE_BALANCE || config.FLAGS.NATIVE_BALANCE_TOKEN_CONTRACT)) {
 delete state.assetByKey["native"];
 if (state.balanceTsMap) delete state.balanceTsMap["native"];
 if (cache && cache.balanceTsMap) delete cache.balanceTsMap["native"];
 if (cache && cache.assets && Array.isArray(cache.assets)) {
 cache.assets = cache.assets.filter(function(a) {
 return !(a && String(a.contract || "").toLowerCase() === "native");
 });
 }
 }

 // === v4.13.6: Evict stale prices to prevent wrong prices from persisting ===
 BaseEngine.evictStalePrices(state, config);

 // === BASEENGINE: Merge global prices (v4.14.0: with TTL freshness check) ===
 BaseEngine.mergeGlobalPrices(globalPrices, state, config);
 
  // === v4.13.0: SIMPLIFIED BUDGET & ROTATION ===
  // Build contract list first (needed for rotation plan)
  allContracts = ContractListBuilder.build(tokensRange, state.assetByKey, config);
  state.strictTokenSet = null;
  if (config && config.FLAGS && config.FLAGS.STRICT_TOKEN_RANGE) {
  state.strictTokenSet = {};
  for (var stsi = 0; stsi < allContracts.length; stsi++) {
  var stsKey = Addr.normalize(allContracts[stsi]);
  if (stsKey && stsKey !== "native") state.strictTokenSet[stsKey] = true;
  }
  }
  if (config && config.FLAGS && config.FLAGS.STRICT_TOKEN_RANGE) {
  var strictContracts = {};
  for (var stc = 0; stc < allContracts.length; stc++) strictContracts[Addr.normalize(allContracts[stc])] = true;
  for (var sak in state.assetByKey) {
  if (sak !== "native" && !strictContracts[Addr.normalize(sak)]) delete state.assetByKey[sak];
  }
  if (cache && cache.assets && Array.isArray(cache.assets)) {
  cache.assets = cache.assets.filter(function(a) {
  var ac = a && String(a.contract || "").toLowerCase();
  return ac === "native" || !!strictContracts[Addr.normalize(ac)];
  });
  }
  }

  // v4.15.21: When NATIVE_BALANCE_TOKEN_CONTRACT is set, drop that contract from
 // the token list — it is already handled as the native row above. Keeping it
 // would produce a duplicate row (e.g. Tempo pathUSD appearing twice).
 if (config && config.FLAGS && config.FLAGS.NATIVE_BALANCE_TOKEN_CONTRACT && allContracts && allContracts.length) {
 var _nbNorm = Addr.normalize(config.FLAGS.NATIVE_BALANCE_TOKEN_CONTRACT);
 allContracts = allContracts.filter(function(c) { return Addr.normalize(c) !== _nbNorm; });
 // Also purge any previously-cached duplicate entry under the native contract key
 if (state.assetByKey && state.assetByKey[_nbNorm]) delete state.assetByKey[_nbNorm];
 if (cache && cache.assets && Array.isArray(cache.assets)) {
 cache.assets = cache.assets.filter(function(a) { return Addr.normalize(a && a.contract || "") !== _nbNorm; });
 }
 }
 
 // Get current cursor from cache
 state.rrCursor = (cache && cache.rrCursor) || 0;
 
 // Calculate rotation plan based on time available
 var rotationPlan = SimpleRotation.plan(allContracts, state.rrCursor, state.timer, config);
 
 // Simplified budget object - no more complex profiles
 var budget = {
   profileName: "SIMPLE",
   force: !!force,  // v4.14.5: Added for INFO_ROT forceFull display
   dueFullScan: !!force,
   dueFullPrice: !!force,
   allowFullScan: true,
   allowRotation: true,
   allowPrices: true,
   allowDexBulk: true,
   allowGT: true,
   allowLlamaCg: true,
   maxTokensPerCall: rotationPlan.maxContracts || 10,
   maxRefreshPerRun: rotationPlan.maxContracts || 10,
   maxPriceLookups: 8,
   allowMetaStrings: true,  // v4.13.4: Enable RPC metadata resolution
   _rotationPlan: rotationPlan
 };
 dueFullScan = budget.dueFullScan;
 dueFullPrice = budget.dueFullPrice;
 
 // === BASEENGINE: Auto-force checks ===
 var autoForceResult = BaseEngine.checkAutoForce(cache, config, state, force, addrLower);
 if (autoForceResult.dueFullScan) {
 budget.dueFullScan = true;
 budget.dueFullPrice = true;
 dueFullScan = true;
 dueFullPrice = true;
 }
 
 // === BASEENGINE: Min refresh check (anti-spam) ===
 if (!BaseEngine.checkMinRefresh(cache, config, state, force)) {
 return this.getCachedWalletAssets(address, config, walletNames);
 }
 
 // === BASEENGINE: Too-old check (>48h) ===
 if (BaseEngine.checkTooOld(cache, config, state)) {
 budget.dueFullScan = true;
 budget.dueFullPrice = true;
 dueFullScan = true;
 dueFullPrice = true;
 }
 
 // === BASEENGINE: Apply recovery mode if needed ===
 BaseEngine.applyRecoveryMode(budget, state, config);
 

 // v4.12.36: Copy recovery flags to state for checkpoint logic
 if (budget.recoveryModeActive) {
 state.recoveryModeActive = true;
 }
 // v4.12.36: Determine if checkpoints should be skipped (save time for RPC)
 var contractCount = allContracts.length || 0;
 if (contractCount > 40 || state.autoForced || budget.recoveryModeActive) {
 state._skipCheckpoints = true;
 state._skipCheckpointsReason = budget.recoveryModeActive ? "RECOVERY" : 
                                 state.autoForced ? "AUTOFORCED" : 
                                 "CONTRACTS_" + contractCount;
 }
 
 // ============================================================
 // Phase 1: Balance fetch (EVM-specific logic)
 // ============================================================
 state._tBalanceStart = Date.now();

 // v4.14.8: forceFull resets RPC circuit breaker to give blocked RPCs a fresh chance
 // Without this, RPCs blocked by escalating durations (up to 6h) prevent any balance update
 if (force && typeof RpcHealth !== "undefined" && RpcHealth.reset) {
 RpcHealth.reset();
 try { RpcHealth.saveToCache(config); } catch(eRst) {}
 }

 if (config && config.FLAGS && config.FLAGS.NATIVE_BALANCE_TOKEN_CONTRACT) {
 try {
 var nbContract = Addr.normalize(config.FLAGS.NATIVE_BALANCE_TOKEN_CONTRACT);
 var nbData = "0x70a08231" + Addr.pad32(addrLower);
 var nbRpc = (config.FLAGS && config.FLAGS.NATIVE_BALANCE_RPC)
 ? config.FLAGS.NATIVE_BALANCE_RPC
 : ((config.RPC && config.RPC.ENDPOINTS && config.RPC.ENDPOINTS[0]) || RpcSelector.pickBest(rpc, config));
 if (!nbRpc) throw new Error("RPC unavailable");
 var nbHex = RpcClient.call(nbRpc, "eth_call", [{ to: nbContract, data: nbData }, "latest"], state.timer, 1, config);
 var nbRaw = BigInt(nbHex || "0x0");
 var nbDecimals = config.CHAIN.NATIVE_DECIMALS || 18;
 var nbVal = BigNum.toDecimal(nbRaw, nbDecimals);
 nativeInfo = "token-balance(" + nbContract + ")";
 AssetManager.upsert(state.assetByKey, {
 contract: "native",
 symbol: config.CHAIN.NATIVE_SYMBOL || "USD",
 name: config.CHAIN.NATIVE_NAME || "USD",
 balance: nbVal,
 decimals: nbDecimals
 });
 state.balanceTsMap["native"] = state.nowMs;
 } catch (eNbToken) {
 nativeInfo = "token-balance-error:" + String(eNbToken.message || eNbToken).substring(0, 50);
 }
 } else if (config && config.FLAGS && config.FLAGS.DISABLE_NATIVE_BALANCE) {
 nativeInfo = "native-disabled:" + (config.FLAGS.NATIVE_BALANCE_DISABLED_REASON || "config");
 } else if (BaseEngine.hasTimeLeft(state, config.TIMEOUTS.SAFE_MARGIN_MS)) {
 try {
 var natBal = RpcClient.getNativeBalance(addrLower, rpc, state.timer, config);
 // v4.12.35: Fix null check - natBal can be null if no RPC available or timeout
 if (natBal && natBal.balance != null) {
 // v4.13.1: Reject zero balance without consensus - false negative protection
 // A single RPC returning 0 is more likely a bad RPC than a real empty wallet
 if (natBal.balance === 0 && !natBal.hasConsensus) {
 nativeInfo = "rpc-zero-no-consensus(REJECTED)";
 // Don't upsert - keep existing cached balance as safer fallback
 } else {
 nativeInfo = natBal.hasConsensus ? "rpc(consensus)" : "rpc";
 AssetManager.upsert(state.assetByKey, {
 contract: "native",
 symbol: config.CHAIN.NATIVE_SYMBOL || "ETH",
 name: config.CHAIN.NATIVE_NAME || "Ether",
 balance: natBal.balance,
 decimals: config.CHAIN.NATIVE_DECIMALS || 18
 });
 state.balanceTsMap["native"] = state.nowMs;
 }
 } else {
 nativeInfo = "rpc-fail";
 }
 } catch (eNat) {
 nativeInfo = "error:" + String(eNat.message || eNat).substring(0, 50);
 }
 }
 
 // v4.12.34: CHECKPOINT 1 - After native balance
 // Save progress so native balance is preserved even if scan times out
 this._checkpointSave("NATIVE", addrLower, state, cache, config);
 
 // === v4.13.0: SIMPLIFIED TOKEN SCANNING ===
 var preFullScanRemaining = state.timer ? state.timer.remaining() : -1;
 
 // Detect recent activity for consensus voting
 // Cache counts as RPC vote if no recent activity
 var hasRecentActivity = false;
 try {
  if (typeof ActivityTracker !== "undefined" && ActivityTracker.hasRecentActivity) {
 hasRecentActivity = ActivityTracker.hasRecentActivity(config, addrLower);
 }
 } catch (eAct) {}

 // v4.14.5: forceFull disables cache voting — user explicitly wants fresh RPC data
 // Without this, cache gets 1 vote in consensus, blocking balance updates when
 // only 1 RPC disagrees with cache (e.g. after a swap: cache=191, RPC=80 → tie → cache wins)
 // v4.15.1: Also bypass consensus when WATCHDOG detected a TX (state.activityForced)
 // Before this fix, WATCHDOG set state.force but consensus still used local `force` (=C1=FALSE)
 if (force || state.activityForced) hasRecentActivity = true;

 // Always scan if we have contracts and time
 if (allContracts.length > 0 && state.timer && state.timer.remaining() > 2000) {
 try {
 var effectiveRpc = rpc;
 if (!effectiveRpc && typeof RpcSelector !== 'undefined' && RpcSelector.pickBest) {
 effectiveRpc = RpcSelector.pickBest(null, config);
 }
 if (!effectiveRpc && config.RPC && config.RPC.ENDPOINTS && config.RPC.ENDPOINTS.length) {
 effectiveRpc = config.RPC.ENDPOINTS[0];
 }
 
 // v4.13.0: Use SimpleBalanceFetcher instead of complex BalanceFetcher
 fullScanStats = SimpleBalanceFetcher.fullScan(
 effectiveRpc, addrLower, allContracts, state.assetByKey,
 state.balanceTsMap, state.attemptTsMap, state.purgedTsMap,
 metaMap, state.nowMs, state.timer, state.rrCursor, config, hasRecentActivity
 );
 state.rrCursor = fullScanStats.rrCursor || 0;
 
 // Update lastFullScanMs when a FULL CYCLE is complete
 if (fullScanStats.did && fullScanStats.fullCycleComplete) {
 state.lastFullScanMs = state.nowMs;
 }
 
 // Diagnostic info
 nativeInfo = (nativeInfo || "") + " | scan:" + (fullScanStats.did ? "YES" : "NO") +
 " bat:" + (fullScanStats.batches || 0) + " scn:" + (fullScanStats.scanned || 0) +
 " cov:" + (fullScanStats.tokensCovered || 0) + "/" + allContracts.length +
 " cycle:" + (fullScanStats.fullCycleComplete ? "DONE" : "partial");
 
 if (fullScanStats.fallbackCount > 0) {
 nativeInfo += " fallback:" + fullScanStats.fallbackCount;
 }
  if ((fullScanStats.metaSymbolUpdated || 0) > 0 || (fullScanStats.metaNameUpdated || 0) > 0) {
  nativeInfo += " metaRpc:" + (fullScanStats.metaSymbolUpdated || 0) + "/" + (fullScanStats.metaNameUpdated || 0);
  }
  if ((fullScanStats.multicall3UsedCount || 0) > 0 || (fullScanStats.multicall3FallbackCount || 0) > 0) {
  nativeInfo += " mc3:" + (fullScanStats.multicall3UsedCount || 0) + "/" + (fullScanStats.multicall3FallbackCount || 0);
  }
  if (hasRecentActivity) {
  nativeInfo += " activity:YES";
  }
 if (!fullScanStats.did && fullScanStats.exitReason) {
 nativeInfo += " exit:" + fullScanStats.exitReason;
 }
 if (preFullScanRemaining >= 0) {
 nativeInfo += " preT:" + preFullScanRemaining + "ms";
 }
 
 // v4.13.0: Store scan stats in state for cache persistence
 state._scanStats = {
   fullCycleComplete: fullScanStats.fullCycleComplete || false,
   totalContracts: allContracts.length,
   scannedCount: fullScanStats.tokensCovered || 0,
  cursor: fullScanStats.rrCursor || 0,
  hasActivity: hasRecentActivity,
  fallbackCount: fullScanStats.fallbackCount || 0,
  forceFull: !!force
 };
 } catch (eScan) {
 nativeInfo = (nativeInfo || "") + " | scanErr:" + String(eScan.message || eScan).substring(0, 50);
 
 // v4.13.0: Initialize scanStats even on error
 state._scanStats = {
   fullCycleComplete: false,
   totalContracts: allContracts.length,
   scannedCount: 0,
  cursor: state.rrCursor || 0,
  hasActivity: hasRecentActivity,
  fallbackCount: 0,
  forceFull: !!force,
  error: true
 };
 }
 } else {
 // No scan - log reason
 nativeInfo = (nativeInfo || "") + " | noScan:contracts=" + allContracts.length + 
 ";time=" + (state.timer ? state.timer.remaining() : "N/A") + "ms";
 
 // v4.13.0: Initialize scanStats even when no scan (for STATS display)
 state._scanStats = {
   fullCycleComplete: false,
   totalContracts: allContracts.length,
   scannedCount: 0,
  cursor: state.rrCursor || 0,
  hasActivity: false,
  fallbackCount: 0,
  forceFull: !!force,
  noScan: true
 };
 }

 // v4.15.22: Post-scan dedup — if scan re-added the native contract as a token
 // (e.g. user listed it in column I), strip it so the output shows only one
 // row for the native (under the "native" pseudo-key) and no duplicate.
 if (config && config.FLAGS && config.FLAGS.NATIVE_BALANCE_TOKEN_CONTRACT && state.assetByKey) {
 var _nbDedup = Addr.normalize(config.FLAGS.NATIVE_BALANCE_TOKEN_CONTRACT);
 if (state.assetByKey[_nbDedup]) delete state.assetByKey[_nbDedup];
 if (state.balanceTsMap && state.balanceTsMap[_nbDedup]) delete state.balanceTsMap[_nbDedup];
 if (state.priceMap && state.priceMap[_nbDedup]) delete state.priceMap[_nbDedup];
 if (state.priceTsMap && state.priceTsMap[_nbDedup]) delete state.priceTsMap[_nbDedup];
 }

 state.assets = AssetManager.toArray(state.assetByKey);
 state._balMs = Date.now() - state._tBalanceStart;
 
 // v4.12.34: CHECKPOINT 2 - After token scan
 // Save all discovered balances before pricing phase
 // This ensures balances are preserved even if pricing times out
 this._checkpointSave("SCAN", addrLower, state, cache, config);
 
 // ============================================================
 // Phase 2: Price fetch (EVM-specific logic)
 // ============================================================
 state._tPriceStart = Date.now();
 
 // === BASEENGINE: Get FX rate with fallback ===
 BaseEngine.getFxRate(state, cache);
 
 if (budget.allowPrices && !config.FLAGS.DISABLE_LIVE_PRICES) {
 // v4.15.7 FIX: on ne supprime plus state.priceMap/priceTsMap préventivement.
 // Seul asset.price_eur est effacé pour réarmer la fallback Llama/CG quand
 // BulkPriceFetch ne couvre pas un token. Si tous les fetches échouent, la
 // boucle de préservation ligne ~770 restaure l'ancien prix depuis state.priceMap
 // (tant qu'il est < STALE_PRESERVE_MS). Sinon la cellule reste vide — jamais
 // "effacée avant remplacement confirmé" (cf. feedback preserve cache).
 if (dueFullPrice || (force && budget.dueFullPrice)) {
 for (var resetIdx = 0; resetIdx < state.assets.length; resetIdx++) {
 var assetToReset = state.assets[resetIdx];
 if (assetToReset && assetToReset.contract !== "native") {
  delete assetToReset.price_eur;
 }
 }
 }
 // v4.15.7 FIX: bloc `if (force)` natif retiré. La fallback native ligne ~700
 // (v4.10.5) restaure le prix cached quand Llama échoue ; la pré-suppression
 // contredisait cette protection.
 
 // Build price targets
 var maxPriceTargets = config.LIMITS.MAX_PRICE_TARGETS || 180;
 var priceTargets = [];
 var seenTargets = {};
 
 function _addPriceTarget(contract) {
 if (!contract) return;
 var c = Addr.normalize(contract);
 if (!c || c === "native") return;
 if (seenTargets[c]) return;
 if (priceTargets.length >= maxPriceTargets) return;
 seenTargets[c] = true;
 priceTargets.push(c);
 }
 
 var _tight = state.timer.isLow(config.TIMEOUTS.HARD_PRICE_CUTOFF_MS);
 // v4.15.9: priorité dans priceTargets — tokens sans prix cached d'abord,
 // puis tokens avec prix le plus ancien (priceTsMap ascending). Garantit que
 // le MAX_PRICE_TARGETS cap et les breaks timer downstream servent en premier
 // les tokens les plus en retard, évitant qu'un token fraîchement re-pricé
 // monopolise le budget alors qu'un autre stagne sans prix.
 var _assetsSorted = state.assets.slice().sort(function(a, b) {
 var ac = (a && a.contract && a.contract !== "native") ? Addr.normalize(a.contract) : null;
 var bc = (b && b.contract && b.contract !== "native") ? Addr.normalize(b.contract) : null;
 if (!ac && !bc) return 0;
 if (!ac) return 1;
 if (!bc) return -1;
 var aHas = state.priceMap && Num.isValidPositive(state.priceMap[ac]);
 var bHas = state.priceMap && Num.isValidPositive(state.priceMap[bc]);
 if (!aHas && bHas) return -1;
 if (aHas && !bHas) return 1;
 if (!aHas && !bHas) return 0;
 var aTs = (state.priceTsMap && Num.isValid(state.priceTsMap[ac])) ? state.priceTsMap[ac] : 0;
 var bTs = (state.priceTsMap && Num.isValid(state.priceTsMap[bc])) ? state.priceTsMap[bc] : 0;
 return aTs - bTs;
 });
 // v4.15.13: unconditional zero-balance skip (was `_tight &&`).
 // A token with balance=0 yields value_eur=0 regardless of price, so
 // pricing it is pure HTTP waste (GT/DEX). Next cycle with balance>0
 // re-triggers pricing naturally.
 for (var pi = 0; pi < _assetsSorted.length && priceTargets.length < maxPriceTargets; pi++) {
 var pa = _assetsSorted[pi];
 if (!pa || !pa.contract || pa.contract === "native") continue;
 if (!Num.isPositive(pa.balance)) continue;
 _addPriceTarget(pa.contract);
 }

 // Add contracts from tokensRange that need price refresh.
 // v4.15.13: also skip if wallet has no positive balance for the token.
 try {
 var ttlMs = config.CACHE.PRICE_TTL_MS || 43200000;
 var softCap = config.TIMEOUTS.HARD_GUARD_MS || 24000;
 var _balByContract = {};
 for (var bi = 0; bi < state.assets.length; bi++) {
 var ba = state.assets[bi];
 if (ba && ba.contract && ba.contract !== "native" && Num.isPositive(ba.balance)) {
 _balByContract[Addr.normalize(ba.contract)] = true;
 }
 }
 if (!_tight && state.timer.elapsed() <= softCap) {
 for (var ti = 0; ti < allContracts.length && priceTargets.length < maxPriceTargets; ti++) {
 var tc = Addr.normalize(allContracts[ti]);
 if (!tc || tc === "native") continue;
 if (!_balByContract[tc]) continue;
 var ts = state.priceTsMap[tc];
 var due = (!Num.isValid(ts) || (state.nowMs - ts) > ttlMs);
 if (due) _addPriceTarget(tc);
 }
 }
 } catch (eTRPx) {}

 var workerCacheApplied = BaseEngine.applyPricingWorkerCache(priceTargets, state.assets, state, config);
 if (workerCacheApplied && workerCacheApplied.remaining) {
 priceTargets = workerCacheApplied.remaining;
 }
 state._pricingWorkerQueued = BaseEngine.registerPricingWorkerTargets(priceTargets, config);
 if ((state._pricingWorkerQueued || 0) > 0) {
 nativeInfo += " priceQueue:" + (state._pricingWorkerQueued || 0);
 }
 if (BaseEngine.isPhaseCEnabled() && BaseEngine.isPricingWorkerEnabled() && !state.force) {
 priceTargets = [];
 }
 budget.pricingMode = state.pricingMode || BaseEngine.getPricingMode(state);
 
 // Fetch prices
 // v4.13.10: skipL1 on forceFull — bypass L1 CacheService to force fresh API prices
 // Tokens paired against non-stablecoin quote tokens can have wrong USD prices
 // stuck in L1 (2h TTL) that never get corrected without this bypass.
 var priceUsdMap = BulkPriceFetch.fetch(priceTargets, {
 dex: budget.allowDexBulk,
 gt: budget.allowGT,
 parallelPrices: budget.parallelPrices,
 skipL1: state.force
 }, state.timer, config);
 
 var applied = 0;
 
 // Native price
 var natAsset = null;
 for (var ni = 0; ni < state.assets.length; ni++) {
 if (state.assets[ni] && state.assets[ni].contract === "native") {
 natAsset = state.assets[ni];
 break;
 }
 }
 
 if (natAsset) {
 var pNat = PriceManager.computePriceEur(
 natAsset, config.KEYS.NATIVE_PRICE, priceUsdMap, state.fxRate,
 state.priceMap, state.priceTsMap, state.attemptTsMap,
 state.nowMs, state.timer, budget, config
 );
 if (Num.isValidPositive(pNat)) {
 state.priceMap[config.KEYS.NATIVE_PRICE] = pNat;
 state.priceTsMap[config.KEYS.NATIVE_PRICE] = state.nowMs;
 state.priceMap['native'] = pNat;
 state.priceTsMap['native'] = state.nowMs;
 natAsset.price_eur = pNat;
 applied++;
 }
 // v4.10.5 FIX: Preserve cached native price on fetch failure
 else if (Num.isValidPositive(state.priceMap[config.KEYS.NATIVE_PRICE])) {
 natAsset.price_eur = state.priceMap[config.KEYS.NATIVE_PRICE];
 } else if (Num.isValidPositive(state.priceMap['native'])) {
 natAsset.price_eur = state.priceMap['native'];
 }
 }
 
 // Token prices
 for (var pj = 0; pj < state.assets.length; pj++) {
 if (state.timer.isLow(config.TIMEOUTS.SAFE_SAVE_MARGIN_MS + 1600)) break;
 var aP = state.assets[pj];
 if (!aP || !aP.contract || aP.contract === "native" || !Num.isPositive(aP.balance)) continue;
 var keyL = Addr.normalize(aP.contract);
 var px = priceUsdMap[keyL];
 if (px && Num.isValidPositive(px.priceUsd) && Num.isValidPositive(state.fxRate)) {
 var pE = px.priceUsd * state.fxRate;
 if (Num.isValidPositive(pE)) {
 state.priceMap[keyL] = pE;
 state.priceTsMap[keyL] = state.nowMs;
 aP.price_eur = pE;
 if (!aP.symbol && px.symbol) aP.symbol = px.symbol;
 if (!aP.name && px.name) aP.name = px.name;
 
 // v4.12.5: Propagate DexScreener metadata to metaMap for persistence
 // This fixes tokens with non-standard contracts that don't respond to symbol()/name() RPC calls
 if ((px.symbol || px.name) && metaMap) {
 if (!metaMap[keyL]) metaMap[keyL] = { lastSeenMs: state.nowMs };
 if (!metaMap[keyL].symbol && px.symbol) metaMap[keyL].symbol = px.symbol;
 if (!metaMap[keyL].name && px.name) metaMap[keyL].name = px.name;
 if (!metaMap[keyL].lastSeenMs) metaMap[keyL].lastSeenMs = state.nowMs;
 }
 
 applied++;
 }
 }
 }
 
 // Fallback pricing (Llama/CoinGecko)
 var maxFb = budget.maxPriceLookups | 0;
 var usedFb = 0;
 if (budget.allowLlamaCg && maxFb > 0) {
 for (var fk = 0; fk < state.assets.length && usedFb < maxFb; fk++) {
 if (state.timer.isLow(config.TIMEOUTS.SAFE_SAVE_MARGIN_MS + 1600)) break;
 var af = state.assets[fk];
 if (!af || !af.contract || af.contract === "native" || !Num.isPositive(af.balance) || Num.isValidPositive(af.price_eur)) continue;
 var kk = Addr.normalize(af.contract);
 var oldPriceEur = (state.priceMap && Num.isValidPositive(state.priceMap[kk])) ? state.priceMap[kk] : null;
 var pF = PriceManager.computePriceEur(
 af, kk, {}, state.fxRate, state.priceMap, state.priceTsMap,
 state.attemptTsMap, state.nowMs, state.timer, budget, config
 );
 if (Num.isValidPositive(pF)) {
 state.priceMap[kk] = pF;
 // v4.13.9: Only refresh timestamp if price actually changed (>0.1% delta)
 // Prevents stale prices from being perpetually "fresh" when computePriceEur
 // returns the cached value from step 0 without fetching a new price
 if (!Num.isValidPositive(oldPriceEur) || Math.abs(pF - oldPriceEur) / oldPriceEur > 0.001) {
 state.priceTsMap[kk] = state.nowMs;
 }
 af.price_eur = pF;
 usedFb++;
 }
 }
 }
 
 // v4.14.4: Stale price preservation — keep cached prices (up to 6h) for tokens that
 // BulkPriceFetch + fallback couldn't re-price this cycle, preventing price loss between cycles
 var STALE_PRESERVE_MS = 21600000; // 6h — same as GlobalPriceCache staleness
 for (var sp = 0; sp < state.assets.length; sp++) {
 var aSp = state.assets[sp];
 if (!aSp || !aSp.contract || aSp.contract === "native" || !Num.isPositive(aSp.balance)) continue;
 if (Num.isValidPositive(aSp.price_eur)) continue; // already priced this cycle
 var spK = Addr.normalize(aSp.contract);
 var cachedP = state.priceMap && state.priceMap[spK];
 var cachedTs = state.priceTsMap && state.priceTsMap[spK];
 if (Num.isValidPositive(cachedP) && cachedTs && (state.nowMs - cachedTs) < STALE_PRESERVE_MS) {
  aSp.price_eur = cachedP;
 }
 }

  state.pricesFetched = applied;
  if (dueFullPrice && applied > 0) state.lastFullPriceMs = state.nowMs;
  if (state.autoForced && applied > 0) state.lastFullPriceMs = state.nowMs;
  }

  // v4.15.40: Activity-based balance re-verification
  // When the WATCHDOG detected a nonce change (activity), RPC batch calls
  // can return stale balances for some tokens. We re-verify each token's
  // balance with an individual non-batched RPC call against the best
  // healthy endpoint.
  if (state.activityForced && state.assets && state.assets.length > 0) {
    try {
      var rpcForVerify = null;
      try {
        if (typeof RpcSelector !== "undefined" && RpcSelector.pickBest) {
          rpcForVerify = RpcSelector.pickBest(null, config);
        }
      } catch (ePick) {}
      if (!rpcForVerify) rpcForVerify = (config && config.RPC && config.RPC.ENDPOINTS && config.RPC.ENDPOINTS[0]) || null;
      if (rpcForVerify) {
        var verifyCount = 0;
        for (var via = 0; via < state.assets.length; via++) {
          var av = state.assets[via];
          if (!av || !av.contract || av.contract === "native" || !Num.isPositive(av.balance)) continue;
          if (state.timer && state.timer.isLow(3000)) break;
          try {
            var data = "0x70a08231" + Addr.pad32(addrLower);
            var payload = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: av.contract, data: data }, "latest"] });
            var resp = UrlFetchApp.fetch(rpcForVerify, { method: "post", contentType: "application/json", payload: payload, muteHttpExceptions: true });
            if (resp && resp !== null && resp.getResponseCode && resp.getResponseCode() === 200) {
              var j = JSON.parse(resp.getContentText());
              if (j && j.result && j.result !== "0x") {
                var raw = j.result;
                var dec = av.decimals || 18;
                var newBal = typeof raw === "string" ? parseInt(raw, 16) / Math.pow(10, dec) : Number(raw);
                if (isFinite(newBal) && newBal >= 0) {
                  var oldBal = Num.parse(av.balance);
                  if (oldBal !== null && Math.abs(newBal - oldBal) > 1e-15) {
                    av.balance = newBal;
                    verifyCount++;
                  }
                }
              }
            }
          } catch (eVer) {}
        }
        if (verifyCount > 0) {
          nativeInfo += " reVerify:" + verifyCount;
        }
      }
    } catch (eVerifyAll) {}
  }

  // v4.12.25: Final metadata enrichment from L1 DexScreener cache + GeckoTerminal fallback
 // PRIORITY ORDER:
 // 1. Tokens with price but NO metadata ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ VISIBLE to user with empty ticker (HIGHEST!)
 // 2. Tokens with balance but no price and no metadata ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ new tokens
 // 3. Tokens with balance only ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ less urgent
 var gtMetaCalls = 0;
 var maxGtMetaCalls = 35; // v4.12.25: Increased from 25 to handle more tokens
 
 try {
 var l1Cache = CacheService.getScriptCache();
 var chainKey = (config.CHAIN.CHAIN_ID || config.CHAIN.ID || config.CHAIN.NAME || "unknown").toString().toLowerCase();
 
 // v4.12.25: Sort assets - tokens with PRICE but no metadata FIRST (most visible!)
 var sortedAssets = [];
 for (var mi = 0; mi < state.assets.length; mi++) {
 var mAsset = state.assets[mi];
 if (!mAsset || !mAsset.contract || mAsset.contract === "native") continue;
 if (mAsset.symbol && mAsset.name) continue; // Already has metadata
 sortedAssets.push(mAsset);
 }
 // v4.12.25: CORRECTED SORT ORDER
 // Priority: 1) Has PRICE but no metadata = VISIBLE TO USER (highest priority!)
 // 2) Has balance but no price = new token (will get price later)
 // 3) Everything else
 sortedAssets.sort(function(a, b) {
 var aHasPrice = Num.isValidPositive(a.price_eur) ? 1 : 0;
 var bHasPrice = Num.isValidPositive(b.price_eur) ? 1 : 0;
 var aHasBalance = Num.isPositive(a.balance) ? 1 : 0;
 var bHasBalance = Num.isPositive(b.balance) ? 1 : 0;
 
 // Tokens with price but no metadata are MOST URGENT (visible to user!)
 // Sort by: 1) Has price (descending), 2) Has balance (descending)
 if (aHasPrice !== bHasPrice) return bHasPrice - aHasPrice; // Price first!
 return bHasBalance - aHasBalance; // Then balance
 });
 
 for (var si = 0; si < sortedAssets.length; si++) {
 var mAsset = sortedAssets[si];
 var mKey = Addr.normalize(mAsset.contract);
 var dexL1Key = "DEX:" + chainKey + ":" + mKey;
 
 // Try L1 DexScreener cache first
 try {
 var raw = l1Cache.get(dexL1Key);
 if (raw) {
 var dexData = JSON.parse(raw);
 if (dexData) {
 if (!mAsset.symbol && dexData.s) {
 mAsset.symbol = dexData.s;
 if (metaMap) {
 if (!metaMap[mKey]) metaMap[mKey] = { lastSeenMs: state.nowMs };
 if (!metaMap[mKey].symbol) metaMap[mKey].symbol = dexData.s;
 }
 }
 if (!mAsset.name && dexData.n) {
 mAsset.name = dexData.n;
 if (metaMap) {
 if (!metaMap[mKey]) metaMap[mKey] = { lastSeenMs: state.nowMs };
 if (!metaMap[mKey].name) metaMap[mKey].name = dexData.n;
 }
 }
 }
 }
 } catch (eL1Read) {}
 
 // v4.12.25: GeckoTerminal fallback - reduced time threshold (800ms instead of 1500ms)
 // New tokens with balance NEED metadata, so we're more aggressive
 if ((!mAsset.symbol || !mAsset.name) && gtMetaCalls < maxGtMetaCalls && !state.timer.isLow(800)) {
 try {
 var gtMeta = PriceSources.getGeckoTerminalMeta(mKey, state.timer, config);
 gtMetaCalls++;
 if (gtMeta) {
 if (!mAsset.symbol && gtMeta.symbol) {
 mAsset.symbol = gtMeta.symbol;
 if (metaMap) {
 if (!metaMap[mKey]) metaMap[mKey] = { lastSeenMs: state.nowMs };
 if (!metaMap[mKey].symbol) metaMap[mKey].symbol = gtMeta.symbol;
 }
 }
 if (!mAsset.name && gtMeta.name) {
 mAsset.name = gtMeta.name;
 if (metaMap) {
 if (!metaMap[mKey]) metaMap[mKey] = { lastSeenMs: state.nowMs };
 if (!metaMap[mKey].name) metaMap[mKey].name = gtMeta.name;
 }
 }
 }
 } catch (eGtMeta) {}
 }
 
 // v4.13.4: RPC fallback for tokens not on any DEX/indexer (e.g. RealT DeFi tokens)
 // symbol() and name() are standard ERC20 methods - always available on-chain
 if ((!mAsset.symbol || !mAsset.name) && !state.timer.isLow(1200)) {
 var metaRpc = rpc || (config.RPC && config.RPC.ENDPOINTS && config.RPC.ENDPOINTS[0]);
 if (metaRpc) {
 try {
 if (!mAsset.symbol) {
   var symResult = RpcClient.call(metaRpc, "eth_call", [{ to: mKey, data: "0x95d89b41" }, "latest"], state.timer, 1, config);
   var sym = AbiDecode.decodeStringOrBytes32(symResult);
   if (sym) {
     mAsset.symbol = sym;
     if (metaMap) {
       if (!metaMap[mKey]) metaMap[mKey] = { lastSeenMs: state.nowMs };
       if (!metaMap[mKey].symbol) metaMap[mKey].symbol = sym;
     }
   }
 }
 if (!mAsset.name) {
   var nameResult = RpcClient.call(metaRpc, "eth_call", [{ to: mKey, data: "0x06fdde03" }, "latest"], state.timer, 1, config);
   var nm = AbiDecode.decodeStringOrBytes32(nameResult);
   if (nm) {
     mAsset.name = nm;
     if (metaMap) {
       if (!metaMap[mKey]) metaMap[mKey] = { lastSeenMs: state.nowMs };
       if (!metaMap[mKey].name) metaMap[mKey].name = nm;
     }
   }
 }
 } catch (eRpcMeta) {}
 }
 }
 }
 } catch (eL1Phase) {}
 
 // v4.13.4: Count assets still missing metadata after all resolution attempts
 var missingMetaCount = 0;
 for (var mc = 0; mc < state.assets.length; mc++) {
 var mcAsset = state.assets[mc];
 if (!mcAsset || !mcAsset.contract || mcAsset.contract === "native") continue;
 if (!Num.isPositive(mcAsset.balance)) continue; // Only count tokens with balance
 if (!mcAsset.symbol || !mcAsset.name) missingMetaCount++;
 }
 if (state._scanStats) {
 state._scanStats.missingMeta = missingMetaCount;
 // v4.13.4: Cycle is NOT complete if metadata is missing
 if (missingMetaCount > 0) state._scanStats.fullCycleComplete = false;
 }
 // v4.13.4: Append metadata status to nativeInfo and update fullScanStats
 if (missingMetaCount > 0) {
 nativeInfo += " meta_missing:" + missingMetaCount;
 fullScanStats.fullCycleComplete = false;
 }

 // v4.14.2: Count assets with balance but no price — must match Pricing.missing_count from BASE_ENGINE
 // Uses same 3-tier lookup: asset.price_eur → priceMap[key] → priceMap["native"]
 var missingPriceCount = 0;
 var _pmLocal = state.priceMap || {};
 var _natKey = (config.KEYS && config.KEYS.NATIVE_PRICE) ? config.KEYS.NATIVE_PRICE : "native";
 var _pxIgnore = config.PRICE_IGNORE_CONTRACTS || [];
 for (var mp = 0; mp < state.assets.length; mp++) {
 var mpAsset = state.assets[mp];
 if (!mpAsset) continue;
 var mpBal = Number(mpAsset.balance || 0);
 if (!Num.isPositive(mpBal)) continue;
 var mpContract = mpAsset.contract || "";
 var mpPxKey = (mpContract === "native") ? _natKey : Addr.normalize(mpContract);
 var mpPx = 0;
 // Explicit no-market zero prices are display values, not completion signals.
 if (Num.isValidPositive(mpAsset.price_eur)) { mpPx = Number(mpAsset.price_eur); }
 if (!Num.isValidPositive(mpPx) && _pmLocal[mpPxKey]) { mpPx = Number(_pmLocal[mpPxKey]); }
 if (!Num.isValidPositive(mpPx) && mpContract === "native" && _pmLocal["native"]) { mpPx = Number(_pmLocal["native"]); }
 if (!Num.isValidPositive(mpPx) && _pxIgnore.indexOf(mpPxKey) < 0) missingPriceCount++;
 }
 if (state._scanStats) {
 state._scanStats.missingPrices = missingPriceCount;
 if (missingPriceCount > 0) state._scanStats.fullCycleComplete = false;
 }
 if (missingPriceCount > 0) {
 nativeInfo += " price_missing:" + missingPriceCount;
 fullScanStats.fullCycleComplete = false;
 }

 if ((missingMetaCount > 0 || missingPriceCount > 0) && nativeInfo && nativeInfo.indexOf("cycle:DONE") >= 0) {
 nativeInfo = nativeInfo.replace("cycle:DONE", "cycle:partial");
 }

 state._priceMs = Date.now() - state._tPriceStart;
 
 // v4.12.34: CHECKPOINT 3 - After pricing
 // Save all balances + prices before output build
 // This is the most complete checkpoint before final save
 this._checkpointSave("PRICE", addrLower, state, cache, config);
 
 // Clear error on success
 if (cache) {
 cache.last_error = null;
 cache.last_error_ts = null;
 }
 
 // ============================================================
 // Build output
 // ============================================================
 budget.pricingMode = budget.pricingMode || BaseEngine.getPricingMode(state);
 budget.diagTiming = "bal=" + (state._balMs|0) + "ms; price=" + (state._priceMs|0) + "ms" + 
   (state._checkpointCount ? "; chkpt=" + state._checkpointCount : "");
 var ls = (RpcClient && RpcClient.getLatencyStats) ? RpcClient.getLatencyStats() : null;
 if (ls) {
 budget.diagRpc = "rpcCalls=" + (ls.calls|0) + "; batch=" + (ls.batchCalls|0) +
 "; rpcAvg=" + (ls.avgMs|0) + "ms; rpcMax=" + (ls.maxMs|0) + "ms";
 }
  var hs = (typeof Http !== 'undefined' && Http.getStats) ? Http.getStats() : null;
  if (hs) {
  budget.diagHttp = "httpCalls=" + (hs.calls|0) + "; fetchAllItems=" + (hs.fetchAllItems|0) +
  "; hosts=" + (hs.hosts && hs.hosts.length ? hs.hosts.slice(0, 5).join(",") : "none");
  if (state._scanStats) {
    state._scanStats.httpCalls = hs.calls | 0;
    state._scanStats.fetchAllItems = hs.fetchAllItems | 0;
  }
  }
 
 var output = OutputBuilder.full(
 chainName, state.assets, state.priceMap, state.fxRate,
 budget, nativeInfo, fullScanStats, state.timer,
 state.rrCursor, allContracts.length, state.pricesFetched,
 config, state.autoForced,
 { cacheVersionMismatch: state.cacheVersionMismatch, staleCachePreserved: state._staleCachePreserved, pricingMode: budget.pricingMode || state.pricingMode }
 );
 
 // Extract INFO/META rows for cache
 var infoMetaRows = OutputBuilder.extractInfoMetaRows(output, chainName);
 
 // Save caches
 this._saveAllCaches(
 addrLower, state.nowMs, state.assets, state.assetByKey,
 state.balanceTsMap, state.attemptTsMap, state.purgedTsMap,
  state.fxRate, state.priceMap, state.priceTsMap,
  state.rrCursor, cache, state.lastFullScanMs, state.lastFullPriceMs,
  metaMap, state.timer, config, infoMetaRows, state._scanStats, state.strictTokenSet
  );
 
 // v4.13.0: Removed ChainBudgetStats and BudgetStats tracking
 // Simplified rotation model doesn't need execution history
 // Diagnostic info available in INFO_ROT and INFO_NATIVE

 // v4.14.7: Auto-register wallet with ActivityTracker if not already tracked
 // One-time nonce fetch per wallet — WATCHDOG handles subsequent updates
 // Registers with nonce=0 when RPC fails (prevents permanent blind spots)
 try {
 if (typeof ActivityTracker !== 'undefined' && ActivityTracker.getInfo && ActivityTracker.updateNonce) {
   // v4.14.7: Update _RpcLookup with all endpoints for this chain (fallback RPCs)
   // This runs in non-trigger context where config is available
   if (typeof _RpcLookup !== 'undefined' && _RpcLookup.set && config.RPC && config.RPC.ENDPOINTS && config.CHAIN) {
     var ckName = config.CHAIN.NAME || "";
     var ep = config.RPC.ENDPOINTS;
     if (ckName && ep.length > 0) {
       _RpcLookup.set(ckName, ep[0], "EVM", ep.slice(1, 3));
     }
   }
   var actInfo = ActivityTracker.getInfo(config, addrLower);
   if (!actInfo || (actInfo && actInfo.nonce === 0)) {
     // Not tracked OR registered with nonce=0 (fallback) — try to fetch real nonce
     // v4.14.7: Try multiple RPCs (not just [0]) for resilience
     var endpoints = (config.RPC && config.RPC.ENDPOINTS) || [];
     if (endpoints.length > 0 && typeof fetchEvmNonce === 'function') {
       var regNonce = null;
       for (var ri = 0; ri < Math.min(endpoints.length, 3) && regNonce === null; ri++) {
         try { regNonce = fetchEvmNonce(addrLower, endpoints[ri]); } catch (eRpc) {}
       }
       ActivityTracker.updateNonce(config, addrLower, regNonce !== null ? regNonce : 0);
     }
   }
 }
 } catch (eActivity) {}

 RpcHealth.saveToCache(config);
 PriceRunCache.reset();
 RpcClient.resetStats();

 return output;
 
 } catch (eMain) {
 return fallbackToCache("Exception: " + (eMain.message || String(eMain)));
 }
 },
 
 /**
 * getCachedWalletAssets - Returns cached data with recalculated total
 * v4.11.0: Unchanged from v4.10.5 (EVM-specific logic)
 */
 getCachedWalletAssets: function(address, config, walletNames) {
 try {
 var chainName = this._getChainName(address, config, walletNames);
 CacheManager.init();
  var addr = Addr.normalize(address);
  var cache = WalletCache.load(addr, null, config);
  if (!cache) {
  var snap = null;
   try {
   if (typeof OutputSnapshotCache !== 'undefined') snap = OutputSnapshotCache.load(config, addr, "NO_CACHE_MISSING_WALLET_CACHE");
   } catch (eSnapLoad) {}
  if (snap) return snap;
  var emptyCache = (typeof BaseEngine !== "undefined" && BaseEngine.createEmptyCache) ? BaseEngine.createEmptyCache(config) : { assets: [], priceMap: {} };
  emptyCache.wallet_original = address;
  return OutputBuilder.fromCacheFallback(chainName, emptyCache, null, "NO_CACHE_WAITING_REFRESH", config);
  }
 var cachedQuotaBlocked = false;
 try {
 cachedQuotaBlocked = (typeof BaseEngine !== 'undefined' && BaseEngine.isSystemBlocked && BaseEngine.isSystemBlocked()) ||
 (typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped()) ||
 (typeof HttpErrorGuard !== 'undefined' && HttpErrorGuard.isQuotaExhausted && HttpErrorGuard.isQuotaExhausted());
 } catch (eCqb) {}

 if (config && config.FLAGS && (config.FLAGS.DISABLE_NATIVE_BALANCE || config.FLAGS.NATIVE_BALANCE_TOKEN_CONTRACT) && cache.assets && Array.isArray(cache.assets)) {
 cache.assets = cache.assets.filter(function(a) {
 if (!(a && String(a.contract || "").toLowerCase() === "native")) return true;
 if (config.FLAGS.DISABLE_NATIVE_BALANCE) return false;
 var maxNative = Number(config.FLAGS.NATIVE_BALANCE_MAX_REASONABLE || 1000000000000);
 var bal = Num.parse(a.balance);
 return bal != null && bal >= 0 && bal <= maxNative;
 });
 }

 // Load MetaCache AND GlobalPriceCache for metadata enrichment
 var metaMap = null;
 try { metaMap = MetaCache.load(null, config); } catch (eMeta) { metaMap = {}; }
 
 var globalPriceCache = null;
 try { globalPriceCache = GlobalPriceCache.load(null, config); } catch (eGpc) { globalPriceCache = {}; }

 // v4.15.16: Cache-only Ledger rows must consume prices found by the
 // background pricing worker. The worker writes GlobalPriceCache, while A1
 // reads WalletCache; bridge the two without HTTP.
 try {
 if (!cache.priceMap) cache.priceMap = {};
 if (!cache.priceTsMap) cache.priceTsMap = {};
 var gpcPriceMap = (globalPriceCache && globalPriceCache.priceMap) ? globalPriceCache.priceMap : {};
 var gpcPriceTsMap = (globalPriceCache && globalPriceCache.priceTsMap) ? globalPriceCache.priceTsMap : {};
 var gpFxRate = (cache && Num.isValidPositive(cache.usd_to_eur_rate)) ? Number(cache.usd_to_eur_rate) : null;
 for (var gp = 0; gp < (cache.assets || []).length; gp++) {
 var gpAsset = cache.assets[gp];
 if (!gpAsset || !gpAsset.contract || gpAsset.contract === "native") continue;
 var gpKey = Addr.normalize(gpAsset.contract);
 if (Num.isValidPositive(gpAsset.price_eur)) continue;
 var gpEur = cache.priceMap[gpKey];
 if (!Num.isValidPositive(gpEur)) gpEur = gpcPriceMap[gpKey];
 if (!Num.isValidPositive(gpEur) && typeof BaseEngine !== 'undefined' && BaseEngine.getWorkerCachedPriceEur) {
 var gpWorker = BaseEngine.getWorkerCachedPriceEur(config, gpKey, gpFxRate, Date.now());
 if (gpWorker && Num.isValidPositive(gpWorker.priceEur)) {
 gpEur = gpWorker.priceEur;
 if (!cache.priceTsMap[gpKey] && gpWorker.ts) cache.priceTsMap[gpKey] = gpWorker.ts;
 }
 }
 if (Num.isValidPositive(gpEur)) {
 gpAsset.price_eur = Number(gpEur);
 cache.priceMap[gpKey] = Number(gpEur);
 if (!cache.priceTsMap[gpKey] && gpcPriceTsMap[gpKey]) cache.priceTsMap[gpKey] = gpcPriceTsMap[gpKey];
 }
 }
 } catch (eGpcPriceMerge) {}

 // Enhanced metadata enrichment from multiple sources
 // v4.12.32: Track enrichment from ALL sources, not just GeckoTerminal
  var assets = cache.assets || [];
  var repairedDecimalsArtifacts = this._repairExplicitDecimalsCacheArtifacts(cache, config);
  if (repairedDecimalsArtifacts) {
  try { WalletCache.save(addr, cache, config); } catch (eRepairSave) {}
  }
  var metaEnrichedFromCache = false;  // v4.12.32: Track enrichment from cache sources

 // v4.15.3/v4.15.5: Cached Ledger sheets can call only CACHED_WALLET_ASSETS_*.
 // Keep this quota-aware: refresh native override only when cache is missing,
 // stale, or implausible, never while quota protection is active.
 if (config && config.FLAGS && config.FLAGS.NATIVE_BALANCE_TOKEN_CONTRACT) {
 try {
 var cNbExisting = null;
 for (var cne = 0; cne < assets.length; cne++) {
 if (assets[cne] && String(assets[cne].contract || "").toLowerCase() === "native") {
 cNbExisting = assets[cne];
 break;
 }
 }
 var cNbNow = Date.now();
 var cNbTtl = Number(config.FLAGS.NATIVE_BALANCE_CACHE_TTL_MS || 3600000);
 var cNbMax = Number(config.FLAGS.NATIVE_BALANCE_MAX_REASONABLE || 1000000000000);
 var cNbBal = cNbExisting ? Num.parse(cNbExisting.balance) : null;
 var cNbTs = cache.balanceTsMap && cache.balanceTsMap["native"] ? Number(cache.balanceTsMap["native"]) : 0;
 var cNbMissing = !cNbExisting || cNbBal == null;
 var cNbSuspect = cNbBal != null && (cNbBal < 0 || cNbBal > cNbMax);
 var cNbStale = !cNbTs || (cNbNow - cNbTs) > cNbTtl;
 if (cachedQuotaBlocked || (!cNbMissing && !cNbSuspect && !cNbStale)) throw new Error("cached-native-skip");
 var cNbContract = Addr.normalize(config.FLAGS.NATIVE_BALANCE_TOKEN_CONTRACT);
 var cNbData = "0x70a08231" + Addr.pad32(addr);
 var cNbRpc = (config.FLAGS && config.FLAGS.NATIVE_BALANCE_RPC)
 ? config.FLAGS.NATIVE_BALANCE_RPC
 : ((config.RPC && config.RPC.ENDPOINTS && config.RPC.ENDPOINTS[0]) || RpcSelector.pickBest(null, config));
 if (!cNbRpc) throw new Error("RPC unavailable");
 var cNbTimer = createTimer(5000);
 var cNbHex = RpcClient.call(cNbRpc, "eth_call", [{ to: cNbContract, data: cNbData }, "latest"], cNbTimer, 1, config);
 var cNbRaw = BigInt(cNbHex || "0x0");
 var cNbDecimals = config.CHAIN.NATIVE_DECIMALS || 18;
 var cNbAsset = {
 contract: "native",
 symbol: config.CHAIN.NATIVE_SYMBOL || "USD",
 name: config.CHAIN.NATIVE_NAME || "USD",
 balance: BigNum.toDecimal(cNbRaw, cNbDecimals)
 };
 var cNbFound = false;
 for (var cna = 0; cna < assets.length; cna++) {
 if (assets[cna] && String(assets[cna].contract || "").toLowerCase() === "native") {
 assets[cna] = cNbAsset;
 cNbFound = true;
 break;
 }
 }
 if (!cNbFound) assets.unshift(cNbAsset);
 cache.assets = assets;
 if (!cache.balanceTsMap) cache.balanceTsMap = {};
 cache.balanceTsMap["native"] = cNbNow;
 try { WalletCache.save(addr, cache, config); } catch (eCwSave) {}
 } catch (eCachedNative) {}
 }
 
 for (var m = 0; m < assets.length; m++) {
 var asset = assets[m];
 if (!asset || !asset.contract || asset.contract === "native") continue;
 var key = Addr.normalize(asset.contract);
 var hadSymbol = !!asset.symbol;
 var hadName = !!asset.name;
 
 // Try MetaCache first
 if ((!asset.symbol || !asset.name) && metaMap && metaMap[key]) {
 var meta = metaMap[key];
 if (!asset.symbol && meta.symbol) asset.symbol = meta.symbol;
 if (!asset.name && meta.name) asset.name = meta.name;
 }
 
 // Try GlobalPriceCache (contains DexScreener metadata)
 if ((!asset.symbol || !asset.name) && globalPriceCache && globalPriceCache.metaMap && globalPriceCache.metaMap[key]) {
 var gpcMeta = globalPriceCache.metaMap[key];
 if (!asset.symbol && gpcMeta.symbol) asset.symbol = gpcMeta.symbol;
 if (!asset.name && gpcMeta.name) asset.name = gpcMeta.name;
 }
 
 // v4.12.5 FIX: Get metadata from L1 CacheService (DexScreener cache)
 // Key format must match 07_PRICES.gs: "DEX:{chainId}:{contract}"
 if (!asset.symbol || !asset.name) {
 try {
 var chainKey = (config.CHAIN.CHAIN_ID || config.CHAIN.ID || config.CHAIN.NAME || "unknown").toString().toLowerCase();
 var dexL1Key = "DEX:" + chainKey + ":" + key;
 var l1Cache = CacheService.getScriptCache();
 if (l1Cache) {
 var raw = l1Cache.get(dexL1Key);
 if (raw) {
 var dexData = JSON.parse(raw);
 if (dexData) {
 if (!asset.symbol && dexData.s) asset.symbol = dexData.s;
 if (!asset.name && dexData.n) asset.name = dexData.n;
 }
 }
 }
 } catch (eDex) {}
 }
 
 // v4.12.32: Track if metadata was enriched from ANY cache source
 if ((!hadSymbol && asset.symbol) || (!hadName && asset.name)) {
   metaEnrichedFromCache = true;
   // Also update metaMap for persistence
   if (metaMap && (asset.symbol || asset.name)) {
     if (!metaMap[key]) metaMap[key] = { lastSeenMs: Date.now() };
     if (asset.symbol && !metaMap[key].symbol) metaMap[key].symbol = asset.symbol;
     if (asset.name && !metaMap[key].name) metaMap[key].name = asset.name;
   }
 }
 }
 
 // v4.12.26: LIVE FETCH metadata for tokens still missing symbol/name
 // This ensures tokens with balance/price but no metadata get fixed
 // v4.13.7: SKIP live fetch when quota is stressed - saves HTTP calls
 var _quotaBlocked = false;
 try { _quotaBlocked = (typeof BaseEngine !== 'undefined' && BaseEngine.isSystemBlocked && BaseEngine.isSystemBlocked()) || (typeof HttpErrorGuard !== 'undefined' && HttpErrorGuard.isQuotaExhausted && HttpErrorGuard.isQuotaExhausted()); } catch (eQ) {}
 var _cachedLiveMetadata = !!(config && config.FLAGS && config.FLAGS.CACHED_LIVE_METADATA === true);
 if (_quotaBlocked || !_cachedLiveMetadata) {
   // Skip live HTTP fetch entirely - use only cached metadata sources (already applied above)
 } else try {
 var missingMeta = [];
 for (var mm = 0; mm < assets.length; mm++) {
 var mmAsset = assets[mm];
 if (!mmAsset || !mmAsset.contract || mmAsset.contract === "native") continue;
 if (mmAsset.symbol && mmAsset.name) continue; // Already has metadata
 // Only fetch for tokens with balance (visible to user)
 if (!Num.isPositive(mmAsset.balance)) continue;
 missingMeta.push({ asset: mmAsset, key: Addr.normalize(mmAsset.contract) });
 }
 
 // Sort by value descending (most valuable first)
 missingMeta.sort(function(a, b) {
 var aVal = Num.isValidPositive(a.asset.price_eur) && Num.isPositive(a.asset.balance) 
 ? a.asset.price_eur * a.asset.balance : 0;
 var bVal = Num.isValidPositive(b.asset.price_eur) && Num.isPositive(b.asset.balance)
 ? b.asset.price_eur * b.asset.balance : 0;
 return bVal - aVal;
 });
 
 // v4.13.8: Reduced limits to save HTTP quota (was 25/8s, now 5/3s)
 // getCachedWalletAssets is called frequently — metadata completes over multiple runs
 var maxFetch = 5;
 var metaTimer = createTimer(3000); // 3 second budget
 var metaUpdated = false;
 
 for (var mf = 0; mf < missingMeta.length && mf < maxFetch && !metaTimer.isLow(500); mf++) {
 var mfItem = missingMeta[mf];
 try {
 var gtMeta = PriceSources.getGeckoTerminalMeta(mfItem.key, metaTimer, config);
 if (gtMeta) {
 if (!mfItem.asset.symbol && gtMeta.symbol) {
 mfItem.asset.symbol = gtMeta.symbol;
 metaUpdated = true;
 }
 if (!mfItem.asset.name && gtMeta.name) {
 mfItem.asset.name = gtMeta.name;
 metaUpdated = true;
 }
 // Persist to MetaCache for future reads
 if (metaMap && (gtMeta.symbol || gtMeta.name)) {
 if (!metaMap[mfItem.key]) metaMap[mfItem.key] = { lastSeenMs: Date.now() };
 if (gtMeta.symbol && !metaMap[mfItem.key].symbol) metaMap[mfItem.key].symbol = gtMeta.symbol;
 if (gtMeta.name && !metaMap[mfItem.key].name) metaMap[mfItem.key].name = gtMeta.name;
 }
 }
 } catch (eMfGt) {}
 }
 
 // Save updated MetaCache if we fetched new metadata
 // v4.12.32: Also save if metadata was enriched from cache sources (to persist L1 data)
 if ((metaUpdated || metaEnrichedFromCache) && metaMap) {
 try {
 MetaCache.save(metaMap, null, config);
 } catch (eSaveMeta) {}
 }
 
 // v4.13.7 FIX: PERSIST enriched metadata back to WalletCache
 // CRITICAL: Reload fresh cache before saving to avoid race condition.
 // Previously, getCachedWalletAssets would re-save its stale copy of the cache,
 // overwriting purged tokens that GET_WALLET_ASSETS had removed in parallel.
 // Now we reload the latest cache and only update metadata fields.
 if (metaUpdated || metaEnrichedFromCache) {
 try {
   var freshCache = WalletCache.load(addr, null, config);
   if (freshCache && freshCache.assets && Array.isArray(freshCache.assets)) {
     // Build metadata map from enriched assets
     var enrichedMeta = {};
     for (var em2 = 0; em2 < assets.length; em2++) {
       var eAsset = assets[em2];
       if (!eAsset || !eAsset.contract || eAsset.contract === "native") continue;
       var eKey = Addr.normalize(eAsset.contract);
       if (eAsset.symbol || eAsset.name) {
         enrichedMeta[eKey] = { symbol: eAsset.symbol, name: eAsset.name };
       }
     }
     // Apply enriched metadata to fresh cache assets (don't touch balances/structure)
     var metaChanged = false;
     for (var fc = 0; fc < freshCache.assets.length; fc++) {
       var fAsset = freshCache.assets[fc];
       if (!fAsset || !fAsset.contract || fAsset.contract === "native") continue;
       var fKey = Addr.normalize(fAsset.contract);
       if (enrichedMeta[fKey]) {
         if (!fAsset.symbol && enrichedMeta[fKey].symbol) { fAsset.symbol = enrichedMeta[fKey].symbol; metaChanged = true; }
         if (!fAsset.name && enrichedMeta[fKey].name) { fAsset.name = enrichedMeta[fKey].name; metaChanged = true; }
       }
     }
     if (metaChanged) {
       freshCache.last_meta_update = Format.now();
       WalletCache.save(addr, freshCache, config);
     }
   }
 } catch (eSaveWallet) {
   // Silent fail - metadata will be fetched again next time
 }
 }
 } catch (eLiveFetch) {}

 var out = OutputBuilder.fromCacheOnly(chainName, cache, config);

 // Patch all asset rows with metadata from cache/MetaCache/GlobalPriceCache
 try {
 for (var pr = 1; pr < out.length; pr++) {
 var prow = out[pr];
 if (!prow || prow.length < 7) continue;
 var pContract = String(prow[3] || "");
 if (!pContract) continue;
 
 // Skip if already has symbol and name
 if (prow[1] && prow[2]) continue;
 
 var pKey = Addr.normalize(pContract);
 var pSymbol = prow[1] || "";
 var pName = prow[2] || "";
 
 // Find matching asset from enriched assets array
 for (var pa = 0; pa < assets.length; pa++) {
 var pAsset = assets[pa];
 if (!pAsset) continue;
 if (Addr.normalize(pAsset.contract) === pKey) {
 if (!pSymbol && pAsset.symbol) pSymbol = pAsset.symbol;
 if (!pName && pAsset.name) pName = pAsset.name;
 break;
 }
 }
 
 // Update row with enriched metadata
 if (pSymbol) prow[1] = pSymbol;
 if (pName) prow[2] = pName;
 }
 } catch (ePatchMeta) {}

 // Patch native price if needed
 try {
 var nativeKey = (config && config.KEYS && config.KEYS.NATIVE_PRICE) ? config.KEYS.NATIVE_PRICE : null;
 var fx = (cache && Num.isValidPositive(cache.usd_to_eur_rate)) ? cache.usd_to_eur_rate : null;
 var cachedPriceMap = (cache && cache.priceMap) ? cache.priceMap : {};
 
 if (nativeKey && fx) {
 for (var r = 0; r < out.length; r++) {
 var row = out[r];
 if (row && row.length >= 7 && String(row[3]) === "native") {
 try { if (config && config.CHAIN && config.CHAIN.NATIVE_SYMBOL) row[1] = config.CHAIN.NATIVE_SYMBOL; if (config && config.CHAIN && config.CHAIN.NATIVE_NAME) row[2] = config.CHAIN.NATIVE_NAME; } catch(eNatLbl2) {}
 var bal = null; try { bal = (Num && Num.parse) ? Num.parse(row[4]) : null; } catch(eBal) {} if (bal == null || isNaN(bal)) { try { bal = parseFloat(String(row[4]).replace(",", ".")); } catch(eBal2) {} }
 var eur = null;
 try { eur = PriceManager.computePriceEur({ contract: "native" }, nativeKey, {}, fx, {}, {}, {}, Date.now(), null, null, config); } catch (ePx) { eur = null; }
 if (!Num.isValidPositive(eur)) { eur = cachedPriceMap[nativeKey]; if (!Num.isValidPositive(eur)) eur = cachedPriceMap['native']; }
 if (Num.isValidPositive(eur) && bal != null && !isNaN(bal)) { row[5] = eur; row[6] = bal * eur; }
 break;
 }
 }
 }
 } catch (ePatchNative) {}

 // Recalculate total from actual asset rows
 var recalcTotal = 0;
 for (var t = 1; t < out.length; t++) {
 var val = out[t] && out[t][6];
  if (Num.isValid(val)) recalcTotal += Num.parseOr(val, 0);
 }

 // Add INFO/META rows, patching INFO_TOTAL with recalculated value
 if (cache.lastInfoMetaRows && cache.lastInfoMetaRows.length) {
 for (var i = 0; i < cache.lastInfoMetaRows.length; i++) {
 var rr0 = cache.lastInfoMetaRows[i];
 if (!rr0) continue;
 // Clone to avoid mutating cache
 rr0 = rr0.slice(0);
 // Fix chain name if empty
 if (rr0.length >= 2 && String(rr0[0] || "") === "" && String(rr0[1] || "").indexOf("INFO") === 0) {
 rr0[0] = chainName;
 }
 // Patch INFO_TOTAL with recalculated value
 if (rr0[1] === "INFO_TOTAL") {
 rr0[6] = recalcTotal;
 }
 out.push(rr0);
 }
 } else {
 // Fallback - build complete INFO/META rows including INFO_ROT
 var fxCached = (cache && Num.isValidPositive(cache.usd_to_eur_rate)) ? cache.usd_to_eur_rate : null;
 var rrCursor = Num.isValid(cache.rrCursor) ? cache.rrCursor : 0;
 var assetCount = (cache.assets || []).length;
 
 // INFO_ROT with minimal info for cached mode
 var rotInfo = "chain=" + chainName + "; rot=CACHE; profile=CACHED; rrCursor=" + rrCursor + "; assets=" + assetCount;
 out.push(OutputBuilder.infoRow(chainName, "INFO_ROT", rotInfo));
 out.push(OutputBuilder.infoRow(chainName, "INFO_FX", fxCached ? ("USD->EUR=" + fxCached.toFixed(4)) : "USD->EUR=N/A"));
 out.push(OutputBuilder.infoRow(chainName, "INFO_TOTAL", "Total portefeuille (sum value_eur).", recalcTotal));
 out.push(OutputBuilder.metaRow("last_cache_update", WalletCache.getLastUpdateStr(cache)));
 out.push(OutputBuilder.metaRow("script_version", config.VERSION));
 }

 // Ensure script_version is present and up-to-date
 try {
 var foundSv = false;
 for (var j = 0; j < out.length; j++) { var rr = out[j]; if (rr && rr[0] === "META" && rr[1] === "script_version") { rr[2] = config.VERSION; foundSv = true; break; } }
 if (!foundSv) out.push(OutputBuilder.metaRow("script_version", config.VERSION));
 } catch (eSv) {}

  try { if (typeof OutputSnapshotCache !== 'undefined') OutputSnapshotCache.save(config, addr, out); } catch (eSnapSave) {}
  return out;
  } catch (e) { return OutputBuilder.error(config.CHAIN.NAME, String(e.message || e), config); }
  },

  _repairExplicitDecimalsCacheArtifacts: function(cache, config) {
  try {
  if (!cache || !cache.assets || !Array.isArray(cache.assets)) return false;
  var explicit = config && config.RPC && config.RPC.TOKEN_DECIMALS;
  if (!explicit) return false;
  var fallback = (config && config.LIMITS && config.LIMITS.DECIMALS_FALLBACK) || 18;
  var changed = false;
  for (var i = 0; i < cache.assets.length; i++) {
  var asset = cache.assets[i];
  if (!asset || !asset.contract || asset.contract === "native") continue;
  var key = Addr.normalize(asset.contract);
  var decimals = explicit[key];
  if (!Num.isValid(decimals) || decimals >= fallback) continue;
  var bal = Num.parse(asset.balance);
  if (bal == null || bal <= 0) continue;
  var minUnit = Math.pow(10, -decimals);
  if (bal >= minUnit) continue;

  // A positive balance below the token's minimum unit cannot be real. It is a
  // stale fallback=18 artifact for an explicitly non-18-decimal token.
  var repaired = bal * Math.pow(10, fallback - decimals);
  if (Num.isValid(repaired) && repaired >= minUnit) {
  asset.balance = repaired;
  changed = true;
  }
  }
  return changed;
  } catch (e) {
  return false;
  }
  },
  
  /**
  * getRefreshStatus - Triggers a refresh and returns the ACTUAL cache timestamp
  * 
  * v4.12.30 FIX:
  * - PROBLEM: Previously returned Format.now() even if cache write was blocked
  * - SOLUTION: Now reads actual cache timestamp AFTER refresh attempt
  * - Returns actual cache.updatedAt instead of current time
  * - Shows [BLOCKED] warning if cache wasn't updated
  * 
  * v4.12.29: Now honors forceFull/triggerRefresh parameters (was hardcoded to true)
  */
  getRefreshStatus: function(address, rpc, tokensRange, forceFull, triggerRefresh, config, walletNames) {
    var refreshError = null;
    var addrLower = Addr.normalize(address);
    var cexBusyStatus = BaseEngine.cexBusyStatus ? BaseEngine.cexBusyStatus(addrLower, config) : "";
    if (cexBusyStatus) return cexBusyStatus;
    // v4.13.3: Centralized quota pre-check via BaseEngine
    // v4.14.5: forceFull bypasses quota check — user explicitly wants fresh data
     var forceBypass = (forceFull === false || forceFull === "false" || forceFull === "FALSE") ? false : true;

    // v4.15.122: Load cache BEFORE web scan so the I1 guard can prevent
    // unnecessary rescans (web scan was returning early, bypassing the guard).
    var _httpBefore = BaseEngine.httpSnapshot();
    var beforeTs = 0;
    var cacheBefore = null;
    try {
      CacheManager.init();
      cacheBefore = WalletCache.load(addrLower, null, config);
      if (cacheBefore && cacheBefore.updatedAt) {
        beforeTs = cacheBefore.updatedAt;
      }
    } catch (e) {}

    if (BaseEngine.shouldSkipRefreshForSameTrigger && BaseEngine.shouldSkipRefreshForSameTrigger(addrLower, config, cacheBefore, forceFull, triggerRefresh)) {
      if (beforeTs) return BaseEngine.wrapCacheOnlyMarker(Format.datetime(beforeTs), _httpBefore);
      return "[NO_CACHE] " + Format.now();
    }
    if (BaseEngine.shouldSkipNoTriggerRecentScan && BaseEngine.shouldSkipNoTriggerRecentScan(addrLower, config, cacheBefore, forceFull, triggerRefresh)) {
      if (beforeTs) return BaseEngine.wrapCacheOnlyMarker("[FRESH] " + Format.datetime(beforeTs), _httpBefore);
      return "[NO_CACHE] " + Format.now();
    }

      try {
        if (typeof _webScanWallet_ === "function") {
          var webScan = _webScanWallet_(addrLower, tokensRange, forceFull, config);
          if (webScan && webScan.ok && webScan.status) {
            if (webScan.quotaBlocked && BaseEngine.rememberRefreshTriggerAttempt) {
              BaseEngine.rememberRefreshTriggerAttempt(addrLower, config, cacheBefore, triggerRefresh);
            }
            return webScan.status;
          }
        }
      } catch (eWebScan) {}
      if (typeof _webScanRequiredFor_ === "function" && _webScanRequiredFor_(config)) {
        return (typeof _webScanErrorStatus_ === "function") ? _webScanErrorStatus_(config) : ("[WEB_SCAN_ERROR] " + Format.now());
      }
      // v4.16.30: If GSHEET_WEB_SCAN_REQUIRE is set, NEVER fall through to direct RPC.
      // _webScanWallet_ may return null because of transient ScriptProperties issues
      // (_webScanEnabled_ failed), but that doesn't mean we should waste quota on
      // direct RPC calls. Return the last known cache timestamp, or error.
      if (typeof _webScanMustUse_ === "function" && _webScanMustUse_()) {
        if (beforeTs) return BaseEngine.wrapCacheOnlyMarker(Format.datetime(beforeTs), _httpBefore);
        return (typeof _webScanErrorStatus_ === "function") ? _webScanErrorStatus_(config) : ("[WEB_SCAN_ERROR] " + Format.now());
      }
      // v4.16.30: Direct RPC path REMOVED.
      // All wallet scans now go through the Railway web API (_webScanWallet_).
      // If the web API is unreachable, we serve the last known cache timestamp.
      // There is no fallback to direct blockchain RPC calls.
      if (beforeTs) return BaseEngine.wrapCacheOnlyMarker(Format.datetime(beforeTs), _httpBefore);
      return "[NO_CACHE] " + Format.now();
   },
 
 /**
 * getStats - Diagnostic information
 * v4.11.0: Uses BaseEngine.buildStatsBase()
 * v4.12.34: Added checkpoint tracking info
 */
 getStats: function(address, config, walletNames) {
 try {
 if (!address) return [["Metric", "Value"], ["Error", "Missing address"]];
 var addrLower = Addr.normalize(address);
 if (!Addr.isValid(addrLower)) return [["Metric", "Value"], ["Error", "Invalid address: " + String(address)]];

 CacheManager.init();
 var timer = createTimer((config && config.TIMEOUTS && config.TIMEOUTS.MAX_EXECUTION_MS) || 30000);
 var chainLabel = this._getChainName(address, config, walletNames);
 var cache = WalletCache.load(addrLower, timer, config);
 
 // === BASEENGINE: Use shared stats builder (returns 2 columns) ===
 var stats = BaseEngine.buildStatsBase(addrLower, cache, config, chainLabel, "EVM", timer);
 
 // v4.12.34: Add checkpoint info if present in cache
 if (cache) {
   if (cache._checkpoint || cache._checkpointCount) {
     stats.push(["Cache._checkpoint", cache._checkpoint || "none"]);
     stats.push(["Cache._checkpointCount", cache._checkpointCount || 0]);
     if (cache._checkpointTs) {
       var chkptAge = Math.round((Date.now() - cache._checkpointTs) / 1000);
       stats.push(["Cache._checkpointTs", Format.datetime(cache._checkpointTs) + " (" + chkptAge + "s ago)"]);
     }
     if (cache._checkpointPhases) {
       stats.push(["Cache._checkpointPhases", cache._checkpointPhases]);
     }
   }
 }
 
 return stats;
 
 } catch (e) {
 return [["Metric", "Value"], ["Error", String(e.message || e)]];
 }
 },
 
 // === Helper methods ===
 
 _getChainName: function(address, config, walletNames) {
 if (typeof WalletNames !== "undefined" && WalletNames.get) {
 return WalletNames.get(address, config.CHAIN.NAME, walletNames);
 }
 if (walletNames) {
 var norm = Addr.normalize(address);
 if (walletNames[norm]) return walletNames[norm];
 }
 return config.CHAIN.NAME;
 },
 
 _patchOutputNativePrice: function(out, state, config, chainName) {
 if (!out || !config || !config.CHAIN) return;
 if (config.CHAIN.NATIVE_SYMBOL === "ETH") return;
 
 var fx = (state.cache && Num.isValidPositive(state.cache.usd_to_eur_rate)) 
 ? state.cache.usd_to_eur_rate 
 : state.fxRate;
 var eurNat = null;
 
 try {
 if (fx && config.CHAIN.NATIVE_LLAMA_ID) {
 var usdNat = PriceSources.llamaPriceUsd(config.CHAIN.NATIVE_LLAMA_ID, state.timer, config);
 if (usdNat != null && isFinite(usdNat) && Number(usdNat) > 0) {
 eurNat = Number(usdNat) * Number(fx);
 }
 }
 } catch (e) {}
 
 var total = 0;
 var totalRowIdx = -1;
 
 for (var i = 0; i < out.length; i++) {
 var row = out[i];
 if (!row || row.length < 7) continue;
 if (row[0] === "META" && row[1] === "script_version") {
 row[2] = config.VERSION;
 }
 if (row[1] === "INFO_TOTAL") totalRowIdx = i;
 if (String(row[3]) === "native") {
 if (config.CHAIN.NATIVE_SYMBOL) row[1] = config.CHAIN.NATIVE_SYMBOL;
 if (config.CHAIN.NATIVE_NAME) row[2] = config.CHAIN.NATIVE_NAME;
 var bal = Num.parse(row[4]);
 if (eurNat != null && isFinite(eurNat) && eurNat > 0) {
 row[5] = eurNat;
 row[6] = (bal != null && isFinite(bal)) ? (Number(bal) * Number(eurNat)) : "";
 }
 }
 var val = row[6];
 if (row[0] && row[0] !== "META" && String(row[1] || "").indexOf("INFO") !== 0) {
 var vv = Num.parse(val);
 if (vv != null && isFinite(vv) && vv > 0) total += Number(vv);
 }
 }
 
 if (totalRowIdx >= 0) {
 try { out[totalRowIdx][6] = total; } catch (e) {}
 }
 },
 
 /**
  * _checkpointSave - Progressive checkpoint save during refresh
  * v4.12.34: Saves partial progress to prevent data loss on timeout
  * 
  * @param {string} phase - Checkpoint phase name (for diagnostics)
  * @param {string} address - Wallet address
  * @param {Object} state - Current state with assetByKey, balanceTsMap, etc.
  * @param {Object} cache - Existing cache (for metadata preservation)
  * @param {Object} config - Chain config
  * @returns {boolean} - True if checkpoint was saved
  */
 /**
  * _checkpointSave - Progressive checkpoint save during refresh
  * v4.12.36: SKIP in recovery mode or when time-constrained
  * v4.12.34: Saves partial progress to prevent data loss on timeout
  * 
  * CRITICAL FIX: Checkpoints were consuming 9-15 seconds total,
  * leaving no time for actual RPC operations.
  * 
  * @param {string} phase - Checkpoint phase name (for diagnostics)
  * @param {string} address - Wallet address
  * @param {Object} state - Current state with assetByKey, balanceTsMap, etc.
  * @param {Object} cache - Existing cache (for metadata preservation)
  * @param {Object} config - Chain config
  * @returns {boolean} - True if checkpoint was saved
  */
 _checkpointSave: function(phase, address, state, cache, config) {
   try {
     // v4.12.36: Skip flag set earlier in execution
     if (state._skipCheckpoints) {
       return false;
     }
     
     // v4.12.36: Skip in RECOVERY mode - checkpoints CAUSE the failures!
     if (state.recoveryModeActive || state.autoForced) {
       state._checkpointSkipReason = "RECOVERY_MODE";
       return false;
     }
     
     // v4.12.36: Skip if timer is below 10s (need time for RPC operations)
     // Previous threshold of 2s was way too low - save alone takes 3-5s
     if (state.timer && state.timer.remaining() < 10000) {
       state._checkpointSkipReason = "TIME_LOW_" + state.timer.remaining() + "ms";
       return false;
     }
     
     // v4.12.36: Skip if many contracts (save will be slow)
     var assetCount = 0;
     try {
       assetCount = Object.keys(state.assetByKey || {}).length;
     } catch (e) {}
     if (assetCount > 40) {
       state._checkpointSkipReason = "TOO_MANY_ASSETS_" + assetCount;
       return false;
     }
     
     // Skip if last checkpoint was < 5 seconds ago (avoid spam)
     // v4.12.36: Increased from 3s to 5s
     var nowMs = Date.now();
     if (state._lastCheckpointMs && (nowMs - state._lastCheckpointMs) < 5000) {
       return false;
     }
     
     // Build minimal cache object for checkpoint
     var assetsArray = AssetManager.toArray(state.assetByKey);
     
     // Preserve existing metadata from cache
     if (cache && cache.assets && Array.isArray(cache.assets)) {
       var existingMetaMap = {};
       for (var em = 0; em < cache.assets.length; em++) {
         var existingAsset = cache.assets[em];
         if (existingAsset && existingAsset.contract) {
           var emKey = (existingAsset.contract === "native") ? "native" : Addr.normalize(existingAsset.contract);
           if (existingAsset.symbol || existingAsset.name) {
             existingMetaMap[emKey] = { symbol: existingAsset.symbol, name: existingAsset.name };
           }
         }
       }
       
       // Apply preserved metadata
       for (var pa = 0; pa < assetsArray.length; pa++) {
         var asset = assetsArray[pa];
         if (!asset || !asset.contract || asset.contract === "native") continue;
         var paKey = Addr.normalize(asset.contract);
         if ((!asset.symbol || !asset.name) && existingMetaMap[paKey]) {
           if (!asset.symbol && existingMetaMap[paKey].symbol) asset.symbol = existingMetaMap[paKey].symbol;
           if (!asset.name && existingMetaMap[paKey].name) asset.name = existingMetaMap[paKey].name;
         }
       }
     }
     
     var checkpointCache = {
       version: config.CACHE_VERSION,
       updatedAt: nowMs,
       last_cache_update: Format.now(),
       last_update: Format.now(),
       assets: AssetManager.filterForCache(assetsArray),
       priceMap: state.priceMap || {},
       priceTsMap: state.priceTsMap || {},
       balanceTsMap: state.balanceTsMap || {},
       attemptTsMap: state.attemptTsMap || {},
       purgedTsMap: state.purgedTsMap || {},
       usd_to_eur_rate: Num.isValidPositive(state.fxRate) ? state.fxRate : (cache ? cache.usd_to_eur_rate : null),
       rrCursor: Num.isValid(state.rrCursor) ? state.rrCursor : 0,
       lastInfoMetaRows: (cache && cache.lastInfoMetaRows) ? cache.lastInfoMetaRows : null,
       im: (cache && cache.im) ? cache.im : null,
       last_full_scan_ms: state.lastFullScanMs || (cache ? cache.last_full_scan_ms : null),
        last_full_price_ms: state.lastFullPriceMs || (cache ? cache.last_full_price_ms : null),
        _checkpoint: phase,
        _checkpointTs: nowMs,
        _checkpointCount: (state._checkpointCount || 0) + 1,
        _checkpointPhases: ((cache && cache._checkpointPhases) || "") + phase + ";",
        _forceFull: !!state.force,
        _hadHttpErrors: BaseEngine.hasHttpErrorSignal(state, state._scanStats)
      };
      if (config && config.FLAGS && config.FLAGS.STRICT_TOKEN_RANGE && state.strictTokenSet) {
        checkpointCache.strictTokenSet = state.strictTokenSet;
      }
     
     WalletCache.save(address, checkpointCache, config);
     
     // Track checkpoint for diagnostics
     state._lastCheckpointMs = nowMs;
     state._checkpointCount = (state._checkpointCount || 0) + 1;
     state._lastCheckpointPhase = phase;
     
     return true;
   } catch (e) {
     // Silent fail - checkpoint is optional
     return false;
   }
 },
 
 
 /**
 * _saveAllCaches - Single atomic save
 * v4.15.15: Preserve existing wallet cache when HTTP-error scans shrink assets.
 * v4.13.0: Added scanStats parameter for rotation info
 * v4.12.33: NEVER skip WalletCache save - this is critical data
 * v4.12.26: PRESERVE existing metadata from cache when new metadata is empty
 */
  _saveAllCaches: function(address, nowMs, assets, assetByKey, balanceTsMap, attemptTsMap, purgedTsMap, fxEffective, combinedPriceMap, combinedPriceTsMap, rrCursor, existingCache, lastFullScanMs, lastFullPriceMs, metaMap, timer, config, infoMetaRows, scanStats, strictTokenSet) {
 // v4.12.33: REMOVED the early return - WalletCache MUST be saved
 // Old code: if (timer && timer.remaining() < 150) return;
 // This caused [BLOCKED:TIMEOUT] because cache was never updated
 
 var remaining = timer ? timer.remaining() : 1000;
 var isEmergencyMode = remaining < 500; // Emergency mode if < 500ms left
 
 // Always do cleanup (fast operation)
 PriceManager.cleanupAttempts(attemptTsMap, nowMs, config);
 var assetsArray = assets && assets.length ? assets : AssetManager.toArray(assetByKey);
 
 // v4.12.26: Build metadata map from existing cache for preservation
 var existingMetaMap = {};
 if (existingCache && existingCache.assets && Array.isArray(existingCache.assets)) {
 for (var em = 0; em < existingCache.assets.length; em++) {
 var existingAsset = existingCache.assets[em];
 if (existingAsset && existingAsset.contract) {
 var emKey = (existingAsset.contract === "native") ? "native" : Addr.normalize(existingAsset.contract);
 if (existingAsset.symbol || existingAsset.name) {
 existingMetaMap[emKey] = { symbol: existingAsset.symbol, name: existingAsset.name };
 }
 }
 }
 }
 
 // v4.12.26: Preserve existing metadata for assets with empty metadata
 for (var pa = 0; pa < assetsArray.length; pa++) {
 var asset = assetsArray[pa];
 if (!asset || !asset.contract || asset.contract === "native") continue;
 var paKey = Addr.normalize(asset.contract);
 if ((!asset.symbol || !asset.name) && existingMetaMap[paKey]) {
 if (!asset.symbol && existingMetaMap[paKey].symbol) asset.symbol = existingMetaMap[paKey].symbol;
 if (!asset.name && existingMetaMap[paKey].name) asset.name = existingMetaMap[paKey].name;
 }
 }
 
 var lastUpdateStr = Format.now();
 var finalInfoMetaRows = (infoMetaRows && infoMetaRows.length) ? infoMetaRows : ((existingCache && existingCache.lastInfoMetaRows) ? existingCache.lastInfoMetaRows : null);
 
  var walletCache = {
 version: config.CACHE_VERSION,
 updatedAt: nowMs,
 last_cache_update: lastUpdateStr,
 last_update: lastUpdateStr,
 assets: AssetManager.filterForCache(assetsArray),
 priceMap: combinedPriceMap || {},
 priceTsMap: combinedPriceTsMap || {},
 balanceTsMap: balanceTsMap || {},
 attemptTsMap: attemptTsMap || {},
 purgedTsMap: purgedTsMap || {},
 usd_to_eur_rate: Num.isValidPositive(fxEffective) ? fxEffective : null,
 rrCursor: Num.isValid(rrCursor) ? rrCursor : 0,
 lastInfoMetaRows: finalInfoMetaRows,
 im: finalInfoMetaRows,
 last_full_scan_ms: lastFullScanMs || null,
 last_full_price_ms: lastFullPriceMs || null,
 last_error: (existingCache && existingCache.last_error) ? existingCache.last_error : null,
 last_error_ts: (existingCache && existingCache.last_error_ts) ? existingCache.last_error_ts : null,
 // v4.13.0: Rotation stats for STATS display
  scanStats: scanStats || (existingCache && existingCache.scanStats) || null
  };
  if (config && config.FLAGS && config.FLAGS.STRICT_TOKEN_RANGE && strictTokenSet) {
  walletCache.strictTokenSet = strictTokenSet;
  }
  walletCache._forceFull = !!(config && config._forceFull);
 try { walletCache._forceFull = walletCache._forceFull || !!(scanStats && scanStats.forceFull); } catch (eF) {}
 walletCache._hadHttpErrors = BaseEngine.hasHttpErrorSignal({ lastError: walletCache.last_error, hadHttpErrors: false }, scanStats);
 
 var preserve = BaseEngine.shouldPreserveScanCacheWrite(existingCache, walletCache, { force: !!walletCache._forceFull }, config, scanStats);
 if (preserve && preserve.preserve) {
   if (existingCache && preserve.reason !== "budget") {
     existingCache.scanStats = existingCache.scanStats || {};
     existingCache.scanStats.preserved = true;
     existingCache.scanStats.preserveReason = preserve.reason;
     existingCache.last_error = "Preserved cache: " + preserve.reason;
     existingCache.last_error_ts = Date.now();
     try { WalletCache.save(address, existingCache, config); } catch (ePreserve) {}
   }
   return;
 }
 
 // v4.12.33: ALWAYS save WalletCache - this is the critical data
 // Emergency mode skips optional saves but NEVER skips WalletCache
 WalletCache.save(address, walletCache, config);
 
 // v4.12.33: Skip optional saves in emergency mode to guarantee WalletCache completes
 if (isEmergencyMode) {
   // Emergency mode: WalletCache saved, skip GlobalPriceCache and MetaCache
   return;
 }
 
 // Normal mode: save optional caches if time permits
 if (timer.remaining() > 250) GlobalPriceCache.save(combinedPriceMap, combinedPriceTsMap, config);
 if (timer.remaining() > 200 && metaMap) {
 // v4.12.6 FIX: Include ALL metaMap keys in known to preserve metadata
 // Previously only assets with balance were in known, losing metadata for other tokens
 var known = {};
 Obj.forEach(assetByKey, function(k) { known[k] = true; });
 Obj.forEach(metaMap, function(k) { known[k] = true; }); // Include all existing metadata
 MetaCache.save(metaMap, known, config);
 }
 }
};

// ============================================================
// ALIASES (backward compatibility)
// ============================================================

var ConfigBuilder = EvmConfigBuilder;
var WalletEngine = EvmEngine;
