/************************************************************
 * 32_MODULE_AUTOREGISTER.gs (v4.13.3) - Auto-registration
 * 
 * Ce fichier DOIT etre charge APRES tous les autres modules.
 * Nomme le fichier ZZ_MODULE_AUTOREGISTER.gs pour garantir
 * qu'il est charge en dernier.
 *
 * v4.13.3 - Deferred VERSION_SCANNER + registration log
 *
 * NOTE: eval() in _forceRegisterAllModules() works at runtime but NOT in
 * trigger context (GAS limitation). BUILD_RPC_LOOKUP() and dynamic version
 * lookups require manual invocation from the Apps Script editor.
 ************************************************************/

// ============================================================
// AUTO-REGISTRATION (v4.13.2)
// ============================================================
if (typeof ModuleRegistry !== 'undefined') {
  ModuleRegistry.register("MODULE_AUTOREGISTER", "4.13.3", {
    description: "Auto-registers all modules for STATS display"
  });
}

// ============================================================
// FORCE REGISTRATION - Run on every execution
// ============================================================
/**
 * Force register all modules. Call this from buildStatsBase
 * or any stats function to ensure modules are registered.
 */
function _forceRegisterAllModules() {
  if (typeof ModuleRegistry === 'undefined') return;
  
  var modules = {
    // Cache modules
    "CACHE_CORE": { ver: "4.15.33", check: function() { return typeof CacheManager !== 'undefined'; } },
    "CACHE_WALLET": { ver: "4.15.13", check: function() { return typeof WalletCache !== 'undefined'; } },
    "CACHE_PRICE": { ver: "4.9.7", check: function() { return typeof PriceRunCache !== 'undefined'; } },
    "CACHE_GLOBAL": { ver: "4.15.32", check: function() { return typeof GlobalPriceCache !== 'undefined'; } },
    "CACHE_SHEET": { ver: "4.15.0", check: function() { return typeof SheetCache !== 'undefined'; } },

    // HTTP modules
    "HTTP": { ver: "4.15.6", check: function() { return typeof Http !== 'undefined'; } },
    "HTTP_GUARD": { ver: "4.9.3", check: function() { return typeof HttpErrorGuard !== 'undefined'; } },

    // Protection modules
    "CACHE_GUARD": { ver: "4.13.4", check: function() { return typeof CacheGuard !== 'undefined'; } },

    // Core functionality modules
    "ASSETS": { ver: "4.15.1", check: function() { return typeof AssetManager !== 'undefined' || typeof BalanceFetcher !== 'undefined'; } },
    "BUDGET": { ver: "4.15.14", check: function() { return typeof BudgetManager !== 'undefined'; } },
    "PRICES": { ver: "4.15.30", check: function() { return typeof PriceSources !== 'undefined'; } },
    "RPC": { ver: "4.15.33", check: function() { return typeof RpcClient !== 'undefined'; } },
    "TOKENS": { ver: "4.12.25", check: function() { return typeof TokenMeta !== 'undefined'; } },

    // Engine modules
    "BASE_ENGINE": { ver: "4.15.27", check: function() { return typeof BaseEngine !== 'undefined'; } },
    "EVM_ENGINE": { ver: "4.15.27", check: function() { return typeof EvmEngine !== 'undefined'; } },
    "SVM_ENGINE": { ver: "4.15.19", check: function() { return typeof SvmEngine !== 'undefined'; } },
    "COSMOS_ENGINE": { ver: "4.15.19", check: function() { return typeof CosmosEngine !== 'undefined'; } },

    // Utility modules
    "DIAGNOSTIC": { ver: "4.12.3", check: function() { return typeof Diagnostic !== 'undefined'; } },
    "DASHBOARD": { ver: "4.10.0", check: function() { return typeof DASHBOARD_CONFIG !== 'undefined'; } },
    "ACTIVITY_REFRESH": { ver: "4.15.2", check: function() { return typeof ActivityTracker !== 'undefined'; } },
    "PRICING_WORKER": { ver: "4.15.33", check: function() { return typeof PRICING_WORKER_VERSION !== 'undefined' || typeof _runPricingWorker === 'function'; } },
    "OPTIMIZATIONS": { ver: "4.12.1", check: function() { return typeof OPTIMIZATION_CONFIG !== 'undefined' || typeof ChainCircuitBreaker !== 'undefined'; } },
    "DEGRADED_MODE": { ver: "4.15.33", check: function() { return typeof DegradedMode !== 'undefined'; } },

    // Additional modules
    "QUOTA_CIRCUIT_BREAKER": { ver: "4.13.5", check: function() { return typeof QuotaCircuitBreaker !== 'undefined'; } },
    "REFRESH": { ver: "4.5.21", check: function() { return typeof REFRESH_VERSION !== 'undefined'; } },
    "CHAIN_FACTORY": { ver: "4.15.14", check: function() { return typeof ChainFactory !== 'undefined'; } }
  };
  
  // v4.13.3: Dynamic version lookup for ALL modules
  // Convention: MODULE_NAME → MODULE_NAME_VERSION variable
  // Since autoregister loads last (file 32), all *_VERSION variables are defined
  for (var name in modules) {
    if (ModuleRegistry.has(name)) continue;

    var mod = modules[name];
    try {
      if (mod.check()) {
        var ver = mod.ver;
        // Try to read the *_VERSION variable for accurate version
        try { var dynVer = eval(name + "_VERSION"); if (dynVer) ver = dynVer; } catch(eV) {}
        ModuleRegistry.register(name, ver);
      }
    } catch(e) {
      // Silent fail
    }
  }
}

// Run immediately when file loads
_forceRegisterAllModules();

// v4.13.3 - Also run VERSION_SCANNER now that all files are loaded
(function() {
  try {
    // Register WCORE version from 01_INIT.gs (object with .toString())
    if (typeof WCORE_VERSION !== 'undefined' && !ModuleRegistry.has("WCORE")) {
      ModuleRegistry.register("WCORE", WCORE_VERSION.toString ? WCORE_VERSION.toString().replace("v","") : String(WCORE_VERSION));
    }
    if (typeof VersionScanner !== 'undefined') {
      var result = VersionScanner.scanAndRegister();
      Logger.log("[MODULE_AUTOREGISTER] Registered " + ModuleRegistry.count() + " modules (" + result.count + " from VERSION vars)");
    } else {
      Logger.log("[MODULE_AUTOREGISTER] Registered " + ModuleRegistry.count() + " modules");
    }
  } catch (e) {}
})();

// ============================================================
// TEST FUNCTION
// ============================================================
function TEST_MODULE_AUTOREGISTER() {
  // Force registration first
  _forceRegisterAllModules();
  
  if (typeof ModuleRegistry === 'undefined') return [["Error", "ModuleRegistry not loaded"]];
  
  var modules = [
    "CACHE_CORE", "CACHE_WALLET", "CACHE_PRICE", "CACHE_GLOBAL", "CACHE_SHEET",
    "HTTP", "HTTP_GUARD", "CACHE_GUARD",
    "ASSETS", "BUDGET", "PRICES", "RPC", "TOKENS",
    "BASE_ENGINE", "EVM_ENGINE", "SVM_ENGINE", "COSMOS_ENGINE",
    "SIMPLE_ROTATION", "DIAGNOSTIC", "DASHBOARD", "ACTIVITY_REFRESH", "PRICING_WORKER",
    "OPTIMIZATIONS", "DEGRADED_MODE", "QUOTA_CIRCUIT_BREAKER",
    "REFRESH", "CHAIN_FACTORY", "DYNAMIC_RPC", "MISSING_TOKENS"
  ];
  
  var out = [["Module", "Version", "Status"]];
  var registered = 0;
  
  for (var i = 0; i < modules.length; i++) {
    var mod = modules[i];
    var ver = ModuleRegistry.get(mod);
    var status = ver ? "âœ“" : "âœ—";
    if (ver) registered++;
    out.push([mod, ver || "N/A", status]);
  }
  
  out.push(["", "", ""]);
  out.push(["TOTAL", registered + " / " + modules.length, ""]);
  
  return out;
}

/**
 * Debug: Show which objects are defined
 */
function DEBUG_MODULE_OBJECTS() {
  var checks = [
    ["CacheManager", typeof CacheManager !== 'undefined'],
    ["WalletCache", typeof WalletCache !== 'undefined'],
    ["Http", typeof Http !== 'undefined'],
    ["HttpBudget", typeof HttpBudget !== 'undefined'],
    ["HttpErrorGuard", typeof HttpErrorGuard !== 'undefined'],
    ["AssetManager", typeof AssetManager !== 'undefined'],
    ["BalanceFetcher", typeof BalanceFetcher !== 'undefined'],
    ["TokenMeta", typeof TokenMeta !== 'undefined'],
    ["Diagnostic", typeof Diagnostic !== 'undefined'],
    ["DASHBOARD_CONFIG", typeof DASHBOARD_CONFIG !== 'undefined'],
    ["ActivityTracker", typeof ActivityTracker !== 'undefined'],
    ["OPTIMIZATION_CONFIG", typeof OPTIMIZATION_CONFIG !== 'undefined'],
    ["ChainCircuitBreaker", typeof ChainCircuitBreaker !== 'undefined']
  ];
  
  var out = [["Object", "Exists"]];
  for (var i = 0; i < checks.length; i++) {
    out.push([checks[i][0], checks[i][1] ? "YES" : "NO"]);
  }
  return out;
}
