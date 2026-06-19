/************************************************************
 * 23_CACHE_OPTIMIZER.gs - Advanced Cache Optimization (v4.10.0)
 * 
 * Optimisations avancÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©es du cache pour maximiser l'espace disponible.
 * 
 * FONCTIONS PRINCIPALES:
 * - CACHE_OPTIMIZE() : Lance une optimisation complÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨te
 * - CACHE_ANALYZE() : Analyse dÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©taillÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©e de l'utilisation
 * - CACHE_COMPACT_ALL() : Compacte tous les caches
 * - CACHE_PURGE_STALE() : Purge les entrÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©es pÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©rimÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©es
 * - CACHE_STATS_DETAILED() : Statistiques dÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©taillÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©es
 * 
 * OPTIMISATIONS:
 * 1. Delta encoding pour timestamps (ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©conomie ~40%)
 * 2. Contrats raccourcis (8 chars au lieu de 42)
 * 3. Purge intelligente des prix >7j
 * 4. Compression des balances (notation scientifique)
 * 5. DÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©duplication des priceMap entre wallets
 * 
 * DÃƒÆ’Ã†â€™aEUR degPENDANCES:
 * - 04A_CACHE_CORE.gs
 * - 04B_CACHE_WALLET.gs
 * 
 ************************************************************/
var CACHE_OPTIMIZER_VERSION = "4.10.0";

// ============================================================
// CONFIGURATION
// ============================================================

var CACHE_OPTIMIZER_CONFIG = {
 // Seuils
 TARGET_SIZE_KB: 400, // Cible aprÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨s optimisation
 WARNING_SIZE_KB: 450, // Seuil d'alerte
 CRITICAL_SIZE_KB: 480, // Seuil critique
 MAX_SIZE_KB: 500, // Limite absolue
 
 // TTL pour purge
 PRICE_TTL_DAYS: 7, // Purge prix >7 jours
 BALANCE_TTL_DAYS: 14, // Purge balances >14 jours
 META_TTL_DAYS: 30, // Purge metadata >30 jours
 
 // Compression
 CONTRACT_SHORT_LEN: 8, // Longueur contrat raccourci
 BALANCE_PRECISION: 8, // DÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©cimales max pour balances
 PRICE_PRECISION: 6, // DÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©cimales max pour prix
 
 // Limites
 MAX_PRICES_PER_WALLET: 80, // Max prix par wallet (rÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©duit de 100)
 MAX_INFO_ROWS: 30, // Max lignes INFO/META
 MAX_BALANCE_TS_ENTRIES: 50, // Max entrÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©es balanceTsMap
 
 // Storage
 STORAGE_KEY_STATS: "CACHE_OPTIMIZER_STATS_v1",
 STORAGE_KEY_LAST_RUN: "CACHE_OPTIMIZER_LAST_RUN"
};

// ============================================================
// MAIN FUNCTIONS
// ============================================================

/**
 * Lance une optimisation complÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨te du cache
 * 
 * @param {boolean} dryRun - Si true, simule sans modifier
 * @returns {Array} RÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©sultat de l'optimisation
 * @customfunction
 */
function CACHE_OPTIMIZE(dryRun) {
 var startMs = Date.now();
 var results = {
 timestamp: Format.now(),
 dryRun: !!dryRun,
 sizeBefore: 0,
 sizeAfter: 0,
 savedKb: 0,
 savedPercent: 0,
 keysProcessed: 0,
 keysOptimized: 0,
 keysDeleted: 0,
 errors: [],
 details: []
 };
 
 try {
 var props = PropertiesService.getScriptProperties();
 var allKeys = props.getKeys();
 
 // 1. Mesurer la taille initiale
 results.sizeBefore = _cacheOpt_measureTotalSize(props, allKeys);
 
 // 2. Analyser et catÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©goriser les clÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©s
 var categories = _cacheOpt_categorizeKeys(allKeys);
 
 // 3. Optimiser les caches wallet (le plus gros gain)
 var walletResult = _cacheOpt_optimizeWalletCaches(props, categories.wallet, dryRun);
 results.keysProcessed += walletResult.processed;
 results.keysOptimized += walletResult.optimized;
 results.details.push({
 category: "Wallet",
 processed: walletResult.processed,
 optimized: walletResult.optimized,
 savedBytes: walletResult.savedBytes
 });
 
 // 4. Purger les prix pÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©rimÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©s
 var priceResult = _cacheOpt_purgeStalePrices(props, categories.price, dryRun);
 results.keysProcessed += priceResult.processed;
 results.keysDeleted += priceResult.deleted;
 results.details.push({
 category: "Prices",
 processed: priceResult.processed,
 deleted: priceResult.deleted,
 savedBytes: priceResult.savedBytes
 });
 
 // 5. Optimiser les mÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©tadonnÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©es
 var metaResult = _cacheOpt_optimizeMetaCaches(props, categories.meta, dryRun);
 results.keysProcessed += metaResult.processed;
 results.keysOptimized += metaResult.optimized;
 results.details.push({
 category: "Meta",
 processed: metaResult.processed,
 optimized: metaResult.optimized,
 savedBytes: metaResult.savedBytes
 });
 
 // 6. Purger les clÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©s orphelines
 var orphanResult = _cacheOpt_purgeOrphans(props, categories.orphan, dryRun);
 results.keysDeleted += orphanResult.deleted;
 results.details.push({
 category: "Orphans",
 deleted: orphanResult.deleted,
 savedBytes: orphanResult.savedBytes
 });
 
 // 7. Mesurer la taille finale
 if (!dryRun) {
 results.sizeAfter = _cacheOpt_measureTotalSize(props, props.getKeys());
 } else {
 // Estimer la taille finale
 var totalSaved = 0;
 for (var i = 0; i < results.details.length; i++) {
 totalSaved += results.details[i].savedBytes || 0;
 }
 results.sizeAfter = results.sizeBefore - (totalSaved / 1024);
 }
 
 results.savedKb = results.sizeBefore - results.sizeAfter;
 results.savedPercent = results.sizeBefore > 0 ? (results.savedKb / results.sizeBefore) * 100 : 0;
 
 // 8. Sauvegarder les stats
 if (!dryRun) {
 _cacheOpt_saveStats(results);
 }
 
 return _cacheOpt_formatResults(results);
 
 } catch (e) {
 results.errors.push(String(e.message || e));
 return _cacheOpt_formatResults(results);
 }
}

/**
 * Analyse dÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©taillÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©e de l'utilisation du cache
 * 
 * @param {any} trigger - ParamÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨tre pour forcer le recalcul
 * @returns {Array} Analyse du cache
 * @customfunction
 */
function CACHE_ANALYZE(trigger) {
 void trigger;
 var out = [["Category", "Keys", "Size KB", "% Total", "Avg Size", "Largest Key", "Largest KB"]];
 
 try {
 var props = PropertiesService.getScriptProperties();
 var allKeys = props.getKeys();
 var categories = _cacheOpt_categorizeKeys(allKeys);
 var totalSize = 0;
 
 var stats = {};
 var categoryNames = ["wallet", "price", "meta", "budget", "rpc", "other", "orphan"];
 
 for (var i = 0; i < categoryNames.length; i++) {
 var catName = categoryNames[i];
 var keys = categories[catName] || [];
 
 stats[catName] = {
 count: keys.length,
 totalBytes: 0,
 largestKey: "",
 largestSize: 0
 };
 
 for (var j = 0; j < keys.length; j++) {
 var key = keys[j];
 try {
 var val = props.getProperty(key);
 var size = val ? val.length : 0;
 stats[catName].totalBytes += size;
 totalSize += size;
 
 if (size > stats[catName].largestSize) {
 stats[catName].largestSize = size;
 stats[catName].largestKey = key;
 }
 } catch (e) {}
 }
 }
 
 // GÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©nÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©rer le rapport
 for (var k = 0; k < categoryNames.length; k++) {
 var cat = categoryNames[k];
 var s = stats[cat];
 if (s.count === 0) continue;
 
 var sizeKb = s.totalBytes / 1024;
 var pct = totalSize > 0 ? (s.totalBytes / totalSize) * 100 : 0;
 var avgSize = s.count > 0 ? Math.round(s.totalBytes / s.count) : 0;
 
 out.push([
 cat.toUpperCase(),
 s.count,
 sizeKb.toFixed(2),
 pct.toFixed(1) + "%",
 avgSize + " B",
 s.largestKey ? s.largestKey.substring(0, 30) : "",
 (s.largestSize / 1024).toFixed(2)
 ]);
 }
 
 out.push(["", "", "", "", "", "", ""]);
 out.push(["TOTAL", allKeys.length, (totalSize / 1024).toFixed(2), "100%", "", "", ""]);
 out.push(["LIMIT", "", "500.00", "", "", "", ""]);
 out.push(["AVAILABLE", "", ((500 * 1024 - totalSize) / 1024).toFixed(2), "", "", "", ""]);
 
 return out;
 
 } catch (e) {
 return [["Error", "", "", "", "", String(e.message || e), ""]];
 }
}

/**
 * Compacte tous les caches wallet
 * 
 * @param {boolean} dryRun - Si true, simule sans modifier
 * @returns {Array} RÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©sultat de la compaction
 * @customfunction
 */
function CACHE_COMPACT_ALL(dryRun) {
 var out = [["Key", "Before", "After", "Saved", "Status"]];
 
 try {
 var props = PropertiesService.getScriptProperties();
 var allKeys = props.getKeys();
 var categories = _cacheOpt_categorizeKeys(allKeys);
 
 var totalBefore = 0;
 var totalAfter = 0;
 
 for (var i = 0; i < categories.wallet.length; i++) {
 var key = categories.wallet[i];
 
 try {
 var raw = props.getProperty(key);
 if (!raw) continue;
 
 var sizeBefore = raw.length;
 totalBefore += sizeBefore;
 
 var cache = JSON.parse(raw);
 var compacted = _cacheOpt_compactWalletCache(cache);
 var compactedStr = JSON.stringify(compacted);
 var sizeAfter = compactedStr.length;
 totalAfter += sizeAfter;
 
 var saved = sizeBefore - sizeAfter;
 var savedPct = sizeBefore > 0 ? (saved / sizeBefore) * 100 : 0;
 
 if (!dryRun && saved > 0) {
 props.setProperty(key, compactedStr);
 }
 
 out.push([
 key.substring(0, 35),
 (sizeBefore / 1024).toFixed(2) + " KB",
 (sizeAfter / 1024).toFixed(2) + " KB",
 savedPct.toFixed(1) + "%",
 saved > 0 ? "Optimized" : "Already optimal"
 ]);
 
 } catch (e) {
 out.push([key.substring(0, 35), "Error", "", "", String(e.message || e).substring(0, 30)]);
 }
 }
 
 out.push(["", "", "", "", ""]);
 out.push([
 "TOTAL",
 (totalBefore / 1024).toFixed(2) + " KB",
 (totalAfter / 1024).toFixed(2) + " KB",
 ((totalBefore - totalAfter) / 1024).toFixed(2) + " KB saved",
 dryRun ? "DRY RUN" : "Applied"
 ]);
 
 return out;
 
 } catch (e) {
 return [["Error", "", "", "", String(e.message || e)]];
 }
}

/**
 * Purge les entrÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©es pÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©rimÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©es
 * 
 * @param {number} maxAgeDays - ÃƒÆ’Ã†â€™aEURÃ…Â¡ge maximum en jours (dÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©faut: 14)
 * @param {boolean} dryRun - Si true, simule sans supprimer
 * @returns {Array} RÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©sultat de la purge
 * @customfunction
 */
function CACHE_PURGE_STALE(maxAgeDays, dryRun) {
 maxAgeDays = maxAgeDays || CACHE_OPTIMIZER_CONFIG.BALANCE_TTL_DAYS;
 var out = [["Key", "Age Days", "Size KB", "Status"]];
 
 try {
 var props = PropertiesService.getScriptProperties();
 var allKeys = props.getKeys();
 var nowMs = Date.now();
 var cutoffMs = nowMs - (maxAgeDays * 24 * 3600 * 1000);
 
 var totalPurged = 0;
 var totalSaved = 0;
 
 for (var i = 0; i < allKeys.length; i++) {
 var key = allKeys[i];
 
 // Skip system keys
 if (key.indexOf("HTTP_BUDGET") === 0) continue;
 if (key.indexOf("SMART_REFRESH") === 0) continue;
 if (key.indexOf("CACHE_OPTIMIZER") === 0) continue;
 
 try {
 var raw = props.getProperty(key);
 if (!raw) continue;
 
 var cache = JSON.parse(raw);
 var updatedAt = _cacheOpt_extractTimestamp(cache);
 
 if (updatedAt && updatedAt < cutoffMs) {
 var ageDays = (nowMs - updatedAt) / (24 * 3600 * 1000);
 var sizeKb = raw.length / 1024;
 
 if (!dryRun) {
 props.deleteProperty(key);
 }
 
 totalPurged++;
 totalSaved += raw.length;
 
 out.push([
 key.substring(0, 40),
 ageDays.toFixed(1),
 sizeKb.toFixed(2),
 dryRun ? "Would delete" : "Deleted"
 ]);
 }
 
 } catch (e) {
 // Ignore parsing errors
 }
 }
 
 out.push(["", "", "", ""]);
 out.push([
 "TOTAL PURGED",
 totalPurged + " keys",
 (totalSaved / 1024).toFixed(2) + " KB",
 dryRun ? "DRY RUN" : "Applied"
 ]);
 
 return out;
 
 } catch (e) {
 return [["Error", "", "", String(e.message || e)]];
 }
}

/**
 * Statistiques dÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©taillÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©es du cache
 * 
 * @param {any} trigger - ParamÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨tre pour forcer le recalcul
 * @returns {Array} Statistiques
 * @customfunction
 */
function CACHE_STATS_DETAILED(trigger) {
 void trigger;
 var out = [["Metric", "Value", "Unit", "Status", "Details"]];
 
 try {
 var props = PropertiesService.getScriptProperties();
 var allKeys = props.getKeys();
 var totalSize = 0;
 var walletCount = 0;
 var priceCount = 0;
 var staleCount = 0;
 var corruptedCount = 0;
 var nowMs = Date.now();
 var staleCutoff = nowMs - (CACHE_OPTIMIZER_CONFIG.BALANCE_TTL_DAYS * 24 * 3600 * 1000);
 
 for (var i = 0; i < allKeys.length; i++) {
 var key = allKeys[i];
 try {
 var val = props.getProperty(key);
 if (!val) continue;
 totalSize += val.length;
 
 if (CacheKeyUtils.isWalletKey(key)) {
 walletCount++;
 try {
 var cache = JSON.parse(val);
 var ts = _cacheOpt_extractTimestamp(cache);
 if (ts && ts < staleCutoff) staleCount++;
 } catch (e) {
 corruptedCount++;
 }
 } else if (key.indexOf("PRICE") >= 0) {
 priceCount++;
 }
 } catch (e) {}
 }
 
 var sizeKb = totalSize / 1024;
 var usagePercent = (sizeKb / 500) * 100;
 
 // Status
 var status = "OK";
 if (sizeKb >= CACHE_OPTIMIZER_CONFIG.CRITICAL_SIZE_KB) status = "CRITICAL";
 else if (sizeKb >= CACHE_OPTIMIZER_CONFIG.WARNING_SIZE_KB) status = "WARNING";
 
 out.push(["Total Size", sizeKb.toFixed(2), "KB", status, usagePercent.toFixed(1) + "% of 500 KB"]);
 out.push(["Total Keys", allKeys.length, "keys", "", ""]);
 out.push(["Wallet Caches", walletCount, "keys", "", ""]);
 out.push(["Price Caches", priceCount, "keys", "", ""]);
 out.push(["Stale Entries", staleCount, "keys", staleCount > 5 ? "WARNING" : "", ">" + CACHE_OPTIMIZER_CONFIG.BALANCE_TTL_DAYS + " days old"]);
 out.push(["Corrupted", corruptedCount, "keys", corruptedCount > 0 ? "ERROR" : "", ""]);
 out.push(["Available", (500 - sizeKb).toFixed(2), "KB", "", ""]);
 out.push(["", "", "", "", ""]);
 
 // Recommandations
 if (sizeKb >= CACHE_OPTIMIZER_CONFIG.WARNING_SIZE_KB) {
 out.push(["Recommendation", "Run CACHE_OPTIMIZE()", "", "", ""]);
 }
 if (staleCount > 5) {
 out.push(["Recommendation", "Run CACHE_PURGE_STALE()", "", "", ""]);
 }
 if (corruptedCount > 0) {
 out.push(["Recommendation", "Run CLEANUP.cleanCorrupted()", "", "", ""]);
 }
 
 return out;
 
 } catch (e) {
 return [["Error", String(e.message || e), "", "", ""]];
 }
}

// ============================================================
// HELPER FUNCTIONS - CATEGORIZATION
// ============================================================

/**
 * CatÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©gorise les clÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©s de cache
 */
function _cacheOpt_categorizeKeys(keys) {
 var categories = {
 wallet: [],
 price: [],
 meta: [],
 budget: [],
 rpc: [],
 other: [],
 orphan: []
 };
 
 for (var i = 0; i < keys.length; i++) {
 var key = String(keys[i]).toUpperCase();
 
 if (CacheKeyUtils.isWalletKey(keys[i])) {
 categories.wallet.push(keys[i]);
 } else if (key.indexOf("PRICE") >= 0 || key.indexOf("_PX_") >= 0) {
 categories.price.push(keys[i]);
 } else if (key.indexOf("META") >= 0) {
 categories.meta.push(keys[i]);
 } else if (key.indexOf("BUDGET") >= 0 || key.indexOf("STATS") >= 0) {
 categories.budget.push(keys[i]);
 } else if (key.indexOf("RPC") >= 0 || key.indexOf("HEALTH") >= 0) {
 categories.rpc.push(keys[i]);
 } else if (key.indexOf("_v") >= 0 || key.length < 10) {
 categories.orphan.push(keys[i]);
 } else {
 categories.other.push(keys[i]);
 }
 }
 
 return categories;
}

// ============================================================
// HELPER FUNCTIONS - OPTIMIZATION
// ============================================================

/**
 * Optimise les caches wallet
 */
function _cacheOpt_optimizeWalletCaches(props, keys, dryRun) {
 var result = { processed: 0, optimized: 0, savedBytes: 0 };
 
 for (var i = 0; i < keys.length; i++) {
 var key = keys[i];
 result.processed++;
 
 try {
 var raw = props.getProperty(key);
 if (!raw) continue;
 
 var sizeBefore = raw.length;
 var cache = JSON.parse(raw);
 var compacted = _cacheOpt_compactWalletCache(cache);
 var compactedStr = JSON.stringify(compacted);
 var sizeAfter = compactedStr.length;
 
 if (sizeAfter < sizeBefore) {
 result.optimized++;
 result.savedBytes += (sizeBefore - sizeAfter);
 
 if (!dryRun) {
 props.setProperty(key, compactedStr);
 }
 }
 
 } catch (e) {
 // Ignore errors
 }
 }
 
 return result;
}

/**
 * Compacte un cache wallet individuel
 */
function _cacheOpt_compactWalletCache(cache) {
 if (!cache || typeof cache !== "object") return cache;
 
 var out = {};
 
 // 1. Compacter les assets
 if (cache.assets && Array.isArray(cache.assets)) {
 var compactAssets = [];
 for (var i = 0; i < cache.assets.length; i++) {
 var asset = cache.assets[i];
 if (!asset) continue;
 
 var contract = asset.contract || asset.c || "";
 var balance = asset.balance || asset.b || 0;
 
 // Skip zero balances
 if (!balance || balance === 0 || balance === "0") continue;
 
 // Raccourcir le contrat (sauf native)
 var shortContract = contract;
 if (contract !== "native" && contract.length > CACHE_OPTIMIZER_CONFIG.CONTRACT_SHORT_LEN) {
 shortContract = contract.substring(0, CACHE_OPTIMIZER_CONFIG.CONTRACT_SHORT_LEN);
 }
 
 // Compacter le balance
 var compactBal = _cacheOpt_compactNumber(balance, CACHE_OPTIMIZER_CONFIG.BALANCE_PRECISION);
 
 compactAssets.push([shortContract, compactBal]);
 }
 out.a = compactAssets;
 } else if (cache.a) {
 // DÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©jÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â  compact, filtrer les zeros
 var filtered = [];
 for (var j = 0; j < cache.a.length; j++) {
 var row = cache.a[j];
 if (row && row[1] && row[1] !== 0 && row[1] !== "0") {
 filtered.push(row);
 }
 }
 out.a = filtered;
 }
 
 // 2. Timestamps en delta (rÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©fÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©rence: updatedAt)
 var refTs = cache.u || cache.updatedAt;
 if (refTs) {
 out.u = typeof refTs === "number" && refTs > 2000000000 ? Math.floor(refTs / 1000) : refTs;
 }
 
 // 3. Autres champs essentiels
 if (cache.r !== undefined || cache.rrCursor !== undefined) {
 out.r = cache.r || cache.rrCursor || 0;
 }
 if (cache.fx !== undefined || cache.usd_to_eur !== undefined) {
 out.fx = _cacheOpt_compactNumber(cache.fx || cache.usd_to_eur, 4);
 }
 
 // 4. priceMap limitÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©
 var pm = cache.pm || cache.priceMap;
 if (pm && typeof pm === "object") {
 var keys = Object.keys(pm);
 var compactPm = {};
 var count = 0;
 for (var k = 0; k < keys.length && count < CACHE_OPTIMIZER_CONFIG.MAX_PRICES_PER_WALLET; k++) {
 var pk = keys[k];
 var pv = pm[pk];
 if (typeof pv === "number" && pv > 0) {
 compactPm[pk] = _cacheOpt_compactNumber(pv, CACHE_OPTIMIZER_CONFIG.PRICE_PRECISION);
 count++;
 }
 }
 if (count > 0) out.pm = compactPm;
 }
 
 // 5. Info/Meta rows limitÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©s
 if (cache.im && Array.isArray(cache.im)) {
 out.im = cache.im.slice(0, CACHE_OPTIMIZER_CONFIG.MAX_INFO_ROWS);
 }
 
 // 6. balanceTsMap limitÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©
 if (cache.bt && typeof cache.bt === "object") {
 var btKeys = Object.keys(cache.bt);
 if (btKeys.length > CACHE_OPTIMIZER_CONFIG.MAX_BALANCE_TS_ENTRIES) {
 var limitedBt = {};
 for (var b = 0; b < CACHE_OPTIMIZER_CONFIG.MAX_BALANCE_TS_ENTRIES; b++) {
 limitedBt[btKeys[b]] = cache.bt[btKeys[b]];
 }
 out.bt = limitedBt;
 } else {
 out.bt = cache.bt;
 }
 }
 
 // 7. Erreur (tronquÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©e)
 if (cache.last_error) {
 out.le = String(cache.last_error).substring(0, 100);
 }
 
 return out;
}

/**
 * Purge les prix pÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©rimÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©s
 */
function _cacheOpt_purgeStalePrices(props, keys, dryRun) {
 var result = { processed: 0, deleted: 0, savedBytes: 0 };
 var nowMs = Date.now();
 var cutoffMs = nowMs - (CACHE_OPTIMIZER_CONFIG.PRICE_TTL_DAYS * 24 * 3600 * 1000);
 
 for (var i = 0; i < keys.length; i++) {
 var key = keys[i];
 result.processed++;
 
 try {
 var raw = props.getProperty(key);
 if (!raw) continue;
 
 var cache = JSON.parse(raw);
 var ts = _cacheOpt_extractTimestamp(cache);
 
 if (ts && ts < cutoffMs) {
 result.deleted++;
 result.savedBytes += raw.length;
 
 if (!dryRun) {
 props.deleteProperty(key);
 }
 }
 
 } catch (e) {}
 }
 
 return result;
}

/**
 * Optimise les caches meta
 */
function _cacheOpt_optimizeMetaCaches(props, keys, dryRun) {
 var result = { processed: 0, optimized: 0, savedBytes: 0 };
 
 // Pour l'instant, juste mesurer - les meta sont gÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©nÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©ralement petits
 for (var i = 0; i < keys.length; i++) {
 result.processed++;
 }
 
 return result;
}

/**
 * Purge les clÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©s orphelines
 */
function _cacheOpt_purgeOrphans(props, keys, dryRun) {
 var result = { deleted: 0, savedBytes: 0 };
 
 for (var i = 0; i < keys.length; i++) {
 var key = keys[i];
 
 // Ne pas supprimer les clÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©s systÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨me connues
 if (key.indexOf("WCORE") === 0) continue;
 if (key.indexOf("LEDGER") === 0) continue;
 if (key.indexOf("WD_") === 0) continue;
 
 try {
 var raw = props.getProperty(key);
 if (!raw) continue;
 
 // ClÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©s trÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨s courtes ou sans donnÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©es utiles
 if (raw.length < 10 || raw === "{}" || raw === "null") {
 result.deleted++;
 result.savedBytes += raw.length;
 
 if (!dryRun) {
 props.deleteProperty(key);
 }
 }
 
 } catch (e) {}
 }
 
 return result;
}

// ============================================================
// HELPER FUNCTIONS - UTILITIES
// ============================================================

function _cacheOpt_measureTotalSize(props, keys) {
 var total = 0;
 for (var i = 0; i < keys.length; i++) {
 try {
 var val = props.getProperty(keys[i]);
 if (val) total += val.length;
 } catch (e) {}
 }
 return total / 1024;
}

function _cacheOpt_extractTimestamp(cache) {
 if (!cache) return null;
 
 var ts = cache.updatedAt || cache.u || cache.updated_at || cache.ts;
 if (!ts) return null;
 
 if (typeof ts === "number") {
 return ts > 2000000000 ? ts : ts * 1000;
 }
 
 try {
 return new Date(ts).getTime();
 } catch (e) {
 return null;
 }
}

function _cacheOpt_compactNumber(num, precision) {
 if (num === null || num === undefined) return null;
 var n = Number(num);
 if (!isFinite(n)) return null;
 if (n === 0) return 0;
 
 // Notation scientifique pour trÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨s grands/petits nombres
 if (Math.abs(n) >= 1e10 || (Math.abs(n) > 0 && Math.abs(n) < 1e-6)) {
 return parseFloat(n.toExponential(precision - 1));
 }
 
 return parseFloat(n.toPrecision(precision));
}

function _cacheOpt_saveStats(results) {
 try {
 var props = PropertiesService.getScriptProperties();
 props.setProperty(CACHE_OPTIMIZER_CONFIG.STORAGE_KEY_STATS, JSON.stringify({
 lastRun: results.timestamp,
 sizeBefore: results.sizeBefore,
 sizeAfter: results.sizeAfter,
 savedKb: results.savedKb,
 savedPercent: results.savedPercent
 }));
 } catch (e) {}
}

function _cacheOpt_formatResults(results) {
 var out = [
 ["CACHE OPTIMIZATION RESULTS", "", "", "", ""],
 ["Timestamp", results.timestamp, "", "", ""],
 ["Mode", results.dryRun ? "DRY RUN" : "APPLIED", "", "", ""],
 ["", "", "", "", ""],
 ["Size Before", results.sizeBefore.toFixed(2) + " KB", "", "", ""],
 ["Size After", results.sizeAfter.toFixed(2) + " KB", "", "", ""],
 ["Saved", results.savedKb.toFixed(2) + " KB", results.savedPercent.toFixed(1) + "%", "", ""],
 ["", "", "", "", ""],
 ["Keys Processed", results.keysProcessed, "", "", ""],
 ["Keys Optimized", results.keysOptimized, "", "", ""],
 ["Keys Deleted", results.keysDeleted, "", "", ""],
 ["", "", "", "", ""],
 ["=== DETAILS ===", "", "", "", ""]
 ];
 
 out.push(["Category", "Processed", "Optimized/Deleted", "Saved", ""]);
 
 for (var i = 0; i < results.details.length; i++) {
 var d = results.details[i];
 out.push([
 d.category,
 d.processed || d.deleted || 0,
 d.optimized || d.deleted || 0,
 (d.savedBytes / 1024).toFixed(2) + " KB",
 ""
 ]);
 }
 
 if (results.errors.length > 0) {
 out.push(["", "", "", "", ""]);
 out.push(["ERRORS", results.errors.join("; "), "", "", ""]);
 }
 
 return out;
}
