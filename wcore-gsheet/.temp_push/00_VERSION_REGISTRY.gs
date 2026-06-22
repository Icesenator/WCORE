/************************************************************
 * 00_VERSION_REGISTRY.gs - Registre Central des Versions
 * 
 * v4.13.1 - SIMPLIFIED
 * 
 * Ce fichier définit uniquement ModuleRegistry.
 * Les versions sont AUTOMATIQUEMENT extraites des headers
 * par 00B_VERSION_SCANNER.gs - AUCUNE maintenance requise !
 * 
 * WORKFLOW:
 * =========
 * 1. Tu modifies le header d'un fichier: "v4.12.30 - Fix XYZ"
 * 2. VERSION_SCANNER scanne automatiquement au chargement
 * 3. La version est enregistrée dans ModuleRegistry
 * 4. VERSION_REGISTRY.get("MODULE") retourne la bonne version
 * 
 * AUCUN FALLBACK À MAINTENIR !
 ************************************************************/

// ============================================================
// MODULE REGISTRY - Système d'enregistrement
// ============================================================

var ModuleRegistry = (function() {
  var _registered = {};
  var _metadata = {};
  var _loadOrder = [];
  
  return {
    /**
     * Enregistrer un module avec sa version
     * Appelé automatiquement par VERSION_SCANNER
     */
    register: function(name, version, meta) {
      if (!name || !version) return;
      
      var key = String(name).toUpperCase().replace(/[^A-Z0-9_]/g, "_");
      _registered[key] = String(version);
      
      if (_loadOrder.indexOf(key) === -1) {
        _loadOrder.push(key);
      }
      
      if (meta && typeof meta === "object") {
        _metadata[key] = meta;
      }
    },
    
    /**
     * Obtenir la version d'un module
     */
    get: function(name) {
      if (!name) return "N/A";
      var key = String(name).toUpperCase().replace(/[^A-Z0-9_]/g, "_");
      return _registered[key] || "N/A";
    },
    
    /**
     * Obtenir tous les modules enregistrés
     */
    getAll: function() {
      var result = {};
      for (var k in _registered) {
        if (_registered.hasOwnProperty(k)) {
          result[k] = _registered[k];
        }
      }
      return result;
    },
    
    /**
     * Vérifier si un module est enregistré
     */
    has: function(name) {
      if (!name) return false;
      var key = String(name).toUpperCase().replace(/[^A-Z0-9_]/g, "_");
      return _registered.hasOwnProperty(key);
    },
    
    /**
     * Nombre de modules enregistrés
     */
    count: function() {
      return Object.keys(_registered).length;
    },
    
    /**
     * Obtenir les métadonnées d'un module
     */
    getMeta: function(name) {
      if (!name) return null;
      var key = String(name).toUpperCase().replace(/[^A-Z0-9_]/g, "_");
      return _metadata[key] || null;
    },
    
    /**
     * Ordre de chargement des modules
     */
    getLoadOrder: function() {
      return _loadOrder.slice();
    }
  };
})();

// ============================================================
// VERSION WCORE GLOBALE
// ============================================================
// WCORE_VERSION and WCORE_CACHE_VERSION are defined in 01_INIT.gs
// (single source of truth). Do NOT redeclare them here.

// Enregistrer ce module
ModuleRegistry.register("VERSION_REGISTRY", "4.13.1", {
  description: "Central version registry - auto-populated by VERSION_SCANNER"
});
// WCORE registration deferred to 32_MODULE_AUTOREGISTER.gs (01_INIT not loaded yet)

// ============================================================
// VERSION_REGISTRY - Interface de compatibilité
// ============================================================

var VERSION_REGISTRY = {
  
  /**
   * Obtenir la version d'un module
   * Les versions sont auto-extraites par VERSION_SCANNER
   */
  get: function(name) {
    return ModuleRegistry.get(name);
  },
  
  /**
   * Obtenir toutes les versions
   */
  getAll: function() {
    return ModuleRegistry.getAll();
  },
  
  /**
   * Vérifier si un module est enregistré
   */
  has: function(name) {
    return ModuleRegistry.has(name);
  },
  
  /**
   * Rafraîchir les propriétés directes (pour legacy code)
   */
  refresh: function() {
    var all = ModuleRegistry.getAll();
    for (var mod in all) {
      if (all.hasOwnProperty(mod)) {
        this[mod] = all[mod];
      }
    }
    return this;
  }
};

// ============================================================
// FONCTIONS PUBLIQUES
// ============================================================

/**
 * Obtenir toutes les versions (pour Sheets)
 * @customfunction
 */
function GET_ALL_VERSIONS() {
  // Forcer un scan si VERSION_SCANNER est disponible
  if (typeof VersionScanner !== 'undefined' && VersionScanner.scanAndRegister) {
    VersionScanner.scanAndRegister();
  }
  
  var out = [["Module", "Version"]];
  var all = ModuleRegistry.getAll();
  var keys = Object.keys(all).sort();
  
  for (var i = 0; i < keys.length; i++) {
    out.push([keys[i], all[keys[i]]]);
  }
  
  out.push(["", ""]);
  out.push(["TOTAL", keys.length + " modules"]);
  
  return out;
}

/**
 * Obtenir la version d'un module spécifique
 * @param {string} moduleName - Nom du module
 * @customfunction
 */
function GET_VERSION(moduleName) {
  return ModuleRegistry.get(moduleName);
}

// ============================================================
// LOG INIT
// ============================================================

(function() {
  try {
    Logger.log("[VERSION_REGISTRY] v4.13.1 loaded - waiting for VERSION_SCANNER");
  } catch (e) {}
})();
