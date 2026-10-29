// v4.16.41 - WC-15: _RpcLookup extrait tel quel depuis 27_ACTIVITY_REFRESH.gs
// Dependances a l appel: ACTIVITY_CONFIG.STORAGE.RPC_LOOKUP, ChainFactory, PropertiesService, Logger.
// Aucune execution au chargement du fichier.

// ============================================================
// RPC LOOKUP TABLE - v4.12.22 FIX
// Stores chain -> RPC mapping in PropertiesService
// Solves the eval() failure in trigger context
// ============================================================

var _RpcLookup = (function() {
  var _cache = null;
  var _initAttempted = false;
  
  function _initFromChainFactory() {
    if (_cache !== null) return; // already init'd
    _cache = {};
    _initAttempted = true;
    try {
      var registry = {};
      try {
        if (typeof ChainFactory !== "undefined" && ChainFactory.getRegistry) {
          registry = ChainFactory.getRegistry() || {};
        }
      } catch (eReg) {}
      var names = Object.keys(registry);
      if (names.length === 0) return;
      for (var i = 0; i < names.length; i++) {
        try {
          var obj = registry[names[i]];
          if (!obj || typeof obj.getConfig !== "function") continue;
          var cfg = obj.getConfig();
          if (!cfg) continue;
          var vm = (cfg.VM || cfg.vm || "EVM").toUpperCase();
          var ep = (cfg.RPC && cfg.RPC.ENDPOINTS) ? cfg.RPC.ENDPOINTS : [];
          var rpc = ep[0];
          if (!rpc) {
            if (cfg.API && cfg.API.REST_URL) { rpc = cfg.API.REST_URL; ep = [rpc]; }
            else if (cfg.REST && cfg.REST.ENDPOINTS && cfg.REST.ENDPOINTS.length) {
              rpc = cfg.REST.ENDPOINTS[0];
              ep = cfg.REST.ENDPOINTS;
            }
          }
          if (rpc) {
            _RpcLookup.set(names[i], rpc, vm, ep.slice(1, 3));
          }
        } catch (eChain) {
          Logger.log("[RpcLookup] Init error for " + names[i] + ": " + eChain);
        }
      }
    } catch (e) {
      Logger.log("[RpcLookup] Init error: " + e);
    }
  }
  
  function _load() {
    if (_cache !== null) return;
    // v4.15.100: Memory-only — rebuild from ChainFactory on each run instead
    // of persisting to ScriptProperties (saves ~28KB of 500KB quota).
    // Falls back to legacy ScriptProperties key if ChainFactory not available.
    _initFromChainFactory();
    if (_initAttempted && _cache && Object.keys(_cache).length > 0) return;
    // Fallback: try old persisted key (will be cleaned by emergency purge)
    try {
      var raw = PropertiesService.getScriptProperties().getProperty(ACTIVITY_CONFIG.STORAGE.RPC_LOOKUP);
      _cache = raw ? JSON.parse(raw) : {};
    } catch (e) {
      _cache = {};
    }
  }
  
  function _save() {
    // v4.15.100: No-op — RPC lookup is rebuilt from ChainFactory on each watchdog
    // cycle. The old ACTIVITY_RPC_LOOKUP key (28+ KB) is cleaned by emergency purge.
  }
  
  return {
    /**
     * Get primary RPC URL for a chain
     */
    get: function(chain) {
      _load();
      var key = String(chain).toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");
      var entry = _cache[key];
      if (!entry) return null;
      // v4.14.7: Support both old format (entry.rpc) and new (entry.rpcs array)
      if (entry.rpcs && entry.rpcs.length > 0) return entry.rpcs[0];
      return entry.rpc || null;
    },

    /**
     * v4.14.7: Get all RPCs for a chain (up to 3 for fallback)
     */
    getRpcs: function(chain) {
      _load();
      var key = String(chain).toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");
      var entry = _cache[key];
      if (!entry) return [];
      if (entry.rpcs && entry.rpcs.length > 0) return entry.rpcs;
      return entry.rpc ? [entry.rpc] : [];
    },

    /**
     * Get primary Cosmos REST URL for a chain.
     * Existing lookup entries store Cosmos REST_URL in rpc/rpcs.
     */
    getRest: function(chain) {
      _load();
      var key = String(chain).toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");
      var entry = _cache[key];
      if (!entry) return null;
      if (entry.rest) return entry.rest;
      if (entry.rests && entry.rests.length > 0) return entry.rests[0];
      if (entry.vm === "COSMOS") {
        if (entry.rpcs && entry.rpcs.length > 0) return entry.rpcs[0];
        return entry.rpc || null;
      }
      return null;
    },

    /**
     * Get VM type for a chain
     */
    getVm: function(chain) {
      _load();
      var key = String(chain).toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");
      var entry = _cache[key];
      return entry ? entry.vm : "EVM";
    },

    /**
     * Set RPCs for a chain (stores up to 3)
     */
    set: function(chain, rpc, vm, extraRpcs) {
      _load();
      var key = String(chain).toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");
      // v4.14.7: Store array of RPCs for fallback
      var rpcs = [rpc];
      if (extraRpcs && extraRpcs.length > 0) {
        for (var i = 0; i < extraRpcs.length && rpcs.length < 3; i++) {
          if (extraRpcs[i] !== rpc) rpcs.push(extraRpcs[i]);
        }
      }
      _cache[key] = {
        rpc: rpc,
        rpcs: rpcs,
        vm: vm || "EVM",
        updated: Date.now()
      };
      _save();
    },
    
    /**
     * Get all entries
     */
    getAll: function() {
      _load();
      return _cache;
    },
    
    /**
     * Count entries
     */
    count: function() {
      _load();
      return Object.keys(_cache).length;
    },
    
    /**
     * Clear all
     */
    clear: function() {
      _cache = {};
      _save();
    },
    
    /**
     * Force reload from storage
     */
    reload: function() {
      _cache = null;
      _load();
    }
  };
})();

