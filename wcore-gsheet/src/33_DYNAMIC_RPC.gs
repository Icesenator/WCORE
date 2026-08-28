/************************************************************
 * 33_DYNAMIC_RPC.gs - Dynamic RPC Endpoint Discovery
 *
 * v4.15.38 - FORCE_UPDATE_DYNAMIC_RPCS (bypass staleness gate, no wallet cache purge) + diagnostic counters
 * v4.15.37 - replaceTested for latency-tested chains (no 2-miss grace)
 * v4.15.36 - Strict endpoint validation (eth_chainId + eth_blockNumber)
 * v4.15.35 - Weekly staleness 25d -> 7d
 * v4.15.34 - Lazy testing: rotation-based sampling (1/3 chains per cycle, ~80 HTTP calls vs ~250)
 * v4.15.6 - instrumentation HttpCallCounter per-trigger
 * v4.15.5 - Individual fetch for accurate per-RPC latency measurement
 * v4.15.3 - Chainlist RPCs now PRIMARY, hardcoded as fallback + retry on fetch fail
 *
 * Fetches public RPC endpoints from chainid.network/chains.json
 * and stores them in ScriptProperties for long-term use.
 * RpcSelector merges these with hardcoded config.RPC.ENDPOINTS.
 *
 * Storage: ~5-10 KB in ScriptProperties (key: DYNAMIC_RPC_MAP)
 * HTTP cost: 1 call per ~7 days (weekly trigger with 7-day staleness check)
 * TTL: 30 days (auto-expires if trigger stops running)
 *
 * IMPORTANT: Chainlist RPCs are PRIMARY (community-maintained, up-to-date).
 * Hardcoded RPCs are FALLBACK (stable baseline). Both filtered by RpcHealth.
 ************************************************************/
var DYNAMIC_RPC_VERSION = "4.15.38";

function _dynamicRpcCanFetch_(reason) {
  try {
    if (typeof BudgetHTTP !== "undefined" && BudgetHTTP.allow && !BudgetHTTP.allow("admin")) return false;
  } catch (eB) {}
  try {
    if (typeof Http !== "undefined" && Http.canFetchNow) return Http.canFetchNow(reason || "dynamic-rpc");
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

// ============================================================
// DYNAMIC RPC STORE - Persistent storage in ScriptProperties
// ============================================================

var DynamicRpcStore = (function() {
  var _KEY = "DYNAMIC_RPC_MAP";
  var _TTL_MS = 30 * 24 * 3600 * 1000; // 30 days
  var _cache = null;

  function _load() {
    if (_cache !== null) return;
    try {
      var raw = PropertiesService.getScriptProperties().getProperty(_KEY);
      if (raw) {
        _cache = JSON.parse(raw);
        // Check TTL
        if (_cache._updatedAt && (Date.now() - _cache._updatedAt) > _TTL_MS) {
          _cache = { _updatedAt: 0 }; // Expired
        }
      } else {
        _cache = { _updatedAt: 0 };
      }
    } catch (e) {
      _cache = { _updatedAt: 0 };
    }
  }

  function _save() {
    try {
      PropertiesService.getScriptProperties().setProperty(_KEY, JSON.stringify(_cache));
    } catch (e) {}
  }

  return {
    /**
     * Get dynamic RPCs for a chain by CHAIN_ID
     * @param {number} chainId - EVM chain ID
     * @returns {Array<string>} RPC URLs (may be empty)
     */
    get: function(chainId) {
      _load();
      var key = String(chainId);
      var entry = _cache[key];
      if (!entry || !entry.rpcs) return [];
      return entry.rpcs;
    },

    /**
     * Set dynamic RPCs for a chain (full replace, no merge)
     * @param {number} chainId - EVM chain ID
     * @param {Array<string>} rpcs - Public RPC URLs
     */
    set: function(chainId, rpcs) {
      _load();
      _cache[String(chainId)] = { rpcs: rpcs, absent: {} };
    },

    /**
     * Merge new chainlist RPCs with existing cached RPCs.
     * Uses shared _mergeList logic (2-miss removal).
     *
     * @param {number} chainId - EVM chain ID
     * @param {Array<string>} freshRpcs - RPCs from latest chainlist fetch
     * @returns {{ added: number, removed: number }} merge stats
     */
    merge: function(chainId, freshRpcs) {
      _load();
      var key = String(chainId);
      var entry = _cache[key] || { rpcs: [], absent: {} };
      if (!entry.absent) entry.absent = {};

      var result = this._mergeList(entry.rpcs || [], freshRpcs, entry.absent, "");
      entry.rpcs = result.kept;
      entry.absent = result.newAbsent;
      _cache[key] = entry;

      return { added: result.added, removed: result.removed };
    },

    /**
     * v4.15.37: Replace the dynamic RPC list for a chain that was just
     * latency-tested. The validated RPCs become the authoritative set;
     * any endpoint not in the list is removed without 2-miss grace.
     *
     * @param {number} chainId
     * @param {Array<string>} validatedRpcs
     * @returns {{added: number, removed: number}}
     */
    replaceTested: function(chainId, validatedRpcs) {
      _load();
      var key = String(chainId);
      var previous = _cache[key] || { rpcs: [], absent: {} };
      var oldList = previous.rpcs || [];
      var next = (validatedRpcs || []).slice();
      var oldSet = {};
      var nextSet = {};
      for (var i = 0; i < oldList.length; i++) oldSet[oldList[i]] = true;
      for (var j = 0; j < next.length; j++) nextSet[next[j]] = true;
      var added = 0;
      var removed = 0;
      for (var a = 0; a < next.length; a++) if (!oldSet[next[a]]) added++;
      for (var r = 0; r < oldList.length; r++) if (!nextSet[oldList[r]]) removed++;
      _cache[key] = { rpcs: next, absent: {} };
      return { added: added, removed: removed };
    },

    /**
     * Get dynamic REST URLs for a Cosmos chain by name
     * @param {string} chainName - e.g. "COSMOS_HUB"
     * @returns {{ rest: Array<string>, rpc: Array<string> }}
     */
    getCosmos: function(chainName) {
      _load();
      var key = "cosmos:" + chainName;
      var entry = _cache[key];
      if (!entry) return { rest: [], rpc: [] };
      return { rest: entry.rest || [], rpc: entry.rpc || [] };
    },

    /**
     * Merge Cosmos chain registry endpoints (same 2-miss logic as EVM)
     * @param {string} chainName - e.g. "COSMOS_HUB"
     * @param {Array<string>} freshRest - REST URLs from registry
     * @param {Array<string>} freshRpc - RPC URLs from registry
     * @returns {{ added: number, removed: number }}
     */
    mergeCosmos: function(chainName, freshRest, freshRpc) {
      _load();
      var key = "cosmos:" + chainName;
      var entry = _cache[key] || { rest: [], rpc: [], absent: {} };
      if (!entry.absent) entry.absent = {};

      var stats = { added: 0, removed: 0 };

      // Merge REST URLs
      var restResult = this._mergeList(entry.rest, freshRest, entry.absent, "rest:");
      entry.rest = restResult.kept;
      stats.added += restResult.added;
      stats.removed += restResult.removed;

      // Merge RPC URLs
      var rpcResult = this._mergeList(entry.rpc, freshRpc, entry.absent, "rpc:");
      entry.rpc = rpcResult.kept;
      stats.added += rpcResult.added;
      stats.removed += rpcResult.removed;

      // Clean absent keys that are no longer relevant
      entry.absent = {};
      for (var ak in restResult.newAbsent) entry.absent[ak] = restResult.newAbsent[ak];
      for (var bk in rpcResult.newAbsent) entry.absent[bk] = rpcResult.newAbsent[bk];

      _cache[key] = entry;
      return stats;
    },

    /**
     * Internal: merge a URL list with 2-miss removal logic
     * @private
     */
    _mergeList: function(oldList, freshList, absentMap, prefix) {
      var freshSet = {};
      for (var i = 0; i < freshList.length; i++) freshSet[freshList[i]] = true;
      var oldSet = {};
      for (var j = 0; j < oldList.length; j++) oldSet[oldList[j]] = true;

      var newAbsent = {};
      var kept = [];
      var removed = 0;

      for (var k = 0; k < oldList.length; k++) {
        var url = oldList[k];
        if (freshSet[url]) {
          kept.push(url);
        } else {
          var prevMiss = absentMap[prefix + url] || 0;
          if (prevMiss + 1 >= 2) {
            removed++;
          } else {
            kept.push(url);
            newAbsent[prefix + url] = prevMiss + 1;
          }
        }
      }

      var added = 0;
      for (var n = 0; n < freshList.length; n++) {
        if (!oldSet[freshList[n]]) {
          kept.push(freshList[n]);
          added++;
        }
      }

      return { kept: kept, added: added, removed: removed, newAbsent: newAbsent };
    },

    /**
     * Finalize and save to ScriptProperties
     */
    save: function() {
      _cache._updatedAt = Date.now();
      _save();
    },

    /**
     * Get last update timestamp
     */
    getUpdatedAt: function() {
      _load();
      return _cache._updatedAt || 0;
    },

    /**
     * v4.15.34: Rotation-based lazy testing — only test 1/3 of chains per cycle
     * @returns {number} current rotation index (0, 1, or 2)
     */
    getRotationIndex: function() {
      _load();
      return _cache._rotationIndex || 0;
    },

    /**
     * Advance the rotation index for next cycle (wraps 0→1→2→0)
     * @returns {number} new rotation index
     */
    advanceRotation: function() {
      _load();
      var next = ((_cache._rotationIndex || 0) + 1) % 3;
      _cache._rotationIndex = next;
      return next;
    },

    /**
     * Get all stored data (for diagnostics)
     */
    getAll: function() {
      _load();
      return _cache;
    },

    /**
     * Get storage size in bytes (approximate)
     */
    getSize: function() {
      _load();
      try { return JSON.stringify(_cache).length; } catch (e) { return 0; }
    },

    /**
     * Clear all dynamic RPCs
     */
    clear: function() {
      _cache = { _updatedAt: 0 };
      _save();
      return "Dynamic RPC store cleared";
    },

    /**
     * Force reload from ScriptProperties
     */
    reload: function() {
      _cache = null;
      _load();
    }
  };
})();


// ============================================================
// CHAINLIST FETCHER - Fetch and filter public RPCs
// ============================================================

var _DynamicRpcFetcher = {

  SOURCE_URL: "https://chainid.network/chains.json",

  /**
   * Fetch chains.json and extract public RPCs for our chain IDs
   * @param {Array<number>} ourChainIds - Chain IDs we care about
   * @returns {Object} { chainId: [rpc1, rpc2, ...], ... }
   */
  fetch: function(ourChainIds) {
    if (!_dynamicRpcCanFetch_("dynamic-rpc-chainlist")) {
      throw new Error("HTTP blocked before chainlist fetch");
    }
    var resp = UrlFetchApp.fetch(this.SOURCE_URL, {
      muteHttpExceptions: true,
      deadline: 10
    });

    if (!resp || resp.getResponseCode() !== 200) {
      throw new Error("chainlist fetch failed: HTTP " + (resp ? resp.getResponseCode() : "null"));
    }

    var chains = JSON.parse(resp.getContentText());
    if (!Array.isArray(chains)) {
      throw new Error("chainlist: expected array, got " + typeof chains);
    }

    // Build lookup set for fast membership check
    var idSet = {};
    for (var i = 0; i < ourChainIds.length; i++) {
      idSet[String(ourChainIds[i])] = true;
    }

    // Extract public RPCs for our chains
    var result = {};
    for (var c = 0; c < chains.length; c++) {
      var chain = chains[c];
      if (!chain || !chain.chainId) continue;
      var cid = String(chain.chainId);
      if (!idSet[cid]) continue;

      var rpcs = this._filterPublicRpcs(chain.rpc || []);
      if (rpcs.length > 0) {
        result[cid] = rpcs;
      }
    }

    return result;
  },

  /**
   * Filter RPC URLs: keep only public HTTPS endpoints
   * - No ${...} (requires API key)
   * - No wss:// (WebSocket)
   * - No http:// (insecure)
   * - Max 8 per chain (no need for more)
   */
  _filterPublicRpcs: function(rpcList) {
    var filtered = [];
    for (var i = 0; i < rpcList.length && filtered.length < 8; i++) {
      var url = rpcList[i];
      // Handle object format: { url: "...", tracking: "..." }
      if (typeof url === "object" && url !== null) url = url.url;
      if (typeof url !== "string") continue;

      url = url.trim();
      // Skip non-HTTPS
      if (url.indexOf("https://") !== 0) continue;
      // Skip API key required
      if (url.indexOf("${") >= 0) continue;
      // Skip known broken patterns
      if (url.indexOf("localhost") >= 0) continue;
      if (url.indexOf("127.0.0.1") >= 0) continue;

      filtered.push(url);
    }
    return filtered;
  }
};


// ============================================================
// COSMOS CHAIN REGISTRY FETCHER
// ============================================================

var _CosmosRegistryFetcher = {

  BASE_URL: "https://raw.githubusercontent.com/cosmos/chain-registry/master/",

  /**
   * Cosmos chain registry directory names for our chains
   * Key = internal chain name, value = registry directory
   */
  CHAIN_MAP: {
    "COSMOS_HUB": "cosmoshub",
    "OSMOSIS": "osmosis",
    "TERRA": "terra2",
    "INJECTIVE": "injective"
  },

  /**
   * Fetch REST endpoints from Cosmos Chain Registry for all our Cosmos chains
   * @returns {Object} { chainName: { rest: [url, ...], rpc: [url, ...] } }
   */
  fetchAll: function() {
    var result = {};
    var urls = [];
    var names = [];

    // Build fetch list
    for (var name in this.CHAIN_MAP) {
      if (!this.CHAIN_MAP.hasOwnProperty(name)) continue;
      var dir = this.CHAIN_MAP[name];
      urls.push(this.BASE_URL + dir + "/chain.json");
      names.push(name);
    }

    // Parallel fetch via fetchAll
    var requests = [];
    for (var i = 0; i < urls.length; i++) {
      requests.push({ url: urls[i], muteHttpExceptions: true, deadline: 10 });
    }

    var responses;
    if (!_dynamicRpcCanFetch_("dynamic-rpc-cosmos-registry")) return result;
    try {
      responses = UrlFetchApp.fetchAll(requests);
    } catch (e) {
      return result; // Fail gracefully
    }

    // Parse responses
    for (var r = 0; r < responses.length; r++) {
      if (!responses[r] || responses[r].getResponseCode() !== 200) continue;
      try {
        var chain = JSON.parse(responses[r].getContentText());
        var apis = chain && chain.apis;
        if (!apis) continue;

        var restUrls = this._extractUrls(apis.rest || []);
        var rpcUrls = this._extractUrls(apis.rpc || []);

        if (restUrls.length > 0 || rpcUrls.length > 0) {
          result[names[r]] = { rest: restUrls, rpc: rpcUrls };
        }
      } catch (e) {
        // Skip unparseable
      }
    }

    return result;
  },

  /**
   * Extract HTTPS URLs from Cosmos registry endpoint array
   * Format: [{ address: "https://...", provider: "..." }, ...]
   * Max 8 per type
   */
  _extractUrls: function(endpoints) {
    var filtered = [];
    for (var i = 0; i < endpoints.length && filtered.length < 8; i++) {
      var entry = endpoints[i];
      if (!entry || !entry.address) continue;
      var url = String(entry.address).trim();
      // Remove trailing slash for consistency
      if (url.charAt(url.length - 1) === '/') url = url.substring(0, url.length - 1);
      // HTTPS only
      if (url.indexOf("https://") !== 0) continue;
      if (url.indexOf("localhost") >= 0) continue;
      filtered.push(url);
    }
    return filtered;
  }
};


// ============================================================
// CHAIN ID COLLECTOR - Get our chain IDs from configs
// ============================================================

/**
 * Collect all CHAIN_IDs from loaded chain configs.
 * Uses the same chain list as BUILD_RPC_LOOKUP in 27_ACTIVITY_REFRESH.gs
 */
function _dynamicRpcGetOurChainIds() {
  var chainNames = [
    "ETHEREUM", "ARBITRUM_ONE", "BASE", "OPTIMISM", "POLYGON", "BSC",
    "AVALANCHE", "GNOSIS", "ARBITRUM_NOVA", "ZKSYNC_ERA", "LINEA",
    "SCROLL", "BLAST", "MANTA_PACIFIC", "MODE", "FRAXTAL", "METIS",
    "MANTLE", "CELO", "CITREA", "MOONBEAM", "MOONRIVER", "FUSE", "BOBA",
    "AURORA", "CRONOS", "PULSECHAIN", "RONIN", "KAIA", "ASTAR",
    "FLARE", "ZETACHAIN", "KCC", "ROOTSTOCK", "SHIBARIUM", "OPBNB",
    "TAIKO_ALETHIA", "SEI", "SONIC",
    "BOB", "LISK", "SHAPE", "ZORA",
    "CYBER", "DEGEN", "ABSTRACT", "APECHAIN", "BERACHAIN",
    "INK", "SONEIUM", "UNICHAIN", "WORLDCHAIN", "HYPEREVM",
    "MORPH", "STORY", "PLUME", "HEMI", "SWELLCHAIN", "ETHERLINK",
    "GRAVITY", "IMMUTABLE", "BITLAYER", "MERLIN", "B2", "BOTANIX",
    "X_LAYER", "FLOW", "VANA", "MEGAETH", "MONAD", "SOMNIA",
    "CAMP", "HASHKEY", "ANCIENT8", "BEAM",
    "DUCKCHAIN", "GEB", "MATCHAIN", "METAL_L2", "MEZO", "MITOSIS",
    "PLASMA", "RACE", "REYA", "STABLE", "SUPERPOSITION",
    "SUPERSEED", "SWAN", "TAC", "ZKLINKNOVA", "XRPLEVM", "ZIRCUIT",
    "LENS", "APPCHAIN", "B3", "DBK_CHAIN", "DOMA",
    "INTUITION", "KATANA", "OPENLEDGER"
  ];

  var ids = [];
  for (var i = 0; i < chainNames.length; i++) {
    try {
      var obj = eval("_" + chainNames[i]);
      if (obj && obj.getConfig) {
        var cfg = obj.getConfig();
        if (cfg && cfg.CHAIN && cfg.CHAIN.CHAIN_ID) {
          var cid = Number(cfg.CHAIN.CHAIN_ID);
          if (isFinite(cid) && cid > 0) ids.push(cid);
        }
      }
    } catch (e) {
      // Chain not loaded (trigger context) - skip
    }
  }

  // Fallback: if eval() fails (trigger context), use hardcoded critical IDs
  if (ids.length < 10) {
    ids = [
      1, 10, 56, 100, 137, 204, 250, 288, 324, 369,
      534352, 1088, 1101, 1135, 1284, 1285, 1329, 1625,
      2020, 2818, 4114, 4337, 5000, 7000, 7560, 7777777, 8217,
      8453, 13371, 25, 30, 42161, 42170, 42220, 42793,
      43114, 59144, 80094, 81457, 109, 122, 146, 169,
      252, 592, 690, 747, 999, 1514, 1868, 1923,
      33139, 34443, 57073, 60808, 130, 480, 177, 223,
      1380012617, 888888888, 666666666, 200901, 4200, 196,
      43111, 1440000, 239, 232, 228, 143, 50311, 98866
    ];
  }

  return ids;
}


// ============================================================
// PUBLIC FUNCTIONS
// ============================================================

/**
 * UPDATE_DYNAMIC_RPCS() - Fetch chainlist and update dynamic RPC store
 *
 * Call via time-based trigger (weekly recommended) or manually.
 * Safe to call anytime - won't disrupt active scans.
 * Retries once after 5s if first fetch fails.
 *
 * @returns {string} Status message
 */

// ============================================================
// Phase 2: LATENCY TESTING — only keep responsive RPCs, sorted by speed
// ============================================================

/**
 * Validate a single RPC endpoint with strict two-call check:
 *   1. eth_chainId must match the expected chainId.
 *   2. eth_blockNumber must be strictly positive.
 *
 * v4.15.36 - Strict endpoint validation (chainId + blockNumber).
 * Replaces the lightweight eth_chainId-only check that was hiding
 * endpoints returning the wrong chain (Degen served by Polygon) and
 * HTTP-200 endpoints with empty / non-JRPC bodies.
 *
 * @param {string} url - RPC URL to test
 * @param {number} expectedChainId - EVM chain ID we expect this RPC to serve
 * @param {number} deadlineMs - Optional per-call deadline in ms (default 3000)
 * @returns {{ok: boolean, reason: string, latency: number, blockNumber: number}}
 *          reason values: "ok" | "http_error" | "chain_id_mismatch"
 *                        | "invalid_block_number" | "fetch_error" | "quota_blocked"
 */
function _dynamicRpcValidateEndpoint_(url, expectedChainId, deadlineMs) {
  var deadlineS = Math.max(1, Math.ceil(Number(deadlineMs || 3000) / 1000));
  var startedAt = Date.now();
  if (!_dynamicRpcCanFetch_("dynamic-rpc-latency")) {
    return { ok: false, reason: "quota_blocked", latency: 0, blockNumber: 0 };
  }
  try {
    var chainResp = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      muteHttpExceptions: true,
      deadline: deadlineS
    });
    if (!chainResp || chainResp.getResponseCode() !== 200) {
      return { ok: false, reason: "http_error", latency: Date.now() - startedAt, blockNumber: 0 };
    }
    var chainBody = JSON.parse(chainResp.getContentText());
    var chainResult = chainBody && chainBody.result;
    var parsedChainId = parseInt(String(chainResult || ""), 16);
    if (!isFinite(parsedChainId) || parsedChainId !== Number(expectedChainId)) {
      return { ok: false, reason: "chain_id_mismatch", latency: Date.now() - startedAt, blockNumber: 0 };
    }
    var blockResp = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] }),
      muteHttpExceptions: true,
      deadline: deadlineS
    });
    if (!blockResp || blockResp.getResponseCode() !== 200) {
      return { ok: false, reason: "http_error", latency: Date.now() - startedAt, blockNumber: 0 };
    }
    var blockBody = JSON.parse(blockResp.getContentText());
    var blockResult = blockBody && blockBody.result;
    var blockNumber = parseInt(String(blockResult || ""), 16);
    if (!isFinite(blockNumber) || blockNumber <= 0) {
      return { ok: false, reason: "invalid_block_number", latency: Date.now() - startedAt, blockNumber: 0 };
    }
    return { ok: true, reason: "ok", latency: Date.now() - startedAt, blockNumber: blockNumber };
  } catch (e) {
    return { ok: false, reason: "fetch_error", latency: Date.now() - startedAt, blockNumber: 0 };
  }
}

/**
 * Test RPC latency using eth_chainId + eth_blockNumber (strict validation).
 * v4.15.5: Individual fetch for accurate per-RPC latency measurement.
 * v4.15.36: Structured result { valid, rejected, reasons } + quota preservation.
 * Max 6 RPCs tested per chain to stay within quota.
 *
 * @param {Array<string>} rpcs - RPC URLs to test
 * @param {number} expectedChainId - Expected chain ID for validation
 * @returns {{valid: Array<string>, rejected: Array<string>, reasons: Object, quotaBlocked?: boolean}}
 *          valid: responsive + chainId-matching RPCs sorted by latency
 *          rejected: explicitly invalid endpoints with a reason
 *          reasons: cumulative counts per rejection reason
 *          quotaBlocked: true si le quota a interrompu le test (non entier)
 */
function _testRpcLatency(rpcs, expectedChainId) {
  if (!rpcs || !rpcs.length) {
    return { valid: [], rejected: [], reasons: {} };
  }

  var MAX_TEST = 6; // Max RPCs to test per chain (quota protection)
  var DEADLINE_MS = 3000;

  var toTest = rpcs.slice(0, MAX_TEST);
  var results = []; // { url, latency }
  var rejected = [];
  var reasons = {};

  function countReason(reason) {
    reasons[reason] = (reasons[reason] || 0) + 1;
  }

  for (var i = 0; i < toTest.length; i++) {
    var v = _dynamicRpcValidateEndpoint_(toTest[i], expectedChainId, DEADLINE_MS);
    if (v.reason === "quota_blocked") {
      // Quota épuisé : on arrête de tester mais on NE rejette PAS les
      // endpoints restants. Le flag quotaBlocked informe l'appelant que
      // cette chaîne n'a pas été entièrement testée, afin qu'il utilise
      // merge() (2-miss) au lieu de replaceTested().
      return { valid: [], rejected: [], reasons: {}, quotaBlocked: true };
    }
    if (v.ok) {
      results.push({ url: toTest[i], latency: v.latency });
    } else {
      rejected.push(toTest[i]);
      countReason(v.reason);
    }
  }

  results.sort(function (a, b) { return a.latency - b.latency; });

  var valid = [];
  for (var k = 0; k < results.length; k++) {
    valid.push(results[k].url);
  }

  return { valid: valid, rejected: rejected, reasons: reasons };
}

function UPDATE_DYNAMIC_RPCS(force) {
  force = force === true;
  try { HttpCallCounter.setTrigger('UPDATE_DYNAMIC_RPCS'); } catch(e){}
  var t0 = Date.now();

  try {
    // 0. Staleness check — skip if data is fresh (< 7 days old)
    //    v4.15.38: force=true bypasses the staleness gate (manual admin run).
    var lastUpdate = DynamicRpcStore.getUpdatedAt();
    if (lastUpdate > 0) {
      var ageMs = Date.now() - lastUpdate;
      var ageDays = ageMs / 86400000;
      if (!force && ageDays < 7) {
        var msg = "SKIP | Data is " + ageDays.toFixed(1) + "d old (threshold: 7d). Next update in ~" + (7 - ageDays).toFixed(0) + "d";
        console.log("[DYNAMIC_RPC] " + msg);
        return msg;
      }
    }
    console.log("[DYNAMIC_RPC] Data stale or empty, fetching...");

    // 1. Get our chain IDs
    var ourIds = _dynamicRpcGetOurChainIds();
    if (!ourIds.length) return "ERROR: No chain IDs found";

    // 2. Fetch from chainlist (with 1 retry after 5s delay)
    var chainlistData;
    try {
      chainlistData = _DynamicRpcFetcher.fetch(ourIds);
    } catch (firstErr) {
      Utilities.sleep(5000);
      try {
        chainlistData = _DynamicRpcFetcher.fetch(ourIds);
      } catch (retryErr) {
        return "ERROR: chainlist fetch failed after retry: " + String(retryErr.message || retryErr);
      }
    }

    var chainCount = 0;
    var totalAdded = 0;
    var totalRemoved = 0;

    // 2b. Phase 2: Latency test — only keep RPCs that respond, sorted by speed
    // v4.15.5: Budget 4 min (240s) — GAS limit is 6 min for non-@customfunction
    // v4.15.34: Lazy testing — only test 1/3 of chains per cycle (~80 HTTP calls vs ~250)
    // v4.15.37: Track testedCids explicitly so section 3 replaces only genuinely
    //           tested chains (budget-skip stays merge-safe).
    var rotationIndex = DynamicRpcStore.getRotationIndex();
    var rotationMod = 3; // test every Nth chain per cycle
    var testBudgetMs = 240000;
    var testStart = Date.now();
    var testedCount = 0;
    var validCount = 0;
    var rejectedCount = 0;
    var quotaBlockedCount = 0;
    var chainIdMismatchCount = 0;
    var noHealthyChainCount = 0;
    var skippedChains = 0;
    var rotatedChains = 0;
    var reasons = {};
    var testedCids = {};
    for (var cid in chainlistData) {
      if (cid.charAt(0) === '_') continue;
      if (!chainlistData.hasOwnProperty(cid)) continue;
      var rpcs = chainlistData[cid];
      if (!rpcs || !rpcs.length) continue;

      // Budget guard: skip remaining chains if time is running out
      if (Date.now() - testStart > testBudgetMs) {
        skippedChains++;
        continue; // Keep untested RPCs as-is (unranked but still usable)
      }

      // Lazy sampling: only test chains matching current rotation bucket
      if (Number(cid) % rotationMod !== rotationIndex) {
        rotatedChains++;
        continue; // Will be tested in a future cycle
      }

      var tested = _testRpcLatency(rpcs, Number(cid));
      testedCount += rpcs.length;
      if (tested.quotaBlocked) {
        // Quota épuisé : cette chaîne n'a PAS été réellement testée.
        // On la laisse hors de testedCids → section 3 utilisera merge()
        // (2-miss grace), préservant les endpoints existants.
        // chainlistData[cid] reste la liste chainlist brute.
        quotaBlockedCount++;
        continue;
      }
      rejectedCount += tested.rejected.length;
      validCount += tested.valid.length;
      if (tested.reasons && tested.reasons.chain_id_mismatch) {
        chainIdMismatchCount += tested.reasons.chain_id_mismatch;
      }
      if (tested.valid.length === 0) noHealthyChainCount++;
      for (var rr in tested.reasons) {
        if (tested.reasons.hasOwnProperty(rr)) {
          reasons[rr] = (reasons[rr] || 0) + tested.reasons[rr];
        }
      }
      chainlistData[cid] = tested.valid; // Replace with validated list
      testedCids[cid] = true; // Track that this chain was actually tested
    }
    DynamicRpcStore.advanceRotation();
    var rejectSummary = "";
    for (var rr2 in reasons) if (reasons.hasOwnProperty(rr2)) rejectSummary += rr2 + "=" + reasons[rr2] + " ";
    var testMsg = "Latency test: " + testedCount + " RPCs tested, " + rejectedCount + " rejected";
    if (rejectSummary) testMsg += " (" + rejectSummary.trim() + ")";
    if (rotatedChains > 0) testMsg += ", " + rotatedChains + " chains deferred (bucket #" + rotationIndex + ")";
    if (skippedChains > 0) testMsg += ", " + skippedChains + " chains skipped (budget)";
    if (quotaBlockedCount > 0) testMsg += ", " + quotaBlockedCount + " chains quota-blocked (kept merge-safe)";
    console.log("[DYNAMIC_RPC] " + testMsg);

    // 3. Persist EVM RPCs into DynamicRpcStore.
    //    v4.15.37: replaceTested only for chains that were truly latency-tested
    //    in this cycle (tracked via testedCids). Chains skipped by budget or
    //    deferred by rotation keep the 2-miss protection of merge().
    var replacedCount = 0;
    var mergedCount = 0;
    for (var cid in chainlistData) {
      if (cid.charAt(0) === '_') continue;
      if (!chainlistData.hasOwnProperty(cid)) continue;
      var cidNum = Number(cid);
      var evmStats;
      if (testedCids[cid]) {
        evmStats = DynamicRpcStore.replaceTested(cidNum, chainlistData[cid]);
        replacedCount++;
      } else {
        evmStats = DynamicRpcStore.merge(cidNum, chainlistData[cid]);
        mergedCount++;
      }
      chainCount++;
      totalAdded += evmStats.added;
      totalRemoved += evmStats.removed;
    }

    // 4. Fetch Cosmos Chain Registry (parallel, non-blocking)
    var cosmosCount = 0;
    try {
      var cosmosData = _CosmosRegistryFetcher.fetchAll();
      for (var cName in cosmosData) {
        if (!cosmosData.hasOwnProperty(cName)) continue;
        var cEntry = cosmosData[cName];
        var cStats = DynamicRpcStore.mergeCosmos(cName, cEntry.rest || [], cEntry.rpc || []);
        cosmosCount++;
        totalAdded += cStats.added;
        totalRemoved += cStats.removed;
      }
    } catch (cosmosErr) {
      // Cosmos fetch failure is non-fatal — EVM data still saved
    }

    // 5. Save to ScriptProperties (persistent, 30-day TTL)
    DynamicRpcStore.save();

    // 6. v4.15.3: Populate L1 CacheService per-chain (fast reads, 6h TTL)
    // This avoids the slow ScriptProperties read during @customfunction execution
    var data = DynamicRpcStore.getAll();
    var totalRpcs = 0;
    var l1Count = 0;
    var cacheEntries = {};
    for (var k in data) {
      if (k.charAt(0) === '_' || !data.hasOwnProperty(k) || !data[k]) continue;
      if (data[k].rpcs) {
        totalRpcs += data[k].rpcs.length;
        cacheEntries["DYN_" + k] = JSON.stringify(data[k].rpcs);
        l1Count++;
      }
      if (data[k].rest) totalRpcs += data[k].rest.length;
      if (data[k].rpc) totalRpcs += data[k].rpc.length;
    }
    // Batch write to CacheService (efficient)
    if (l1Count > 0) {
      try { CacheService.getScriptCache().putAll(cacheEntries, 21600); } catch (e) {
        console.log("[DYNAMIC_RPC] L1 cache populate failed: " + e);
      }
    }
    console.log("[DYNAMIC_RPC] L1 cache populated: " + l1Count + " chains");

    var elapsed = Date.now() - t0;
    var size = DynamicRpcStore.getSize();

    var result = "OK | " + chainCount + " EVM + " + cosmosCount + " Cosmos, " + totalRpcs + " endpoints"
         + " | +" + totalAdded + " new, -" + totalRemoved + " removed"
         + " | " + replacedCount + " replaced, " + mergedCount + " merged"
         + " | latency: " + testedCount + " tested, " + validCount + " valid, " + rejectedCount + " rejected"
         + " | chainIdMismatch: " + chainIdMismatchCount + ", noHealthy: " + noHealthyChainCount
         + " | " + (size / 1024).toFixed(1) + " KB | " + elapsed + "ms"
         + " | L1: " + l1Count + " chains";
    console.log("[DYNAMIC_RPC] " + result);
    return result;

  } catch (e) {
    return "ERROR: " + String(e.message || e);
  } finally {
    try { HttpCallCounter.clearTrigger(); } catch(e){}
  }
}

/**
 * FORCE_UPDATE_DYNAMIC_RPCS() - Admin-only manual trigger.
 *
 * Runs the full dynamic RPC refresh even if the 7-day staleness gate
 * would skip it. Does NOT touch WalletCache / GlobalPriceCache: only
 * the dynamic RPC store is refreshed. Safe to run any time.
 *
 * @returns {string} Status message (same as UPDATE_DYNAMIC_RPCS)
 */
function FORCE_UPDATE_DYNAMIC_RPCS() {
  return UPDATE_DYNAMIC_RPCS(true);
}

/**
 * SHOW_DYNAMIC_RPCS() - Diagnostic: show dynamic RPCs for all chains
 * @returns {Array<Array>} 2D array for Google Sheets
 */
function SHOW_DYNAMIC_RPCS() {
  var data = DynamicRpcStore.getAll();
  var updatedAt = data._updatedAt ? new Date(data._updatedAt).toISOString() : "never";
  var size = DynamicRpcStore.getSize();

  var rows = [
    ["Dynamic RPC Store", "Updated: " + updatedAt, "Size: " + (size / 1024).toFixed(1) + " KB"],
    ["Chain ID", "RPC Count", "Endpoints"]
  ];

  for (var key in data) {
    if (key.charAt(0) === '_') continue;
    if (!data.hasOwnProperty(key)) continue;
    var entry = data[key];
    if (!entry) continue;
    if (key.indexOf("cosmos:") === 0) {
      // Cosmos entry: show REST + RPC
      var cRest = (entry.rest || []).length;
      var cRpc = (entry.rpc || []).length;
      rows.push([key.replace("cosmos:", ""), cRest + " REST + " + cRpc + " RPC",
        (entry.rest || []).concat(entry.rpc || []).join(" | ")]);
    } else if (entry.rpcs) {
      rows.push([Number(key), entry.rpcs.length, entry.rpcs.join(" | ")]);
    }
  }

  if (rows.length === 2) rows.push(["(empty)", "", "Run UPDATE_DYNAMIC_RPCS() to populate"]);
  return rows;
}

/**
 * CLEAR_DYNAMIC_RPCS() - Clear all dynamic RPCs
 * @returns {string} Confirmation message
 */
function CLEAR_DYNAMIC_RPCS() {
  return DynamicRpcStore.clear();
}

/**
 * DYNAMIC_RPC_STATUS() - Quick status check
 * @returns {string} Status summary
 */
function DYNAMIC_RPC_STATUS() {
  var updatedAt = DynamicRpcStore.getUpdatedAt();
  if (!updatedAt) {
    var msg = "EMPTY - Run UPDATE_DYNAMIC_RPCS() to populate";
    console.log("[DYNAMIC_RPC_STATUS] " + msg);
    return msg;
  }

  var age = Date.now() - updatedAt;
  var ageDays = (age / 86400000).toFixed(1);
  var size = DynamicRpcStore.getSize();
  var data = DynamicRpcStore.getAll();

  var evmCount = 0;
  var cosmosCount = 0;
  for (var k in data) {
    if (k.charAt(0) === '_' || !data.hasOwnProperty(k) || !data[k]) continue;
    if (k.indexOf("cosmos:") === 0) cosmosCount++;
    else if (data[k].rpcs) evmCount++;
  }

  // L1 cache spot-check: verify CacheService has entries
  var l1Hits = 0;
  var l1Miss = [];
  var testIds = ["592", "137", "109"]; // Astar, Polygon, Shibarium
  for (var t = 0; t < testIds.length; t++) {
    try {
      var cv = CacheService.getScriptCache().get("DYN_" + testIds[t]);
      if (cv) { l1Hits++; } else { l1Miss.push(testIds[t]); }
    } catch (e) { l1Miss.push(testIds[t] + "(err)"); }
  }
  var l1Status = "L1: " + l1Hits + "/" + testIds.length + " hit" + (l1Miss.length ? " miss=[" + l1Miss.join(",") + "]" : "");

  var rotationIndex = DynamicRpcStore.getRotationIndex();
  var result = "OK | " + evmCount + " EVM + " + cosmosCount + " Cosmos | "
       + (size / 1024).toFixed(1) + " KB | age: " + ageDays + "d"
       + (Number(ageDays) > 30 ? " [EXPIRED]" : "")
       + " | lazy bucket #" + rotationIndex
       + " | " + l1Status;
  console.log("[DYNAMIC_RPC_STATUS] " + result);
  return result;
}


// ============================================================
// RPC SELECTOR INTEGRATION
// ============================================================

/**
 * Get merged RPC list: dynamic/chainlist (priority) + hardcoded (fallback)
 * Called by RpcSelector.pickForConsensus() in 05_RPC.gs
 *
 * Chainlist RPCs are community-maintained and more likely up-to-date.
 * Hardcoded RPCs serve as stable fallback if chainlist data is stale/empty.
 * Blacklisted RPCs (RpcHealth blocked) are pushed to the end of the list.
 *
 * @param {Array<string>} hardcodedEndpoints - config.RPC.ENDPOINTS
 * @param {Object} config - Chain config (needs CHAIN.CHAIN_ID)
 * @returns {Array<string>} Merged list (healthy first, blacklisted last)
 */
// v4.15.3: In-memory cache — avoids ANY I/O on repeated calls per chain per execution
var _dynMergeCache = {};

function _getDynamicRpcsMerged(hardcodedEndpoints, config) {
  var chainId = (config && config.CHAIN && config.CHAIN.CHAIN_ID) || 0;
  if (!chainId) return hardcodedEndpoints || [];

  // Fast path: in-memory cache (0ms after first call per chain)
  if (_dynMergeCache[chainId]) return _dynMergeCache[chainId];

  // v4.15.3: L1 CacheService ONLY — never read ScriptProperties in @customfunction hot path
  // ScriptProperties reads (~200-500ms for 10KB DYNAMIC_RPC_MAP) cause 30s timeouts
  // L1 is populated by UPDATE_DYNAMIC_RPCS() trigger (6h TTL, refreshed weekly)
  var dynamicRpcs;
  try {
    var cached = CacheService.getScriptCache().get("DYN_" + chainId);
    if (cached) dynamicRpcs = JSON.parse(cached);
  } catch (e) {}

  if (!dynamicRpcs || !dynamicRpcs.length) {
    var baseList = (hardcodedEndpoints || []).slice();
    // v4.15.50: ensure Blockscout fallback is appended even when no dynamic RPCs
    if (typeof _deriveBlockscoutRpc === "function") {
      var bsRpc0 = _deriveBlockscoutRpc(config);
      if (bsRpc0 && baseList.indexOf(bsRpc0) < 0) baseList.push(bsRpc0);
    }
    _dynMergeCache[chainId] = baseList;
    return _dynMergeCache[chainId];
  }

  var MAX_DYNAMIC_RPCS = 2;

  // Collect all unique RPCs: static first (curated, reliable), dynamic as fallback
  var all = [];
  var seen = {};

  var base = hardcodedEndpoints || [];
  for (var i = 0; i < base.length; i++) {
    var url = base[i];
    if (!seen[url]) { all.push(url); seen[url] = true; }
  }

  var dynCount = 0;
  for (var j = 0; j < dynamicRpcs.length; j++) {
    var dUrl = dynamicRpcs[j];
    if (!seen[dUrl]) {
      if (dynCount < MAX_DYNAMIC_RPCS) {
        all.push(dUrl); seen[dUrl] = true; dynCount++;
      }
    }
  }

  // Sort: fresh healthy first, stale healthy second, blocked at the end
  var hasHealth = (typeof RpcHealth !== "undefined" && RpcHealth && typeof RpcHealth.isHealthy === "function");
  if (!hasHealth) return all;

  var fresh = [];
  var stale = [];
  var blocked = [];
  var hasStaleCheck = (typeof RpcHealth !== "undefined" && RpcHealth && typeof RpcHealth.isStale === "function");
  for (var k = 0; k < all.length; k++) {
    var rpcUrl = all[k];
    if (RpcHealth.isHealthy(rpcUrl, config)) {
      if (hasStaleCheck && RpcHealth.isStale(rpcUrl)) {
        stale.push(rpcUrl);
      } else {
        fresh.push(rpcUrl);
      }
    } else {
      blocked.push(rpcUrl);
    }
  }

  var result = fresh.concat(stale).concat(blocked);

  // v4.15.50: Append Blockscout JSON-RPC proxy as last-resort fallback.
  // Never prioritized over a real healthy RPC (added after blocked).
  if (typeof _deriveBlockscoutRpc === "function") {
    var bsRpc = _deriveBlockscoutRpc(config);
    if (bsRpc && !seen[bsRpc]) { result.push(bsRpc); seen[bsRpc] = true; }
  }

  _dynMergeCache[chainId] = result;
  return result;
}

/**
 * Get dynamic REST URLs for a Cosmos chain.
 * Called by Cosmos engine for REST endpoint fallback.
 *
 * @param {string} chainName - Internal chain name (e.g. "COSMOS_HUB")
 * @param {string} hardcodedRestUrl - config.API.REST_URL
 * @returns {Array<string>} REST URLs (dynamic first, hardcoded included)
 */
function _getDynamicCosmosRestUrls(chainName, hardcodedRestUrl) {
  if (!chainName) return hardcodedRestUrl ? [hardcodedRestUrl] : [];

  var cosmosData;
  try {
    cosmosData = DynamicRpcStore.getCosmos(chainName);
  } catch (e) {
    return hardcodedRestUrl ? [hardcodedRestUrl] : [];
  }

  var dynamicRest = cosmosData.rest || [];
  if (!dynamicRest.length) return hardcodedRestUrl ? [hardcodedRestUrl] : [];

  // Merge: dynamic first, hardcoded as fallback
  var all = [];
  var seen = {};

  for (var i = 0; i < dynamicRest.length; i++) {
    if (!seen[dynamicRest[i]]) { all.push(dynamicRest[i]); seen[dynamicRest[i]] = true; }
  }

  if (hardcodedRestUrl && !seen[hardcodedRestUrl]) {
    all.push(hardcodedRestUrl);
  }

  return all;
}
