/************************************************************
 * 03B_HTTP_GUARD.gs - HTTP Error Guard & Cache Protection (v4.13.4)
 * 
 * Protects cache from being overwritten when HTTP errors occur.
 * 
 * v4.13.4 - CRITICAL FIX: CacheGuard no longer blocks valid saves during quota
 *   Previous: ALL saves blocked when quota exhausted → timestamps not refreshed
 *   → packed cache prune evicts "old" entries → permanent "No cache available"
 *   Fix: Allow saves of valid data during quota exhaustion (refreshes timestamp),
 *   only block saves that would overwrite valid data with empty data.
 * 
 * v4.9.3 - IDEMPOTENCY + INSTALL RELIABILITY FIX
 * - FIXED: INSTALL_CACHE_PROTECTION now has idempotency guard
 *   to prevent double-patching when called from BaseEngine.initCaches
 * - CRITICAL BUG FIX: Auto-install at file load time ALWAYS FAILED
 *   because WalletCache (04B) loads AFTER this file (03B) due to
 *   alphabetical file loading order. Protection was NEVER active
 *   during formula execution unless WCORE_INIT() was called.
 *   Fix: BaseEngine.initCaches() now calls INSTALL_CACHE_PROTECTION().
 * 
 * v4.9.2 - SILENT QUOTA DETECTION FIX
 * - NEW: detectSilentQuotaExhaustion(balMs, rpcCalls) method
 * - CRITICAL: Detects when UrlFetch is exhausted but no exception is thrown
 * - Pattern: bal > 8000ms AND rpcCalls = 0 = silent quota exhaustion
 * - Tracks consecutive silent failures across calls
 * - Auto-marks quota exhausted after 2 consecutive silent failures
 * 
 * PROBLEM SOLVED (v4.9.2):
 * When Google Apps Script quota is exhausted, UrlFetchApp.fetch()
 * does NOT throw an exception - it simply times out silently.
 * This causes the system to overwrite valid cache with empty data.
 * 
 * v4.9.1:
 * - WEIGHTED ERROR TRACKING: Different error types have different impacts
 * 
 * ORIGINAL PROBLEM:
 * When quota is exhausted ("Service invoked too many times"),
 * the old code would still save an empty/partial cache,
 * destroying the previous valid data.
 * 
 * SOLUTION:
 * - Detect HTTP quota errors globally
 * - Block cache writes when in error state
 * - Return existing cache data instead
 * - WEIGHTED ERROR TRACKING (v4.9.1): Different error types have different impacts
 * - SILENT TIMEOUT DETECTION (v4.9.2): Detect quota exhaustion by timing patterns
 * 
 * INTEGRATION:
 * This module patches WalletCache.save and CacheManager.safeSetJson
 * to add protection. Load AFTER 04A, 04B, 04C cache modules.
 ************************************************************/
var HTTP_GUARD_VERSION = "4.9.3";
var CACHE_GUARD_VERSION = "4.13.4";

// ============================================================
// HTTP ERROR WEIGHTS (v4.9.1)
// ============================================================

var HTTP_ERROR_WEIGHTS = {
  // Timeout errors - temporary, less severe
  'timeout': 0.5,
  'timed out': 0.5,
  'deadline exceeded': 0.5,
  
  // Rate limiting - very severe
  'rate limit': 2.0,
  'too many requests': 2.0,
  '429': 2.0,
  'quota exceeded': 2.0,
  
  // Server errors - normal weight
  'server error': 1.0,
  '500': 1.0,
  '502': 1.0,
  '503': 1.0,
  '504': 1.0,
  
  // Not found - very light
  'not found': 0.1,
  '404': 0.1,
  
  // Network errors - medium
  'network': 0.7,
  'connection': 0.7,
  'dns': 0.7,
  
  // Quota exhaustion - CRITICAL
  'service invoked too many times': 3.0,
  'urlfetch': 2.5,
  
  // v4.9.2: Silent timeout (detected by pattern, not message)
  'silent_timeout': 3.0,
  
  // Default weight
  '_default': 1.0
};

/**
 * Calculate weight for an error
 */
function getErrorWeight(error) {
  if (!error) return 0;
  var msg = String(error.message || error || "").toLowerCase();
  
  // Check each pattern
  for (var pattern in HTTP_ERROR_WEIGHTS) {
    if (pattern === '_default') continue;
    if (msg.indexOf(pattern.toLowerCase()) >= 0) {
      return HTTP_ERROR_WEIGHTS[pattern];
    }
  }
  
  return HTTP_ERROR_WEIGHTS._default;
}

// ============================================================
// HTTP ERROR STATE TRACKING
// ============================================================

var HttpErrorGuard = (function() {
  
  // Global error state
  var _quotaExhausted = false;
  var _lastQuotaError = null;
  var _errorCount = 0;
  var _weightedErrorScore = 0; // NEW: Weighted score
  var _sessionErrors = [];
  
  // v4.9.2: Silent timeout tracking
  var _consecutiveSilentFailures = 0;
  var _lastSilentFailureTs = 0;
  var _totalSilentFailures = 0;
  
  // v4.9.2: Thresholds for silent timeout detection
  var SILENT_TIMEOUT_THRESHOLD_MS = 8000;  // bal > 8s is suspicious
  var SILENT_FAILURE_MAX_CONSECUTIVE = 2;  // 2 consecutive = quota exhausted
  var SILENT_FAILURE_RESET_MS = 60000;     // Reset counter after 60s of no failures
  
  // Error patterns to detect
  var QUOTA_ERROR_PATTERNS = [
    "Service invoked too many times",
    "urlfetch",
    "Quota exceeded",
    "Rate Limit",
    "Too Many Requests",
    "429"
  ];
  
  /**
   * Check if an error is a quota-related error
   */
  function _isQuotaError(error) {
    if (!error) return false;
    var msg = String(error.message || error || "").toLowerCase();
    
    for (var i = 0; i < QUOTA_ERROR_PATTERNS.length; i++) {
      if (msg.indexOf(QUOTA_ERROR_PATTERNS[i].toLowerCase()) >= 0) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Classify error type (v4.9.1)
   */
  function _classifyError(error) {
    if (!error) return 'unknown';
    var msg = String(error.message || error || "").toLowerCase();
    
    if (msg.indexOf('timeout') >= 0 || msg.indexOf('timed out') >= 0) return 'timeout';
    if (msg.indexOf('429') >= 0 || msg.indexOf('rate limit') >= 0) return 'rate_limit';
    if (msg.indexOf('500') >= 0 || msg.indexOf('502') >= 0 || msg.indexOf('503') >= 0) return 'server_error';
    if (msg.indexOf('404') >= 0 || msg.indexOf('not found') >= 0) return 'not_found';
    if (msg.indexOf('network') >= 0 || msg.indexOf('connection') >= 0) return 'network';
    if (msg.indexOf('silent_timeout') >= 0) return 'silent_quota';
    if (_isQuotaError(error)) return 'quota_exhausted';
    
    return 'other';
  }
  
  /**
   * Record an error occurrence (v4.9.1 - with weighting)
   */
  function _recordError(error, source) {
    _errorCount++;
    
    var errorType = _classifyError(error);
    var weight = getErrorWeight(error);
    _weightedErrorScore += weight;
    
    var entry = {
      ts: Date.now(),
      source: source || "unknown",
      type: errorType,
      weight: weight,
      msg: String(error && (error.message || error) || "").substring(0, 100)
    };
    
    _sessionErrors.push(entry);
    if (_sessionErrors.length > 50) {
      _sessionErrors = _sessionErrors.slice(-50);
    }
    
    // Check if quota error
    if (_isQuotaError(error)) {
      _quotaExhausted = true;
      _lastQuotaError = entry;
      Logger.log("[HttpErrorGuard] QUOTA EXHAUSTED detected: " + entry.msg);
    }
    
    // Auto-mark quota exhausted if weighted score too high
    if (_weightedErrorScore > 20) {
      _quotaExhausted = true;
      Logger.log("[HttpErrorGuard] Weighted error score exceeded threshold: " + _weightedErrorScore);
    }
  }
  
  /**
   * v4.9.2: Detect silent quota exhaustion by timing pattern
   * 
   * CRITICAL: When UrlFetch quota is exhausted, requests don't throw exceptions
   * They simply timeout silently after ~10 seconds and return null.
   * 
   * Pattern to detect:
   * - balMs > 8000 (spent > 8 seconds on balance phase)
   * - rpcCalls = 0 (no successful RPC calls)
   * - Consecutive occurrences = definite quota problem
   * 
   * @param {number} balMs - Time spent on balance phase in milliseconds
   * @param {number} rpcCalls - Number of successful RPC calls
   * @param {string} chainName - Chain name for logging
   * @returns {boolean} true if quota exhaustion detected
   */
  function _detectSilentQuotaExhaustion(balMs, rpcCalls, chainName) {
    var now = Date.now();
    
    // Reset counter if it's been too long since last failure
    if (_lastSilentFailureTs > 0 && (now - _lastSilentFailureTs) > SILENT_FAILURE_RESET_MS) {
      _consecutiveSilentFailures = 0;
    }
    
    // Check for silent timeout pattern
    var isSilentTimeout = (balMs > SILENT_TIMEOUT_THRESHOLD_MS) && (rpcCalls === 0);
    
    if (isSilentTimeout) {
      _consecutiveSilentFailures++;
      _totalSilentFailures++;
      _lastSilentFailureTs = now;
      
      Logger.log("[HttpErrorGuard] SILENT TIMEOUT detected: " + 
                 (chainName || "unknown") + 
                 " bal=" + balMs + "ms rpcCalls=" + rpcCalls + 
                 " consecutive=" + _consecutiveSilentFailures);
      
      // Record as error
      _recordError({ message: "silent_timeout: bal=" + balMs + "ms, rpcCalls=0" }, chainName || "chain");
      
      // Mark quota exhausted if too many consecutive failures
      if (_consecutiveSilentFailures >= SILENT_FAILURE_MAX_CONSECUTIVE) {
        _quotaExhausted = true;
        _lastQuotaError = {
          ts: now,
          source: chainName || "silent_detection",
          type: "silent_quota",
          msg: "Silent quota exhaustion detected: " + _consecutiveSilentFailures + " consecutive timeout patterns"
        };
        
        Logger.log("[HttpErrorGuard] QUOTA EXHAUSTED (silent detection): " + 
                   _consecutiveSilentFailures + " consecutive silent timeouts");
        
        return true;
      }
    } else {
      // Reset consecutive counter on success
      if (rpcCalls > 0) {
        _consecutiveSilentFailures = 0;
      }
    }
    
    return _quotaExhausted;
  }
  
  return {
    
    /**
     * Check if quota is exhausted
     */
    isQuotaExhausted: function() {
      return _quotaExhausted;
    },
    
    /**
     * Record an HTTP error
     */
    recordError: function(error, source) {
      _recordError(error, source);
    },
    
    /**
     * Check if an error indicates quota exhaustion
     */
    isQuotaError: function(error) {
      return _isQuotaError(error);
    },
    
    /**
     * v4.9.2: Detect silent quota exhaustion
     * Call this after balance phase with timing data
     */
    detectSilentQuotaExhaustion: function(balMs, rpcCalls, chainName) {
      return _detectSilentQuotaExhaustion(balMs, rpcCalls, chainName);
    },
    
    /**
     * Get error statistics (v4.9.1 - enhanced, v4.9.2 - silent tracking)
     */
    getStats: function() {
      // Calculate error breakdown by type
      var typeBreakdown = {};
      for (var i = 0; i < _sessionErrors.length; i++) {
        var type = _sessionErrors[i].type || 'unknown';
        typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
      }
      
      return {
        quotaExhausted: _quotaExhausted,
        errorCount: _errorCount,
        weightedScore: _weightedErrorScore.toFixed(2),
        typeBreakdown: typeBreakdown,
        lastQuotaError: _lastQuotaError,
        recentErrors: _sessionErrors.slice(-10),
        // v4.9.2: Silent timeout tracking
        silentFailures: {
          consecutive: _consecutiveSilentFailures,
          total: _totalSilentFailures,
          lastTs: _lastSilentFailureTs
        }
      };
    },
    
    /**
     * Get weighted error score (v4.9.1)
     */
    getWeightedScore: function() {
      return _weightedErrorScore;
    },
    
    /**
     * Reset error state (use with caution)
     */
    reset: function() {
      _quotaExhausted = false;
      _lastQuotaError = null;
      _errorCount = 0;
      _weightedErrorScore = 0;
      _sessionErrors = [];
      // v4.9.2: Reset silent tracking
      _consecutiveSilentFailures = 0;
      _lastSilentFailureTs = 0;
      _totalSilentFailures = 0;
    },
    
    /**
     * Mark quota as exhausted manually
     */
    markQuotaExhausted: function() {
      _quotaExhausted = true;
      _lastQuotaError = { ts: Date.now(), source: "manual", msg: "Manually marked" };
    }
  };
})();

// ============================================================
// CACHE PROTECTION LAYER
// ============================================================

var CacheGuard = (function() {
  
  // Track protected saves
  var _blockedSaves = 0;
  var _allowedSaves = 0;
  
  /**
   * Check if a cache object has meaningful data
   * Returns true if the cache should be saved
   */
  function _hasValidData(cacheObj) {
    if (!cacheObj) return false;
    if (typeof cacheObj !== "object") return false;
    
    // Check for assets
    var assets = cacheObj.assets || cacheObj.a || [];
    if (Array.isArray(assets) && assets.length > 0) {
      return true;
    }
    
    // Check for price data
    var priceMap = cacheObj.priceMap || cacheObj.pm || {};
    if (typeof priceMap === "object" && Object.keys(priceMap).length > 0) {
      return true;
    }
    
    // Check for balance data
    var balanceMap = cacheObj.balanceTsMap || cacheObj.bt || {};
    if (typeof balanceMap === "object" && Object.keys(balanceMap).length > 0) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if a save operation should be allowed
   * v4.13.4 - CRITICAL FIX: No longer blocks ALL saves during quota exhaustion.
   * Previous behavior: blocked every save when quota exhausted, including saves of
   * valid data (checkpoints, fallback cache, metadata enrichment). This prevented
   * timestamp refresh in packed cache, causing entries to be evicted by prune,
   * leading to permanent "No cache available" for ~50 chains.
   * New behavior: During quota exhaustion, ALLOW saves of valid data (preserves
   * timestamps, prevents prune eviction). BLOCK only destructive saves (empty
   * overwriting valid).
   */
  function _shouldAllowSave(cacheObj, existingCache) {
    var newHasData = _hasValidData(cacheObj);
    var existingHasData = _hasValidData(existingCache);
    
    // ALWAYS block: empty data overwriting valid data (regardless of quota state)
    if (!newHasData && existingHasData) {
      Logger.log("[CacheGuard] BLOCKED save: would overwrite valid data with empty");
      _blockedSaves++;
      return false;
    }
    
    // During quota exhaustion: allow VALID saves, block EMPTY saves
    if (HttpErrorGuard.isQuotaExhausted()) {
      if (newHasData) {
        // ALLOW: saving valid data refreshes the packed cache timestamp,
        // preventing prune eviction. This is critical for cache survival.
        Logger.log("[CacheGuard] ALLOWED save during quota exhaustion: data is valid");
        _allowedSaves++;
        return true;
      } else if (!existingHasData) {
        // ALLOW: both empty, no harm done (new chain initialization etc.)
        _allowedSaves++;
        return true;
      } else {
        // BLOCK: empty save with existing valid data (already caught above, but safety net)
        Logger.log("[CacheGuard] BLOCKED save: quota exhausted and new data is empty");
        _blockedSaves++;
        return false;
      }
    }
    
    _allowedSaves++;
    return true;
  }
  
  return {
    
    /**
     * Check if cache data is valid/meaningful
     */
    hasValidData: function(cacheObj) {
      return _hasValidData(cacheObj);
    },
    
    /**
     * Check if a save should be allowed
     */
    shouldAllowSave: function(cacheObj, existingCache) {
      return _shouldAllowSave(cacheObj, existingCache);
    },
    
    /**
     * Get guard statistics
     */
    getStats: function() {
      return {
        blockedSaves: _blockedSaves,
        allowedSaves: _allowedSaves,
        quotaExhausted: HttpErrorGuard.isQuotaExhausted()
      };
    }
  };
})();

// ============================================================
// PATCH WALLET CACHE SAVE
// ============================================================

/**
 * Install cache protection patches
 * Call this after cache modules are loaded
 */
function INSTALL_CACHE_PROTECTION() {
  
  // v4.9.3: Idempotency guard - prevent double-patching WalletCache.save
  if (INSTALL_CACHE_PROTECTION._installed) return true;
  
  // Patch WalletCache.save if available
  if (typeof WalletCache !== "undefined" && WalletCache.save) {
    var _originalSave = WalletCache.save;
    
    WalletCache.save = function(walletAddr, cacheObj, config) {
      // Skip protection if disabled
      if (config && config.SKIP_CACHE_GUARD) {
        return _originalSave.call(WalletCache, walletAddr, cacheObj, config);
      }
      
      // Load existing cache to compare
      var existingCache = null;
      try {
        existingCache = WalletCache.load(walletAddr, null, config);
      } catch (e) {}
      
      // Check if save should be allowed
      if (!CacheGuard.shouldAllowSave(cacheObj, existingCache)) {
        Logger.log("[WalletCache.save] BLOCKED for " + String(walletAddr).substring(0, 10) + "...");
        return; // Don't save
      }
      
      // Proceed with original save
      return _originalSave.call(WalletCache, walletAddr, cacheObj, config);
    };
    
    Logger.log("[CACHE_PROTECTION] WalletCache.save patched");
  }
  
  // Patch Http methods to detect quota errors
  if (typeof Http !== "undefined") {
    
    // Patch Http.get
    if (Http.get) {
      var _originalGet = Http.get;
      Http.get = function(url, options, config) {
        try {
          return _originalGet.call(Http, url, options, config);
        } catch (e) {
          HttpErrorGuard.recordError(e, "Http.get");
          throw e;
        }
      };
    }
    
    // Patch Http.post
    if (Http.post) {
      var _originalPost = Http.post;
      Http.post = function(url, payload, options, config) {
        try {
          return _originalPost.call(Http, url, payload, options, config);
        } catch (e) {
          HttpErrorGuard.recordError(e, "Http.post");
          throw e;
        }
      };
    }
    
    // Patch Http.rpc
    if (Http.rpc) {
      var _originalRpc = Http.rpc;
      Http.rpc = function(url, method, params, id, config) {
        try {
          return _originalRpc.call(Http, url, method, params, id, config);
        } catch (e) {
          HttpErrorGuard.recordError(e, "Http.rpc");
          throw e;
        }
      };
    }
    
    // Patch Http.fetchAll
    if (Http.fetchAll) {
      var _originalFetchAll = Http.fetchAll;
      Http.fetchAll = function(requests, config) {
        try {
          return _originalFetchAll.call(Http, requests, config);
        } catch (e) {
          HttpErrorGuard.recordError(e, "Http.fetchAll");
          throw e;
        }
      };
    }
    
    Logger.log("[CACHE_PROTECTION] Http methods patched for error detection");
  }
  
  INSTALL_CACHE_PROTECTION._installed = true;
  return true;
}

// ============================================================
// DIAGNOSTIC FUNCTIONS
// ============================================================

/**
 * Get cache protection status
 * @returns {Array} 2D array for sheet display
 * @customfunction
 */
function GET_CACHE_GUARD_STATUS() {
  var httpStats = HttpErrorGuard.getStats();
  var cacheStats = CacheGuard.getStats();
  
  var rows = [
    ["Metric", "Value", "Details"],
    ["Quota Exhausted", httpStats.quotaExhausted ? "YES [WARNING]" : "NO ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“", ""],
    ["HTTP Errors", httpStats.errorCount, "This session"],
    ["Weighted Score", httpStats.weightedScore, "Higher = more severe"],
    ["Saves Blocked", cacheStats.blockedSaves, "Protected from overwrite"],
    ["Saves Allowed", cacheStats.allowedSaves, "Normal saves"],
    // v4.9.2: Silent timeout tracking
    ["", "", ""],
    ["Silent Timeout Detection", "", ""],
    ["Consecutive Silent Failures", httpStats.silentFailures.consecutive, "2+ = quota exhausted"],
    ["Total Silent Failures", httpStats.silentFailures.total, "This session"]
  ];
  
  if (httpStats.lastQuotaError) {
    rows.push(["Last Quota Error", httpStats.lastQuotaError.msg, httpStats.lastQuotaError.source]);
  }
  
  // Add error type breakdown
  if (httpStats.typeBreakdown && Object.keys(httpStats.typeBreakdown).length > 0) {
    rows.push(["", "", ""]);
    rows.push(["Error Types", "", ""]);
    for (var type in httpStats.typeBreakdown) {
      rows.push(["  " + type, httpStats.typeBreakdown[type], ""]);
    }
  }
  
  // Add recent errors
  if (httpStats.recentErrors && httpStats.recentErrors.length > 0) {
    rows.push(["", "", ""]);
    rows.push(["Recent Errors", "", ""]);
    for (var i = 0; i < Math.min(5, httpStats.recentErrors.length); i++) {
      var err = httpStats.recentErrors[httpStats.recentErrors.length - 1 - i];
      rows.push(["  " + err.source, err.msg.substring(0, 50), new Date(err.ts).toISOString()]);
    }
  }
  
  return rows;
}

/**
 * Check if system is in quota exhausted state
 * @returns {boolean}
 * @customfunction
 */
function IS_HTTP_QUOTA_EXHAUSTED() {
  return HttpErrorGuard.isQuotaExhausted();
}

/**
 * Manually mark quota as exhausted (emergency use)
 * @param {boolean} confirm - Must be TRUE
 * @returns {string}
 */
function MARK_QUOTA_EXHAUSTED(confirm) {
  if (confirm !== true) {
    return "Usage: MARK_QUOTA_EXHAUSTED(TRUE) - Blocks all cache saves until reset";
  }
  HttpErrorGuard.markQuotaExhausted();
  return "Quota marked as exhausted - cache saves will be blocked";
}

/**
 * Reset quota exhausted state (use after quota resets at midnight)
 * @param {boolean} confirm - Must be TRUE
 * @returns {string}
 */
function RESET_QUOTA_STATE(confirm) {
  if (confirm !== true) {
    return "Usage: RESET_QUOTA_STATE(TRUE) - Resets error tracking";
  }
  HttpErrorGuard.reset();
  return "Quota state reset - cache saves will be allowed";
}

// ============================================================
// AUTO-INSTALL ON LOAD
// ============================================================

// Auto-install protection when this file loads
// Uses a delayed approach to ensure other modules are loaded
(function() {
  try {
    // Check if we can install now
    if (typeof WalletCache !== "undefined" && typeof Http !== "undefined") {
      INSTALL_CACHE_PROTECTION();
    }
  } catch (e) {
    // Will be installed later via WCORE_INIT or manual call
  }
})();
