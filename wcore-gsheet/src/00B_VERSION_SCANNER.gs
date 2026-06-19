/************************************************************
 * 00B_VERSION_SCANNER.gs - Collecteur de versions AUTOMATIQUE
 * 
 * v4.12.29
 * 
 * ╔═══════════════════════════════════════════════════════════╗
 * ║  AUCUNE CONFIGURATION REQUISE !                           ║
 * ║  Déploie et ça marche.                                    ║
 * ╚═══════════════════════════════════════════════════════════╝
 * 
 * USAGE DANS CHAQUE MODULE:
 * =========================
 * Ajoute UNE LIGNE au début de ton fichier :
 * 
 *   var ASSETS_VERSION = "4.12.29";
 * 
 * Le scanner collecte automatiquement toutes ces variables
 * et les enregistre dans ModuleRegistry.
 * 
 ************************************************************/
var VERSION_SCANNER_VERSION = "4.12.29";

// ============================================================
// CONFIGURATION - Liste des variables à scanner
// ============================================================

var VERSION_SCANNER_VARS = [
  // Core
  ["INIT_VERSION", "INIT"],
  ["UTILS_VERSION", "UTILS"],
  
  // HTTP
  ["HTTP_VERSION", "HTTP"],
  ["HTTP_GUARD_VERSION", "HTTP_GUARD"],
  ["HTTP_SAVINGS_VERSION", "HTTP_SAVINGS"],
  
  // Cache
  ["CACHE_CORE_VERSION", "CACHE_CORE"],
  ["CACHE_WALLET_VERSION", "CACHE_WALLET"],
  ["CACHE_GLOBAL_VERSION", "CACHE_GLOBAL"],
  ["CACHE_SHEET_VERSION", "CACHE_SHEET"],
  
  // Data
  ["RPC_VERSION", "RPC"],
  ["TOKENS_VERSION", "TOKENS"],
  ["PRICES_VERSION", "PRICES"],
  
  // Core functionality
  ["ASSETS_VERSION", "ASSETS"],
  ["BUDGET_VERSION", "BUDGET"],
  ["OUTPUT_VERSION", "OUTPUT"],
  ["STATS_BUILDER_VERSION", "STATS_BUILDER"],
  
  // Engines
  ["BASE_ENGINE_VERSION", "BASE_ENGINE"],
  ["EVM_ENGINE_VERSION", "EVM_ENGINE"],
  ["SVM_ENGINE_VERSION", "SVM_ENGINE"],
  ["COSMOS_ENGINE_VERSION", "COSMOS_ENGINE"],
  ["SIMPLE_ROTATION_VERSION", "SIMPLE_ROTATION"],
  
  // Features
  ["CHAIN_FACTORY_VERSION", "CHAIN_FACTORY"],
  ["WALLET_NAMES_VERSION", "WALLET_NAMES"],
  ["DIAGNOSTIC_VERSION", "DIAGNOSTIC"],
  ["DASHBOARD_VERSION", "DASHBOARD"],
  ["DEGRADED_MODE_VERSION", "DEGRADED_MODE"],
  ["OPTIMIZATIONS_VERSION", "OPTIMIZATIONS"],
  ["ACTIVITY_REFRESH_VERSION", "ACTIVITY_REFRESH"],
  ["REFRESH_VERSION", "REFRESH"],
  ["RPC_BENCHMARK_VERSION", "RPC_BENCHMARK"],
  ["CACHE_OPTIMIZER_VERSION", "CACHE_OPTIMIZER"],
  ["RPC_HEALTH_REPORT_VERSION", "RPC_HEALTH_REPORT"],

  // Protection & Guards
  ["CACHE_GUARD_VERSION", "CACHE_GUARD"],
  ["QUOTA_CIRCUIT_BREAKER_VERSION", "QUOTA_CIRCUIT_BREAKER"],

  // Additional modules
  ["DYNAMIC_RPC_VERSION", "DYNAMIC_RPC"],
  ["MISSING_TOKENS_VERSION", "MISSING_TOKENS"]
];

// ============================================================
// SCANNER
// ============================================================

var VersionScanner = {
  
  /**
   * Scanner toutes les variables VERSION et les enregistrer
   */
  scanAndRegister: function() {
    var count = 0;
    var versions = {};
    
    for (var i = 0; i < VERSION_SCANNER_VARS.length; i++) {
      var varName = VERSION_SCANNER_VARS[i][0];
      var moduleName = VERSION_SCANNER_VARS[i][1];
      
      try {
        var value = eval("typeof " + varName + " !== 'undefined' ? " + varName + " : null");
        
        if (value !== null && /^\d+\.\d+/.test(String(value))) {
          var version = String(value);
          versions[moduleName] = version;
          
          if (typeof ModuleRegistry !== 'undefined') {
            ModuleRegistry.register(moduleName, version, { source: "auto", variable: varName });
            count++;
          }
        }
      } catch (e) {}
    }
    
    return { count: count, versions: versions };
  },
  
  getAll: function() {
    var result = {};
    for (var i = 0; i < VERSION_SCANNER_VARS.length; i++) {
      var varName = VERSION_SCANNER_VARS[i][0];
      var moduleName = VERSION_SCANNER_VARS[i][1];
      try {
        var value = eval("typeof " + varName + " !== 'undefined' ? " + varName + " : null");
        if (value !== null && /^\d+\.\d+/.test(String(value))) {
          result[moduleName] = String(value);
        }
      } catch (e) {}
    }
    return result;
  }
};

// ============================================================
// AUTO-SCAN AU CHARGEMENT
// ============================================================

(function() {
  try {
    if (typeof ModuleRegistry !== 'undefined') {
      ModuleRegistry.register("VERSION_SCANNER", VERSION_SCANNER_VERSION);
      // v4.12.30 - Scan is deferred: variables *_VERSION from other files
      // are not yet defined when 00B loads (GAS file load order not guaranteed).
      // Actual scan runs lazily on first call to scanAndRegister() or getAll(),
      // or via 32_MODULE_AUTOREGISTER.gs which loads last.
      Logger.log("[VERSION_SCANNER] v" + VERSION_SCANNER_VERSION + " loaded (deferred scan)");
    }
  } catch (e) {}
})();

// ============================================================
// FONCTIONS SHEETS
// ============================================================

/**
 * Afficher toutes les versions détectées
 * @customfunction
 */
function SCAN_VERSIONS() {
  var result = VersionScanner.scanAndRegister();
  var out = [["Module", "Version", "Status"]];
  
  for (var i = 0; i < VERSION_SCANNER_VARS.length; i++) {
    var varName = VERSION_SCANNER_VARS[i][0];
    var moduleName = VERSION_SCANNER_VARS[i][1];
    
    if (result.versions[moduleName]) {
      out.push([moduleName, result.versions[moduleName], "✅"]);
    } else {
      out.push([moduleName, "—", "⚠️ Ajouter: var " + varName]);
    }
  }
  
  out.push(["", "", ""]);
  out.push(["TOTAL", result.count + "/" + VERSION_SCANNER_VARS.length, ""]);
  
  return out;
}

/**
 * Modules sans variable VERSION
 * @customfunction
 */
function CHECK_MISSING_VERSIONS() {
  var all = VersionScanner.getAll();
  var out = [["Module Manquant", "Variable à ajouter"]];
  
  for (var i = 0; i < VERSION_SCANNER_VARS.length; i++) {
    var varName = VERSION_SCANNER_VARS[i][0];
    var moduleName = VERSION_SCANNER_VARS[i][1];
    
    if (!all[moduleName]) {
      out.push([moduleName, "var " + varName + ' = "x.y.z";']);
    }
  }
  
  if (out.length === 1) {
    out.push(["Aucun", "Tous les modules ont leur VERSION ✅"]);
  }
  
  return out;
}
