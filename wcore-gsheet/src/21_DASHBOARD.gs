/************************************************************
 * 21_DASHBOARD.gs - WCORE Unified Dashboard (v4.10.0)
 * 
 * Dashboard centralisÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â© pour vue d'ensemble du portfolio et santÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â© systÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨me.
 * 
 * FONCTIONS PRINCIPALES:
 * - WCORE_DASHBOARD() : Vue globale portfolio + santÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©
 * - WCORE_PORTFOLIO() : RÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©sumÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â© portfolio par chaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â®ne
 * - WCORE_ALERTS() : Alertes actives (prix manquants, erreurs, etc.)
 * - WCORE_CHAIN_HEALTH() : SantÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â© dÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©taillÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©e par chaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â®ne
 * 
 * DÃƒÆ’Ã†â€™aEUR degPENDANCES:
 * - 01_INIT.gs (WCORE_VERSION, WCORE_STABLECOINS)
 * - 04B_CACHE_WALLET.gs (WalletCache)
 * - 09_BUDGET.gs (BudgetStats)
 * - 13_DIAGNOSTIC.gs (Diagnostic helpers)
 * 
 ************************************************************/
var DASHBOARD_VERSION = "4.10.0";

// ============================================================
// CONFIGURATION
// ============================================================

var DASHBOARD_CONFIG = {
 // Seuils d'alerte
 THRESHOLDS: {
 CACHE_WARNING_KB: 400,
 CACHE_CRITICAL_KB: 480,
 HTTP_WARNING_PERCENT: 80,
 HTTP_CRITICAL_PERCENT: 95,
 STALE_CACHE_HOURS: 24,
 MISSING_PRICE_WARN: 3,
 VALUE_SIGNIFICANT_EUR: 1 // Valeur minimum pour considÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©rer un wallet "actif"
 },
 
 // Emojis pour statuts (UTF-8 safe)
 STATUS: {
 OK: "OK",
 WARN: "WARN", 
 ERROR: "ERROR",
 STALE: "STALE",
 MISSING: "N/A"
 },
 
 // ChaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â®nes connues par type de VM
 CHAIN_REGISTRY: {
 EVM: [
 "ABSTRACT", "ANCIENT8", "APECHAIN", "APPCHAIN", "ARBITRUM_NOVA", "ARBITRUM_ONE",
 "ASTAR", "AURORA", "AVALANCHE", "B2", "B3", "BASE", "BEAM", "BERACHAIN",
"BITLAYER", "BLAST", "BOB", "BOBA", "BOTANIX", "BSC", "CAMP", "CELO",
"CITREA", "CORN", "CRONOS", "CYBER", "DBK_CHAIN", "DOMA", "DUCKCHAIN", "ETHEREUM",
 "ETHERLINK", "FLARE", "FLOW", "FRAXTAL", "FUSE", "GEB", "GNOSIS",
 "GRAVITY", "HASHKEY", "HEMI", "IMMUTABLE", "INK", "INTUITION", "KAIA",
 "KATANA", "KCC", "LINEA", "LISK", "MANTA_PACIFIC", "MANTLE", "MATCHAIN",
 "MERLIN", "METAL_L2", "METIS", "MEZO", "MITOSIS", "MODE",
 "MONAD", "MOONBEAM", "MOONRIVER", "MORPH", "OPBNB", "OPENLEDGER",
 "OPTIMISM", "PLASMA", "PLUME", "POLYGON", "POLYGON_ZKEVM", "POLYNOMIAL",
 "PULSECHAIN", "RACE", "RARI", "REYA", "RONIN", "ROOTSTOCK",
 "SCROLL", "SEI", "SHAPE", "SHIBARIUM", "SOMNIA", "SONEIUM", "SONIC",
 "STABLE", "STORY", "SUPERPOSITION", "SUPERSEED", "SWAN", "SWELLCHAIN",
 "SYNDICATE_COMMONS", "TAC", "TAIKO_ALETHIA", "UNICHAIN", "VANA",
 "WORLDCHAIN", "X_LAYER", "XRPLEVM", "ZETACHAIN", "ZIRCUIT",
 "ZKLINKNOVA", "ZKSYNC_ERA", "ZORA"
 ],
 SVM: ["SOLANA", "FOGO"],
  COSMOS: ["INJECTIVE", "TERRA", "OSMOSIS", "COSMOS_HUB"],
  TON: ["TON"]
  }
};

// ============================================================
// MAIN DASHBOARD FUNCTION
// ============================================================

/**
 * Dashboard principal WCORE - Vue d'ensemble complÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨te
 * 
 * @param {any} trigger - ParamÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨tre optionnel pour forcer le recalcul
 * @returns {Array} Tableau 2D pour Google Sheets
 * @customfunction
 */
function WCORE_DASHBOARD(trigger) {
 void trigger;
 var startMs = Date.now();
 var out = [];
 
 try {
 // Header
 out.push(["WCORE DASHBOARD", "", "", "", "", ""]);
 out.push(["Generated", Format.now(), "Version", WCORE_VERSION.toString(), "", ""]);
 out.push(["", "", "", "", "", ""]);
 
 // ============================================================
 // SECTION 1: PORTFOLIO SUMMARY
 // ============================================================
 out.push(["=== PORTFOLIO SUMMARY ===", "", "", "", "", ""]);
 out.push(["Chain", "Value EUR", "Assets", "Last Update", "Status", "Details"]);
 
 var portfolioData = _dashboard_getPortfolioSummary();
 var totalValueEur = 0;
 var totalAssets = 0;
 var chainsOk = 0;
 var chainsWarn = 0;
 var chainsError = 0;
 
 for (var i = 0; i < portfolioData.length; i++) {
 var chain = portfolioData[i];
 out.push([
 chain.name,
 chain.valueEur > 0 ? chain.valueEur.toFixed(2) : "-",
 chain.assetCount,
 chain.lastUpdate || "N/A",
 chain.status,
 chain.details || ""
 ]);
 
 totalValueEur += chain.valueEur || 0;
 totalAssets += chain.assetCount || 0;
 
 if (chain.status === DASHBOARD_CONFIG.STATUS.OK) chainsOk++;
 else if (chain.status === DASHBOARD_CONFIG.STATUS.WARN || chain.status === DASHBOARD_CONFIG.STATUS.STALE) chainsWarn++;
 else if (chain.status === DASHBOARD_CONFIG.STATUS.ERROR) chainsError++;
 }
 
 out.push(["", "", "", "", "", ""]);
 out.push(["TOTAL", totalValueEur.toFixed(2) + " EUR", totalAssets + " assets", "", "", ""]);
 out.push(["", "", "", "", "", ""]);
 
 // ============================================================
 // SECTION 2: SYSTEM HEALTH
 // ============================================================
 out.push(["=== SYSTEM HEALTH ===", "", "", "", "", ""]);
 out.push(["Metric", "Value", "Status", "Limit", "Details", ""]);
 
 // Cache stats
 var cacheStats = _dashboard_getCacheStats();
 out.push([
 "Cache Size",
 cacheStats.sizeKb.toFixed(1) + " KB",
 cacheStats.status,
 "500 KB",
 cacheStats.usagePercent.toFixed(1) + "% used",
 ""
 ]);
 out.push([
 "Cache Keys",
 cacheStats.keyCount,
 "",
 "",
 "Wallet: " + cacheStats.walletKeys + ", Price: " + cacheStats.priceKeys,
 ""
 ]);
 
 // HTTP Budget
 var httpStats = _dashboard_getHttpStats();
 out.push([
 "HTTP Quota",
 httpStats.used + " / " + httpStats.limit,
 httpStats.status,
 httpStats.limit,
 httpStats.remaining + " remaining (" + httpStats.usagePercent.toFixed(1) + "%)",
 ""
 ]);
 
 // Chains health summary
 out.push([
 "Chains OK",
 chainsOk,
 chainsOk > 0 ? DASHBOARD_CONFIG.STATUS.OK : DASHBOARD_CONFIG.STATUS.WARN,
 "",
 "",
 ""
 ]);
 out.push([
 "Chains Warning",
 chainsWarn,
 chainsWarn > 0 ? DASHBOARD_CONFIG.STATUS.WARN : "",
 "",
 "",
 ""
 ]);
 out.push([
 "Chains Error",
 chainsError,
 chainsError > 0 ? DASHBOARD_CONFIG.STATUS.ERROR : "",
 "",
 "",
 ""
 ]);
 
 out.push(["", "", "", "", "", ""]);
 
 // ============================================================
 // SECTION 3: ALERTS
 // ============================================================
 var alerts = _dashboard_getAlerts(portfolioData, cacheStats, httpStats);
 
 if (alerts.length > 0) {
 out.push(["=== ACTIVE ALERTS ===", "", "", "", "", ""]);
 out.push(["Severity", "Category", "Message", "Chain", "Action", ""]);
 
 for (var a = 0; a < alerts.length && a < 10; a++) {
 var alert = alerts[a];
 out.push([
 alert.severity,
 alert.category,
 alert.message,
 alert.chain || "",
 alert.action || "",
 ""
 ]);
 }
 
 if (alerts.length > 10) {
 out.push(["...", "", (alerts.length - 10) + " more alerts", "", "", ""]);
 }
 } else {
 out.push(["=== NO ACTIVE ALERTS ===", "", "", "", "", ""]);
 }
 
 out.push(["", "", "", "", "", ""]);
 
 // Footer
 var execMs = Date.now() - startMs;
 out.push(["Dashboard generated in " + execMs + "ms", "", "", "", "", ""]);
 
 return out;
 
 } catch (e) {
 return [
 ["WCORE DASHBOARD - ERROR", "", "", "", "", ""],
 ["Error", String(e.message || e), "", "", "", ""],
 ["Stack", String(e.stack || "").substring(0, 200), "", "", "", ""]
 ];
 }
}

// ============================================================
// PORTFOLIO SUMMARY FUNCTION
// ============================================================

/**
 * RÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©sumÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â© du portfolio par chaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â®ne
 * 
 * @param {any} trigger - ParamÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨tre optionnel pour forcer le recalcul
 * @returns {Array} Tableau 2D pour Google Sheets
 * @customfunction
 */
function WCORE_PORTFOLIO(trigger) {
 void trigger;
 var out = [["Chain", "VM", "Value EUR", "Assets", "Native", "Tokens", "Last Update", "Status"]];
 
 try {
 var portfolioData = _dashboard_getPortfolioSummary();
 var totalValueEur = 0;
 
 for (var i = 0; i < portfolioData.length; i++) {
 var chain = portfolioData[i];
 out.push([
 chain.name,
 chain.vm || "EVM",
 chain.valueEur > 0 ? chain.valueEur.toFixed(2) : "-",
 chain.assetCount,
 chain.nativeValue > 0 ? chain.nativeValue.toFixed(2) : "-",
 chain.tokenCount || 0,
 chain.lastUpdate || "N/A",
 chain.status
 ]);
 totalValueEur += chain.valueEur || 0;
 }
 
 out.push(["", "", "", "", "", "", "", ""]);
 out.push(["TOTAL", "", totalValueEur.toFixed(2), "", "", "", "", ""]);
 
 return out;
 } catch (e) {
 return [["Error", String(e.message || e)]];
 }
}

// ============================================================
// ALERTS FUNCTION
// ============================================================

/**
 * Liste des alertes actives
 * 
 * @param {any} trigger - ParamÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨tre optionnel pour forcer le recalcul
 * @returns {Array} Tableau 2D pour Google Sheets
 * @customfunction
 */
function WCORE_ALERTS(trigger) {
 void trigger;
 var out = [["Severity", "Category", "Chain", "Message", "Action", "Since"]];
 
 try {
 var portfolioData = _dashboard_getPortfolioSummary();
 var cacheStats = _dashboard_getCacheStats();
 var httpStats = _dashboard_getHttpStats();
 var alerts = _dashboard_getAlerts(portfolioData, cacheStats, httpStats);
 
 if (alerts.length === 0) {
 out.push(["OK", "System", "", "No active alerts", "", ""]);
 return out;
 }
 
 for (var i = 0; i < alerts.length; i++) {
 var alert = alerts[i];
 out.push([
 alert.severity,
 alert.category,
 alert.chain || "",
 alert.message,
 alert.action || "",
 alert.since || ""
 ]);
 }
 
 return out;
 } catch (e) {
 return [["Error", "System", "", String(e.message || e), "", ""]];
 }
}

// ============================================================
// CHAIN HEALTH FUNCTION
// ============================================================

/**
 * SantÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â© dÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©taillÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©e par chaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â®ne
 * 
 * @param {string} chainName - Nom de la chaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â®ne (optionnel, toutes si vide)
 * @param {any} trigger - ParamÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨tre optionnel pour forcer le recalcul
 * @returns {Array} Tableau 2D pour Google Sheets
 * @customfunction
 */
function WCORE_CHAIN_HEALTH(chainName, trigger) {
 void trigger;
 var out = [["Chain", "Metric", "Value", "Status", "Details"]];
 
 try {
 var chains = chainName ? [String(chainName).toUpperCase()] : _dashboard_getAllChainNames();
 
 for (var i = 0; i < chains.length; i++) {
 var name = chains[i];
 var health = _dashboard_getChainHealth(name);
 
 if (!health) continue;
 
 out.push([name, "Cache Age", health.cacheAgeMin + " min", health.cacheStatus, ""]);
 out.push([name, "Assets", health.assetCount, "", health.nativeBalance + " native"]);
 out.push([name, "Value EUR", health.valueEur.toFixed(2), "", ""]);
 out.push([name, "Prices Missing", health.pricesMissing, health.pricesMissing > 0 ? DASHBOARD_CONFIG.STATUS.WARN : "", ""]);
 out.push([name, "Last Error", health.lastError || "None", health.lastError ? DASHBOARD_CONFIG.STATUS.ERROR : "", ""]);
 out.push(["", "", "", "", ""]);
 }
 
 return out;
 } catch (e) {
 return [["Error", "", String(e.message || e), "", ""]];
 }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * RÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©cupÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨re le rÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©sumÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â© du portfolio depuis les caches
 */
function _dashboard_getPortfolioSummary() {
 var results = [];
 var props = PropertiesService.getScriptProperties();
 var allKeys = props.getKeys();
 var nowMs = Date.now();
 var staleMs = DASHBOARD_CONFIG.THRESHOLDS.STALE_CACHE_HOURS * 3600000;
 
 // Trouver toutes les clÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©s de cache wallet
 var walletKeys = [];
 for (var i = 0; i < allKeys.length; i++) {
 var key = allKeys[i];
 if (CacheKeyUtils.isWalletKey(key)) {
 walletKeys.push(key);
 }
 }
 
 // Grouper par chaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â®ne
 var chainData = {};
 
 for (var j = 0; j < walletKeys.length; j++) {
 var wKey = walletKeys[j];
 var chainName = CacheKeyUtils.extractChain(wKey);
 if (!chainName) continue;
 
 try {
 var raw = props.getProperty(wKey);
 if (!raw) continue;
 
 var cache = JSON.parse(raw);
 if (!cache) continue;
 
 // Inflate si nÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©cessaire
 if (cache.a && !cache.assets) {
 cache = CacheManager._inflateWalletPayload_(cache);
 }
 
 if (!chainData[chainName]) {
 chainData[chainName] = {
 name: chainName,
 vm: CacheKeyUtils.getVM(chainName),
 valueEur: 0,
 nativeValue: 0,
 assetCount: 0,
 tokenCount: 0,
 lastUpdate: null,
 lastUpdateMs: 0,
 pricesMissing: 0,
 hasError: false,
 errorMsg: null
 };
 }
 
 var cd = chainData[chainName];
 var assets = cache.assets || [];
 var priceMap = cache.priceMap || cache.pm || {};
 
 // Calculer la valeur
 for (var k = 0; k < assets.length; k++) {
 var asset = assets[k];
 if (!asset) continue;
 
 var contract = asset.contract || asset.c || "";
 var balance = Number(asset.balance || asset.b || 0);
 
 if (balance <= 0) continue;
 
 cd.assetCount++;
 
 var price = null;
 if (contract === "native") {
 price = priceMap["native"] || priceMap[cd.name.toLowerCase() + "_native"] || asset.price_eur;
 if (Num.isValidPositive(price) && Num.isValidPositive(balance)) {
 cd.nativeValue += balance * price;
 }
 } else {
 cd.tokenCount++;
 var priceKey = contract.toLowerCase();
 price = priceMap[priceKey] || priceMap[contract] || asset.price_eur;
 }
 
 if (Num.isValidPositive(price) && Num.isValidPositive(balance)) {
 cd.valueEur += balance * price;
 } else if (balance > 0) {
 cd.pricesMissing++;
 }
 }
 
 // Timestamp
 var updatedAt = cache.updatedAt || cache.u;
 if (updatedAt) {
 var upMs = (typeof updatedAt === "number" && updatedAt < 2000000000) ? updatedAt * 1000 : updatedAt;
 if (upMs > cd.lastUpdateMs) {
 cd.lastUpdateMs = upMs;
 cd.lastUpdate = Format.datetime(upMs);
 }
 }
 
 // Erreur
 if (cache.last_error) {
 cd.hasError = true;
 cd.errorMsg = String(cache.last_error).substring(0, 100);
 }
 
 } catch (e) {
 // Ignore parsing errors
 }
 }
 
 // Convertir en array et calculer status
 for (var cName in chainData) {
 if (!chainData.hasOwnProperty(cName)) continue;
 var c = chainData[cName];
 
 // DÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©terminer le status
 if (c.hasError) {
 c.status = DASHBOARD_CONFIG.STATUS.ERROR;
 c.details = c.errorMsg;
 } else if (c.lastUpdateMs > 0 && (nowMs - c.lastUpdateMs) > staleMs) {
 c.status = DASHBOARD_CONFIG.STATUS.STALE;
 c.details = "Cache > " + DASHBOARD_CONFIG.THRESHOLDS.STALE_CACHE_HOURS + "h";
 } else if (c.pricesMissing >= DASHBOARD_CONFIG.THRESHOLDS.MISSING_PRICE_WARN) {
 c.status = DASHBOARD_CONFIG.STATUS.WARN;
 c.details = c.pricesMissing + " prices missing";
 } else if (c.assetCount === 0) {
 c.status = DASHBOARD_CONFIG.STATUS.MISSING;
 c.details = "No cache";
 } else {
 c.status = DASHBOARD_CONFIG.STATUS.OK;
 c.details = "";
 }
 
 results.push(c);
 }
 
 // Trier par valeur dÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©croissante
 results.sort(function(a, b) {
 return (b.valueEur || 0) - (a.valueEur || 0);
 });
 
 return results;
}

/**
 * RÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©cupÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨re les statistiques de cache
 */
function _dashboard_getCacheStats() {
 var props = PropertiesService.getScriptProperties();
 var allKeys = props.getKeys();
 var totalSize = 0;
 var walletKeys = 0;
 var priceKeys = 0;
 
 for (var i = 0; i < allKeys.length; i++) {
 var key = allKeys[i];
 try {
 var val = props.getProperty(key);
 if (val) {
 totalSize += val.length;
 }
 
 if (CacheKeyUtils.isWalletKey(key)) walletKeys++;
 else if (key.indexOf("PRICE") >= 0 || key.indexOf("_px_") >= 0) priceKeys++;
 } catch (e) {}
 }
 
 var sizeKb = totalSize / 1024;
 var usagePercent = (sizeKb / 500) * 100;
 
 var status = DASHBOARD_CONFIG.STATUS.OK;
 if (sizeKb >= DASHBOARD_CONFIG.THRESHOLDS.CACHE_CRITICAL_KB) {
 status = DASHBOARD_CONFIG.STATUS.ERROR;
 } else if (sizeKb >= DASHBOARD_CONFIG.THRESHOLDS.CACHE_WARNING_KB) {
 status = DASHBOARD_CONFIG.STATUS.WARN;
 }
 
 return {
 sizeKb: sizeKb,
 keyCount: allKeys.length,
 walletKeys: walletKeys,
 priceKeys: priceKeys,
 usagePercent: usagePercent,
 status: status
 };
}

/**
 * RÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©cupÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨re les statistiques HTTP
 */
function _dashboard_getHttpStats() {
 var stats = {
 used: 0,
 limit: 18000,
 remaining: 18000,
 usagePercent: 0,
 status: DASHBOARD_CONFIG.STATUS.OK
 };
 
 try {
 if (typeof HttpBudget !== "undefined" && HttpBudget.getStats) {
 var httpStats = HttpBudget.getStats();
 stats.used = httpStats.dailyCount || 0;
 stats.limit = httpStats.dailyLimit || 18000;
 stats.remaining = httpStats.remaining || (stats.limit - stats.used);
 stats.usagePercent = (stats.used / stats.limit) * 100;
 
 if (stats.usagePercent >= DASHBOARD_CONFIG.THRESHOLDS.HTTP_CRITICAL_PERCENT) {
 stats.status = DASHBOARD_CONFIG.STATUS.ERROR;
 } else if (stats.usagePercent >= DASHBOARD_CONFIG.THRESHOLDS.HTTP_WARNING_PERCENT) {
 stats.status = DASHBOARD_CONFIG.STATUS.WARN;
 }
 }
 } catch (e) {}
 
 return stats;
}

/**
 * GÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©nÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨re les alertes
 */
function _dashboard_getAlerts(portfolioData, cacheStats, httpStats) {
 var alerts = [];
 
 // Alerte cache critique
 if (cacheStats.status === DASHBOARD_CONFIG.STATUS.ERROR) {
 alerts.push({
 severity: "CRITICAL",
 category: "Cache",
 message: "Cache near limit: " + cacheStats.sizeKb.toFixed(0) + " KB / 500 KB",
 action: "Run CLEANUP.forceClean()"
 });
 } else if (cacheStats.status === DASHBOARD_CONFIG.STATUS.WARN) {
 alerts.push({
 severity: "WARNING",
 category: "Cache",
 message: "Cache usage high: " + cacheStats.usagePercent.toFixed(0) + "%",
 action: "Monitor or clean old entries"
 });
 }
 
 // Alerte HTTP quota
 if (httpStats.status === DASHBOARD_CONFIG.STATUS.ERROR) {
 alerts.push({
 severity: "CRITICAL",
 category: "HTTP",
 message: "HTTP quota critical: " + httpStats.remaining + " remaining",
 action: "Reduce refresh frequency"
 });
 } else if (httpStats.status === DASHBOARD_CONFIG.STATUS.WARN) {
 alerts.push({
 severity: "WARNING",
 category: "HTTP",
 message: "HTTP quota high: " + httpStats.usagePercent.toFixed(0) + "% used",
 action: "Monitor usage"
 });
 }
 
 // Alertes par chaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â®ne
 for (var i = 0; i < portfolioData.length; i++) {
 var chain = portfolioData[i];
 
 if (chain.status === DASHBOARD_CONFIG.STATUS.ERROR) {
 alerts.push({
 severity: "ERROR",
 category: "Chain",
 chain: chain.name,
 message: chain.details || "Error state",
 action: "Check RPC and refresh"
 });
 } else if (chain.status === DASHBOARD_CONFIG.STATUS.STALE && chain.valueEur > DASHBOARD_CONFIG.THRESHOLDS.VALUE_SIGNIFICANT_EUR) {
 alerts.push({
 severity: "WARNING",
 category: "Chain",
 chain: chain.name,
 message: "Cache stale (>" + DASHBOARD_CONFIG.THRESHOLDS.STALE_CACHE_HOURS + "h)",
 action: "Force refresh"
 });
 } else if (chain.pricesMissing > 0 && chain.valueEur > DASHBOARD_CONFIG.THRESHOLDS.VALUE_SIGNIFICANT_EUR) {
 alerts.push({
 severity: "INFO",
 category: "Pricing",
 chain: chain.name,
 message: chain.pricesMissing + " token(s) without price",
 action: "Check token contracts"
 });
 }
 }
 
 // Trier par sÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©vÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©ritÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©
 var severityOrder = { "CRITICAL": 0, "ERROR": 1, "WARNING": 2, "INFO": 3 };
 alerts.sort(function(a, b) {
 return (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9);
 });
 
 return alerts;
}

/**
 * RÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©cupÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨re la santÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â© d'une chaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â®ne spÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©cifique
 */
function _dashboard_getChainHealth(chainName) {
 var props = PropertiesService.getScriptProperties();
 var allKeys = props.getKeys();
 var nowMs = Date.now();
 
 // Trouver la clÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â© de cache pour cette chaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â®ne
 var cacheKey = null;
 var upperName = String(chainName).toUpperCase();
 
 for (var i = 0; i < allKeys.length; i++) {
 var key = allKeys[i];
 if (CacheKeyUtils.isWalletKey(key) && key.toUpperCase().indexOf(upperName) >= 0) {
 cacheKey = key;
 break;
 }
 }
 
 if (!cacheKey) return null;
 
 try {
 var raw = props.getProperty(cacheKey);
 if (!raw) return null;
 
 var cache = JSON.parse(raw);
 if (cache.a && !cache.assets) {
 cache = CacheManager._inflateWalletPayload_(cache);
 }
 
 var assets = cache.assets || [];
 var priceMap = cache.priceMap || cache.pm || {};
 var updatedAt = cache.updatedAt || cache.u;
 var upMs = (typeof updatedAt === "number" && updatedAt < 2000000000) ? updatedAt * 1000 : updatedAt;
 var cacheAgeMin = upMs ? Math.round((nowMs - upMs) / 60000) : -1;
 
 var valueEur = 0;
 var pricesMissing = 0;
 var nativeBalance = 0;
 
 for (var j = 0; j < assets.length; j++) {
 var asset = assets[j];
 if (!asset) continue;
 
 var contract = asset.contract || "";
 var balance = Number(asset.balance || 0);
 if (balance <= 0) continue;
 
 if (contract === "native") {
 nativeBalance = balance;
 }
 
 var priceKey = contract === "native" ? "native" : contract.toLowerCase();
 var price = priceMap[priceKey] || asset.price_eur;
 
 if (Num.isValidPositive(price)) {
 valueEur += balance * price;
 } else {
 pricesMissing++;
 }
 }
 
 var cacheStatus = DASHBOARD_CONFIG.STATUS.OK;
 if (cacheAgeMin > DASHBOARD_CONFIG.THRESHOLDS.STALE_CACHE_HOURS * 60) {
 cacheStatus = DASHBOARD_CONFIG.STATUS.STALE;
 }
 
 return {
 chainName: chainName,
 cacheAgeMin: cacheAgeMin,
 cacheStatus: cacheStatus,
 assetCount: assets.length,
 nativeBalance: nativeBalance,
 valueEur: valueEur,
 pricesMissing: pricesMissing,
 lastError: cache.last_error || null
 };
 
 } catch (e) {
 return null;
 }
}


/**
 * Retourne tous les noms de chaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â®nes connus
 */
function _dashboard_getAllChainNames() {
 var all = [];
 all = all.concat(DASHBOARD_CONFIG.CHAIN_REGISTRY.EVM);
 all = all.concat(DASHBOARD_CONFIG.CHAIN_REGISTRY.SVM);
 all = all.concat(DASHBOARD_CONFIG.CHAIN_REGISTRY.COSMOS);
 return all;
}

// ============================================================
// QUICK ACCESS FUNCTIONS
// ============================================================

/**
 * Valeur totale du portfolio en EUR
 * @customfunction
 */
function WCORE_TOTAL_VALUE() {
 try {
 var portfolio = _dashboard_getPortfolioSummary();
 var total = 0;
 for (var i = 0; i < portfolio.length; i++) {
 total += portfolio[i].valueEur || 0;
 }
 return total;
 } catch (e) {
 return 0;
 }
}

/**
 * Nombre de chaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â®nes avec erreurs
 * @customfunction
 */
function WCORE_ERROR_COUNT() {
 try {
 var portfolio = _dashboard_getPortfolioSummary();
 var count = 0;
 for (var i = 0; i < portfolio.length; i++) {
 if (portfolio[i].status === DASHBOARD_CONFIG.STATUS.ERROR) count++;
 }
 return count;
 } catch (e) {
 return -1;
 }
}

/**
 * SantÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â© globale du systÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨me (OK/WARN/ERROR)
 * @customfunction
 */
function WCORE_HEALTH_STATUS() {
 try {
 var cacheStats = _dashboard_getCacheStats();
 var httpStats = _dashboard_getHttpStats();
 var portfolio = _dashboard_getPortfolioSummary();
 
 // Critical: cache ou HTTP critique
 if (cacheStats.status === DASHBOARD_CONFIG.STATUS.ERROR) return "ERROR";
 if (httpStats.status === DASHBOARD_CONFIG.STATUS.ERROR) return "ERROR";
 
 // VÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©rifier les chaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â®nes
 var hasError = false;
 var hasWarn = false;
 for (var i = 0; i < portfolio.length; i++) {
 if (portfolio[i].status === DASHBOARD_CONFIG.STATUS.ERROR) hasError = true;
 if (portfolio[i].status === DASHBOARD_CONFIG.STATUS.WARN) hasWarn = true;
 if (portfolio[i].status === DASHBOARD_CONFIG.STATUS.STALE) hasWarn = true;
 }
 
 if (hasError) return "ERROR";
 if (hasWarn || cacheStats.status === DASHBOARD_CONFIG.STATUS.WARN || httpStats.status === DASHBOARD_CONFIG.STATUS.WARN) return "WARN";
 
 return "OK";
 } catch (e) {
 return "ERROR";
 }
}
