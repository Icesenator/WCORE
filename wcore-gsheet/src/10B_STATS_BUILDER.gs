/************************************************************
 * 10B_STATS_BUILDER.gs - Unified Stats Builder (v4.12.1)
 * 
 * Factorizes common getStats() logic across EVM, SVM, and Cosmos engines.
 * OUTPUT FORMAT: 2 COLUMNS [Metric, Value]
 * 
 * v4.12.1 - ACTIVITY METRICS:
 * - Activity.last_tx : Timestamp derniere TX detectee
 * - Activity.nonce : Nonce actuel du wallet
 * - Activity.has_recent : true si TX < 5 min
 * - Activity.priority : IMMEDIATE/HIGH/MEDIUM/LOW/HIBERNATED/SKIP
 * - Refresh.next_in : Temps avant prochain refresh recommande
 * - Refresh.interval : Intervalle de refresh pour ce wallet
 * 
 * USAGE:
 * var stats = StatsBuilder.build({
 * address: '0x...',
 * cache: walletCache,
 * config: chainConfig,
 * engineType: 'EVM',
 * timer: createTimer(30000)
 * });
 * 
 * CHANGELOG:
 * v4.12.1 - Added Activity metrics (last_tx, nonce, has_recent, priority)
 * v4.12.0 - Added toCompact() and toFlat() for Dashboard integration
 * v4.9.5 - Initial unified builder
 ************************************************************/
var STATS_BUILDER_VERSION = "4.12.1";

var StatsBuilder = StatsBuilder || {};

/**
 * Main build function - returns 2-column format [Metric, Value]
 */
StatsBuilder.build = function(params) {
 var out = [["Metric", "Value"]];
 
 try {
 var address = params.address;
 var cache = params.cache;
 var config = params.config || {};
 var engineType = params.engineType || 'UNKNOWN';
 var timer = params.timer;
 var nowMs = Date.now();
 
 // Chain identity
 var chainName = (config.CHAIN && (config.CHAIN.DISPLAY_NAME || config.CHAIN.NAME)) || "Unknown";
 var chainId = (config.CHAIN && config.CHAIN.ID) || chainName.toUpperCase().replace(/\s+/g, "_");
 
 out.push(["Chain", chainName]);
 out.push(["Engine", engineType]);
 out.push(["Wallet", address]);
 out.push(["Script", (config && config.VERSION) || "unknown"]);
 
 if (!cache) {
 out.push(["Cache", "N/A"]);
 out.push(["Status", "EMPTY"]);
 out.push(["Health.score", "50/100"]);
 
 // Activity metrics even without cache
 var activityEmpty = StatsBuilder._getActivityMetrics(chainId, address, 0, 999999999);
 out.push(["Activity.last_tx", activityEmpty.lastTx]);
 out.push(["Activity.nonce", activityEmpty.nonce]);
 out.push(["Activity.has_recent", activityEmpty.hasRecent ? "YES - TX detected!" : "no"]);
 out.push(["Activity.priority", activityEmpty.priority]);
 out.push(["Refresh.next_in", activityEmpty.nextRefresh]);
 
 return out;
 }
 
 // Cache metrics
 var ttlSec = 86400;
 if (config.CACHE) {
 ttlSec = config.CACHE.WALLET_CACHE_TTL_SECONDS || 
 Math.floor((config.CACHE.WALLET_TTL_MS || 86400000) / 1000);
 }
 
 var cacheAgeSec = cache.updatedAt ? Math.round((nowMs - cache.updatedAt) / 1000) : -1;
 var cacheAgeMs = cacheAgeSec >= 0 ? cacheAgeSec * 1000 : 999999999;
 var cacheAgeStr = cacheAgeSec >= 0 ? "~" + Math.round(cacheAgeSec / 60) + " min ago" : "N/A";
 
 out.push(["Cache.updatedAt", cache.updatedAt ? Format.datetime(cache.updatedAt) + " (" + cacheAgeStr + ")" : "N/A"]);
 out.push(["Cache.ttl_sec", ttlSec + " sec"]);
 out.push(["Cache.age_sec", cacheAgeSec + " sec"]);
 out.push(["Cache.assets", (cache.assets || []).length]);
 out.push(["Cache.priceMap", Obj.keyCount(cache.priceMap) + " keys"]);
 
 if (cache.usd_to_eur_rate) {
 out.push(["Cache.usd_to_eur", cache.usd_to_eur_rate.toFixed(4)]);
 }
 
 // Cache version
 if (cache.cv !== undefined) {
 out.push(["Cache.version", cache.cv]);
 }
 
 // Pricing coverage
 var totalEur = 0;
 var missing = 0;
 var assets = cache.assets || [];
 var priceMap = cache.priceMap || {};
 var nativeKey = (config.KEYS && config.KEYS.NATIVE_PRICE) || 'native';
 var pxIgnore = config.PRICE_IGNORE_CONTRACTS || [];

 for (var i = 0; i < assets.length; i++) {
 var a = assets[i];
 if (!a) continue;
 var bal = Number(a.balance || 0);
 if (!Num.isPositive(bal)) continue;

 var contract = a.contract || a.c || a.mint || '';
 var pxKey = (contract === 'native') ? nativeKey : Addr.normalize(contract);
 var px = priceMap[pxKey] ? Number(priceMap[pxKey]) : 0;

 if (!Num.isValidPositive(px)) {
 // v4.14.2: Skip contracts in PRICE_IGNORE_CONTRACTS
 if (pxIgnore.indexOf(pxKey) < 0) missing++;
 } else {
 totalEur += (px * bal);
 }
 }
 
 out.push(["Pricing.total_eur", totalEur.toFixed(2) + " EUR"]);
 out.push(["Pricing.missing_count", missing]);
 
 // Flags & health
 var flagStale = (cacheAgeSec >= 0 && ttlSec > 0 && cacheAgeSec > ttlSec) ? 1 : 0;
 var flagPricingGap = (missing > 0) ? 1 : 0;
 var flagHasError = cache.last_error ? 1 : 0;
 
 out.push(["Flag.stale", flagStale]);
 out.push(["Flag.pricing_gap", flagPricingGap]);
 out.push(["Flag.has_error", flagHasError]);
 
 if (cache.last_error) {
 out.push(["Error.last", String(cache.last_error).substring(0, 50)]);
 }
 
 var score = 100;
 if (flagStale) score -= 30;
 if (flagPricingGap) score -= 20;
 if (flagHasError) score -= 40;
 
 out.push(["Health.score", Math.max(0, score) + "/100"]);
 
 // ============================================================
 // ACTIVITY METRICS (v4.12.1)
 // ============================================================
 
 var activity = StatsBuilder._getActivityMetrics(chainId, address, totalEur, cacheAgeMs);
 
 out.push(["Activity.last_tx", activity.lastTx + (activity.lastTxAge ? " (" + activity.lastTxAge + ")" : "")]);
 out.push(["Activity.nonce", activity.nonce]);
 out.push(["Activity.has_recent", activity.hasRecent ? "YES - TX detected!" : "no"]);
 out.push(["Activity.priority", activity.priority + (activity.priorityReason ? " (" + activity.priorityReason + ")" : "")]);
 out.push(["Refresh.next_in", activity.nextRefresh]);
 out.push(["Refresh.interval", activity.refreshInterval]);
 
 // Execution time
 out.push(["Exec.ms", (timer ? timer.elapsed() : 0) + " ms"]);
 
 return out;
 } catch (e) {
 return [["Metric", "Value"], ["Error", String(e.message || e)]];
 }
};

// ============================================================
// ACTIVITY METRICS HELPER (v4.12.1)
// ============================================================

/**
 * Get activity metrics for a wallet
 * Uses ActivityTracker if available, otherwise returns defaults
 */
StatsBuilder._getActivityMetrics = function(chainId, address, valueEur, cacheAgeMs) {
 var result = {
 lastTx: "-",
 lastTxAge: "",
 nonce: "-",
 hasRecent: false,
 priority: "UNKNOWN",
 priorityReason: "",
 nextRefresh: "-",
 refreshInterval: "-"
 };
 
 try {
 // Try to get activity info from ActivityTracker
 if (typeof ActivityTracker !== "undefined" && ActivityTracker.getInfo) {
 var info = ActivityTracker.getInfo(chainId, address);
 
 if (info) {
 // Nonce
 if (info.nonce !== null && info.nonce !== undefined) {
 result.nonce = String(info.nonce);
 }
 
 // Last activity timestamp
 if (info.lastActivity) {
 result.lastTx = Format.datetime(info.lastActivity);
 var ageMin = Math.round((Date.now() - info.lastActivity) / 60000);
 if (ageMin < 60) {
 result.lastTxAge = ageMin + " min ago";
 } else {
 result.lastTxAge = Math.round(ageMin / 60) + "h ago";
 }
 }
 
 // Recent activity check
 if (typeof ActivityTracker.hasRecentActivity === "function") {
 result.hasRecent = ActivityTracker.hasRecentActivity(chainId, address);
 }
 }
 }
 
 // Calculate priority
 var priorityInfo = StatsBuilder._calculateRefreshPriority(valueEur, cacheAgeMs, result.hasRecent);
 result.priority = priorityInfo.name;
 result.priorityReason = priorityInfo.reason;
 result.nextRefresh = priorityInfo.nextRefresh;
 result.refreshInterval = priorityInfo.interval;
 
 } catch (e) {
 // Silently fail - activity tracking is optional
 }
 
 return result;
};

/**
 * Calculate refresh priority for a wallet
 */
StatsBuilder._calculateRefreshPriority = function(valueEur, cacheAgeMs, hasRecentActivity) {
 var result = {
 name: "SKIP",
 reason: "Fresh",
 nextRefresh: "-",
 interval: "-"
 };
 
 try {
 // Config
 var intervals = {
 ACTIVE: 300000,
 HIGH_VALUE: 1800000,
 MEDIUM_VALUE: 7200000,
 LOW_VALUE: 21600000,
 HIBERNATED: 86400000
 };
 var thresholds = { HIGH: 1000, MEDIUM: 100, LOW: 1 };
 
 // Try to use ACTIVITY_REFRESH_CONFIG if available
 if (typeof ACTIVITY_REFRESH_CONFIG !== "undefined" && ACTIVITY_REFRESH_CONFIG.INTERVALS) {
 intervals = ACTIVITY_REFRESH_CONFIG.INTERVALS;
 if (ACTIVITY_REFRESH_CONFIG.VALUE_THRESHOLDS) {
 thresholds = ACTIVITY_REFRESH_CONFIG.VALUE_THRESHOLDS;
 }
 }
 
 // IMMEDIATE if recent activity
 if (hasRecentActivity) {
 result.name = "IMMEDIATE";
 result.reason = "TX detected";
 result.nextRefresh = "Now";
 result.interval = _formatIntervalStats(intervals.ACTIVE);
 return result;
 }
 
 // Determine value tier
 var valueTier = "HIBERNATED";
 var refreshInterval = intervals.HIBERNATED;
 
 if (valueEur >= thresholds.HIGH) {
 valueTier = "HIGH";
 refreshInterval = intervals.HIGH_VALUE;
 } else if (valueEur >= thresholds.MEDIUM) {
 valueTier = "MEDIUM";
 refreshInterval = intervals.MEDIUM_VALUE;
 } else if (valueEur >= thresholds.LOW) {
 valueTier = "LOW";
 refreshInterval = intervals.LOW_VALUE;
 }
 
 result.interval = _formatIntervalStats(refreshInterval);
 
 // Check if refresh needed
 if (cacheAgeMs > refreshInterval * 2) {
 result.name = "CRITICAL";
 result.reason = "very stale";
 result.nextRefresh = "Now";
 } else if (cacheAgeMs > refreshInterval) {
 result.name = valueTier;
 result.reason = "stale";
 result.nextRefresh = "Now";
 } else {
 var timeUntil = refreshInterval - cacheAgeMs;
 result.name = "SKIP";
 result.reason = "fresh";
 result.nextRefresh = _formatIntervalStats(timeUntil);
 }
 
 } catch (e) {}
 
 return result;
};

/**
 * Format milliseconds to human readable interval
 */
function _formatIntervalStats(ms) {
 if (ms <= 0) return "Now";
 if (ms < 60000) return Math.round(ms / 1000) + "s";
 if (ms < 3600000) return Math.round(ms / 60000) + "min";
 return (ms / 3600000).toFixed(1) + "h";
}

// ============================================================
// CONVENIENCE FUNCTIONS
// ============================================================

/**
 * Converts stats to flat key-value object
 */
StatsBuilder.toFlat = function(stats) {
 if (!stats || !Array.isArray(stats)) return {};
 
 var result = {};
 for (var i = 1; i < stats.length; i++) {
 var row = stats[i];
 if (!row || row.length < 2) continue;
 result[String(row[0])] = row[1];
 }
 return result;
};

/**
 * Extract a single metric value from stats
 */
StatsBuilder.getValue = function(stats, metricName) {
 if (!stats || !Array.isArray(stats)) return null;
 
 for (var i = 1; i < stats.length; i++) {
 var row = stats[i];
 if (!row || row.length < 2) continue;
 if (String(row[0]) === metricName) {
 return row[1];
 }
 }
 return null;
};

/**
 * Extract multiple metrics as a single-row array
 */
StatsBuilder.getRow = function(stats, metricNames) {
 var result = [];
 for (var i = 0; i < metricNames.length; i++) {
 result.push(StatsBuilder.getValue(stats, metricNames[i]) || "");
 }
 return result;
};

/**
 * Extract activity metrics only
 */
StatsBuilder.getActivitySummary = function(stats) {
 return {
 lastTx: StatsBuilder.getValue(stats, "Activity.last_tx") || "-",
 nonce: StatsBuilder.getValue(stats, "Activity.nonce") || "-",
 hasRecent: String(StatsBuilder.getValue(stats, "Activity.has_recent") || "").indexOf("YES") >= 0,
 priority: StatsBuilder.getValue(stats, "Activity.priority") || "UNKNOWN",
 nextRefresh: StatsBuilder.getValue(stats, "Refresh.next_in") || "-"
 };
};

// ============================================================
// ENGINE-SPECIFIC BUILDERS
// ============================================================

StatsBuilder.buildEvm = function(address, cache, config, timer) {
 return this.build({ address: address, cache: cache, config: config, engineType: 'EVM', timer: timer });
};

StatsBuilder.buildSvm = function(address, cache, config, timer) {
 return this.build({ address: address, cache: cache, config: config, engineType: 'SVM', timer: timer });
};

StatsBuilder.buildCosmos = function(address, cache, config, timer) {
 return this.build({ address: address, cache: cache, config: config, engineType: 'COSMOS', timer: timer });
};
