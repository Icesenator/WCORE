/************************************************************
 * 03_HTTP.gs - Gestion des requetes HTTP (multi-chain)
 * 
 * v4.15.6 - PRICE WORKER: expose last JSON HTTP status
 *   HTTP.getJson now stores _lastJsonStatus/_lastJsonHost and applies host
 *   cooldown on 429 so background workers don't convert rate limits to
 *   false no-market prices.
 *
 * v4.15.5 - QUOTA: lightweight per-execution HTTP counters
 *   Adds Http.getStats()/resetStats() so engines can expose how many direct
 *   HTTP calls happened outside RpcClient.
 *
 * v4.15.4 - FIX: fetchAllSafe uses individual fetch for deadline enforcement
 *   UrlFetchApp.fetchAll IGNORES deadline param → slow RPCs hang 60-200s
 *   Now always uses individual UrlFetchApp.fetch() which enforces deadline
 *   Fixes Astar/Polygon/Shibarium #ERROR! caused by 200s RPC hangs
 *
 * v4.15.2 - FIX: UrlFetchApp deadline enforcement
 * - UrlFetchApp does NOT support "timeout" — uses "deadline" (seconds)
 * - Without deadline, slow RPCs could hang up to 60s, eating the 30s GAS limit
 * - Now converts timeout (ms) to deadline (seconds, min 2s, max 10s)
 * - Prevents #ERROR! on sheets caused by RPC hangs exceeding execution limit
 *
 * v4.12.10 - RESILIENT MULTI-RPC (fetchAllSafe):
 * - Added fetchAllSafe for resilient multi-RPC calls
 * - UrlFetchApp.fetchAll fails completely on single DNS error
 * - fetchAllSafe handles individual failures gracefully
 * - Returns array with nulls for failed requests
 * - Consensus logic works with RPCs that actually respond
 *
 * v4.2.3 - Renommage pour coherence (_CORE suffix)
 ************************************************************/
var HTTP_VERSION = "4.15.6";

var Http = {
 _stats: { calls: 0, fetchAllItems: 0, byHost: {} },
 _lastJsonStatus: null,
 _lastJsonHost: "",

 resetStats: function() {
 this._stats = { calls: 0, fetchAllItems: 0, byHost: {} };
 },

 getStats: function() {
 var s = this._stats || { calls: 0, fetchAllItems: 0, byHost: {} };
 var hosts = [];
 for (var h in (s.byHost || {})) {
 if (s.byHost.hasOwnProperty(h)) hosts.push(h + ":" + s.byHost[h]);
 }
 hosts.sort();
 return { calls: s.calls | 0, fetchAllItems: s.fetchAllItems | 0, hosts: hosts };
 },

 _record: function(url, count) {
 try {
 count = count || 1;
 if (!this._stats) this.resetStats();
 this._stats.calls += count;
 var host = this._hostFromUrl ? this._hostFromUrl(url) : String(url || "").split("/")[2];
 host = host || "unknown";
 this._stats.byHost[host] = (this._stats.byHost[host] || 0) + count;
 } catch (e) {}
 },

 isBlocked: function() {
 try {
 if (typeof QuotaCircuitBreaker !== 'undefined' &&
 QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped()) return true;
 } catch (eQ) {}
 try {
 if (typeof HttpErrorGuard !== 'undefined' &&
 HttpErrorGuard.isQuotaExhausted && HttpErrorGuard.isQuotaExhausted()) return true;
 } catch (eG) {}
 return false;
 },

 canFetchNow: function(reason) {
 if (this.isBlocked()) {
  try { Logger.log("[HTTP] blocked before fetch: " + String(reason || "unknown")); } catch (e) {}
  return false;
 }
 try {
 if (typeof WcoreHttpMode !== 'undefined' &&
 WcoreHttpMode.isAllowed && !WcoreHttpMode.isAllowed(reason || "other")) {
  try { Logger.log("[HTTP] mode blocked fetch: " + String(reason || "unknown")); } catch (eMLog) {}
  return false;
 }
 } catch (eM) {}
 try {
 if (typeof BudgetHTTP !== 'undefined' &&
 BudgetHTTP.allow && !BudgetHTTP.allow(reason || "other")) {
  try { Logger.log("[HTTP] budget blocked fetch: " + String(reason || "unknown")); } catch (eBLog) {}
  return false;
 }
 } catch (eB) {}
 return true;
 },
 
 _defaultOptions: function(options, config) {
 options = options || {};
 if (options.muteHttpExceptions == null) options.muteHttpExceptions = true;

 // v4.15.2: UrlFetchApp uses "deadline" (seconds), NOT "timeout" (ms)
 // Without deadline, slow RPCs can hang up to 60s, exceeding GAS 30s limit → #ERROR!
 var timeoutMs = options.timeout || options.timeoutMs
 || (config && config.TIMEOUTS && config.TIMEOUTS.HTTP_MS) || 1500;
 var deadlineSec = Math.max(2, Math.min(10, Math.ceil(timeoutMs / 1000)));
 options.deadline = deadlineSec;
 // Keep timeout for internal tracking (timer guards etc.)
 options.timeout = timeoutMs;
 return options;
 },
 
 get: function(url, options, config) {
 if (!this.canFetchNow("Http.get")) return null;
 this._record(url, 1);
 return UrlFetchApp.fetch(url, this._defaultOptions(options, config));
 },
 
 post: function(url, payload, options, config) {
 if (!this.canFetchNow("Http.post")) return null;
 this._record(url, 1);
 options = this._defaultOptions(options || {}, config);
 options.method = "post";
 if (payload !== undefined) {
 if (typeof payload === "object") {
 options.contentType = "application/json";
 options.payload = JSON.stringify(payload);
 } else {
 options.payload = payload;
 }
 }
 return UrlFetchApp.fetch(url, options);
 },
 
 rpc: function(url, method, params, id, config) {
 return this.post(url, {
 jsonrpc: "2.0",
 id: id || 1,
 method: method,
 params: params || []
 }, null, config);
 },
 
 /**
 * Original fetchAll - fails completely if ANY request has DNS/network error
 * Keep for backward compatibility but prefer fetchAllSafe for multi-RPC consensus
 */
 fetchAll: function(requests, config) {
 if (!requests || !requests.length) return [];
 if (!this.canFetchNow("Http.fetchAll")) {
 var blocked = [];
 for (var b = 0; b < requests.length; b++) blocked.push(null);
 return blocked;
 }
 var prepared = [];
 for (var i = 0; i < requests.length; i++) {
 if (!requests[i]) continue;
 prepared.push(this._defaultOptions(requests[i], config));
 }
 this._stats.fetchAllItems += prepared.length;
 return UrlFetchApp.fetchAll(prepared);
 },
 
 /**
 * v4.12.10: RESILIENT fetchAll - handles individual request failures
 * 
 * Problem: UrlFetchApp.fetchAll throws exception if ANY single request
 * has a DNS error or network failure, killing the entire batch.
 * This breaks consensus logic when 1 of 3 RPCs is down.
 * 
 * Solution: 
 * 1. First try fetchAll (fastest, parallel execution)
 * 2. If it fails, fallback to individual fetch calls
 * 3. Return array of responses with null for failed requests
 * 4. Consensus logic then works with RPCs that actually respond
 * 
 * @param {Array} requests - Array of request objects {url, method, payload, ...}
 * @param {Object} config - Chain config for timeouts
 * @returns {Array} Array of responses (same length as input, null for failures)
 */
 /**
 * v4.15.4: RESILIENT fetchAll with deadline enforcement
 *
 * CRITICAL FIX: UrlFetchApp.fetchAll IGNORES the "deadline" parameter,
 * allowing slow RPCs to hang 60-200s and cause "Exceeded maximum execution time".
 * Individual UrlFetchApp.fetch() DOES enforce deadline correctly.
 *
 * Strategy: Always use individual fetch calls for deadline enforcement.
 * The ~100ms overhead of sequential vs parallel is negligible compared
 * to the 200s hang risk from fetchAll ignoring deadline.
 */
 fetchAllSafe: function(requests, config) {
 if (!requests || !requests.length) return [];
 if (!this.canFetchNow("Http.fetchAllSafe")) {
 var blocked = [];
 for (var b = 0; b < requests.length; b++) blocked.push(null);
 return blocked;
 }

 // Prepare all requests with default options (sets deadline)
 var prepared = [];
 for (var i = 0; i < requests.length; i++) {
 if (!requests[i]) {
 prepared.push(null);
 } else {
 prepared.push(this._defaultOptions(requests[i], config));
 }
 }

 // Individual fetches with deadline enforcement
 var results = [];
 this._stats.fetchAllItems += prepared.length;
 for (var n = 0; n < prepared.length; n++) {
 var req = prepared[n];
 if (!req) {
 results.push(null);
 continue;
 }

 try {
 this._record(req.url, 1);
 var resp = UrlFetchApp.fetch(req.url, req);
 results.push(resp);
 } catch (e) {
 // Individual request failed (DNS error, timeout, etc.)
 results.push(null);
 }
 }

 return results;
 },
 
 parseJson: function(response) {
 if (!response) return null;
 if (response.getResponseCode() !== 200) return null;
 try { return JSON.parse(response.getContentText()); } catch (e) { return null; }
 },
 
 isSuccess: function(response) {
 return response && response.getResponseCode() === 200;
 },
 
 getJson: function(url, options, config) {
 try {
 var response = this.get(url, options, config);
 var host = this._hostFromUrl ? this._hostFromUrl(url) : String(url || "").split("/")[2];
 this._lastJsonHost = host || "";
 this._lastJsonStatus = response && response.getResponseCode ? response.getResponseCode() : 0;
 if (this._lastJsonStatus === 429 && this._setCooldown) this._setCooldown(host, 90);
 return this.parseJson(response);
 } catch (e) { return null; }
 },

// ----------------------------------------------------------
// Robust fetch helpers (429/5xx retry + host cooldown)
// ----------------------------------------------------------

_hostFromUrl: function(url) {
 try { return String(url || '').split('/')[2] || ''; } catch (e) { return ''; }
},

_cooldownKey: function(host) {
 return 'HTTP_COOLDOWN:' + String(host || '').toLowerCase();
},

_getCooldown: function(host) {
 try {
 var cache = CacheService.getScriptCache();
 var v = cache.get(this._cooldownKey(host));
 if (!v) return 0;
 var t = parseInt(v, 10);
 return isFinite(t) ? t : 0;
 } catch (e) { return 0; }
},

_setCooldown: function(host, seconds) {
 try {
 var sec = Math.max(1, Number(seconds || 60) || 60);
 var until = Date.now() + sec * 1000;
 CacheService.getScriptCache().put(this._cooldownKey(host), String(until), sec);
 } catch (e) {}
},

_shouldRetryCode: function(code) {
 return code === 429 || code === 500 || code === 502 || code === 503 || code === 504;
},


_getRetryAfterSec: function(resp) {
 try {
 if (!resp || typeof resp.getAllHeaders !== 'function') return 0;
 var h = resp.getAllHeaders() || {};
 var ra = h['Retry-After'] || h['retry-after'] || null;
 if (!ra) return 0;
 var n = parseInt(ra, 10);
 if (isFinite(n) && n > 0) return n;
 // Some servers send an HTTP-date; ignore (keep short backoff)
 return 0;
 } catch (e) { return 0; }
},

/**
 * Fetch with retry. Returns UrlFetchApp response or null.
 * - Retries on 429/5xx with short exponential backoff.
 * - Sets host cooldown on 429 to avoid hammering.
 * - Budget-aware if timer is provided (createTimer()).
 */
fetchWithRetry: function(url, options, config, timer) {
 if (!this.canFetchNow("Http.fetchWithRetry")) return null;
 var host = this._hostFromUrl(url);
 var cd = this._getCooldown(host);
 if (cd && Date.now() < cd) return null;

 var opt = this._defaultOptions(options || {}, config);
 var maxAttempts = (opt && opt.maxAttempts != null) ? (opt.maxAttempts | 0) : 3;
 if (maxAttempts < 1) maxAttempts = 1;
 if (maxAttempts > 4) maxAttempts = 4;

 var baseDelay = (opt && opt.retryDelayMs != null) ? Number(opt.retryDelayMs) : 250;
 if (!isFinite(baseDelay) || baseDelay < 100) baseDelay = 250;
 if (baseDelay > 2000) baseDelay = 2000;

 var lastResp = null;
 for (var i = 0; i < maxAttempts; i++) {
 try {
 if (timer && typeof timer.isLow === 'function' && timer.isLow(700)) return lastResp;
 this._record(url, 1);
 lastResp = UrlFetchApp.fetch(url, opt);
 var code = lastResp ? lastResp.getResponseCode() : 0;
 if (code === 200) return lastResp;
 if (!this._shouldRetryCode(code)) return lastResp;

 // Honor Retry-After (if provided) to reduce 429/5xx flakiness
 var raSec = this._getRetryAfterSec(lastResp);
 if (code === 429) {
 // Prefer server hint; otherwise use a conservative cooldown
 this._setCooldown(host, raSec ? Math.min(300, raSec) : 90);
 } else if (raSec) {
 this._setCooldown(host, Math.min(120, raSec));
 }
 } catch (e) {
 // network error -> retry if budget allows
 }

 // backoff
 if (i < maxAttempts - 1) {
 var jitter = Math.floor(Math.random() * 250);
 var sleepMs = Math.min(2500, Math.floor(baseDelay * Math.pow(2, i)) + jitter);
 try {
 if (timer && typeof timer.remaining === 'function' && timer.remaining() < (sleepMs + 700)) break;
 Utilities.sleep(sleepMs);
 } catch (e2) {}
 }
 }
 return lastResp;
},

/** Fetch JSON with retry; returns parsed object or null. */
fetchJsonWithRetry: function(url, options, config, timer) {
 try {
 var resp = this.fetchWithRetry(url, options, config, timer);
 return this.parseJson(resp);
 } catch (e) {
 return null;
 }
},

HEADERS:
 {
 JSON: {
 "accept": "application/json",
 "user-agent": "Mozilla/5.0 (AppsScript; +https://script.google.com)"
 }
}
};

function HTTP_USAGE_STATUS() {
 var s = (typeof Http !== 'undefined' && Http.getStats) ? Http.getStats() : null;
 if (!s) return [["Metric", "Value"], ["Status", "Http stats unavailable"]];
 var rows = [
 ["Metric", "Value"],
 ["HTTP calls", s.calls | 0],
 ["fetchAll items", s.fetchAllItems | 0]
 ];
 var hosts = s.hosts || [];
 for (var i = 0; i < hosts.length; i++) {
 rows.push(["Host", hosts[i]]);
 }
 return rows;
}


// Backward-compat alias (older engines expect global HTTP)
var HTTP = Http;
