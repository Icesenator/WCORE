/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 18_CLEANUP.gs - Cache Maintenance & Cleanup
 * ═══════════════════════════════════════════════════════════════════════════
 * Version: 4.10.0
 * 
 * v4.10.0 CRITICAL FIX:
 * - Fixed getCategoryFromKey() patterns to match actual WCORE cache keys
 * - Added proper pattern detection for: wallet, global_price, meta, budget, rpc, dex, llama
 * - Changed from ES6 const/let to var for GAS compatibility
 * - Added size threshold for cleanup decisions
 * 
 * Fonctions de nettoyage automatique du cache pour optimiser l'utilisation
 * de l'espace de stockage ScriptProperties (limite 500KB).
 * ═══════════════════════════════════════════════════════════════════════════
 */

var CLEANUP = (function() {
 
 /**
 * Configuration des TTL (Time To Live) en heures
 * UPDATED: Aligned with actual WCORE patterns
 */
 var TTL_CONFIG = {
 wallet: 48, // Wallet cache (_CACHE_WALLET_, GLOBAL_WALLET_CACHE)
 global_price: 24, // Global price cache (_GLOBAL_PRICE_CACHE)
 meta: 168, // Token metadata (_META_CACHE) - 7 days
 budget: 24, // Budget stats (BUDGET_, _DYNAMIC_BUDGET_STATS_)
 rpc: 72, // RPC health (_RPC_HEALTH)
 dex: 24, // DexScreener prices (DEX_)
 llama: 24, // DefiLlama prices (LLAMA_)
 gecko: 24, // GeckoTerminal/CoinGecko prices (GECKO_, GT_)
 fx: 48, // FX rates (FX_, _FX_)
 lock: 1, // Locks (_LOCK) - 1 hour max
 refresh: 24, // Refresh status (_REFRESH_STATUS)
 index: 168, // Cache index (WCORE_CACHE_INDEX) - 7 days
 http: 24, // HTTP budget tracking (HTTP_BUDGET_)
 other: 48 // Default for unrecognized patterns
 };

 /**
 * Détermine la catégorie d'une clé de cache
 * FIXED: Patterns now match actual WCORE cache key formats
 * 
 * @param {string} key - Clé de cache
 * @return {string} Catégorie
 */
 function getCategoryFromKey(key) {
 if (!key) return 'other';
 var k = String(key);
 
 // Order matters - check more specific patterns first
 
 // Wallet caches (highest priority to preserve)
 if (k.indexOf('_CACHE_WALLET_') >= 0) return 'wallet';
 if (k.indexOf('WALLET_CACHE_') >= 0) return 'wallet';
 if (k.indexOf('GLOBAL_WALLET_CACHE') >= 0) return 'wallet';
 
 // Price caches
 if (k.indexOf('_GLOBAL_PRICE_CACHE') >= 0) return 'global_price';
 if (k.indexOf('GLOBAL_PRICE_CACHE') >= 0) return 'global_price';
 if (k.indexOf('DEX_') === 0) return 'dex';
 if (k.indexOf('LLAMA_') === 0) return 'llama';
 if (k.indexOf('GECKO_') === 0) return 'gecko';
 if (k.indexOf('GT_') === 0) return 'gecko';
 
 // Metadata
 if (k.indexOf('_META_CACHE') >= 0) return 'meta';
 if (k.indexOf('META_') === 0) return 'meta';
 if (k.indexOf('TOKEN_META') >= 0) return 'meta';
 
 // Budget tracking
 if (k.indexOf('_DYNAMIC_BUDGET_STATS_') >= 0) return 'budget';
 if (k.indexOf('BUDGET_') === 0) return 'budget';
 if (k.indexOf('_BUDGET_') >= 0) return 'budget';
 
 // RPC health
 if (k.indexOf('_RPC_HEALTH') >= 0) return 'rpc';
 if (k.indexOf('RPC_HEALTH_') === 0) return 'rpc';
 
 // FX rates
 if (k.indexOf('FX_') === 0) return 'fx';
 if (k.indexOf('_FX_') >= 0) return 'fx';
 if (k.indexOf('USD_EUR') >= 0) return 'fx';
 
 // Locks (ephemeral)
 if (k.indexOf('_LOCK') >= 0) return 'lock';
 
 // Refresh status
 if (k.indexOf('_REFRESH_STATUS') >= 0) return 'refresh';
 
 // System keys
 if (k.indexOf('WCORE_CACHE_INDEX') >= 0) return 'index';
 if (k.indexOf('HTTP_BUDGET_') === 0) return 'http';
 
 return 'other';
 }

 /**
 * Extract timestamp from cache object
 * Handles various timestamp field names used across WCORE
 */
 function extractTimestamp(data) {
 if (!data) return 0;
 
 // Try common timestamp fields
 var ts = data.updatedAt || data.ts || data.timestamp || data.u || 0;
 
 // Handle both ms and seconds
 if (ts > 0 && ts < 1e12) ts = ts * 1000; // Convert seconds to ms
 
 // Also check nested timestamps
 if (!ts && data.last_cache_update) {
 try {
 ts = new Date(data.last_cache_update).getTime();
 } catch (e) {}
 }
 
 return ts;
 }

 /**
 * Analyse et nettoie le cache selon les règles de TTL
 * 
 * @param {boolean} dryRun - Si true, ne supprime pas (simulation)
 * @return {Object} Rapport de nettoyage
 */
 function analyze(dryRun) {
 if (dryRun === undefined) dryRun = true;
 
 var startTime = Date.now();
 var props = PropertiesService.getScriptProperties();
 var allKeys = props.getKeys();
 var now = Date.now();
 
 var report = {
 total_keys: allKeys.length,
 analyzed: 0,
 to_delete: [],
 by_category: {},
 corrupted: [],
 total_size_before: 0,
 estimated_size_after: 0,
 dry_run: dryRun
 };

 // Analyse chaque clé
 for (var i = 0; i < allKeys.length; i++) {
 var key = allKeys[i];
 try {
 var rawValue = props.getProperty(key);
 if (!rawValue) continue;
 
 var sizeBytes = rawValue.length; // Approximation (not using Blob for speed)
 report.total_size_before += sizeBytes;
 
 // Tenter de parser
 var data;
 try {
 data = JSON.parse(rawValue);
 } catch(e) {
 // Donnée non-JSON (peut être normal pour certaines clés)
 // Only mark as corrupted if it looks like it should be JSON
 if (rawValue.charAt(0) === '{' || rawValue.charAt(0) === '[') {
 report.corrupted.push({
 key: key,
 size: sizeBytes,
 error: 'Invalid JSON'
 });
 report.to_delete.push(key);
 }
 continue;
 }

 report.analyzed++;
 
 // Déterminer la catégorie et vérifier le TTL
 var category = getCategoryFromKey(key);
 if (!report.by_category[category]) {
 report.by_category[category] = {
 count: 0,
 size: 0,
 expired: 0
 };
 }
 
 report.by_category[category].count++;
 report.by_category[category].size += sizeBytes;

 // Vérifier l'expiration
 var timestamp = extractTimestamp(data);
 var ageHours = timestamp > 0 ? (now - timestamp) / 3600000 : 0;
 var ttl = TTL_CONFIG[category] || TTL_CONFIG.other;

 // Only mark as expired if we have a valid timestamp and it's too old
 if (timestamp > 0 && ageHours > ttl) {
 report.to_delete.push(key);
 report.by_category[category].expired++;
 } else {
 report.estimated_size_after += sizeBytes;
 }

 } catch(e) {
 // Erreur inattendue
 report.corrupted.push({
 key: key,
 error: e.message
 });
 }
 }

 // Exécuter le nettoyage si pas en dry-run
 if (!dryRun && report.to_delete.length > 0) {
 var actuallyDeleted = 0;
 for (var d = 0; d < report.to_delete.length; d++) {
 try {
 props.deleteProperty(report.to_delete[d]);
 actuallyDeleted++;
 } catch(e) {
 // Ignorer les erreurs de suppression
 }
 }
 report.actually_deleted = actuallyDeleted;
 }

 // Calculer les statistiques finales
 report.total_size_before_kb = (report.total_size_before / 1024).toFixed(2);
 report.estimated_size_after_kb = (report.estimated_size_after / 1024).toFixed(2);
 report.potential_savings_kb = ((report.total_size_before - report.estimated_size_after) / 1024).toFixed(2);
 report.potential_savings_percent = report.total_size_before > 0 
 ? ((1 - report.estimated_size_after / report.total_size_before) * 100).toFixed(1)
 : "0.0";
 report.execution_time_ms = Date.now() - startTime;

 return report;
 }

 /**
 * Supprime toutes les clés d'une catégorie spécifique
 * 
 * @param {string} category - Catégorie à supprimer
 * @return {Object} Résultat
 */
 function purgeCategory(category) {
 var props = PropertiesService.getScriptProperties();
 var allKeys = props.getKeys();
 var deleted = [];

 for (var i = 0; i < allKeys.length; i++) {
 var key = allKeys[i];
 if (getCategoryFromKey(key) === category) {
 try {
 props.deleteProperty(key);
 deleted.push(key);
 } catch(e) {
 // Ignorer
 }
 }
 }

 return {
 category: category,
 deleted_count: deleted.length,
 keys: deleted
 };
 }

 /**
 * Force le nettoyage de toutes les clés expirées
 * 
 * @return {Object} Rapport de nettoyage
 */
 function forceClean() {
 return analyze(false);
 }

 /**
 * Nettoie uniquement les données corrompues
 * 
 * @return {Object} Résultat
 */
 function cleanCorrupted() {
 var props = PropertiesService.getScriptProperties();
 var allKeys = props.getKeys();
 var deleted = [];

 for (var i = 0; i < allKeys.length; i++) {
 var key = allKeys[i];
 try {
 var rawValue = props.getProperty(key);
 if (!rawValue) continue;
 
 // Only check values that look like they should be JSON
 if (rawValue.charAt(0) === '{' || rawValue.charAt(0) === '[') {
 JSON.parse(rawValue); // Test parsing
 }
 } catch(e) {
 // Donnée corrompue
 try {
 props.deleteProperty(key);
 deleted.push(key);
 } catch(delErr) {
 // Ignorer
 }
 }
 }

 return {
 corrupted_keys_deleted: deleted.length,
 keys: deleted
 };
 }

 /**
 * Obtient des statistiques détaillées par catégorie
 * 
 * @return {Array} Tableau formaté pour Google Sheets
 */
 function getDetailedStats() {
 var report = analyze(true);
 var output = [
 ['Category', 'Count', 'Size (KB)', 'Expired', 'Avg Size (bytes)', 'TTL (hours)']
 ];

 // Sort categories by size descending
 var categories = Object.keys(report.by_category);
 categories.sort(function(a, b) {
 return report.by_category[b].size - report.by_category[a].size;
 });

 for (var i = 0; i < categories.length; i++) {
 var cat = categories[i];
 var stats = report.by_category[cat];
 var avgSize = stats.count > 0 ? Math.round(stats.size / stats.count) : 0;
 var ttl = TTL_CONFIG[cat] || TTL_CONFIG.other;
 
 output.push([
 cat,
 stats.count,
 (stats.size / 1024).toFixed(2),
 stats.expired,
 avgSize,
 ttl
 ]);
 }

 // Ligne de total
 output.push([
 'TOTAL',
 report.analyzed,
 report.total_size_before_kb,
 report.to_delete.length,
 report.analyzed > 0 ? Math.round(report.total_size_before / report.analyzed) : 0,
 '-'
 ]);

 // Summary rows
 output.push(['', '', '', '', '', '']);
 output.push(['Potential savings', report.potential_savings_kb + ' KB', report.potential_savings_percent + '%', '', '', '']);
 output.push(['Corrupted keys', report.corrupted.length, '', '', '', '']);

 return output;
 }

 /**
 * Emergency purge - removes oldest cache entries to free space
 * Use when approaching 500KB limit
 * 
 * @param {number} targetFreeKb - Target KB to free (default: 50KB)
 * @return {Object} Result
 */
 function emergencyPurge(targetFreeKb) {
 targetFreeKb = targetFreeKb || 50;
 var targetBytes = targetFreeKb * 1024;
 
 var props = PropertiesService.getScriptProperties();
 var allKeys = props.getKeys();
 var now = Date.now();
 
 // Build list of candidates with age and size
 var candidates = [];
 var totalSize = 0;
 
 for (var i = 0; i < allKeys.length; i++) {
 var key = allKeys[i];
 try {
 var rawValue = props.getProperty(key);
 if (!rawValue) continue;
 
 var size = rawValue.length;
 totalSize += size;
 
 var category = getCategoryFromKey(key);
 var timestamp = 0;
 
 try {
 var data = JSON.parse(rawValue);
 timestamp = extractTimestamp(data);
 } catch (e) {}
 
 // Priority: higher = purge first
 // Budget stats and locks have highest priority (least important to keep)
 var priority = 50;
 if (category === 'budget') priority = 90;
 if (category === 'lock') priority = 95;
 if (category === 'rpc') priority = 70;
 if (category === 'dex' || category === 'llama' || category === 'gecko') priority = 60;
 if (category === 'wallet') priority = 10; // Keep wallets
 if (category === 'global_price') priority = 20;
 if (category === 'meta') priority = 30;
 
 // Older = higher priority to purge
 var ageHours = timestamp > 0 ? (now - timestamp) / 3600000 : 1000;
 
 candidates.push({
 key: key,
 size: size,
 category: category,
 ageHours: ageHours,
 priority: priority,
 score: priority + Math.min(50, ageHours) // Combined score
 });
 } catch (e) {}
 }
 
 // Sort by score descending (highest = purge first)
 candidates.sort(function(a, b) {
 return b.score - a.score;
 });
 
 // Purge until target reached
 var freedBytes = 0;
 var deleted = [];
 
 for (var j = 0; j < candidates.length && freedBytes < targetBytes; j++) {
 var c = candidates[j];
 try {
 props.deleteProperty(c.key);
 freedBytes += c.size;
 deleted.push({
 key: c.key,
 category: c.category,
 size: c.size,
 ageHours: Math.round(c.ageHours)
 });
 } catch (e) {}
 }
 
 return {
 target_kb: targetFreeKb,
 freed_kb: (freedBytes / 1024).toFixed(2),
 deleted_count: deleted.length,
 total_size_before_kb: (totalSize / 1024).toFixed(2),
 deleted: deleted
 };
 }

 // API publique
 return {
 analyze: analyze,
 forceClean: forceClean,
 purgeCategory: purgeCategory,
 cleanCorrupted: cleanCorrupted,
 getDetailedStats: getDetailedStats,
 emergencyPurge: emergencyPurge,
 getCategoryFromKey: getCategoryFromKey, // Expose for testing
 TTL_CONFIG: TTL_CONFIG // Expose for reference
 };

})();


/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FONCTIONS GOOGLE SHEETS (Custom Functions)
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Force le nettoyage des clés expirées
 * 
 * @return {Object} Rapport d'exécution
 * @customfunction
 */
function CACHE_FORCE_CLEAN() {
 return CLEANUP.forceClean();
}

/**
 * Nettoie une catégorie spécifique de cache
 * 
 * @param {string} category - Catégorie (wallet, global_price, meta, budget, rpc, dex, llama, gecko, fx, lock, refresh)
 * @return {Object} Résultat
 * @customfunction
 */
function CACHE_PURGE_CATEGORY(category) {
 return CLEANUP.purgeCategory(category);
}

/**
 * Nettoie uniquement les données JSON corrompues
 * 
 * @return {Object} Résultat
 * @customfunction
 */
function CACHE_CLEAN_CORRUPTED() {
 return CLEANUP.cleanCorrupted();
}

/**
 * Obtient des statistiques détaillées par catégorie
 * 
 * @return {Array} Tableau formaté
 * @customfunction
 */
function GET_CACHE_STATS_DETAILED() {
 return CLEANUP.getDetailedStats();
}

/**
 * Emergency purge to free space when approaching 500KB limit
 * 
 * @param {number} targetKb - KB to free (default: 50)
 * @return {Object} Result
 * @customfunction
 */
function CACHE_EMERGENCY_PURGE(targetKb) {
 return CLEANUP.emergencyPurge(targetKb);
}

/**
 * Test cache key categorization
 * Useful for verifying patterns are detected correctly
 * 
 * @param {string} key - Cache key to test
 * @return {string} Detected category
 * @customfunction
 */
function TEST_CACHE_CATEGORY(key) {
 return CLEANUP.getCategoryFromKey(key);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: REPAIR & RECOVERY FUNCTIONS (consolidated from CACHE_REPAIR.gs)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Voir l'etat du circuit breaker quota
 * @customfunction
 */
function DEBUG_QUOTA_STATUS() {
  if (typeof DegradedMode === 'undefined') {
    return [["Error", "DegradedMode not loaded"]];
  }
  
  var status = DegradedMode.getStatus();
  
  return [
    ["Metric", "Value", "Details"],
    ["Circuit Breaker Active", status.circuitBreakerActive ? "YES [!]" : "NO [OK]", ""],
    ["Has Recent Error", status.hasRecentError ? "YES [!]" : "NO [OK]", "Last 30 seconds"],
    ["Consecutive Errors", status.consecutiveErrors, "Circuit breaker activates at 2"],
    ["Will Skip HTTP", status.willSkipHttpCalls ? "YES [!]" : "NO [OK]", ""],
    ["Remaining (sec)", status.remainingSec, "Until circuit breaker resets"],
    ["Recommendation", status.recommendation, ""]
  ];
}

/**
 * Reinitialiser le circuit breaker
 * @customfunction
 */
function RESET_QUOTA_CIRCUIT() {
  if (typeof DegradedMode === 'undefined') {
    return "Error: DegradedMode not loaded";
  }
  
  var result = DegradedMode.resetCircuitBreaker();
  return "Circuit breaker reset: " + result;
}

/**
 * Voir l'etat du cache d'un wallet
 * @param {string} wallet - Adresse du wallet
 * @param {string} chain - Nom de la chaine (BASE, ETHEREUM, etc.)
 * @customfunction
 */
function DEBUG_WALLET_CACHE(wallet, chain) {
  chain = String(chain || "BASE").toUpperCase();
  
  var chainObj = null;
  try {
    chainObj = eval("_" + chain);
  } catch (e) {}
  
  if (!chainObj || !chainObj.getConfig) {
    return [["Error", "Unknown or not loaded chain: " + chain]];
  }
  
  var config = chainObj.getConfig();
  CacheManager.init();
  var addr = Addr.normalize(wallet);
  var cache = WalletCache.load(addr, config);
  
  var out = [["Metric", "Value", "Details"]];
  
  if (!cache) {
    out.push(["Cache Status", "NULL", "No cache found for this wallet"]);
    out.push(["Action", "REBUILD", "Call REBUILD_WALLET_CACHE(wallet, chain)"]);
    return out;
  }
  
  out.push(["Cache Status", "EXISTS", ""]);
  out.push(["Version", cache.version, "Expected: " + (config.CACHE_VERSION || "?")]);
  out.push(["Version Match", cache.version === config.CACHE_VERSION ? "YES [OK]" : "NO [!]", ""]);
  out.push(["Updated At", cache.updatedAt ? new Date(cache.updatedAt).toISOString() : "N/A", ""]);
  out.push(["Assets Count", cache.assets ? cache.assets.length : 0, ""]);
  out.push(["PriceMap Keys", cache.priceMap ? Object.keys(cache.priceMap).length : 0, ""]);
  out.push(["BalanceTsMap Keys", cache.balanceTsMap ? Object.keys(cache.balanceTsMap).length : 0, ""]);
  out.push(["RR Cursor", cache.rrCursor != null ? cache.rrCursor : "N/A", ""]);
  out.push(["Last Error", cache.last_error || "None", ""]);
  
  return out;
}

/**
 * Reconstruire le cache d'un wallet
 * @param {string} wallet - Adresse du wallet
 * @param {string} chain - Nom de la chaine (BASE, ETHEREUM, etc.)
 * @customfunction
 */
function REBUILD_WALLET_CACHE(wallet, chain) {
  chain = String(chain || "BASE").toUpperCase();
  
  // Reset circuit breaker first
  if (typeof DegradedMode !== 'undefined') {
    DegradedMode.resetCircuitBreaker();
  }
  
  var chainObj = null;
  try {
    chainObj = eval("_" + chain);
  } catch (e) {}
  
  if (!chainObj || !chainObj.getConfig) {
    return [["Error", "Unknown or not loaded chain: " + chain]];
  }
  
  var config = chainObj.getConfig();
  var addr = Addr.normalize(wallet);
  CacheManager.init();
  
  // Clear corrupted cache
  try {
    var cacheKey = config.KEYS.CACHE_PREFIX + addr;
    var props = PropertiesService.getScriptProperties();
    props.deleteProperty(cacheKey);
  } catch (e) {}
  
  // Trigger fresh scan
  try {
    var result = chainObj.getWalletAssets(wallet, "", "", true, false);
    
    if (result && result.length > 2) {
      var assetCount = 0;
      for (var j = 1; j < result.length; j++) {
        if (result[j][0] && result[j][0].indexOf("INFO") === -1 && result[j][0] !== "META") {
          assetCount++;
        }
      }
      
      return [
        ["Status", "SUCCESS [OK]"],
        ["Chain", chain],
        ["Wallet", wallet],
        ["Assets Found", assetCount],
        ["Action", "Cache rebuilt. Refresh your sheet."]
      ];
    }
    
    return result;
    
  } catch (e) {
    return [
      ["Status", "PARTIAL"],
      ["Chain", chain],
      ["Error", e.message],
      ["Action", "Wait for quota to recover and try again"]
    ];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: ZOMBIE CLEANUP (consolidated from CLEANUP_ZOMBIES.gs)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Clean up zombie tokens (balance=0) from a wallet cache
 * @param {string} wallet - Wallet address
 * @param {string} chain - Chain name (BASE, ETHEREUM, etc.)
 * @customfunction
 */
/**
 * Rehydrate WalletCache from currently visible Ledger sheet rows only.
 * No HTTP calls: this preserves recoverable displayed data after packed cache loss.
 *
 * @customfunction
 */
function REHYDRATE_WALLET_CACHE_FROM_LEDGER_SHEETS() {
  var out = [["sheet", "chain", "assets", "status"]];
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = ss.getSheets();
    var rebuilt = 0;
    var skipped = 0;
    var failed = 0;
    var now = Date.now();

    function parseNumber_(v) {
      if (typeof v === "number") return isFinite(v) ? v : null;
      var s = String(v == null ? "" : v).trim();
      if (!s) return null;
      s = s.replace(/\s/g, "").replace(/€/g, "").replace(/,/g, ".");
      var n = Number(s);
      return isFinite(n) ? n : null;
    }

    function chainFromFormula_(formula) {
      var f = String(formula || "").toUpperCase();
      var m = f.match(/([A-Z0-9_]+)_REFRESH_STATUS\s*\(/);
      return m && m[1] ? m[1] : "";
    }

    function walletFromFormula_(formula) {
      var f = String(formula || "");
      var m = f.match(/\(\s*"([^"]+)"/);
      return m && m[1] ? m[1] : "";
    }

    for (var si = 0; si < sheets.length; si++) {
      var sh = sheets[si];
      var name = sh.getName();
      if (name.indexOf(" - ") < 0) continue;

      var formula = "";
      try { formula = sh.getRange("I1").getFormula(); } catch (eFormula) {}
      var chain = chainFromFormula_(formula);
      var wallet = walletFromFormula_(formula);
      if (!chain || !wallet) {
        skipped++;
        out.push([name, chain || "", 0, "skip:no_formula"]);
        continue;
      }

      var chainObj = null;
      try { chainObj = eval("_" + chain); } catch (eEval) {}
      if (!chainObj || !chainObj.getConfig) {
        skipped++;
        out.push([name, chain, 0, "skip:no_config"]);
        continue;
      }

      var values = [];
      try { values = sh.getRange(2, 1, Math.min(500, Math.max(1, sh.getLastRow() - 1)), 7).getValues(); } catch (eValues) { values = []; }
      if (!values || values.length < 2) {
        skipped++;
        out.push([name, chain, 0, "skip:no_rows"]);
        continue;
      }

      var assets = [];
      var priceMap = {};
      var priceTsMap = {};
      var balanceTsMap = {};
      for (var r = 1; r < values.length; r++) {
        var row = values[r] || [];
        var ticker = String(row[1] || "").trim();
        var tokenName = String(row[2] || "").trim();
        var contract = String(row[3] || "").trim();
        if (!contract) continue;
        if (ticker === "ERROR" || ticker.indexOf("INFO_") === 0 || ticker === "META") continue;
        if (contract === "total" || contract === "fx_rate" || contract === "last_tx") continue;
        var bal = parseNumber_(row[4]);
        if (bal == null) continue;
        var price = parseNumber_(row[5]);
        var key = contract.toLowerCase ? contract.toLowerCase() : contract;
        assets.push({
          chain: String(row[0] || name),
          symbol: ticker,
          ticker: ticker,
          name: tokenName || ticker,
          contract: contract,
          balance: bal
        });
        balanceTsMap[key] = now;
        if (price != null && price > 0) {
          priceMap[key] = price;
          priceTsMap[key] = now;
        }
      }

      if (!assets.length) {
        skipped++;
        out.push([name, chain, 0, "skip:no_visible_assets"]);
        continue;
      }

      try {
        var config = chainObj.getConfig();
        var addr = Addr.normalize(wallet);
        var cache = {
          version: config.CACHE_VERSION,
          updatedAt: now,
          last_full_scan: now,
          last_full_price: now,
          assets: assets,
          priceMap: priceMap,
          priceTsMap: priceTsMap,
          balanceTsMap: balanceTsMap,
          scanStats: {
            source: "ledger_sheet_rehydrate",
            sheet: name,
            no_http: true
          }
        };
        WalletCache.save(addr, cache, config);
        rebuilt++;
        out.push([name, chain, assets.length, "rehydrated"]);
      } catch (eSave) {
        failed++;
        out.push([name, chain, assets.length, "error:" + String(eSave.message || eSave).substring(0, 80)]);
      }
    }

    out.push(["SUMMARY", "rebuilt=" + rebuilt, "skipped=" + skipped, "failed=" + failed]);
    return out;
  } catch (e) {
    return [["ERROR", "REHYDRATE_WALLET_CACHE_FROM_LEDGER_SHEETS", String(e.message || e), ""]];
  }
}

function CLEANUP_WALLET_ZOMBIES(wallet, chain) {
  var out = [["Step", "Result", "Details"]];
  
  chain = String(chain || "BASE").toUpperCase();
  
  var chainObj = null;
  try {
    chainObj = eval("_" + chain);
  } catch (e) {}
  
  if (!chainObj || !chainObj.getConfig) {
    out.push(["Error", "Unknown chain: " + chain, ""]);
    return out;
  }
  
  var config = chainObj.getConfig();
  var rpc = config.RPC && config.RPC.ENDPOINTS ? config.RPC.ENDPOINTS[0] : null;
  
  if (!rpc) {
    out.push(["Error", "No RPC endpoint", ""]);
    return out;
  }
  
  var addr = Addr.normalize(wallet);
  CacheManager.init();
  var cache = WalletCache.load(addr, config);
  
  if (!cache || !cache.assets) {
    out.push(["Cache", "NOT FOUND or EMPTY", ""]);
    return out;
  }
  
  var assets = cache.assets;
  out.push(["Assets before", assets.length, ""]);
  
  var cleanAssets = [];
  var removed = [];
  
  for (var i = 0; i < assets.length; i++) {
    var a = assets[i];
    if (!a) continue;
    
    var contract = a.contract || "";
    
    // Always keep native
    if (contract === "native") {
      cleanAssets.push(a);
      continue;
    }
    
    // Check real balance via RPC
    var realBal = 0;
    try {
      var data = "0x70a08231000000000000000000000000" + addr.substring(2).toLowerCase();
      var payload = {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: contract, data: data }, "latest"]
      };
      
      var response = UrlFetchApp.fetch(rpc, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      
      var json = JSON.parse(response.getContentText());
      if (json.result && json.result !== "0x" && json.result !== "0x0") {
        var rawBal = parseInt(json.result, 16);
        var decimals = a.decimals || 18;
        realBal = rawBal / Math.pow(10, decimals);
      }
    } catch (e) {
      // Keep token if RPC fails
      cleanAssets.push(a);
      continue;
    }
    
    // Keep if real balance > 0
    if (realBal > 0) {
      cleanAssets.push(a);
    } else {
      removed.push(a.symbol || contract.substring(0, 10));
    }
  }
  
  out.push(["Removed zombies", removed.length, removed.join(", ").substring(0, 100)]);
  out.push(["Assets after", cleanAssets.length, ""]);
  
  // Save cleaned cache
  cache.assets = cleanAssets;
  cache.updatedAt = Date.now();
  WalletCache.save(addr, cache, config);
  
  out.push(["Cache saved", "OK", ""]);
  out.push(["Done", "Refresh wallet to verify", ""]);
  
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: PROPERTY DIAGNOSTICS (consolidated from DEBUG_PROPERTIES.gs)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Test ScriptProperties read/write
 * @customfunction
 */
function TEST_PROPERTIES() {
  try {
    var props = PropertiesService.getScriptProperties();
    
    // Test read
    var all = props.getProperties();
    var keys = Object.keys(all);
    Logger.log("Keys found: " + keys.length);
    
    // Test write
    props.setProperty("TEST_KEY", "test_value");
    
    // Test delete
    props.deleteProperty("TEST_KEY");
    
    return "OK - " + keys.length + " keys found";
    
  } catch (e) {
    return "ERROR: " + e.message;
  }
}

/**
 * Reset ALL ScriptProperties (DANGER!)
 * @customfunction
 */
function RESET_ALL_PROPERTIES() {
  try {
    var props = PropertiesService.getScriptProperties();
    props.deleteAllProperties();
    return "OK - All properties deleted";
  } catch (e) {
    return "ERROR: " + e.message;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: PRICE DEBUG (consolidated from PRICE_DEBUG.gs)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Test DefiLlama API for a native token
 * @param {string} geckoId - CoinGecko ID (e.g., "flare", "sei-network")
 * @customfunction
 */
function TEST_LLAMA_PRICE(geckoId) {
  var url = 'https://coins.llama.fi/prices/current/coingecko:' + geckoId;
  try {
    var resp = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
    var code = resp.getResponseCode();
    var body = resp.getContentText();
    
    if (code === 200) {
      var json = JSON.parse(body);
      var key = 'coingecko:' + geckoId;
      var price = json.coins && json.coins[key] && json.coins[key].price;
      return price || "NOT FOUND";
    }
    return "HTTP " + code;
  } catch(e) {
    return "ERROR: " + e.message;
  }
}

/**
 * Test CoinGecko API for a native token
 * @param {string} geckoId - CoinGecko ID
 * @customfunction
 */
function TEST_COINGECKO_PRICE(geckoId) {
  var url = 'https://api.coingecko.com/api/v3/simple/price?ids=' + geckoId + '&vs_currencies=usd';
  try {
    var resp = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
    var code = resp.getResponseCode();
    var body = resp.getContentText();
    
    if (code === 200) {
      var json = JSON.parse(body);
      var price = json[geckoId] && json[geckoId].usd;
      return price || "NOT FOUND";
    }
    return "HTTP " + code;
  } catch(e) {
    return "ERROR: " + e.message;
  }
}

/**
 * Clear L1 price cache (forces fresh API calls)
 * @customfunction
 */
function CLEAR_PRICE_L1_CACHE() {
  var cache = CacheService.getScriptCache();
  // CacheService doesn't support listing keys
  // L1 TTL is 2 hours - entries expire automatically
  return "L1 cache TTL is 2 hours. Entries will expire automatically.";
}
