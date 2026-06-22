/************************************************************
 * 01_INIT.gs - Initialization (loaded FIRST)
 * 
 * This file MUST be loaded first (alphabetical order in GAS).
 * It pre-declares global objects to avoid ReferenceError
 * when loading other files.
 * 
 * v4.15.12 - DeFiLlama Coins API batch stage
 *
 * v4.15.11 - PRICE FIX:
 * - GT Try 3 scans all returned pools on page 1 before returning null.
 *
 * v4.13.5 - PROTECTION CONSOLIDATION:
 * - Removed CacheFortress (03C) - redundant meta-dispatcher
 * - Removed CacheVerify (03D) - never called by any engine
 * - WCORE_IS_SAFE() now uses BaseEngine.detectBlockReason()
 * - EMERGENCY_RESET_QUOTA() resets all active protection layers
 * - Removed FULL_FORTRESS_RESET() and FORCE_CLEAR_LOCKDOWN()
 *
 * v4.12.29 - INTERVAL ALIGNMENT FOR 2H REFRESH CYCLE:
 * - FULL_SCAN_INTERVAL_MS: 15min -> 8h (every 4th refresh)
 * - FULL_PRICE_INTERVAL_MS: 1h -> 6h (every 3rd refresh)
 * - This makes dueScan/duePrice flags meaningful (not always YES)
 *
 * v4.12.21 - CACHE VERIFY INTEGRATION:
 * - Added CacheVerify pre-declaration
 * - Added INIT_CACHE_VERIFY() call in WCORE_INIT()
 * - Added CacheVerify status in WCORE_HEALTH()
 * - Prevents silent cache write failures
 *
 * (Changelog v4.5.0..v4.12.10: 10 entries removed for brevity)
 ************************************************************/
var INIT_VERSION = "4.15.63";

// ============================================================
// WCORE VERSION - Centralized version management
// ============================================================

var WCORE_VERSION = {
  MAJOR: 4,
  MINOR: 15,
  PATCH: 99,

  toString: function() {
    return 'v' + this.MAJOR + '.' + this.MINOR + '.' + this.PATCH;
  },
  
  toNumber: function() {
    return this.MAJOR * 10000 + this.MINOR * 100 + this.PATCH;
  },
  
  isAtLeast: function(major, minor, patch) {
    return this.toNumber() >= (major * 10000 + (minor || 0) * 100 + (patch || 0));
  }
};

// ============================================================
// CACHE VERSIONS - Centralized cache version management
// NOTE: Three separate systems coexist (by design):
//   1. WCORE_CACHE_VERSION (integer 11) — bumps invalidate ALL wallet caches
//   2. CACHE_VERSIONS (object below) — per-category TTLs and version tags
//   3. WCORE_VM_CACHE_VERSIONS (EVM:64, SVM:65, COSMOS:68) — per-VM invalidation
// Do NOT consolidate — each serves a distinct invalidation scope.
// ============================================================

var CACHE_VERSIONS = {
  CORE: '4.15.3', // Version generale du systeme (synchronized)
  WALLET: 11, // Cache des balances wallet (bump for aggressive refresh)
  PRICE: 15, // Cache des prix (DexScreener, DefiLlama, etc.)
  RPC: 5, // Statuts RPC et health checks
  FX: 3, // Taux de change EUR/USD
  GLOBAL: 9, // Cache global multi-chain
  TOKEN_META: 5, // Metadonnees des tokens
  
  // Generer une cle de cache avec version
  key: function(base, type) {
    var version = this[type.toUpperCase()] || this.CORE;
    return base + '_v' + version;
  },
  
  // Incrementer une version (pour forcer refresh)
  bump: function(type) {
    var t = type.toUpperCase();
    if (typeof this[t] === 'number') {
      this[t]++;
      return this[t];
    }
    return null;
  }
};

// ============================================================
// WCORE VM CACHE VERSIONS - Per-VM cache versioning (v4.12.1)
// Single source of truth - chain files should reference this
// ============================================================

var WCORE_VM_CACHE_VERSIONS = {
  EVM: 64, // All EVM chains (Ethereum, Base, Arbitrum, etc.) - bump for aggressive
  SVM: 65, // Solana Virtual Machine - bump for aggressive
  COSMOS: 68, // Cosmos SDK chains (Terra, Osmosis, Injective, etc.) - bump for aggressive
  
  // Get version for a specific VM type
  get: function(vmType) {
    var t = String(vmType || '').toUpperCase();
    return this[t] || this.EVM;
  }
};

// ============================================================
// WCORE CACHE CONFIG - CONSERVATEUR VERSION (v4.12.10)
// Refresh moins frequent, economise le quota HTTP
// ============================================================

var WCORE_CACHE_CONFIG = {
  // === TTL BALANCES (CONSERVATEUR v4.12.10) ===
  WALLET_TTL_MS: 21600000, // 6h - Cache wallet valide (etait 3h)
  WALLET_TTL_SECONDS: 21600, // 6h - Version seconds
  
  // === TTL PRIX (CONSERVATEUR v4.12.10) ===
  PRICE_TTL_MS: 14400000, // 4h - Prix valide (etait 2h)
  PRICE_STALE_MS: 5400000, // 90min - v4.15.13 : etait 30min, bumpe ici (ordre de chargement : 26B est charge apres DEFAULT_CONFIG fige)
  PRICE_ATTEMPT_COOLDOWN_MS: 7200000, // 2h - Cooldown echec (etait 1h)
  PRICE_REFRESH_MS: 600000, // 10min - Fraicheur prix (etait 5min)
  
  // === TTL METADATA (inchange) ===
  META_TTL_MS: 604800000, // 7j - Metadonnees tokens
  META_REFRESH_MS: 259200000, // 3j - Refresh metadonnees
  
  // === AUTO-FORCE (v4.5.17: aligne avec defaults BaseEngine 24h) ===
  AUTO_FORCE_FULL_SCAN_MS: 86400000, // v4.5.17: 12h -> 24h (aligne FULL_SCAN_INTERVAL_MS, -50% forced scans)
  AUTO_FORCE_FULL_PRICE_MS: 43200000, // v4.5.17: 6h -> 12h (-50% forced price refreshes)
  TOO_OLD_MS: 86400000, // 24h - Cache obsolete (etait 8h)

  // === INTERVALLES DE REFRESH (CONSERVATEUR v4.12.10) ===
  FULL_SCAN_INTERVAL_MS: 86400000, // 24h - Full scans (etait 8h)
  FULL_PRICE_INTERVAL_MS: 43200000, // 12h - Full price refresh (etait 6h)
  MIN_REFRESH_INTERVAL_MS: 120000, // 2min - Anti-spam (etait 30s)
  RECENT_RECHECK_MS: 1800000, // v4.5.17: 15min -> 30min (-50% recheck actifs)
  
  // === LOCKS ===
  LOCK_TTL_MS: 2000, // 2s - Verrou optimiste
  
  // === HELPERS ===
  toSeconds: function(ms) { return Math.floor(ms / 1000); },
  toMs: function(sec) { return sec * 1000; }
};

// ============================================================
// WCORE CACHE VERSION - For cache invalidation (v4.12.1)
// Increment this to force all wallets to refresh
// ============================================================

var WCORE_CACHE_VERSION = 11;

// ============================================================
// WCORE TTL CONSTANTS - Centralized TTL management (legacy)
// Kept for backward compatibility, references WCORE_CACHE_CONFIG
// ============================================================

var WCORE_TTL = {
  L1_MIN_SEC: 21600, // 6h - aligned with WALLET_TTL (etait 3h)
  L1_FX_SEC: 28800, // 8h - FX rate cache (etait 4h)
  L1_PRICE_SEC: 14400, // 4h - aligned with PRICE_TTL (etait 2h)
  WALLET_MS: WCORE_CACHE_CONFIG.WALLET_TTL_MS,
  WALLET_SEC: WCORE_CACHE_CONFIG.WALLET_TTL_SECONDS,
  PRICE_MS: WCORE_CACHE_CONFIG.PRICE_TTL_MS,
  META_MS: WCORE_CACHE_CONFIG.META_TTL_MS,
  META_SEC: WCORE_CACHE_CONFIG.toSeconds(WCORE_CACHE_CONFIG.META_TTL_MS),
  LOCK_MS: WCORE_CACHE_CONFIG.LOCK_TTL_MS,
  MIN_REFRESH_MS: WCORE_CACHE_CONFIG.MIN_REFRESH_INTERVAL_MS,
  FULL_SCAN_MS: WCORE_CACHE_CONFIG.FULL_SCAN_INTERVAL_MS,
  FULL_PRICE_MS: WCORE_CACHE_CONFIG.FULL_PRICE_INTERVAL_MS,
  PRICE_STALE_MS: WCORE_CACHE_CONFIG.PRICE_STALE_MS,
  AUTO_FORCE_MS: WCORE_CACHE_CONFIG.AUTO_FORCE_FULL_SCAN_MS,
  PRICE_ATTEMPT_COOLDOWN_MS: WCORE_CACHE_CONFIG.PRICE_ATTEMPT_COOLDOWN_MS,
  
  toSeconds: function(ms) { return Math.floor(ms / 1000); },
  toMs: function(sec) { return sec * 1000; }
};

// ============================================================
// TIMEOUT PROFILES - Unified timeout configurations
// ============================================================

var WCORE_TIMEOUT_PROFILES = {
  FAST_L2: {
    MAX_EXECUTION_MS: 18000,
    HTTP_MS: 2000,
    SAFE_MARGIN_MS: 900,
    HARD_GUARD_MS: 16000
  },
  SLOW_MAINNET: {
    MAX_EXECUTION_MS: 25000,
    HTTP_MS: 4000,
    SAFE_MARGIN_MS: 900,
    HARD_GUARD_MS: 22000
  },
  COSMOS: {
    MAX_EXECUTION_MS: 30000,
    HTTP_MS: 3000,
    SAFE_MARGIN_MS: 750,
    HARD_GUARD_MS: 25000
  },
  SVM: {
    MAX_EXECUTION_MS: 30000,
    HTTP_MS: 2000,
    SAFE_MARGIN_MS: 750,
    HARD_GUARD_MS: 25000
  }
};

// ============================================================
// HTTP BUDGET CONFIG - REMOVED (v4.13.2)
// Quota protection handled by QuotaCircuitBreaker (03E)
// ============================================================

// ============================================================
// ============================================================
// WCORE PRICE API URLS - Centralized API endpoints (v4.11.2)
// Single source of truth for all pricing API URLs
// ============================================================

var WCORE_PRICE_API_URLS = {
  // DefiLlama (primary for native tokens)
  DEFILLAMA_PRICES: 'https://coins.llama.fi/prices/current/',
  DEFILLAMA_BATCH: 'https://coins.llama.fi/prices/current/',
  
  // DexScreener (primary for DEX tokens)
  DEXSCREENER_TOKEN: 'https://api.dexscreener.com/latest/dex/tokens/',
  DEXSCREENER_PAIRS: 'https://api.dexscreener.com/latest/dex/pairs/',
  
  // GeckoTerminal (fallback for DEX tokens)
  GECKOTERMINAL_SIMPLE: 'https://api.geckoterminal.com/api/v2/simple/networks/',
  GECKOTERMINAL_TOKENS: 'https://api.geckoterminal.com/api/v2/networks/',
  
  // CoinGecko (general fallback)
  COINGECKO_SIMPLE: 'https://api.coingecko.com/api/v3/simple/price',
  COINGECKO_TOKEN: 'https://api.coingecko.com/api/v3/simple/token_price/',
  
  // Jupiter (Solana specific)
  JUPITER_PRICE: 'https://price.jup.ag/v4/price',
  JUPITER_QUOTE: 'https://quote-api.jup.ag/v6/quote',
  
  // FX Rate
  FX_RATE: 'https://open.er-api.com/v6/latest/USD'
};

// ============================================================
// STABLECOIN LISTS - Single source of truth
// ============================================================

var WCORE_STABLECOINS = {
  // Frax Finance 2025 rebrand: FRAX is now Fraxtal gas token; frxUSD is the USD stablecoin.
  USD: ['USD', 'USDC', 'USDC.E', 'USDT', 'DAI', 'frxUSD', 'FRXUSD', 'USDP', 'TUSD', 'LUSD', 'USDE', 'USDD',
        'GUSD', 'USDY', 'USDN', 'SUSD', 'BUSD', 'FDUSD', 'USDB', 'PYUSD', 'USDS', 'USDX',
        'USDbC', 'USDBC', 'USD+', 'CUSD', 'MUSD', 'EUSD', 'DOLA', 'MIM', 'CRVUSD', 'GHO',
        'PATHUSD', 'AZND'],
  EUR: ['EURC', 'EUROC', 'EURS', 'AGEUR', 'SEUR', 'EURA', 'JEUR', 'PAR'],
  
  getType: function(symbol) {
    var s = String(symbol || '').trim().toUpperCase();
    if (!s) return null;
    if (this.USD.indexOf(s) >= 0) return 'USD';
    if (this.EUR.indexOf(s) >= 0) return 'EUR';
    return null;
  },
  
  isStable: function(symbol) {
    return this.getType(symbol) !== null;
  }
};

// ============================================================
// HTTP BUDGET - REMOVED (v4.13.2) - Stub in 03A_HTTP_BUDGET.gs
// ============================================================

// ============================================================
// EVM ENGINE - Pre-declarations
// ============================================================

var EvmConfigBuilder = EvmConfigBuilder || {
  build: function(cfg) { return cfg || {}; },
  generateKeys: function(name) { 
    var prefix = String(name || "").toUpperCase();
    return {
      PREFIX: prefix + "_CACHE_",
      GLOBAL_PRICE: prefix + "_GLOBAL_PRICE_CACHE",
      META: prefix + "_META_CACHE",
      RPC_HEALTH: prefix + "_RPC_HEALTH_CACHE",
      LOCK_SUFFIX: "_LOCK",
      DYNAMIC_BUDGET_PREFIX: prefix + "_DYNAMIC_BUDGET_STATS_",
      NATIVE_PRICE: "native@" + String(name || "").toLowerCase().replace(/_/g, "-")
    };
  }
};

var EvmEngine = EvmEngine || {
  getWalletAssets: function() { return [["Error", "EvmEngine not loaded"]]; },
  getCachedWalletAssets: function() { return [["Error", "EvmEngine not loaded"]]; },
  getRefreshStatus: function() { return "N/A"; },
  getStats: function() { return [["Error", "EvmEngine not loaded"]]; }
};

var ConfigBuilder = EvmConfigBuilder;
var WalletEngine = EvmEngine;

// ============================================================
// SVM ENGINE - Pre-declarations (Solana)
// ============================================================

var SvmConfigBuilder = SvmConfigBuilder || {
  build: function(cfg) { return cfg || {}; },
  generateKeys: function(name) { 
    var prefix = String(name || "").toUpperCase();
    return {
      PREFIX: prefix + "_SVM_CACHE_",
      GLOBAL_PRICE: prefix + "_SVM_GLOBAL_PRICE_CACHE",
      META: prefix + "_SVM_META_CACHE",
      NATIVE_PRICE: "native@" + String(name || "").toLowerCase()
    };
  }
};

var SvmEngine = SvmEngine || {
  getWalletAssets: function() { return [["Error", "SvmEngine not loaded"]]; },
  getCachedWalletAssets: function() { return [["Error", "SvmEngine not loaded"]]; }
};

// ============================================================
// COSMOS ENGINE - Pre-declarations
// ============================================================

var CosmosConfigBuilder = CosmosConfigBuilder || {
  build: function(cfg) { return cfg || {}; },
  generateKeys: function(name) { 
    var prefix = String(name || "").toUpperCase();
    return {
      PREFIX: prefix + "_COSMOS_CACHE_",
      GLOBAL_PRICE: prefix + "_COSMOS_GLOBAL_PRICE_CACHE",
      META: prefix + "_COSMOS_META_CACHE",
      NATIVE_PRICE: "native@" + String(name || "").toLowerCase()
    };
  }
};

var CosmosEngine = CosmosEngine || {
  getWalletAssets: function() { return [["Error", "CosmosEngine not loaded"]]; },
  getCachedWalletAssets: function() { return [["Error", "CosmosEngine not loaded"]]; }
};

// ============================================================
// DIAGNOSTIC - Pre-declaration
// ============================================================

var Diagnostic = Diagnostic || {
  tokenBalance: function() { return [["Error", "Diagnostic not loaded"]]; },
  compareRpcs: function() { return [["Error", "Diagnostic not loaded"]]; },
  checkErc20: function() { return [["Error", "Diagnostic not loaded"]]; },
  rpcHealth: function() { return [["Error", "Diagnostic not loaded"]]; },
  nativeBalance: function() { return [["Error", "Diagnostic not loaded"]]; },
  cacheInspect: function() { return [["Error", "Diagnostic not loaded"]]; },
  cacheFindToken: function() { return [["Error", "Diagnostic not loaded"]]; },
  cacheListAssets: function() { return [["Error", "Diagnostic not loaded"]]; },
  tokenPrice: function() { return [["Error", "Diagnostic not loaded"]]; },
  nativePrice: function() { return [["Error", "Diagnostic not loaded"]]; },
  walletFull: function() { return [["Error", "Diagnostic not loaded"]]; },
  cacheStats: function() { return [["Error", "Diagnostic not loaded"]]; },
  clearCache: function() { return [["Error", "Diagnostic not loaded"]]; }
};

// ============================================================
// CLEANUP - Pre-declaration
// ============================================================

var CLEANUP = CLEANUP || {
  analyze: function() { return { error: "CLEANUP not loaded" }; },
  forceClean: function() { return { error: "CLEANUP not loaded" }; },
  purgeCategory: function() { return { error: "CLEANUP not loaded" }; },
  cleanCorrupted: function() { return { error: "CLEANUP not loaded" }; },
  getDetailedStats: function() { return [["Error", "CLEANUP not loaded"]]; }
};

// ============================================================
// STATS BUILDER - Pre-declaration
// ============================================================

var StatsBuilder = StatsBuilder || {
  build: function() { return [["Error", "StatsBuilder not loaded"]]; },
  buildEvm: function() { return [["Error", "StatsBuilder not loaded"]]; },
  buildSvm: function() { return [["Error", "StatsBuilder not loaded"]]; },
  buildCosmos: function() { return [["Error", "StatsBuilder not loaded"]]; }
};

// ============================================================
// CACHE OBJECTS
// ============================================================

var CacheManager = CacheManager || {};
var WalletCache = WalletCache || {};
var GlobalPriceCache = GlobalPriceCache || {};
var MetaCache = MetaCache || {};

// ============================================================
// CACHE VERIFY - Pre-declaration (v4.12.21)
// ============================================================

// ============================================================
// RPC OBJECTS
// ============================================================

var RpcClient = RpcClient || {};
var RpcSelector = RpcSelector || {};
var RpcHealth = RpcHealth || {};

// ============================================================
// PRICE OBJECTS
// ============================================================

var PriceManager = PriceManager || {};
var BulkPriceFetch = BulkPriceFetch || {};
var PriceSources = PriceSources || {};
var FxRate = FxRate || {};

// ============================================================
// TOKEN OBJECTS
// ============================================================

var TokenMeta = TokenMeta || {};
var TokenRange = TokenRange || {};
var TokenSelector = TokenSelector || {};
var AbiDecode = AbiDecode || {};

// ============================================================
// ASSET OBJECTS
// ============================================================

var AssetManager = AssetManager || {};
var BalanceFetcher = BalanceFetcher || {};

// ============================================================
// OUTPUT OBJECTS
// ============================================================

var OutputBuilder = OutputBuilder || {};

// ============================================================
// WALLET NAMES
// ============================================================

var WalletNames = WalletNames || {};
var WALLET_REGISTRY = WALLET_REGISTRY || {};

// ============================================================
// UTILS - Pre-declarations
// ============================================================

var Num = Num || {};
var BigNum = BigNum || {};
var Addr = Addr || {};
var Format = Format || {};
var Bool = Bool || {};
var Obj = Obj || {};
var Arr = Arr || {};
var Safe = Safe || {};

// Logging utility (UTF-8 fixed - using text labels instead of emojis)
var Log = Log || {
  _enabled: true,
  _prefix: '[WCORE]',
  enable: function() { this._enabled = true; },
  disable: function() { this._enabled = false; },
  info: function(m, msg) { if(this._enabled) try{Logger.log(this._prefix+' ['+m+'] '+msg);}catch(e){} },
  warn: function(m, msg) { if(this._enabled) try{Logger.log(this._prefix+' ['+m+'] WARN '+msg);}catch(e){} },
  error: function(m, msg, e) { try{Logger.log(this._prefix+' ['+m+'] ERROR '+msg+(e?' - '+(e.message||e):''));}catch(ex){} },
  debug: function(m, msg) { if(this._enabled) try{Logger.log(this._prefix+' ['+m+'] DEBUG '+msg);}catch(e){} }
};

var createTimer = createTimer || function() { 
  return { 
    remaining: function() { return 30000; }, 
    elapsed: function() { return 0; } 
  }; 
};

// ============================================================
// DEFAULT CONFIGS - Pre-declarations
// ============================================================

var DEFAULT_CONFIG = DEFAULT_CONFIG || {};
var SVM_DEFAULT_CONFIG = SVM_DEFAULT_CONFIG || {};
var COSMOS_DEFAULT_CONFIG = COSMOS_DEFAULT_CONFIG || {};

// ============================================================
// LATE INITIALIZATION
// Called after all files are loaded
// ============================================================

/**
 * Initialize WCORE subsystems
 * Call this manually or it's called automatically on first use
 */
function WCORE_INIT() {
  var results = {
    version: WCORE_VERSION.toString(),
    cacheGuard: false,
    cacheVerify: false
  };
  
  // Initialize Cache Protection
  try {
    if (typeof INSTALL_CACHE_PROTECTION === 'function') {
      INSTALL_CACHE_PROTECTION();
      results.cacheGuard = true;
    }
  } catch (e) {
    // Silently fail - protection is optional but recommended
  }
  
  // Initialize Cache Write Verification (v4.12.21)
  try {
    if (typeof INIT_CACHE_VERIFY === 'function') {
      INIT_CACHE_VERIFY();
      results.cacheVerify = true;
    }
  } catch (e) {
    // Silently fail - verification is optional but recommended
  }
  
  return results;
}

/**
 * Check system health status
 * @returns {Array} 2D array for dashboard
 * @customfunction
 */
function WCORE_HEALTH() {
  var rows = [
    ["Component", "Status", "Details"],
    ["Version", WCORE_VERSION.toString(), "WCORE"],
    ["CacheVersion", WCORE_CACHE_VERSION, "wallet cache version"],
    ["Modules", "Checking...", ""],
    ["Cache Guard", "Checking...", ""],
    ["Quota Status", "Checking...", ""],
    ["Dynamic RPC", "Checking...", ""]
  ];

  // Check Modules
  try {
    var modCount = (typeof ModuleRegistry !== "undefined") ? ModuleRegistry.count() : 0;
    rows[3] = ["Modules", modCount + " registered", "via ModuleRegistry"];
  } catch (e) {
    rows[3] = ["Modules", "Error", e.message];
  }

  // Check Cache Guard
  try {
    if (typeof CacheGuard !== "undefined" && CacheGuard.getStats) {
      var cStats = CacheGuard.getStats();
      rows[4] = ["Cache Guard", "Active", cStats.blockedSaves + " saves blocked"];
    } else {
      rows[4] = ["Cache Guard", "Not loaded", ""];
    }
  } catch (e) {
    rows[4] = ["Cache Guard", "Error", e.message];
  }

  // Check Quota Status
  try {
    if (typeof QuotaCircuitBreaker !== "undefined" && QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped()) {
      rows[5] = ["Quota Status", "WARN BREAKER TRIPPED", "GET_QUOTA_BREAKER_STATUS for details"];
    } else if (typeof HttpErrorGuard !== "undefined" && HttpErrorGuard.isQuotaExhausted) {
      var exhausted = HttpErrorGuard.isQuotaExhausted();
      rows[5] = ["Quota Status", exhausted ? "WARN EXHAUSTED" : "OK", ""];
    } else if (typeof IS_QUOTA_EXHAUSTED === "function") {
      rows[5] = ["Quota Status", IS_QUOTA_EXHAUSTED() ? "WARN EXHAUSTED" : "OK", ""];
    } else {
      rows[5] = ["Quota Status", "Unknown", "Guard not loaded"];
    }
  } catch (e) {
    rows[5] = ["Quota Status", "Error", e.message];
  }

  // Check Dynamic RPC
  try {
    if (typeof DYNAMIC_RPC_STATUS === "function") {
      var drpcStatus = DYNAMIC_RPC_STATUS();
      rows[6] = ["Dynamic RPC", drpcStatus.substring(0, 40), ""];
    } else {
      rows[6] = ["Dynamic RPC", "Not loaded", ""];
    }
  } catch (e) {
    rows[6] = ["Dynamic RPC", "Error", e.message];
  }

  // Log for Apps Script editor visibility
  for (var h = 1; h < rows.length; h++) {
    console.log("[WCORE_HEALTH] " + rows[h][0] + ": " + rows[h][1] + (rows[h][2] ? " (" + rows[h][2] + ")" : ""));
  }

  return rows;
}

/**
 * Version check diagnostic function
 * Verifies all version constants are synchronized
 * @returns {Array} 2D array with version check results
 * @customfunction
 */

/**
 * Quick check if system is safe to make HTTP calls (v4.12.8)
 * @param {string} priority - "critical", "high", "normal", "low" (default: "normal")
 * @returns {Object} { safe: boolean, reason: string }
 */
function WCORE_IS_SAFE(priority) {
  try {
    var _prio = String(priority || "normal").toLowerCase();
    if (typeof WcoreHttpMode !== 'undefined' && WcoreHttpMode.getMode) {
      var mode = WcoreHttpMode.getEffectiveMode ? WcoreHttpMode.getEffectiveMode() : WcoreHttpMode.getMode();
      // v4.15.62: in recovery mode, CACHE_ONLY is acceptable (no HTTP needed for
      // the recovery sweep / J1 sync / B1 pulse). Blocking the watchdog on a
      // tripped breaker is what froze everything on 2026-06-01 — the watchdog
      // needs to run to *clear* the trip.
      if (mode === "CACHE_ONLY" && _prio !== "recovery") {
        return { safe: false, reason: "HTTP_MODE_CACHE_ONLY", mode: mode };
      }
      if (!WcoreHttpMode.isAllowed(_prio)) return { safe: false, reason: "HTTP_MODE_" + mode, mode: mode };
    }
  } catch (eMode) {}
  // v4.13.5: Uses centralized BaseEngine check
  var reason = (typeof BaseEngine !== 'undefined' && BaseEngine.detectBlockReason) 
    ? BaseEngine.detectBlockReason() : "";
  if (reason) {
    return { safe: false, reason: reason };
  }
  try {
    if (typeof HttpCallCounter !== 'undefined' && HttpCallCounter.getToday && HttpCallCounter.getQuota) {
      var used = HttpCallCounter.getToday();
      var quota = HttpCallCounter.getQuota();
      if (quota > 0) {
        var p = String(priority || "normal").toLowerCase();
        var threshold = 0.80;
        if (p === "critical") threshold = 0.99;
        else if (p === "high") threshold = 0.90;
        else if (p === "low") threshold = 0.70;
        if ((used / quota) >= threshold) {
          return {
            safe: false,
            reason: "HTTP_BUDGET_" + Math.round((used / quota) * 100) + "%",
            used: used,
            quota: quota,
            threshold: threshold
          };
        }
      }
    }
  } catch (eBudget) {}
  return { safe: true, reason: "OK" };
}

/**
 * Custom function for Sheet formulas
 * @returns {string}
 * @customfunction
 */
function IS_WCORE_SAFE() {
  var result = WCORE_IS_SAFE("normal");
  return result.safe ? "OK" : "[!] " + result.reason;
}

function WCORE_VERSION_CHECK() {
  var targetVersion = WCORE_VERSION.MAJOR + '.' + WCORE_VERSION.MINOR + '.' + WCORE_VERSION.PATCH;
  var results = [
    ["Component", "Version", "Expected", "Status"]
  ];
  
  // Check WCORE_VERSION
  var wcoreVer = WCORE_VERSION.toString();
  results.push([
    "WCORE_VERSION",
    wcoreVer,
    'v' + targetVersion,
    wcoreVer === 'v' + targetVersion ? "OK" : "MISMATCH"
  ]);
  
  // Check CACHE_VERSIONS.CORE
  var cacheCore = CACHE_VERSIONS.CORE;
  results.push([
    "CACHE_VERSIONS.CORE",
    cacheCore,
    targetVersion,
    cacheCore === targetVersion ? "OK" : "MISMATCH"
  ]);
  
  // Check BaseEngine if loaded
  try {
    if (typeof BaseEngine !== "undefined" && BaseEngine.VERSION) {
      results.push([
        "BaseEngine.VERSION",
        BaseEngine.VERSION,
        targetVersion,
        BaseEngine.VERSION === targetVersion ? "OK" : "MISMATCH"
      ]);
    } else {
      results.push(["BaseEngine.VERSION", "Not loaded", targetVersion, "N/A"]);
    }
  } catch (e) {
    results.push(["BaseEngine.VERSION", "Error", targetVersion, e.message]);
  }
  
  // Check ChainFactory if loaded
  try {
    if (typeof ChainFactory !== "undefined" && ChainFactory.VERSION) {
      results.push([
        "ChainFactory.VERSION",
        ChainFactory.VERSION,
        targetVersion,
        ChainFactory.VERSION === targetVersion ? "OK" : "MISMATCH"
      ]);
    } else {
      results.push(["ChainFactory.VERSION", "Not loaded", targetVersion, "N/A"]);
    }
  } catch (e) {
    results.push(["ChainFactory.VERSION", "Error", targetVersion, e.message]);
  }
  
  // Check VM Cache Versions
  results.push(["---", "VM Cache Versions", "---", "---"]);
  results.push(["WCORE_VM_CACHE_VERSIONS.EVM", WCORE_VM_CACHE_VERSIONS.EVM, "64", WCORE_VM_CACHE_VERSIONS.EVM === 64 ? "OK" : "INFO"]);
  results.push(["WCORE_VM_CACHE_VERSIONS.SVM", WCORE_VM_CACHE_VERSIONS.SVM, "65", WCORE_VM_CACHE_VERSIONS.SVM === 65 ? "OK" : "INFO"]);
  results.push(["WCORE_VM_CACHE_VERSIONS.COSMOS", WCORE_VM_CACHE_VERSIONS.COSMOS, "68", WCORE_VM_CACHE_VERSIONS.COSMOS === 68 ? "OK" : "INFO"]);
  
  // Show refresh config summary - v4.12.29: Updated for 2h refresh cycle alignment
  results.push(["---", "Refresh Config (2h cycle aligned)", "---", "---"]);
  results.push(["WALLET_TTL", (WCORE_CACHE_CONFIG.WALLET_TTL_MS / 3600000) + "h", "3h", "OK"]);
  results.push(["PRICE_TTL", (WCORE_CACHE_CONFIG.PRICE_TTL_MS / 3600000) + "h", "2h", "OK"]);
  results.push(["PRICE_STALE", (WCORE_CACHE_CONFIG.PRICE_STALE_MS / 60000) + "min", "15min", "OK"]);
  results.push(["FULL_SCAN_INTERVAL", (WCORE_CACHE_CONFIG.FULL_SCAN_INTERVAL_MS / 3600000) + "h", "8h", "OK"]);
  results.push(["FULL_PRICE_INTERVAL", (WCORE_CACHE_CONFIG.FULL_PRICE_INTERVAL_MS / 3600000) + "h", "6h", "OK"]);
  results.push(["MIN_REFRESH_INTERVAL", (WCORE_CACHE_CONFIG.MIN_REFRESH_INTERVAL_MS / 1000) + "s", "30s", "OK"]);
  
  return results;
}

function TEST_LOAD() {
  Logger.log("WCORE_VERSION: " + (typeof WCORE_VERSION));
  Logger.log("PriceManager: " + (typeof PriceManager));
  Logger.log("QuotaCircuitBreaker: " + (typeof QuotaCircuitBreaker));
}

function EMERGENCY_RESET_QUOTA() {
  // Reset QuotaCircuitBreaker
  if (typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.reset) {
    QuotaCircuitBreaker.reset();
  }
  
  // Reset HttpErrorGuard
  if (typeof HttpErrorGuard !== 'undefined' && HttpErrorGuard.reset) {
    HttpErrorGuard.reset();
  }
  
  // Reset DegradedMode
  if (typeof DegradedMode !== 'undefined' && DegradedMode.resetCircuitBreaker) {
    DegradedMode.resetCircuitBreaker();
  }
  
  // Clean orphan Fortress properties
  var props = PropertiesService.getScriptProperties();
  ['FORTRESS_STATE', 'FORTRESS_QUOTA_EXHAUSTED_v1', 'FORTRESS_EXHAUSTED_AT_v1', 
   'FORTRESS_EXHAUSTED_DATE_v1', 'FORTRESS_LAST_RECOVERY_CHECK_v1'].forEach(function(k) {
    try { props.deleteProperty(k); } catch(e) {}
  });
  
  return "Quota reset - all protection layers cleared";
}

// v4.13.5: FULL_FORTRESS_RESET removed - CacheFortress (03C) has been removed.
// Use EMERGENCY_RESET_QUOTA() instead.

function TEST_FETCHALLSAFE_EXISTS() {
  if (typeof Http !== 'undefined' && typeof Http.fetchAllSafe === 'function') {
    return "[OK] Http.fetchAllSafe EXISTS - 03_HTTP.gs v4.12.10 deployed";
  } else if (typeof Http !== 'undefined') {
    return "[!] Http exists but fetchAllSafe MISSING - deploy new 03_HTTP.gs!";
  } else {
    return "[!] Http not defined - critical error";
  }
}

function TEST_08_ASSETS_VERSION() {
  // Check if getErc20Balances uses fetchAllSafe by examining the code
  var source = BalanceFetcher.getErc20Balances.toString();
  
  if (source.indexOf('fetchAllSafe') !== -1) {
    return "[OK] 08_ASSETS.gs v4.12.10 - uses fetchAllSafe";
  } else if (source.indexOf('fetchAll') !== -1) {
    return "[!] 08_ASSETS.gs OLD - still uses fetchAll (not Safe)";
  } else {
    return "[?] Cannot determine - check manually";
  }
}
