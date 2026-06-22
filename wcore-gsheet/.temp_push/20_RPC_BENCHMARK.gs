/**
 * RPC_BENCHMARK.gs - Universal RPC Performance Benchmarking
 * 
 * Systeme de benchmark generalise pour toutes les chaÃƒÆ’Ã†âEUR™ÃƒâEURšÃ‚Â®nes EVM.
 * Cache les resultats pour eviter de re-tester a chaque refresh.
 * 
 * v1.0.0 - Initial implementation
 * - Benchmark universel pour toutes les chaÃƒÆ’Ã†âEUR™ÃƒâEURšÃ‚Â®nes
 * - Cache de performance avec TTL de 24h
 * - Selection automatique du RPC le plus rapide
 */
var RPC_BENCHMARK_VERSION = "1.0.0";

var RpcBenchmark = {
 
 /**
 * Cache key for benchmark results
 */
 _cacheKey: function(chainName) {
 return "RPC_BENCHMARK_" + String(chainName).toUpperCase();
 },
 
 /**
 * Get cached benchmark results if still valid
 * Returns null if cache expired or doesn't exist
 */
 _getCachedResults: function(config) {
 try {
 var key = this._cacheKey(config.CHAIN.NAME);
 var cached = CacheManager.safeGetJson(key, null, config);
 
 if (!cached || !cached.timestamp || !cached.results) return null;
 
 // Check if cache is still valid (24h TTL)
 var age = Date.now() - cached.timestamp;
 var ttl = 86400000; // 24 hours
 
 if (age > ttl) return null;
 
 return cached.results;
 } catch (e) {
 return null;
 }
 },
 
 /**
 * Save benchmark results to cache
 */
 _saveCachedResults: function(results, config) {
 try {
 var key = this._cacheKey(config.CHAIN.NAME);
 var data = {
 timestamp: Date.now(),
 results: results,
 version: "1.0.0"
 };
 CacheManager.safeSetJson(key, data, config);
 } catch (e) {
 // Ignore cache errors
 }
 },
 
 /**
 * Clear cached benchmark for a chain
 */
 clearCache: function(config) {
 try {
 var key = this._cacheKey(config.CHAIN.NAME);
 CacheManager.delete(key);
 } catch (e) {
 // Ignore
 }
 },
 
 /**
 * Benchmark a single RPC endpoint
 * Returns { rpc, latency, success, error }
 */
 _benchmarkSingleRpc: function(rpc, config) {
 var result = {
 rpc: rpc,
 latency: 9999,
 success: false,
 error: null
 };
 
 var startTime = Date.now();
 
 try {
 var payload = JSON.stringify({
 jsonrpc: "2.0",
 id: 1,
 method: "eth_blockNumber",
 params: []
 });
 
 var response = UrlFetchApp.fetch(rpc, {
 method: "post",
 contentType: "application/json",
 payload: payload,
 muteHttpExceptions: true,
 timeout: 3000 // 3 second timeout for benchmark
 });
 
 result.latency = Date.now() - startTime;
 
 if (response.getResponseCode() === 200) {
 var json = JSON.parse(response.getContentText());
 if (json && json.result) {
 result.success = true;
 } else {
 result.error = "Invalid response";
 }
 } else {
 result.error = "HTTP " + response.getResponseCode();
 }
 } catch (e) {
 result.latency = Date.now() - startTime;
 result.error = String(e.message).substring(0, 50);
 }
 
 return result;
 },
 
 /**
 * Benchmark all RPCs for a chain
 * Returns array of results sorted by latency (fastest first)
 */
 benchmarkAll: function(config, forceRefresh) {
 // Check cache first unless forced
 if (!forceRefresh) {
 var cached = this._getCachedResults(config);
 if (cached) return cached;
 }
 
 var endpoints = (config && config.RPC && config.RPC.ENDPOINTS) || [];
 if (!endpoints.length) return [];
 
 var results = [];
 
 // Benchmark each RPC
 for (var i = 0; i < endpoints.length; i++) {
 var result = this._benchmarkSingleRpc(endpoints[i], config);
 results.push(result);
 }
 
 // Sort by success first, then by latency
 results.sort(function(a, b) {
 if (a.success && !b.success) return -1;
 if (!a.success && b.success) return 1;
 return a.latency - b.latency;
 });
 
 // Save to cache
 this._saveCachedResults(results, config);
 
 return results;
 },
 
 /**
 * Get the fastest working RPC for a chain
 * Uses cached results if available, otherwise benchmarks
 */
 getFastestRpc: function(config) {
 var results = this.benchmarkAll(config, false);
 
 // Return first successful RPC
 for (var i = 0; i < results.length; i++) {
 if (results[i].success) {
 return results[i].rpc;
 }
 }
 
 // Fallback to first configured RPC if all failed
 var endpoints = (config && config.RPC && config.RPC.ENDPOINTS) || [];
 return endpoints.length ? endpoints[0] : null;
 },
 
 /**
 * Get ordered list of RPCs by performance
 * Returns only successful RPCs
 */
 getOrderedRpcs: function(config) {
 var results = this.benchmarkAll(config, false);
 var ordered = [];
 
 for (var i = 0; i < results.length; i++) {
 if (results[i].success) {
 ordered.push(results[i].rpc);
 }
 }
 
 return ordered;
 },
 
 /**
 * Check if benchmark cache exists and is valid
 */
 hasFreshCache: function(config) {
 var cached = this._getCachedResults(config);
 return cached !== null;
 },
 
 /**
 * Get cache age in hours
 */
 getCacheAge: function(config) {
 try {
 var key = this._cacheKey(config.CHAIN.NAME);
 var cached = CacheManager.safeGetJson(key, null, config);
 
 if (!cached || !cached.timestamp) return -1;
 
 var age = Date.now() - cached.timestamp;
 return age / 3600000; // Convert to hours
 } catch (e) {
 return -1;
 }
 }
};

// ============================================================
// SHEET FUNCTIONS - For manual benchmarking
// ============================================================

/**
 * Benchmark RPCs for a specific chain
 * Usage: =BENCHMARK_CHAIN_RPCS("LINEA")
 */
function BENCHMARK_CHAIN_RPCS(chainName, forceRefresh) {
 if (!chainName) return [["Error", "Please provide a chain name (e.g., LINEA, BASE, ARBITRUM_ONE)"]];
 
 try {
 var chainVar = "_" + String(chainName).toUpperCase();
 var chain = this[chainVar];
 
 if (!chain || !chain.config) {
 return [["Error", "Chain not found: " + chainName]];
 }
 
 var force = Bool.parse(forceRefresh);
 var results = RpcBenchmark.benchmarkAll(chain.config, force);
 
 var output = [
 ["RPC", "Latency (ms)", "Status", "Error"]
 ];
 
 for (var i = 0; i < results.length; i++) {
 var r = results[i];
 output.push([
 r.rpc,
 r.latency,
 r.success ? "OK" : "FAIL",
 r.error || ""
 ]);
 }
 
 // Add cache info
 var cacheAge = RpcBenchmark.getCacheAge(chain.config);
 output.push([]);
 output.push(["Cache Age", cacheAge >= 0 ? (cacheAge.toFixed(1) + " hours") : "No cache", "", ""]);
 output.push(["Fastest RPC", results.length && results[0].success ? results[0].rpc : "None", "", ""]);
 
 return output;
 } catch (e) {
 return [["Error", String(e.message || e), "", ""]];
 }
}

/**
 * Clear benchmark cache for a chain
 * Usage: =CLEAR_BENCHMARK_CACHE("LINEA")
 */
function CLEAR_BENCHMARK_CACHE(chainName) {
 if (!chainName) return "Error: Please provide a chain name";
 
 try {
 var chainVar = "_" + String(chainName).toUpperCase();
 var chain = this[chainVar];
 
 if (!chain || !chain.config) {
 return "Error: Chain not found: " + chainName;
 }
 
 RpcBenchmark.clearCache(chain.config);
 return "Cache cleared for " + chainName;
 } catch (e) {
 return "Error: " + String(e.message || e);
 }
}

/**
 * Get benchmark status for all chains
 * Usage: =BENCHMARK_STATUS()
 */
function BENCHMARK_STATUS() {
 var chains = [
 "ETHEREUM", "BASE", "ARBITRUM_ONE", "OPTIMISM", "POLYGON", 
 "BSC", "AVALANCHE", "LINEA", "SCROLL", "ZKSYNC_ERA"
 ];
 
 var output = [
 ["Chain", "Has Cache", "Cache Age (hours)", "Fastest RPC"]
 ];
 
 for (var i = 0; i < chains.length; i++) {
 var chainName = chains[i];
 var chainVar = "_" + chainName;
 var chain = this[chainVar];
 
 if (!chain || !chain.config) continue;
 
 var hasCa = RpcBenchmark.hasFreshCache(chain.config);
 var age = RpcBenchmark.getCacheAge(chain.config);
 var fastest = hasCa ? RpcBenchmark.getFastestRpc(chain.config) : "N/A";
 
 output.push([
 chainName,
 hasCa ? "YES" : "NO",
 age >= 0 ? age.toFixed(1) : "N/A",
 fastest || "N/A"
 ]);
 }
 
 return output;
}

/**
 * Auto-benchmark all chains that don't have fresh cache
 * Usage: =AUTO_BENCHMARK_ALL_CHAINS()
 */
function AUTO_BENCHMARK_ALL_CHAINS() {
 var chains = [
 "ETHEREUM", "BASE", "ARBITRUM_ONE", "OPTIMISM", "POLYGON", 
 "BSC", "AVALANCHE", "LINEA", "SCROLL", "ZKSYNC_ERA",
 "BLAST", "MODE", "ZORA", "MANTLE", "TAIKO_ALETHIA"
 ];
 
 var output = [
 ["Chain", "Action", "Fastest RPC", "Latency (ms)"]
 ];
 
 for (var i = 0; i < chains.length; i++) {
 var chainName = chains[i];
 var chainVar = "_" + chainName;
 var chain = this[chainVar];
 
 if (!chain || !chain.config) continue;
 
 var hasCa = RpcBenchmark.hasFreshCache(chain.config);
 var action = hasCa ? "Cached" : "Benchmarked";
 
 if (!hasCa) {
 // Benchmark this chain
 var results = RpcBenchmark.benchmarkAll(chain.config, false);
 if (results.length && results[0].success) {
 output.push([
 chainName,
 action,
 results[0].rpc,
 results[0].latency
 ]);
 } else {
 output.push([chainName, "FAILED", "N/A", "N/A"]);
 }
 } else {
 var fastest = RpcBenchmark.getFastestRpc(chain.config);
 output.push([chainName, action, fastest, "Cached"]);
 }
 
 // Add delay to avoid rate limiting
 if (!hasCa && i < chains.length - 1) {
 Utilities.sleep(500);
 }
 }
 
 return output;
}
