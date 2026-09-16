/************************************************************
 * 03E_QUOTA_CIRCUIT_BREAKER.gs - Instant Quota Detection
 *
 * v4.16.37 - TRIP EVIDENCE PERSISTENCE
 *   The sweep's QuotaCircuitBreaker.reset() wiped the CacheService trip
 *   payload before anyone could read the raw Google error, making root
 *   cause analysis of recurring BLOCKED:QUOTA impossible. _trip() now
 *   also appends the raw error + trigger context to a 5-entry ring in
 *   ScriptProperties (survives reset, read via GET_QUOTA_TRIP_HISTORY).
 *
 * v4.16.34 - Do not turn telemetry read contention into synthetic quota exhaustion.
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

var QUOTA_CIRCUIT_BREAKER_VERSION = "4.16.79";

// v4.16.79 - BOUNDED PORTFOLIO QUOTA EXEMPTION (P0-PROD-PORTFOLIO-QUOTA-BLOCK)
//   Google's UrlFetch quota is USER-scoped (20 000/day, "Quotas are per user",
//   developers.google.com/apps-script/guides/services/quotas), so another Apps
//   Script project on the same account can drain it while WCORE is nearly idle:
//   measured 2026-09-14 18:53 CEST — 132 observed WCORE calls, 19 868 of the
//   WCORE budget left, yet Google answered "Service invoked too many times for
//   one day: urlfetch" to the recovery probe (trip ring 09-11..09-14, daily
//   ~18:00-19:20 CEST). Both UrlFetch gates then return null BEFORE asking
//   Google, which froze "Portefeuille Crypto" on an undated
//   "ERROR: BLOCKED:QUOTA" for hours after the real window had reopened (live
//   probe OK at 19:05 CEST while the breaker was still tripped).
//   ExemptHttp gives ONLY the two portfolio snapshots (1 request/hour each,
//   ~48/day = 0.24 % of the quota) a strictly metered fallback: it is used only
//   when the patched fetch returned null, it can never spend more than
//   QUOTA_EXEMPT_DAILY_LIMIT attempts per slot per 09h-UTC day, it re-records
//   each attempt in both counters (category PORTFOLIO_EXEMPT so it stays
//   visible), and a genuine Google rejection still reaches handleError so the
//   breaker stays honest. Web scans, RPC and CEX fan-out are NOT exempt.

// v4.16.39 - POST-TRIP SCAN HOLD (recurring BLOCKED:QUOTA)
//   The Google UrlFetch quota is user-scoped, so HttpCounter (WCORE-only) is a
//   lower bound: on 2026-09-09/10 Google reported the window exhausted while
//   WCORE had counted ~3k calls. The only authoritative signal is a real Google
//   trip. But QUOTA_RECOVERY_SWEEP resets the breaker as soon as its httpbin
//   probe passes and re-pulses every blocked sheet; that wave spends the credit
//   the sliding window just returned and re-trips at once (4 trips in 2h).
//   _trip() now calls BudgetHTTP.noteAuthoritativeTrip(), which persists a 3h
//   deadline read by _webScanWallet_: AUTO web scans (the dominant consumer and
//   the only bulk re-pulse path) degrade to cached output while the sliding
//   window refills. Manual forceFull scans always win.
//   ADVISORY BY DESIGN: it must never clamp remaining() nor change the global
//   WcoreHttpMode — every UrlFetchApp.fetch flows through the generic 26B patch
//   as category "other", which RECOVERY denies, so clamping would block the
//   Action/Crypto portfolios, i.e. cause the very failure being fixed.
//
// v4.16.38 - RETAINED TELEMETRY (no more lost increments)
//   Under UserLock contention or ScriptProperties failure, HttpCounter.record()
//   used to reclassify the increment as "dropped telemetry" (2934 drops observed
//   on 2026-09-09 vs 120 counted). record() now RETAINS the increment in an
//   execution-local buffer and merges it into the persisted maps on the next
//   successful locked pass (next record or explicit HttpCounter.flush()). The
//   dropped metric remains reserved for genuine external losses reported via
//   noteDropped() (legacy counter contention), which still persists on the next
//   flush pass. Rolling reads (count/byTrigger/byHost/buckets/snapshot) include
//   retained increments so telemetry reflects live calls before persistence.
//
// v4.12.31: Store reference to ORIGINAL UrlFetchApp.fetch BEFORE any patching
// Needed by testOnce() to bypass the global quota patch for real testing
var _originalUrlFetch = UrlFetchApp.fetch;

function _httpTelemetryTransport_() {
  var bypassesPatch = typeof _originalUrlFetch === "function";
  return {
    fetch: bypassesPatch ? _originalUrlFetch : UrlFetchApp.fetch,
    explicitTelemetry: bypassesPatch
  };
}

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

  // Shared lease prevents independent custom-function executions from probing together.
  TEST_ATTEMPT_LEASE_KEY: "WCORE_QUOTA_TEST_ATTEMPT_v1",
  TEST_ATTEMPT_LEASE_SEC: 900,  // 15 minutes

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

  // v4.16.37: Trip evidence ring in ScriptProperties (survives the sweep's
  // CacheService reset, so the raw Google error of each trip stays readable).
  // 5 entries x ~300 bytes max: negligible vs the 500 KB properties budget.
  TRIP_EVIDENCE_KEY: "WCORE_QCB_TRIP_EVIDENCE_v1",
  TRIP_EVIDENCE_MAX_ENTRIES: 5,

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
    var serviceTarget = /service invoked too many times(?: for one day| in a short time)?\s*:\s*url\s*fetch\b/;
    var metricTarget = /quota exceeded for quota metric[^a-z0-9]{0,3}url\s*fetch(?:\s+calls?)?\b/;
    return serviceTarget.test(msg) || metricTarget.test(msg);
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
   * v4.16.37: Append trip evidence to a ScriptProperties ring so the raw
   * Google error survives QuotaCircuitBreaker.reset() (the sweep wipes the
   * CacheService payload before a human can read it). Best-effort: any
   * failure is swallowed, evidence must never break tripping.
   */
  function _appendTripEvidence(errorMessage, nowMs) {
    try {
      var props = PropertiesService.getScriptProperties();
      var raw = props.getProperty(QUOTA_BREAKER_CONFIG.TRIP_EVIDENCE_KEY);
      var arr = [];
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) arr = parsed;
      }
      var trigger = "unknown";
      try { trigger = props.getProperty("WCORE_CURRENT_TRIGGER") || "unknown"; } catch (eTrig) {}
      arr.push({
        ts: nowMs,
        trigger: trigger,
        error: String(errorMessage || "Unknown quota error").substring(0, 200)
      });
      if (arr.length > QUOTA_BREAKER_CONFIG.TRIP_EVIDENCE_MAX_ENTRIES) {
        arr = arr.slice(-QUOTA_BREAKER_CONFIG.TRIP_EVIDENCE_MAX_ENTRIES);
      }
      props.setProperty(QUOTA_BREAKER_CONFIG.TRIP_EVIDENCE_KEY, JSON.stringify(arr));
    } catch (eEvidence) {
      Logger.log("[QUOTA_BREAKER] Trip evidence append failed: " + eEvidence.message);
    }
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
    _appendTripEvidence(errorMessage, nowMs);
    // v4.16.39: reserve budget for 3h so the recovery sweep's re-pulse wave
    // cannot immediately re-exhaust the sliding window. Best effort by design.
    try {
      if (typeof BudgetHTTP !== "undefined" && BudgetHTTP.noteAuthoritativeTrip) {
        BudgetHTTP.noteAuthoritativeTrip(nowMs);
      }
    } catch (eFloor) {
      Logger.log("[QUOTA_BREAKER] post-trip budget floor failed: " + eFloor.message);
    }

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
   * Atomically reserve the shared automatic-probe window. Any coordination
   * failure skips the probe so a cache or lock outage cannot create a herd.
   */
  function _claimAutomaticProbeLease() {
    var lock = null;
    var acquired = false;
    try {
      lock = LockService.getScriptLock();
      if (!lock || !lock.tryLock(250)) return false;
      acquired = true;

      var cache = CacheService.getScriptCache();
      if (!cache || cache.get(QUOTA_BREAKER_CONFIG.TEST_ATTEMPT_LEASE_KEY)) return false;
      cache.put(
        QUOTA_BREAKER_CONFIG.TEST_ATTEMPT_LEASE_KEY,
        "1",
        QUOTA_BREAKER_CONFIG.TEST_ATTEMPT_LEASE_SEC
      );
      return true;
    } catch (e) {
      return false;
    } finally {
      if (acquired) {
        try { lock.releaseLock(); } catch (eRelease) {}
      }
    }
  }
  
  /**
   * TEST the quota with a real HTTP call.
   * Automatic probes share a cross-execution lease; authorized diagnostics
   * may explicitly force a probe.
   * Runs ONCE per execution (first call)
   */
  function _testQuotaOnce(forceProbe) {
    var forced = forceProbe === true;

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
    if (!forced && !_tripped && !wasTrippedInCache) {
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

    if (!forced && !_claimAutomaticProbeLease()) return;

    // Make a lightweight test call after claiming the shared automatic lease.
    // v4.12.31: Use _originalUrlFetch to bypass global quota patch
    try {
      var testUrl = "https://httpbin.org/status/200";
      var transport = typeof _httpTelemetryTransport_ === "function"
        ? _httpTelemetryTransport_()
        : { fetch: _originalUrlFetch, explicitTelemetry: true };
      if (transport.explicitTelemetry) {
        try { if (typeof HttpCounter !== "undefined" && HttpCounter.record) HttpCounter.record(1, "QUOTA_PROBE", testUrl); } catch (eCountTest) {}
        try { if (typeof HttpCallCounter !== "undefined" && HttpCallCounter.increment) HttpCallCounter.increment(testUrl, "QUOTA_PROBE"); } catch (eLegacyCountTest) {}
      }
      var response = transport.fetch.call(UrlFetchApp, testUrl, {
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
        // Other errors are inconclusive. Preserve any stale breaker until an
        // actual HTTP response proves that Google accepts UrlFetch again.
        if (wasTrippedInCache) {
          Logger.log("[QUOTA_BREAKER] Non-quota probe error, preserving stale breaker: " + e.message);
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
     * Authoritative Google UrlFetch quota matcher.
     * @param {Error|string} error - Error to classify
     * @returns {boolean}
     */
    isQuotaError: function(error) {
      return _isQuotaError(error && error.message ? error.message : error);
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
     * Read breaker status directly from cache without changing cache or memory.
     * Cache failures fail closed because automatic HTTP admission must stay safe.
     */
    peekStatus: function() {
      try {
        var cache = CacheService.getScriptCache();
        var raw = cache.get(QUOTA_BREAKER_CONFIG.CACHE_KEY);
        var parsed = raw ? JSON.parse(raw) : null;
        var trippedMs = null;
        if (parsed && typeof parsed.trippedMs === "number") trippedMs = parsed.trippedMs;
        if (trippedMs == null && parsed && parsed.time) {
          var parsedTime = Date.parse(parsed.time);
          if (!isNaN(parsedTime)) trippedMs = parsedTime;
        }
        if (raw && trippedMs == null) throw new Error("Invalid quota breaker cache state");
        var tripped = trippedMs != null && (Date.now() - trippedMs) < QUOTA_BREAKER_CONFIG.TRIP_MAX_LOCKOUT_MS;
        var tripTime = tripped && parsed ? (parsed.time || new Date(trippedMs).toISOString()) : null;
        var maxClearAt = tripped ? new Date(trippedMs + QUOTA_BREAKER_CONFIG.TRIP_MAX_LOCKOUT_MS).toISOString() : null;
        return {
          tripped: tripped,
          tripTime: tripTime,
          trippedMs: tripped ? trippedMs : null,
          trippedLocal: tripped ? _fmtLocal(trippedMs) : null,
          maxClearAt: maxClearAt,
          maxClearAtLocal: tripped ? _fmtLocal(trippedMs + QUOTA_BREAKER_CONFIG.TRIP_MAX_LOCKOUT_MS) : null,
          date: _getTodayUTC(),
          message: tripped
            ? "QUOTA EXHAUSTED - auto-recovery when httpbin test passes (every 15min)"
            : "OK - HTTP calls allowed",
          unavailable: false
        };
      } catch (e) {
        return {
          tripped: true,
          tripTime: null,
          trippedMs: null,
          trippedLocal: null,
          maxClearAt: null,
          maxClearAtLocal: null,
          date: _getTodayUTC(),
          message: "UNAVAILABLE - quota breaker cache unreadable; HTTP must remain blocked",
          unavailable: true
        };
      }
    },

    /**
     * Test quota with a real HTTP call (runs once per execution).
     * Call this at the START of your main function to detect quota early
     * @param {boolean} forceProbe - true only for authorized diagnostics
     * @returns {boolean} True if quota is OK, false if exhausted
     */
    testOnce: function(forceProbe) {
      _testQuotaOnce(forceProbe === true);
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
 * Observability-only: record(n, category, url) is called from the global
 * UrlFetchApp patches below. Raw bypass paths record explicitly before fetch.
 *
 * Exposed via @customfunction GET_HTTP_COUNT_LAST_24H() for the sheet.
 */
var HttpCounter = (function() {
  var KEY = "WCORE_HTTP_BUCKETS_v1";
  var TRIGGER_KEY = "WCORE_HTTP_TRIGGERS_v2";
  var HOST_KEY = "WCORE_HTTP_HOSTS_v1";
  var DROPPED_KEY = CK_get('httpDroppedTelemetry');
  // UserLock matches the user-scoped UrlFetch quota. This is observational WCORE telemetry,
  // not authoritative cross-user accounting, and avoids watchdog ScriptLock self-deadlock.
  var LOCK_WAIT_MS = 100;
  var BUCKET_MS = 60 * 60 * 1000;  // 1h granularity
  var WINDOWS = 24;                // last 24 buckets = rolling 24h
  // v4.16.38: execution-local RETAINED buffer for contended/failed increments
  // (shape declared at _bufferAdd). The happy path still persists immediately;
  // retained increments are merged into the persisted maps by the next locked
  // pass instead of being reclassified as permanently-dropped telemetry.
  var _buffer = {};
  var _bufferedCount = 0;
  // Contention cannot safely persist without the lock, so the observed dropped total is a lower bound.
  var _droppedPending = 0;
  var _lastValidCount = 0;
  var _telemetryDegraded = false;
  // Set by the tolerant breakdown reader when it repairs a corrupt map during a snapshot.
  var _snapshotBreakdownCorrupt = false;

  function _loadRaw(props, key) {
    var raw = props.getProperty(key);
    if (!raw) return {};
    var obj;
    try { obj = JSON.parse(raw); } catch (eParse) { return {}; }
    return (obj && typeof obj === "object") ? obj : {};
  }

  function _snapshotLoadRaw(props, key) {
    var raw = props.getProperty(key);
    if (raw == null) return {};
    var obj;
    try {
      obj = JSON.parse(raw);
    } catch (eParse) {
      var malformed = new Error("Malformed HTTP telemetry: " + key);
      malformed.telemetryCorrupt = true;
      throw malformed;
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      var invalid = new Error("Invalid HTTP telemetry: " + key);
      invalid.telemetryCorrupt = true;
      throw invalid;
    }
    return obj;
  }

  // 2026-09-16 (P1-OBS-GSHEET-HTTP-ATTRIBUTION) : lecteur TOLERANT reserve aux CARTES
  // d'attribution (hosts/triggers). Le TOTAL garde le lecteur fail-closed ci-dessus :
  // une valeur de total corrompue ne doit JAMAIS etre presentee comme fiable. En revanche
  // un BREAKDOWN corrompu ne doit pas vider tout le snapshot (c'etait la cause de
  // "byHost total = 0 alors que le total = 132" : _snapshotLoadRaw levait et le catch
  // renvoyait categories:{} / hosts:{}). Une reparation de breakdown marque la telemetrie degradee.
  function _snapshotLoadRawLenient(props, key) {
    var raw = props.getProperty(key);
    if (raw == null) return {};
    var obj;
    try { obj = JSON.parse(raw); } catch (eParse) { _telemetryDegraded = true; _snapshotBreakdownCorrupt = true; return {}; }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) { _telemetryDegraded = true; _snapshotBreakdownCorrupt = true; return {}; }
    return obj;
  }

  function _save(props, obj, key) {
    props.setProperty(key, JSON.stringify(obj));
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

  function _sum(obj) {
    var total = 0;
    for (var k in obj) {
      if (obj.hasOwnProperty(k)) total += (parseInt(obj[k], 10) || 0);
    }
    return total;
  }

  function _currentTrigger(props) {
    return props.getProperty("WCORE_CURRENT_TRIGGER") || "unknown";
  }

  function _category(explicitCategory, props) {
    var explicit = String(explicitCategory || "").trim();
    return explicit ? explicit.toUpperCase() : "approx:" + _currentTrigger(props);
  }

  function _host(url) {
    var match = String(url || "").match(/^https?:\/\/(?:[^\/@?#]*@)?([^\/:?#]+)(?::[0-9]+)?(?:[\/?#]|$)/i);
    return match ? match[1].toLowerCase() : "unknown";
  }

  // v4.16.38: execution-local RETAINED buffer. Only contended/failed increments
  // land here (the happy path still persists immediately, so a different runtime
  // sees them at once). A later successful flush merges them into the persisted
  // maps instead of turning them into permanent drops.
  // Shape: { "<bucket>": { total: n, byExplicit: { "<explicitKey>": { hosts: {}, total: n } } } }
  // "<explicitKey>" is the raw (trimmed/uppercased) explicit category, or "~legacy~"
  // for records that must be attributed to WCORE_CURRENT_TRIGGER (resolved under lock).
  function _bufferAdd(inc, explicitCategory, host) {
    var bucket = String(Math.floor(Date.now() / BUCKET_MS));
    var explicit = String(explicitCategory || "").trim().toUpperCase();
    var key = explicit || "~legacy~";
    var b = _buffer[bucket];
    if (!b) { b = { total: 0, byExplicit: {} }; _buffer[bucket] = b; }
    var e = b.byExplicit[key];
    if (!e) { e = { total: 0, hosts: {} }; b.byExplicit[key] = e; }
    e.total += inc;
    e.hosts[host] = (parseInt(e.hosts[host], 10) || 0) + inc;
    b.total += inc;
    _bufferedCount += inc;
  }

  function _bufferSum() {
    return _bufferedCount;
  }

  // Resolve final category names for the retained buffer. The legacy path needs
  // WCORE_CURRENT_TRIGGER, which must be read under the UserLock.
  function _categoryForExplicit(explicitKey, props) {
    return explicitKey === "~legacy~" ? ("approx:" + _currentTrigger(props)) : explicitKey;
  }

  // v4.16.38: merge the retained buffer into the loaded persisted maps. Must run
  // under the UserLock. Clears the buffer only on success (called after the
  // matching _save() calls by the caller).
  function _mergeBufferInto(counts, triggers, hosts, props) {
    for (var bucket in _buffer) {
      if (!_buffer.hasOwnProperty(bucket)) continue;
      var b = _buffer[bucket];
      counts[bucket] = (parseInt(counts[bucket], 10) || 0) + b.total;
      if (!triggers[bucket]) triggers[bucket] = {};
      if (!hosts[bucket]) hosts[bucket] = {};
      for (var explicitKey in b.byExplicit) {
        if (!b.byExplicit.hasOwnProperty(explicitKey)) continue;
        var e = b.byExplicit[explicitKey];
        var cat = _categoryForExplicit(explicitKey, props);
        triggers[bucket][cat] = (parseInt(triggers[bucket][cat], 10) || 0) + e.total;
        for (var h in e.hosts) {
          if (!e.hosts.hasOwnProperty(h)) continue;
          hosts[bucket][h] = (parseInt(hosts[bucket][h], 10) || 0) + e.hosts[h];
        }
      }
    }
  }

  function _clearBuffer() {
    _buffer = {};
    _bufferedCount = 0;
  }

  // v4.16.38: flush retained buffer independently (best effort). Returns true if
  // there was nothing to flush or it persisted; false if the buffer is retained.
  function _flushBuffer() {
    if (_bufferedCount <= 0) return true;
    var lock = null;
    var acquired = false;
    try {
      lock = LockService.getUserLock();
      if (!lock || !lock.tryLock(LOCK_WAIT_MS)) return false;
      acquired = true;
      var props = PropertiesService.getScriptProperties();
      var nowMs = Date.now();
      var counts = _purge(_loadRaw(props, KEY), nowMs);
      var triggers = _purge(_loadRaw(props, TRIGGER_KEY), nowMs);
      var hosts = _purge(_loadRaw(props, HOST_KEY), nowMs);
      var dropped = _purge(_loadRaw(props, DROPPED_KEY), nowMs);
      _mergeBufferInto(counts, triggers, hosts, props);
      if (_droppedPending > 0) {
        var bucket = String(Math.floor(nowMs / BUCKET_MS));
        dropped[bucket] = (parseInt(dropped[bucket], 10) || 0) + _droppedPending;
      }
      _save(props, counts, KEY);
      _save(props, triggers, TRIGGER_KEY);
      _save(props, hosts, HOST_KEY);
      _save(props, dropped, DROPPED_KEY);
      _lastValidCount = _sum(counts);
      _clearBuffer();
      _droppedPending = 0;
      _telemetryDegraded = false;
      return true;
    } catch (e) {
      return false;
    } finally {
      if (acquired) try { lock.releaseLock(); } catch (eRelease) {}
    }
  }

  // v4.16.38: retained-buffer helpers shared by every rolling read. Adds the
  // execution-local retained increments to a persisted window so counts reflect
  // live calls even before a flush lands.
  function _bufferedTotalsFlat() {
    var out = {};
    for (var bucket in _buffer) {
      if (!_buffer.hasOwnProperty(bucket)) continue;
      for (var explicitKey in _buffer[bucket].byExplicit) {
        if (!_buffer[bucket].byExplicit.hasOwnProperty(explicitKey)) continue;
        // Category is only finalized at flush (legacy needs the locked trigger
        // read); reads report it under the explicit key when present, which is
        // identical except for legacy approx:* attribution.
        var cat = explicitKey === "~legacy~" ? null : explicitKey;
        if (cat) out[cat] = (out[cat] || 0) + _buffer[bucket].byExplicit[explicitKey].total;
      }
    }
    return out;
  }

  function _bufferedHostsFlat() {
    var out = {};
    for (var bucket in _buffer) {
      if (!_buffer.hasOwnProperty(bucket)) continue;
      for (var explicitKey in _buffer[bucket].byExplicit) {
        if (!_buffer[bucket].byExplicit.hasOwnProperty(explicitKey)) continue;
        var hosts = _buffer[bucket].byExplicit[explicitKey].hosts;
        for (var h in hosts) {
          if (!hosts.hasOwnProperty(h)) continue;
          out[h] = (out[h] || 0) + hosts[h];
        }
      }
    }
    return out;
  }

  function _readLocked(fallback, reader) {
    var lock = null;
    var acquired = false;
    try {
      lock = LockService.getUserLock();
      if (!lock || !lock.tryLock(LOCK_WAIT_MS)) return fallback;
      acquired = true;
      return reader(PropertiesService.getScriptProperties());
    } catch (e) {
      return fallback;
    } finally {
      if (acquired) try { lock.releaseLock(); } catch (eRelease) {}
    }
  }

  function _fallbackCount() {
    _telemetryDegraded = true;
    try {
      // ScriptProperties returns the complete stored string; this read-only snapshot
      // cannot interfere with a concurrent writer even when UserLock is contended.
      var props = PropertiesService.getScriptProperties();
      var total = _sum(_purge(_snapshotLoadRaw(props, KEY), Date.now()));
      _lastValidCount = total;
      return total;
    } catch (e) {
      return _lastValidCount;
    }
  }

  function _flatten(obj) {
    var out = {};
    for (var bk in obj) {
      if (!obj.hasOwnProperty(bk)) continue;
      var bucket = obj[bk];
      for (var name in bucket) {
        if (!bucket.hasOwnProperty(name)) continue;
        out[name] = (out[name] || 0) + (parseInt(bucket[name], 10) || 0);
      }
    }
    return out;
  }

  return {
    record: function(n, explicitCategory, url) {
      var inc = parseInt(n, 10) || 0;
      if (inc < 1) return;
      var host = _host(url);
      var lock = null;
      var acquired = false;
      try {
        lock = LockService.getUserLock();
        if (!lock || !lock.tryLock(LOCK_WAIT_MS)) {
          // v4.16.38: retain instead of drop — merged by the next successful
          // flush (this record, a later record, or an explicit flush()).
          _bufferAdd(inc, explicitCategory, host);
          return;
        }
        acquired = true;
        var props = PropertiesService.getScriptProperties();
        var nowMs = Date.now();
        var bucket = String(Math.floor(nowMs / BUCKET_MS));
        var counts = _purge(_loadRaw(props, KEY), nowMs);
        var triggers = _purge(_loadRaw(props, TRIGGER_KEY), nowMs);
        var hosts = _purge(_loadRaw(props, HOST_KEY), nowMs);
        var dropped = _purge(_loadRaw(props, DROPPED_KEY), nowMs);
        var category = _category(explicitCategory, props);

        counts[bucket] = (parseInt(counts[bucket], 10) || 0) + inc;
        if (!triggers[bucket]) triggers[bucket] = {};
        triggers[bucket][category] = (parseInt(triggers[bucket][category], 10) || 0) + inc;
        if (!hosts[bucket]) hosts[bucket] = {};
        hosts[bucket][host] = (parseInt(hosts[bucket][host], 10) || 0) + inc;

        // v4.16.38: merge previously retained increments in the same locked pass.
        _mergeBufferInto(counts, triggers, hosts, props);
        if (_droppedPending > 0) dropped[bucket] = (parseInt(dropped[bucket], 10) || 0) + _droppedPending;

        _save(props, counts, KEY);
        _save(props, triggers, TRIGGER_KEY);
        _save(props, hosts, HOST_KEY);
        _save(props, dropped, DROPPED_KEY);
        _lastValidCount = _sum(counts);
        _telemetryDegraded = false;
        if (_droppedPending > 0) {
          _droppedPending = 0;
        }
        _clearBuffer();
      } catch (e) {
        // v4.16.38: retain on property failure too — no increment is lost.
        _bufferAdd(inc, explicitCategory, host);
      } finally {
        if (acquired) try { lock.releaseLock(); } catch (eRelease) {}
      }
    },

    // v4.16.38: explicit flush of retained increments (best effort). Wire it at
    // the end of trigger functions alongside HttpCallCounter.flush().
    flush: function() {
      return _flushBuffer();
    },

    count: function() {
      var measured = _readLocked(null, function(props) {
        var nowMs = Date.now();
        var obj = _purge(_loadRaw(props, KEY), nowMs);
        return _sum(obj);
      });
      if (measured == null) return _fallbackCount() + _bufferSum();
      _lastValidCount = measured;
      _telemetryDegraded = false;
      return measured + _bufferSum();
    },

    isDegraded: function() {
      return _telemetryDegraded;
    },

    byTrigger: function() {
      var out = _readLocked({}, function(props) {
        var nowMs = Date.now();
        return _flatten(_purge(_loadRaw(props, TRIGGER_KEY), nowMs));
      });
      var buffered = _bufferedTotalsFlat();
      for (var cat in buffered) {
        if (buffered.hasOwnProperty(cat)) out[cat] = (out[cat] || 0) + buffered[cat];
      }
      return out;
    },

    byHost: function() {
      var out = _readLocked({}, function(props) {
        var nowMs = Date.now();
        return _flatten(_purge(_loadRaw(props, HOST_KEY), nowMs));
      });
      var buffered = _bufferedHostsFlat();
      for (var h in buffered) {
        if (buffered.hasOwnProperty(h)) out[h] = (out[h] || 0) + buffered[h];
      }
      return out;
    },

    noteDropped: function(n) {
      var inc = parseInt(n, 10) || 1;
      if (inc > 0) _droppedPending += inc;
    },

    dropped: function() {
      var persisted = _readLocked(-1, function(props) {
        var nowMs = Date.now();
        return _sum(_purge(_loadRaw(props, DROPPED_KEY), nowMs));
      });
      return (persisted < 0 ? 0 : persisted) + _droppedPending;
    },

    snapshot: function() {
      var unavailable = {
        available: false,
        total: _lastValidCount + _bufferSum(),
        categories: {},
        hosts: {},
        dropped: _droppedPending
      };
      var lock = null;
      var acquired = false;
      try {
        lock = LockService.getUserLock();
        if (!lock || !lock.tryLock(LOCK_WAIT_MS)) {
          unavailable.total = _fallbackCount() + _bufferSum();
          return unavailable;
        }
        acquired = true;
        var props = PropertiesService.getScriptProperties();
        var nowMs = Date.now();
        _snapshotBreakdownCorrupt = false;
        var total = _sum(_purge(_snapshotLoadRaw(props, KEY), nowMs));
        var categories = _flatten(_purge(_snapshotLoadRawLenient(props, TRIGGER_KEY), nowMs));
        var hosts = _flatten(_purge(_snapshotLoadRawLenient(props, HOST_KEY), nowMs));
        // Merge retained increments so the snapshot reflects live calls.
        total += _bufferSum();
        var bufferedCats = _bufferedTotalsFlat();
        for (var cat in bufferedCats) {
          if (bufferedCats.hasOwnProperty(cat)) categories[cat] = (categories[cat] || 0) + bufferedCats[cat];
        }
        var bufferedHosts = _bufferedHostsFlat();
        for (var bh in bufferedHosts) {
          if (bufferedHosts.hasOwnProperty(bh)) hosts[bh] = (hosts[bh] || 0) + bufferedHosts[bh];
        }
        _lastValidCount = total - _bufferSum();
        if (_lastValidCount < 0) _lastValidCount = 0;
        _telemetryDegraded = false;
        var snapshotOut = {
          available: true,
          total: total,
          categories: categories,
          hosts: hosts,
          dropped: _sum(_purge(_snapshotLoadRaw(props, DROPPED_KEY), nowMs)) + _droppedPending
        };
        if (_snapshotBreakdownCorrupt) snapshotOut.corrupt = true;
        return snapshotOut;
      } catch (e) {
        if (e && e.telemetryCorrupt) unavailable.corrupt = true;
        unavailable.total = _fallbackCount() + _bufferSum();
        return unavailable;
      } finally {
        if (acquired) try { lock.releaseLock(); } catch (eRelease) {}
      }
    },

    reset: function() {
      var resetOk = _readLocked(false, function(props) {
        props.deleteProperty(KEY);
        props.deleteProperty(TRIGGER_KEY);
        props.deleteProperty(HOST_KEY);
        props.deleteProperty(DROPPED_KEY);
        return true;
      });
      // Always clear execution-local state: a retained buffer must never
      // resurrect deleted counters after a confirmed reset.
      _droppedPending = 0;
      _clearBuffer();
      _lastValidCount = 0;
      _telemetryDegraded = false;
      return resetOk;
    },

    buckets: function() {
      var out = _readLocked({}, function(props) {
        return _purge(_loadRaw(props, KEY), Date.now());
      });
      for (var bucket in _buffer) {
        if (!_buffer.hasOwnProperty(bucket)) continue;
        out[bucket] = (parseInt(out[bucket], 10) || 0) + _buffer[bucket].total;
      }
      return out;
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
  var telemetryDegraded = false;

  // v4.16.39 — POST-TRIP SCAN FLOOR (recurring BLOCKED:QUOTA)
  //
  // The Google UrlFetch quota is USER-scoped: other scripts on the account draw
  // from the same 20k window, so HttpCounter (WCORE-only) is a lower bound and
  // cannot be the sole admission signal — observed 2026-09-09/10, ~3k counted
  // calls while Google reported the window exhausted.
  //
  // The only authoritative proof is Google itself ("Service invoked too many
  // times"). But QUOTA_RECOVERY_SWEEP resets the breaker as soon as its httpbin
  // probe passes and immediately re-pulses every blocked sheet; that wave eats
  // the few calls the sliding window just returned and re-trips at once (4 trips
  // in 2h on 2026-09-09). After an authoritative trip we therefore hold AUTO web
  // scans — the dominant consumer, and the only caller that re-pulses in bulk —
  // for 3h so the sliding window can actually refill.
  //
  // DELIBERATELY ADVISORY: this flag must NEVER clamp remaining() nor change the
  // global WcoreHttpMode. Every UrlFetchApp.fetch flows through the generic
  // 26B_HTTP_SAVINGS patch under reason "26B.fetch" -> category "other", which
  // RECOVERY mode denies; clamping would block the Action/Crypto portfolios,
  // i.e. cause the very failure this fix targets. Only _webScanWallet_ reads it,
  // and only for AUTO scans (a manual forceFull stays the operator's decision).
  //
  // The deadline lives in ScriptProperties so it outlives both the execution and
  // the sweep's CacheService reset.
  var TRIP_FLOOR_KEY = "WCORE_HTTP_TRIP_FLOOR_UNTIL_v1";
  var TRIP_FLOOR_MS = 3 * 60 * 60 * 1000;
  var TRIP_FLOOR_LOCK_WAIT_MS = 100;
  // Execution-local memo: the deadline cannot change mid-execution (only a trip
  // writes it), so one properties read per execution is enough. The READ is
  // lock-free on purpose: getProperty is atomic, and a UserLock read is exactly
  // the contended path (100ms tryLock) this design must avoid — failing open
  // during contention would disable the hold precisely during a quota crisis.
  // Only the WRITE keeps the UserLock discipline of the file.
  var _floorUntilMemo = null;

  function _floorWrite(writer) {
    var lock = null;
    var acquired = false;
    try {
      lock = LockService.getUserLock();
      if (!lock || !lock.tryLock(TRIP_FLOOR_LOCK_WAIT_MS)) return false;
      acquired = true;
      writer(PropertiesService.getScriptProperties());
      return true;
    } catch (e) {
      return false;
    } finally {
      if (acquired) try { lock.releaseLock(); } catch (eRelease) {}
    }
  }

  function _floorUntil() {
    if (_floorUntilMemo != null) return _floorUntilMemo;
    var until = 0;
    try {
      // Atomic read — no lock needed (see memo comment above).
      var raw = PropertiesService.getScriptProperties().getProperty(TRIP_FLOOR_KEY);
      if (raw) {
        var parsed = parseInt(raw, 10);
        if (isFinite(parsed)) until = parsed;
      }
    } catch (e) {
      until = 0;
    }
    // A deadline further out than the maximum window cannot have been written by
    // a real trip (clock skew, corruption, manual edit): treat it as absent so a
    // bad value can never wedge WCORE into a permanent hold.
    if (until > Date.now() + TRIP_FLOOR_MS) until = 0;
    _floorUntilMemo = until;
    return until;
  }

  function _floorActive() {
    return _floorUntil() > Date.now();
  }

  function _count() {
    try {
      if (typeof HttpCounter !== 'undefined' && HttpCounter.count) {
        var count = HttpCounter.count();
        telemetryDegraded = !!(HttpCounter.isDegraded && HttpCounter.isDegraded());
        return count;
      }
    } catch (e) {
      telemetryDegraded = true;
    }
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

    /**
     * v4.16.39: called by QuotaCircuitBreaker._trip() on a Google quota trip.
     * Holds AUTO web scans for 3h so the recovery sweep's re-pulse wave cannot
     * spend the sliding window back to zero. Best effort: a properties failure
     * must never break tripping.
     * @param {number} trippedMs Trip timestamp (defaults to now)
     */
    noteAuthoritativeTrip: function(trippedMs) {
      var now = Date.now();
      var anchor = (trippedMs != null && isFinite(trippedMs)) ? Number(trippedMs) : now;
      // Never let a future-dated or absurd anchor extend the hold past the window.
      if (!(anchor < now)) anchor = now;
      var until = anchor + TRIP_FLOOR_MS;
      var persisted = _floorWrite(function(props) {
        props.setProperty(TRIP_FLOOR_KEY, String(until));
      });
      if (persisted) _floorUntilMemo = until;
      else try { Logger.log("[BUDGET_HTTP] post-trip scan floor not armed (telemetry lock/properties unavailable)"); } catch (eLog) {}
      return persisted;
    },

    /**
     * v4.16.39: true while AUTO web scans should stand down after a quota trip.
     * Advisory only — read by _webScanWallet_, never by budget admission.
     * @returns {boolean}
     */
    isPostTripFloorActive: function() {
      return _floorActive();
    },

    /**
     * v4.16.39: operator release of the post-trip scan hold.
     * @returns {boolean} true when the deadline was cleared
     */
    clearPostTripFloor: function() {
      var cleared = _floorWrite(function(props) {
        props.deleteProperty(TRIP_FLOOR_KEY);
      });
      _floorUntilMemo = cleared ? 0 : null;
      return cleared;
    },

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
        telemetryDegraded: telemetryDegraded,
        adminMinRemaining: adminMinRemaining,
        // Advisory post-trip scan hold (does not affect the budget numbers above).
        tripFloorActive: _floorActive(),
        tripFloorUntil: _floorUntil() || null
      };
    }
  };
})();

// v4.16.79 — hard ceiling of exempt attempts per slot per 09h-UTC day. The two
// portfolios need 24 requests/day each; 96 leaves room for the 3x transient
// retry window while staying far below the shared 20 000/day account budget.
var QUOTA_EXEMPT_DAILY_LIMIT = 96;

/**
 * v4.16.79: metered escape hatch for the two portfolio snapshots ONLY.
 *
 * Read the call site before reusing this: it bypasses the global UrlFetch gates,
 * so an accidental bulk caller would defeat every quota protection in the file.
 * It exists because the account quota is user-scoped and third-party burn must
 * not freeze a tab that costs one request per hour.
 *
 * @param {string} slot        Metered identity, also the telemetry category.
 * @param {string} url         Request to send.
 * @param {Object} options     UrlFetch options.
 * @param {number=} dailyLimit Optional override of QUOTA_EXEMPT_DAILY_LIMIT.
 * @returns {Object|null} HTTPResponse, or null when the slot's allowance is spent.
 */
var ExemptHttp = (function() {
  var KEY_PREFIX = "WCORE_EXEMPT_HTTP_";
  var LOCK_WAIT_MS = 100;
  var _memo = {};

  function _dayStamp() {
    // Same 09h UTC rollover as the other HTTP counters (26B_HTTP_SAVINGS).
    var d = new Date(Date.now() - 9 * 3600000);
    return d.getUTCFullYear() + "-" + (d.getUTCMonth() + 1) + "-" + d.getUTCDate();
  }

  function _readUsed(key) {
    var memo = _memo[key];
    if (memo && memo.day === _dayStamp()) return memo.n;
    var used = 0;
    try {
      var raw = PropertiesService.getScriptProperties().getProperty(key);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.d === _dayStamp() && typeof parsed.n === "number") used = parsed.n;
      }
    } catch (e) {}
    return used;
  }

  function _reserve(slot, limit) {
    var key = KEY_PREFIX + String(slot || "default");
    var lock = null;
    var acquired = false;
    try {
      try { lock = LockService.getUserLock(); } catch (eLock) { lock = null; }
      if (lock && lock.tryLock) acquired = !!lock.tryLock(LOCK_WAIT_MS);
      var props = PropertiesService.getScriptProperties();
      var used = _readUsed(key);
      if (used >= limit) return false;
      used += 1;
      _memo[key] = { day: _dayStamp(), n: used };
      try { props.setProperty(key, JSON.stringify({ d: _dayStamp(), n: used })); } catch (eWrite) {}
      return true;
    } catch (e) {
      // Telemetry/properties outage must not block the portfolio, but it also
      // must not open an unlimited hole: fall back to the execution-local memo.
      var memoKey = KEY_PREFIX + String(slot || "default");
      var memoUsed = (_memo[memoKey] && _memo[memoKey].day === _dayStamp()) ? _memo[memoKey].n : 0;
      if (memoUsed >= limit) return false;
      _memo[memoKey] = { day: _dayStamp(), n: memoUsed + 1 };
      return true;
    } finally {
      if (acquired) { try { lock.releaseLock(); } catch (eRelease) {} }
    }
  }

  function _note(slot, url) {
    try {
      if (typeof HttpCounter !== "undefined" && HttpCounter.record) HttpCounter.record(1, slot, url);
    } catch (e) {}
    try {
      if (typeof HttpCallCounter !== "undefined" && HttpCallCounter.increment) HttpCallCounter.increment(url, slot);
    } catch (e2) {}
  }

  return {
    used: function(slot) {
      return _readUsed(KEY_PREFIX + String(slot || "default"));
    },

    /**
     * One metered attempt. Never throws on the gate: a real Google rejection
     * propagates so the caller classifies it and the breaker stays accurate.
     */
    attempt: function(slot, url, options, dailyLimit) {
      var limit = parseInt(dailyLimit, 10);
      if (!(limit > 0)) limit = parseInt(QUOTA_EXEMPT_DAILY_LIMIT, 10);
      if (!(limit > 0)) limit = 96;
      if (!_reserve(slot, limit)) {
        try { Logger.log("[EXEMPT_HTTP] allowance spent: " + slot); } catch (eLog) {}
        return null;
      }
      var transport = (typeof _httpTelemetryTransport_ === "function")
        ? _httpTelemetryTransport_()
        : { fetch: (typeof _originalUrlFetch === "function" ? _originalUrlFetch : UrlFetchApp.fetch) };
      var send = (transport && typeof transport.fetch === "function") ? transport.fetch : UrlFetchApp.fetch;
      _note(slot, url);
      try {
        return send.call(UrlFetchApp, url, options);
      } catch (e) {
        try {
          if (typeof QuotaCircuitBreaker !== "undefined" && QuotaCircuitBreaker.handleError) QuotaCircuitBreaker.handleError(e);
        } catch (eHandle) {}
        throw e;
      }
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
    ["Admin min remaining", budget.adminMinRemaining || ""],
    // v4.16.39: post-trip scan hold visibility — explains deferred AUTO web
    // scans that have no matching observed count (the count is not authoritative).
    // _fmtLocal is private to the QuotaCircuitBreaker closure, so format here.
    ["Post-trip scan hold", budget.tripFloorActive ? "ACTIVE (AUTO web scans deferred)" : "inactive"],
    ["Post-trip hold until", budget.tripFloorActive && budget.tripFloorUntil ? new Date(budget.tripFloorUntil).toISOString() : ""]
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
    try { HttpCounter.record(1, null, url); } catch (e) {}
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
    try {
      for (var r = 0; r < (requests ? requests.length : 0); r++) {
        var requestUrl = (requests[r] && requests[r].url) ? requests[r].url : requests[r];
        HttpCounter.record(1, null, requestUrl);
      }
    } catch (e) {}
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
 * v4.16.37: Read-only trip evidence ring. Each row: timestamp, trigger,
 * raw Google error. Survives QuotaCircuitBreaker.reset() — this is the
 * evidence source for recurring BLOCKED:QUOTA root-cause analysis.
 * @returns {Array} 2D array, newest last
 * @customfunction
 */
function GET_QUOTA_TRIP_HISTORY() {
  var rows = [["Trip (UTC ms)", "Trigger", "Raw Google error"]];
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(QUOTA_BREAKER_CONFIG.TRIP_EVIDENCE_KEY);
    if (raw) {
      var arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        for (var i = 0; i < arr.length; i++) {
          rows.push([arr[i].ts || "", String(arr[i].trigger || "unknown"), String(arr[i].error || "")]);
        }
      }
    }
  } catch (e) {
    rows.push(["", "ERROR", String(e && e.message ? e.message : e)]);
  }
  return rows;
}

/**
 * Read-only summary of WCORE quota protection telemetry and policy.
 * Observed counters are project-local and do not represent Google's quota.
 * @param {*} refreshToken Optional caller-supplied changing cell; only its
 *   presence is checked to make spreadsheet recalculation dependencies explicit.
 * @returns {Array<Array>} Ordered metric/value rows
 * @customfunction
 */
function GET_QUOTA_PROTECTION_STATUS(refreshToken) {
  var snapshot = HttpCounter.snapshot();
  var rows = [["Observed rolling 24h calls", snapshot.total]];
  var categories = snapshot.categories;
  var categoryNames = Object.keys(categories).sort();
  for (var i = 0; i < categoryNames.length; i++) {
    rows.push(["Category " + categoryNames[i], categories[categoryNames[i]]]);
  }

  var hosts = snapshot.hosts;
  var hostNames = Object.keys(hosts).sort();
  for (var j = 0; j < hostNames.length; j++) {
    rows.push(["Host " + hostNames[j], hosts[hostNames[j]]]);
  }

  var googleBreaker = QuotaCircuitBreaker.peekStatus();
  var webBreaker = _webScanBreakerStatus_();
  rows.push(["Dropped telemetry updates", snapshot.dropped]);
  rows.push(["Google breaker status", googleBreaker.tripped ? "TRIPPED" : "OK"]);
  rows.push(["Web breaker status", webBreaker.open ? "OPEN" : "CLOSED"]);
  rows.push(["Watchdog cadence minutes", 10]);
  rows.push(["Watchdog pulse cap", WD_MAX_PULSES_PER_RUN]);
  rows.push(["Healthy freshness hours", WD_STALE_I1_HOURS]);
  rows.push(["Web error backoff", "30m,2h,6h,24h"]);
  rows.push(["Scope", "WCORE project only"]);
  rows.push(["Authority", "Observed counts are not the authoritative Google account quota"]);
  if (!snapshot.available || snapshot.corrupt) {
    rows.push(["Warning telemetry snapshot", snapshot.corrupt
      ? "CORRUPT - displayed count is a non-authoritative safe fallback"
      : "UNAVAILABLE - displayed count is a non-authoritative safe fallback"]);
  }
  if (googleBreaker.unavailable) {
    rows.push(["Warning Google breaker", "UNAVAILABLE - displayed TRIPPED is a fail-closed fallback, not an observed authoritative value"]);
  }
  if (webBreaker.unavailable) {
    rows.push(["Warning Web breaker", "UNAVAILABLE - displayed OPEN is a fail-closed fallback, not an observed authoritative value"]);
  }
  if (refreshToken == null || refreshToken === "") {
    rows.push(["Warning refresh token", "Pass a changing cell as refreshToken to refresh this diagnostic"]);
  }
  return rows;
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
  // v4.16.39: an explicit operator reset also releases the post-trip scan hold
  // (otherwise TRIP_QUOTA_BREAKER(TRUE) tests would freeze AUTO scans for 3h).
  try {
    if (typeof BudgetHTTP !== "undefined" && BudgetHTTP.clearPostTripFloor) BudgetHTTP.clearPostTripFloor();
  } catch (eFloor) {}
  
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
  // v4.16.39: a manual test trip must not silently freeze AUTO web scans for 3h.
  try {
    if (typeof BudgetHTTP !== "undefined" && BudgetHTTP.clearPostTripFloor) BudgetHTTP.clearPostTripFloor();
  } catch (eFloor) {}
  return "Circuit breaker tripped. All HTTP calls will return null. (post-trip scan hold NOT armed for a manual test trip)";
}

/**
 * v4.12.30: Test if quota is available with a REAL HTTP call
 * Use this to check quota status before starting heavy operations
 * @returns {string} "OK" if quota available, "EXHAUSTED" if not
 * In an authorized editor/admin execution, a genuine recovery also schedules
 * portfolio refresh triggers. Spreadsheet custom-function execution may only
 * report status because ScriptApp authorization can be unavailable there.
 * @customfunction
 */
function LIVE_PROBE_QUOTA_NOW() {
  var wasTripped = QuotaCircuitBreaker.isTripped();
  var isOk = QuotaCircuitBreaker.testOnce(true);
  var status = QuotaCircuitBreaker.getStatus();

  if (isOk && wasTripped && typeof _recoverySchedulePortfolioRefresh_ === "function") {
    _recoverySchedulePortfolioRefresh_();
  }

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
 * v4.15.35: Rolling-24h trigger breakdown.
 * Returns a 2-column array: [triggerName, callCount] sorted by count desc.
 * Only includes triggers with >0 calls in the rolling 24h window.
 * @returns {Array<Array>}
 * @customfunction
 */
function GET_HTTP_BREAKDOWN_24H() {
  try {
    var bt = HttpCounter.byTrigger();
    var total = HttpCounter.count();
    var rows = [["Trigger", "Calls", "%"]];
    var names = Object.keys(bt);
    names.sort(function(a, b) { return (bt[b] || 0) - (bt[a] || 0); });
    for (var i = 0; i < names.length; i++) {
      var n = bt[names[i]] || 0;
      rows.push([names[i], n, total > 0 ? Math.round(100 * n / total) + "%" : "0%"]);
    }
    rows.push(["TOTAL", total, "100%"]);
    return rows;
  } catch (e) {
    return [["ERROR", String(e.message || e)]];
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
  if (!HttpCounter.reset()) return "HTTP counter reset failed: telemetry lock or properties unavailable";
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
    // Call QuotaCircuitBreaker.testOnce() or LIVE_PROBE_QUOTA_NOW() explicitly
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
