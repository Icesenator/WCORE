/************************************************************
 * core/RPC_CORE.gs - Communication RPC (multi-chain)
 * 
 * Ce fichier contient la logique RPC generique.
 * Les endpoints sont passes via CONFIG.
 * 
 * v4.15.2 - DYNAMIC RPC MERGE:
 * - pickBest and pickForConsensus now merge dynamic RPCs from chainlist
 * - Dynamic RPCs are backup only (after hardcoded, filtered by RpcHealth)
 * - Populated by UPDATE_DYNAMIC_RPCS() trigger (33_DYNAMIC_RPC.gs)
 *
 * v4.15.1 - STRICT MAJORITY CONSENSUS:
 * - batchWithConsensus: bestCount * 2 > values.length (was >= 2)
 * - batchMajority: bestCnt * 2 > finalVals.length (was >= 2)
 * - Prevents 2/4 ties from counting as consensus
 *
 * v4.12.22 - ESCALATING BLOCK DURATION:
 * - 2 failures ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 30 min block
 * - 4 failures ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 2h block
 * - 6+ failures ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 6h block (max)
 * - RPCs giving stale/wrong data stay blocked much longer
 * - Failures accumulate across runs (persisted in cache)
 *
 * v4.12.11 - CRITICAL FIX: Global consensus defaults
 * - pickForConsensus defaults changed: min=2, max=3 (was 1, 2)
 * - isLikelySlow threshold increased to 2 failures (was 1)
 * - Fixed issue where consensus returned only 1 RPC
 * - Consensus now works properly even without chain-specific config
 * - This prevents token detection failures across ALL chains
 * 
 * v4.10.4 - FIX: Added RpcHealth.list() and RpcHealth.getScore():
 * - list(config) returns array of all RPCs with their health state
 * - getScore(config) returns global health score (0-100) for all RPCs
 * - FIXED: RPC.health_score now works in *_STATS functions (was N/A)
 * (Changelog v4.9.1..v4.9.3: 2 entries removed for brevity)
 ************************************************************/
var RPC_VERSION = "4.15.33";

var MULTICALL3_VERSION = "4.15.49";

var Multicall3 = {
  ADDRESS: "0xcA11bde05977b3631167028862bE2a173976CA11",
  TRY_AGGREGATE_SELECTOR: "0xbce38bd7",

  _strip0x: function(hex) {
    return String(hex || "").replace(/^0x/i, "").toLowerCase();
  },

  _leftPad: function(hex, bytes) {
    bytes = bytes || 32;
    return this._strip0x(hex).padStart(bytes * 2, "0");
  },

  _rightPadWord: function(hex) {
    var clean = this._strip0x(hex);
    var padded = Math.ceil(clean.length / 64) * 64;
    return clean.padEnd(padded, "0");
  },

  encodeTryAggregate: function(requireSuccess, calls) {
    calls = calls || [];
    var head = this._leftPad(requireSuccess ? "1" : "0") + this._leftPad("40");
    var arrayLen = this._leftPad(calls.length.toString(16));
    var offsets = [];
    var cursor = calls.length * 32;
    var tails = "";

    for (var i = 0; i < calls.length; i++) {
      var c = calls[i] || {};
      var cleanData = this._strip0x(c.callData);
      var dataLen = cleanData.length / 2;
      var paddedData = this._rightPadWord(cleanData);
      var target = this._leftPad(c.target);
      var structEnc = target + this._leftPad("40") + this._leftPad(dataLen.toString(16)) + paddedData;
      offsets.push(cursor);
      tails += structEnc;
      cursor += structEnc.length / 2;
    }

    var offsetsHex = "";
    for (var j = 0; j < offsets.length; j++) offsetsHex += this._leftPad(offsets[j].toString(16));
    return this.TRY_AGGREGATE_SELECTOR + head + arrayLen + offsetsHex + tails;
  },

  decodeTryAggregateResult: function(hex) {
    var clean = this._strip0x(hex);
    if (clean.length < 128) return [];
    var arrayLen = parseInt(clean.slice(64, 128), 16);
    var tupleStartChar = 128;
    if (!isFinite(arrayLen) || arrayLen < 0 || arrayLen > 512) return [];
    if (tupleStartChar + arrayLen * 64 > clean.length) return [];

    var results = [];
    for (var i = 0; i < arrayLen; i++) {
      var headOffsetHex = clean.slice(tupleStartChar + i * 64, tupleStartChar + (i + 1) * 64);
      var headOffset = parseInt(headOffsetHex, 16);
      if (!isFinite(headOffset)) {
        results.push({ success: false, returnData: "0x" });
        continue;
      }
      var resultStart = tupleStartChar + headOffset * 2;
      if (resultStart + 192 > clean.length) {
        results.push({ success: false, returnData: "0x" });
        continue;
      }
      var success = parseInt(clean.slice(resultStart, resultStart + 64), 16) !== 0;
      var bytesLen = parseInt(clean.slice(resultStart + 128, resultStart + 192), 16);
      var dataStart = resultStart + 192;
      var dataEnd = dataStart + bytesLen * 2;
      if (!isFinite(bytesLen) || bytesLen < 0 || dataEnd > clean.length) {
        results.push({ success: false, returnData: "0x" });
        continue;
      }
      var data = clean.slice(dataStart, dataEnd);
      results.push({ success: success, returnData: "0x" + data });
    }
    return results;
  },

  call: function(rpc, calls, timer, config) {
    if (!rpc) throw new Error("RPC unavailable");
    calls = calls || [];
    if (!calls.length) return [];
    if (config && config.RPC && config.RPC.DISABLE_MULTICALL3) throw new Error("Multicall3 disabled");
    if (typeof RpcHealth !== "undefined" && !RpcHealth.isHealthy(rpc, config)) throw new Error("RPC blocked");

    var payload = {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{
        to: this.ADDRESS,
        data: this.encodeTryAggregate(false, calls)
      }, "latest"]
    };

    var timeout = (config && config.TIMEOUTS && config.TIMEOUTS.HTTP_MS) || 2500;
    var resp;
    try {
      resp = Http.post(rpc, payload, { timeout: timeout, muteHttpExceptions: true }, config);
    } catch (ePost) {
      if (typeof RpcHealth !== "undefined") RpcHealth.recordFailure(rpc, config);
      throw ePost;
    }

    if (!resp) { if (typeof RpcHealth !== "undefined") RpcHealth.recordFailure(rpc, config); throw new Error("multicall3 empty response"); }
    var code = resp.getResponseCode();
    if (code !== 200) { if (typeof RpcHealth !== "undefined") RpcHealth.recordFailure(rpc, config); throw new Error("multicall3 http " + code); }

    var json;
    try { json = JSON.parse(resp.getContentText()); }
    catch (eJson) { if (typeof RpcHealth !== "undefined") RpcHealth.recordFailure(rpc, config); throw eJson; }

    if (!json || json.error) {
      if (typeof RpcHealth !== "undefined") RpcHealth.recordFailure(rpc, config);
      throw new Error((json && json.error && json.error.message) || "multicall3 rpc error");
    }
    if (!json.result) { if (typeof RpcHealth !== "undefined") RpcHealth.recordFailure(rpc, config); throw new Error("multicall3 missing result"); }

    var decoded = this.decodeTryAggregateResult(json.result);
    if (decoded.length !== calls.length) {
      if (typeof RpcHealth !== "undefined") RpcHealth.recordFailure(rpc, config);
      throw new Error("multicall3 result length mismatch");
    }
    if (typeof RpcHealth !== "undefined") RpcHealth.recordSuccess(rpc);
    return decoded;
  }
};

function DIAG_MULTICALL3_CODEC() {
  var calls = [
    { target: "0x0000000000000000000000000000000000000001", callData: "0x70a082310000000000000000000000001111111111111111111111111111111111111111" },
    { target: "0x0000000000000000000000000000000000000002", callData: "0x313ce567" }
  ];
  var encoded = Multicall3.encodeTryAggregate(false, calls);
  var nominal = "0x" +
    Multicall3._leftPad("20") +
    Multicall3._leftPad("1") +
    Multicall3._leftPad("20") +
    Multicall3._leftPad("1") +
    Multicall3._leftPad("40") +
    Multicall3._leftPad("2") +
    Multicall3._rightPadWord("1234");
  var decodedNominal = Multicall3.decodeTryAggregateResult(nominal);
  return [
    ["encoded_prefix", encoded.substring(0, 10)],
    ["contains_selector", encoded.indexOf(Multicall3.TRY_AGGREGATE_SELECTOR) === 0 ? "YES" : "NO"],
    ["length_even", encoded.length % 2 === 0 ? "YES" : "NO"],
    ["decode_nominal_len", decodedNominal.length],
    ["decode_nominal_success", decodedNominal[0] && decodedNominal[0].success ? "YES" : "NO"],
    ["decode_nominal_data", decodedNominal[0] ? decodedNominal[0].returnData : ""],
    ["decode_short_empty", Multicall3.decodeTryAggregateResult("0x1234").length === 0 ? "YES" : "NO"]
  ];
}

// ============================================================
// RPC HEALTH TRACKER
// ============================================================

var RpcHealth = {
  _state: {},

  /**
   * v4.15.40 - Mark an RPC as returning stale data (returned old cached value
   * while other RPCs returned a newer value). Accumulates hits; when threshold
   * is reached the RPC is deprioritized in pickForConsensus.
   */
  recordStaleHit: function(rpc) {
    if (!rpc) return;
    if (!this._state[rpc]) this._state[rpc] = { failures: 0, lastFailure: 0, blocked: false, staleHits: 0, freshHits: 0 };
    this._state[rpc].staleHits = (this._state[rpc].staleHits || 0) + 1;
  },

  recordFreshHit: function(rpc) {
    if (!rpc) return;
    if (!this._state[rpc]) this._state[rpc] = { failures: 0, lastFailure: 0, blocked: false, staleHits: 0, freshHits: 0 };
    this._state[rpc].freshHits = (this._state[rpc].freshHits || 0) + 1;
    if (this._state[rpc].freshHits >= 3) { this._state[rpc].staleHits = 0; this._state[rpc].freshHits = 0; }
  },

  isStale: function(rpc) {
    if (!rpc) return false;
    var h = this._state[rpc];
    if (!h) return false;
    return (h.staleHits || 0) >= 2;
  },

 /**
 * Quick health score for a single RPC URL based on local cached failures.
 * 100 = healthy, lower = failures/blocked. This is intentionally cheap.
 * v4.12.22: Increased penalty per failure to match escalating blocks
 */
 getHealthScore: function(rpc, config) {
 if (!rpc) return 100;
 var h = this._state[rpc];
 if (!h) return 100;
 var failures = (h.failures || 0) | 0;
 // v4.12.22: Harsher penalty - each failure costs 20 points (was 15)
 var score = 100 - failures * 20;
 if (h.blocked) score -= 50; // Blocked = extra 50 point penalty (was 40)
 if (score < 0) score = 0;
 if (score > 100) score = 100;
 return score;
 },
 
 recordFailure: function(rpc, config) {
 if (!rpc) return;
 if (!this._state[rpc]) this._state[rpc] = { failures: 0, lastFailure: 0, blocked: false };
 var h = this._state[rpc];
 h.failures = (h.failures || 0) + 1;
 h.lastFailure = Date.now();
 // v4.9.1: Reduced threshold - block faster
 var maxFailures = (config && config.RPC && config.RPC.MAX_FAILURES_BEFORE_BLOCK) || 2;
 if (h.failures >= maxFailures) h.blocked = true;
 },
 
 recordSuccess: function(rpc) {
 if (!rpc) return;
 if (!this._state[rpc]) this._state[rpc] = { failures: 0, lastFailure: 0, blocked: false };
 this._state[rpc].failures = 0;
 this._state[rpc].blocked = false;
 },
 
 isHealthy: function(rpc, config) {
 var h = this._state[rpc];
 if (!h || !h.blocked) return true;
 
 // v4.12.22: ESCALATING BLOCK DURATION based on failure count
 // More failures = longer block (stale RPCs stay blocked longer)
 var failures = h.failures || 0;
 var blockDuration;
 if (failures >= 6) {
 blockDuration = 6 * 3600 * 1000; // 6h for chronic offenders
 } else if (failures >= 4) {
 blockDuration = 2 * 3600 * 1000; // 2h for repeat offenders
 } else {
 blockDuration = 30 * 60 * 1000; // 30 min for first block
 }
 
 // Allow config override (but use as minimum, not replacement)
 var configDuration = (config && config.RPC && config.RPC.BLOCK_DURATION_MS) || 0;
 if (configDuration > blockDuration) blockDuration = configDuration;
 
 var age = Date.now() - (h.lastFailure || 0);
 if (age > blockDuration) {
 h.blocked = false;
 // v4.15.3: Keep failure count intact — next failure immediately
 // re-blocks at the escalated duration. Prevents chronic bad RPCs
 // (e.g. from chainlist) from cycling blocked/unblocked endlessly.
 return true;
 }
 return false;
 },
 
 /**
 * v4.12.11: Check if RPC is likely to be slow based on recent failures
 * CHANGED: Now requires 2+ failures (was 1) to be considered slow
 * This prevents over-filtering when RPCs have occasional hiccups
 */
 isLikelySlow: function(rpc, config) {
 if (!rpc) return false;
 var h = this._state[rpc];
 if (!h) return false;
 // v4.12.11: Increased threshold from 1 to 2
 return (h.failures || 0) >= 2;
 },
 
 loadFromCache: function(timer, config) {
 var key;
 try { key = CacheManager.rpcHealthKey(config); } catch(e) { key = "RPC_HEALTH_" + (config && config.CHAIN && config.CHAIN.CHAIN_ID || "UNKNOWN"); }
 var saved = CacheManager.safeGetJson(key, timer, config);
 if (!saved || typeof saved !== "object") return;
 var self = this;
 Obj.forEach(saved, function(rpc, data) {
 if (!data) return;
 self._state[rpc] = { failures: data.failures || 0, lastFailure: data.lastFailure || 0, blocked: true };
 });
 },

 saveToCache: function(config) {
 var key;
 try { key = CacheManager.rpcHealthKey(config); } catch(e) { key = "RPC_HEALTH_" + (config && config.CHAIN && config.CHAIN.CHAIN_ID || "UNKNOWN"); }

 var toSave = {};
 var self = this;
 Obj.forEach(this._state, function(rpc, data) {
 if (data && data.blocked) toSave[rpc] = { failures: data.failures || 0, lastFailure: data.lastFailure || 0 };
 });
 if (Obj.keyCount(toSave) > 0) CacheManager.safeSetJson(key, toSave, config);
 else CacheManager.delete(key);
 },
 
 reset: function() { this._state = {}; },
 
 /**
 * v4.9.1: Get list of healthy RPCs only
 */
 getHealthyRpcs: function(rpcList, config) {
 var healthy = [];
 for (var i = 0; i < rpcList.length; i++) {
 if (this.isHealthy(rpcList[i], config)) {
 healthy.push(rpcList[i]);
 }
 }
 return healthy;
 },
 
 /**
 * v4.10.4: List all RPCs from config with their health state
 * Used by getStats() for RPC.blocked count
 * @param {Object} config - Chain config with RPC.ENDPOINTS
 * @returns {Array} Array of {url, failures, blocked, score}
 */
 list: function(config) {
 var result = [];
 var endpoints = (config && config.RPC && config.RPC.ENDPOINTS) || [];
 var self = this;
 
 for (var i = 0; i < endpoints.length; i++) {
 var rpc = endpoints[i];
 var h = self._state[rpc] || { failures: 0, blocked: false };
 result.push({
 url: rpc,
 failures: h.failures || 0,
 blocked: !!h.blocked,
 score: self.getHealthScore(rpc, config)
 });
 }
 return result;
 },
 
 /**
 * v4.10.4: Global health score across all configured RPCs
 * Returns average health score of all RPC endpoints
 * @param {Object} config - Chain config with RPC.ENDPOINTS
 * @returns {number} Score 0-100
 */
 getScore: function(config) {
 var endpoints = (config && config.RPC && config.RPC.ENDPOINTS) || [];
 if (!endpoints.length) return 100; // No RPCs configured = assume healthy
 
 var totalScore = 0;
 var self = this;
 
 for (var i = 0; i < endpoints.length; i++) {
 totalScore += self.getHealthScore(endpoints[i], config);
 }
 
 return Math.round(totalScore / endpoints.length);
 }
};

// ============================================================
// RPC SELECTOR - Selection intelligente
// ============================================================

var RpcSelector = {
 
 pickBest: function(userRpc, config) {
 // v4.9.3: Use benchmark cache if available
 var benchmarked = [];
 if (typeof RpcBenchmark !== 'undefined' && RpcBenchmark.hasFreshCache && RpcBenchmark.hasFreshCache(config)) {
 benchmarked = RpcBenchmark.getOrderedRpcs(config);
 if (benchmarked.length > 0) {
 // Prefer user RPC if provided and healthy
 if (userRpc && RpcHealth.isHealthy(userRpc, config)) {
 return userRpc;
 }
 // Return fastest benchmarked RPC
 for (var b = 0; b < benchmarked.length; b++) {
 if (RpcHealth.isHealthy(benchmarked[b], config)) {
 return benchmarked[b];
 }
 }
 }
 }
 
 // Fallback to original logic if no benchmark cache
 var endpoints = (config && config.RPC && config.RPC.ENDPOINTS) || [];

 // v4.15.3: Merge chainlist RPCs (priority) + hardcoded (fallback)
 // Uses L1 CacheService for fast reads — avoids slow ScriptProperties in hot path
 if (typeof _getDynamicRpcsMerged === "function") {
 try { endpoints = _getDynamicRpcsMerged(endpoints, config); } catch (e) {}
 }

 var candidates = [];
 var seen = {};

 if (userRpc) {
 var u = String(userRpc).trim();
 if (u) { candidates.push(u); seen[u] = true; }
 }
 for (var i = 0; i < endpoints.length; i++) {
 var rpc = endpoints[i];
 if (!seen[rpc]) { candidates.push(rpc); seen[rpc] = true; }
 }
 if (!candidates.length) return "";
 
 var healthy = [], maybe = [];
 for (var j = 0; j < candidates.length; j++) {
 if (RpcHealth.isHealthy(candidates[j], config)) {
 // v4.9.1: Prefer RPCs without recent failures
 if (!RpcHealth.isLikelySlow(candidates[j], config)) {
 healthy.unshift(candidates[j]); // Add to front
 } else {
 healthy.push(candidates[j]); // Add to back
 }
 } else {
 maybe.push(candidates[j]);
 }
 }
 
 var pool = healthy.length ? healthy : maybe;
 if (!pool.length) return candidates[0];
 
 // v4.9.1: Simplified - just return first healthy RPC (usually fastest)
 return pool[0];
 },
 
 /**
 * v4.12.11: CRITICAL FIX - Pick RPCs for consensus voting
 * 
 * CHANGES:
 * - Default CONSENSUS_MIN_RPCS: 2 (was 1)
 * - Default CONSENSUS_MAX_RPCS: 3 (was 2)
 * - Fixed filtering logic to ensure we return at least minRpcs
 * - Prefer fast healthy RPCs, but fall back to slow/blocked if needed
 * - This ensures consensus works properly across ALL chains
 * 
 * @param {string} userRpc - User-provided RPC (optional)
 * @param {number} count - Desired number of RPCs
 * @param {Object} config - Chain config
 * @returns {Array} Array of RPC URLs for consensus
 */
 pickForConsensus: function(userRpc, count, config) {
 // v4.12.11: CRITICAL FIX - Better defaults for consensus
 // Previously min=1, max=2 which broke consensus when only 1 RPC selected
 var minRpcs = (config && config.RPC && config.RPC.CONSENSUS_MIN_RPCS) || 2; // Changed from 1 to 2
 var maxRpcs = (config && config.RPC && config.RPC.CONSENSUS_MAX_RPCS) || 3; // Changed from 2 to 3
 
 // Ensure count is within bounds
 count = count || 2;
 if (count < minRpcs) count = minRpcs;
 if (count > maxRpcs) count = maxRpcs;
 
 var endpoints = (config && config.RPC && config.RPC.ENDPOINTS) || [];

 // v4.15.3: Merge chainlist RPCs (priority) + hardcoded (fallback)
 // Uses L1 CacheService for fast reads — avoids slow ScriptProperties in hot path
 if (typeof _getDynamicRpcsMerged === "function") {
 try { endpoints = _getDynamicRpcsMerged(endpoints, config); } catch (e) {}
 }

 var candidates = [];
 var seen = {};

 // Build candidate list
 if (userRpc) {
 var u = String(userRpc).trim();
 if (u && !seen[u]) { candidates.push(u); seen[u] = true; }
 }
 for (var i = 0; i < endpoints.length; i++) {
 var rpc = endpoints[i];
 if (!seen[rpc]) { candidates.push(rpc); seen[rpc] = true; }
 }
 
 if (!candidates.length) return [];
 
 // v4.12.11: Get ALL healthy RPCs first (don't filter by isLikelySlow initially)
 var healthy = [];
 for (var j = 0; j < candidates.length; j++) {
 if (RpcHealth.isHealthy(candidates[j], config)) {
 healthy.push(candidates[j]);
 }
 }
 
 // v4.12.11: If we have enough healthy RPCs, prefer non-slow ones
 if (healthy.length >= count) {
 // Separate fast and slow healthy RPCs
 var fastHealthy = [];
 var slowHealthy = [];
 
 for (var k = 0; k < healthy.length; k++) {
 if (!RpcHealth.isLikelySlow(healthy[k], config)) {
 fastHealthy.push(healthy[k]);
 } else {
 slowHealthy.push(healthy[k]);
 }
 }
 
 // If we have enough fast healthy RPCs, use them
 if (fastHealthy.length >= count) {
 return fastHealthy.slice(0, count);
 }
 
 // Otherwise combine fast + slow healthy RPCs
 var result = fastHealthy.slice();
 for (var m = 0; m < slowHealthy.length && result.length < count; m++) {
 result.push(slowHealthy[m]);
 }
 return result.slice(0, count);
 }
 
 // Fallback: include blocked RPCs if not enough healthy
 // This ensures we always try to return at least minRpcs
 if (healthy.length < count) {
 for (var l = 0; l < candidates.length; l++) {
 if (healthy.indexOf(candidates[l]) < 0) {
 healthy.push(candidates[l]);
 }
 }
 }
 
  return healthy.slice(0, count);
  }
};

// ============================================================
// BLOCKSCOUT RPC FALLBACK (v4.15.50)
// Derives a JSON-RPC proxy URL from a Blockscout explorer.
// Used as last-resort RPC for chains with no working public RPC.
// ============================================================

/**
 * Returns a Blockscout JSON-RPC proxy URL for the chain, or null.
 * Priority:
 *   1. config.RPC.BLOCKSCOUT_RPC (explicit override) — returned as-is.
 *   2. config.ACTIVITY_EXPLORER with TYPE "blockscout" + BASE_URL — derives {BASE_URL}/api/eth-rpc.
 */
function _deriveBlockscoutRpc(config) {
  try {
    if (config && config.RPC && config.RPC.BLOCKSCOUT_RPC) {
      return String(config.RPC.BLOCKSCOUT_RPC).trim();
    }
    var exp = config && config.ACTIVITY_EXPLORER;
    if (exp && String(exp.TYPE || "").toLowerCase() === "blockscout" && exp.BASE_URL) {
      var base = String(exp.BASE_URL).trim().replace(/\/+$/, "");
      if (base) return base + "/api/eth-rpc";
    }
  } catch (e) {}
  return null;
}

// ============================================================
// RPC CLIENT - Appels RPC
// ============================================================

var RpcClient = {
 _dedupStats: { total: 0, saved: 0 },
 _latency: { calls: 0, totalMs: 0, maxMs: 0, lastMs: 0, batchCalls: 0 },
 
 resetStats: function() {
 this._dedupStats = { total: 0, saved: 0 };
 this._latency = { calls: 0, totalMs: 0, maxMs: 0, lastMs: 0, batchCalls: 0 };
 },
 getStats: function() { return this._dedupStats; },
 getLatencyStats: function() {
 var l = this._latency || { calls: 0, totalMs: 0, maxMs: 0, lastMs: 0, batchCalls: 0 };
 var avg = (l.calls > 0) ? (l.totalMs / l.calls) : 0;
 return { calls: l.calls|0, batchCalls: l.batchCalls|0, totalMs: l.totalMs|0, avgMs: Math.round(avg), maxMs: l.maxMs|0, lastMs: l.lastMs|0 };
 },

 /**
 * Convenience wrapper: native balance fetcher (moved to BalanceFetcher in 08_ASSETS).
 * Keeps backward-compat with older engines calling RpcClient.getNativeBalance(...).
 *
 * Supported signatures:
 * getNativeBalance(address, userRpc, timer, config)
 * getNativeBalance(address, userRpc, timer, rpcCount, config)
 */
 getNativeBalance: function(address, userRpc, timer, configOrCount, maybeConfig) {
 var rpcCount = 3;
 var config = configOrCount;
 if (typeof configOrCount === "number") { rpcCount = configOrCount; config = maybeConfig; }
 if (typeof BalanceFetcher !== 'undefined' && BalanceFetcher.getNativeBalance) {
 return BalanceFetcher.getNativeBalance(address, userRpc, timer, rpcCount, config);
 }
 // Fallback simple implementation
 var rpc = this.pickBest ? this.pickBest(userRpc, config) : (userRpc || (config && config.RPC && config.RPC.ENDPOINTS && config.RPC.ENDPOINTS[0]) || "");
 if (!rpc) throw new Error("RPC unavailable");
 var result = this.call(rpc, "eth_getBalance", [address, "latest"], timer, 1, config);
 var raw = BigInt(result || "0x0");
 var decimals = (config && config.CHAIN && config.CHAIN.NATIVE_DECIMALS) || 18;
 return { balance: BigNum.toDecimal(raw, decimals), source: "single" };
 },

 call: function(rpc, method, params, timer, maxRetries, config) {
 if (!rpc) throw new Error("RPC unavailable");
 // v4.9.1: Reduce retries when time is tight
 maxRetries = maxRetries || 1;
 if (timer && timer.isLow(4000)) maxRetries = 1;
 
 var lastErr = null;
 for (var attempt = 0; attempt < maxRetries; attempt++) {
 if (timer && timer.isLow(1500)) break; // v4.9.1: Reduced from 2000
 var t0 = Date.now();
 try {
 // Use fast-fail timeout if available
 var fastFailMs = (config && config.TIMEOUTS && config.TIMEOUTS.FAST_FAIL_MS) || null;
 var httpMs = (config && config.TIMEOUTS && config.TIMEOUTS.HTTP_MS) || 1500;
 var effectiveTimeout = fastFailMs ? Math.min(fastFailMs, httpMs) : httpMs;
 
 var resp = Http.rpc(rpc, method, params, 1, { 
 timeout: effectiveTimeout,
 muteHttpExceptions: true 
 });
 this._latency.calls++;
 var elapsed = Date.now() - t0;
 this._latency.totalMs += elapsed;
 this._latency.lastMs = elapsed;
 if (elapsed > this._latency.maxMs) this._latency.maxMs = elapsed;
 
 if (!resp) { RpcHealth.recordFailure(rpc, config); lastErr = new Error("empty"); continue; }
 var code = resp.getResponseCode();
 if (code !== 200) { RpcHealth.recordFailure(rpc, config); lastErr = new Error("http " + code); continue; }
 var json = JSON.parse(resp.getContentText());
 if (json.error) { RpcHealth.recordFailure(rpc, config); lastErr = new Error(json.error.message || "rpc error"); continue; }
 RpcHealth.recordSuccess(rpc);
 return json.result;
 } catch (e) {
 RpcHealth.recordFailure(rpc, config);
 lastErr = e;
 }
 // v4.9.1: Reduced sleep between retries
 if (attempt < maxRetries - 1) Utilities.sleep(150);
 }
 if (lastErr) throw lastErr;
 throw new Error("RPC call failed");
 },
 
batchCall: function(rpc, calls, timer, config) {
 if (!rpc) throw new Error("RPC unavailable");
 calls = calls || [];
 if (!calls.length) return [];

 if (config && config.RPC && config.RPC.DISABLE_JSON_RPC_BATCH && this.batchCallIndividual) {
 var individual = this.batchCallIndividual(rpc, calls, timer, config);
 return individual.map(function(item) {
 return item && item.error ? { error: item.error, result: null } : { error: null, result: item ? item.result : null };
 });
 }
 
 // v4.9.1: Skip if RPC is blocked
 if (!RpcHealth.isHealthy(rpc, config)) {
 throw new Error("RPC blocked");
 }
 
 var payload = [];
 for (var i = 0; i < calls.length; i++) {
 payload.push({ jsonrpc: "2.0", id: i + 1, method: calls[i].method, params: calls[i].params });
 }
 
 var t0 = Date.now();
 var resp;
 try {
 resp = Http.post(rpc, payload, null, config);
 } catch (e) {
 RpcHealth.recordFailure(rpc, config);
 throw e;
 }
 
 this._latency.batchCalls++;
 var elapsed = Date.now() - t0;
 this._latency.totalMs += elapsed;
 this._latency.lastMs = elapsed;
 if (elapsed > this._latency.maxMs) this._latency.maxMs = elapsed;
 
 if (!resp || resp.getResponseCode() !== 200) { RpcHealth.recordFailure(rpc, config); throw new Error("batch http " + (resp ? resp.getResponseCode() : "null")); }
 var arr;
 try { arr = JSON.parse(resp.getContentText()); } catch (e) { RpcHealth.recordFailure(rpc, config); throw e; }
 if (!Array.isArray(arr)) { RpcHealth.recordFailure(rpc, config); throw new Error("batch not array"); }
 RpcHealth.recordSuccess(rpc);
 
 var out = new Array(calls.length);
 for (var j = 0; j < arr.length; j++) {
 var item = arr[j];
 if (!item || item.id == null) continue;
 var idx = item.id - 1;
 if (idx >= 0 && idx < calls.length) {
 out[idx] = item.error ? { error: item.error, result: null } : { error: null, result: item.result };
 }
 }
  return out;
  },

  multicall3: function(rpc, calls, timer, config) {
  return Multicall3.call(rpc, calls, timer, config);
  },

  batchCallIndividual: function(rpc, calls, timer, config) {
 if (!rpc) throw new Error("RPC unavailable");
 calls = calls || [];
 if (!calls.length) return [];

 if (!RpcHealth.isHealthy(rpc, config)) {
 throw new Error("RPC blocked");
 }

 var nonce = String(Date.now());
 try {
 if (typeof Utilities !== "undefined" && Utilities.getUuid) nonce = Utilities.getUuid();
 } catch (eUuid) {}

 var requests = [];
 for (var i = 0; i < calls.length; i++) {
 var original = calls[i] || {};
 var originalId = (original.id !== undefined) ? original.id : i;
 requests.push({
 url: rpc,
 method: "post",
 contentType: "application/json",
 payload: JSON.stringify({ jsonrpc: "2.0", id: originalId, method: original.method, params: original.params }),
 headers: {
 "Cache-Control": "no-cache, no-store, max-age=0",
 "Pragma": "no-cache",
 "Expires": "0",
 "X-WCORE-RPC-NONCE": nonce + ":" + i
 },
 muteHttpExceptions: true
 });
 }

 var t0 = Date.now();
 var responses = [];
 try {
 responses = Http.fetchAll ? Http.fetchAll(requests, config) : UrlFetchApp.fetchAll(requests);
 } catch (eAll) {
 responses = [];
 for (var r = 0; r < requests.length; r++) {
 if (timer && timer.isLow && timer.isLow(1200)) { responses.push(null); continue; }
 try {
 var opts = Http._defaultOptions ? Http._defaultOptions(requests[r], config) : requests[r];
 responses.push(UrlFetchApp.fetch(rpc, opts));
 } catch (eOne) {
 responses.push(null);
 }
 }
 }

 this._latency.batchCalls++;
 var elapsed = Date.now() - t0;
 this._latency.totalMs += elapsed;
 this._latency.lastMs = elapsed;
 if (elapsed > this._latency.maxMs) this._latency.maxMs = elapsed;

 var out = new Array(calls.length);
 var successCount = 0;
 for (var j = 0; j < responses.length; j++) {
 var originalCall = calls[j] || {};
 var responseId = (originalCall.id !== undefined) ? originalCall.id : j;
 var resp = responses[j];
 if (!resp || resp.getResponseCode() !== 200) {
 out[j] = { id: responseId, error: { message: "individual http " + (resp ? resp.getResponseCode() : "null") }, result: null };
 continue;
 }
 try {
 var item = JSON.parse(resp.getContentText());
 out[j] = item && item.error ? { id: responseId, error: item.error, result: null } : { id: responseId, result: item ? item.result : null };
 if (item && !item.error && item.result) successCount++;
 } catch (eParse) {
 out[j] = { id: responseId, error: { message: "individual parse error" }, result: null };
 }
 }
 if (successCount > 0) RpcHealth.recordSuccess(rpc);
 else RpcHealth.recordFailure(rpc, config);
 return out;
 },

batchCallChunked: function(rpc, calls, maxBatchSize, timer, config) {
 if (!rpc) throw new Error("RPC unavailable");
 calls = calls || [];
 if (!calls.length) return [];

 if (config && config.RPC && config.RPC.DISABLE_JSON_RPC_BATCH && this.batchCallIndividual) {
 return this.batchCallIndividual(rpc, calls, timer, config);
 }

 var limit = Number(maxBatchSize || 0);
 if (!isFinite(limit) || limit <= 0 || limit >= calls.length) {
  var one = this.batchCall(rpc, calls, timer, config);
  return one.map(function(item, idx) {
   var original = calls[idx] || {};
   var originalId = (original.id !== undefined) ? original.id : idx;
   return item && item.error ? { id: originalId, error: item.error, result: null } : { id: originalId, result: item ? item.result : null };
  });
 }

 var merged = [];
 for (var start = 0; start < calls.length; start += limit) {
  if (timer && timer.isLow && timer.isLow(1200)) break;
  var chunk = calls.slice(start, start + limit);
  var part = this.batchCall(rpc, chunk, timer, config);
  for (var i = 0; i < part.length; i++) {
   var original = calls[start + i] || {};
   var originalId = (original.id !== undefined) ? original.id : (start + i);
   var item = part[i];
   merged.push(item && item.error ? { id: originalId, error: item.error, result: null } : { id: originalId, result: item ? item.result : null });
  }
 }
 return merged;
 },
 
 /**
 * Batch with consensus - queries multiple RPCs and returns majority-voted results
 * v4.12.11: Uses fetchAllSafe for resilience against individual RPC failures
 */
 batchWithConsensus: function(userRpc, calls, timer, config) {
 calls = calls || [];
 if (!calls.length) return [];

 var rpcCount = (config && config.RPC && config.RPC.CONSENSUS_COUNT) || 2;
 if (timer && timer.isLow(6000)) rpcCount = 1;
 // v4.15.4: Without timer, skip consensus — use 1 RPC to avoid sequential hangs
 // GAS deadline param is non-functional, so each slow RPC can hang 60s+
 if (!timer) rpcCount = 2; // v4.15.33: single-RPC poison risk → 2 RPCs with early-abort

 var _t0 = Date.now();
 var rpcList = RpcSelector.pickForConsensus(userRpc, rpcCount, config);
 if (!rpcList.length) rpcList = [(userRpc || (config && config.RPC && config.RPC.ENDPOINTS && config.RPC.ENDPOINTS[0]))];
 // v4.15.4: Enforce rpcCount after pickForConsensus (which has its own minRpcs=2)
 if (rpcCount === 1 && rpcList.length > 1) rpcList = rpcList.slice(0, 1);
 var _t1 = Date.now();

 var payload = [];
 for (var i = 0; i < calls.length; i++) {
 payload.push({ jsonrpc: "2.0", id: i + 1, method: calls[i].method, params: calls[i].params });
 }
 var body = JSON.stringify(payload);

 // v4.15.4: Individual fetch with early-abort instead of fetchAllSafe
 // GAS deadline param doesn't work — we can't timeout individual fetches.
 // But we CAN skip remaining RPCs once we have a successful result,
 // and track elapsed time to abort before hitting GAS 30s limit.
 var responses = [];
 var maxElapsedMs = timer ? 12000 : 8000; // 8s budget without timer (leaves room for other ops)
 var gotSuccess = false;
 for (var r = 0; r < rpcList.length; r++) {
 var elapsed = Date.now() - _t1;
 // Skip remaining RPCs if we already have a success or exceeded budget
 if (gotSuccess || elapsed > maxElapsedMs) {
 responses.push(null);
 continue;
 }
 try {
 var opts = Http._defaultOptions({ url: rpcList[r], method: "post", contentType: "application/json", payload: body, muteHttpExceptions: true }, config);
 var resp = UrlFetchApp.fetch(rpcList[r], opts);
 responses.push(resp);
 if (resp && resp.getResponseCode() === 200) {
 gotSuccess = true;
 RpcHealth.recordSuccess(rpcList[r]);
 }
 } catch (e) {
 responses.push(null);
 RpcHealth.recordFailure(rpcList[r], config);
 }
 }
 var _t2 = Date.now();
 var _chainName = (config && config.CHAIN && config.CHAIN.NAME) || "?";
 console.log("[RPC_TIMING] " + _chainName + " | pick=" + (_t1-_t0) + "ms fetch=" + (_t2-_t1) + "ms rpcs=" + rpcList.length + " urls=" + rpcList.join(","));
 
 var perRpcById = [];
 var map;
 for (var k = 0; k < responses.length; k++) {
 var rpcUsed = rpcList[k];
 try {
 var resp = responses[k];
 if (!resp || resp.getResponseCode() !== 200) { RpcHealth.recordFailure(rpcUsed, config); perRpcById.push(null); continue; }
 var arr = JSON.parse(resp.getContentText());
 if (!Array.isArray(arr)) { RpcHealth.recordFailure(rpcUsed, config); perRpcById.push(null); continue; }
 map = {};
 for (var l = 0; l < arr.length; l++) {
 var item = arr[l];
 if (!item || item.id == null || item.error || !item.result) continue;
 map[String(item.id)] = String(item.result);
 }
 if (Obj.keyCount(map) > 0) RpcHealth.recordSuccess(rpcUsed);
 else RpcHealth.recordFailure(rpcUsed, config);
 perRpcById.push(map);
 } catch (e) {
 RpcHealth.recordFailure(rpcUsed, config); 
 perRpcById.push(null); 
 }
 }
 
 var out = new Array(calls.length);
 for (var m = 0; m < calls.length; m++) {
 var id = String(m + 1);
 var values = [];
 for (var n = 0; n < perRpcById.length; n++) {
 var rpcMap = perRpcById[n];
 if (!rpcMap || !rpcMap[id]) continue;
 try { values.push(String(rpcMap[id] || "0x0")); } catch (e) {}
 }
 if (!values.length) { out[m] = { error: { message: "consensus: no result" }, result: null }; continue; }
 
 // v4.12.3: MAJORITY VOTE instead of median
 // Count occurrences of each value
 var counts = {};
 for (var v = 0; v < values.length; v++) {
 var val = values[v];
 counts[val] = (counts[val] || 0) + 1;
 }
 
 // Find value with highest count
 var bestVal = null;
 var bestCount = 0;
 var keys = Object.keys(counts);
 for (var c = 0; c < keys.length; c++) {
 if (counts[keys[c]] > bestCount) {
 bestCount = counts[keys[c]];
 bestVal = keys[c];
 }
 }
 
 // v4.15.1: True strict majority — bestCount must be > half of total votes
 if (bestCount * 2 > values.length) {
 out[m] = { error: null, result: bestVal };
 } else if (values.length === 1) {
 // Only 1 RPC responded - use it but mark as uncertain
 out[m] = { error: null, result: values[0] };
 } else {
 // No majority - RPCs disagree
 out[m] = { error: { message: "consensus: no majority (" + values.length + " votes, best=" + bestCount + ")" }, result: null };
 }
 }
 return out;
 },
 
 /**
 * Batch with MAJORITY VOTE consensus
 * v4.12.3: New function that requires majority agreement
 * - Queries 3+ RPCs in parallel
 * - Requires 2+ RPCs to return identical value
 * - If no majority with 3 RPCs, tries with 4th RPC
 * - Prevents stale/bad RPC from corrupting data
 * v4.12.11: Uses fetchAllSafe for resilience
 */
 batchMajority: function(userRpc, calls, timer, config) {
 calls = calls || [];
 if (!calls.length) return [];
 
 // v4.12.3: Start with 3 RPCs for majority vote
 var startRpcCount = 3;
 var maxRpcCount = (config && config.RPC && config.RPC.CONSENSUS_MAX_RPCS) || 4;
 
 // If time is tight, fall back to single RPC
 if (timer && timer.isLow(5000)) {
 var singleRpc = RpcSelector.pickBest(userRpc, config);
 return this.batchCall(singleRpc, calls, timer, config);
 }
 
 var endpoints = (config && config.RPC && config.RPC.ENDPOINTS) || [];
 var allRpcs = [];
 var seen = {};
 
 // Build list of all available RPCs
 if (userRpc && !seen[userRpc]) { allRpcs.push(userRpc); seen[userRpc] = true; }
 for (var i = 0; i < endpoints.length; i++) {
 if (!seen[endpoints[i]]) { allRpcs.push(endpoints[i]); seen[endpoints[i]] = true; }
 }
 
 // Filter healthy RPCs first
 var healthyRpcs = [];
 for (var h = 0; h < allRpcs.length; h++) {
 if (RpcHealth.isHealthy(allRpcs[h], config)) {
 healthyRpcs.push(allRpcs[h]);
 }
 }
 if (healthyRpcs.length < 3) healthyRpcs = allRpcs.slice(0, maxRpcCount);
 
 var payload = [];
 for (var p = 0; p < calls.length; p++) {
 payload.push({ jsonrpc: "2.0", id: p + 1, method: calls[p].method, params: calls[p].params });
 }
 var body = JSON.stringify(payload);
 
 // Track results per call across all RPCs
 var resultsPerCall = [];
 for (var init = 0; init < calls.length; init++) {
 resultsPerCall.push([]);
 }
 
 // Query RPCs incrementally until we get majority for all calls
 var rpcsUsed = 0;
 var needMore = true;
 
 while (needMore && rpcsUsed < Math.min(maxRpcCount, healthyRpcs.length)) {
 // Determine how many RPCs to query this round
 var batchEnd = Math.min(rpcsUsed + (rpcsUsed === 0 ? startRpcCount : 1), healthyRpcs.length);
 
 var requests = [];
 for (var r = rpcsUsed; r < batchEnd; r++) {
 requests.push({ url: healthyRpcs[r], method: "post", contentType: "application/json", payload: body, muteHttpExceptions: true });
 }
 
 // v4.12.11: Use fetchAllSafe for resilience
 var responses = [];
 try { 
 responses = Http.fetchAllSafe ? Http.fetchAllSafe(requests, config) : Http.fetchAll(requests, config); 
 } catch (e) { 
 responses = []; 
 }
 
 // Process responses
 for (var resp = 0; resp < responses.length; resp++) {
 var rpcUsed = healthyRpcs[rpcsUsed + resp];
 try {
 var response = responses[resp];
 if (!response || response.getResponseCode() !== 200) { RpcHealth.recordFailure(rpcUsed, config); continue; }
 var arr = JSON.parse(response.getContentText());
 if (!Array.isArray(arr)) { RpcHealth.recordFailure(rpcUsed, config); continue; }
 
 RpcHealth.recordSuccess(rpcUsed);
 
 for (var item = 0; item < arr.length; item++) {
 var res = arr[item];
 if (!res || res.id == null || res.error || !res.result) continue;
 var idx = res.id - 1;
 if (idx >= 0 && idx < calls.length) {
 resultsPerCall[idx].push(String(res.result));
 }
 }
 } catch (e) {
 RpcHealth.recordFailure(rpcUsed, config);
 }
 }
 
 rpcsUsed = batchEnd;
 
 // Check if we have majority for all calls
 needMore = false;
 for (var check = 0; check < calls.length; check++) {
 var vals = resultsPerCall[check];
 if (vals.length < 2) { needMore = true; continue; }
 
 // Count occurrences
 var cnt = {};
 for (var cv = 0; cv < vals.length; cv++) {
 cnt[vals[cv]] = (cnt[vals[cv]] || 0) + 1;
 }
 
 // Check for majority
 var hasMajority = false;
 var cntKeys = Object.keys(cnt);
 for (var ck = 0; ck < cntKeys.length; ck++) {
 if (cnt[cntKeys[ck]] * 2 > vals.length) { hasMajority = true; break; }
 }
 
 if (!hasMajority && rpcsUsed < maxRpcCount) {
 needMore = true;
 }
 }
 
 // Time check
 if (timer && timer.isLow(2000)) break;
 }
 
 // Build final results
 var out = new Array(calls.length);
 for (var f = 0; f < calls.length; f++) {
 var finalVals = resultsPerCall[f];
 
 if (!finalVals.length) {
 out[f] = { error: { message: "majority: no responses" }, result: null };
 continue;
 }
 
 // Count occurrences
 var finalCounts = {};
 for (var fv = 0; fv < finalVals.length; fv++) {
 finalCounts[finalVals[fv]] = (finalCounts[finalVals[fv]] || 0) + 1;
 }
 
 // Find best value
 var best = null;
 var bestCnt = 0;
 var fcKeys = Object.keys(finalCounts);
 for (var fc = 0; fc < fcKeys.length; fc++) {
 if (finalCounts[fcKeys[fc]] > bestCnt) {
 bestCnt = finalCounts[fcKeys[fc]];
 best = fcKeys[fc];
 }
 }
 
 if (bestCnt * 2 > finalVals.length) {
 out[f] = { error: null, result: best };
 } else if (finalVals.length === 1) {
 // Single response - use it
 out[f] = { error: null, result: finalVals[0] };
 } else {
 // No majority achieved
 out[f] = { error: { message: "majority: no agreement (" + finalVals.length + " rpcs, best=" + bestCnt + ")" }, result: null };
 }
 }
 
 return out;
 }
};
