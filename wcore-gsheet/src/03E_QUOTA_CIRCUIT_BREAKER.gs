/************************************************************
 * 03E_QUOTA_CIRCUIT_BREAKER.gs - Instant Quota Detection
 *
 * v4.13.8 - CACHE WRITE GUARD: expose BudgetHTTP.remaining()
 *   Wallet cache writes can now refuse destructive updates when the rolling
 *   UrlFetch budget is critically low.
 *
 * v4.13.7 - ROLLING 24H WINDOW + HTTP COUNTER (A' + D)
 * Google Apps Script UrlFetch quota is NOT a calendar-midnight-UTC reset
 * but a 24h ROLLING window from the first request. Previous logic used
 * `parsed.date === _getTodayUTC()` to auto-clear the breaker, meaning
 * a breaker tripped at 23:59 UTC would clear at 00:00 UTC (60s later)
 * even though the real quota window extends ~24h after trip.
 * FIX: compare `nowMs - trippedMs < 24h` instead of calendar date.
 *
 * Also introduces HttpCounter: a 24-bucket hourly ring buffer in
 * ScriptProperties that tracks real UrlFetchApp volume via global
 * patch hooks. Exposed via @customfunction GET_HTTP_COUNT_LAST_24H()
 * so the sheet can display the true rolling-24h call count without
 * relying on Google's opaque quota counter.
 *
 * v4.13.6 - THRESHOLD TO PREVENT FALSE POSITIVES
 * Previously, a single error matching a quota pattern (e.g. a per-endpoint
 * burst bubbled up as "Service invoked too many times") tripped the
 * breaker and blocked ALL HTTP calls across ALL chains for 1h+, even
 * though the global Google quota was still available.
 *
 * Incident 2026-04-19: breaker tripped at 15:28 CEST, remained blocked
 * 2h17 (blocking ~17 refresh cycles across 117 chains). Manual reset
 * at 17:45 confirmed quota was available all along (test scan on Core
 * succeeded instantly with 5 HTTP calls).
 *
 * FIX: Require 3 quota errors within 120s before auto-tripping.
 * Isolated errors are logged but don't trip. QuotaCircuitBreaker.trip()
 * (manual/testing) still trips immediately.
 *
 * v4.13.5 - TEST COOLDOWN (15min between httpbin tests)
 * Instead of 1 HTTP test per wallet-chain execution (~119/cycle),
 * uses CacheService to skip tests if last successful test was < 15min.
 * When breaker is tripped, ALWAYS tests (to detect recovery).
 * Saves ~100-300 HTTP calls/day.
 *
 * v4.13.4 - BREAKER TTL REDUCED TO 1H
 * If no refresh runs for 1h+, the CacheService entry expires and
 * the next testOnce() makes a fresh HTTP test instead of staying
 * blocked on a stale flag.
 *
 * v4.12.31 - STICKY BREAKER AUTO-RECOVERY FIX
 * 
 * CRITICAL BUG FIXED:
 * Once the breaker tripped and was stored in CacheService (6h TTL),
 * testOnce() would read CacheService, find "tripped", and SKIP the
 * real HTTP test. This created a "sticky block" where chains using
 * QuotaCircuitBreaker (SVM, Cosmos) stayed blocked even after quota
 * recovered, while EVM (which doesn't check the breaker) worked fine.
 * 
 * FIX: testOnce() now ALWAYS makes a real HTTP test using the original
 * UrlFetchApp.fetch (bypassing the global patch). If the test succeeds,
 * the breaker is automatically cleared (auto-recovery).
 * 
 * v4.12.30 - INSTANT QUOTA EXHAUSTION DETECTION
 * 
 * PROBLEM SOLVED:
 * When Google's quota is exhausted, UrlFetchApp throws:
 *   "Service invoked too many times for one day: urlfetch"
 * 
 * But the error takes 10-20 seconds to appear (timeout), causing
 * "Exceeded maximum execution time" errors across all chains.
 * 
 * SOLUTION:
 * 1. Detect the quota error message on FIRST occurrence
 * 2. Immediately activate circuit breaker (stored in CacheService)
 * 3. ALL subsequent HTTP calls return null instantly (no wait)
 * 4. Functions return cached data with [QUOTA] indicator
 * 5. Circuit breaker auto-resets 24h after trip (rolling window, v4.13.7)
 * 
 * ARCHITECTURE:
 * - Patches UrlFetchApp.fetch and UrlFetchApp.fetchAll
 * - Uses CacheService for instant cross-execution persistence
 * - Integrates with existing Http module
 * - Zero-latency blocking once quota detected
 ************************************************************/

var QUOTA_CIRCUIT_BREAKER_VERSION = "4.13.8";

// v4.12.31: Store reference to ORIGINAL UrlFetchApp.fetch BEFORE any patching
// Needed by testOnce() to bypass the global quota patch for real testing
var _originalUrlFetch = UrlFetchApp.fetch;

// ============================================================
// CONFIGURATION
// ============================================================

var QUOTA_BREAKER_CONFIG = {
  // Cache key for circuit breaker state
  CACHE_KEY: "WCORE_QUOTA_EXHAUSTED_v1",
  
  // How long to keep circuit breaker active (seconds)
  // v4.13.4: Reduced from 6h to 1h - forces re-test if no refresh in 1h+
  // After 1h the CacheService entry expires, next testOnce() makes a fresh
  // HTTP test and auto-recovers if quota is available again.
  BREAKER_TTL_SECONDS: 3600,
  
  // v4.13.5: Cooldown between quota tests (seconds)
  // Avoids 1 httpbin.org call per execution (~119/cycle)
  TEST_COOLDOWN_KEY: "WCORE_QUOTA_TEST_OK_v1",
  TEST_COOLDOWN_SEC: 900,  // 15 minutes

  // Error message patterns that indicate quota exhaustion
  // v4.14.10: ONLY match actual Google Apps Script quota errors
  // Removed "rate limit exceeded" and "too many requests" — these are RPC 429 errors,
  // NOT Google quota exhaustion. A single RPC rate-limiting was tripping the breaker
  // and blocking ALL HTTP calls across ALL chains (false positive).
  QUOTA_ERROR_PATTERNS: [
    "Service invoked too many times for one day: urlfetch",
    "Service invoked too many times",
    "Quota exceeded for quota metric"
  ],

  // v4.13.6: Threshold to prevent false positives.
  // Require THRESHOLD_COUNT quota errors within THRESHOLD_WINDOW_SEC
  // before auto-tripping. A single isolated error is logged but
  // does NOT trip the breaker.
  ERROR_COUNT_KEY: "WCORE_QUOTA_ERRORS_v1",
  THRESHOLD_COUNT: 3,
  THRESHOLD_WINDOW_SEC: 120,

  // v4.13.7: Safety CEILING on how long the breaker stays tripped.
  // The real Google quota is a SLIDING 24h window — recovery happens
  // gradually as old calls drop off the tail, NOT at a fixed T+24h.
  // Actual recovery is driven by testOnce() (httpbin, every 15min)
  // which auto-resets the breaker as soon as Google accepts calls again.
  // This ceiling only exists to prevent a sticky block if testOnce() never
  // runs (e.g. no refresh cycles for >24h). It is NOT a promised reset time.
  TRIP_MAX_LOCKOUT_MS: 24 * 60 * 60 * 1000,

  // Log when circuit breaker triggers
  LOG_TRIGGERS: true
};

// ============================================================
// QUOTA CIRCUIT BREAKER
// ============================================================

var QuotaCircuitBreaker = (function() {
  
  // In-memory flag for instant checking (faster than cache lookup)
  var _tripped = false;
  var _checkedCache = false;
  var _tripTime = null;
  var _trippedMs = null;       // v4.13.7: Date.now() when breaker was tripped (rolling window)
  var _testedThisRun = false;  // v4.12.30: Only test once per execution
  var _forceNoTrip = false;    // v4.14.9: When true, prevents re-tripping this execution
  
  /**
   * Check if an error message indicates quota exhaustion
   */
  function _isQuotaError(errorMessage) {
    if (!errorMessage) return false;
    var msg = String(errorMessage).toLowerCase();
    
    for (var i = 0; i < QUOTA_BREAKER_CONFIG.QUOTA_ERROR_PATTERNS.length; i++) {
      if (msg.indexOf(QUOTA_BREAKER_CONFIG.QUOTA_ERROR_PATTERNS[i].toLowerCase()) !== -1) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Get today's date string (UTC) for reset detection
   */
  function _getTodayUTC() {
    var now = new Date();
    return now.toISOString().split('T')[0];
  }

  /**
   * v4.13.7: Format a date or ms timestamp in the spreadsheet's timezone
   * (e.g. "19/04/2026 19:16:00 CEST"). Falls back to ISO on failure.
   */
  function _fmtLocal(dateOrMs) {
    if (dateOrMs == null) return "unknown";
    try {
      var d = (dateOrMs instanceof Date) ? dateOrMs : new Date(dateOrMs);
      if (isNaN(d.getTime())) return "unknown";
      var tz = Session.getScriptTimeZone() || "Europe/Paris";
      return Utilities.formatDate(d, tz, "dd/MM/yyyy HH:mm:ss z");
    } catch (e) {
      try { return new Date(dateOrMs).toISOString(); } catch (e2) { return "unknown"; }
    }
  }
  
  /**
   * Check if circuit breaker is currently active
   * Uses in-memory flag first, then cache lookup
   */
  function _isTripped() {
    // Fast path: already know it's tripped this execution
    if (_tripped) return true;
    
    // Check cache only once per execution
    if (!_checkedCache) {
      _checkedCache = true;
      try {
        var cache = CacheService.getScriptCache();
        var data = cache.get(QUOTA_BREAKER_CONFIG.CACHE_KEY);
        if (data) {
          var parsed = JSON.parse(data);
          // v4.13.7: Sliding 24h window — NOT calendar-midnight-UTC.
          // Actual recovery is driven by testOnce() (httpbin every 15min).
          // TRIP_MAX_LOCKOUT_MS is just a safety ceiling to avoid sticky blocks
          // if no refresh cycles run for >24h (testOnce would never fire).
          var trippedMs = (typeof parsed.trippedMs === "number") ? parsed.trippedMs : null;
          if (trippedMs == null && parsed.time) {
            // Back-compat: parse ISO time for older breaker payloads
            var t = Date.parse(parsed.time);
            if (!isNaN(t)) trippedMs = t;
          }
          var nowMs = Date.now();
          if (trippedMs != null && (nowMs - trippedMs) < QUOTA_BREAKER_CONFIG.TRIP_MAX_LOCKOUT_MS) {
            _tripped = true;
            _tripTime = parsed.time;
            _trippedMs = trippedMs;
            return true;
          }
          // Expired (rolling window elapsed) — clear stale breaker
          cache.remove(QUOTA_BREAKER_CONFIG.CACHE_KEY);
        }
      } catch (e) {
        // Cache error - assume not tripped
      }
    }

    return _tripped;
  }
  
  /**
   * Trip the circuit breaker
   */
  function _trip(errorMessage) {
    if (_tripped) return; // Already tripped
    if (_forceNoTrip) return; // v4.14.9: forceFull prevents re-tripping
    
    _tripped = true;
    var nowMs = Date.now();
    _trippedMs = nowMs;
    _tripTime = new Date(nowMs).toISOString();

    var data = {
      date: _getTodayUTC(),          // informational (for diagnostics)
      time: _tripTime,               // ISO timestamp of trip
      trippedMs: nowMs,              // v4.13.7: rolling-window anchor
      error: String(errorMessage || "Unknown quota error").substring(0, 200)
    };
    
    try {
      var cache = CacheService.getScriptCache();
      cache.put(
        QUOTA_BREAKER_CONFIG.CACHE_KEY, 
        JSON.stringify(data), 
        QUOTA_BREAKER_CONFIG.BREAKER_TTL_SECONDS
      );
      
      if (QUOTA_BREAKER_CONFIG.LOG_TRIGGERS) {
        Logger.log("[QUOTA_BREAKER] TRIPPED! All HTTP calls will be blocked. Error: " + data.error);
      }
    } catch (e) {
      // Cache write failed - memory flag still works for this execution
      Logger.log("[QUOTA_BREAKER] Cache write failed: " + e.message);
    }
  }
  
  /**
   * Reset the circuit breaker (manual reset)
   */
  function _reset() {
    _tripped = false;
    _checkedCache = false;
    _tripTime = null;
    _trippedMs = null;
    _testedThisRun = false;

    try {
      var cache = CacheService.getScriptCache();
      cache.remove(QUOTA_BREAKER_CONFIG.CACHE_KEY);
      // v4.14.9: Also clear cooldown key so next testOnce() makes a real test
      cache.remove(QUOTA_BREAKER_CONFIG.TEST_COOLDOWN_KEY);
      // v4.13.6: Also clear error counter so threshold starts fresh
      cache.remove(QUOTA_BREAKER_CONFIG.ERROR_COUNT_KEY);
      Logger.log("[QUOTA_BREAKER] Reset OK");
    } catch (e) {
      Logger.log("[QUOTA_BREAKER] Reset cache error: " + e.message);
    }
  }

  /**
   * v4.13.6: Track a quota-pattern error and trip ONLY if the threshold
   * (N errors within W seconds) is reached. A single isolated error
   * is logged but does NOT trip the breaker.
   *
   * Why: before v4.13.6, _trip() fired on the first matching error.
   * A transient burst on one endpoint (or a non-global rate-limit that
   * happened to match "Service invoked too many times") blocked ALL
   * HTTP calls across ALL chains for 1h+.
   *
   * Incident 2026-04-19: blocked 2h17 while Google quota was still available.
   *
   * Returns true if the breaker was tripped by this call.
   */
  function _trackErrorAndMaybeTrip(errorMessage) {
    if (_forceNoTrip) return false;
    if (_tripped) return true;

    var nowMs = Date.now();
    var windowMs = QUOTA_BREAKER_CONFIG.THRESHOLD_WINDOW_SEC * 1000;
    var arr = [];

    try {
      var cache = CacheService.getScriptCache();
      var raw = cache.get(QUOTA_BREAKER_CONFIG.ERROR_COUNT_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) arr = parsed;
      }

      // Keep only timestamps within the window
      var fresh = [];
      for (var i = 0; i < arr.length; i++) {
        if ((nowMs - arr[i]) < windowMs) fresh.push(arr[i]);
      }
      fresh.push(nowMs);
      if (fresh.length > 10) fresh = fresh.slice(-10);

      cache.put(
        QUOTA_BREAKER_CONFIG.ERROR_COUNT_KEY,
        JSON.stringify(fresh),
        600  // 10min TTL (auto-cleared by CacheService after quiet window)
      );

      if (fresh.length >= QUOTA_BREAKER_CONFIG.THRESHOLD_COUNT) {
        Logger.log("[QUOTA_BREAKER] Threshold reached (" + fresh.length +
                   " quota errors in " + QUOTA_BREAKER_CONFIG.THRESHOLD_WINDOW_SEC +
                   "s) - TRIPPING");
        _trip(errorMessage);
        return true;
      }

      if (QUOTA_BREAKER_CONFIG.LOG_TRIGGERS) {
        Logger.log("[QUOTA_BREAKER] Quota error " + fresh.length + "/" +
                   QUOTA_BREAKER_CONFIG.THRESHOLD_COUNT + " within " +
                   QUOTA_BREAKER_CONFIG.THRESHOLD_WINDOW_SEC + "s - NOT tripping yet: " +
                   String(errorMessage || "").substring(0, 100));
      }
      return false;

    } catch (e) {
      // Cache failure: fall back to immediate trip (fail-safe)
      Logger.log("[QUOTA_BREAKER] Threshold tracker failed, fallback to immediate trip: " + e.message);
      _trip(errorMessage);
      return true;
    }
  }
  
  /**
   * v4.12.31: TEST the quota with a real HTTP call
   * Runs ONCE per execution (first call)
   * 
   * CRITICAL FIX (v4.12.31): Previously, if the breaker was tripped in CacheService,
   * testOnce() would SKIP the real HTTP test, creating a "sticky block" that persisted
   * even after quota recovered. Now testOnce() ALWAYS tests and auto-recovers.
   */
  function _testQuotaOnce() {
    // Already tested this execution? Skip
    if (_testedThisRun) return;
    _testedThisRun = true;

    // v4.12.31: Check if breaker is tripped from CacheService (for logging only)
    var wasTrippedInCache = false;
    if (!_tripped && !_checkedCache) {
      wasTrippedInCache = _isTripped();
    }

    // v4.13.5: COOLDOWN - skip HTTP test if quota was OK recently
    // Only when breaker is NOT tripped (when tripped, ALWAYS test to detect recovery)
    if (!_tripped && !wasTrippedInCache) {
      try {
        var cooldownCache = CacheService.getScriptCache();
        var lastOk = cooldownCache.get(QUOTA_BREAKER_CONFIG.TEST_COOLDOWN_KEY);
        if (lastOk) {
          // Quota was OK within last 15 min - skip test
          return;
        }
      } catch (e) {
        // Cache error - proceed with test to be safe
      }
    }

    // Make a lightweight test call - ALWAYS when tripped (to detect recovery)
    // v4.12.31: Use _originalUrlFetch to bypass global quota patch
    try {
      var testUrl = "https://httpbin.org/status/200";
      var response = _originalUrlFetch.call(UrlFetchApp, testUrl, {
        muteHttpExceptions: true,
        timeout: 3000  // 3 second timeout max
      });

      // If we get here, quota is OK!
      // v4.13.5: Store successful test timestamp for cooldown
      try {
        var cooldownCache2 = CacheService.getScriptCache();
        cooldownCache2.put(QUOTA_BREAKER_CONFIG.TEST_COOLDOWN_KEY, "1", QUOTA_BREAKER_CONFIG.TEST_COOLDOWN_SEC);
      } catch (e2) {}

      if (wasTrippedInCache || _tripped) {
        // Auto-recover: quota was blocked but is now available again
        Logger.log("[QUOTA_BREAKER] Quota RECOVERED - clearing breaker (was tripped in cache)");
        _reset();
      } else {
        if (QUOTA_BREAKER_CONFIG.LOG_TRIGGERS) {
          Logger.log("[QUOTA_BREAKER] Quota test OK - HTTP calls allowed");
        }
      }

    } catch (e) {
      // Check if this is the quota error
      if (_isQuotaError(e.message)) {
        _trip(e.message);
        Logger.log("[QUOTA_BREAKER] Quota test FAILED - quota exhausted: " + e.message);
      } else {
        // Other error (network, etc.) - don't trip, but log
        // v4.12.31: Also don't maintain a stale trip from cache on non-quota errors
        if (wasTrippedInCache) {
          Logger.log("[QUOTA_BREAKER] Non-quota error during test, clearing stale breaker: " + e.message);
          _reset();
        } else {
          Logger.log("[QUOTA_BREAKER] Quota test error (not quota): " + e.message);
        }
      }
    }
  }
  
  // ============================================================
  // PUBLIC API
  // ============================================================
  
  return {
    /**
     * Check if circuit breaker is active (quota exhausted)
     * @returns {boolean}
     */
    isTripped: function() {
      return _isTripped();
    },
    
    /**
     * Handle an error and check if it's a quota error
     * If quota error detected, trips the circuit breaker
     * @param {Error|string} error - The error to check
     * @returns {boolean} True if this was a quota error
     */
    handleError: function(error) {
      var msg = error && error.message ? error.message : String(error);
      if (_isQuotaError(msg)) {
        // v4.13.6: Use threshold tracker instead of immediate trip.
        // Prevents an isolated burst error from blocking ALL chains for 1h+.
        return _trackErrorAndMaybeTrip(msg);
      }
      return false;
    },
    
    /**
     * Manually trip the circuit breaker
     * @param {string} reason - Reason for tripping
     */
    trip: function(reason) {
      _trip(reason || "Manual trip");
    },
    
    /**
     * Reset the circuit breaker
     */
    reset: function() {
      _reset();
    },
    
    /**
     * Get current status
     * @returns {Object}
     */
    getStatus: function() {
      var tripped = _isTripped();
      // maxClearAt is the SAFETY CEILING, not a promised reset time.
      // Real recovery = testOnce() finding httpbin OK (sliding window).
      var maxClearAt = null;
      var trippedLocal = null;
      var maxClearAtLocal = null;
      if (tripped && _trippedMs != null) {
        maxClearAt = new Date(_trippedMs + QUOTA_BREAKER_CONFIG.TRIP_MAX_LOCKOUT_MS).toISOString();
        trippedLocal = _fmtLocal(_trippedMs);
        maxClearAtLocal = _fmtLocal(_trippedMs + QUOTA_BREAKER_CONFIG.TRIP_MAX_LOCKOUT_MS);
      }
      return {
        tripped: tripped,
        tripTime: _tripTime,               // ISO UTC (machine-readable)
        trippedMs: _trippedMs,
        trippedLocal: trippedLocal,        // v4.13.7: human, spreadsheet TZ
        maxClearAt: maxClearAt,            // ISO UTC (machine-readable)
        maxClearAtLocal: maxClearAtLocal,  // v4.13.7: human, spreadsheet TZ
        date: _getTodayUTC(),
        message: tripped
          ? "QUOTA EXHAUSTED - auto-recovery when httpbin test passes (every 15min)"
          : "OK - HTTP calls allowed"
      };
    },
    
    /**
     * v4.12.30: Test quota with a real HTTP call (runs once per execution)
     * Call this at the START of your main function to detect quota early
     * @returns {boolean} True if quota is OK, false if exhausted
     */
    testOnce: function() {
      _testQuotaOnce();
      return !_tripped;
    },

    /**
     * v4.14.9: Prevent re-tripping for this execution.
     * Used by forceFull scans — once testOnce() confirms quota OK,
     * prevent a single RPC error from re-blocking the entire scan.
     */
    disableTripping: function() {
      _forceNoTrip = true;
    }
  };
})();

// ============================================================
// HTTP COUNTER — 24h ROLLING WINDOW (v4.13.7 / Phase A')
// ============================================================

/**
 * Persistent rolling-24h HTTP call counter.
 *
 * Stores hourly buckets { "<hourEpoch>": count } in ScriptProperties.
 * Keeps the last 24 buckets; older ones are purged on each record.
 * Tiny footprint (~400 bytes) so writes stay cheap even on every call.
 *
 * Observability-only: record(n) is called from the global UrlFetchApp
 * patches below, so every real UrlFetchApp.fetch/fetchAll is counted
 * EXCEPT the internal httpbin test call (which uses _originalUrlFetch
 * to bypass the patch on purpose).
 *
 * Exposed via @customfunction GET_HTTP_COUNT_LAST_24H() for the sheet.
 */
var HttpCounter = (function() {
  var KEY = "WCORE_HTTP_BUCKETS_v1";
  var BUCKET_MS = 60 * 60 * 1000;  // 1h granularity
  var WINDOWS = 24;                // last 24 buckets = rolling 24h

  var _cache = null;
  var _loaded = false;

  function _loadRaw() {
    try {
      var raw = PropertiesService.getScriptProperties().getProperty(KEY);
      if (!raw) return {};
      var obj = JSON.parse(raw);
      return (obj && typeof obj === "object") ? obj : {};
    } catch (e) {
      return {};
    }
  }

  function _save(obj) {
    try {
      PropertiesService.getScriptProperties().setProperty(KEY, JSON.stringify(obj));
    } catch (e) {
      // swallow — observability must never break HTTP path
    }
  }

  function _purge(obj, nowMs) {
    var cutoffBucket = Math.floor((nowMs - WINDOWS * BUCKET_MS) / BUCKET_MS);
    var out = {};
    for (var k in obj) {
      if (!obj.hasOwnProperty(k)) continue;
      var b = parseInt(k, 10);
      if (!isNaN(b) && b > cutoffBucket) out[k] = obj[k];
    }
    return out;
  }

  function _ensure(nowMs) {
    if (_loaded) return;
    _cache = _purge(_loadRaw(), nowMs);
    _loaded = true;
  }

  function _sum(obj) {
    var total = 0;
    for (var k in obj) {
      if (obj.hasOwnProperty(k)) total += (parseInt(obj[k], 10) || 0);
    }
    return total;
  }

  return {
    record: function(n) {
      var inc = parseInt(n, 10) || 0;
      if (inc < 1) return;
      try {
        var nowMs = Date.now();
        _ensure(nowMs);
        var bucket = String(Math.floor(nowMs / BUCKET_MS));
        _cache[bucket] = (parseInt(_cache[bucket], 10) || 0) + inc;
        _save(_cache);
      } catch (e) {
        // Never fail an HTTP call due to counter errors
      }
    },

    count: function() {
      try {
        var nowMs = Date.now();
        var obj = _purge(_loadRaw(), nowMs);
        return _sum(obj);
      } catch (e) {
        return 0;
      }
    },

    reset: function() {
      try {
        PropertiesService.getScriptProperties().deleteProperty(KEY);
      } catch (e) {}
      _cache = null;
      _loaded = false;
    },

    buckets: function() {
      var nowMs = Date.now();
      return _purge(_loadRaw(), nowMs);
    }
  };
})();

var BudgetHTTP = BudgetHTTP || (function() {
  var DAILY_LIMIT = 20000;
  var CRITICAL_REMAINING = 100;
  var CATEGORY_MIN_REMAINING = {
    activity: 500,
    balance: 1000,
    pricing: 2000,
    admin: 5000,
    recovery: 100,
    diagnostic: 5000,
    other: 1000
  };
  var adminMinRemaining = CATEGORY_MIN_REMAINING.admin;

  function _count() {
    try {
      if (typeof HttpCounter !== 'undefined' && HttpCounter.count) return HttpCounter.count();
    } catch (e) {}
    return 0;
  }

  function categoryForReason(reason) {
    var r = String(reason || "other").toLowerCase();
    if (r.indexOf("dynamic-rpc") >= 0 || r.indexOf("admin") >= 0 || r.indexOf("chainlist") >= 0) return "admin";
    if (r.indexOf("price") >= 0 || r.indexOf("llama") >= 0 || r.indexOf("gt-") >= 0 || r.indexOf("gecko") >= 0 || r.indexOf("dex") >= 0 || r.indexOf("jup") >= 0) return "pricing";
    if (r.indexOf("activity") >= 0 || r.indexOf("nonce") >= 0 || r.indexOf("signature") >= 0 || r.indexOf("sequence") >= 0) return "activity";
    if (r.indexOf("balance") >= 0 || r.indexOf("rpc") >= 0 || r.indexOf("eth_call") >= 0 || r.indexOf("fetchall") >= 0 || r.indexOf("post") >= 0) return "balance";
    if (r.indexOf("recover") >= 0 || r.indexOf("quota") >= 0) return "recovery";
    if (r.indexOf("diag") >= 0 || r.indexOf("test") >= 0 || r.indexOf("latency") >= 0) return "diagnostic";
    return "other";
  }

  return {
    categoryForReason: categoryForReason,
    adminMinRemaining: adminMinRemaining,

    limit: function() {
      return DAILY_LIMIT;
    },

    used: function() {
      return _count();
    },

    remaining: function() {
      return Math.max(0, DAILY_LIMIT - _count());
    },

    isCritical: function(threshold) {
      var min = (threshold != null && isFinite(threshold)) ? (threshold | 0) : CRITICAL_REMAINING;
      return this.remaining() < min;
    },

    allow: function(categoryOrReason) {
      var category = categoryForReason(categoryOrReason);
      var min = CATEGORY_MIN_REMAINING[category] || CATEGORY_MIN_REMAINING.other;
      if (this.remaining() < min) return false;
      return true;
    },

    status: function() {
      var used = _count();
      var remaining = Math.max(0, DAILY_LIMIT - used);
      return {
        limit: DAILY_LIMIT,
        used: used,
        remaining: remaining,
        criticalThreshold: CRITICAL_REMAINING,
        critical: remaining < CRITICAL_REMAINING,
        adminMinRemaining: adminMinRemaining
      };
    }
  };
})();

var WcoreHttpMode = WcoreHttpMode || (function() {
  var KEY = "WCORE_HTTP_MODE";
  var MODES = { "CACHE_ONLY": true, "NORMAL": true, "RECOVERY": true, "ADMIN": true };
  var AUTO_RECOVERY_REMAINING = 2500;
  var AUTO_CACHE_ONLY_REMAINING = 100;

  function _normalize(mode) {
    var m = String(mode || "NORMAL").trim().toUpperCase();
    return MODES[m] ? m : "NORMAL";
  }

  function _getManualMode() {
    try {
      var raw = PropertiesService.getScriptProperties().getProperty(KEY);
      return raw ? _normalize(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function _autoMode() {
    try {
      if (typeof QuotaCircuitBreaker !== "undefined" &&
          QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped()) return "CACHE_ONLY";
    } catch (eQ) {}
    try {
      if (typeof HttpErrorGuard !== "undefined" &&
          HttpErrorGuard.isQuotaExhausted && HttpErrorGuard.isQuotaExhausted()) return "CACHE_ONLY";
    } catch (eG) {}
    try {
      if (typeof BudgetHTTP !== "undefined" && BudgetHTTP.remaining) {
        var remaining = BudgetHTTP.remaining();
        if (remaining < AUTO_CACHE_ONLY_REMAINING) return "CACHE_ONLY";
        if (remaining < AUTO_RECOVERY_REMAINING) return "RECOVERY";
      }
    } catch (eB) {}
    return "NORMAL";
  }

  function _getEffectiveMode() {
    var auto = _autoMode();
    var manual = _getManualMode();
    if (auto !== "NORMAL") return auto;
    return manual || auto;
  }

  function _isAllowed(categoryOrReason) {
    var mode = _getEffectiveMode();
    var category = (typeof BudgetHTTP !== "undefined" && BudgetHTTP.categoryForReason)
      ? BudgetHTTP.categoryForReason(categoryOrReason)
      : String(categoryOrReason || "other").toLowerCase();
    if (mode === "NORMAL") return true;
    if (mode === "CACHE_ONLY") return false;
    if (mode === "RECOVERY") return category === "recovery" || category === "activity" || category === "balance";
    if (mode === "ADMIN") return category === "admin" || category === "diagnostic" || category === "recovery";
    return true;
  }

  return {
    getMode: _getEffectiveMode,
    getEffectiveMode: _getEffectiveMode,
    getManualMode: _getManualMode,
    autoMode: _autoMode,
    normalize: _normalize,
    isAllowed: _isAllowed,
    setMode: function(mode) {
      var m = _normalize(mode);
      PropertiesService.getScriptProperties().setProperty(KEY, m);
      return m;
    },
    clear: function() {
      PropertiesService.getScriptProperties().deleteProperty(KEY);
      return _getEffectiveMode();
    },
    status: function() {
      var manualMode = _getManualMode();
      return {
        mode: _getEffectiveMode(),
        effectiveMode: _getEffectiveMode(),
        manualMode: manualMode || "AUTO",
        autoMode: _autoMode(),
        autoRecoveryRemaining: AUTO_RECOVERY_REMAINING,
        autoCacheOnlyRemaining: AUTO_CACHE_ONLY_REMAINING,
        key: KEY
      };
    }
  };
})();

function SET_WCORE_HTTP_MODE(mode, confirm) {
  if (confirm !== true) return "Usage: SET_WCORE_HTTP_MODE(\"CACHE_ONLY|NORMAL|RECOVERY|ADMIN\", TRUE)";
  return "WCORE_HTTP_MODE=" + WcoreHttpMode.setMode(mode);
}

function WCORE_HTTP_MODE_STATUS() {
  var st = WcoreHttpMode.status();
  var budget = (typeof BudgetHTTP !== "undefined" && BudgetHTTP.status) ? BudgetHTTP.status() : {};
  return [
    ["WCORE_HTTP_MODE", st.effectiveMode || st.mode],
    ["Manual override", st.manualMode],
    ["Auto mode", st.autoMode],
    ["HTTP remaining", budget.remaining || ""],
    ["HTTP used", budget.used || ""],
    ["Auto recovery below", st.autoRecoveryRemaining],
    ["Auto cache-only below", st.autoCacheOnlyRemaining],
    ["Admin min remaining", budget.adminMinRemaining || ""]
  ];
}

// ============================================================
// SAFE FETCH WRAPPERS (with circuit breaker)
// ============================================================

/**
 * Safe fetch that checks circuit breaker first
 * Returns null immediately if quota exhausted
 */
function _safeFetch(url, options) {
  // Check circuit breaker FIRST (instant, no network call)
  if (QuotaCircuitBreaker.isTripped()) {
    return null;
  }
  
  try {
    return UrlFetchApp.fetch(url, options);
  } catch (e) {
    // Check if this is a quota error
    if (QuotaCircuitBreaker.handleError(e)) {
      // Quota error - return null, breaker is now tripped
      return null;
    }
    // Other error - rethrow
    throw e;
  }
}

/**
 * Safe fetchAll that checks circuit breaker first
 * Returns array of nulls immediately if quota exhausted
 */
function _safeFetchAll(requests) {
  // Check circuit breaker FIRST
  if (QuotaCircuitBreaker.isTripped()) {
    var nullResults = [];
    for (var i = 0; i < (requests ? requests.length : 0); i++) {
      nullResults.push(null);
    }
    return nullResults;
  }
  
  try {
    return UrlFetchApp.fetchAll(requests);
  } catch (e) {
    // Check if this is a quota error
    if (QuotaCircuitBreaker.handleError(e)) {
      // Return nulls for all requests
      var nulls = [];
      for (var j = 0; j < (requests ? requests.length : 0); j++) {
        nulls.push(null);
      }
      return nulls;
    }
    // Other error - rethrow
    throw e;
  }
}

// ============================================================
// PATCH HTTP MODULE
// ============================================================

/**
 * Patch the Http module to use circuit breaker
 * Call this after 03_HTTP.gs loads
 */
function INSTALL_QUOTA_CIRCUIT_BREAKER() {
  if (typeof Http === 'undefined') {
    Logger.log("[QUOTA_BREAKER] Http module not found - skipping patch");
    return false;
  }
  
  // Store original methods
  var _originalGet = Http.get;
  var _originalPost = Http.post;
  var _originalFetchAll = Http.fetchAll;
  var _originalFetchAllSafe = Http.fetchAllSafe;
  var _originalFetchWithRetry = Http.fetchWithRetry;
  
  // Patch Http.get
  Http.get = function(url, options, config) {
    if (QuotaCircuitBreaker.isTripped()) {
      return null;
    }
    try {
      return _originalGet.call(Http, url, options, config);
    } catch (e) {
      if (QuotaCircuitBreaker.handleError(e)) {
        return null;
      }
      throw e;
    }
  };
  
  // Patch Http.post
  Http.post = function(url, payload, options, config) {
    if (QuotaCircuitBreaker.isTripped()) {
      return null;
    }
    try {
      return _originalPost.call(Http, url, payload, options, config);
    } catch (e) {
      if (QuotaCircuitBreaker.handleError(e)) {
        return null;
      }
      throw e;
    }
  };
  
  // Patch Http.fetchAll
  Http.fetchAll = function(requests, config) {
    if (QuotaCircuitBreaker.isTripped()) {
      var nulls = [];
      for (var i = 0; i < (requests ? requests.length : 0); i++) {
        nulls.push(null);
      }
      return nulls;
    }
    try {
      return _originalFetchAll.call(Http, requests, config);
    } catch (e) {
      if (QuotaCircuitBreaker.handleError(e)) {
        var nullResults = [];
        for (var j = 0; j < (requests ? requests.length : 0); j++) {
          nullResults.push(null);
        }
        return nullResults;
      }
      throw e;
    }
  };
  
  // Patch Http.fetchAllSafe
  Http.fetchAllSafe = function(requests, config) {
    if (QuotaCircuitBreaker.isTripped()) {
      var nulls = [];
      for (var i = 0; i < (requests ? requests.length : 0); i++) {
        nulls.push(null);
      }
      return nulls;
    }
    try {
      return _originalFetchAllSafe.call(Http, requests, config);
    } catch (e) {
      if (QuotaCircuitBreaker.handleError(e)) {
        var nullResults = [];
        for (var j = 0; j < (requests ? requests.length : 0); j++) {
          nullResults.push(null);
        }
        return nullResults;
      }
      throw e;
    }
  };
  
  // Patch Http.fetchWithRetry
  Http.fetchWithRetry = function(url, options, config, timer) {
    if (QuotaCircuitBreaker.isTripped()) {
      return null;
    }
    try {
      return _originalFetchWithRetry.call(Http, url, options, config, timer);
    } catch (e) {
      if (QuotaCircuitBreaker.handleError(e)) {
        return null;
      }
      throw e;
    }
  };
  
  Logger.log("[QUOTA_BREAKER] Http module patched - circuit breaker active");
  return true;
}

/**
 * Patch UrlFetchApp globally (catches calls that bypass Http module)
 */
function INSTALL_GLOBAL_QUOTA_BREAKER() {
  // Check if already patched
  if (UrlFetchApp._quotaBreakerPatched) {
    return true;
  }
  
  // Store originals
  var _origFetch = UrlFetchApp.fetch;
  var _origFetchAll = UrlFetchApp.fetchAll;
  _WCORE_ORIG_FETCH = _origFetch;
  _WCORE_ORIG_FETCH_ALL = _origFetchAll;
  
  // Patch fetch
  UrlFetchApp.fetch = function(url, options) {
    if (QuotaCircuitBreaker.isTripped()) {
      // Return a fake response-like object that returns null
      // Or throw a controlled error
      return null;
    }
    // v4.13.7: observability — count BEFORE the call so failed calls still count
    try { HttpCounter.record(1); } catch (e) {}
    try {
      return _origFetch.call(UrlFetchApp, url, options);
    } catch (e) {
      QuotaCircuitBreaker.handleError(e);
      throw e;
    }
  };

  // Patch fetchAll
  UrlFetchApp.fetchAll = function(requests) {
    if (QuotaCircuitBreaker.isTripped()) {
      var nulls = [];
      for (var i = 0; i < (requests ? requests.length : 0); i++) {
        nulls.push(null);
      }
      return nulls;
    }
    // v4.13.7: observability — 1 call per request in the batch
    try { HttpCounter.record(requests ? requests.length : 0); } catch (e) {}
    try {
      return _origFetchAll.call(UrlFetchApp, requests);
    } catch (e) {
      QuotaCircuitBreaker.handleError(e);
      throw e;
    }
  };
  
  UrlFetchApp._quotaBreakerPatched = true;
  Logger.log("[QUOTA_BREAKER] Global UrlFetchApp patched");
  return true;
}

// ============================================================
// DIAGNOSTIC FUNCTIONS
// ============================================================

/**
 * Get circuit breaker status
 * @returns {Array} For sheet display
 * @customfunction
 */
function GET_QUOTA_BREAKER_STATUS() {
  var status = QuotaCircuitBreaker.getStatus();

  return [
    ["Quota Circuit Breaker", ""],
    ["Status", status.tripped ? "TRIPPED (blocked)" : "OK (active)"],
    ["Date", status.date],
    ["Trip Time", status.trippedLocal || status.tripTime || "N/A"],
    ["Max Lockout (ceiling)", status.maxClearAtLocal || "N/A"],
    ["Message", status.message]
  ];
}

/**
 * Test if quota is currently exhausted
 * @returns {boolean}
 * @customfunction
 */
function IS_QUOTA_EXHAUSTED() {
  var breakerTripped = QuotaCircuitBreaker.isTripped();
  var httpGuardTripped = false;
  try {
    httpGuardTripped = (typeof HttpErrorGuard !== 'undefined' &&
      HttpErrorGuard.isQuotaExhausted &&
      HttpErrorGuard.isQuotaExhausted());
  } catch (e) {}
  return !!(breakerTripped || httpGuardTripped);
}

/**
 * Manually reset the circuit breaker
 * Use once the rolling 24h window has elapsed since trip (v4.13.7).
 * @param {boolean} confirm - Must be TRUE
 * @returns {string}
 */
function RESET_QUOTA_BREAKER(confirm) {
  if (confirm !== true) {
    return "Usage: =RESET_QUOTA_BREAKER(TRUE) - Resets the quota circuit breaker";
  }
  
  QuotaCircuitBreaker.reset();
  
  return "Quota circuit breaker reset OK. HTTP calls are now allowed.";
}

/**
 * Manually trip the circuit breaker (for testing)
 * @param {boolean} confirm - Must be TRUE
 * @returns {string}
 */
function TRIP_QUOTA_BREAKER(confirm) {
  if (confirm !== true) {
    return "Usage: =TRIP_QUOTA_BREAKER(TRUE) - Manually trips the circuit breaker";
  }
  
  QuotaCircuitBreaker.trip("Manual trip for testing");
  return "Circuit breaker tripped. All HTTP calls will return null.";
}

/**
 * v4.12.30: Test if quota is available with a REAL HTTP call
 * Use this to check quota status before starting heavy operations
 * @returns {string} "OK" if quota available, "EXHAUSTED" if not
 * @customfunction
 */
function TEST_QUOTA_NOW() {
  var isOk = QuotaCircuitBreaker.testOnce();
  var status = QuotaCircuitBreaker.getStatus();

  // v4.13.7: format in the spreadsheet's timezone (human-readable)
  var tz = Session.getScriptTimeZone() || "Europe/Paris";
  var nowLocal = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm:ss z");

  if (isOk) {
    return "OK - Quota available (tested at " + nowLocal + ")";
  } else {
    // Sliding 24h window — no fixed reset time. Recovery is driven by
    // testOnce() (httpbin every 15min), not a T+24h timer.
    return "EXHAUSTED - tripped at " + (status.trippedLocal || "unknown") +
           " - auto-recovery via httpbin every 15min (ceiling: " +
           (status.maxClearAtLocal || "unknown") + ")";
  }
}

/**
 * v4.13.7: Rolling-24h HTTP call count (from internal HttpCounter).
 * Counts every UrlFetchApp.fetch / fetchAll routed through the global
 * patch — i.e. the real call volume WCORE is sending. Excludes the
 * internal httpbin breaker test (uses _originalUrlFetch on purpose).
 *
 * @returns {number} Calls in the last 24h
 * @customfunction
 */
function GET_HTTP_COUNT_LAST_24H() {
  try {
    return HttpCounter.count();
  } catch (e) {
    return -1;
  }
}

/**
 * v4.13.7: Reset the HTTP counter (clears all buckets).
 * For debugging only — quota is Google-side, resetting this counter
 * does NOT affect the actual quota.
 *
 * @param {boolean} confirm - Must be TRUE
 * @returns {string}
 */
function RESET_HTTP_COUNTER(confirm) {
  if (confirm !== true) {
    return "Usage: =RESET_HTTP_COUNTER(TRUE) - Clears the local HTTP counter (does NOT reset Google quota)";
  }
  HttpCounter.reset();
  return "HTTP counter reset OK at " + new Date().toISOString();
}

// ============================================================
// EARLY RETURN HELPER FOR ENGINE FUNCTIONS
// ============================================================

/**
 * Check if quota is exhausted and return cached data immediately
 * Call this at the START of getWalletAssets functions
 * 
 * @param {string} address - Wallet address
 * @param {Object} config - Chain configuration
 * @param {string} chainName - Display name for chain
 * @param {string} engineType - "EVM", "SVM", or "COSMOS"
 * @returns {Array|null} - Returns cached output with [QUOTA] if exhausted, null otherwise
 */
function checkQuotaAndReturnCache(address, config, chainName, engineType) {
  // If quota is not exhausted, return null to continue normal flow
  if (!QuotaCircuitBreaker.isTripped()) {
    return null;
  }
  
  // Quota exhausted - return cached data immediately
  try {
    var addrNorm = address ? String(address).toLowerCase().trim() : '';
    
    // Try to load cached data
    var cache = null;
    if (typeof WalletCache !== 'undefined' && WalletCache.load) {
      cache = WalletCache.load(addrNorm, null, config);
    }
    
    // If no cache, return minimal error output
    if (!cache || !cache.assets || cache.assets.length === 0) {
      return [
        [chainName || "Unknown", "[QUOTA]", "Quota exhausted - no cached data", "", "", "", ""],
        ["META", "quota_exhausted=true; reset=rolling_24h", "", "", "", "", ""]
      ];
    }
    
    // Build output from cache with [QUOTA] indicator
    var out = [];
    var fxRate = 1.0;
    
    // Get FX rate from cache if available
    if (cache.priceMap && cache.priceMap['FX_EUR']) {
      fxRate = cache.priceMap['FX_EUR'];
    }
    
    // Add INFO_FX
    out.push([chainName, "INFO_FX", "EUR/USD", "fx_rate", "", fxRate, ""]);
    
    // Add cached assets
    var total = 0;
    for (var i = 0; i < cache.assets.length; i++) {
      var a = cache.assets[i];
      if (!a) continue;
      
      var contract = a.contract || a.address || "";
      var balance = a.balance || 0;
      var price = a.price || (cache.priceMap ? cache.priceMap[contract] : 0) || 0;
      var value = balance * price;
      total += value;
      
      out.push([
        chainName,
        a.symbol || a.ticker || "???",
        a.name || "",
        contract,
        balance,
        price,
        value
      ]);
    }
    
    // Add INFO_TOTAL
    out.push([chainName, "INFO_TOTAL", "Portfolio Total", "total", "", "", total]);
    
    // Add META with [QUOTA] indicator
    var lastUpdate = cache.updatedAt || "unknown";
    out.push([
      chainName,
      "META",
      "[QUOTA] Cached data - quota exhausted (rolling 24h window)",
      "quota_exhausted=true",
      lastUpdate,
      0,
      config && config.SCRIPT_VERSION ? config.SCRIPT_VERSION : ""
    ]);
    
    if (QUOTA_BREAKER_CONFIG.LOG_TRIGGERS) {
      Logger.log("[QUOTA_BREAKER] Returned cached data for " + chainName + " (" + cache.assets.length + " assets)");
    }
    
    return out;
    
  } catch (e) {
    // If cache loading fails, return minimal error
    return [
      [chainName || "Unknown", "[QUOTA]", "Quota exhausted - cache error: " + e.message, "", "", "", ""],
      ["META", "quota_exhausted=true; error=" + e.message.substring(0, 50), "", "", "", "", ""]
    ];
  }
}

/**
 * Simpler version: just check if we should abort early
 * Returns true if quota exhausted (caller should handle fallback)
 * @returns {boolean}
 */
function shouldAbortDueToQuota() {
  return QuotaCircuitBreaker.isTripped();
}

// ============================================================
// AUTO-INITIALIZATION
// ============================================================

(function() {
  try {
    // Install global patch immediately
    INSTALL_GLOBAL_QUOTA_BREAKER();
    
    // Install Http module patch (if Http is loaded)
    if (typeof Http !== 'undefined') {
      INSTALL_QUOTA_CIRCUIT_BREAKER();
    }
    
    // Check if already tripped (from cache) - NO HTTP call here
    if (QuotaCircuitBreaker.isTripped()) {
      Logger.log("[QUOTA_BREAKER] WARNING: Circuit breaker is TRIPPED from previous run - quota exhausted");
    }
    
    // NOTE: We do NOT test quota at load time to save HTTP calls
    // Call QuotaCircuitBreaker.testOnce() or TEST_QUOTA_NOW() explicitly
    // when starting a refresh operation
    
  } catch (e) {
    Logger.log("[QUOTA_BREAKER] Init error: " + e.message);
  }
})();

// ============================================================
// INTEGRATION HELPER - Call from BaseEngine.initExecution()
// ============================================================

/**
 * Test quota once and return early data if exhausted
 * Call this at the START of getWalletAssets functions
 * 
 * @param {string} address - Wallet address  
 * @param {Object} config - Chain config
 * @param {string} chainName - Chain display name
 * @returns {Array|null} Cached output with [QUOTA] if exhausted, null if OK to proceed
 */
function testQuotaAndGetCache(address, config, chainName) {
  // Test quota with real HTTP call (only once per execution)
  QuotaCircuitBreaker.testOnce();
  
  // If not tripped, return null = proceed normally
  if (!QuotaCircuitBreaker.isTripped()) {
    return null;
  }
  
  // Quota exhausted - return cached data
  return checkQuotaAndReturnCache(address, config, chainName, "EVM");
}
