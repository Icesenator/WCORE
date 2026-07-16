// v4.15.100 - RPC_LOOKUP: no ScriptProperties persistence (memory-only, rebuilt from ChainFactory, saves ~28KB quota)
// v4.15.7 - stale cache diagnostics keep partial while price/meta gaps remain
// v4.15.6 - prune stale ActivityTracker entries for retired Ledger sheets
// v4.15.4 - cooldown 10min B1 pulse pour éviter doublon avec WATCHDOG_FROM_RECAP
/************************************************************
 * 27_ACTIVITY_REFRESH.gs - Activity-Based Refresh System (v4.15.7)
 *
 * v4.15.7 - FIX: stale cache diagnostics do not report DONE while
 * price_missing/meta_missing gaps remain
 *
 * v4.15.6 - FIX: ActivityTracker stale sheet pruning
 * - NEW: PRUNE_ACTIVITY_NONCE_MAP_STALE(force) removes ACTIVITY_NONCE_MAP
 *   entries whose chain no longer exists as an active Ledger sheet.
 * - ACTIVITY_WATCHDOG runs the prune at most once/day; INIT_ALL_NONCES forces it.
 *
 * v4.15.5 - FIX: ACTIVITY_WATCHDOG now stops when WCORE_IS_SAFE()
 *   returns {safe:false}. The previous !WCORE_IS_SAFE() check never fired
 *   because objects are truthy in JavaScript.
 *
 * v4.15.2 - Phase C step 4: WATCHDOG signal worker path behind PHASE_C_ENABLED
 * - NEW: ACTIVITY_WATCHDOG uses updateSignals({n,b,s,lc,la,hb,vm}) when enabled
 * - NEW: native balance fetchers update signal b without overwriting valid cache on null
 *
 * v4.15.1 - Phase C step 2+3: ActivityTracker compact shape migration + native balance signal fetchers
 * - NEW: ActivityTracker.updateSignals() writes compact {n,b,s,lc,la,hb,vm}
 * - NEW: native balance signal fetchers for EVM, SVM, and Cosmos
 * - NEW: ACTIVITY_TRACKER_STATS() and DIAG_NATIVE_BALANCE_ONE()
 *
 * v4.15.0 - FEAT: Unified activity detection for EVM, SVM, and Cosmos
 * - NEW: fetchSvmSignatureBatch() — uses getSignaturesForAddress(limit=1)
 *   Compares latest tx signature (string) instead of nonce (integer)
 * - NEW: fetchCosmosSequenceBatch() — uses /cosmos/auth/v1beta1/accounts/
 *   Account sequence is the Cosmos equivalent of EVM nonce
 * - CHANGED: WATCHDOG now processes all 3 VM types (was EVM-only)
 * - CHANGED: BUILD_RPC_LOOKUP now handles Cosmos API.REST_URL config
 * - HTTP impact: ~6-7 extra calls/cycle (2 SVM + 4 Cosmos) = +1728/day
 *
 * v4.14.8 - FIX: ACTIVITY DETECTION → SHEET REFRESH BROKEN
 * - BUG 1: _activity_pulseB1ForChain_ couldn't find sheets (case mismatch)
 *   "ARBITRUM_ONE" tried "Ledger - ARBITRUM_ONE" but sheet = "Ledger - Arbitrum One"
 *   Now: case-insensitive suffix match across ALL sheets
 * - BUG 2: ForceRefreshManager key mismatch between set() and check()
 *   WATCHDOG set key with "ARBITRUM_ONE" (underscore) but BaseEngine read with
 *   "ARBITRUM ONE" (space from config.CHAIN.NAME) → flag never found
 *   Now: _normalizeChain() used everywhere (spaces→underscores)
 * - ForceRefresh flag expiry increased from 10min to 30min (WATCHDOG rotation ~30min)
 *
 * v4.14.7 - RPC-FAIL GRACEFUL REGISTRATION
 * - FIX: Register wallets with nonce=0 when RPC fetch fails (was silently skipped)
 * - Prevents permanent blind spots when RPCs are down during discovery
 * - Affects: WATCHDOG discovery, DISCOVER_AND_REGISTER, EVM engine auto-reg
 * - Wallets with nonce=0 are updated on next WATCHDOG cycle when RPCs recover
 *
 * v4.14.6 - WALLET AUTO-DISCOVERY
 * - NEW: _discoverWalletsFromRecap_() reads Recap Chain to find all wallets
 * - NEW: DISCOVER_AND_REGISTER_WALLETS() registers missing EVM wallets
 * - WATCHDOG auto-discovers missing wallets every 24h (batch RPC)
 * - Fixes chicken-and-egg: INIT_ALL_NONCES only updated existing wallets
 * - Root cause: _activity_getAllWalletsFromPackedCache was never defined
 *
 * v4.13.7 - ERROR AUTO-RETRY
 * - WATCHDOG scans all wallet-chain sheets for #ERROR! in A2 or J2
 * - If found, increments J1 by 1 second to trigger recalculation
 * - Sheets identified by " - " in name (e.g. "Ledger - Linea")
 * - Runs every WATCHDOG cycle (5 min) until error resolves
 *
 * v4.13.6 - BATCH NONCE FETCHING (HTTP Quota Saver)
 * - NEW: fetchEvmNonceBatch() groups wallets by RPC endpoint
 * - Sends JSON-RPC batch array (N requests in 1 HTTP call per RPC)
 * - WATCHDOG: ~20 wallets checked in 2-4 HTTP calls instead of 20
 * - INIT_ALL_NONCES: also uses batch mode
 * - Estimated savings: ~5000 HTTP calls/day (27% of daily quota)
 * 
 * v4.12.25 - HTTP Consumption Optimization
 * - BATCH_SIZE reduced from 30 to 20 (saves ~33% nonce HTTP calls)
 * - Catchup cooldown 30s instead of 0 (prevents burst on stale data)
 *
 * v4.12.24 - Cache Age Priority
 * - DIAG_STALE_CACHES() diagnostic des caches vieillissants
 * - _getWalletForChain_() helper pour lookup wallet par chaÃ®ne
 * 
 * v4.12.22 - CRITICAL FIX: RPC Lookup Table
 * - WATCHDOG now uses persistent RPC_LOOKUP instead of eval()
 * - eval() fails silently in trigger context - wallets never updated!
 * - BUILD_RPC_LOOKUP() scans all _CHAIN objects and stores RPCs
 * - WATCHDOG reads from PropertiesService (always works)
 * - Added support for SVM/Cosmos activity detection (future)
 * 
 * v4.12.21 - CLEAN REWRITE:
 * - ClÃ©s TOUJOURS normalisÃ©es: CHAIN_UPPER:wallet_lower
 * - ActivityTracker intÃ©grÃ© avec API cohÃ©rente
 * - Compatible avec tous les formats de config.CHAIN.NAME
 * 
 * PRINCIPE:
 * - Stocke le nonce/tx count de chaque wallet EVM
 * - Compare Ã  chaque check: si diffÃ©rent = transaction dÃ©tectÃ©e
 * - Transaction dÃ©tectÃ©e = flag force refresh
 * 
 ************************************************************/

var ACTIVITY_REFRESH_VERSION = "4.15.100";

function _activityCanFetch_(reason) {
  try {
    if (typeof Http !== "undefined" && Http.canFetchNow) return Http.canFetchNow(reason || "activity");
  } catch (eH) {}
  try {
    if (typeof QuotaCircuitBreaker !== "undefined" &&
        QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped()) return false;
  } catch (eQ) {}
  try {
    if (typeof HttpErrorGuard !== "undefined" &&
        HttpErrorGuard.isQuotaExhausted && HttpErrorGuard.isQuotaExhausted()) return false;
  } catch (eG) {}
  return true;
}

function _activityPriorityScore_(item, nowMs) {
  try {
    if (!item) return 0;
    nowMs = nowMs || Date.now();
    var lastCheck = Number(item.lastCheck || 0);
    var ageMin = lastCheck > 0 ? Math.max(0, (nowMs - lastCheck) / 60000) : 1440;
    var score = Math.min(1440, ageMin);
    if (item.lastActivity || item.lastTx || item.activity) score += 720;
    if (item.force || item.forced || item.forceRefresh) score += 1000;
    if (item.error || item.lastError) score -= 120;
    return score;
  } catch (e) {
    return 0;
  }
}

// ============================================================
// AUTO-REGISTRATION (v4.15.0)
// ============================================================
if (typeof ModuleRegistry !== 'undefined') {
  ModuleRegistry.register("ACTIVITY_REFRESH", ACTIVITY_REFRESH_VERSION, {
    description: "Unified activity detection for EVM, SVM, and Cosmos",
    dependencies: ["CACHE_CORE"]
  });
}

// ============================================================
// CONFIGURATION
// ============================================================

var ACTIVITY_CONFIG = {
  // Intervalles de refresh (ms)
  INTERVALS: {
    ACTIVE:     300000,    // 5 min - TX rÃ©cente dÃ©tectÃ©e
    HIGH_VALUE: 1800000,   // 30 min - Wallet > 1000 EUR
    MEDIUM:     7200000,   // 2h - Wallet > 100 EUR
    LOW:        21600000,  // 6h - Wallet > 1 EUR
    HIBERNATED: 86400000   // 24h - Wallet < 1 EUR
  },
  
  // Seuils de valeur (EUR)
  THRESHOLDS: {
    HIGH:   1000,
    MEDIUM: 100,
    LOW:    1
  },
  
  // FenÃªtre d'activitÃ© rÃ©cente
  ACTIVITY_WINDOW_MS: 300000, // 5 min
  
  // ClÃ©s de stockage
  STORAGE: {
    NONCE_MAP: "ACTIVITY_NONCE_MAP",
    FORCE_REFRESH_PREFIX: "ACTIVITY_FORCE_",
    RPC_LOOKUP: "ACTIVITY_RPC_LOOKUP"  // v4.12.22: Persistent RPC map
  },
  
  // Limites
  // v4.15.100: reduced from 7 to 3 days to keep storage smaller
  MAX_AGE_DAYS: 3,
  BATCH_SIZE: 20,             // v4.12.25: reduced from 30 (6 runs = 30 min full rotation, saves ~33% HTTP)
  CATCHUP_COOLDOWN_MS: 30000  // v4.12.25: min 30s between checks in catchup mode (was 0 = burst)
};

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

// ============================================================
// ACTIVITY TRACKER - Module principal
// ============================================================

var ActivityTracker = (function() {
  var _cache = null;
  var _dirty = false;
  
  /**
   * NORMALISE une clÃ©: TOUJOURS CHAIN_UPPER:wallet_lower
   * Accepte n'importe quel format en entrÃ©e
   */
  function _normalizeKey(chain, wallet) {
    // Chain: toujours UPPERCASE, remplacer espaces par underscore
    var c = String(chain || "").toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");
    // Wallet: toujours lowercase
    var w = String(wallet || "").toLowerCase().trim();
    return c + ":" + w;
  }
  
  /**
   * Extrait le nom de chaÃ®ne normalisÃ© depuis config
   */
  function _getChainKey(config) {
    // PrioritÃ©: CHAIN.NAME > CHAIN_ID > "UNKNOWN"
    if (config && config.CHAIN && config.CHAIN.NAME) {
      return String(config.CHAIN.NAME).toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");
    }
    if (config && config.CHAIN_ID) {
      return String(config.CHAIN_ID).toUpperCase();
    }
    return "UNKNOWN";
  }
  
  function _load() {
    if (_cache !== null) return;
    try {
      var raw = PropertiesService.getScriptProperties().getProperty(ACTIVITY_CONFIG.STORAGE.NONCE_MAP);
      _cache = raw ? JSON.parse(raw) : {};
    } catch (e) {
      _cache = {};
    }
  }

  function _isCompact(entry) {
    if (!entry) return false;
    return entry.n !== undefined || entry.b !== undefined || entry.s !== undefined ||
           entry.lc !== undefined || entry.la !== undefined || entry.hb !== undefined ||
           entry.vm !== undefined;
  }

  function _toCompact(entry) {
    if (!entry) return {};
    if (_isCompact(entry)) {
      return {
        n: entry.n,
        b: entry.b,
        s: entry.s,
        lc: entry.lc,
        la: entry.la,
        hb: entry.hb,
        vm: entry.vm
      };
    }
    return {
      n: entry.nonce,
      lc: entry.lastCheck,
      la: entry.lastActivity
    };
  }

  function _toLegacyView(entry) {
    var compact = _toCompact(entry);
    return {
      nonce: compact.n,
      lastCheck: compact.lc,
      lastActivity: compact.la,
      prevNonce: entry ? entry.prevNonce : undefined,
      n: compact.n,
      b: compact.b,
      s: compact.s,
      lc: compact.lc,
      la: compact.la,
      hb: compact.hb,
      vm: compact.vm
    };
  }

  function _entryLastCheck(entry) {
    if (!entry) return 0;
    return entry.lc || entry.lastCheck || 0;
  }

  function _isValidBalanceString(value) {
    return value !== null && value !== undefined && String(value) !== "";
  }

  function _isZeroBalanceString(value) {
    if (!_isValidBalanceString(value)) return false;
    var s = String(value).toLowerCase();
    return s === "0" || s === "0x0" || /^0x0+$/.test(s) || /^0+$/.test(s);
  }

  function _getChainKeyFromInput(chainOrConfig) {
    if (typeof chainOrConfig === "object" && chainOrConfig !== null) {
      return _getChainKey(chainOrConfig);
    }
    return String(chainOrConfig || "").toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");
  }
  
  function _save() {
    if (!_dirty || !_cache) return;
    try {
      // Nettoyer les entrÃ©es trop vieilles
      var cutoff = Date.now() - (ACTIVITY_CONFIG.MAX_AGE_DAYS * 86400000);
      var clean = {};
      for (var k in _cache) {
        if (_cache[k] && _entryLastCheck(_cache[k]) > cutoff) {
          clean[k] = _cache[k];
        }
      }
      PropertiesService.getScriptProperties().setProperty(
        ACTIVITY_CONFIG.STORAGE.NONCE_MAP,
        JSON.stringify(clean)
      );
      _dirty = false;
    } catch (e) {
      // v4.15.100: Stop retry loop — if storage is full, don't keep retrying
      // in the same execution. Next watchdog cycle will retry.
      _dirty = false;
      Logger.log("[ActivityTracker] Save error: " + e);
    }
  }
  
  return {
    /**
     * Obtenir les infos d'activitÃ© pour un wallet
     * @param {string|Object} chainOrConfig - Nom de chaÃ®ne OU objet config
     * @param {string} wallet - Adresse du wallet
     * @returns {Object|null} {nonce, lastCheck, lastActivity, prevNonce}
     */
    getInfo: function(chainOrConfig, wallet) {
      _load();
      
      var chainKey = _getChainKeyFromInput(chainOrConfig);
      var key = _normalizeKey(chainKey, wallet);
      var entry = _cache[key];
      if (!entry) return null;
      if (!_isCompact(entry)) {
        _cache[key] = _toCompact(entry); // lazy in-memory migration; persisted on next updateSignals()
        entry = _cache[key];
      }
      return _toLegacyView(entry);
    },
    
    /**
     * Mettre Ã  jour le nonce d'un wallet
     * @returns {boolean} true si activitÃ© dÃ©tectÃ©e (nonce changÃ©)
     */
    updateSignals: function(chainOrConfig, wallet, signals) {
      _load();
      signals = signals || {};

      var chainKey = _getChainKeyFromInput(chainOrConfig);
      var key = _normalizeKey(chainKey, wallet);
      var entry = _toCompact(_cache[key] || {});
      var nowMs = Date.now();
      var hasActivity = false;

      if (signals.n !== undefined) {
        hasActivity = hasActivity || (entry.n !== null && entry.n !== undefined && signals.n !== entry.n);
        entry.n = signals.n;
      }

      if (signals.s !== undefined) {
        hasActivity = hasActivity || (entry.s !== null && entry.s !== undefined && signals.s !== entry.s);
        entry.s = signals.s;
      }

      if (signals.b !== undefined && signals.b !== null) {
        var newBalance = String(signals.b);
        if (!(_isValidBalanceString(entry.b) && !_isZeroBalanceString(entry.b) && _isZeroBalanceString(newBalance))) {
          hasActivity = hasActivity || (_isValidBalanceString(entry.b) && newBalance !== String(entry.b));
          entry.b = newBalance;
        }
      }

      if (signals.lc !== undefined) entry.lc = signals.lc;
      else entry.lc = nowMs;

      if (signals.la !== undefined) entry.la = signals.la;
      else if (hasActivity) entry.la = nowMs;

      if (signals.hb !== undefined) entry.hb = signals.hb;
      if (signals.vm !== undefined) entry.vm = signals.vm;

      _cache[key] = entry;
      _dirty = true;
      _save();

      return hasActivity;
    },

    updateNonce: function(chainOrConfig, wallet, newNonce) {
      return this.updateSignals(chainOrConfig, wallet, { n: newNonce, lc: Date.now() });
    },
    
    /**
     * VÃ©rifier si activitÃ© rÃ©cente (< 5 min)
     */
    hasRecentActivity: function(chainOrConfig, wallet) {
      var info = this.getInfo(chainOrConfig, wallet);
      if (!info || !info.lastActivity) return false;
      return (Date.now() - info.lastActivity) < ACTIVITY_CONFIG.ACTIVITY_WINDOW_MS;
    },
    
    /**
     * Obtenir tous les wallets avec activitÃ© rÃ©cente
     */
    getActiveWallets: function() {
      _load();
      var active = [];
      var cutoff = Date.now() - ACTIVITY_CONFIG.ACTIVITY_WINDOW_MS;
      
      for (var key in _cache) {
        var entry = _cache[key];
        if (entry && !_isCompact(entry)) {
          _cache[key] = _toCompact(entry);
          entry = _cache[key];
        }
        if (entry && entry.la && entry.la > cutoff) {
          var parts = key.split(":");
          active.push({
            chain: parts[0],
            wallet: parts[1],
            lastActivity: entry.la,
            nonce: entry.n,
            signature: entry.s,
            balance: entry.b
          });
        }
      }
      return active;
    },
    
    /**
     * Obtenir tous les wallets trackÃ©s
     */
    getAllTracked: function() {
      _load();
      var all = [];
      for (var key in _cache) {
        var parts = key.split(":");
        var entry = _cache[key];
        if (entry && !_isCompact(entry)) {
          _cache[key] = _toCompact(entry);
          entry = _cache[key];
        }
        all.push({
          chain: parts[0],
          wallet: parts[1],
          nonce: entry.n,
          lastCheck: entry.lc,
          lastActivity: entry.la,
          balance: entry.b,
          signature: entry.s,
          heartbeat: entry.hb,
          vm: entry.vm
        });
      }
      return all;
    },
    
    /**
     * Nombre total de wallets trackÃ©s
     */
    count: function() {
      _load();
      return Object.keys(_cache).length;
    },

    stats: function() {
      _load();
      var stats = { total: 0, oldFormat: 0, newFormat: 0, withBalance: 0, withSignature: 0 };
      for (var key in _cache) {
        if (!_cache.hasOwnProperty(key)) continue;
        var entry = _cache[key];
        stats.total++;
        if (_isCompact(entry)) stats.newFormat++;
        else stats.oldFormat++;
        if (entry && entry.b !== undefined && entry.b !== null && String(entry.b) !== "") stats.withBalance++;
        if (entry && entry.s !== undefined && entry.s !== null && String(entry.s) !== "") stats.withSignature++;
      }
      return stats;
    },
    
    /**
     * Forcer le rechargement depuis le storage
     */
    reload: function() {
      _cache = null;
      _dirty = false;
      _load();
    },
    
    /**
     * Vider complÃ¨tement le cache
     */
    clear: function() {
      _cache = {};
      _dirty = true;
      _save();
    },
    
    // Exposer la normalisation pour debug
    _normalizeKey: _normalizeKey,
    _getChainKey: _getChainKey
  };
})();

/**
 * Phase C: compact ActivityTracker storage stats.
 * @returns {Object} {total, oldFormat, newFormat, withBalance, withSignature}
 */
function ACTIVITY_TRACKER_STATS() {
  var stats = { total: 0, oldFormat: 0, newFormat: 0, withBalance: 0, withSignature: 0 };
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(ACTIVITY_CONFIG.STORAGE.NONCE_MAP);
    var map = raw ? JSON.parse(raw) : {};
    for (var key in map) {
      if (!map.hasOwnProperty(key)) continue;
      var entry = map[key];
      var isNew = !!(entry && (
        entry.n !== undefined || entry.b !== undefined || entry.s !== undefined ||
        entry.lc !== undefined || entry.la !== undefined || entry.hb !== undefined ||
        entry.vm !== undefined
      ));
      stats.total++;
      if (isNew) stats.newFormat++;
      else stats.oldFormat++;
      if (entry && entry.b !== undefined && entry.b !== null && String(entry.b) !== "") stats.withBalance++;
      if (entry && entry.s !== undefined && entry.s !== null && String(entry.s) !== "") stats.withSignature++;
    }
  } catch (e) {}
  return stats;
}

function _activityNormalizeChainKey_(name) {
  return String(name || "").toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_").trim();
}

function _activityGetActiveLedgerChainSet_() {
  var set = {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return set;

   var recap = ss.getSheetByName("Recap Portfolio");
  if (recap) {
    var lastRow = recap.getLastRow();
    var lastCol = recap.getLastColumn();
    if (lastRow >= 2 && lastCol > 0) {
      var header = recap.getRange(1, 1, 1, lastCol).getValues()[0];
      var chainCol = -1;
      for (var h = 0; h < header.length; h++) {
        if (String(header[h]).trim() === "Chain") {
          chainCol = h + 1;
          break;
        }
      }
      if (chainCol > 0) {
        var values = recap.getRange(2, chainCol, lastRow - 1, 1).getValues();
        for (var r = 0; r < values.length; r++) {
          var recapKey = _activityNormalizeChainKey_(values[r][0]);
          if (recapKey) set[recapKey] = true;
        }
        if (Object.keys(set).length > 0) return set;
      }
    }
  }

  var sheets = ss.getSheets();
  var retired = (typeof LEDGER_RETIRED_NAMES !== "undefined") ? LEDGER_RETIRED_NAMES : {};

  for (var i = 0; i < sheets.length; i++) {
    var sheetName = sheets[i].getName();
    var lower = String(sheetName || "").toLowerCase();
    if (retired[lower]) continue;
    var sep = sheetName.lastIndexOf(" - ");
    if (sep < 0) continue;
    var chainName = sheetName.substring(sep + 3);
    var key = _activityNormalizeChainKey_(chainName);
    if (key) set[key] = true;
  }
  return set;
}

/**
 * Remove stale ActivityTracker entries for chains no longer present as Ledger sheets.
 * @param {boolean=} force Run even if the daily prune already ran.
 * @returns {Array} Diagnostic table.
 */
function PRUNE_ACTIVITY_NONCE_MAP_STALE(force) {
  var out = [["Metric", "Value"]];
  var props = PropertiesService.getScriptProperties();
  var nowMs = Date.now();
  var lastMs = parseInt(props.getProperty("ACTIVITY_PRUNE_LAST_MS") || "0", 10);

  if (!force && isFinite(lastMs) && lastMs > 0 && (nowMs - lastMs) < 24 * 3600000) {
    out.push(["Status", "SKIPPED_RECENT"]);
    out.push(["Last prune age min", Math.round((nowMs - lastMs) / 60000)]);
    return out;
  }

  var raw = props.getProperty(ACTIVITY_CONFIG.STORAGE.NONCE_MAP);
  if (!raw) {
    props.setProperty("ACTIVITY_PRUNE_LAST_MS", String(nowMs));
    out.push(["Status", "EMPTY"]);
    return out;
  }

  var activeChains = _activityGetActiveLedgerChainSet_();
  var activeCount = Object.keys(activeChains).length;
  if (activeCount === 0) {
    out.push(["Status", "NO_LEDGER_CHAINS"]);
    return out;
  }

  var map = JSON.parse(raw);
  var keys = Object.keys(map);
  var clean = {};
  var removed = [];

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var chain = _activityNormalizeChainKey_(String(key).split(":")[0] || "");
    if (activeChains[chain]) {
      clean[key] = map[key];
    } else {
      removed.push(key);
    }
  }

  if (removed.length > 0) {
    props.setProperty(ACTIVITY_CONFIG.STORAGE.NONCE_MAP, JSON.stringify(clean));
    ActivityTracker.reload();
  }
  props.setProperty("ACTIVITY_PRUNE_LAST_MS", String(nowMs));

  out.push(["Status", "OK"]);
  out.push(["Active ledger chains", activeCount]);
  out.push(["Before", keys.length]);
  out.push(["Removed", removed.length]);
  out.push(["After", Object.keys(clean).length]);
  for (var r = 0; r < removed.length && r < 20; r++) {
    out.push(["Removed " + (r + 1), removed[r]]);
  }
  if (removed.length > 20) out.push(["Removed more", removed.length - 20]);
  return out;
}

// ============================================================
// FORCE REFRESH FLAGS
// ============================================================

var ForceRefreshManager = {
  /**
   * Normalize chain key: ALWAYS uppercase + underscores (matches ActivityTracker._normalizeKey)
   * "Arbitrum One" → "ARBITRUM_ONE", "ARBITRUM_ONE" → "ARBITRUM_ONE"
   */
  _normalizeChain: function(chain) {
    return String(chain || "").toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");
  },

  /**
   * Marquer un wallet pour force refresh
   */
  set: function(chain, wallet, reason) {
    try {
      var key = ACTIVITY_CONFIG.STORAGE.FORCE_REFRESH_PREFIX +
                this._normalizeChain(chain) + "_" +
                String(wallet).toLowerCase().substring(0, 20);

      var data = {
        chain: this._normalizeChain(chain),
        wallet: String(wallet).toLowerCase(),
        requestedAt: Date.now(),
        reason: reason || "TX detected"
      };

      PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(data));
      Logger.log("[FORCE_REFRESH] SET " + key + " reason=" + (reason || "TX") + " requestedAt=" + data.requestedAt);
      return true;
    } catch (e) {
      Logger.log("[FORCE_REFRESH] SET FAILED " + String(chain) + "/" + String(wallet).substring(0,10) + ": " + e);
      return false;
    }
  },

  /**
   * Vérifier si force refresh demandé
   */
  check: function(chain, wallet) {
    try {
      var key = ACTIVITY_CONFIG.STORAGE.FORCE_REFRESH_PREFIX +
                this._normalizeChain(chain) + "_" +
                String(wallet).toLowerCase().substring(0, 20);

      var raw = PropertiesService.getScriptProperties().getProperty(key);
      if (!raw) {
        Logger.log("[FORCE_REFRESH] CHECK " + key + " — NOT FOUND");
        return null;
      }

      var data = JSON.parse(raw);
      // v4.15.2: Safety TTL only (2h) — real expiry is in BaseEngine when last_full_scan_ms > requestedAt
      if (Date.now() - data.requestedAt > 7200000) {
        PropertiesService.getScriptProperties().deleteProperty(key);
        Logger.log("[FORCE_REFRESH] EXPIRED " + key + " age=" + (Date.now() - data.requestedAt) + "ms");
        return null;
      }
      Logger.log("[FORCE_REFRESH] FOUND " + key + " age=" + (Date.now() - data.requestedAt) + "ms reason=" + (data.reason || "?"));
      return data;
    } catch (e) {
      Logger.log("[FORCE_REFRESH] CHECK FAILED " + String(chain) + "/" + String(wallet).substring(0,10) + ": " + e);
      return null;
    }
  },

  /**
   * Effacer le flag après refresh
   */
  clear: function(chain, wallet) {
    try {
      var key = ACTIVITY_CONFIG.STORAGE.FORCE_REFRESH_PREFIX +
                this._normalizeChain(chain) + "_" +
                String(wallet).toLowerCase().substring(0, 20);
      PropertiesService.getScriptProperties().deleteProperty(key);
      Logger.log("[FORCE_REFRESH] CLEAR " + key);
    } catch (e) {
      Logger.log("[FORCE_REFRESH] CLEAR FAILED " + String(chain) + "/" + String(wallet).substring(0,10) + ": " + e);
    }
  }
};

// ============================================================
// REFRESH INTERVAL CALCULATOR
// ============================================================

/**
 * Calculer l'intervalle de refresh optimal
 * @param {string} chainName - Nom de la chaÃ®ne
 * @param {string} wallet - Adresse wallet
 * @param {number} valueEur - Valeur totale en EUR
 * @param {number} cacheAgeMs - Age du cache en ms
 * @returns {Object} { name, reason, interval }
 */
function calculateRefreshInterval(chainName, wallet, valueEur, cacheAgeMs) {
  var interval = ACTIVITY_CONFIG.INTERVALS.LOW;
  var name = "LOW";
  var reason = "";
  
  // 1. Force refresh demandÃ©?
  var forceRefresh = ForceRefreshManager.check(chainName, wallet);
  if (forceRefresh) {
    return { 
      name: "FORCE", 
      reason: forceRefresh.reason || "Force refresh", 
      interval: 0 
    };
  }
  
  // 2. ActivitÃ© rÃ©cente dÃ©tectÃ©e?
  if (ActivityTracker.hasRecentActivity(chainName, wallet)) {
    return { 
      name: "ACTIVE", 
      reason: "Recent transaction", 
      interval: ACTIVITY_CONFIG.INTERVALS.ACTIVE 
    };
  }
  
  // 3. BasÃ© sur la valeur
  if (valueEur >= ACTIVITY_CONFIG.THRESHOLDS.HIGH) {
    interval = ACTIVITY_CONFIG.INTERVALS.HIGH_VALUE;
    name = "HIGH";
    reason = "High value wallet";
  } else if (valueEur >= ACTIVITY_CONFIG.THRESHOLDS.MEDIUM) {
    interval = ACTIVITY_CONFIG.INTERVALS.MEDIUM;
    name = "MEDIUM";
    reason = "Medium value wallet";
  } else if (valueEur >= ACTIVITY_CONFIG.THRESHOLDS.LOW) {
    interval = ACTIVITY_CONFIG.INTERVALS.LOW;
    name = "LOW";
    reason = "Low value wallet";
  } else {
    interval = ACTIVITY_CONFIG.INTERVALS.HIBERNATED;
    name = "HIBERNATED";
    reason = "Dust wallet";
  }
  
  // 4. VÃ©rifier si refresh nÃ©cessaire
  if (cacheAgeMs === null || cacheAgeMs === undefined) {
    return { name: "NORMAL", reason: "Refresh due", interval: interval };
  }
  if (cacheAgeMs < interval) {
    return { name: "SKIP", reason: "Fresh cache", interval: interval };
  }
  
  return { name: name, reason: reason, interval: interval };
}

// ============================================================
// ACTIVITY MARKER FETCHING - Multi-VM
// EVM: nonce (eth_getTransactionCount)
// SVM: latest tx signature (getSignaturesForAddress)
// Cosmos: account sequence (/cosmos/auth/v1beta1/accounts/)
// ============================================================

/**
 * Fetch nonce for a single EVM wallet (legacy, kept for compatibility)
 */
function fetchEvmNonce(wallet, rpcUrl) {
  if (!_activityCanFetch_("activity-evm-nonce")) return null;
  try {
    var payload = {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionCount",
      params: [wallet, "latest"]
    };

    var response = UrlFetchApp.fetch(rpcUrl, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var json = JSON.parse(response.getContentText());
    if (json.result) {
      return parseInt(json.result, 16);
    }
  } catch (e) {}
  return null;
}

function _activityGetChainConfig_(chainName) {
  try {
    if (typeof ChainFactory === "undefined" || !ChainFactory.getRegistry) return null;
    var registry = ChainFactory.getRegistry() || {};
    var key = String(chainName || "").toUpperCase().replace(/[\s-]+/g, "_");
    var api = registry[key] || registry[String(chainName || "").toUpperCase()];
    if (api && typeof api.getConfig === "function") return api.getConfig();
  } catch (e) {}
  return null;
}

function fetchEvmExplorerActivityBatch(items) {
  var results = {};
  if (!items || !items.length) return results;

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (!item || !item.chain || !item.wallet) continue;
    var key = String(item.chain).toUpperCase() + ":" + String(item.wallet).toLowerCase();
    results[key] = null;

    var cfg = _activityGetChainConfig_(item.chain);
    var explorer = cfg && cfg.ACTIVITY_EXPLORER;
    if (!explorer || String(explorer.TYPE || explorer.type || "").toLowerCase() !== "blockscout") continue;
    if (!_activityCanFetch_("activity-evm-explorer-blockscout")) continue;

    var base = String(explorer.BASE_URL || explorer.baseUrl || "").replace(/\/+$/, "");
    var path = String(explorer.TX_PATH || explorer.txPath || "/api/v2/addresses/{address}/transactions");
    if (!base) continue;

    var url = base + path.replace("{address}", encodeURIComponent(item.wallet));
    try {
      var resp = UrlFetchApp.fetch(url, {
        method: "get",
        headers: { "accept": "application/json", "user-agent": "Mozilla/5.0 (AppsScript; +https://script.google.com)" },
        muteHttpExceptions: true
      });
      if (!resp || resp.getResponseCode() !== 200) continue;
      var json = JSON.parse(resp.getContentText());
      var tx = json && json.items && json.items.length ? json.items[0] : null;
      var marker = tx && (tx.hash || tx.transaction_hash || tx.timestamp || tx.block);
      if (marker) results[key] = "explorer:" + String(marker);
    } catch (eFetchExplorer) {}
  }

  return results;
}

/**
 * v4.13.6: BATCH nonce fetch - groups wallets by RPC, sends JSON-RPC batch arrays
 *
 * JSON-RPC batch spec: send an array of requests, get an array of responses.
 * Example: POST to RPC with [{jsonrpc:"2.0",id:1,...},{jsonrpc:"2.0",id:2,...}]
 *
 * @param {Array} items - Array of {chain, wallet, rpc} objects
 * @returns {Object} Map of "CHAIN:wallet" -> nonce (number) or null
 *
 * HTTP savings: N wallets across M RPCs = M HTTP calls instead of N
 * Typical: 20 wallets across 3-5 RPCs = 3-5 calls instead of 20
 */
function fetchEvmNonceBatch(items, oldNonceMap) {
  var results = {};
  if (!items || items.length === 0) return results;
  if (!_activityCanFetch_("activity-evm-nonce-batch")) return results;

  // v4.15.40: Track per-RPC-per-wallet raw results for stale detection
  var perRpcResults = {}; // key -> { rpcUrl: nonce, ... }
  oldNonceMap = oldNonceMap || {};

  // Step 1: Group wallets by RPC endpoint
  var byRpc = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || !it.rpc || !it.wallet) continue;

    var rpc = it.rpc;
    if (!byRpc[rpc]) byRpc[rpc] = [];
    byRpc[rpc].push({
      chain: it.chain,
      wallet: it.wallet,
      key: String(it.chain).toUpperCase() + ":" + String(it.wallet).toLowerCase()
    });
  }

  // Step 2: For each RPC, build a JSON-RPC batch and send 1 HTTP call
  var rpcUrls = Object.keys(byRpc);

  // Use UrlFetchApp.fetchAll to parallelize across RPCs
  var fetchRequests = [];
  var rpcMeta = []; // track which RPC/wallets map to which fetch index

  for (var r = 0; r < rpcUrls.length; r++) {
    var rpcUrl = rpcUrls[r];
    var wallets = byRpc[rpcUrl];

    // Build JSON-RPC batch payload
    var batchPayload = [];
    for (var w = 0; w < wallets.length; w++) {
      batchPayload.push({
        jsonrpc: "2.0",
        id: w + 1,
        method: "eth_getTransactionCount",
        params: [wallets[w].wallet, "latest"]
      });
    }

    fetchRequests.push({
      url: rpcUrl,
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(batchPayload),
      muteHttpExceptions: true
    });

    rpcMeta.push({
      rpcUrl: rpcUrl,
      wallets: wallets
    });
  }

  // Step 3: Execute all RPC batch calls in parallel
  var responses;
  if (!_activityCanFetch_("activity-evm-nonce-fetchAll")) return results;
  try {
    responses = UrlFetchApp.fetchAll(fetchRequests);
  } catch (e) {
    // fetchAll failed entirely - fallback to individual calls per RPC
    responses = [];
    for (var f = 0; f < fetchRequests.length; f++) {
      try {
        if (!_activityCanFetch_("activity-evm-nonce-fallback")) { responses.push(null); continue; }
        responses.push(UrlFetchApp.fetch(fetchRequests[f].url, fetchRequests[f]));
      } catch (e2) {
        responses.push(null);
      }
    }
  }

  // Step 4: Parse batch responses and map back to wallets
  for (var p = 0; p < responses.length; p++) {
    var meta = rpcMeta[p];
    var resp = responses[p];

    if (!resp) {
      // RPC completely failed - mark all its wallets as null
      for (var x = 0; x < meta.wallets.length; x++) {
        results[meta.wallets[x].key] = null;
      }
      continue;
    }

    try {
      var code = resp.getResponseCode();
      var body = resp.getContentText();
      var parsed = JSON.parse(body);

      if (code === 200 && Array.isArray(parsed)) {
        // Standard batch response: array of {id, result, error}
        // Build id -> result map for fast lookup
        var idMap = {};
        for (var j = 0; j < parsed.length; j++) {
          if (parsed[j] && parsed[j].id) {
            idMap[parsed[j].id] = parsed[j];
          }
        }

        for (var k = 0; k < meta.wallets.length; k++) {
          var entry = idMap[k + 1]; // ids are 1-based
          var wkey = meta.wallets[k].key;
          if (entry && entry.result) {
            var nonce = parseInt(entry.result, 16);
            results[wkey] = nonce;
            // v4.15.40: Track per-RPC result for stale detection
            if (!perRpcResults[wkey]) perRpcResults[wkey] = {};
            perRpcResults[wkey][meta.rpcUrl] = nonce;
          } else {
            results[wkey] = null;
            if (!perRpcResults[wkey]) perRpcResults[wkey] = {};
            perRpcResults[wkey][meta.rpcUrl] = null;
          }
        }
      } else if (code === 200 && parsed && parsed.result) {
        // Some RPCs don't support batch - returned single response
        // Fallback: only first wallet gets the result
        if (meta.wallets.length === 1) {
          results[meta.wallets[0].key] = parseInt(parsed.result, 16);
        } else {
          // Can't map single response to multiple wallets
          // Mark all as null - will be retried individually next run
          for (var s = 0; s < meta.wallets.length; s++) {
            results[meta.wallets[s].key] = null;
          }
        }
      } else {
        // Error response - mark all wallets for this RPC as null
        for (var m = 0; m < meta.wallets.length; m++) {
          results[meta.wallets[m].key] = null;
        }
      }
    } catch (e3) {
      // Parse error - mark all wallets for this RPC as null
      for (var n = 0; n < meta.wallets.length; n++) {
        results[meta.wallets[n].key] = null;
      }
    }
  }

  return results;
}

/**
 * v4.15.0: Fetch latest tx signature for SVM wallets (Solana, Fogo)
 * Uses getSignaturesForAddress with limit=1 — returns the latest tx signature.
 * Solana JSON-RPC does NOT support batch arrays, so we use fetchAll for parallelism.
 *
 * @param {Array} items - Array of {chain, wallet, rpc} objects
 * @returns {Object} Map of "CHAIN:wallet" -> signature (string) or null
 */
function fetchSvmSignatureBatch(items) {
  var results = {};
  if (!items || items.length === 0) return results;
  if (!_activityCanFetch_("activity-svm-signature-batch")) return results;

  var fetchRequests = [];
  var meta = [];

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || !it.rpc || !it.wallet) continue;

    var key = String(it.chain).toUpperCase() + ":" + String(it.wallet).toLowerCase();
    var payload = {
      jsonrpc: "2.0", id: 1,
      method: "getSignaturesForAddress",
      params: [it.wallet, { limit: 1 }]
    };

    fetchRequests.push({
      url: it.rpc,
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    meta.push({ key: key, chain: it.chain, wallet: it.wallet });
  }

  if (fetchRequests.length === 0) return results;

  var responses;
  if (!_activityCanFetch_("activity-svm-signature-fetchAll")) return results;
  try {
    responses = UrlFetchApp.fetchAll(fetchRequests);
  } catch (e) {
    for (var f = 0; f < meta.length; f++) results[meta[f].key] = null;
    return results;
  }

  for (var r = 0; r < responses.length; r++) {
    var m = meta[r];
    try {
      var resp = responses[r];
      if (!resp || resp.getResponseCode() !== 200) { results[m.key] = null; continue; }
      var json = JSON.parse(resp.getContentText());
      if (json.result && Array.isArray(json.result) && json.result.length > 0) {
        // Use signature as activity marker (string, ~88 chars base58)
        results[m.key] = json.result[0].signature || null;
      } else {
        // No transactions found — use "0" as marker (new/empty wallet)
        results[m.key] = "0";
      }
    } catch (e2) {
      results[m.key] = null;
    }
  }

  return results;
}

/**
 * v4.15.0: Fetch account sequence for Cosmos wallets
 * Uses /cosmos/auth/v1beta1/accounts/{address} REST endpoint.
 * Account sequence increments with each outgoing tx (like EVM nonce).
 *
 * @param {Array} items - Array of {chain, wallet, rpc} where rpc is REST_URL
 * @returns {Object} Map of "CHAIN:wallet" -> sequence (number) or null
 */
function fetchCosmosSequenceBatch(items) {
  var results = {};
  if (!items || items.length === 0) return results;
  if (!_activityCanFetch_("activity-cosmos-sequence-batch")) return results;

  var fetchRequests = [];
  var meta = [];

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || !it.rpc || !it.wallet) continue;

    var key = String(it.chain).toUpperCase() + ":" + String(it.wallet).toLowerCase();
    var restUrl = it.rpc.replace(/\/$/, "");

    fetchRequests.push({
      url: restUrl + "/cosmos/auth/v1beta1/accounts/" + it.wallet,
      method: "get",
      muteHttpExceptions: true
    });
    meta.push({ key: key, chain: it.chain, wallet: it.wallet });
  }

  if (fetchRequests.length === 0) return results;

  var responses;
  if (!_activityCanFetch_("activity-cosmos-sequence-fetchAll")) return results;
  try {
    responses = UrlFetchApp.fetchAll(fetchRequests);
  } catch (e) {
    for (var f = 0; f < meta.length; f++) results[meta[f].key] = null;
    return results;
  }

  for (var r = 0; r < responses.length; r++) {
    var m = meta[r];
    try {
      var resp = responses[r];
      if (!resp || resp.getResponseCode() !== 200) { results[m.key] = null; continue; }
      var json = JSON.parse(resp.getContentText());

      // Handle standard Cosmos account types
      var account = json.account || json;
      // Some chains wrap in base_account (e.g., Injective EthAccount)
      if (account.base_account) account = account.base_account;
      // Vesting accounts also wrap in base_account
      if (account.base_vesting_account && account.base_vesting_account.base_account) {
        account = account.base_vesting_account.base_account;
      }

      var seq = parseInt(account.sequence || "0", 10);
      results[m.key] = isNaN(seq) ? 0 : seq;
    } catch (e2) {
      results[m.key] = null;
    }
  }

  return results;
}

function _activityStrictMajorityValue_(votes, total) {
  if (!votes || votes.length === 0 || total <= 0) return null;
  var counts = {};
  var originals = {};
  for (var i = 0; i < votes.length; i++) {
    if (votes[i] === null || votes[i] === undefined) continue;
    var original = String(votes[i]);
    var key = original.toLowerCase();
    counts[key] = (counts[key] || 0) + 1;
    if (originals[key] === undefined) originals[key] = original;
  }
  for (var v in counts) {
    if (counts[v] * 2 > total) return originals[v];
  }
  return null;
}

/**
 * Phase C: Fetch EVM native balances with strict majority consensus.
 * @param {Array} items - Array of {chain, wallet}
 * @returns {Object} Map of "CHAIN:wallet" -> raw hex string or null
 */
function fetchEvmNativeBalanceBatch(items) {
  var results = {};
  if (!items || items.length === 0) return results;

  var byChain = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || !it.chain || !it.wallet) continue;
    var chainKey = String(it.chain).toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");
    if (!byChain[chainKey]) byChain[chainKey] = [];
    byChain[chainKey].push({
      chain: chainKey,
      wallet: it.wallet,
      key: chainKey + ":" + String(it.wallet).toLowerCase()
    });
  }

  var fetchRequests = [];
  var meta = [];
  var votesByKey = {};
  var totalsByKey = {};

  for (var chain in byChain) {
    if (!byChain.hasOwnProperty(chain)) continue;
    var rpcs = _RpcLookup.getRpcs(chain).slice(0, 3);
    var wallets = byChain[chain];
    for (var w0 = 0; w0 < wallets.length; w0++) {
      votesByKey[wallets[w0].key] = [];
      totalsByKey[wallets[w0].key] = rpcs.length;
    }
    if (rpcs.length === 0) continue;

    for (var r = 0; r < rpcs.length; r++) {
      var batchPayload = [];
      for (var w = 0; w < wallets.length; w++) {
        batchPayload.push({
          jsonrpc: "2.0",
          id: w + 1,
          method: "eth_getBalance",
          params: [wallets[w].wallet, "latest"]
        });
      }
      fetchRequests.push({
        url: rpcs[r],
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(batchPayload),
        muteHttpExceptions: true
      });
      meta.push({ wallets: wallets });
    }
  }

  if (fetchRequests.length > 0) {
    if (!_activityCanFetch_("activity-evm-native-balance")) return results;
    try {
      var responses = UrlFetchApp.fetchAll(fetchRequests);
      for (var p = 0; p < responses.length; p++) {
        var resp = responses[p];
        var m = meta[p];
        if (!resp || resp.getResponseCode() !== 200) continue;
        var parsed = JSON.parse(resp.getContentText());
        var idMap = {};
        if (Array.isArray(parsed)) {
          for (var j = 0; j < parsed.length; j++) {
            if (parsed[j] && parsed[j].id !== undefined) idMap[parsed[j].id] = parsed[j];
          }
        } else if (parsed && parsed.id !== undefined) {
          idMap[parsed.id] = parsed;
        }
        for (var k = 0; k < m.wallets.length; k++) {
          var entry = idMap[k + 1];
          if (entry && entry.result !== undefined && entry.result !== null) {
            votesByKey[m.wallets[k].key].push(String(entry.result));
          }
        }
      }
    } catch (e) {}
  }

  for (var outKey in totalsByKey) {
    if (!totalsByKey.hasOwnProperty(outKey)) continue;
    results[outKey] = _activityStrictMajorityValue_(votesByKey[outKey], totalsByKey[outKey]);
  }

  // v4.15.40: Stale RPC detection — compare per-RPC nonces with old cached value.
  // If a majority of RPCs return a new (higher) nonce but one RPC returns the old value,
  // flag that RPC as potentially stale.
  try {
    for (var rk in perRpcResults) {
      if (!perRpcResults.hasOwnProperty(rk)) continue;
      var oldNonce = oldNonceMap[rk];
      if (oldNonce == null || !isFinite(oldNonce)) continue;
      var rpcMap = perRpcResults[rk];
      var rpcUrls = Object.keys(rpcMap);
      if (rpcUrls.length < 2) continue; // need at least 2 RPCs to compare
      var freshCount = 0, staleCount = 0;
      for (var ri = 0; ri < rpcUrls.length; ri++) {
        var rUrl = rpcUrls[ri];
        var newVal = rpcMap[rUrl];
        if (newVal == null || !isFinite(newVal)) continue;
        if (newVal > oldNonce) {
          freshCount++;
        } else if (newVal === oldNonce) {
          staleCount++;
        }
      }
      // If majority found a HIGHER nonce → some RPCs are stale
      if (freshCount > 0 && freshCount > staleCount) {
        for (var rj = 0; rj < rpcUrls.length; rj++) {
          var rUrl2 = rpcUrls[rj];
          var newVal2 = rpcMap[rUrl2];
          if (newVal2 != null && isFinite(newVal2) && newVal2 === oldNonce) {
            try { if (typeof RpcHealth !== "undefined") RpcHealth.recordStaleHit(rUrl2); } catch (eSh) {}
          } else if (newVal2 != null && isFinite(newVal2) && newVal2 > oldNonce) {
            try { if (typeof RpcHealth !== "undefined") RpcHealth.recordFreshHit(rUrl2); } catch (eFh) {}
          }
        }
      }
    }
  } catch (eStale) {}

  return results;
}
/**
 * Phase C: Fetch SVM native balances.
 * @param {Array} items - Array of {chain, wallet}
 * @returns {Object} Map of "CHAIN:wallet" -> lamports decimal string or null
 */
function fetchSvmNativeBalanceBatch(items) {
  var results = {};
  if (!items || items.length === 0) return results;

  var fetchRequests = [];
  var meta = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || !it.chain || !it.wallet) continue;
    var rpcs = _RpcLookup.getRpcs(it.chain);
    var rpc = rpcs && rpcs.length > 0 ? rpcs[0] : null;
    var key = String(it.chain).toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_") + ":" + String(it.wallet).toLowerCase();
    results[key] = null;
    if (!rpc) continue;
    fetchRequests.push({
      url: rpc,
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [it.wallet, { commitment: "confirmed" }]
      }),
      muteHttpExceptions: true
    });
    meta.push({ key: key });
  }

  if (fetchRequests.length === 0) return results;

  if (!_activityCanFetch_("activity-svm-native-balance")) return results;
  try {
    var responses = UrlFetchApp.fetchAll(fetchRequests);
    for (var r = 0; r < responses.length; r++) {
      var resp = responses[r];
      if (!resp || resp.getResponseCode() !== 200) continue;
      var json = JSON.parse(resp.getContentText());
      if (json.result && json.result.value !== undefined && json.result.value !== null) {
        results[meta[r].key] = String(json.result.value);
      }
    }
  } catch (e) {}
  return results;
}

/**
 * Phase C: Fetch Cosmos native balances from bank REST balances.
 * @param {Array} items - Array of {chain, wallet}
 * @returns {Object} Map of "CHAIN:wallet" -> amount string or null
 */
function fetchCosmosNativeBalanceBatch(items) {
  var results = {};
  if (!items || items.length === 0) return results;

  var fetchRequests = [];
  var meta = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || !it.chain || !it.wallet) continue;
    var rest = _RpcLookup.getRest(it.chain);
    var key = String(it.chain).toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_") + ":" + String(it.wallet).toLowerCase();
    results[key] = null;
    if (!rest) continue;
    rest = rest.replace(/\/$/, "");
    fetchRequests.push({
      url: rest + "/cosmos/bank/v1beta1/balances/" + it.wallet,
      method: "get",
      muteHttpExceptions: true
    });
    meta.push({ key: key });
  }

  if (fetchRequests.length === 0) return results;

  if (!_activityCanFetch_("activity-cosmos-native-balance")) return results;
  try {
    var responses = UrlFetchApp.fetchAll(fetchRequests);
    for (var r = 0; r < responses.length; r++) {
      var resp = responses[r];
      if (!resp || resp.getResponseCode() !== 200) continue;
      var json = JSON.parse(resp.getContentText());
      var balances = json.balances || [];
      for (var b = 0; b < balances.length; b++) {
        var denom = String(balances[b].denom || "");
        if (denom.indexOf("ibc/") !== 0) {
          meta[r] && (results[meta[r].key] = String(balances[b].amount || "0"));
          break;
        }
      }
    }
  } catch (e) {}
  return results;
}

/**
 * Diagnostic native balance fetch for one wallet.
 */
function DIAG_NATIVE_BALANCE_ONE(chain, wallet) {
  if (!chain || !wallet) {
    console.log("[DIAG_NATIVE_BALANCE_ONE] Usage: DIAG_NATIVE_BALANCE_ONE('BASE','0x...')");
    return null;
  }
  var vm = _RpcLookup.getVm(chain);
  var out;
  if (vm === "SVM") out = fetchSvmNativeBalanceBatch([{ chain: chain, wallet: wallet }]);
  else if (vm === "COSMOS") out = fetchCosmosNativeBalanceBatch([{ chain: chain, wallet: wallet }]);
  else out = fetchEvmNativeBalanceBatch([{ chain: chain, wallet: wallet }]);

  var key = String(chain).toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_") + ":" + String(wallet).toLowerCase();
  var value = out.hasOwnProperty(key) ? out[key] : null;
  console.log("[DIAG_NATIVE_BALANCE_ONE] " + chain + " " + wallet + " vm=" + vm + " balance=" + value);
  return value;
}

// ============================================================
// BUILD RPC LOOKUP - v4.12.22 CRITICAL
// Scans all chain objects and stores their RPCs
// ============================================================

/**
 * Build and save RPC lookup table from all _CHAIN objects
 * Run this ONCE after deploying or when adding new chains
 * @customfunction
 */
function BUILD_RPC_LOOKUP() {
  var out = [["Chain", "RPC", "VM", "Status"]];
  var success = 0, errors = 0, skipped = 0;

  // v4.15.42: Use ChainFactory registry instead of eval()
  // This makes BUILD_RPC_LOOKUP() runnable in trigger context (no eval dependency)
  var registry = {};
  try {
    if (typeof ChainFactory !== "undefined" && ChainFactory.getRegistry) {
      registry = ChainFactory.getRegistry() || {};
    }
  } catch (eReg) {}

  // Fallback to hardcoded list only if registry is empty (should not happen)
  var chainNames = Object.keys(registry);
  if (chainNames.length === 0) {
    chainNames = [
      "ABSTRACT","ANCIENT8","APECHAIN","APPCHAIN","ARBITRUM_NOVA","ARBITRUM_ONE",
      "ASTAR","AURORA","AVALANCHE","B2","B3","BASE","BEAM","BERACHAIN",
      "BITLAYER","BLAST","BOB","BOBA","BOTANIX","BSC","CAMP","CELO",
      "CITREA","CORN","COSMOS_HUB","CRONOS","CYBER","DBK_CHAIN","DOMA","DUCKCHAIN",
      "ETHEREUM","ETHERLINK","FLARE","FLOW","FOGO","FRAXTAL","FUSE","GEB",
      "GNOSIS","GRAVITY","HASHKEY","HEMI","HYPEREVM","IMMUTABLE","INJECTIVE",
      "INK","INTUITION","KAIA","KATANA","KCC","LINEA","LISK","MANTA_PACIFIC",
      "MANTLE","MATCHAIN","MEGAETH","MERLIN","METAL_L2","METIS","MEZO",
      "MITOSIS","MODE","MONAD","MOONBEAM","MOONRIVER","MORPH","OPBNB",
      "OPENLEDGER","OPTIMISM","OSMOSIS","PLASMA","PLUME","POLYGON","POLYGON_ZKEVM",
      "POLYNOMIAL","PULSECHAIN","RACE","REYA","RONIN",
      "ROOTSTOCK","SCROLL","SEI","SHAPE","SHIBARIUM","SOLANA","SOMNIA",
      "SONEIUM","SONIC","STABLE","STORY","SUPERPOSITION","SUPERSEED","SWAN",
      "SWELLCHAIN","SYNDICATE_COMMONS","TAC","TAIKO_ALETHIA","TERRA","UNICHAIN",
      "VANA","WORLDCHAIN","X_LAYER","XRPLEVM","ZETACHAIN","ZIRCUIT",
      "ZKLINKNOVA","ZKSYNC_ERA","ZORA"
    ];
  }

  for (var i = 0; i < chainNames.length; i++) {
    var name = chainNames[i];
    var chainObj = null;

    try {
      if (registry[name] && typeof registry[name].getConfig === "function") {
        chainObj = registry[name];
      } else {
        // Fallback for hardcoded list: try eval only in editor context
        try { chainObj = eval("_" + name); } catch (eEval) {}
      }

      if (!chainObj || typeof chainObj.getConfig !== "function") {
        skipped++;
        continue;
      }

      var cfg = chainObj.getConfig();
      if (!cfg) {
        skipped++;
        continue;
      }

      var vm = cfg.VM || cfg.vm || "EVM";
      var rpc = null;
      var extraRpcs = [];
      if (cfg.RPC && cfg.RPC.ENDPOINTS && cfg.RPC.ENDPOINTS.length > 0) {
        rpc = cfg.RPC.ENDPOINTS[0];
        extraRpcs = cfg.RPC.ENDPOINTS.slice(1, 3);
      } else if (cfg.API && cfg.API.REST_URL) {
        rpc = cfg.API.REST_URL;
      } else if (cfg.REST && cfg.REST.ENDPOINTS && cfg.REST.ENDPOINTS.length > 0) {
        rpc = cfg.REST.ENDPOINTS[0];
        extraRpcs = cfg.REST.ENDPOINTS.slice(1, 3);
      }

      if (!rpc) {
        out.push([name, "-", vm, "NO RPC"]);
        errors++;
        continue;
      }

      _RpcLookup.set(name, rpc, vm, extraRpcs);
      out.push([name, rpc.substring(0, 40) + "...", vm, "OK"]);
      success++;

    } catch (e) {
      out.push([name, "-", "-", "ERROR: " + String(e.message || e).substring(0, 30)]);
      errors++;
    }
  }

  out.push(["", "", "", ""]);
  out.push(["SUMMARY", success + " OK", errors + " errors", skipped + " skipped"]);
  out.push(["TOTAL", _RpcLookup.count() + " chains in lookup", "", ""]);

  return out;
}

function _repairRpcLookupEntryFromConfig_(name, api, out) {
  try {
    if (!api || typeof api.getConfig !== "function") return false;
    var cfg = api.getConfig();
    if (!cfg) return false;
    var vm = cfg.VM || cfg.vm || api.type || "EVM";
    var rpc = null;
    var extraRpcs = [];
    if (cfg.RPC && cfg.RPC.ENDPOINTS && cfg.RPC.ENDPOINTS.length > 0) {
      rpc = cfg.RPC.ENDPOINTS[0];
      extraRpcs = cfg.RPC.ENDPOINTS.slice(1, 3);
    } else if (cfg.API && cfg.API.REST_URL) {
      rpc = cfg.API.REST_URL;
      vm = "COSMOS";
    } else if (cfg.REST && cfg.REST.ENDPOINTS && cfg.REST.ENDPOINTS.length > 0) {
      rpc = cfg.REST.ENDPOINTS[0];
      extraRpcs = cfg.REST.ENDPOINTS.slice(1, 3);
      vm = "COSMOS";
    }
    if (!rpc) return false;
    _RpcLookup.set(name, rpc, vm, extraRpcs);
    if (out) out.push([name, rpc.substring(0, 50), vm, "REPAIRED"]);
    return true;
  } catch (e) {
    if (out) out.push([name, "-", "-", "ERROR: " + String(e.message || e).substring(0, 60)]);
    return false;
  }
}

function REPAIR_RPC_LOOKUP_FROM_REGISTRY(force) {
  var out = [["Chain", "RPC", "VM", "Status"]];
  var repaired = 0;
  var skipped = 0;
  try {
    if (typeof ChainFactory === "undefined" || !ChainFactory.getRegistry) {
      out.push(["ERROR", "ChainFactory registry unavailable", "", ""]);
      return out;
    }
    var registry = ChainFactory.getRegistry() || {};
    if (force === true && _RpcLookup && _RpcLookup.clear) {
      _RpcLookup.clear();
      out.push(["RESET", "cleared", "", "OK"]);
    }
    var all = _RpcLookup.getAll ? _RpcLookup.getAll() : {};
    for (var name in registry) {
      if (!registry.hasOwnProperty(name)) continue;
      var key = String(name || "").toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");
      if (!force && all && all[key]) { skipped++; continue; }
      if (_repairRpcLookupEntryFromConfig_(key, registry[name], out)) repaired++;
      else skipped++;
    }
  } catch (e) {
    out.push(["ERROR", String(e.message || e), "", ""]);
  }
  out.push(["SUMMARY", repaired + " repaired", skipped + " skipped", "repair-rpc-lookup-registry"]);
  out.push(["TOTAL", _RpcLookup.count() + " chains in lookup", "", ""]);
  return out;
}

function _repairRpcLookupIfMissing_(chain) {
  try {
    if (_RpcLookup.get(chain)) return false;
    if (typeof ChainFactory === "undefined" || !ChainFactory.getRegistry) return false;
    var registry = ChainFactory.getRegistry() || {};
    var key = String(chain || "").toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");
    var repaired = _repairRpcLookupEntryFromConfig_(key, registry[key], null);
    if (repaired) Logger.log("[RpcLookup] repair-rpc-lookup-registry repaired " + key);
    return repaired;
  } catch (e) {
    return false;
  }
}

/**
 * Show current RPC lookup table
 * @customfunction
 */
function SHOW_RPC_LOOKUP() {
  var out = [["Chain", "RPC", "VM", "Updated"]];
  var all = _RpcLookup.getAll();
  
  for (var chain in all) {
    var entry = all[chain];
    var updated = entry.updated ? new Date(entry.updated).toISOString().substring(0, 19) : "-";
    out.push([chain, entry.rpc ? entry.rpc.substring(0, 50) : "-", entry.vm || "?", updated]);
  }
  
  out.push(["", "", "", ""]);
  out.push(["TOTAL", _RpcLookup.count() + " chains", "", ""]);
  
  return out;
}

// ============================================================
// INITIALISATION DES NONCES
// ============================================================

/**
 * Initialiser/Mettre Ã  jour les nonces pour tous les wallets EVM dÃ©jÃ  trackÃ©s
 * Utilise ActivityTracker.getAllTracked() - les wallets sont dÃ©jÃ  connus!
 * @customfunction
 */
function INIT_ALL_NONCES() {
  var out = [["Chain", "Wallet", "Old Nonce", "New Nonce", "Status"]];
  var startMs = Date.now();
  var success = 0, errors = 0, skipped = 0;

  try {
    // Ensure RPC lookup is built
    if (_RpcLookup.count() === 0) {
      out.push(["ERROR", "RPC lookup empty", "", "", "Run BUILD_RPC_LOOKUP() manually from Apps Script editor"]);
      return out;
    }
    out.push(["INFO", "RPC lookup: " + _RpcLookup.count() + " chains", "", "", ""]);

    try {
      var pruneRows = PRUNE_ACTIVITY_NONCE_MAP_STALE(true);
      var removed = 0;
      for (var pr = 0; pr < pruneRows.length; pr++) {
        if (pruneRows[pr][0] === "Removed") removed = Number(pruneRows[pr][1]) || 0;
      }
      out.push(["INFO", "Pruned stale ActivityTracker entries: " + removed, "", "", ""]);
    } catch (pruneErr) {
      out.push(["WARNING", "ActivityTracker prune failed: " + pruneErr.message, "", "", ""]);
    }

    // Get wallets already tracked in ACTIVITY_NONCE_MAP
    var tracked = ActivityTracker.getAllTracked();

    // Sort by lastCheck ascending (oldest first) so we process different wallets each run
    tracked.sort(function(a, b) {
      return (a.lastCheck || 0) - (b.lastCheck || 0);
    });

    out.push(["INFO", "Found " + tracked.length + " tracked wallets", "", "", ""]);
    out.push(["", "", "", "", ""]);

    if (tracked.length === 0) {
      out.push(["WARNING", "No wallets in ACTIVITY_NONCE_MAP — auto-discovering from Recap Chain...", "", "", ""]);
      // v4.14.6: Auto-discover wallets instead of giving up
      var discovered = _discoverWalletsFromRecap_();
      if (discovered.length === 0) {
        out.push(["ERROR", "No EVM wallets found in Recap Chain either", "", "", ""]);
        return out;
      }
      out.push(["INFO", "Discovered " + discovered.length + " EVM wallets from Recap Chain", "", "", ""]);
      // Convert to tracked format and continue
      for (var disc = 0; disc < discovered.length; disc++) {
        tracked.push({
          chain: discovered[disc].chainKey,
          wallet: discovered[disc].wallet,
          nonce: null,
          lastCheck: 0,
          lastActivity: null
        });
      }
    }

    // v4.13.6: Collect eligible wallets for batch fetch
    var maxProcess = 25;
    var batchItems = [];
    var batchTracked = [];

    for (var i = 0; i < tracked.length && batchItems.length < maxProcess; i++) {
      if (Date.now() - startMs > 20000) break; // leave time for batch call

      var t = tracked[i];
      var rpc = _RpcLookup.get(t.chain);
      var vm = _RpcLookup.getVm(t.chain);

      // Skip non-EVM chains
      if (vm !== "EVM") {
        skipped++;
        continue;
      }

      if (!rpc) {
        out.push([t.chain, t.wallet.substring(0, 10) + "...", String(t.nonce || "-"), "-", "NO RPC"]);
        errors++;
        continue;
      }

      batchItems.push({ chain: t.chain, wallet: t.wallet, rpc: rpc });
      batchTracked.push(t);
    }

    // v4.13.6: Batch fetch all nonces
    var httpCalls = Object.keys(byRpcCount_(batchItems)).length;
    out.push(["INFO", "Batch: " + batchItems.length + " wallets via " + httpCalls + " HTTP calls", "", "", ""]);

    var nonceResults = {};
    if (batchItems.length > 0) {
      nonceResults = fetchEvmNonceBatch(batchItems);
    }

    // Process results
    for (var j = 0; j < batchItems.length; j++) {
      var item = batchItems[j];
      var tInfo = batchTracked[j];
      var key = String(item.chain).toUpperCase() + ":" + String(item.wallet).toLowerCase();
      var newNonce = nonceResults[key];

      if (newNonce !== null && newNonce !== undefined) {
        var oldNonce = tInfo.nonce;
        ActivityTracker.updateNonce(item.chain, item.wallet, newNonce);
        var diff = (oldNonce !== null && oldNonce !== undefined) ? (newNonce - oldNonce) : 0;
        var status = diff > 0 ? "+" + diff + " TX" : "OK";
        out.push([item.chain, item.wallet.substring(0, 10) + "...", String(oldNonce || "-"), String(newNonce), status]);
        success++;
      } else {
        out.push([item.chain, item.wallet.substring(0, 10) + "...", String(tInfo.nonce || "-"), "-", "RPC ERROR"]);
        errors++;
      }
    }

    out.push(["", "", "", "", ""]);
    out.push(["SUMMARY", success + " updated", errors + " errors", skipped + " non-EVM", "HTTP=" + httpCalls]);

    var remaining = tracked.length - batchItems.length - skipped - errors;
    if (remaining > 0) {
      out.push(["REMAINING", remaining + " wallets", "", "", "Run again"]);
    }

  } catch (e) {
    out.push(["ERROR", e.message, "", "", ""]);
  }

  return out;
}

// ============================================================
// DIAGNOSTIC
// ============================================================

/**
 * Diagnostic complet du systÃ¨me Activity
 * @customfunction
 */
function ACTIVITY_REFRESH_STATUS() {
  var out = [["Component", "Status", "Details", "Action"]];
  
  try {
    // 1. NONCE_MAP
    var count = ActivityTracker.count();
    out.push(["NONCE_MAP", count > 0 ? "OK" : "EMPTY", count + " wallets tracked", ""]);
    
    // 2. RPC_LOOKUP - v4.12.22
    var rpcCount = _RpcLookup.count();
    out.push(["RPC_LOOKUP", rpcCount > 0 ? "OK" : "EMPTY", rpcCount + " chains", 
              rpcCount === 0 ? "Run BUILD_RPC_LOOKUP()" : ""]);
    
    // 3. Last check timestamp
    var tracked = ActivityTracker.getAllTracked();
    var mostRecent = 0;
    for (var i = 0; i < tracked.length; i++) {
      if (tracked[i].lastCheck > mostRecent) {
        mostRecent = tracked[i].lastCheck;
      }
    }
    var lastCheckAgo = mostRecent > 0 ? Math.round((Date.now() - mostRecent) / 60000) + " min ago" : "never";
    out.push(["Last check", mostRecent > 0 ? "OK" : "STALE", lastCheckAgo, ""]);
    
    // 4. ActivitÃ© rÃ©cente
    var active = ActivityTracker.getActiveWallets();
    out.push(["Recent activity", active.length + " wallets", "Last 5 min", ""]);
    
    // 5. Watchdog trigger
    var watchdogFound = false;
    try {
      var triggers = ScriptApp.getProjectTriggers();
      for (var j = 0; j < triggers.length; j++) {
        if (triggers[j].getHandlerFunction() === "ACTIVITY_WATCHDOG") {
          watchdogFound = true;
          break;
        }
      }
    } catch (e) {
      out.push(["WATCHDOG", "UNKNOWN", "Cannot check triggers", ""]);
      watchdogFound = null;
    }
    
    if (watchdogFound !== null) {
      out.push(["WATCHDOG", watchdogFound ? "INSTALLED" : "NOT FOUND", 
                watchdogFound ? "Running every 5 min" : "", 
                watchdogFound ? "" : "Run INSTALL_ACTIVITY_WATCHDOG()"]);
    }
    
    // 6. Sample check - verify RPC lookup works
    if (tracked.length > 0) {
      var sample = tracked[0];
      var sampleRpc = _RpcLookup.get(sample.chain);
      out.push(["Sample RPC", sampleRpc ? "OK" : "MISSING", 
                sample.chain + " -> " + (sampleRpc ? sampleRpc.substring(0, 30) : "NOT FOUND"), ""]);
    }
    
  } catch (e) {
    out.push(["ERROR", e.message, "", ""]);
  }
  
  return out;
}

/**
 * Test fetching nonce for a specific chain/wallet
 * @customfunction
 */
function TEST_NONCE_FETCH(chain, wallet) {
  if (!chain || !wallet) {
    return [["ERROR", "Usage: TEST_NONCE_FETCH('BASE', '0x...')"]];
  }
  
  var out = [["Test", "Result"]];
  
  // 1. Check RPC lookup
  var rpc = _RpcLookup.get(chain);
  out.push(["RPC from lookup", rpc || "NOT FOUND"]);
  
  if (!rpc) {
    out.push(["", "Run BUILD_RPC_LOOKUP() first!"]);
    return out;
  }
  
  // 2. Fetch nonce
  var nonce = fetchEvmNonce(wallet, rpc);
  out.push(["Fetched nonce", nonce !== null ? String(nonce) : "FETCH FAILED"]);
  
  // 3. Stored nonce
  var info = ActivityTracker.getInfo(chain, wallet);
  out.push(["Stored nonce", info ? String(info.nonce) : "NOT TRACKED"]);
  
  // 4. Difference
  if (info && nonce !== null) {
    var diff = nonce - info.nonce;
    out.push(["Difference", diff === 0 ? "Match!" : diff + " TX difference!"]);
    out.push(["Last check", info.lastCheck ? new Date(info.lastCheck).toISOString().substring(0, 19) : "never"]);
  }
  
  return out;
}

// ============================================================
// WATCHDOG - v4.13.6 BATCH MODE
// Uses RPC lookup table + JSON-RPC batch for minimal HTTP calls
// ============================================================

var ACTIVITY_PHASE_C_BATCH_SIZE = 20;
var ACTIVITY_PHASE_C_MAX_MS = 240000;

function _activityPhaseCEnabled_() {
  try {
    return PropertiesService.getScriptProperties().getProperty("PHASE_C_ENABLED") === "true";
  } catch (e) {
    return false;
  }
}

function _activityTimeLeft_(startedMs, reserveMs) {
  return (Date.now() - startedMs) < (ACTIVITY_PHASE_C_MAX_MS - (reserveMs || 0));
}

function _activityMergeMap_(target, source) {
  for (var k in (source || {})) {
    if (source.hasOwnProperty(k)) target[k] = source[k];
  }
}

function _activitySignalKey_(chain, wallet) {
  return String(chain || "").toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_") + ":" + String(wallet || "").toLowerCase();
}

function _activityApplySignalResult_(item, marker, balance, nowMs) {
  var signals = { lc: nowMs, hb: nowMs, vm: item.vm || "EVM" };
  if (item.vm === "SVM") {
    if (marker !== null && marker !== undefined) signals.s = marker;
  } else {
    if (marker !== null && marker !== undefined) signals.n = marker;
  }
  if (balance !== null && balance !== undefined) signals.b = balance;
  return ActivityTracker.updateSignals(item.chain, item.wallet, signals);
}

function _activityWatchdogPhaseCSignals_() {
  var startedMs = Date.now();
  try {
    if (typeof WCORE_IS_SAFE === "function") {
      var phaseCSafe = WCORE_IS_SAFE("activity");
      if (phaseCSafe && phaseCSafe.safe === false) {
        Logger.log("[ACTIVITY_WATCHDOG] Phase C: system not safe, skipping: " + (phaseCSafe.reason || "UNKNOWN"));
        return;
      }
    }

    var tracked = ActivityTracker.getAllTracked();
    if (tracked.length === 0) {
      Logger.log("[ACTIVITY_WATCHDOG] Phase C: no wallets tracked");
      return;
    }

    tracked.sort(function(a, b) {
      return (a.lastCheck || 0) - (b.lastCheck || 0);
    });

    if (_RpcLookup.count() === 0) {
      try { REPAIR_RPC_LOOKUP_FROM_REGISTRY(false); } catch (eRepair0) {}
      if (_RpcLookup.count() === 0) {
        Logger.log("[ACTIVITY_WATCHDOG] Phase C: RPC lookup empty after registry repair");
        return;
      }
    }

    var batch = tracked.slice(0, ACTIVITY_PHASE_C_BATCH_SIZE);
    var nowMs = Date.now();
    var oldestCheck = batch[0] ? (batch[0].lastCheck || 0) : 0;
    var isStale = (nowMs - oldestCheck) > 3600000;
    var cooldownMs = isStale ? ACTIVITY_CONFIG.CATCHUP_COOLDOWN_MS : 60000;
    var evmItems = [], svmItems = [], cosmosItems = [];
    var skipped = 0;

    for (var i = 0; i < batch.length; i++) {
      if (!_activityTimeLeft_(startedMs, 45000)) break;
      var t = batch[i];
      if (t.lastCheck && (nowMs - t.lastCheck) < cooldownMs) {
        skipped++;
        continue;
      }

      var rpc = _RpcLookup.get(t.chain);
      var vm = _RpcLookup.getVm(t.chain) || t.vm || "EVM";
      if (!rpc) {
        try { _repairRpcLookupIfMissing_(t.chain); rpc = _RpcLookup.get(t.chain); vm = _RpcLookup.getVm(t.chain) || t.vm || "EVM"; } catch (eRepair1) {}
      }
      if (!rpc) continue;

      var item = { chain: t.chain, wallet: t.wallet, rpc: rpc, vm: vm };
      if (vm === "SVM") svmItems.push(item);
      else if (vm === "COSMOS") cosmosItems.push(item);
      else evmItems.push(item);
    }

    var markerResults = {};
    var balanceResults = {};

    // v4.15.40: Build old-nonce map for stale RPC detection
    var oldNonceMap = {};
    for (var oi = 0; oi < evmItems.length; oi++) {
      var oItem = evmItems[oi];
      var oKey = _activitySignalKey_(oItem.chain, oItem.wallet);
      if (oldNonceMap[oKey] == null) {
        // Find the original tracked item to get old nonce
        for (var bi = 0; bi < batch.length; bi++) {
          if (batch[bi].chain === oItem.chain && batch[bi].wallet === oItem.wallet) {
            oldNonceMap[oKey] = batch[bi].nonce;
            break;
          }
        }
      }
    }

    if (evmItems.length > 0 && _activityTimeLeft_(startedMs, 45000)) {
      _activityMergeMap_(markerResults, fetchEvmNonceBatch(evmItems, oldNonceMap));
    }
    if (evmItems.length > 0 && _activityTimeLeft_(startedMs, 45000)) {
      _activityMergeMap_(balanceResults, fetchEvmNativeBalanceBatch(evmItems));
    }
    if (svmItems.length > 0 && _activityTimeLeft_(startedMs, 45000)) {
      _activityMergeMap_(markerResults, fetchSvmSignatureBatch(svmItems));
    }
    if (svmItems.length > 0 && _activityTimeLeft_(startedMs, 45000)) {
      _activityMergeMap_(balanceResults, fetchSvmNativeBalanceBatch(svmItems));
    }
    if (cosmosItems.length > 0 && _activityTimeLeft_(startedMs, 45000)) {
      _activityMergeMap_(markerResults, fetchCosmosSequenceBatch(cosmosItems));
    }
    if (cosmosItems.length > 0 && _activityTimeLeft_(startedMs, 45000)) {
      _activityMergeMap_(balanceResults, fetchCosmosNativeBalanceBatch(cosmosItems));
    }

    var allItems = evmItems.concat(svmItems).concat(cosmosItems);
    var processed = 0;
    var activityDetected = 0;
    var failed = 0;

    for (var j = 0; j < allItems.length; j++) {
      if (!_activityTimeLeft_(startedMs, 20000)) break;
      var item2 = allItems[j];
      var key = _activitySignalKey_(item2.chain, item2.wallet);
      var marker = markerResults.hasOwnProperty(key) ? markerResults[key] : null;
      var bal = balanceResults.hasOwnProperty(key) ? balanceResults[key] : null;

      if ((marker === null || marker === undefined) && (bal === null || bal === undefined)) {
        ActivityTracker.updateSignals(item2.chain, item2.wallet, { hb: nowMs, vm: item2.vm || "EVM" });
        failed++;
        continue;
      }

      var hasActivity = _activityApplySignalResult_(item2, marker, bal, nowMs);
      processed++;
      if (hasActivity) {
        activityDetected++;
        ForceRefreshManager.set(item2.chain, item2.wallet, "Signal change detected by Phase C watchdog");
        Logger.log("[ACTIVITY_WATCHDOG] Phase C signal change: " + item2.chain + " " + item2.wallet.substring(0, 10) + "...");
        _activity_pulseB1ForChain_(item2.chain);
      }
    }

    Logger.log("[ACTIVITY_WATCHDOG] Phase C processed " + processed + "/" + batch.length +
               " (EVM=" + evmItems.length + " SVM=" + svmItems.length + " COSMOS=" + cosmosItems.length +
               " skipped=" + skipped + " failed=" + failed + "), detected " + activityDetected +
               " changes, durationMs=" + (Date.now() - startedMs));
  } catch (e) {
    Logger.log("[ACTIVITY_WATCHDOG] Phase C error: " + e);
  }
}

/**
 * Watchdog - checks nonces every 5 minutes via time-based trigger
 *
 * v4.13.6: BATCH MODE - groups wallets by RPC, 1 HTTP call per RPC
 * v4.12.22 FIX: Uses _RpcLookup instead of eval()
 * v4.12.22: Auto-init when nonces are stale (> 1 hour without check)
 */
function ACTIVITY_WATCHDOG() {
  // v4.16.30: DISABLED — was consuming ~5760 UrlFetch calls/day
  // (120+ wallets × eth_getTransactionCount via fetchAll, every 30 min).
  // WATCHDOG_FROM_RECAP (every 5 min, I1 > 5h stale detection) handles
  // refresh scheduling. Activity-based refresh is unnecessary.
  return { skipped: "disabled_v4.16.30", reason: "WATCHDOG_FROM_RECAP handles refresh scheduling" };
  try { HttpCallCounter.setTrigger('ACTIVITY_WATCHDOG'); } catch(e){}
  try { if (typeof WCORE_AUTO_HEAL === 'function') WCORE_AUTO_HEAL("ACTIVITY_WATCHDOG", false); } catch(e){}
  // v4.15.110: CEX manual refreshes run directly from installable onEdit and
  // keep a central watchdog fallback. Do not duplicate CEX polling from the
  // wallet activity watchdog; it competes for Apps Script execution slots.
  // v4.15.51 (Layer 1): J1 sync at HEAD, before heavy scan/discovery work below.
  // If the watchdog later times out or throws during the scan phase, the display
  // latch (A1 re-reads on J1 change) has already been refreshed. Sheet I/O only.
  try { SYNC_J1_ALL_SHEETS(); } catch (eSyncJ1Head) {}
  // v4.15.23 DIAG: dump trigger snapshot + tempo I1/J1/B1 each run (readable via @customfunction)
  try {
    var _diagTrigs = ScriptApp.getProjectTriggers();
    var _trigNames = [];
    for (var _ti = 0; _ti < _diagTrigs.length; _ti++) {
      try {
        _trigNames.push({
          fn: _diagTrigs[_ti].getHandlerFunction(),
          evt: String(_diagTrigs[_ti].getEventType())
        });
      } catch (_te) {}
    }
    var _diagTempo = { exists: false, vI1: "", vJ1: "", vB1: "" };
    try {
      var _diagSs = SpreadsheetApp.getActiveSpreadsheet();
      var _diagTempoSheet = _diagSs ? _diagSs.getSheetByName("Ledger - Tempo") : null;
      if (_diagTempoSheet) {
        _diagTempo.exists = true;
        _diagTempo.vI1 = String(_diagTempoSheet.getRange("I1").getDisplayValue() || "");
        _diagTempo.vJ1 = String(_diagTempoSheet.getRange("J1").getDisplayValue() || "");
        _diagTempo.vB1 = String(_diagTempoSheet.getRange("B1").getDisplayValue() || "");
      }
    } catch (_dte) {}
    var _diagProps = PropertiesService.getScriptProperties();
    var _diagJson = JSON.stringify({
      ts: new Date().toISOString(),
      triggers: _trigNames,
      wdCursor: _diagProps.getProperty("WD_CURSOR") || "",
      phaseC: _diagProps.getProperty("PHASE_C_ENABLED") || "false",
      tempo: _diagTempo,
      lastWdDiag: _diagProps.getProperty("WCORE_WD_LAST_DIAG") || ""
    });
    _diagProps.setProperty("WCORE_WD_TRIGGER_SNAPSHOT", _diagJson);
    // v4.15.23: write to dedicated _WD_DIAG sheet (Recap Chain AH1 owned by ledger cache)
    try {
      var _diagSs2 = SpreadsheetApp.getActiveSpreadsheet();
      var _diagDiag = _diagSs2 ? _diagSs2.getSheetByName("_WD_DIAG") : null;
      if (_diagDiag) {
        _diagDiag.getRange("A1").setValue(_diagJson.substring(0, 45000));
        _diagDiag.getRange("A1").setNumberFormat("@");
      }
    } catch (_cellErr) {}
  } catch (_diagAllErr) {}

  try {
    try { _ensureLegacyWatchdogInstalled_(); } catch (eHeal) {}

    if (_activityPhaseCEnabled_()) {
      _activityWatchdogPhaseCSignals_();
      return;
    }

    // Check system safety (quota OK)
    if (typeof WCORE_IS_SAFE === "function") {
      var safe = WCORE_IS_SAFE("activity");
      if (safe && safe.safe === false) {
        Logger.log("[ACTIVITY_WATCHDOG] System not safe, skipping: " + (safe.reason || "UNKNOWN"));
        return;
      }
    }

    try { PRUNE_ACTIVITY_NONCE_MAP_STALE(false); } catch (pruneErr) {
      Logger.log("[ACTIVITY_WATCHDOG] ActivityTracker prune failed: " + pruneErr.message);
    }

    var tracked = ActivityTracker.getAllTracked();
    if (tracked.length === 0) {
      Logger.log("[ACTIVITY_WATCHDOG] No wallets tracked");
      return;
    }

    var sortNowMs = Date.now();
    // Sort by priority score, then lastCheck ascending for fair rotation
    tracked.sort(function(a, b) {
      var ps = _activityPriorityScore_(b, sortNowMs) - _activityPriorityScore_(a, sortNowMs);
      if (ps !== 0) return ps;
      return (a.lastCheck || 0) - (b.lastCheck || 0);
    });

    // Check RPC lookup is populated - auto-build if empty
    if (_RpcLookup.count() === 0) {
      try { REPAIR_RPC_LOOKUP_FROM_REGISTRY(false); } catch (eRepair0) {}
      if (_RpcLookup.count() === 0) {
        Logger.log("[ACTIVITY_WATCHDOG] RPC lookup empty after registry repair");
        return;
      }
    }

    // Select batch
    var batch = tracked.slice(0, ACTIVITY_CONFIG.BATCH_SIZE);
    var activityDetected = 0;
    var processed = 0;
    var skipped = 0;
    var nowMs = Date.now();

    // v4.12.22: Check if we need aggressive refresh (oldest check > 1 hour ago)
    var oldestCheck = batch[0] ? (batch[0].lastCheck || 0) : 0;
    var staleThreshold = 3600000; // 1 hour
    var isStale = (nowMs - oldestCheck) > staleThreshold;

    // If stale, use reduced cooldown instead of 0 to prevent burst
    var cooldownMs = isStale ? ACTIVITY_CONFIG.CATCHUP_COOLDOWN_MS : 60000;

    if (isStale) {
      Logger.log("[ACTIVITY_WATCHDOG] Stale data detected (" + Math.round((nowMs - oldestCheck) / 3600000) + "h old), catchup mode (cooldown=" + (cooldownMs / 1000) + "s)");
    }

    // v4.15.0: Collect eligible wallets per VM type
    var evmItems = [];
    var svmItems = [];
    var cosmosItems = [];

    for (var i = 0; i < batch.length; i++) {
      var t = batch[i];

      // Skip if recently checked (< cooldown)
      if (t.lastCheck && (nowMs - t.lastCheck) < cooldownMs) {
        skipped++;
        continue;
      }

      // Get RPC from lookup table (v4.12.22 FIX)
      var rpc = _RpcLookup.get(t.chain);
      var vm = _RpcLookup.getVm(t.chain);
      if (!rpc) {
        try { _repairRpcLookupIfMissing_(t.chain); rpc = _RpcLookup.get(t.chain); vm = _RpcLookup.getVm(t.chain); } catch (eRepair1) {}
      }

      if (!rpc) continue; // Chain not in lookup - skip silently

      var vmItem = { chain: t.chain, wallet: t.wallet, rpc: rpc };
      if (vm === "SVM") { svmItems.push(vmItem); }
      else if (vm === "COSMOS") { cosmosItems.push(vmItem); }
      else { evmItems.push(vmItem); } // Default to EVM
    }

    // v4.15.0: Fetch activity markers for all VM types in parallel via fetchAll
    var allResults = {};

    // EVM: batch nonce fetch (grouped by RPC)
    if (evmItems.length > 0) {
      var evmResults = fetchEvmNonceBatch(evmItems);
      for (var ek in evmResults) allResults[ek] = evmResults[ek];
    }

    // SVM: signature fetch (parallel via fetchAll)
    if (svmItems.length > 0) {
      var svmResults = fetchSvmSignatureBatch(svmItems);
      for (var sk in svmResults) allResults[sk] = svmResults[sk];
    }

    // Cosmos: sequence fetch (parallel via fetchAll)
    if (cosmosItems.length > 0) {
      var cosmosResults = fetchCosmosSequenceBatch(cosmosItems);
      for (var ck in cosmosResults) allResults[ck] = cosmosResults[ck];
    }

    // Process all results uniformly (nonce, signature, or sequence)
    var allItems = evmItems.concat(svmItems).concat(cosmosItems);
    var failedItems = [];
    for (var j = 0; j < allItems.length; j++) {
      var item = allItems[j];
      var key = String(item.chain).toUpperCase() + ":" + String(item.wallet).toLowerCase();
      var newMarker = allResults[key];

      if (newMarker === null || newMarker === undefined) {
        failedItems.push(item);
        continue;
      }

      processed++;

      // Update and detect activity (works with int nonce, string signature, or int sequence)
      var hasActivity = ActivityTracker.updateNonce(item.chain, item.wallet, newMarker);
      if (hasActivity) {
        activityDetected++;
        ForceRefreshManager.set(item.chain, item.wallet, "TX detected by watchdog");
        Logger.log("[ACTIVITY_WATCHDOG] TX detected: " + item.chain + " " + item.wallet.substring(0, 10) + "...");

        // v4.14.8: Pulse B1 on all matching sheets (case-insensitive)
        _activity_pulseB1ForChain_(item.chain);
      }
    }

    // v4.14.7: Retry failed EVM nonces with fallback RPCs
    if (failedItems.length > 0 && typeof fetchEvmNonce === 'function') {
      var explorerFallbackItems = [];
      for (var fi = 0; fi < failedItems.length; fi++) {
        var fItem = failedItems[fi];
        var fVm = _RpcLookup.getVm(fItem.chain);
        if (fVm !== "EVM") continue; // Only EVM has fallback retry (SVM/Cosmos have single endpoint)
        var allRpcs = _RpcLookup.getRpcs(fItem.chain);
        var retryNonce = null;
        for (var ri = 1; ri < allRpcs.length; ri++) {
          try {
            retryNonce = fetchEvmNonce(fItem.wallet, allRpcs[ri]);
            if (retryNonce !== null) break;
          } catch (eRetry) {}
        }
        if (retryNonce !== null) {
          processed++;
          var retryActivity = ActivityTracker.updateNonce(fItem.chain, fItem.wallet, retryNonce);
          if (retryActivity) {
            activityDetected++;
            ForceRefreshManager.set(fItem.chain, fItem.wallet, "TX detected by watchdog (fallback RPC)");
            Logger.log("[ACTIVITY_WATCHDOG] TX detected (fallback): " + fItem.chain + " " + fItem.wallet.substring(0, 10) + "...");
            _activity_pulseB1ForChain_(fItem.chain);
          }
        } else {
          explorerFallbackItems.push(fItem);
        }
      }

      if (explorerFallbackItems.length > 0 && typeof fetchEvmExplorerActivityBatch === 'function') {
        var explorerResults = fetchEvmExplorerActivityBatch(explorerFallbackItems);
        for (var ei = 0; ei < explorerFallbackItems.length; ei++) {
          var eItem = explorerFallbackItems[ei];
          var eKey = String(eItem.chain).toUpperCase() + ":" + String(eItem.wallet).toLowerCase();
          var explorerMarker = explorerResults[eKey];
          if (explorerMarker === null || explorerMarker === undefined) continue;
          processed++;
          var explorerActivity = ActivityTracker.updateSignals(eItem.chain, eItem.wallet, { s: explorerMarker, lc: Date.now(), vm: "EVM" });
          if (explorerActivity) {
            activityDetected++;
            ForceRefreshManager.set(eItem.chain, eItem.wallet, "TX detected by watchdog (explorer fallback)");
            Logger.log("[ACTIVITY_WATCHDOG] TX detected by watchdog (explorer fallback): " + eItem.chain + " " + eItem.wallet.substring(0, 10) + "...");
            _activity_pulseB1ForChain_(eItem.chain);
          }
        }
      }
    }

    var httpCalls = Object.keys(byRpcCount_(evmItems)).length + svmItems.length + cosmosItems.length;
    Logger.log("[ACTIVITY_WATCHDOG] Processed " + processed + "/" + batch.length +
               " (EVM=" + evmItems.length + " SVM=" + svmItems.length + " COSMOS=" + cosmosItems.length +
               " skipped=" + skipped + " HTTP=" + httpCalls + "), detected " + activityDetected + " TX" +
               (isStale ? " [CATCHUP MODE]" : ""));

    // v4.14.6: Auto-discover missing wallets every 24h
    // Reads Recap Chain, finds EVM wallets not in NONCE_MAP, batch-fetches nonces
    try {
      var lastDiscovery = 0;
      try {
        lastDiscovery = parseInt(PropertiesService.getScriptProperties().getProperty("ACTIVITY_LAST_DISCOVERY") || "0");
      } catch (ed) {}

      if (nowMs - lastDiscovery > 86400000) { // 24h
        var discovered = _discoverWalletsFromRecap_();
        var newItems = [];
        for (var d = 0; d < discovered.length; d++) {
          var dw = discovered[d];
          if (!ActivityTracker.getInfo(dw.chainKey, dw.wallet)) {
            var dRpc = _RpcLookup.get(dw.chainKey);
            if (dRpc) {
              newItems.push({ chain: dw.chainKey, wallet: dw.wallet, rpc: dRpc });
            }
          }
        }

        // v4.15.0: Discovery for all VM types
        if (newItems.length > 0) {
          var discEvm = [], discSvm = [], discCosmos = [];
          for (var ds = 0; ds < newItems.length; ds++) {
            var dVm = _RpcLookup.getVm(newItems[ds].chain);
            if (dVm === "SVM") discSvm.push(newItems[ds]);
            else if (dVm === "COSMOS") discCosmos.push(newItems[ds]);
            else discEvm.push(newItems[ds]);
          }
          var discResults = {};
          if (discEvm.length > 0) { var dr1 = fetchEvmNonceBatch(discEvm); for (var k1 in dr1) discResults[k1] = dr1[k1]; }
          if (discSvm.length > 0) { var dr2 = fetchSvmSignatureBatch(discSvm); for (var k2 in dr2) discResults[k2] = dr2[k2]; }
          if (discCosmos.length > 0) { var dr3 = fetchCosmosSequenceBatch(discCosmos); for (var k3 in dr3) discResults[k3] = dr3[k3]; }

          var regCount = 0;
          for (var di = 0; di < newItems.length; di++) {
            var dk = newItems[di].chain + ":" + newItems[di].wallet;
            var dn = discResults[dk];
            var regMarker = (dn !== null && dn !== undefined) ? dn : 0;
            ActivityTracker.updateNonce(newItems[di].chain, newItems[di].wallet, regMarker);
            regCount++;
          }
          if (regCount > 0) {
            Logger.log("[ACTIVITY_WATCHDOG] Auto-discovered " + regCount + "/" + newItems.length + " new wallets (EVM=" + discEvm.length + " SVM=" + discSvm.length + " COSMOS=" + discCosmos.length + ")");
          }
        }

        PropertiesService.getScriptProperties().setProperty("ACTIVITY_LAST_DISCOVERY", String(nowMs));
      }
    } catch (eDisc) {
      Logger.log("[ACTIVITY_WATCHDOG] Discovery error: " + eDisc);
    }

    // Keep J1 as a script-written latch value. This is read-only sheet I/O
    // and avoids stale self-referencing formulas in J1.
    try { SYNC_J1_ALL_SHEETS(); } catch (eSyncJ1) {}

    // v4.13.7: Check for #ERROR! in wallet-chain sheets and auto-retry
    var errorStats = _checkSheetErrors_();
    if (errorStats.pulsed > 0) {
      Logger.log("[ACTIVITY_WATCHDOG] Error retry: pulsed J1 on " + errorStats.pulsed + "/" + errorStats.errors + " error sheets");
    }

  } catch (e) {
    Logger.log("[ACTIVITY_WATCHDOG] Error: " + e);
  } finally {
    try { HttpCallCounter.clearTrigger(); } catch(e){}
  }
}

// ============================================================
// ERROR AUTO-RETRY - v4.13.7
// Scans wallet-chain sheets for #ERROR! and pulses J1 to retry
// ============================================================

/**
 * v4.13.7: Check all wallet-chain sheets for #ERROR! in A2 or J2
 * If found, increment J1 by 1 second to trigger formula recalculation
 * v4.15.42 — R9 FIX: Max 3 retries / 24h per sheet to prevent infinite churn
 *
 * @returns {Object} { checked, errors, pulsed, skipped }
 */
function _checkSheetErrors_() {
  var stats = { checked: 0, errors: 0, pulsed: 0, skipped: 0 };

  try {
    var ss = _wcoreGetSpreadsheet_();
    if (!ss) return stats;

    var sheets = ss.getSheets();
    var tz = ss.getSpreadsheetTimeZone() || "Europe/Paris";
    var nowMs = Date.now();
    var props = PropertiesService.getScriptProperties();
    var RETRY_MAX = 3;
    var RETRY_WINDOW_MS = 24 * 3600000; // 24h
    var RETRY_PREFIX = "WCORE_ERROR_RETRY_";

    for (var i = 0; i < sheets.length; i++) {
      var sheet = sheets[i];
      var name = sheet.getName();

      // Only check wallet-chain sheets (contain " - ")
      if (name.indexOf(" - ") === -1) continue;

      stats.checked++;

      try {
        // Read A2:J2 in one call, check A2 (col 0) and J2 (col 9)
        var row = sheet.getRange("A2:J2").getDisplayValues()[0];
        var a2 = row[0] || "";
        var j2 = row[9] || "";

        var hasError = (a2.charAt(0) === "#") || (j2.charAt(0) === "#");
        if (!hasError) continue;

        stats.errors++;

        // v4.15.42: Retry limiter — max 3 pulses / 24h per sheet
        var retryKey = RETRY_PREFIX + name;
        var retryRaw = props.getProperty(retryKey);
        var retryData = { count: 0, lastRetryMs: 0 };
        if (retryRaw) {
          try { retryData = JSON.parse(retryRaw); } catch (eParse) {}
        }
        var inWindow = retryData.lastRetryMs && (nowMs - retryData.lastRetryMs) < RETRY_WINDOW_MS;
        if (inWindow && retryData.count >= RETRY_MAX) {
          stats.skipped++;
          Logger.log("[ERROR_RETRY] SKIP " + name + " — retry limit (" + RETRY_MAX + "/24h) reached");
          continue;
        }

        // Increment J1 by 1 second to trigger recalculation
        var j1Val = sheet.getRange("J1").getValue();
        var newJ1;

        if (j1Val instanceof Date) {
          newJ1 = new Date(j1Val.getTime() + 1000);
        } else if (j1Val) {
          try {
            var parsed = new Date(j1Val);
            newJ1 = (!isNaN(parsed.getTime())) ? new Date(parsed.getTime() + 1000) : new Date();
          } catch (ep) {
            newJ1 = new Date();
          }
        } else {
          newJ1 = new Date();
        }

        sheet.getRange("J1").setValue(Utilities.formatDate(newJ1, tz, "yyyy-MM-dd HH:mm:ss"));
        stats.pulsed++;

        // Update retry counter
        retryData.count = inWindow ? (retryData.count || 0) + 1 : 1;
        retryData.lastRetryMs = nowMs;
        props.setProperty(retryKey, JSON.stringify(retryData));

        Logger.log("[ERROR_RETRY] Pulsed J1 +1s for " + name +
                   " (A2=" + a2 + ", J2=" + j2 + ") retry=" + retryData.count + "/" + RETRY_MAX);

      } catch (eSheet) {
        // Sheet read error - skip
      }
    }
  } catch (e) {
    Logger.log("[ERROR_RETRY] Error: " + e);
  }

  return stats;
}

/** v4.13.6: Count unique RPCs for logging */
function byRpcCount_(items) {
  var m = {};
  for (var i = 0; i < items.length; i++) {
    if (items[i] && items[i].rpc) m[items[i].rpc] = true;
  }
  return m;
}

/**
 * Pulse B1 on a chain's sheet to trigger recalculation
 * Called when a new transaction is detected
 * 
 * @param {string} chainName - Chain name (e.g., "BASE")
 */
/**
 * Pulse B1 on ALL wallet sheets matching a chain
 * v4.14.8: Robust case-insensitive search across all sheets
 * Handles: "Ledger - Arbitrum One", "Ethos - Base", "Binance Web3 Wallet - Ethereum", etc.
 *
 * @param {string} chainName - Normalized chain key (e.g., "ARBITRUM_ONE", "BASE")
 */
function _activity_pulseB1ForChain_(chainName) {
  try {
    var ss = _wcoreGetSpreadsheet_();
    if (!ss) return;

    // Normalize: "ARBITRUM_ONE" → "arbitrumone" for comparison
    var norm = String(chainName).toLowerCase().replace(/[_\s\-]+/g, "");
    var sheets = ss.getSheets();
    var tz = ss.getSpreadsheetTimeZone() || "Europe/Paris";
    var timestamp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
    var pulsed = 0;

    for (var i = 0; i < sheets.length; i++) {
      var name = sheets[i].getName();
      // Normalize sheet name: "Ledger - Arbitrum One" → "ledgerarbitrumone"
      var normName = name.toLowerCase().replace(/[_\s\-]+/g, "");

      // Match if sheet name ends with chain (e.g., "ledgerarbitrumone" ends with "arbitrumone")
      // or equals chain exactly (e.g., "base" === "base")
      if (normName.length >= norm.length &&
          normName.substring(normName.length - norm.length) === norm) {
        sheets[i].getRange("B1").setValue(timestamp);
        pulsed++;
        Logger.log("[ACTIVITY] Pulsed B1 on sheet: " + name);
      }
    }

    if (pulsed === 0) {
      Logger.log("[ACTIVITY] No sheets found for chain: " + chainName);
    }
  } catch (e) {
    Logger.log("[ACTIVITY] Error pulsing B1: " + e.message);
  }
}

function _ensureLegacyWatchdogInstalled_() {
  var props = PropertiesService.getScriptProperties();
  var lastMs = parseInt(props.getProperty("LEGACY_WD_HEAL_LAST_MS") || "0", 10);
  if (isFinite(lastMs) && (Date.now() - lastMs) < 3600000) return;
  props.setProperty("LEGACY_WD_HEAL_LAST_MS", String(Date.now()));

  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "WATCHDOG_FROM_RECAP") return;
  }

  ScriptApp.newTrigger("WATCHDOG_FROM_RECAP").timeBased().everyMinutes(5).create();
  Logger.log("[HEAL] Reinstalled WATCHDOG_FROM_RECAP (every 5 min — GAS n'accepte que 1/5/10/15/30)");
}

function INSTALL_ACTIVITY_WATCHDOG() {
  // Supprimer les anciens triggers
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "ACTIVITY_WATCHDOG") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // Installer nouveau trigger (v4.5.17: 5min -> 10min — économie ~50% nonce calls)
  ScriptApp.newTrigger("ACTIVITY_WATCHDOG")
    .timeBased()
    .everyMinutes(10)
    .create();

  // Also ensure RPC lookup is built
  if (_RpcLookup.count() === 0) {
    Logger.log("[INSTALL_ACTIVITY_WATCHDOG] RPC lookup empty; run BUILD_RPC_LOOKUP() manually from Apps Script editor");
  }

  return "ACTIVITY_WATCHDOG installed (every 30 min) - RPC lookup: " + _RpcLookup.count() + " chains";
}

function UNINSTALL_ACTIVITY_WATCHDOG() {
  var removed = 0;
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "ACTIVITY_WATCHDOG") {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  return "Removed " + removed + " trigger(s)";
}

// ============================================================
// WALLET DISCOVERY - v4.14.6
// Reads Recap Chain to discover all wallet-chain combinations
// Fixes the chicken-and-egg problem where INIT_ALL_NONCES only
// updated already-tracked wallets, and new wallets never got registered
// ============================================================

/**
 * v4.14.6: Read Recap Chain sheet and extract all EVM wallet-chain combinations
 * @returns {Array<{chain: string, chainKey: string, wallet: string}>}
 */
function _discoverWalletsFromRecap_() {
  var results = [];

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return results;

     var recapSheet = ss.getSheetByName("Recap Portfolio");
    if (!recapSheet) return results;

    var lastRow = recapSheet.getLastRow();
    if (lastRow < 2) return results;

    // Read header + data for columns P (Chain), Q (Engine), R (Wallet)
    var header = recapSheet.getRange(1, 1, 1, recapSheet.getLastColumn()).getValues()[0];

    // Find column indices dynamically from header
    var colChain = -1, colEngine = -1, colWallet = -1;
    for (var h = 0; h < header.length; h++) {
      var hVal = String(header[h]).trim();
      if (hVal === "Chain") colChain = h;
      else if (hVal === "Engine") colEngine = h;
      else if (hVal === "Wallet") colWallet = h;
    }

    if (colChain === -1 || colEngine === -1 || colWallet === -1) return results;

    // Read only the 3 columns we need (efficient)
    var maxCol = Math.max(colChain, colEngine, colWallet) + 1;
    var data = recapSheet.getRange(2, 1, lastRow - 1, maxCol).getValues();

    var seen = {};

    for (var i = 0; i < data.length; i++) {
      var chain = String(data[i][colChain] || "").trim();
      var engine = String(data[i][colEngine] || "").trim();
      var walletStr = String(data[i][colWallet] || "").trim();

      // Skip non-EVM
      if (engine.indexOf("EVM") === -1) continue;

      // Extract wallet address from "0x... (Name)"
      var spaceIdx = walletStr.indexOf(" ");
      var wallet = (spaceIdx > 0 ? walletStr.substring(0, spaceIdx) : walletStr).toLowerCase().trim();
      if (!wallet || wallet.substring(0, 2) !== "0x" || wallet.length < 40) continue;

      // Normalize chain key
      var chainKey = chain.toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");

      // Deduplicate (same wallet on same chain)
      var dedup = chainKey + ":" + wallet;
      if (seen[dedup]) continue;
      seen[dedup] = true;

      results.push({ chain: chain, chainKey: chainKey, wallet: wallet });
    }

  } catch (e) {
    Logger.log("[_discoverWalletsFromRecap_] Error: " + e);
  }

  return results;
}

/**
 * v4.14.6: Discover all EVM wallets from Recap Chain and register
 * missing ones in ACTIVITY_NONCE_MAP via batch RPC nonce fetch.
 *
 * Run this ONCE to populate the nonce map for all wallets.
 * After that, WATCHDOG auto-discovers new wallets every 24h.
 *
 * @customfunction
 */
function DISCOVER_AND_REGISTER_WALLETS() {
  var out = [["Chain", "Wallet", "Old Nonce", "New Nonce", "Status"]];
  var startMs = Date.now();

  try {
    // 1. Ensure RPC lookup is built
    if (_RpcLookup.count() === 0) {
      out.push(["ERROR", "RPC lookup empty", "", "", "Run BUILD_RPC_LOOKUP() manually from Apps Script editor"]);
      return out;
    }
    out.push(["INFO", "RPC lookup: " + _RpcLookup.count() + " chains", "", "", ""]);

    // 2. Discover wallets from Recap Chain
    var wallets = _discoverWalletsFromRecap_();
    out.push(["INFO", "Discovered " + wallets.length + " EVM wallets from Recap Chain", "", "", ""]);

    if (wallets.length === 0) {
      out.push(["WARNING", "No EVM wallets found in Recap Chain", "", "", ""]);
      return out;
    }

    // 3. Check which wallets are missing from ACTIVITY_NONCE_MAP
    var missing = [];
    var alreadyTracked = 0;

    for (var i = 0; i < wallets.length; i++) {
      var w = wallets[i];
      var info = ActivityTracker.getInfo(w.chainKey, w.wallet);
      if (info && info.nonce !== null && info.nonce !== undefined) {
        alreadyTracked++;
      } else {
        missing.push(w);
      }
    }

    out.push(["INFO", alreadyTracked + " already tracked, " + missing.length + " missing", "", "", ""]);
    out.push(["", "", "", "", ""]);

    if (missing.length === 0) {
      out.push(["OK", "All " + wallets.length + " EVM wallets are tracked!", "", "", ""]);
      return out;
    }

    // 4. Batch fetch nonces for missing wallets
    var batchItems = [];
    for (var j = 0; j < missing.length; j++) {
      if (Date.now() - startMs > 22000) break;

      var mw = missing[j];
      var rpc = _RpcLookup.get(mw.chainKey);
      if (!rpc) {
        out.push([mw.chain, mw.wallet.substring(0, 12) + "...", "-", "-", "NO RPC"]);
        continue;
      }
      batchItems.push({ chain: mw.chainKey, wallet: mw.wallet, rpc: rpc, meta: mw });
    }

    var httpCalls = Object.keys(byRpcCount_(batchItems)).length;
    out.push(["INFO", "Batch: " + batchItems.length + " wallets via " + httpCalls + " HTTP calls", "", "", ""]);

    var nonceResults = {};
    if (batchItems.length > 0) {
      nonceResults = fetchEvmNonceBatch(batchItems);
    }

    // 5. Register results
    var success = 0, errors = 0;
    for (var k = 0; k < batchItems.length; k++) {
      var item = batchItems[k];
      var key = item.chain + ":" + item.wallet;
      var newNonce = nonceResults[key];

      if (newNonce !== null && newNonce !== undefined) {
        ActivityTracker.updateNonce(item.chain, item.wallet, newNonce);
        out.push([item.meta.chain, item.wallet.substring(0, 12) + "...", "-", String(newNonce), "REGISTERED"]);
        success++;
      } else {
        // v4.14.7: Register with nonce=0 when RPC fails (will be updated when RPCs recover)
        ActivityTracker.updateNonce(item.chain, item.wallet, 0);
        out.push([item.meta.chain, item.wallet.substring(0, 12) + "...", "-", "0", "REGISTERED (RPC down)"]);
        success++;
      }
    }

    out.push(["", "", "", "", ""]);
    out.push(["SUMMARY", success + " registered", errors + " failed", missing.length + " were missing", "HTTP=" + httpCalls]);

  } catch (e) {
    out.push(["ERROR", e.message, "", "", ""]);
  }

  return out;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Force update nonce for a specific wallet
 * @customfunction
 */
function FORCE_UPDATE_NONCE(chain, wallet) {
  if (!chain || !wallet) {
    return "Usage: FORCE_UPDATE_NONCE('BASE', '0x...')";
  }
  
  var rpc = _RpcLookup.get(chain);
  if (!rpc) {
    return "ERROR: No RPC for " + chain + " - run BUILD_RPC_LOOKUP()";
  }
  
  var nonce = fetchEvmNonce(wallet, rpc);
  if (nonce === null) {
    return "ERROR: Could not fetch nonce from " + rpc;
  }
  
  var info = ActivityTracker.getInfo(chain, wallet);
  var oldNonce = info ? info.nonce : null;
  
  ActivityTracker.updateNonce(chain, wallet, nonce);
  
  return "Updated " + chain + " nonce: " + oldNonce + " -> " + nonce;
}

/**
 * Clear and rebuild all activity data
 * @customfunction
 */
function RESET_ACTIVITY_SYSTEM() {
  var out = [["Step", "Result"]];
  
  // 1. Clear lookup
  _RpcLookup.clear();
  out.push(["Clear RPC lookup", "OK"]);
  
  // 2. Rebuild lookup must be run manually from the Apps Script editor (uses eval).
  out.push(["Rebuild RPC lookup", "SKIPPED - run BUILD_RPC_LOOKUP() manually"]);
  
  // 3. Clear nonce map
  ActivityTracker.clear();
  out.push(["Clear nonce map", "OK"]);
  
  // 4. Rebuild nonces
  out.push(["Rebuild nonces", "Run INIT_ALL_NONCES() separately"]);
  
  return out;
}

// ============================================================
// BRIDGE FUNCTIONS FOR BaseEngine (v4.12.22)
// These are called by 10A_BASE_ENGINE.gs to check force refresh flags
// ============================================================

/**
 * Check if a force refresh flag exists for a chain/wallet
 * Called by BaseEngine.checkActivityForceRefresh()
 * 
 * @param {string} chainId - Chain identifier
 * @param {string} wallet - Wallet address
 * @returns {Object|null} Force refresh data or null
 */
function _activity_checkForceRefreshFlag(chainId, wallet) {
  return ForceRefreshManager.check(chainId, wallet);
}

/**
 * Clear the force refresh flag after it has been processed
 * Called by BaseEngine.checkActivityForceRefresh()
 * 
 * @param {string} chainId - Chain identifier
 * @param {string} wallet - Wallet address
 */
function _activity_clearForceRefreshFlag(chainId, wallet) {
  ForceRefreshManager.clear(chainId, wallet);
}

// ============================================================
// HELPER: Get wallet address for a chain - v4.12.24
// Looks up ActivityTracker's tracked wallets for a given chain
// ============================================================

/**
 * Get the wallet address tracked for a given chain
 * @param {string} chainName - Chain name (e.g. "BASE")
 * @returns {string|null} Wallet address or null
 */
function _getWalletForChain_(chainName) {
  try {
    var tracked = ActivityTracker.getAllTracked();
    var key = String(chainName).toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");
    
    for (var i = 0; i < tracked.length; i++) {
      if (tracked[i].chain === key) {
        return tracked[i].wallet;
      }
    }
  } catch (e) {}
  return null;
}

// ============================================================
// DIAGNOSTIC: STALE CACHES - v4.12.24
// ============================================================

/**
 * Diagnostic des caches vieillissants
 * @customfunction
 */
function DIAG_STALE_CACHES() {
  var out = [["Chain", "Cache Age (h)", "Oldest Balance (h)", "Cycle Status", "Risk Level"]];
  var nowMs = Date.now();
  
  var allChains = _RpcLookup.getAll();
  var chainNames = Object.keys(allChains);
  
  var results = [];
  
  for (var i = 0; i < chainNames.length; i++) {
    var chainName = chainNames[i];
    var vm = (allChains[chainName] && allChains[chainName].vm) || "EVM";
    if (vm !== "EVM") continue;
    
    try {
      var varName = "_" + chainName;
      var chainObj = null;
      try { chainObj = eval(varName); } catch (e) { continue; }
      if (!chainObj || typeof chainObj.getConfig !== "function") continue;
      
      var cfg = chainObj.getConfig();
      if (!cfg) continue;
      
      var walletAddr = _getWalletForChain_(chainName);
      if (!walletAddr) continue;
      
      var cache = null;
      try {
        cache = WalletCache.load(walletAddr, null, cfg);
      } catch (e) { continue; }
      
      if (!cache) continue;
      
      var cacheAge = (nowMs - (cache.ts || 0)) / 3600000;
      
      var oldestBalance = 0;
      var balanceTsMap = cache.balanceTsMap || {};
      for (var c in balanceTsMap) {
        var age = nowMs - (balanceTsMap[c] || 0);
        if (age > oldestBalance) oldestBalance = age;
      }
      oldestBalance = oldestBalance / 3600000;
      
      var scanStats = cache.scanStats || {};
      var missingPrices = scanStats.missingPrices || 0;
      var missingMeta = scanStats.missingMeta || 0;
      var cycleDone = !!(scanStats.fullCycleComplete && missingPrices <= 0 && missingMeta <= 0);
      var cycleStatus = cycleDone ? "DONE" :
                        ("partial " + (scanStats.cursor || 0) + "/" + (scanStats.totalContracts || 0));
      if (!cycleDone && missingPrices > 0) cycleStatus += " price_missing=" + missingPrices;
      if (!cycleDone && missingMeta > 0) cycleStatus += " meta_missing=" + missingMeta;
      
      var maxAge = Math.max(cacheAge, oldestBalance);
      var risk = maxAge >= 5 ? "CRITICAL" : 
                 maxAge >= 4 ? "STALE" :
                 maxAge >= 3 ? "AGING" : "OK";
      
      results.push({
        chain: chainName,
        cacheAge: Math.round(cacheAge * 10) / 10,
        oldestBalance: Math.round(oldestBalance * 10) / 10,
        cycleStatus: cycleStatus,
        risk: risk,
        maxAge: maxAge
      });
      
    } catch (e) {}
  }
  
  // Trier par age decroissant
  results.sort(function(a, b) { return b.maxAge - a.maxAge; });
  
  for (var j = 0; j < results.length; j++) {
    var r = results[j];
    out.push([r.chain, r.cacheAge, r.oldestBalance, r.cycleStatus, r.risk]);
  }
  
  return out;
}
