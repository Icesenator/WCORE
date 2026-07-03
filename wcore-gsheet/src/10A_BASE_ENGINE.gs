/************************************************************
 * 10A_BASE_ENGINE.gs - Unified Base Engine for EVM/SVM/Cosmos
 *
 * Version: v4.15.71
 *
 * v4.15.71: STATS exposes Recap-compatible exec_ms and last_cache_update
 *   aliases across BaseEngine chains.
 *
 * v4.15.28: STATS derives missingPrices from visible cache assets as a
 *   fallback when packed/legacy scanStats under-report web pricing gaps.
 *
 * v4.15.27: HTTP errors with incomplete scan preserve existing cache even when
 *   newCount >= prevCount. Same pattern as BLOCKED QUOTA: stale > wrong.
 *   Prevents RPC-down scenarios from overwriting valid cache with wrong data.
 *
 * v4.15.26: Partial scans cannot replace a fuller wallet cache.
 *   A non-force scan with fullCycleComplete=false preserves the previous cache
 *   when the new asset list is shorter, even without an explicit HTTP error.
 *
 * v4.15.25: PRICING_WORKER no-market entries are ignored as non-prices.
 *   The worker may throttle unresolved retries, but it must never write/apply
 *   price=0 as a market conclusion.
 *
 * v4.15.24: STATS Rotation.cycle cannot be DONE while gaps remain
 *   Rotation.status already displayed price_missing/meta_missing but
 *   Rotation.cycle was still derived only from fullCycleComplete. DONE now
 *   requires no missing metadata and no missing prices.
 *
 * v4.15.7: FIX: snapshot-before-write guard for wallet cache
 *   Scans that shrink asset count during HTTP/quota errors preserve prior cache.
 *
 * v4.15.6: FIX: evictStalePrices ne supprime plus le cache sans remplacement
 *   - Cause racine des cellules price_eur vides pendant les refresh (Base, etc.)
 *   - Avant: à chaque pulse WATCHDOG, les prix > PRICE_TTL_MS (4h) étaient
 *     supprimés de state.priceMap/priceTsMap ET asset.price_eur, AVANT toute
 *     tentative de re-fetch. Si le fetch échouait (GT 404, quota, cooldown),
 *     le cache était sauvé sans prix → cellule vide dans le Ledger.
 *   - Maintenant: les valeurs stales sont PRÉSERVÉES. Le "due check" basé sur
 *     priceTsMap âge (11_EVM_ENGINE.gs:593) continue de déclencher le re-fetch.
 *     Si fetch réussit → nouveau prix overwrite l'ancien. Si échec → ancien
 *     prix préservé (pas de cellule vide).
 *   - Les prix vraiment incorrects expirent naturellement via v4.13.9
 *     (timestamp refresh uniquement sur changement >0.1%).
 *   - Conforme au principe AGENTS.md: "Ne JAMAIS écraser du cache valide".
 *
 * v4.15.2: ForceRefresh flag expires on full scan completion (last_full_scan_ms > requestedAt)
 *   instead of fixed 30-min TTL. Ensures activity flag persists exactly until all
 *   balances are updated, then clears cleanly.
 *
 * v4.14.0: FIX: mergeGlobalPrices now checks price freshness before injecting
 *   Prices older than 2x PRICE_TTL_MS are skipped to prevent stale GPC entries
 *   from polluting wallet state. Tracks gpcMerged/gpcSkippedStale in state.
 *
 * v4.13.7: FIX: Tighter stale price eviction (1x TTL instead of 2x TTL)
 *   - evictStalePrices now uses 1x PRICE_TTL_MS (was 2x) — 4h instead of 8h
 *   - Combined with EVM_ENGINE v4.13.9 (no timestamp refresh on cached returns),
 *     wrong prices now self-correct within TTL instead of persisting indefinitely
 *   - Root cause: OutputBuilder._getPrice uses priceMap as fallback even when
 *     computePriceEur returns null — stale wrong prices must be evicted to fix
 *
 * v4.13.6: FIX: Stale price eviction prevents wrong prices from persisting
 *   - New: evictStalePrices() removes prices older than 2x PRICE_TTL_MS
 *   - Wrong prices could persist indefinitely in priceMap (never deleted)
 *   - Now prices expire after max age, forcing fresh fetch from GT/DexScreener
 *
 * v4.13.5: Display missingMeta count in Rotation.status dashboard
 *
 * v4.13.4 CACHE SURVIVAL FIX:
 * - FIXED: quotaPreCheck now re-saves cache to refresh packed timestamp
 * - ROOT CAUSE: Chains returning [BLOCKED:QUOTA] never saved -> timestamp
 *   stayed old -> prune evicted them after quota reset -> "No cache available"
 * - Fix: Re-save existing cache during BLOCKED:QUOTA (touch timestamp)
 *
 * v4.13.3 CENTRALIZED QUOTA PRE-CHECK:
 * - NEW: BaseEngine.quotaPreCheck(walletKey, config) 
 * - Shared by EVM/SVM/Cosmos getRefreshStatus
 * - Returns "[BLOCKED:QUOTA] <timestamp>" or null
 * - Eliminates duplicated quota pre-check code across 3 engines
 *
 * (Changelog v4.12.0..v4.13.2: 12 entries removed for brevity)
 * 
 * DEPENDANCES:
 * - 01_INIT.gs (WCORE_CACHE_CONFIG, WCORE_CACHE_VERSION)
 * - 02_UTILS.gs (Num, Obj, Format, Bool)
 * - 04A_CACHE_CORE.gs (CacheManager)
 * - 04B_CACHE_WALLET.gs (WalletCache)
 * - 04C_CACHE_GLOBAL.gs (GlobalPriceCache, MetaCache)
 * - 07_PRICES.gs (FxRate, PriceRunCache)
 * - 10_OUTPUT.gs (OutputBuilder)
 ************************************************************/

// ============================================================
// AUTO-REGISTRATION (v4.13.3)
// ============================================================
var BASE_ENGINE_VERSION = "4.15.71";

if (typeof ModuleRegistry !== 'undefined') {
  ModuleRegistry.register("BASE_ENGINE", BASE_ENGINE_VERSION, {
    description: "Base Engine - cache write preservation guard",
    dependencies: ["CACHE_CORE", "UTILS"]
  });
}

var BaseEngine = BaseEngine || {};

// ============================================================
// CONSTANTS
// ============================================================

BaseEngine.VERSION = BASE_ENGINE_VERSION;

BaseEngine.DEFAULTS = {
 MAX_EXECUTION_MS: 30000,
 SAFE_MARGIN_MS: 750,
 MIN_REFRESH_INTERVAL_MS: 60000,
 AUTO_FORCE_MS: 86400000, // 24h
 TOO_OLD_MS: 172800000, // 48h
 FX_FALLBACK: 0.85,
 ERROR_MAX_LENGTH: 500
};

// v4.15.65: Sheet recalculations can re-run REFRESH_STATUS without B1 changing
// (script push/redeploy, editor save, global sheet recalc). B1 is a dependency
// latch, but Apps Script must also enforce it or every recalculation rescans.
BaseEngine.normalizeRefreshTrigger = function(triggerRefresh) {
 try {
  if (triggerRefresh == null) return "";
  var s = String(triggerRefresh).trim();
  if (!s || s === "false" || s === "FALSE") return "";
  return s;
 } catch (e) { return ""; }
};

BaseEngine.shouldSkipRefreshForSameTrigger = function(walletKey, config, cache, forceFull, triggerRefresh) {
  try {
   var force = (forceFull === true || forceFull === "true" || forceFull === "TRUE");
   if (force) return false;
   var trig = BaseEngine.normalizeRefreshTrigger(triggerRefresh);
   if (!trig || !cache) return false;
   var last = String(cache.last_refresh_trigger || cache.lastRefreshTrigger || "").trim();
   if (last && last === trig) return true;
   if (cache.updatedAt) {
    var parsed = Date.parse(String(trig).replace(" ", "T"));
    if (isFinite(parsed) && Number(cache.updatedAt) >= parsed) return true;
   }
   return false;
  } catch (e) { return false; }
};

// v4.15.122: I1 re-evaluation guard — when Google Sheets re-evaluates the I1
// @customfunction without an explicit trigger (no B1 pulse, C1=FALSE, no
// activityForced), and the wallet was already scanned within the last
// I1_GUARD_MS, return the cached value instead of scanning on every
// unprovoked sheet recalculation.
var I1_GUARD_MS = 120 * 1000; // 2 min

BaseEngine.shouldSkipNoTriggerRecentScan = function(walletKey, config, cache, forceFull, triggerRefresh) {
  try {
   var force = (forceFull === true || forceFull === "true" || forceFull === "TRUE");
   if (force) return false;
   var trig = BaseEngine.normalizeRefreshTrigger(triggerRefresh);
   if (!trig) {
    // No explicit trigger: skip if the cache was updated recently.
    if (cache && cache.updatedAt) {
     var age = Date.now() - Number(cache.updatedAt);
     if (age >= 0 && age < I1_GUARD_MS) return true;
    }
   }
   return false;
  } catch (e) { return false; }
};

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Initialize execution state for any engine
 * Creates a standardized state object used throughout execution
 * 
 * @param {Object} config - Chain configuration
 * @returns {Object} Execution state object
 */
BaseEngine.initExecution = function(config) {
 var maxMs = (config && config.TIMEOUTS && config.TIMEOUTS.MAX_EXECUTION_MS) 
 ? config.TIMEOUTS.MAX_EXECUTION_MS 
 : this.DEFAULTS.MAX_EXECUTION_MS;
 
 return {
 // Timer
 timer: createTimer(maxMs),
 nowMs: Date.now(),
 
 // Execution flags
 autoForced: false,
 cacheVersionMismatch: false,
 force: false,
 
 // Cache data (restored from cache or empty)
 cache: null,
 assets: [],
 assetByKey: {},
 prevAssetsCount: 0,
 
 // Price maps
 priceMap: {},
 priceTsMap: {},
 
 // Tracking maps
 balanceTsMap: {},
 attemptTsMap: {},
 purgedTsMap: {},
 
 // State
 fxRate: null,
 rrCursor: 0,
 lastFullScanMs: 0,
 lastFullPriceMs: 0,
 pricesFetched: 0,
 
 // Timing (for diagnostics)
 _tBalanceStart: Date.now(),
 _balMs: 0,
 _tPriceStart: 0,
 _priceMs: 0,
 
 // Error tracking
 lastError: null,
 lastErrorTs: null,
 hadHttpErrors: false
 };
};

BaseEngine.cacheAssetsCount = function(cache) {
 try {
 var assets = cache && cache.assets;
 return (assets && Array.isArray(assets)) ? assets.length : 0;
 } catch (e) {
 return 0;
 }
};

BaseEngine.hasHttpErrorSignal = function(state, scanStats) {
 try {
 if (state && state.hadHttpErrors) return true;
 if (scanStats && (scanStats.error || scanStats.hadHttpErrors || scanStats.httpErrors)) return true;
 if (typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped()) return true;
 if (typeof HttpErrorGuard !== 'undefined' && HttpErrorGuard.isQuotaExhausted && HttpErrorGuard.isQuotaExhausted()) return true;
 var err = String((state && (state.lastError || state.last_error)) || "").toLowerCase();
 return err.indexOf("urlfetch") >= 0 ||
   err.indexOf("quota") >= 0 ||
   err.indexOf("timeout") >= 0 ||
   err.indexOf("network") >= 0 ||
   err.indexOf("429") >= 0 ||
   err.indexOf("rpc-fail") >= 0;
 } catch (e) {
 return false;
 }
};

BaseEngine.countMissingPricesFromCache = function(cache) {
 try {
 var assets = (cache && cache.assets && Array.isArray(cache.assets)) ? cache.assets : [];
 var priceMap = (cache && cache.priceMap) || {};
 var n = 0;
 for (var i = 0; i < assets.length; i++) {
 var a = assets[i] || {};
 var contract = String(a.contract || a.c || "").trim();
 if (!contract || contract.toLowerCase() === "native") continue;
 var bal = parseFloat(a.balance != null ? a.balance : a.b);
 if (!isFinite(bal) || bal <= 0) continue;
 var p = a.price_eur != null ? parseFloat(a.price_eur) : parseFloat(priceMap[contract]);
 if (!isFinite(p) || p <= 0) n++;
 }
 return n;
 } catch (e) {
 return 0;
 }
};

BaseEngine.isCacheWriteBudgetBlocked = function() {
 try {
 if (typeof BudgetHTTP !== 'undefined' && BudgetHTTP.remaining && BudgetHTTP.remaining() < 100) return true;
 } catch (e) {}
 try {
 if (typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped()) return true;
 } catch (e2) {}
 try {
 if (typeof DegradedMode !== 'undefined' && DegradedMode.isCircuitBreakerActive && DegradedMode.isCircuitBreakerActive()) return true;
 } catch (e3) {}
 return false;
};

BaseEngine.shouldPreserveScanCacheWrite = function(existingCache, newCache, state, config, scanStats) {
 var force = !!(state && state.force) || !!(newCache && (newCache._forceFull || newCache.forceFull));
 if (!force && config && (config.FORCE_FULL || config._forceFull)) force = true;
 if (force) return { preserve: false };

 if (this.isCacheWriteBudgetBlocked()) {
 return { preserve: true, reason: "budget" };
 }

 var prevCount = this.cacheAssetsCount(existingCache);
 var newCount = this.cacheAssetsCount(newCache);
 var zeroOk = !!(newCache && (newCache.zero_balance_confirmed || newCache._zeroBalanceConfirmed));
 if (!zeroOk && scanStats) zeroOk = !!(scanStats.zero_balance_confirmed || scanStats.zeroBalanceConfirmed);
 var hadHttpErrors = this.hasHttpErrorSignal(state, scanStats);
 var fullCycleComplete = true;
 if (scanStats && scanStats.fullCycleComplete === false) fullCycleComplete = false;
 if (newCache && newCache.scanStats && newCache.scanStats.fullCycleComplete === false) fullCycleComplete = false;

 if (newCount === 0 && !zeroOk) {
 return { preserve: true, reason: "empty_unconfirmed", prevAssetsCount: prevCount, newAssetsCount: newCount };
 }

 if (newCount < prevCount && !fullCycleComplete && !zeroOk) {
 return { preserve: true, reason: "partial_less_assets", prevAssetsCount: prevCount, newAssetsCount: newCount };
 }

 if (newCount < prevCount && hadHttpErrors && !zeroOk) {
 return { preserve: true, reason: "http_error_less_assets", prevAssetsCount: prevCount, newAssetsCount: newCount };
 }

 // v4.15.27: HTTP errors + incomplete cycle = data unreliable regardless of asset count.
 // Same pattern as BLOCKED QUOTA: stale cache > wrong cache.
 // Prevents RPC-down scenarios where consensus returns zero instead of real balance.
 if (hadHttpErrors && !fullCycleComplete && !zeroOk && prevCount > 0) {
 return { preserve: true, reason: "http_error_unreliable", prevAssetsCount: prevCount, newAssetsCount: newCount };
 }

 return { preserve: false, prevAssetsCount: prevCount, newAssetsCount: newCount };
};

/**
 * Initialize memory caches (call at start of execution)
 */
BaseEngine.initCaches = function() {
 try { PriceRunCache.reset(); } catch (e) {}
 try { CacheManager.init(); } catch (e) {}
 // v4.13.2: CRITICAL - Install CacheGuard protection on every execution
 // 03B_HTTP_GUARD auto-install fails at load time because WalletCache (04B) 
 // isn't defined yet due to alphabetical file loading order (03B < 04B).
 // Without this, WalletCache.save is never patched and CacheGuard is inoperable.
 try { if (typeof INSTALL_CACHE_PROTECTION === 'function') INSTALL_CACHE_PROTECTION(); } catch (e) {}
};

// ============================================================
// QUOTA PRE-CHECK (v4.13.4)
// ============================================================

/**
 * Centralized quota pre-check for getRefreshStatus across all engines.
 * Calls QuotaCircuitBreaker.testOnce() and if tripped, returns [BLOCKED:QUOTA]
 * with the cached timestamp. Returns null if not blocked.
 *
 * v4.13.4 - CRITICAL FIX: Re-saves existing cache to refresh packed cache
 *   timestamp. Without this, blocked chains keep old timestamps and get
 *   evicted by prune after quota reset when other chains save.
 *
 * @param {string} walletKey - Normalized wallet key (address or hash)
 * @param {Object} config - Chain configuration
 * @returns {string|null} "[BLOCKED:QUOTA] <timestamp>" if blocked, null otherwise
 */
BaseEngine.quotaPreCheck = function(walletKey, config) {
  try {
    if (typeof QuotaCircuitBreaker !== 'undefined') {
      QuotaCircuitBreaker.testOnce();
      if (QuotaCircuitBreaker.isTripped()) {
        var cachedTs = "";
        try {
          CacheManager.init();
          var cached = WalletCache.load(walletKey, null, config);
          if (cached && cached.updatedAt) {
            cachedTs = Format.datetime(cached.updatedAt);
          }
          // v4.13.4: TOUCH - Re-save existing cache to refresh packed timestamp.
          // _packedPut_ sets ts = nowSec, preventing prune eviction.
          // Without this, chains blocked by quota keep old timestamps and
          // get evicted when other chains save after quota resets.
          if (cached) {
            try {
              WalletCache.save(walletKey, cached, config);
            } catch (eSave) {}
          }
        } catch (e) {}
        return "[BLOCKED:QUOTA] " + (cachedTs || Format.now());
      }
    }
  } catch (e) {}
  return null;
};

// ============================================================
// CENTRALIZED BLOCK DETECTION (v4.13.5)
// ============================================================

/**
 * Test quota with real HTTP call and return true if blocked.
 * Use at entry of getWalletAssets to bail early.
 * Calls testOnce() which makes a single HTTP probe per execution.
 */
BaseEngine.testQuotaBlocked = function() {
 try {
   if (typeof QuotaCircuitBreaker !== 'undefined') {
     QuotaCircuitBreaker.testOnce();
     return QuotaCircuitBreaker.isTripped();
   }
 } catch (e) {}
 return false;
};

/**
 * Check if any protection layer is currently blocking operations.
 * Does NOT make HTTP calls — reads in-memory/cache state only.
 * Use in getCachedWalletAssets for cache-touch decisions.
 */
BaseEngine.isSystemBlocked = function() {
 try {
   if (typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.isTripped()) return true;
   if (typeof HttpErrorGuard !== 'undefined' && HttpErrorGuard.isQuotaExhausted && HttpErrorGuard.isQuotaExhausted()) return true;
   if (typeof DegradedMode !== 'undefined' && DegradedMode.isCircuitBreakerActive && DegradedMode.isCircuitBreakerActive()) return true;
 } catch (e) {}
 return false;
};

/**
 * Detect which protection layer is blocking and return reason string.
 * Returns "" if nothing is blocking.
 * Use in getRefreshStatus for [BLOCKED:reason] labels.
 */
BaseEngine.detectBlockReason = function() {
 try {
   if (typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped()) return "QUOTA";
   if (typeof HttpErrorGuard !== 'undefined' && HttpErrorGuard.isQuotaExhausted && HttpErrorGuard.isQuotaExhausted()) return "QUOTA";
   if (typeof DegradedMode !== 'undefined' && DegradedMode.isCircuitBreakerActive && DegradedMode.isCircuitBreakerActive()) return "DEGRADED";
    if (typeof CacheGuard !== 'undefined' && CacheGuard.getStats) {
      var stats = CacheGuard.getStats();
      if (stats && stats.blockedSaves > 0) return "GUARD";
    }
  } catch (e) {}
  return "";
};

/**
 * v4.15.50: Returns true when the system is under heavy load and a fresh
 * scan would risk the GAS 30s timeout (→ #ERROR! cell). Read-only (no HTTP).
 * Used by getRefreshStatus busy-guard. forceFull bypasses this.
 */
BaseEngine.isBusy = function(config) {
  try {
    // Quota circuit breaker tripped → definitely busy/blocked
    if (typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped()) return true;
    // Degraded mode active → system already struggling
    if (typeof DegradedMode !== 'undefined' && DegradedMode.isCircuitBreakerActive && DegradedMode.isCircuitBreakerActive()) return true;
    // HTTP budget near daily ceiling (>= 99% internal threshold)
    if (typeof HttpErrorGuard !== 'undefined' && HttpErrorGuard.isQuotaExhausted && HttpErrorGuard.isQuotaExhausted()) return true;
  } catch (e) {}
  return false;
};

BaseEngine.cexBusyStatus = function(walletKey, config) {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty("CEX_MANUAL_ACTIVE_UNTIL_MS") || "";
    var until = parseInt(raw, 10);
    if (!isFinite(until) || until <= Date.now()) return "";
    var ts = "";
    try {
      CacheManager.init();
      var cache = WalletCache.load(walletKey, null, config);
      if (cache && cache.updatedAt) ts = Format.datetime(cache.updatedAt);
    } catch (eCache) {}
    return "[BUSY:CEX] " + (ts || Format.now());
  } catch (e) {
    return "";
  }
};

// ============================================================
// CACHE-ONLY MARKER (v4.15.19)
// ============================================================

/**
 * Wraps a success timestamp with [CACHE_ONLY] if no HTTP calls were made
 * during the scan (httpBefore === HttpCallCounter.getToday()).
 *
 * Usage in getRefreshStatus:
 *   var _httpBefore = BaseEngine.httpSnapshot();
 *   // ... scan ...
 *   return BaseEngine.wrapCacheOnlyMarker(ts, _httpBefore);
 *
 * Fail-open: if HttpCallCounter unavailable or delta < 0 (day rollover),
 * returns ts unchanged.
 *
 * @param {string} ts - Timestamp string to return
 * @param {number} httpBefore - Snapshot taken before scan
 * @returns {string} "[CACHE_ONLY] ts" or "ts"
 */
BaseEngine.httpSnapshot = function() {
  try {
    if (typeof HttpCallCounter !== 'undefined') return HttpCallCounter.getToday();
  } catch (e) {}
  return -1;
};

BaseEngine.wrapCacheOnlyMarker = function(ts, httpBefore) {
  try {
    if (httpBefore < 0) return ts; // HttpCallCounter indispo
    if (typeof HttpCallCounter === 'undefined') return ts;
    var delta = HttpCallCounter.getToday() - httpBefore;
    if (delta === 0) return "[CACHE_ONLY] " + ts;
    // delta < 0 = rollover jour ou reset manuel → fail-open
  } catch (e) {}
  return ts;
};

// ============================================================
// CACHE VERSION CHECK
// ============================================================

/**
 * Check if cache version matches expected version
 * If mismatch, sets autoForced flag BUT PRESERVES CACHE DATA for fallback
 * 
 * v4.11.1 - CRITICAL FIX: No longer returns null on version mismatch.
 * Previous behavior: returning null caused empty wallet when refresh failed.
 * New behavior: keeps old cache for fallback, marks it as stale.
 * 
 * @param {Object} cache - Loaded cache object
 * @param {Object} config - Chain configuration
 * @param {Object} state - Execution state (modified in place)
 * @returns {Object|null} Cache (preserved even on mismatch), null only if no cache existed
 */
BaseEngine.checkCacheVersion = function(cache, config, state) {
 if (!cache) return null;
 
 var expectedVersion = config.CACHE_VERSION || 
 (typeof WCORE_CACHE_VERSION !== 'undefined' ? WCORE_CACHE_VERSION : 10);
 var cacheVersion = cache.version || 0;
 
 if (expectedVersion > 0 && cacheVersion !== expectedVersion) {
 state.cacheVersionMismatch = true;
 state.autoForced = true;
 // CRITICAL: Preserve old cache data for fallback instead of returning null
 // Mark cache as stale but keep it - better stale data than empty wallet
 state._staleCachePreserved = true;
 return cache;
 }
 
 return cache;
};

// ============================================================
// AUTO-FORCE CHECKS
// ============================================================

/**
 * Check if Activity module has requested a force refresh
 * This happens when a new transaction is detected
 * 
 * @param {Object} config - Chain configuration
 * @param {string} address - Wallet address
 * @param {Object} state - Execution state (modified in place)
 * @returns {boolean} true if force refresh was requested
 */
BaseEngine.checkActivityForceRefresh = function(config, address, state) {
 try {
 // Check if _activity_checkForceRefreshFlag function exists
 if (typeof _activity_checkForceRefreshFlag !== "function") {
 Logger.log("[ACTIVITY_FORCE] checkActivityForceRefresh skipped — _activity_checkForceRefreshFlag not available");
 return false;
 }

 // v4.14.8: Use CHAIN.NAME normalized (spaces→underscores) to match ForceRefreshManager keys
 var chainId = (config.CHAIN && config.CHAIN.NAME) || (config.CHAIN && config.CHAIN.ID) || "UNKNOWN";
 Logger.log("[ACTIVITY_FORCE] Checking flag for chain=" + chainId + " addr=" + String(address).substring(0, 10) + "... lastFullScanMs=" + (state.lastFullScanMs || 0));
 var forceFlag = _activity_checkForceRefreshFlag(chainId, address);

 if (forceFlag) {
 // v4.15.2: Check if a full scan completed AFTER the TX was detected
 // If so, all balances are already up-to-date — no need to force anymore
 var requestedAt = forceFlag.requestedAt || 0;
 Logger.log("[ACTIVITY_FORCE] Flag FOUND requestedAt=" + requestedAt + " lastFullScanMs=" + (state.lastFullScanMs || 0));
 if (state.lastFullScanMs && state.lastFullScanMs > requestedAt) {
   // Full cycle completed after TX detection — clear the flag
   Logger.log("[ACTIVITY_FORCE] Full scan after TX — clearing flag");
   if (typeof _activity_clearForceRefreshFlag === "function") {
     _activity_clearForceRefreshFlag(chainId, address);
   }
   return false;
 }

 Logger.log("[ACTIVITY_FORCE] Activating force refresh — state.activityForced=true");
 state.force = true;
 state.autoForced = true;
 state.activityForced = true;
 return true;
 } else {
 Logger.log("[ACTIVITY_FORCE] Flag NOT found for chain=" + chainId);
 }
 } catch (e) {
 Logger.log("[ACTIVITY_FORCE] Error: " + e);
 }

 return false;
};

/**
 * Check if cache is too old and should trigger auto-force
 * Implements the 24h auto-force pattern
 * Also checks Activity force refresh flag (v4.12.1)
 * 
 * @param {Object} cache - Cache object
 * @param {Object} config - Chain configuration
 * @param {Object} state - Execution state (modified in place)
 * @param {boolean} force - User-requested force flag
 * @param {string} address - Wallet address (optional, for activity check)
 * @returns {Object} {dueFullScan: boolean, dueFullPrice: boolean}
 */
BaseEngine.checkAutoForce = function(cache, config, state, force, address) {
 // v4.12.1: Check Activity force refresh flag FIRST
 if (address && this.checkActivityForceRefresh(config, address, state)) {
 return { dueFullScan: true, dueFullPrice: true };
 }
 
 var autoForceMs = (config.CACHE && config.CACHE.AUTO_FORCE_FULL_SCAN_MS) 
 ? config.CACHE.AUTO_FORCE_FULL_SCAN_MS 
 : this.DEFAULTS.AUTO_FORCE_MS;
 
 var cacheAge = cache ? (state.nowMs - (cache.updatedAt || 0)) : autoForceMs + 1;
 
 if ((cacheAge > autoForceMs && !force) || state.cacheVersionMismatch) {
 state.autoForced = true;
 return { dueFullScan: true, dueFullPrice: true };
 }
 
 return { dueFullScan: false, dueFullPrice: false };
};

/**
 * Check minimum refresh interval (anti-spam protection)
 * Returns true if enough time has passed since last refresh
 * Also checks Activity force refresh flag
 * 
 * @param {Object} cache - Cache object
 * @param {Object} config - Chain configuration
 * @param {Object} state - Execution state
 * @param {boolean} force - User-requested force flag
 * @param {string} address - Wallet address (for activity check)
 * @returns {boolean} true if refresh is allowed, false if too soon
 */
BaseEngine.checkMinRefresh = function(cache, config, state, force, address) {
 if (force || state.autoForced) return true;
 if (!cache) return true;
 
 // v4.12.1: Check Activity force refresh flag
 if (address && this.checkActivityForceRefresh(config, address, state)) {
 return true;
 }
 
 var minInterval = (config.CACHE && config.CACHE.MIN_REFRESH_INTERVAL_MS) 
 ? config.CACHE.MIN_REFRESH_INTERVAL_MS 
 : this.DEFAULTS.MIN_REFRESH_INTERVAL_MS;
 
 var cacheAge = state.nowMs - (cache.updatedAt || 0);
 
 return cacheAge >= minInterval;
};

/**
 * Check if cache is too old (>48h) - forces full refresh
 * 
 * @param {Object} cache - Cache object
 * @param {Object} config - Chain configuration
 * @param {Object} state - Execution state (modified in place)
 * @returns {boolean} true if cache is too old
 */
BaseEngine.checkTooOld = function(cache, config, state) {
 var tooOldMs = (config.CACHE && config.CACHE.TOO_OLD_MS) 
 ? config.CACHE.TOO_OLD_MS 
 : this.DEFAULTS.TOO_OLD_MS;
 
 var cacheAge = cache ? (state.nowMs - (cache.updatedAt || 0)) : tooOldMs + 1;
 
 if (cacheAge > tooOldMs) {
 state.autoForced = true;
 return true;
 }
 
 return false;
};

// ============================================================
// CACHE RESTORE
// ============================================================

/**
 * Restore state from cache
 * Populates state object with data from cache
 * 
 * v4.12.3 FIX: Normalize contract keys to ensure consistent lookup
 * v4.15.7: Snapshot previous asset count before scan writes.
 * 
 * @param {Object} cache - Cache object
 * @param {Object} state - Execution state (modified in place)
 */
BaseEngine.restoreFromCache = function(cache, state) {
 if (!cache) return;
 
 state.prevAssetsCount = (cache.assets && Array.isArray(cache.assets)) ? cache.assets.length : 0;
 state.rrCursor = Num.isValid(cache.rrCursor) ? cache.rrCursor : 0;
 state.lastFullScanMs = cache.last_full_scan_ms || 0;
 state.lastFullPriceMs = cache.last_full_price_ms || 0;
 
 // v4.12.3 FIX: Normalize all map keys for consistent lookup
 // Helper to normalize map keys
 function normalizeMapKeys(srcMap) {
 if (!srcMap || typeof srcMap !== "object") return {};
 var out = {};
 var keys = Object.keys(srcMap);
 for (var i = 0; i < keys.length; i++) {
 var k = keys[i];
 var normalizedKey = (k === "native") ? "native" : Addr.normalize(k);
 out[normalizedKey] = srcMap[k];
 }
 return out;
 }
 
 state.balanceTsMap = normalizeMapKeys(cache.balanceTsMap);
 state.attemptTsMap = normalizeMapKeys(cache.attemptTsMap);
 state.purgedTsMap = normalizeMapKeys(cache.purgedTsMap);
 state.priceMap = normalizeMapKeys(cache.priceMap);
 state.priceTsMap = normalizeMapKeys(cache.priceTsMap);
 
 // Restore assets if available
 // v4.12.3 FIX: Normalize contract key for consistent lookup
 if (cache.assets && Array.isArray(cache.assets)) {
 for (var i = 0; i < cache.assets.length; i++) {
 var asset = cache.assets[i];
 if (asset && asset.contract) {
 // Normalize key: "0xABC..." -> "0xabc..." for consistent lookup
 var key = (asset.contract === "native") ? "native" : Addr.normalize(asset.contract);
 state.assetByKey[key] = asset;
 }
 }
 }
};

/**
 * v4.15.6: DÉSACTIVÉ - Ne supprime plus les prix stales, compte seulement.
 *
 * Historique:
 * - v4.13.6 introduisait la suppression pour éviter que des prix incorrects
 *   persistent indéfiniment. Mais si le re-fetch échouait (GT 404, quota,
 *   cooldown attemptTsMap), le prix était perdu → cellule vide dans le Ledger.
 * - v4.13.9 a résolu le problème des prix "stuck" différemment: le timestamp
 *   n'est rafraîchi que si le prix change réellement (>0.1% delta). Les prix
 *   vraiment stales expirent naturellement via le "due check" (priceTsMap âge)
 *   dans les engines, qui déclenche un re-fetch tant que le prix est ancien.
 * - v4.15.6: on GARDE les valeurs cached. Si re-fetch réussit → overwrite.
 *   Si échec → ancien prix préservé (pas de cellule vide).
 *
 * Le compteur state._priceEvicted est conservé pour diagnostics (nombre de
 * prix qui AURAIENT été évincés sous l'ancien comportement).
 *
 * @param {Object} state - Execution state (modified in place)
 * @param {Object} config - Chain config (for PRICE_TTL_MS)
 */
BaseEngine.evictStalePrices = function(state, config) {
 if (!state || !state.priceMap || !state.priceTsMap) return;
 var priceTtlMs = (config && config.CACHE && config.CACHE.PRICE_TTL_MS) || 14400000;
 var maxAgeMs = priceTtlMs;
 var nowMs = state.nowMs || Date.now();
 var staleCount = 0;

 var keys = Object.keys(state.priceTsMap);
 for (var i = 0; i < keys.length; i++) {
 var k = keys[i];
 if (k === "native" || k.indexOf("native@") === 0) continue;
 var ts = state.priceTsMap[k];
 if (Num.isValid(ts) && (nowMs - ts) > maxAgeMs) {
 staleCount++;
 }
 }

 // v4.15.6: on ne supprime plus. Les prix stales seront remplacés uniquement
 // si un nouveau fetch réussit. Sinon, l'ancien prix reste visible dans le Ledger.
 state._priceEvicted = 0;
 state._priceStaleKept = staleCount;
};

/**
 * Merge global price cache into state
 * 
 * @param {Object} globalPrices - Global price cache object
 * @param {Object} state - Execution state (modified in place)
 */
// v4.14.0: Added config param for TTL-based freshness check
BaseEngine.mergeGlobalPrices = function(globalPrices, state, config) {
 if (!globalPrices) return;

 var pm = globalPrices.priceMap || {};
 var ptm = globalPrices.priceTsMap || {};
 var now = state.nowMs || Date.now();
 // Only merge prices fresher than 2x PRICE_TTL_MS (default 24h)
 var maxAge = ((config && config.CACHE && config.CACHE.PRICE_TTL_MS) || 43200000) * 2;
 var merged = 0, skippedStale = 0;

 Obj.forEach(pm, function(k, v) {
 if (!Num.isValidPositive(state.priceMap[k])) {
 var ts = ptm[k] || 0;
 if (now - ts < maxAge) {
 state.priceMap[k] = v;
 merged++;
 } else {
 skippedStale++;
 }
 }
 });

 Obj.forEach(ptm, function(k, v) {
 if (!Num.isValid(state.priceTsMap[k])) {
 state.priceTsMap[k] = v;
 }
 });

 state._gpcMerged = merged;
 state._gpcSkippedStale = skippedStale;
};

BaseEngine.isPhaseCEnabled = function() {
 try {
 return PropertiesService.getScriptProperties().getProperty("PHASE_C_ENABLED") === "true";
 } catch (e) {
 return false;
 }
};

BaseEngine.isPricingWorkerEnabled = function() {
 try {
 return PropertiesService.getScriptProperties().getProperty("PRICING_WORKER_ENABLED") === "true";
 } catch (e) {
 return false;
 }
};

BaseEngine.getPricingMode = function(state) {
 if (!BaseEngine.isPhaseCEnabled()) return "legacy";
 if (!BaseEngine.isPricingWorkerEnabled()) return "hybrid";
 if (state) {
   var hits = state._pricingWorkerHits || 0;
   var misses = state._pricingWorkerMisses || 0;
   var total = hits + misses;
   if (total === 0) return "worker";
   if (misses / total > 0.1) return "hybrid";
   return "worker";
 }
 return "worker";
};

BaseEngine.getGlobalPriceChainId = function(config) {
 try {
 var c = config && config.CHAIN ? config.CHAIN : null;
 var id = c && (c.CHAIN_ID || c.ID || c.NAME || c.CHAIN_NAME);
 return String(id || "unknown").toLowerCase();
 } catch (e) {
 return "unknown";
 }
};

BaseEngine.getWorkerCachedPriceEur = function(config, contract, fxRate, nowMs) {
 if (!BaseEngine.isPhaseCEnabled() || !BaseEngine.isPricingWorkerEnabled()) return null;
 if (!contract || contract === "native" || !Num.isValidPositive(fxRate)) return null;
 var c = String(contract || "").toLowerCase();
 function tryCmcL1Fallback_() {
   try {
     if (typeof _pxL1GetJson !== "function" || typeof _pxL1Key !== "function") return null;
     var l1 = _pxL1GetJson(_pxL1Key("CMCDEX", config, c));
     var usd = l1 && l1.u != null ? Number(l1.u) : 0;
     if (!Num.isValidPositive(usd)) return null;
     try {
       if (typeof GlobalPriceCache !== "undefined" && GlobalPriceCache.savePrice) {
         GlobalPriceCache.savePrice(BaseEngine.getGlobalPriceChainId(config), c, usd, "cmc-dex-l1");
       }
     } catch (ePromote) {}
     return {
       priceEur: usd * Number(fxRate),
       priceUsd: usd,
       ts: nowMs || Date.now(),
       src: "cmc-dex-l1"
     };
   } catch (eL1Fallback) {
     return null;
   }
 }
 try {
 var ttlMs = 21600000;
 try {
 if (config && config.CACHE && Num.isValidPositive(config.CACHE.PRICE_TTL_MS)) ttlMs = Number(config.CACHE.PRICE_TTL_MS);
 } catch (eTtl) {}
 if (ttlMs < 21600000) ttlMs = 21600000;
 var entry = GlobalPriceCache.getFresh(BaseEngine.getGlobalPriceChainId(config), contract, ttlMs);
  if (!entry) return tryCmcL1Fallback_();
  if (entry.src === "no-market") {
    var noMarketFallback = tryCmcL1Fallback_();
    if (!noMarketFallback) return null; // no-market is not a price
    return noMarketFallback;
  }
 if (!Num.isValidPositive(entry.price)) return tryCmcL1Fallback_();
 return {
  priceEur: Number(entry.price) * Number(fxRate),
  priceUsd: Number(entry.price),
  ts: entry.ts || (nowMs || Date.now()),
  src: entry.src || "global"
 };
 } catch (e) {
 return tryCmcL1Fallback_();
 }
};

BaseEngine.applyPricingWorkerCache = function(targets, assets, state, config) {
 var result = { remaining: [], hits: 0, misses: 0 };
 if (!targets || !targets.length) {
 if (state) state.pricingMode = BaseEngine.getPricingMode(state);
 return result;
 }
 if (!BaseEngine.isPhaseCEnabled() || !BaseEngine.isPricingWorkerEnabled()) {
 result.remaining = targets.slice();
 result.misses = targets.length;
 if (state) {
 state._pricingWorkerMisses = (state._pricingWorkerMisses || 0) + result.misses;
 state.pricingMode = BaseEngine.getPricingMode(state);
 }
 return result;
 }

 var byContract = {};
 for (var ai = 0; ai < (assets || []).length; ai++) {
 var a = assets[ai];
 if (!a || !a.contract || a.contract === "native") continue;
 byContract[String(a.contract).toLowerCase()] = a;
 }

 for (var i = 0; i < targets.length; i++) {
 var raw = targets[i];
 var key = String(raw || "").toLowerCase();
 var cached = BaseEngine.getWorkerCachedPriceEur(config, key, state && state.fxRate, state && state.nowMs);
  if (cached && Num.isValidPositive(cached.priceEur)) {
 if (state) {
 state.priceMap[key] = cached.priceEur;
 state.priceTsMap[key] = cached.ts || state.nowMs || Date.now();
 }
 if (byContract[key]) {
 byContract[key].price_eur = cached.priceEur;
  }
 result.hits++;
 } else {
 result.remaining.push(raw);
 result.misses++;
 }
 }

 if (state) {
 state._pricingWorkerHits = (state._pricingWorkerHits || 0) + result.hits;
 state._pricingWorkerMisses = (state._pricingWorkerMisses || 0) + result.misses;
 state.pricingMode = BaseEngine.getPricingMode(state);
 }
 return result;
};

BaseEngine.registerPricingWorkerTargets = function(targets, config) {
 if (!BaseEngine.isPhaseCEnabled() || !BaseEngine.isPricingWorkerEnabled()) return 0;
 if (!targets || !targets.length) return 0;
 try {
 var chainId = BaseEngine.getGlobalPriceChainId(config);
 if (GlobalPriceCache && GlobalPriceCache.touchTargets) {
 return GlobalPriceCache.touchTargets(chainId, targets, "wallet-active");
 }
 } catch (e) {}
 return 0;
};

// ============================================================
// BUDGET RECOVERY MODE
// ============================================================

/**
 * Apply recovery mode to budget when autoForced is detected
 * Ensures pricing AND scanning are enabled even if budget calculation was too restrictive
 * 
 * v4.11.2 - ENHANCED: When version mismatch detected, force NORMAL profile minimums
 * to ensure scan can execute. Previous version only enabled pricing but scan
 * could still be blocked by MINIMAL profile limits.
 * 
 * @param {Object} budget - Budget object (modified in place)
 * @param {Object} state - Execution state
 * @param {Object} config - Chain configuration
 */
BaseEngine.applyRecoveryMode = function(budget, state, config) {
 if (!state.autoForced && !state.cacheVersionMismatch) return;
 
 var minTimeLeft = 1500; // ms
 if (state.timer && state.timer.remaining() <= minTimeLeft) return;
 
 // === PRICING RECOVERY ===
 budget.allowPrices = true;
 budget.allowLlamaCg = true;
 if (budget.maxPriceLookups < 1) budget.maxPriceLookups = 1;
 
 // === v4.11.2: SCAN RECOVERY ===
 // When version mismatch, we MUST allow scanning to rebuild the wallet
 // Override MINIMAL profile limits that would block scanning
 budget.allowFullScan = true;
 budget.allowRotation = true;
 
 // Ensure minimum viable limits for scan (at least CONSERVATIVE level)
 if (!budget.maxTokensPerCall || budget.maxTokensPerCall < 5) {
 budget.maxTokensPerCall = 5;
 }
 if (!budget.maxRefreshPerRun || budget.maxRefreshPerRun < 5) {
 budget.maxRefreshPerRun = 5;
 }
 
 // Enable parallel pricing APIs
 budget.allowDexBulk = true;
 budget.allowGT = true;
 
 // Set flags
 budget.autoForced = true;
 budget.recoveryModeActive = true;
 budget.dueFullScan = true;
 budget.dueFullPrice = true;
 
 // Override profile name to indicate recovery
 budget.profileName = (budget.profileName || "MINIMAL") + "+RECOVERY";
};

// ============================================================
// FX RATE
// ============================================================

/**
 * Get FX rate (USD to EUR) with fallback
 * 
 * @param {Object} state - Execution state (modified in place)
 * @param {Object} cache - Cache object (for fallback)
 * @returns {number} FX rate
 */
BaseEngine.getFxRate = function(state, cache) {
 var fx = null;
 
 try {
 fx = FxRate.getUsdToEur(state.timer);
 } catch (e) {}
 
 if (!Num.isValidPositive(fx)) {
 // Fallback to cached rate
 fx = (cache && Num.isValidPositive(cache.usd_to_eur_rate)) 
 ? cache.usd_to_eur_rate 
 : this.DEFAULTS.FX_FALLBACK;
 }
 
 state.fxRate = fx;
 return fx;
};

// ============================================================
// FALLBACK TO CACHE
// ============================================================

/**
 * Fallback to cache on error
 * Saves error state and returns cached output
 * 
 * v4.11.1 - IMPROVED: When stale cache is preserved (version mismatch + refresh failed),
 * we only save error info without updating the cache version or timestamps.
 * This ensures the stale data remains usable until a successful refresh.
 * v4.15.7 - Mark fallback saves with force/error flags for WalletCache guard.
 * 
 * @param {string} address - Wallet address (normalized)
 * @param {string} reason - Error reason
 * @param {Object} state - Execution state
 * @param {Object} config - Chain configuration
 * @param {string} chainName - Display name for output
 * @param {string} vmType - VM type (EVM/SVM/COSMOS)
 * @returns {Array} Output rows
 */
BaseEngine.fallbackToCache = function(address, reason, state, config, chainName, vmType) {
 // 1. Set error in cache (but don't change version or timestamps)
 try {
 if (!state.cache) state.cache = {};
 state.cache.last_error = String(reason || "").substring(0, this.DEFAULTS.ERROR_MAX_LENGTH);
 state.cache.last_error_ts = Date.now();
 } catch (e) {}
 
 // 2. Determine if we have new assets to save
 var hasNewAssets = false;
 try {
 var assetsToCheck = (state.assets && state.assets.length) 
 ? state.assets 
 : (typeof AssetManager !== 'undefined' && AssetManager.toArray 
 ? AssetManager.toArray(state.assetByKey) 
 : []);
 hasNewAssets = assetsToCheck && assetsToCheck.length > 0;
 } catch (e) {}
 
 // 3. Save cache (protection: don't overwrite with empty data)
 // v4.11.1: If stale cache was preserved due to version mismatch, 
 // DON'T update version - keep old version so next run will retry
 if (hasNewAssets) {
 try {
 this._saveCacheWithAssets(address, state, config);
 } catch (e) {}
 } else if (state._staleCachePreserved && state.cacheVersionMismatch) {
 // CRITICAL: Stale cache preserved - only save error info, don't update version
 // This ensures the next run will also see verMismatch and retry the refresh
 try {
 if (state.cache) {
 // Save only error info, preserve everything else including old version
 var cacheToSave = state.cache;
 cacheToSave._forceFull = !!state.force;
 cacheToSave._hadHttpErrors = this.hasHttpErrorSignal(state, state._scanStats);
 // DON'T update version - keep the old one so next run retries
 // DON'T update updatedAt - keep showing stale age
 WalletCache.save(address, cacheToSave, config);
 }
 } catch (e) {}
 } else {
 // Normal case: no new assets, just save error info
 try {
 if (state.cache) {
 state.cache._forceFull = !!state.force;
 state.cache._hadHttpErrors = this.hasHttpErrorSignal(state, state._scanStats);
 WalletCache.save(address, state.cache, config);
 }
 } catch (e) {}
 }
 
 // 4. Reset memory caches
 try { PriceRunCache.reset(); } catch (e) {}
 
 // 5. Return output from cache (will use preserved stale data if available)
 return OutputBuilder.fromCacheFallback(chainName, state.cache, state.timer, reason, config);
};

/**
 * Internal: Save cache with assets
 * v4.15.7: Preserve previous cache on unconfirmed empty/destructive writes.
 * @private
 */
BaseEngine._saveCacheWithAssets = function(address, state, config) {
 var cacheData = {
 version: config.CACHE_VERSION || (typeof WCORE_CACHE_VERSION !== 'undefined' ? WCORE_CACHE_VERSION : 10),
 updatedAt: state.nowMs,
 last_cache_update: Format.now(),
 last_update: Format.now(),
 assets: state.assets || [],
 priceMap: state.priceMap || {},
 priceTsMap: state.priceTsMap || {},
 balanceTsMap: state.balanceTsMap || {},
 attemptTsMap: state.attemptTsMap || {},
 purgedTsMap: state.purgedTsMap || {},
 usd_to_eur_rate: Num.isValidPositive(state.fxRate) ? state.fxRate : null,
 rrCursor: Num.isValid(state.rrCursor) ? state.rrCursor : 0,
 lastInfoMetaRows: (state.cache && state.cache.lastInfoMetaRows) ? state.cache.lastInfoMetaRows : null,
 im: (state.cache && state.cache.im) ? state.cache.im : null,
 last_full_scan_ms: state.lastFullScanMs || null,
 last_full_price_ms: state.lastFullPriceMs || null,
 last_error: state.lastError || null,
 last_error_ts: state.lastErrorTs || null,
 scanStats: state._scanStats || null,
 _forceFull: !!state.force,
 _hadHttpErrors: this.hasHttpErrorSignal(state, state._scanStats)
 };
 
 var preserve = this.shouldPreserveScanCacheWrite(state.cache, cacheData, state, config, state._scanStats);
 if (preserve && preserve.preserve) {
 if (state.cache && preserve.reason !== "budget") {
 state.cache.scanStats = state.cache.scanStats || {};
 state.cache.scanStats.preserved = true;
 state.cache.scanStats.preserveReason = preserve.reason;
 state.cache.last_error = "Preserved cache: " + preserve.reason;
 state.cache.last_error_ts = Date.now();
 try { WalletCache.save(address, state.cache, config); } catch (ePreserve) {}
 }
 return preserve;
 }
 
 WalletCache.save(address, cacheData, config);
};

// ============================================================
// INFO_ROT BUILDER
// ============================================================

/**
 * Build INFO_ROT string (harmonized format for all engines)
 * 
 * @param {string} chainName - Chain display name
 * @param {Object} budget - Budget object
 * @param {number} rrCursor - Round-robin cursor
 * @param {number} contractsCount - Number of contracts
 * @param {number} pricesFetched - Number of prices fetched
 * @param {boolean} autoForced - Auto-force flag
 * @param {Object} options - Additional options {cacheVersionMismatch, vmType}
 * @returns {string} INFO_ROT string
 */
BaseEngine.buildRotInfo = function(chainName, budget, rrCursor, contractsCount, pricesFetched, autoForced, options) {
 options = options || {};
 var parts = [];
 
 // Chain identification
 parts.push("chain=" + chainName);
 if (options.vmType) parts.push("vm=" + options.vmType);
 
 // Rotation status
 parts.push("rot=" + (budget && budget.allowRotation ? "ON" : "OFF"));
 parts.push("profile=" + (budget ? (budget.profileName || "STATIC") : "STATIC"));
 
 // Risk score (if available)
 if (budget && budget.risk != null) {
 parts.push("risk=" + (Math.round(Number(budget.risk) * 100) / 100));
 }
 
 // Dynamic budget status
 parts.push("dynamic=" + (budget && budget.isDynamic ? "YES" : "NO"));
 
 // Batch settings
 parts.push("batch=" + (budget ? (budget.maxTokensPerCall || "N/A") : "N/A"));
 parts.push("maxRef=" + (budget ? (budget.maxRefreshPerRun || "N/A") : "N/A"));
 
 // Cursor and contracts
 parts.push("rrCursor=" + (Num.isValid(rrCursor) ? rrCursor : 0));
 parts.push("contracts=" + (contractsCount || 0));
 
 // Temporal flags - v4.12.29: renamed to generic labels (not tied to specific intervals)
 parts.push("dueScan=" + (budget && budget.dueFullScan ? "YES" : "NO"));
 parts.push("duePrice=" + (budget && budget.dueFullPrice ? "YES" : "NO"));
 parts.push("forceFull=" + (budget && budget.force ? "YES" : "NO"));
 
 // Auto-force flags
 if (autoForced) parts.push("autoForced=YES");
 if (options.cacheVersionMismatch) parts.push("verMismatch=YES");
 if (budget && budget.recoveryModeActive) parts.push("recovery=YES");
 if (options.staleCachePreserved) parts.push("stalePreserved=YES");
 
 // Pricing
 parts.push("pricingMode=" + (options.pricingMode || (budget && budget.pricingMode) || "legacy"));
 parts.push("pricing=" + (budget && budget.allowPrices ? "ON" : "OFF"));
 parts.push("pricesFetched=" + (pricesFetched | 0));
 
 return parts.join("; ");
};

// ============================================================
// STATS BUILDER (BASE)
// ============================================================

/**
 * Build base stats output (common metrics for all engines)
 * 
 * @param {string} address - Wallet address
 * @param {Object} cache - Cache object
 * @param {Object} config - Chain configuration
 * @param {string} chainLabel - Display label
 * @param {string} vmType - VM type (EVM/SVM/COSMOS)
 * @param {Object} timer - Timer object
 * @returns {Array} Stats rows
 */
/**
 * Build stats output - 2-column compact format (v4.12.0)
 * Value and Details are intelligently merged into single column
 * 
 * @param {string} address - Wallet address
 * @param {Object} cache - Wallet cache object
 * @param {Object} config - Chain configuration
 * @param {string} chainLabel - Display label for wallet/chain
 * @param {string} vmType - VM type (EVM, SVM, COSMOS)
 * @param {Object} timer - Execution timer
 * @returns {Array} 2-column array [Metric, Value]
 */
BaseEngine.buildStatsBase = function(address, cache, config, chainLabel, vmType, timer) {
 var out = [["Metric", "Value"]];
 var nowMs = Date.now();
 
 // Helper: merge value + details intelligently
 var m = function(val, det) {
 var v = (val === null || val === undefined) ? "" : String(val);
 var d = (det === null || det === undefined) ? "" : String(det).trim();
 if (!d) return v;
 if (d === "/100") return v + "/100";
 if (d === "sec" || d === "ms" || d === "keys" || d === "executions") return v + " " + d;
 if (d.indexOf("~") === 0 || d.indexOf("ago") >= 0) return v + " (" + d + ")";
 if (d.indexOf("|") >= 0 || d.indexOf("=") >= 0) return v + " (" + d + ")";
 if (d === "expected" || d === "stored" || d === "cache write" || d === "cache sum" || 
 d.indexOf("META") >= 0 || d.indexOf("No ") >= 0 || d.indexOf("balance>") >= 0 ||
 d.indexOf("unified") >= 0 || d.indexOf("v4.") >= 0) return v + " (" + d + ")";
 if (d.length > 0 && d.length <= 12) return v + " " + d;
 return v + " (" + d + ")";
 };
 
 // TTL configuration
 var ttlSec = (config.CACHE && Num.isValidPositive(config.CACHE.WALLET_TTL_MS)) 
 ? Math.round(config.CACHE.WALLET_TTL_MS / 1000) 
 : 86400;
 
 // === Header info ===
 out.push(["Chain", (config.CHAIN && config.CHAIN.NAME) || vmType]);
 out.push(["Engine", m(vmType, "v" + this.VERSION + " unified")]);
 out.push(["Wallet", m(address, chainLabel)]);
 out.push(["Script", config.VERSION || "unknown"]);
 
 // ============================================================
 // === Module versions (for deployment validation) ===
 // v4.12.23: TABLE FORMAT - One module per line for readability
 // ============================================================
 
 // v4.13.1: Force register all modules before reading versions
 if (typeof _forceRegisterAllModules === "function") {
   _forceRegisterAllModules();
 }
 
 // v4.13.0: Refresh VERSION_REGISTRY to get latest registered versions
 if (typeof VERSION_REGISTRY !== "undefined" && VERSION_REGISTRY.refresh) {
   VERSION_REGISTRY.refresh();
 }
 
 // Helper to get version safely
 function _getVer(name) {
   if (typeof VERSION_REGISTRY !== "undefined" && VERSION_REGISTRY.get) {
     var v = VERSION_REGISTRY.get(name);
     if (v && v !== "N/A") return v;
   }
   return null;
 }
 
 // Core modules
 out.push(["ModuleVersions.BASE", this.VERSION || _getVer("BASE_ENGINE") || "?"]);
 
 // Cache modules
 var v;
 if ((v = _getVer("CACHE_CORE"))) out.push(["ModuleVersions.CACHE_CORE", v]);
 if ((v = _getVer("CACHE_WALLET"))) out.push(["ModuleVersions.CACHE_WALLET", v]);
 if ((v = _getVer("CACHE_PRICE"))) out.push(["ModuleVersions.CACHE_PRICE", v]);
 if ((v = _getVer("CACHE_GLOBAL"))) out.push(["ModuleVersions.CACHE_GLOBAL", v]);
 if ((v = _getVer("CACHE_SHEET"))) out.push(["ModuleVersions.CACHE_SHEET", v]);
 
 // HTTP modules
 if ((v = _getVer("HTTP"))) out.push(["ModuleVersions.HTTP", v]);
 if ((v = _getVer("HTTP_BUDGET"))) out.push(["ModuleVersions.HTTP_BUDGET", v]);
 if ((v = _getVer("HTTP_GUARD"))) out.push(["ModuleVersions.HTTP_GUARD", v]);
 
 // Protection modules
 if ((v = _getVer("CACHE_GUARD"))) out.push(["ModuleVersions.CACHE_GUARD", v]);
 if ((v = _getVer("CACHE_VERIFY"))) out.push(["ModuleVersions.CACHE_VERIFY", v]);
 
 // Core functionality modules
 if ((v = _getVer("ASSETS"))) out.push(["ModuleVersions.ASSETS", v]);
 if ((v = _getVer("BUDGET"))) out.push(["ModuleVersions.BUDGET", v]);
 if ((v = _getVer("PRICES"))) out.push(["ModuleVersions.PRICES", v]);
 if ((v = _getVer("RPC"))) out.push(["ModuleVersions.RPC", v]);
 if ((v = _getVer("TOKENS"))) out.push(["ModuleVersions.TOKENS", v]);
 
 // Engine-specific modules
 if (vmType === "EVM" && (v = _getVer("EVM_ENGINE"))) out.push(["ModuleVersions.EVM", v]);
 if (vmType === "SVM" && (v = _getVer("SVM_ENGINE"))) out.push(["ModuleVersions.SVM", v]);
  if (vmType === "COSMOS" && (v = _getVer("COSMOS_ENGINE"))) out.push(["ModuleVersions.COSMOS", v]);
  if (vmType === "TON") out.push(["ModuleVersions.TON", (typeof TON_VERSION !== "undefined" ? TON_VERSION : (_getVer("TON") || "?"))]);
 
 // Utility modules
 if ((v = _getVer("DIAGNOSTIC"))) out.push(["ModuleVersions.DIAGNOSTIC", v]);
 if ((v = _getVer("DASHBOARD"))) out.push(["ModuleVersions.DASHBOARD", v]);
 if ((v = _getVer("ACTIVITY_REFRESH"))) out.push(["ModuleVersions.ACTIVITY", v]);
 if ((v = _getVer("OPTIMIZATIONS"))) out.push(["ModuleVersions.OPTIMIZATIONS", v]);
 if ((v = _getVer("DEGRADED_MODE"))) out.push(["ModuleVersions.DEGRADED_MODE", v]);


 
 // === Cache metrics ===
 var cacheAgeSec = -1;
  var pricesMissing = 0;
  var totalEur = 0;
  var hasError = 0;
  var lastCacheUpdateStr = "N/A";
 
 if (!cache) {
 out.push(["Cache", m("N/A", "No cache")]);
 out.push(["CacheVersion", (config.CACHE_VERSION || "N/A") + " (no cache)"]);
 } else {
 var upd = Num.isValid(cache.updatedAt) ? cache.updatedAt : 0;
 cacheAgeSec = upd ? Math.round((nowMs - upd) / 1000) : -1;
 
 out.push(["Cache.updatedAt", m(upd ? Format.datetime(upd) : "N/A", 
 (cacheAgeSec >= 0 ? ("~" + Math.round(cacheAgeSec / 60) + " min ago") : ""))]);
 out.push(["Cache.last_update", m(
 (WalletCache.getLastRunUpdateStr ? WalletCache.getLastRunUpdateStr(cache) : "") || "N/A", 
 "META last_update")]);
  lastCacheUpdateStr = WalletCache.getLastUpdateStr(cache) || "N/A";
  out.push(["Cache.last_cache_update", m(lastCacheUpdateStr, "cache write")]);
 var expectedVer = config.CACHE_VERSION || "N/A";
 var storedVer = cache.version || "N/A";
 var verMatch = (expectedVer === storedVer);
 var verDisplay = verMatch 
 ? (expectedVer + " [OK]") 
 : (expectedVer + " vs " + storedVer + " (MISMATCH)");
 out.push(["CacheVersion", verDisplay]);
 out.push(["Cache.ttl_sec", m(ttlSec, "sec")]);
 out.push(["Cache.age_sec", m(cacheAgeSec, "sec")]);
 out.push(["Cache.assets", (cache.assets || []).length]);
 out.push(["Cache.rrCursor", cache.rrCursor || 0]);
 out.push(["Cache.priceMap", m(Obj.keyCount(cache.priceMap), "keys")]);
 out.push(["Cache.priceTsMap", m(Obj.keyCount(cache.priceTsMap), "keys")]);
 out.push(["Cache.balanceTsMap", m(Obj.keyCount(cache.balanceTsMap), "keys")]);
 out.push(["Cache.attemptTsMap", m(Obj.keyCount(cache.attemptTsMap), "keys")]);
 out.push(["Cache.purgedTsMap", m(Obj.keyCount(cache.purgedTsMap), "keys")]);
 var fullScanVal = cache.last_full_scan_ms 
 ? Format.datetime(cache.last_full_scan_ms) 
 : ((cache.assets || []).length <= 1 ? "Native only" : "Never");
 out.push(["Cache.last_full_scan", fullScanVal]);
 out.push(["Cache.last_full_price", cache.last_full_price_ms ? Format.datetime(cache.last_full_price_ms) : "N/A"]);
 out.push(["Cache.usd_to_eur", Num.isValidPositive(cache.usd_to_eur_rate) ? cache.usd_to_eur_rate.toFixed(4) : "N/A"]);
 
 // Error info
 if (cache.last_error) {
 hasError = 1;
 out.push(["Cache.last_error", String(cache.last_error).substring(0, 120)]);
 if (cache.last_error_ts) {
 out.push(["Cache.last_error_ts", Format.datetime(cache.last_error_ts)]);
 }
 }
 
 // Calculate pricing coverage
 var assets = cache.assets || [];
 var priceMapLocal = cache.priceMap || {};
 var nativeKey = (config.KEYS && config.KEYS.NATIVE_PRICE) ? config.KEYS.NATIVE_PRICE : "native";
 var pxIgnoreList = config.PRICE_IGNORE_CONTRACTS || [];

 for (var i = 0; i < assets.length; i++) {
 var a = assets[i];
 if (!a) continue;
 var bal = Number(a.balance || 0);
 if (!Num.isPositive(bal)) continue;

 var contract = a.contract || a.denom || "";
 var pxKey = (contract === "native") ? nativeKey : contract;
 if (vmType === "EVM") pxKey = Addr.normalize(pxKey);

 // v4.12.14: Match OutputBuilder._getPrice() lookup order:
 // 1. asset.price_eur (embedded in asset object by engine)
 // 2. priceMap[pxKey] (chain-specific key like "native@fogo")
 // 3. priceMap["native"] (generic fallback for native tokens)
 var px = 0;

 // Check embedded price first (SVM/EVM engines embed price_eur in asset)
 if (Num.isValidPositive(a.price_eur)) {
 px = Number(a.price_eur);
 }
 // Then check priceMap with specific key
 if (!Num.isValidPositive(px) && priceMapLocal[pxKey]) {
 px = Number(priceMapLocal[pxKey]);
 }
 // Fallback to generic "native" key for native tokens
 if (!Num.isValidPositive(px) && contract === "native" && priceMapLocal["native"]) {
 px = Number(priceMapLocal["native"]);
 }

 if (!Num.isValidPositive(px)) {
 // v4.14.2: Skip contracts in PRICE_IGNORE_CONTRACTS
 if (pxIgnoreList.indexOf(pxKey) < 0) pricesMissing++;
 } else {
 totalEur += (px * bal);
 }
 }
 
 out.push(["Pricing.total_eur", m(Num.isValidPositive(totalEur) ? totalEur.toFixed(2) : "0.00", "EUR")]);
 out.push(["Pricing.missing_count", m(pricesMissing, "balance>0 without price")]);
 }
 
  out.push(["last_cache_update", lastCacheUpdateStr]);

  // === Pricing config ===
 out.push(["Pricing.enabled", !(config.FLAGS && config.FLAGS.DISABLE_LIVE_PRICES) ? 1 : 0]);
 
 // === Global caches ===
 try {
 var globalPrices = GlobalPriceCache.load(timer, config);
 out.push(["GlobalPriceCache.priceMap", m(Obj.keyCount(globalPrices.priceMap), "keys")]);
 out.push(["GlobalPriceCache.priceTsMap", m(Obj.keyCount(globalPrices.priceTsMap), "keys")]);
 } catch (e) {
 out.push(["GlobalPriceCache", m("N/A", String(e.message || e).substring(0, 80))]);
 }
 
 try {
 var metaMap = MetaCache.load(timer, config);
 out.push(["MetaCache", m(Obj.keyCount(metaMap), "keys")]);
 } catch (e) {
 out.push(["MetaCache", m("N/A", String(e.message || e).substring(0, 80))]);
 }
 
 // === RPC health ===
 var blockedCount = 0;
 try {
 if (typeof RpcHealth !== 'undefined') {
 RpcHealth.loadFromCache(timer, config);
 if (RpcHealth._state) {
 Obj.forEach(RpcHealth._state, function(rpcUrl, data) {
 if (data && data.blocked) blockedCount++;
 });
 }
 }
 } catch (e) {}
 out.push(["RPC.blocked", blockedCount]);
 out.push(["RPC.health_score", m((blockedCount <= 0) ? 100 : Math.max(0, 80 - blockedCount * 10), "/100")]);
 
 // ============================================================
 // === v4.13.0: Rotation stats (simplified model) ===
 // Reads scanStats from cache (stored by engines v4.13.0)
 // ============================================================
 try {
 var scanStats = (cache && cache.scanStats) || null;
 var rrCursor = (cache && cache.rrCursor) || 0;
 
  if (scanStats) {
  if (scanStats.source === "wcore-web") {
  out.push(["WebScan.source", "wcore-web"]);
  out.push(["WebScan.vm", scanStats.vm || ""]);
  out.push(["WebScan.scan_ms", scanStats.scanMs || 0]);
  out.push(["WebScan.priority_tokens", scanStats.priorityTokens || scanStats.strictTokens || 0]);
  out.push(["WebScan.extra_tokens", scanStats.extraTokens || 0]);
  out.push(["WebScan.filtered_out", scanStats.filteredOut || 0]);
  out.push(["WebScan.scam_filtered", scanStats.scamFiltered || 0]);
  }
  var totalContracts = scanStats.totalContracts || 0;
  var missingPrices = scanStats.missingPrices || 0;
  var derivedMissingPrices = BaseEngine.countMissingPricesFromCache(cache);
  if (derivedMissingPrices > missingPrices) missingPrices = derivedMissingPrices;
 var missingMeta = scanStats.missingMeta || 0;
 // v4.15.24: Native only (0 contracts) = cycle complete. Otherwise DONE
 // requires the scan cycle AND all visible metadata/pricing gaps to be closed.
 var cycleDone = totalContracts === 0 || (scanStats.fullCycleComplete && missingPrices <= 0 && missingMeta <= 0);
 var cycleStatus = cycleDone ? "DONE" : "partial";
 var scannedCount = scanStats.scannedCount || 0;
 var cursor = scanStats.cursor || rrCursor;
 var hasActivity = scanStats.hasActivity ? "YES" : "NO";
 var fallbackCount = scanStats.fallbackCount || 0;
 
 // Format: "DONE | cursor=0/0 | scanned=0 | activity=NO" for native only
 // Format: "partial | cursor=5/55 | scanned=10 | activity=NO" for multi-token
 var rotationStr = cycleStatus + " | cursor=" + cursor + "/" + totalContracts;
 rotationStr += " | scanned=" + scannedCount;
 rotationStr += " | activity=" + hasActivity;
 if (fallbackCount > 0) {
 rotationStr += " | fallback=" + fallbackCount;
 }
 // v4.13.4: Show missing metadata count
 if (missingMeta > 0) {
 rotationStr += " | meta_missing=" + missingMeta;
 }
 // v4.14.1: Show missing prices count
 if (missingPrices > 0) {
 rotationStr += " | price_missing=" + missingPrices;
 }
 
 out.push(["Rotation.status", rotationStr]);
 out.push(["Rotation.cycle", cycleStatus]);
 out.push(["Rotation.cursor", m(cursor, "/" + totalContracts)]);
 } else {
 // No scanStats - fallback to basic cursor info
 out.push(["Rotation.status", "N/A (no scan data)"]);
 out.push(["Rotation.cursor", m(rrCursor, "position")]);
 }
 } catch (e) {
 out.push(["Rotation.status", "N/A (Error: " + e.message + ")"]);
 }
 
 // === Flags ===
 var flagStale = (cacheAgeSec >= 0 && ttlSec > 0 && cacheAgeSec > ttlSec) ? 1 : 0;
 out.push(["Flag.stale", flagStale]);
 out.push(["Flag.pricing_gap", (pricesMissing > 0) ? 1 : 0]);
 out.push(["Flag.rpc_bad", (blockedCount > 0) ? 1 : 0]);
 out.push(["Flag.has_error", hasError]);
 
 // === Status & Score ===
 var status = hasError ? "ERROR" : ((flagStale || pricesMissing > 0 || blockedCount > 0) ? "WARN" : "OK");
 var score = 100;
 if (flagStale) score -= 30;
 if (pricesMissing > 0) score -= 20;
 if (blockedCount > 0) score -= 20;
 if (hasError) score -= 40;
 score = Math.max(0, Math.min(100, score));
 
 out.push(["Status", status]);
 out.push(["Health.score", m(score, "/100")]);
 
 // === Activity Metrics (v4.12.21 FIX: use config.CHAIN.NAME, not .ID) ===
 try {
 // v4.12.21: Pass config object directly - ActivityTracker normalizes keys internally
 // This ensures consistent key format: CHAIN_UPPER:wallet_lower
 var activityInfo = null;
 var hasRecentActivity = false;
 
 // Check if ActivityTracker is available
 if (typeof ActivityTracker !== "undefined" && ActivityTracker.getInfo) {
 // ActivityTracker.getInfo accepts config object or string
 // Using config ensures correct chain name extraction via _getChainKey()
 activityInfo = ActivityTracker.getInfo(config, address);
 hasRecentActivity = ActivityTracker.hasRecentActivity 
 ? ActivityTracker.hasRecentActivity(config, address) 
 : false;
 }
 
 // Activity.last_tx
 if (activityInfo && activityInfo.lastActivity) {
 var txAgeMs = nowMs - activityInfo.lastActivity;
 var txAgeStr = "";
 if (txAgeMs < 60000) txAgeStr = Math.round(txAgeMs / 1000) + " sec ago";
 else if (txAgeMs < 3600000) txAgeStr = Math.round(txAgeMs / 60000) + " min ago";
 else txAgeStr = (txAgeMs / 3600000).toFixed(1) + "h ago";
 out.push(["Activity.last_tx", m(Format.datetime(activityInfo.lastActivity), txAgeStr)]);
 } else {
 out.push(["Activity.last_tx", "-"]);
 }
 
 // Activity.nonce
 if (activityInfo && activityInfo.nonce !== null && activityInfo.nonce !== undefined) {
 out.push(["Activity.nonce", String(activityInfo.nonce)]);
 } else {
 out.push(["Activity.nonce", "-"]);
 }
 
 // Activity.has_recent
 out.push(["Activity.has_recent", hasRecentActivity ? "YES [WARNING]" : "no"]);
 
 // Activity.priority - Calculate based on value and activity
 var priorityName = "SKIP";
 var priorityReason = "OK";
 var refreshInterval = 86400000; // 24h default
 
 if (hasRecentActivity) {
 priorityName = "IMMEDIATE";
 priorityReason = "TX detected";
 refreshInterval = 300000; // 5min
 } else if (totalEur >= 1000) {
 priorityName = "HIGH";
 priorityReason = ">1000 EUR";
 refreshInterval = 1800000; // 30min
 } else if (totalEur >= 100) {
 priorityName = "MEDIUM";
 priorityReason = ">100 EUR";
 refreshInterval = 7200000; // 2h
 } else if (totalEur >= 1) {
 priorityName = "LOW";
 priorityReason = ">1 EUR";
 refreshInterval = 21600000; // 6h
 } else {
 priorityName = "HIBERNATED";
 priorityReason = "<1 EUR";
 refreshInterval = 86400000; // 24h
 }
 
 // Check if refresh needed based on cache age
 var cacheAgeMs = cacheAgeSec >= 0 ? cacheAgeSec * 1000 : 0;
 if (cacheAgeMs > refreshInterval * 2 && priorityName !== "IMMEDIATE") {
 priorityName = "URGENT";
 priorityReason = "Cache very old";
 } else if (cacheAgeMs > refreshInterval && priorityName === "SKIP") {
 priorityName = "NORMAL";
 priorityReason = "Refresh due";
 } else if (cacheAgeMs < refreshInterval && !hasRecentActivity) {
 priorityName = "SKIP";
 priorityReason = "Fresh cache";
 }
 
 out.push(["Activity.priority", priorityName + " (" + priorityReason + ")"]);
 
 // Refresh.next_in
 var nextRefreshMs = refreshInterval - cacheAgeMs;
 var nextRefreshStr = "Now";
 if (nextRefreshMs > 0) {
 if (nextRefreshMs < 60000) nextRefreshStr = Math.round(nextRefreshMs / 1000) + "s";
 else if (nextRefreshMs < 3600000) nextRefreshStr = Math.round(nextRefreshMs / 60000) + "min";
 else nextRefreshStr = (nextRefreshMs / 3600000).toFixed(1) + "h";
 }
 out.push(["Refresh.next_in", nextRefreshStr]);
 
 // Refresh.interval
 var intervalStr = "24h";
 if (refreshInterval < 60000) intervalStr = Math.round(refreshInterval / 1000) + "s";
 else if (refreshInterval < 3600000) intervalStr = Math.round(refreshInterval / 60000) + "min";
 else intervalStr = (refreshInterval / 3600000).toFixed(0) + "h";
 out.push(["Refresh.interval", intervalStr]);
 
 } catch (activityErr) {
 out.push(["Activity.error", String(activityErr.message || activityErr).substring(0, 50)]);
 }
 
  var execMs = timer ? String(timer.elapsed()) : "0";
  out.push(["Exec.ms", m(execMs, "ms")]);
  out.push(["exec_ms", m(execMs, "ms")]);
 
 return out;
};

// ============================================================
// EMPTY CACHE FACTORY
// ============================================================

/**
 * Create empty cache structure (standardized for all engines)
 * 
 * @param {Object} config - Chain configuration
 * @returns {Object} Empty cache structure
 */
BaseEngine.createEmptyCache = function(config) {
 return {
 version: config.CACHE_VERSION || (typeof WCORE_CACHE_VERSION !== 'undefined' ? WCORE_CACHE_VERSION : 10),
 updatedAt: 0,
 last_cache_update: "",
 last_update: "",
 wallet_original: "",
 assets: [],
 priceMap: {},
 priceTsMap: {},
 balanceTsMap: {},
 attemptTsMap: {},
 purgedTsMap: {},
 usd_to_eur_rate: null,
 rrCursor: 0,
 lastInfoMetaRows: null,
 im: null,
 last_full_scan_ms: null,
 last_full_price_ms: null,
 last_error: null,
 last_error_ts: null
 };
};

// ============================================================
// UTILITY: Timer check helpers
// ============================================================

/**
 * Check if there's enough time left for an operation
 * 
 * @param {Object} state - Execution state with timer
 * @param {number} minMs - Minimum milliseconds needed
 * @returns {boolean} true if enough time remains
 */
BaseEngine.hasTimeLeft = function(state, minMs) {
 if (!state || !state.timer) return true;
 return state.timer.remaining() > (minMs || 0);
};

/**
 * Check if timer is running low
 * 
 * @param {Object} state - Execution state with timer
 * @param {Object} config - Chain configuration
 * @returns {boolean} true if time is low
 */
BaseEngine.isTimeLow = function(state, config) {
 if (!state || !state.timer) return false;
 var margin = (config && config.TIMEOUTS && config.TIMEOUTS.SAFE_MARGIN_MS) 
 ? config.TIMEOUTS.SAFE_MARGIN_MS 
 : this.DEFAULTS.SAFE_MARGIN_MS;
 return state.timer.remaining() < margin;
};

// ============================================================
// v4.12.0 ADDITIONS: AUTO-PROFILE SELECTION
// ============================================================

/**
 * Automatically select optimal profile based on RPC health and execution metrics
 * 
 * @param {number} rpcHealthScore - RPC health score (0-100)
 * @param {number} avgExecMs - Average execution time in milliseconds
 * @param {Object} config - Chain configuration
 * @returns {string} Profile name (AGGRESSIVE, NORMAL, CONSERVATIVE, MINIMAL)
 */
BaseEngine.autoSelectProfile = function(rpcHealthScore, avgExecMs, config) {
 // Default thresholds
 var thresholds = {
 AGGRESSIVE: { minHealth: 90, maxExec: 10000 },
 NORMAL: { minHealth: 70, maxExec: 15000 },
 CONSERVATIVE: { minHealth: 50, maxExec: 20000 }
 // Below these = MINIMAL
 };
 
 // Override with config if provided
 if (config && config.PROFILE_THRESHOLDS) {
 thresholds = config.PROFILE_THRESHOLDS;
 }
 
 var health = Number(rpcHealthScore) || 0;
 var exec = Number(avgExecMs) || 0;
 
 if (health >= thresholds.AGGRESSIVE.minHealth && exec <= thresholds.AGGRESSIVE.maxExec) {
 return 'AGGRESSIVE';
 }
 if (health >= thresholds.NORMAL.minHealth && exec <= thresholds.NORMAL.maxExec) {
 return 'NORMAL';
 }
 if (health >= thresholds.CONSERVATIVE.minHealth && exec <= thresholds.CONSERVATIVE.maxExec) {
 return 'CONSERVATIVE';
 }
 return 'MINIMAL';
};

/**
 * Get recommended profile settings based on auto-selected profile
 * 
 * @param {string} profile - Profile name
 * @returns {Object} Profile settings {maxTokensPerCall, maxRefreshPerRun, allowRotation}
 */
BaseEngine.getProfileSettings = function(profile) {
 var profiles = {
 AGGRESSIVE: { maxTokensPerCall: 15, maxRefreshPerRun: 30, allowRotation: true },
 NORMAL: { maxTokensPerCall: 10, maxRefreshPerRun: 15, allowRotation: true },
 CONSERVATIVE: { maxTokensPerCall: 5, maxRefreshPerRun: 5, allowRotation: true },
 MINIMAL: { maxTokensPerCall: 3, maxRefreshPerRun: 3, allowRotation: false }
 };
 
 return profiles[profile] || profiles.NORMAL;
};

// ============================================================
// v4.12.0 ADDITIONS: VERSION DIAGNOSTIC
// ============================================================

/**
 * Diagnose version mismatch issues
 * Useful for debugging why verMismatch=YES appears
 * 
 * @param {Object} cache - Loaded cache object
 * @param {Object} config - Chain configuration
 * @returns {Object} Diagnostic info
 */
BaseEngine.getVersionDiagnostic = function(cache, config) {
 var expectedVersion = config.CACHE_VERSION || 
 (typeof WCORE_CACHE_VERSION !== 'undefined' ? WCORE_CACHE_VERSION : 10);
 var cacheVersion = cache ? (cache.version || 0) : -1;
 var vmType = (config.CHAIN && config.CHAIN.VM) || 'EVM';
 var centralVersion = null;
 
 try {
 if (typeof WCORE_VM_CACHE_VERSIONS !== 'undefined' && WCORE_VM_CACHE_VERSIONS[vmType]) {
 centralVersion = WCORE_VM_CACHE_VERSIONS[vmType];
 }
 } catch (e) {}
 
 var reason = "";
 if (cacheVersion === -1) {
 reason = "No cache exists";
 } else if (cacheVersion === 0) {
 reason = "Cache has no version (legacy format)";
 } else if (cacheVersion < expectedVersion) {
 reason = "Cache is older (v" + cacheVersion + " < v" + expectedVersion + ")";
 } else if (cacheVersion > expectedVersion) {
 reason = "Cache is newer (v" + cacheVersion + " > v" + expectedVersion + ") - config outdated?";
 } else {
 reason = "Versions match";
 }
 
 return {
 cacheVersion: cacheVersion,
 configVersion: config.CACHE_VERSION || "not set",
 expectedVersion: expectedVersion,
 centralVersion: centralVersion,
 wcoreVersion: (typeof WCORE_CACHE_VERSION !== 'undefined') ? WCORE_CACHE_VERSION : "not defined",
 mismatch: (cacheVersion !== expectedVersion),
 reason: reason
 };
};
