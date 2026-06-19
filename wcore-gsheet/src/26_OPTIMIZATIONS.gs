/************************************************************
 * 26_OPTIMIZATIONS.gs - WCORE Optimizations Module (v4.12.1)
 * 
 * Module d'optimisations et d'ameliorations WCORE:
 * - Circuit Breaker global par chain
 * - Contract Pruning (nettoyage des contracts morts)
 * - Price Cache Warming (pre-fetch des top tokens)
 * - Stale Price Detection (TTL gradue)
 * - Monitoring et alerting ameliores
 * 
 * FONCTIONS DIAGNOSTIQUES:
 * - DIAG_LOW_RPC_HEALTH(threshold) : Chains avec RPC health < seuil
 * - DIAG_STALE_PRICES() : Tokens avec prix perimes
 * - DIAG_DEAD_CONTRACTS() : Contracts ÃƒÆ’Ã‚Â  nettoyer
 * - DIAG_CIRCUIT_BREAKERS() : Status des circuit breakers
 * - DIAG_SYSTEM_ALERTS() : Alertes systeme actives
 * 
 * FONCTIONS D'ACTION:
 * - WCORE_WARMUP_PRICES() : Pre-charger les prix top tokens
 * - WCORE_PRUNE_CONTRACTS(dryRun) : Nettoyer les contracts morts
 * - WCORE_RESET_CIRCUIT(chainId) : Reset un circuit breaker
 * 
 * DÃƒÆ’Ã¢â‚¬Â°PENDANCES:
 * - 04B_CACHE_WALLET.gs, 04C_CACHE_GLOBAL.gs
 * - 05_RPC.gs, 07_PRICES.gs
 * - 25_RPC_HEALTH_REPORT.gs
 * 
 * v4.12.1 - Initial release
 ************************************************************/
var OPTIMIZATIONS_VERSION = "4.12.1";

// ============================================================
// CONFIGURATION
// ============================================================

var OPTIMIZATION_CONFIG = {
 // Circuit Breaker
 CIRCUIT_BREAKER: {
 FAILURE_THRESHOLD: 3, // Failures consecutifs avant ouverture
 RECOVERY_TIMEOUT_MS: 3600000, // 1h avant retry automatique
 HALF_OPEN_REQUESTS: 1 // Requetes test en half-open
 },
 
 // Contract Pruning
 PRUNING: {
 ZERO_BALANCE_DAYS: 7, // Jours avec balance=0 avant purge
 NO_PRICE_DAYS: 14, // Jours sans prix avant purge
 MIN_VALUE_EUR: 0.01 // Valeur minimum pour garder
 },
 
 // Price Staleness Thresholds
 PRICE_STALENESS: {
 FRESH_HOURS: 6, // < 6h = Fresh ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“
 STALE_HOURS: 24, // 6-24h = Stale ÃƒÂ¢Ã…Â¡Ã‚Â 
 EXPIRED_HOURS: 48 // > 48h = Expired ÃƒÂ¢Ã‚ÂÃ…â€™
 },
 
 // Alerting Thresholds
 ALERTS: {
 RPC_HEALTH_WARN: 70, // RPC health < 70% = alerte
 RPC_HEALTH_CRITICAL: 50, // RPC health < 50% = critique
 PRICING_GAPS_WARN: 5, // > 5 tokens sans prix = alerte
 EXEC_TIME_WARN_MS: 25000, // > 25s = proche timeout
 CACHE_SIZE_WARN_KB: 400, // > 400KB = alerte
 CACHE_SIZE_CRITICAL_KB: 480 // > 480KB = critique
 },
 
 // Top tokens for warming (DefiLlama IDs)
 TOP_TOKENS: [
 "coingecko:ethereum", "coingecko:bitcoin", "coingecko:tether",
 "coingecko:usd-coin", "coingecko:binancecoin", "coingecko:solana",
 "coingecko:staked-ether", "coingecko:dai", "coingecko:weth",
 "coingecko:wrapped-bitcoin", "coingecko:chainlink", "coingecko:uniswap",
 "coingecko:aave", "coingecko:matic-network", "coingecko:arbitrum",
 "coingecko:optimism", "coingecko:avalanche-2", "coingecko:cosmos",
 "coingecko:injective-protocol", "coingecko:terra-luna-2"
 ]
};

// ============================================================
// CHAIN CIRCUIT BREAKER
// ============================================================

var ChainCircuitBreaker = (function() {
 var STATES = { CLOSED: "CLOSED", OPEN: "OPEN", HALF_OPEN: "HALF_OPEN" };
 var _state = {};
 var _loaded = false;
 
 function _load() {
 if (_loaded) return;
 try {
 var raw = PropertiesService.getScriptProperties().getProperty("WCORE_CIRCUIT_BREAKER");
 if (raw) _state = JSON.parse(raw);
 _loaded = true;
 } catch (e) { _state = {}; _loaded = true; }
 }
 
 function _save() {
 try {
 var filtered = {};
 for (var k in _state) {
 if (_state[k] && (_state[k].state !== STATES.CLOSED || _state[k].failures > 0)) {
 filtered[k] = _state[k];
 }
 }
 var props = PropertiesService.getScriptProperties();
 if (Object.keys(filtered).length > 0) {
 props.setProperty("WCORE_CIRCUIT_BREAKER", JSON.stringify(filtered));
 } else {
 props.deleteProperty("WCORE_CIRCUIT_BREAKER");
 }
 } catch (e) {}
 }
 
 return {
 STATES: STATES,
 
 getState: function(chainId) {
 _load();
 var s = _state[chainId];
 if (!s) return STATES.CLOSED;
 if (s.state === STATES.OPEN) {
 var elapsed = Date.now() - (s.lastFailure || 0);
 if (elapsed > OPTIMIZATION_CONFIG.CIRCUIT_BREAKER.RECOVERY_TIMEOUT_MS) {
 s.state = STATES.HALF_OPEN;
 _save();
 }
 }
 return s.state;
 },
 
 isAllowed: function(chainId) {
 return this.getState(chainId) !== STATES.OPEN;
 },
 
 recordSuccess: function(chainId) {
 _load();
 _state[chainId] = { state: STATES.CLOSED, failures: 0, lastSuccess: Date.now() };
 _save();
 },
 
 recordFailure: function(chainId) {
 _load();
 if (!_state[chainId]) _state[chainId] = { state: STATES.CLOSED, failures: 0 };
 var s = _state[chainId];
 s.failures = (s.failures || 0) + 1;
 s.lastFailure = Date.now();
 if (s.failures >= OPTIMIZATION_CONFIG.CIRCUIT_BREAKER.FAILURE_THRESHOLD) {
 s.state = STATES.OPEN;
 }
 _save();
 },
 
 getAllStates: function() {
 _load();
 var result = [];
 for (var chainId in _state) {
 var data = _state[chainId];
 result.push({
 chain: chainId,
 state: this.getState(chainId),
 failures: data.failures || 0,
 lastFailure: data.lastFailure ? new Date(data.lastFailure).toISOString() : null,
 lastSuccess: data.lastSuccess ? new Date(data.lastSuccess).toISOString() : null
 });
 }
 return result;
 },
 
 reset: function(chainId) {
 _load();
 if (chainId) delete _state[chainId];
 else _state = {};
 _save();
 },
 
 reload: function() { _loaded = false; _load(); }
 };
})();

// ============================================================
// CONTRACT PRUNING
// ============================================================

var ContractPruner = {
 findDeadContracts: function(cache) {
 if (!cache || !cache.assets) return [];
 var toPrune = [];
 var nowMs = Date.now();
 var balanceTsMap = cache.balanceTsMap || {};
 var priceMap = cache.priceMap || cache.pm || {};
 var priceTsMap = cache.priceTsMap || {};
 
 for (var i = 0; i < cache.assets.length; i++) {
 var asset = cache.assets[i];
 if (!asset || !asset.contract || asset.contract === "native") continue;
 
 var contract = asset.contract;
 var balance = Number(asset.balance || 0);
 var priceKey = contract.toLowerCase();
 var price = priceMap[priceKey] || priceMap[contract];
 var balanceTs = balanceTsMap[contract] || balanceTsMap[priceKey] || 0;
 var priceTs = priceTsMap[priceKey] || priceTsMap[contract] || 0;
 var reason = null;
 
 // Zero balance too long
 if (balance === 0 && balanceTs) {
 var balanceAgeDays = (nowMs - balanceTs) / (24 * 3600 * 1000);
 if (balanceAgeDays > OPTIMIZATION_CONFIG.PRUNING.ZERO_BALANCE_DAYS) {
 reason = "zero_balance_" + Math.round(balanceAgeDays) + "d";
 }
 }
 
 // No price too long
 if (!reason && balance > 0 && !price) {
 var priceAgeDays = (priceTs ? (nowMs - priceTs) : nowMs) / (24 * 3600 * 1000);
 if (priceAgeDays > OPTIMIZATION_CONFIG.PRUNING.NO_PRICE_DAYS) {
 reason = "no_price_" + Math.round(priceAgeDays) + "d";
 }
 }
 
 // Dust value
 if (!reason && balance > 0 && price) {
 var valueEur = balance * price;
 if (valueEur < OPTIMIZATION_CONFIG.PRUNING.MIN_VALUE_EUR) {
 reason = "dust_" + valueEur.toFixed(6) + "EUR";
 }
 }
 
 if (reason) {
 toPrune.push({ contract: contract, symbol: asset.symbol || asset.ticker || "?", balance: balance, reason: reason });
 }
 }
 return toPrune;
 },
 
 pruneContracts: function(cache, contractsToPrune) {
 if (!cache || !cache.assets || !contractsToPrune || !contractsToPrune.length) return 0;
 
 var pruneSet = {};
 for (var i = 0; i < contractsToPrune.length; i++) {
 var c = contractsToPrune[i];
 var addr = typeof c === "string" ? c : c.contract;
 if (addr) pruneSet[addr.toLowerCase()] = true;
 }
 
 var newAssets = [];
 var prunedCount = 0;
 
 for (var j = 0; j < cache.assets.length; j++) {
 var asset = cache.assets[j];
 if (!asset) continue;
 var contract = asset.contract || "";
 if (contract !== "native" && pruneSet[contract.toLowerCase()]) {
 prunedCount++;
 if (cache.priceMap) { delete cache.priceMap[contract]; delete cache.priceMap[contract.toLowerCase()]; }
 if (cache.priceTsMap) { delete cache.priceTsMap[contract]; delete cache.priceTsMap[contract.toLowerCase()]; }
 if (cache.balanceTsMap) delete cache.balanceTsMap[contract];
 if (cache.attemptTsMap) delete cache.attemptTsMap[contract];
 } else {
 newAssets.push(asset);
 }
 }
 cache.assets = newAssets;
 return prunedCount;
 }
};

// ============================================================
// PRICE STALENESS DETECTION
// ============================================================

var PriceStalenessChecker = {
 LEVELS: { FRESH: "FRESH", STALE: "STALE", EXPIRED: "EXPIRED", MISSING: "MISSING" },
 
 getLevel: function(priceTs) {
 if (!priceTs) return this.LEVELS.MISSING;
 var ageHours = (Date.now() - priceTs) / (3600 * 1000);
 if (ageHours < OPTIMIZATION_CONFIG.PRICE_STALENESS.FRESH_HOURS) return this.LEVELS.FRESH;
 if (ageHours < OPTIMIZATION_CONFIG.PRICE_STALENESS.STALE_HOURS) return this.LEVELS.STALE;
 return this.LEVELS.EXPIRED;
 },
 
 getIndicator: function(level) {
 switch (level) {
 case this.LEVELS.FRESH: return "ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“";
 case this.LEVELS.STALE: return "ÃƒÂ¢Ã…Â¡Ã‚Â ";
 case this.LEVELS.EXPIRED: return "ÃƒÂ¢Ã‚ÂÃ…â€™";
 default: return "?";
 }
 },
 
 analyzeCache: function(cache) {
 var result = { fresh: 0, stale: 0, expired: 0, missing: 0, details: [] };
 if (!cache || !cache.assets) return result;
 
 var priceTsMap = cache.priceTsMap || {};
 var priceMap = cache.priceMap || cache.pm || {};
 
 for (var i = 0; i < cache.assets.length; i++) {
 var asset = cache.assets[i];
 if (!asset || Number(asset.balance || 0) <= 0) continue;
 
 var contract = asset.contract || "";
 var key = contract === "native" ? "native" : contract.toLowerCase();
 var priceTs = priceTsMap[key] || priceTsMap[contract] || 0;
 var price = priceMap[key] || priceMap[contract];
 var level = price ? this.getLevel(priceTs) : this.LEVELS.MISSING;
 
 result[level.toLowerCase()]++;
 
 if (level !== this.LEVELS.FRESH) {
 result.details.push({
 contract: contract, symbol: asset.symbol || asset.ticker || "?",
 balance: asset.balance, level: level, indicator: this.getIndicator(level),
 ageHours: priceTs ? Math.round((Date.now() - priceTs) / 3600000) : null
 });
 }
 }
 return result;
 }
};

// ============================================================
// PRICE CACHE WARMING
// ============================================================

function _warmupPriceCache() {
 var results = [];
 var tokens = OPTIMIZATION_CONFIG.TOP_TOKENS;
 var fxRate = null;
 
 try {
 if (typeof FxRate !== 'undefined' && FxRate.getUsdToEur) {
 fxRate = FxRate.getUsdToEur();
 }
 } catch (e) {
 try { Logger.log("[warmupPriceCache] FX cascade failed: " + (e && e.message ? e.message : String(e))); } catch (eLog) {}
 fxRate = null;
 }
 if (!isFinite(fxRate) || fxRate <= 0) {
 return { skipped: true, reason: "FX unavailable", results: [] };
 }
 
 for (var i = 0; i < tokens.length; i++) {
 var llamaId = tokens[i];
 var startMs = Date.now();
 var price = null, status = "MISS", error = null;
 
 try {
 if (typeof GlobalPriceCache !== 'undefined' && GlobalPriceCache.get) {
 price = GlobalPriceCache.get(llamaId);
 }
 if (!price && typeof Pricing !== 'undefined' && Pricing.getDefiLlamaPrice) {
 var usdPrice = Pricing.getDefiLlamaPrice(llamaId);
 if (usdPrice) {
 price = usdPrice * fxRate;
 if (GlobalPriceCache && GlobalPriceCache.set) GlobalPriceCache.set(llamaId, price);
 }
 }
 status = price ? "OK" : "MISS";
 } catch (e) {
 status = "ERROR";
 error = String(e.message || e).substring(0, 40);
 }
 
 results.push({ token: llamaId.replace("coingecko:", ""), price: price, status: status, timeMs: Date.now() - startMs, error: error });
 }
 return results;
}

// ============================================================
// SYSTEM ALERTS
// ============================================================

function _generateSystemAlerts() {
 var alerts = [];
 
 // 1. RPC Health
 try {
 if (typeof GET_LOW_HEALTH_CHAINS === "function") {
 var lowHealth = GET_LOW_HEALTH_CHAINS(OPTIMIZATION_CONFIG.ALERTS.RPC_HEALTH_WARN);
 for (var i = 1; i < lowHealth.length; i++) {
 var rpcScore = Number(lowHealth[i][2]) || 100;
 if (rpcScore < OPTIMIZATION_CONFIG.ALERTS.RPC_HEALTH_CRITICAL) {
 alerts.push({ severity: "CRITICAL", category: "RPC", chain: lowHealth[i][0], message: "RPC health critically low: " + rpcScore + "%", action: "Add backup RPC endpoints immediately" });
 } else if (rpcScore < OPTIMIZATION_CONFIG.ALERTS.RPC_HEALTH_WARN) {
 alerts.push({ severity: "WARNING", category: "RPC", chain: lowHealth[i][0], message: "RPC health degraded: " + rpcScore + "%", action: "Consider adding more RPC endpoints" });
 }
 }
 }
 } catch (e) {}
 
 // 2. Circuit Breakers
 var circuits = ChainCircuitBreaker.getAllStates();
 for (var j = 0; j < circuits.length; j++) {
 var cb = circuits[j];
 if (cb.state === ChainCircuitBreaker.STATES.OPEN) {
 alerts.push({ severity: "CRITICAL", category: "CIRCUIT", chain: cb.chain, message: "Circuit breaker OPEN - chain blocked", action: "Manual intervention required" });
 } else if (cb.state === ChainCircuitBreaker.STATES.HALF_OPEN) {
 alerts.push({ severity: "WARNING", category: "CIRCUIT", chain: cb.chain, message: "Circuit breaker testing recovery", action: "Monitor next refresh" });
 }
 }
 
 // 3. Cache Size
 try {
 var props = PropertiesService.getScriptProperties();
 var allProps = props.getProperties();
 var totalBytes = 0;
 for (var key in allProps) totalBytes += (key.length + (allProps[key] || "").length) * 2;
 var totalKb = totalBytes / 1024;
 
 if (totalKb > OPTIMIZATION_CONFIG.ALERTS.CACHE_SIZE_CRITICAL_KB) {
 alerts.push({ severity: "CRITICAL", category: "CACHE", message: "Cache size critical: " + totalKb.toFixed(1) + "KB / 500KB", action: "Run contract pruning immediately" });
 } else if (totalKb > OPTIMIZATION_CONFIG.ALERTS.CACHE_SIZE_WARN_KB) {
 alerts.push({ severity: "WARNING", category: "CACHE", message: "Cache size high: " + totalKb.toFixed(1) + "KB / 500KB", action: "Consider pruning dead contracts" });
 }
 } catch (e) {}
 
 // Sort by severity
 var severityOrder = { "CRITICAL": 0, "WARNING": 1, "INFO": 2 };
 alerts.sort(function(a, b) { return (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9); });
 
 return alerts;
}

// ============================================================
// DIAGNOSTIC FUNCTIONS
// ============================================================

/**
 * Chains with low RPC health
 * @param {number} threshold - Minimum health score (default: 90)
 * @customfunction
 */
function DIAG_LOW_RPC_HEALTH(threshold) {
 threshold = threshold || 90;
 var out = [["Chain", "VM", "RPC Score", "Endpoints", "Primary RPC", "Recommendation"]];
 
 try {
 if (typeof GET_ALL_RPC_HEALTH === "function") {
 var all = GET_ALL_RPC_HEALTH();
 for (var i = 1; i < all.length; i++) {
 var row = all[i];
 var rpcScore = Number(row[2]) || 100;
 var endpoints = Number(row[5]) || 0;
 
 if (rpcScore < threshold) {
 var rec = endpoints <= 1 ? "CRITICAL: Add more RPC endpoints" :
 endpoints <= 3 ? "Add 2-3 backup endpoints" :
 rpcScore < 50 ? "Check endpoint availability" : "Monitor - may recover";
 out.push([row[0], row[1], rpcScore, endpoints, String(row[4] || "").substring(0, 35), rec]);
 }
 }
 }
 if (out.length === 1) out.push(["ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“ All chains healthy", "", ">=" + threshold, "", "", ""]);
 } catch (e) { out.push(["ERROR", String(e.message || e), "", "", "", ""]); }
 
 return out;
}

/**
 * Analyze stale prices
 * @customfunction
 */
function DIAG_STALE_PRICES() {
 var out = [["Chain", "Wallet", "Token", "Status", "Age (h)", "Balance", "Action"]];
 var counts = { fresh: 0, stale: 0, expired: 0, missing: 0 };
 
 try {
 var props = PropertiesService.getScriptProperties();
 var allKeys = props.getKeys();
 
 for (var i = 0; i < allKeys.length; i++) {
 var key = allKeys[i];
 if (!CacheKeyUtils.isWalletKey(key)) continue;
 
 try {
 var raw = props.getProperty(key);
 if (!raw) continue;
 var cache = JSON.parse(raw);
 if (cache.a && !cache.assets && typeof CacheManager !== 'undefined' && CacheManager._inflateWalletPayload_) {
 cache = CacheManager._inflateWalletPayload_(cache);
 }
 
 var analysis = PriceStalenessChecker.analyzeCache(cache);
 counts.fresh += analysis.fresh; counts.stale += analysis.stale;
 counts.expired += analysis.expired; counts.missing += analysis.missing;
 
 var chainName = CacheKeyUtils.extractChain(key) || key.substring(0, 15);
 var walletShort = _opt_extractWalletFromKey(key);
 
 for (var j = 0; j < analysis.details.length; j++) {
 var d = analysis.details[j];
 var action = d.level === "EXPIRED" ? "Force refresh" : d.level === "MISSING" ? "Check pricing" : "Monitor";
 out.push([chainName, walletShort, d.symbol, d.indicator + " " + d.level, d.ageHours || "-", d.balance, action]);
 }
 } catch (e) {}
 }
 
 out.push(["", "", "", "", "", "", ""]);
 out.push(["SUMMARY", "Fresh: " + counts.fresh, "Stale: " + counts.stale, "Expired: " + counts.expired, "Missing: " + counts.missing, "", ""]);
 } catch (e) { out.push(["ERROR", String(e.message || e), "", "", "", "", ""]); }
 
 return out;
}

/**
 * Find dead contracts
 * @customfunction
 */
function DIAG_DEAD_CONTRACTS() {
 var out = [["Chain", "Wallet", "Contract", "Symbol", "Balance", "Reason", "Savings"]];
 var totalPrunable = 0, estimatedSavings = 0;
 
 try {
 var props = PropertiesService.getScriptProperties();
 var allKeys = props.getKeys();
 
 for (var i = 0; i < allKeys.length; i++) {
 var key = allKeys[i];
 if (!CacheKeyUtils.isWalletKey(key)) continue;
 
 try {
 var raw = props.getProperty(key);
 if (!raw) continue;
 var cache = JSON.parse(raw);
 if (cache.a && !cache.assets && typeof CacheManager !== 'undefined' && CacheManager._inflateWalletPayload_) {
 cache = CacheManager._inflateWalletPayload_(cache);
 }
 
 var deadContracts = ContractPruner.findDeadContracts(cache);
 if (deadContracts.length === 0) continue;
 
 var chainName = CacheKeyUtils.extractChain(key) || key.substring(0, 15);
 var walletShort = _opt_extractWalletFromKey(key);
 
 for (var j = 0; j < deadContracts.length; j++) {
 var d = deadContracts[j];
 totalPrunable++; estimatedSavings += 100;
 out.push([chainName, walletShort, d.contract.substring(0, 16) + "...", d.symbol, d.balance || 0, d.reason, "~100B"]);
 }
 } catch (e) {}
 }
 
 out.push(["", "", "", "", "", "", ""]);
 out.push(["SUMMARY", totalPrunable + " prunable", "", "", "", "", "~" + (estimatedSavings / 1024).toFixed(1) + "KB"]);
 } catch (e) { out.push(["ERROR", String(e.message || e), "", "", "", "", ""]); }
 
 return out;
}

/**
 * Circuit breaker status
 * @customfunction
 */
function DIAG_CIRCUIT_BREAKERS() {
 var out = [["Chain", "State", "Failures", "Last Failure", "Last Success", "Action"]];
 ChainCircuitBreaker.reload();
 var states = ChainCircuitBreaker.getAllStates();
 
 if (states.length === 0) {
 out.push(["ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“ All circuits CLOSED", "", "", "", "", "System healthy"]);
 } else {
 for (var i = 0; i < states.length; i++) {
 var s = states[i];
 var action = s.state === "OPEN" ? "ÃƒÂ¢Ã…Â¡Ã‚Â  Blocked - wait or reset" : s.state === "HALF_OPEN" ? "Testing..." : s.failures > 0 ? "Monitor" : "OK";
 out.push([s.chain, s.state, s.failures, s.lastFailure ? s.lastFailure.substring(0, 19) : "-", s.lastSuccess ? s.lastSuccess.substring(0, 19) : "-", action]);
 }
 }
 return out;
}

/**
 * System alerts
 * @customfunction
 */
function DIAG_SYSTEM_ALERTS() {
 var out = [["Severity", "Category", "Chain", "Message", "Recommended Action"]];
 var alerts = _generateSystemAlerts();
 
 if (alerts.length === 0) {
 out.push(["ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“ OK", "SYSTEM", "", "No active alerts", "System healthy"]);
 } else {
 for (var i = 0; i < alerts.length; i++) {
 var a = alerts[i];
 out.push([a.severity, a.category, a.chain || "", a.message, a.action]);
 }
 }
 return out;
}

// ============================================================
// ACTION FUNCTIONS
// ============================================================

/**
 * Warm up price cache
 * @customfunction
 */
function WCORE_WARMUP_PRICES() {
 var out = [["Token", "Price EUR", "Status", "Time (ms)"]];
 var results = _warmupPriceCache();
 var okCount = 0, totalMs = 0;
 
 for (var i = 0; i < results.length; i++) {
 var r = results[i];
 if (r.status === "OK") okCount++;
 totalMs += r.timeMs || 0;
 out.push([r.token, r.price ? r.price.toFixed(6) : "-", r.status, r.timeMs || (r.error || "")]);
 }
 
 out.push(["", "", "", ""]);
 out.push(["SUMMARY", okCount + "/" + results.length + " loaded", "", totalMs + "ms total"]);
 
 try {
 if (typeof GlobalPriceCache !== 'undefined' && GlobalPriceCache.save) GlobalPriceCache.save();
 } catch (e) {}
 
 return out;
}

/**
 * Prune dead contracts
 * @param {boolean} dryRun - TRUE for dry run (default), FALSE to execute
 * @customfunction
 */
function WCORE_PRUNE_CONTRACTS(dryRun) {
 dryRun = (dryRun !== false);
 var out = [["Chain", "Wallet", "Pruned", "Remaining", "Status"]];
 var totalPruned = 0, walletsModified = 0;
 
 try {
 var props = PropertiesService.getScriptProperties();
 var allKeys = props.getKeys();
 
 for (var i = 0; i < allKeys.length; i++) {
 var key = allKeys[i];
 if (!CacheKeyUtils.isWalletKey(key)) continue;
 
 try {
 var raw = props.getProperty(key);
 if (!raw) continue;
 var cache = JSON.parse(raw);
 var wasCompact = !!(cache.a && !cache.assets);
 if (wasCompact && typeof CacheManager !== 'undefined' && CacheManager._inflateWalletPayload_) {
 cache = CacheManager._inflateWalletPayload_(cache);
 }
 
 var deadContracts = ContractPruner.findDeadContracts(cache);
 if (deadContracts.length === 0) continue;
 
 var chainName = CacheKeyUtils.extractChain(key) || key.substring(0, 15);
 var walletShort = _opt_extractWalletFromKey(key);
 var before = cache.assets ? cache.assets.length : 0;
 
 if (dryRun) {
 out.push([chainName, walletShort, deadContracts.length + " (dry)", before, "WOULD_PRUNE"]);
 } else {
 var pruned = ContractPruner.pruneContracts(cache, deadContracts);
 totalPruned += pruned; walletsModified++;
 if (wasCompact && typeof CacheManager !== 'undefined' && CacheManager._deflateWalletPayload_) {
 cache = CacheManager._deflateWalletPayload_(cache);
 }
 props.setProperty(key, JSON.stringify(cache));
 out.push([chainName, walletShort, pruned, before - pruned, "PRUNED ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“"]);
 }
 } catch (e) {}
 }
 
 out.push(["", "", "", "", ""]);
 out.push([dryRun ? "DRY RUN" : "EXECUTED", dryRun ? "No changes" : totalPruned + " pruned", "", "", ""]);
 } catch (e) { out.push(["ERROR", String(e.message || e), "", "", ""]); }
 
 return out;
}

/**
 * Reset circuit breaker
 * @param {string} chainId - Chain to reset (optional, all if empty)
 * @customfunction
 */
function WCORE_RESET_CIRCUIT(chainId) {
 var out = [["Action", "Result"]];
 try {
 if (chainId && String(chainId).trim()) {
 ChainCircuitBreaker.reset(String(chainId).trim().toUpperCase());
 out.push(["Reset circuit", chainId + " ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ CLOSED"]);
 } else {
 ChainCircuitBreaker.reset();
 out.push(["Reset all circuits", "All ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ CLOSED"]);
 }
 } catch (e) { out.push(["ERROR", String(e.message || e)]); }
 return out;
}

// ============================================================
// INTEGRATION HOOKS
// ============================================================

function onWalletRefreshSuccess(chainId) {
 if (chainId) ChainCircuitBreaker.recordSuccess(String(chainId).toUpperCase());
}

function onWalletRefreshFailure(chainId) {
 if (chainId) ChainCircuitBreaker.recordFailure(String(chainId).toUpperCase());
}

function isChainRefreshAllowed(chainId) {
 if (!chainId) return true;
 return ChainCircuitBreaker.isAllowed(String(chainId).toUpperCase());
}

// ============================================================
// HELPERS
// ============================================================

function _opt_extractWalletFromKey(key) {
 if (!key) return "?";
 var evmMatch = key.match(/(0x[a-f0-9]{6,8})/i);
 if (evmMatch) return evmMatch[1].toLowerCase() + "...";
 var svmMatch = key.match(/SVM_([A-Za-z0-9]{6,8})/i);
 if (svmMatch) return svmMatch[1] + "...";
 return "wallet";
}
