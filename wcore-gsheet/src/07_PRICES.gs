// v4.15.31 - Prefer live cycle priceUsdMap over fresh cached EUR prices to heal poisoned price cache
/*
 * 07_PRICES.gs - Price Engine (v4.15.31)
 *
 * v4.15.31 - FIX: live cycle priceUsdMap overrides fresh EUR priceMap cache.
 *   Poisoned cached EUR prices for long-tail tokens must not block current-run
 *   GT/Llama/Dex prices from correcting the cache.
 *
 * v4.15.16 - Tier 3 #9: DefiLlama cross-chain batch buffer (LlamaFlushBuffer)
 *
 * v4.15.12 - Add DeFiLlama Coins API batch stage (before GT) for meme tokens not on DexScreener
 *
 * v4.15.11 - FIX: GT Try 3 scans all returned pools on page 1.
 *   Some tokens have a first pool without a usable token price while a later
 *   pool on the same /pools?page=1 response has valid base/quote price data.
 *   Previously only data[0] was inspected, causing permanent null prices for
 *   Try3-only tokens despite valid GT pool data being present.
 *
 * v4.15.8 - FIX: Persist GT Try3-only path hints for tokens whose
 *   /token_price/ batch and /tokens/{addr} return no price, but /pools can.
 *   ROOT CAUSE: NEED_DEEP skipped Try1 only. Every refresh still spent one
 *   per-token Try2 HTTP call before Try3, so late Base GT-only tokens could
 *   lose the timer window or never reach the per-token loop (37+ GT-only
 *   tokens × 2 HTTP ≈ 37-74s dépassait le budget 30s).
 *   FIXES:
 *   1. New NEED_TRY3 marker skips Try1 and Try2, going directly to /pools.
 *   2. Marker is persisted in L1 CacheService as GTPATH:{chain}:{contract} (6h TTL).
 *   3. Per-token GT loop prioritizes NEED_TRY3 before generic NEED_DEEP.
 *   IMPACT: -50% HTTP sur tokens GT Try3-only (MINT, WZRD, JRA, BSNOW, ZECM, WC).
 *
 * v4.14.5 - FIX: NEED_DEEP tokens (Hannah Montana, JALICHI, STRETCH, ZAY on Base)
 *   permanently stuck with no price due to timer starvation.
 *   ROOT CAUSE: Tokens at end of NEED_DEEP list never reach Try3 because
 *   ~20 preceding NEED_DEEP tokens consume ~20s of HTTP calls, leaving < 2000ms
 *   when they're reached. Try3 isLow(2000) fires → skipped. L1 cache never
 *   gets populated → stuck forever as last in queue every run.
 *   FIX: NEED_DEEP tokens use a lower Try3 timer threshold (800ms instead of 2000ms).
 *   They have NO other pricing source — Try3 (/pools) is their only option.
 *   Non-NEED_DEEP tokens keep the 2000ms threshold unchanged.
 *
 * v4.14.4 - FIX: GT batch /token_price/ was returning 404 (wrong API path)
 *   The /token_price/ endpoint lives under /api/v2/simple/networks/, not
 *   /api/v2/networks/. Both the batch pre-fetch AND per-token Try 1 were
 *   silently failing (404 caught by try/catch). ALL GT pricing was done
 *   only via Try 2+3 in the per-token loop = massive timer waste.
 *   FIXES:
 *   1. _pxGetGtSimpleBaseUrl() returns correct /simple/networks/ base
 *   2. Batch pre-fetch uses simple base → batch now works (~60% of GT tokens resolved)
 *   3. Per-token Try 1 uses simple base → saves 1 wasted HTTP per token
 *   4. Stale price preservation: tokens with cached price < 6h keep price even
 *      when BulkPriceFetch can't re-price (prevents price loss between cycles)
 *   IMPACT: -70% GT HTTP calls, 0 missing prices for batch-resolvable tokens
 *
 * v4.14.3 - FIX: GT-only tokens price starvation (CTRL token on Base never priced)
 *   THREE fixes for tokens only available on GeckoTerminal:
 *   1. Batch pre-fetch checks L1 cache before marking NEED_DEEP
 *   2. gtTokenPriceUsd checks L1 even for NEED_DEEP tokens
 *   3. Per-token GT fallback loop reordered: NEED_DEEP tokens processed FIRST
 *
 * v4.14.2 - FIX: Restore GT Try 3 (/pools endpoint) for tokens with null price_usd
 *   Some tokens (GROWUP, Surprise, CUBE, CLANKFUN, CTRL on Base) have pools with
 *   prices but return price_usd:null on /token_price/ and /tokens/ endpoints.
 *   The /pools endpoint is the only way to get their price.
 *
 * v4.14.0 - OPT: GT_MAX_PER_RUN reduced from 15 to 8 in 26B_HTTP_SAVINGS.gs
 *   Tokens not priced this run will be priced in next cycle (L1 cache 2h TTL).
 *   Estimated savings: ~200-400 HTTP/day.
 *
 * v4.13.9 - FIX: forceFull now bypasses L1 CacheService for fresh prices
 *   Tokens paired against non-stablecoin quote tokens (e.g. TOKEN/CREATE on Base)
 *   had wrong prices stuck in L1 CacheService (2h TTL). forceFull only cleared
 *   WalletCache, leaving L1 and GlobalPriceCache untouched. DexScreener was
 *   never called because L1 returned stale prices.
 *   - ADDED: skipL1 flag in BulkPriceFetch.fetch opts
 *   - CHANGED: dexBulkTokens and gtTokenPriceUsd respect config._skipL1
 *   - ADDED: PURGE_CHAIN_PRICES() diagnostic to manually clear price caches
 *
 * v4.13.8 - HTTP QUOTA OPTIMIZATION:
 * - REMOVED: GeckoTerminal Try 3 (/tokens/{addr}/pools) — rarely succeeds, saves ~15 HTTP/day
 * - OPTIMIZED: gtTokenPriceUsd Try 2 now caches metadata in PriceRunCache
 *   This prevents duplicate getGeckoTerminalMeta calls (same /tokens/ endpoint)
 *   Saves 1 HTTP per token for GT-priced tokens
 * - ADDED: Timer check before Try 2 — skip if timer is low
 *
 * v4.9.7 - METADATA PERSISTENCE FIX:
 * - CRITICAL: DexScreener metadata now saved to MetaCache (TTL 7 days)
 * - CRITICAL: GeckoTerminal price fallback now also fetches/saves metadata
 * - Previously metadata was only in L1 cache (TTL 2h) and got lost
 * - Metadata (symbol/name) rarely changes, should persist longer than prices
 * - This prevents repeated GeckoTerminal fallback calls for same tokens
 * - GeckoTerminal tokens now properly return { priceUsd, symbol, name }
 *
 * v4.9.6 - LLAMA_CONTRACT_MAP SUPPORT:
 * - ADDED: config.LLAMA_CONTRACT_MAP for per-contract DefiLlama ID mapping
 * - ADDED: BulkPriceFetch now checks LLAMA_CONTRACT_MAP before GeckoTerminal
 * - USE CASE: Tokens not listed on DexScreener (e.g., REG on Gnosis)
 *
 * v4.9.2 - SVM TOKEN METADATA ENHANCEMENT:
 * - FIXED: Jupiter Price API now extracts mintSymbol from response
 * - ADDED: PriceSources.getJupiterTokenMeta() for SPL token metadata
 * - ADDED: Metadata returned with price: { priceUsd, symbol, name, source }
 * - IMPROVED: BulkPriceFetch now returns metadata for all sources
 *
 * v4.9.1 - HARMONIZATION: Unified fallback order across all engines
 * ORDRE HARMONISE DES FALLBACKS (priorite haute -> basse):
 * 1. DefiLlama - Native tokens, haute qualite
 * 2. DexScreener - Tokens avec liquidite DEX, bulk API
 * 3. GeckoTerminal - Fallback per-token, toutes chains
 * 4. CoinGecko - Dernier recours (IDs verifies uniquement)
 * 5. Jupiter - Specifique SVM/Solana
 *
 * v4.5.8 FIX:
 * - FIXED: DexScreener API updated from deprecated /latest/dex/tokens
 * to new /tokens/v1/{chainId}/{tokens} endpoint
 * - FIXED: Jupiter Price API URL updated from deprecated https://price.jup.ag/v3/price
 * to new https://api.jup.ag/price/v2 endpoint
 * - FIXED: GeckoTerminal fallback now works for SVM tokens (was EVM-only)
 * - IMPROVED: Better error logging for API failures
 *
 * IMPORTANT:
 * This file MUST expose the same public API expected by:
 * - 11_EVM_ENGINE.gs
 * - 14_SVM_ENGINE.gs
 * - 15_COSMOS_ENGINE.gs
 *
 * Exposes:
 * - PriceRunCache.reset()
 * - BulkPriceFetch.fetch(targetKeys, opts, timer, config)
 * - PriceManager.computePriceEur(...)
 * - PriceManager.cleanupAttempts(...)
 *
 * Sources (ordre harmonise):
 * 1. DefiLlama coins endpoint (native + well-known tokens)
 * 2. DexScreener tokens/v1 API (bulk tokens endpoint)
 * 3. DeFiLlama Coins API (chain contract batch, confidence >= 0.6)
 * 4. GeckoTerminal (token_price endpoint, per-token fallback)
 * 5. CoinGecko (verified IDs only, last resort)
 * 6. CMC DEX HTML (worker-only fallback for DEX microcaps)
 * 7. Jupiter Price API V2 (Solana SPL tokens only)
 */
var PRICES_VERSION = "4.15.30";


// ============================================================
// PER-RUN MEMORY CACHE
// ============================================================

var PriceRunCache = PriceRunCache || {
 dexscreener: {},
 geckoterminal: {},
 cmcDex: {},
 onChainV3: {},
 llamaCoins: {},
 llama: {},
 fx: null
};

PriceRunCache.reset = PriceRunCache.reset || function() {
 try { if (typeof LlamaFlushBuffer !== 'undefined' && LlamaFlushBuffer.flush) LlamaFlushBuffer.flush(); } catch (eLfbFlush) {}
 PriceRunCache.dexscreener = {};
 PriceRunCache.geckoterminal = {};
 PriceRunCache.cmcDex = {};
 PriceRunCache.onChainV3 = {};
 PriceRunCache.llamaCoins = {};
 PriceRunCache.llama = {};
 PriceRunCache.fx = null;
 try { if (typeof LlamaFlushBuffer !== 'undefined' && LlamaFlushBuffer.reset) LlamaFlushBuffer.reset(); } catch (eLfbReset) {}
};

// ============================================================
// INTERNAL HELPERS
// ============================================================

function _pxKeyLower(k) {
 return String(k || '').trim().toLowerCase();
}

function _pxNowMs() { return Date.now(); }

function _pxHttpBlocked(reason) {
 try {
 if (typeof Http !== 'undefined' && Http.canFetchNow) return !Http.canFetchNow(reason || "price");
 } catch (eH) {}
 try {
 if (typeof QuotaCircuitBreaker !== 'undefined' &&
 QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped()) return true;
 } catch (eQ) {}
 try {
 if (typeof HttpErrorGuard !== 'undefined' &&
 HttpErrorGuard.isQuotaExhausted && HttpErrorGuard.isQuotaExhausted()) return true;
 } catch (eG) {}
 return false;
}

var PRICE_NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;
var PRICE_TEMP_ERROR_TTL_MS = 2 * 60 * 60 * 1000;

// ============================================================
// L1 CacheService (2h min) - cross-run cache for prices/FX
// ============================================================

var PX_L1_TTL_MIN_SEC = 7200; // 2h minimum (refresh hourly)

function _pxL1Cache() {
 try { return CacheService.getScriptCache(); } catch (e) { return null; }
}

function _pxL1Ttl(ttlSec) {
 var n = Number(ttlSec || PX_L1_TTL_MIN_SEC);
 if (!isFinite(n) || n <= 0) n = PX_L1_TTL_MIN_SEC;
 return Math.max(n, PX_L1_TTL_MIN_SEC);
}

function _pxL1ChainKey(config) {
 try {
 var c = config && config.CHAIN ? config.CHAIN : null;
 var id = c && (c.CHAIN_ID || c.ID || c.NAME || c.CHAIN_NAME);
 return String(id || "unknown").toLowerCase();
 } catch (e) { return "unknown"; }
}

function _pxL1Key(kind, config, id) {
 return String(kind) + ":" + _pxL1ChainKey(config) + ":" + String(id || "").toLowerCase();
}

function _pxL1GetJson(key) {
 var cache = _pxL1Cache();
 if (!cache) return null;
 try {
 var raw = cache.get(key);
 if (!raw) return null;
 return JSON.parse(raw);
 } catch (e) { return null; }
}

/**
 * Bulk L1 read (CacheService.getAll) to avoid N*cache.get() overhead.
 * Returns: { key -> parsedJsonObject|null }
 */
function _pxL1GetAllJson(keys) {
 var cache = _pxL1Cache();
 if (!cache) return {};
 var out = {};
 try {
 var arr = keys || [];
 if (!arr.length) return out;
 var rawMap = cache.getAll(arr);
 for (var k in rawMap) {
 if (!k) continue;
 try {
 out[k] = JSON.parse(rawMap[k]);
 } catch (e1) {
 out[k] = null;
 }
 }
 } catch (e) {}
 return out;
}

/**
 * Bulk L1 write (CacheService.putAll).
 * Input: { key -> object } (objects are JSON.stringified)
 */
function _pxL1PutAllJson(objMap, ttlSec) {
 var cache = _pxL1Cache();
 if (!cache) return false;
 try {
 var payload = {};
 var has = false;
 for (var k in (objMap || {})) {
 if (!k) continue;
 payload[k] = JSON.stringify(objMap[k] || null);
 has = true;
 }
 if (!has) return true;
 cache.putAll(payload, _pxL1Ttl(ttlSec));
 return true;
 } catch (e) {
 return false;
 }
}

function _pxL1SetJson(key, obj, ttlSec) {
 var cache = _pxL1Cache();
 if (!cache) return false;
 try {
 cache.put(key, JSON.stringify(obj || null), _pxL1Ttl(ttlSec));
 return true;
 } catch (e) { return false; }
}


function _pxGetDexSlug(config) {
 return (config && config.CHAIN && config.CHAIN.DEX_SLUG) ? String(config.CHAIN.DEX_SLUG).toLowerCase() : null;
}

function _pxGetLlamaChainSlug(config) {
 if (config && config.CHAIN && config.CHAIN.LLAMA_CHAIN_SLUG) return String(config.CHAIN.LLAMA_CHAIN_SLUG).toLowerCase();
 if (config && config.CHAIN && config.CHAIN.DEX_SLUG) return String(config.CHAIN.DEX_SLUG).toLowerCase();
 if (config && config.DEX_SLUG) return String(config.DEX_SLUG).toLowerCase();
 return null;
}

function _pxGetGtNetwork(config) {
 return (config && config.CHAIN && config.CHAIN.GT_NETWORK) ? String(config.CHAIN.GT_NETWORK).toLowerCase() : null;
}

function _pxGetDexBaseUrl(config) {
 // Default config has PRICE_APIS.DEXSCREENER.BASE_URL
 var u = (config && config.PRICE_APIS && config.PRICE_APIS.DEXSCREENER && config.PRICE_APIS.DEXSCREENER.BASE_URL)
 ? String(config.PRICE_APIS.DEXSCREENER.BASE_URL)
 : "https://api.dexscreener.com/tokens/v1";
 return u.replace(/\/$/, "");
}

function _pxGetGtBaseUrl(config) {
 var u = (config && config.PRICE_APIS && config.PRICE_APIS.GECKOTERMINAL && config.PRICE_APIS.GECKOTERMINAL.BASE_URL)
 ? String(config.PRICE_APIS.GECKOTERMINAL.BASE_URL)
 : "https://api.geckoterminal.com/api/v2/networks";
 return u.replace(/\/$/, "");
}

// v4.14.4: /token_price/ endpoint lives under /simple/networks/, not /networks/
// Used for batch pre-fetch AND per-token Try 1
function _pxGetGtSimpleBaseUrl(config) {
 var base = _pxGetGtBaseUrl(config);
 // Transform .../api/v2/networks → .../api/v2/simple/networks
 if (base.indexOf('/simple/') < 0) {
  return base.replace('/api/v2/networks', '/api/v2/simple/networks');
 }
 return base;
}

function _pxGetLlamaBaseUrl(config) {
 var u = (config && config.PRICE_APIS && config.PRICE_APIS.LLAMA && config.PRICE_APIS.LLAMA.BASE_URL)
 ? String(config.PRICE_APIS.LLAMA.BASE_URL)
 : "https://coins.llama.fi/prices/current";
 return u.replace(/\/$/, "");
}

function _pxChunk(arr, size) {
 var out = [];
 for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
 return out;
}

function _pxHexPad32_(n) {
 var hex = Number(n || 0).toString(16);
 return hex.padStart(64, "0");
}

function _pxHexWord_(hex, wordIndex) {
 var clean = String(hex || "").replace(/^0x/, "");
 if (!clean) return "";
 var start = Number(wordIndex || 0) * 64;
 return clean.substring(start, start + 64);
}

function _pxHexToNumber_(hex) {
 var clean = String(hex || "").replace(/^0x/, "");
 if (!clean) return 0;
 try { return parseInt(clean, 16); } catch (e) { return 0; }
}

function _pxSqrtRatioX96ToPrice_(sqrtPriceHex, tokenDecimals, quoteDecimals, tokenIsToken0) {
 var sqrtP = _pxHexToNumber_(sqrtPriceHex);
 if (!(sqrtP > 0) || !isFinite(sqrtP)) return null;
 var ratio = sqrtP / Math.pow(2, 96);
 if (sqrtP > Number.MAX_SAFE_INTEGER) {
  ratio = (sqrtP / Math.pow(2, 32)) / Math.pow(2, 64);
 }
 if (!(ratio > 0) || !isFinite(ratio)) return null;
 var px = Math.pow(ratio, 2) * Math.pow(10, Number(tokenDecimals || 0) - Number(quoteDecimals || 0));
 if (!tokenIsToken0) px = (px > 0) ? (1 / px) : null;
 return (_pxIsFinitePos(px)) ? Number(px) : null;
}

function _pxIsFinitePos(x) {
 var n = Number(x);
 return isFinite(n) && n > 0;
}

// Ensure price HTTP calls have a sane timeout (Cosmos default HTTP_MS=1500 is too low for 3rd party APIs)
function _pxHttpTimeoutMs(config, fallback) {
 var fb = (fallback != null) ? Number(fallback) : 20000;
 if (!isFinite(fb) || fb <= 0) fb = 20000;
 try {
 var t = (config && config.TIMEOUTS && config.TIMEOUTS.HTTP_MS != null) ? Number(config.TIMEOUTS.HTTP_MS) : fb;
 if (!isFinite(t) || t <= 0) t = fb;
 // minimum 8000ms for external pricing APIs
 if (t < 8000) t = 8000;
 // cap to 25000ms (Apps Script limit safety)
 if (t > 25000) t = 25000;
 return t;
 } catch (e) {
 return 8000;
 }
}

var LLAMA_BATCH_SIZE = 50;

var LlamaFlushBuffer = (function() {
 var _pending = {};
 var _count = 0;
 var _lastResults = {};

 function _l1Key(chainId, contract) {
  return "LLAMACOINS:" + String(chainId || "unknown").toLowerCase() + ":" + String(contract || "").toLowerCase();
 }

 function _fetchJson(url) {
  if (_pxHttpBlocked("llama-buffer")) return null;
  try {
   if (typeof HTTP !== 'undefined' && HTTP.getJson) {
    return HTTP.getJson(url, { timeoutMs: 8000, muteHttpExceptions: true });
   }
  } catch (eHttp) {}
  try {
   var resp = UrlFetchApp.fetch(String(url), { method: 'get', muteHttpExceptions: true, followRedirects: true });
   var code = resp.getResponseCode();
   if (code < 200 || code >= 300) return null;
   return JSON.parse(resp.getContentText());
  } catch (eFetch) {
   return null;
  }
 }

 // v4.15.33 — LockService protege l'ecriture concurrente dans GlobalPriceCache.
 // Sans lock, deux engines/flush buffers peuvent faire load-modify-save simultane
 // → lost update. Meme pattern que _packedPut_ dans 04B_CACHE_WALLET.gs.
 function _dispatchGlobal(entries) {
  var lock = null;
  try { lock = LockService.getScriptLock(); } catch (eLs) {}
  var gotLock = false;
  if (lock) { try { gotLock = lock.tryLock(3000); } catch (eLk) {} }
  if (lock && !gotLock) return;
  try {
   if (typeof GlobalPriceCache === 'undefined' || !GlobalPriceCache._load || !GlobalPriceCache._save) return;
   var cache = GlobalPriceCache._load();
   if (!cache || typeof cache !== "object") return;
   if (!cache.entries) cache.entries = {};
   if (!cache.priceMap) cache.priceMap = {};
   if (!cache.priceTsMap) cache.priceTsMap = {};

   var now = Date.now();
   var changed = false;
   for (var key in entries) {
    if (!key) continue;
    var item = entries[key];
    if (!item || !_pxIsFinitePos(item.usd)) {
     var oldBad = cache.entries[key];
     if (oldBad && _pxIsFinitePos(oldBad.price)) continue;
     continue;
    }
    cache.entries[key] = { price: Number(item.usd), ts: now, src: "llama-batch" };
    if (_pxIsFinitePos(item.eur)) {
     var ck = String(item.contract || "").toLowerCase();
     cache.priceMap[ck] = Number(item.eur);
     cache.priceTsMap[ck] = now;
    }
    changed = true;
   }
   if (changed) {
    GlobalPriceCache._cache = cache;
    GlobalPriceCache._save();
   }
  } catch (eGpc) {}
  if (lock && gotLock) { try { lock.releaseLock(); } catch (eRel) {} }
 }

 function _flushChunk(keys, snapshot, results, l1Put, gpcPut) {
  if (!keys || !keys.length) return;
  var url = "https://coins.llama.fi/prices/current/" + keys.join(',');
  var json = _fetchJson(url);
  if (!json || !json.coins) return;

  for (var i = 0; i < keys.length; i++) {
   var llamaKey = keys[i];
   var meta = snapshot[llamaKey];
   if (!meta) continue;
   var rec = json.coins[llamaKey];
   if (!rec || rec.price == null) continue;
   if (rec.confidence != null && Number(rec.confidence) < 0.6) continue;
   var usd = Number(rec.price);
   if (!_pxIsFinitePos(usd)) continue;

   results[llamaKey] = usd;
   _lastResults[llamaKey] = usd;
   try { PriceRunCache.llamaCoins[llamaKey] = usd; } catch (eRun) {}
   l1Put[_l1Key(meta.chainId, meta.contract)] = { u: usd };
   gpcPut[String(meta.chainId || "") + ":" + String(meta.contract || "").toLowerCase()] = {
    usd: usd,
    eur: meta.eur,
    contract: meta.contract
   };
  }
 }

 return {
  add: function(llamaKey, chainId, contract, eur, skipL1) {
   var lk = String(llamaKey || "").toLowerCase();
   var c = String(contract || "").toLowerCase();
   if (!lk || !c || lk.indexOf(":") < 1) return false;

   if (!skipL1) {
    try {
     var h1 = _pxL1GetJson(_l1Key(chainId, c));
     if (h1 && _pxIsFinitePos(h1.u)) {
      _lastResults[lk] = Number(h1.u);
      try { PriceRunCache.llamaCoins[lk] = Number(h1.u); } catch (eRunL1) {}
      return false;
     }
    } catch (eL1) {}
   }

   if (!_pending[lk]) {
    _pending[lk] = {
     chainId: String(chainId || "unknown").toLowerCase(),
     contract: c,
     eur: _pxIsFinitePos(eur) ? Number(eur) : null
    };
    _count++;
   }
   if (_count >= LLAMA_BATCH_SIZE) this.flush();
   return true;
  },

  flush: function() {
   var keys = Object.keys(_pending);
   if (!keys.length) return {};
   var snapshot = _pending;
   _pending = {};
   _count = 0;

   var results = {};
   var l1Put = {};
   var gpcPut = {};
   var chunks = _pxChunk(keys, LLAMA_BATCH_SIZE);
   for (var ch = 0; ch < chunks.length; ch++) {
    _flushChunk(chunks[ch], snapshot, results, l1Put, gpcPut);
   }
   try { _pxL1PutAllJson(l1Put, PX_L1_TTL_MIN_SEC); } catch (eL1Put) {}
   _dispatchGlobal(gpcPut);
   return results;
  },

  get: function(llamaKey) {
   var lk = String(llamaKey || "").toLowerCase();
   return _lastResults[lk];
  },

  reset: function() {
   _pending = {};
   _count = 0;
   _lastResults = {};
  },

  size: function() {
   return _count;
  }
 };
})();

// ============================================================
// PRICE SOURCES
// ============================================================

// ============================================================
// COMPAT LAYER - ensure HTTP.fetchJsonWithRetry exists
// Some projects expose only UrlFetchApp/Http.fetch and no HTTP module.
// 07_PRICES expects HTTP.fetchJsonWithRetry(url, opt, config, timer).
// We create a minimal implementation ONLY when missing.
// ============================================================

if (typeof HTTP === 'undefined') {
 var HTTP = {};
}

if (typeof HTTP.fetchJsonWithRetry !== 'function') {
 HTTP.fetchJsonWithRetry = function(url, opt, config, timer) {
 if (_pxHttpBlocked("price-json-retry")) return null;
 var options = opt || {};
 var method = (options.method || 'get').toString().toUpperCase();
 var timeoutMs = Number(options.timeoutMs || 20000);
 if (!isFinite(timeoutMs) || timeoutMs <= 0) timeoutMs = 20000;
 var headers = options.headers || {};
 var mute = (options.muteHttpExceptions !== false);

 // small deterministic retry: 2 total attempts
 var lastErr = null;
 for (var attempt = 0; attempt < 2; attempt++) {
 try {
 if (timer && typeof timer.isTimeUp === 'function' && timer.isTimeUp()) return null;

 var fetchOpts = {
 method: method,
 headers: headers,
 muteHttpExceptions: mute,
 followRedirects: true
 };

 if (options.contentType) fetchOpts.contentType = options.contentType;
 if (options.payload != null) fetchOpts.payload = options.payload;

 // UrlFetchApp timeout is expressed in seconds (when supported)
 try {
 fetchOpts.deadline = Math.max(2, Math.min(10, Math.ceil(timeoutMs / 1000)));
 } catch (eT) {}

 var resp = UrlFetchApp.fetch(String(url), fetchOpts);
 var code = resp.getResponseCode();
 var body = resp.getContentText();

 if (code >= 200 && code < 300) {
 try {
 return JSON.parse(body);
 } catch (eParse) {
 return null;
 }
 }

 // retry on 429 / 5xx
 if (code === 429 || code >= 500) {
 Utilities.sleep(250);
 continue;
 }

 return null;
 } catch (e) {
 lastErr = e;
 Utilities.sleep(250);
 }
 }

 return null;
 };
}

var PriceSources = PriceSources || {};

function _pxWcoreWebChainKey(config) {
  try {
  var prefix = config && config.KEYS && config.KEYS.PREFIX ? String(config.KEYS.PREFIX) : "";
  if (/_CACHE_$/i.test(prefix)) return prefix.replace(/_CACHE_$/i, "").toUpperCase();
  } catch (ePrefix) {}
  try {
  var c = config && config.CHAIN ? config.CHAIN : null;
  var name = c && (c.KEY || c.CHAIN_KEY || c.NAME || c.CHAIN_NAME);
  if (name) return String(name).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  } catch (eName) {}
  return "";
}

/**
 * Delegated batch pricing through WCORE Web. This is intentionally best-effort:
 * if the web API is unavailable, local Dex/GT/Llama fallbacks continue unchanged.
 * Returns: { [tokenLower]: {priceUsd, source:'wcore-web:*'} }
 */
PriceSources.wcoreWebBatchPrices = PriceSources.wcoreWebBatchPrices || function(tokenAddresses, timer, config) {
  var out = {};
  try {
  if (timer && timer.isLow && timer.isLow(2500)) return out;
  if (_pxHttpBlocked("wcore-web-prices")) return out;

  var chain = _pxWcoreWebChainKey(config);
  if (!chain) return out;

  var props = PropertiesService.getScriptProperties();
  var baseUrl = props.getProperty("WCORE_WEB_API_URL");
  var token = props.getProperty("GSHEET_API_TOKEN");
  if (!baseUrl || !token) return out;

  var seen = {};
  var addrs = [];
  for (var i = 0; i < (tokenAddresses || []).length; i++) {
   var a = String(tokenAddresses[i] || "").trim().toLowerCase();
   if (!/^0x[0-9a-f]{40}$/.test(a)) continue;
   if (!seen[a]) { seen[a] = true; addrs.push(a); }
  }
  if (!addrs.length) return out;

  var endpoint = baseUrl.replace(/\/$/, "") + "/api/gsheet/prices";
  for (var off = 0; off < addrs.length; off += 100) {
   if (timer && timer.isLow && timer.isLow(1800)) break;
   var chunk = addrs.slice(off, off + 100);
   var resp = Http.post(endpoint, { chain: chain, tokens: chunk }, {
    headers: { "x-gsheet-token": token, accept: "application/json" },
    timeoutMs: _pxHttpTimeoutMs(config, 12000),
    muteHttpExceptions: true
   }, config);
   var json = Http.parseJson(resp);
   if (!json || json.ok !== true || !json.prices) continue;
   var fx = Number(json.fxRate || 0);
   for (var k in json.prices) {
    if (!json.prices.hasOwnProperty(k)) continue;
    var kl = _pxKeyLower(k);
    var rec = json.prices[k] || {};
    var usd = Number(rec.priceUsd);
    if (!_pxIsFinitePos(usd) && _pxIsFinitePos(Number(rec.priceEur)) && _pxIsFinitePos(fx)) {
     usd = Number(rec.priceEur) / fx;
    }
    if (!_pxIsFinitePos(usd)) continue;
    out[kl] = { priceUsd: Number(usd), source: "wcore-web" + (rec.source ? ":" + String(rec.source) : "") };
   }
  }
  try { Logger.log("[WcoreWebBatch] priced " + Object.keys(out).length + "/" + addrs.length + " on " + chain); } catch (eLog) {}
  } catch (e) {
  try { Logger.log("[WcoreWebBatch] skipped: " + String(e && e.message ? e.message : e)); } catch (eLog2) {}
  }
  return out;
};

/**
 * DexScreener bulk token lookup.
 * Endpoint used: {BASE_URL}/{dexSlug}/{token1,token2,...}
 * Returns: { [tokenLower]: {priceUsd, symbol?, name?, source:'dex'} }
 */
PriceSources.dexBulkTokens = PriceSources.dexBulkTokens || function(tokenAddresses, timer, config) {
 var dexSlug = _pxGetDexSlug(config);
 var isSvm = false;
 try { isSvm = (config && config.CHAIN && String(config.CHAIN.VM || '').toUpperCase() === 'SVM'); } catch (eSvm) {}
 if (!dexSlug && !isSvm) return {};
 if (!dexSlug && isSvm) dexSlug = 'solana';


 var out = {};

 var addrs = [];
 var seen = {};
 for (var i = 0; i < (tokenAddresses || []).length; i++) {
 var a = Addr.normalize(tokenAddresses[i]);
 if (!a) continue;
 if (!seen[a]) { seen[a] = true; addrs.push(a); }
 }
 if (!addrs.length) return {};

 // --- L1 CacheService hits (2h min) ---
 // v4.13.9: Skip L1 on forceFull to ensure fresh DexScreener prices
 // Tokens paired against non-stablecoin quote tokens can have stale USD prices
 // stuck in L1 (2h TTL) that never get refreshed even on forceFull.
 var skipL1 = !!(config && config._skipL1);
 var misses = [];

 if (!skipL1) {
 // Use getAll() for speed: one cache call for the whole batch.
 var kmap = [];
 var k2addr = {};
 var dexL1Seen = {};
 for (var z = 0; z < addrs.length; z++) {
 var aa = addrs[z];
 var k1 = _pxL1Key("DEX", config, aa);
 kmap.push(k1);
 k2addr[k1] = aa;
 }
 var hits = _pxL1GetAllJson(kmap);
 for (var kHit in hits) {
 if (!kHit) continue;
 var hit = hits[kHit];
 var aa2 = k2addr[kHit];
 if (!aa2) continue;
 dexL1Seen[kHit] = true;
 // v4.14.4: Also reject L1 cached dust prices (< 1e-18) from low-liquidity pools
 if (hit && _pxIsFinitePos(hit.u) && Number(hit.u) > 1e-18) {
 out[aa2.toLowerCase()] = { priceUsd: Number(hit.u), symbol: hit.s || null, name: hit.n || null, source: 'dex' };
 } else {
 misses.push(aa2);
 }
 }
 for (var missIdx = 0; missIdx < kmap.length; missIdx++) {
 var missKey = kmap[missIdx];
 if (dexL1Seen[missKey]) continue;
 var aaMiss = k2addr[missKey];
 if (aaMiss) misses.push(aaMiss);
 }
 addrs = misses;
 } else {
 // forceFull: treat all addresses as L1 misses to force DexScreener fetch
 }

 if (!addrs.length) return out;

 var max = (config && config.PRICE_APIS && config.PRICE_APIS.DEXSCREENER && config.PRICE_APIS.DEXSCREENER.MAX_ADDRESSES)
 ? config.PRICE_APIS.DEXSCREENER.MAX_ADDRESSES
 : 30;

 var chunks = _pxChunk(addrs, Math.max(1, Math.min(30, max)));

 // v4.5.8: Use DexScreener tokens/v1 API (new format with chainId)
 // Old: https://api.dexscreener.com/latest/dex/tokens/{tokens}
 // New: https://api.dexscreener.com/tokens/v1/{chainId}/{tokens}
 var baseUrlV1New = "https://api.dexscreener.com/tokens/v1";
 var baseUrlLegacy = _pxGetDexBaseUrl(config); // tokens/v1/{slug}/{tokens} format
 
 // For SVM (Solana), use the new v1 API with explicit chainId
 var useLegacy = false;
 try {
 if (config && config.PRICE_APIS && config.PRICE_APIS.DEXSCREENER && config.PRICE_APIS.DEXSCREENER.USE_LEGACY === true) {
 useLegacy = true;
 }
 } catch (eUl) {}

 // Fetch chunks with fetchAll() in small waves (parallel but safe)
 var waveMax = (config && config.PRICE_APIS && config.PRICE_APIS.DEXSCREENER && config.PRICE_APIS.DEXSCREENER.MAX_PARALLEL)
 ? Number(config.PRICE_APIS.DEXSCREENER.MAX_PARALLEL)
 : 6;
 if (!isFinite(waveMax) || waveMax <= 0) waveMax = 6;
 waveMax = Math.max(1, Math.min(10, Math.floor(waveMax)));

 for (var c0 = 0; c0 < chunks.length; c0 += waveMax) {
 if (timer && timer.isTimeUp && timer.isTimeUp()) break;

 var reqs = [];
 var meta = [];
 for (var c = c0; c < Math.min(chunks.length, c0 + waveMax); c++) {
 var chunk = chunks[c];
 var ck = dexSlug + '|' + chunk.join(',');

 // Per-run cache key per chunk
 if (PriceRunCache.dexscreener[ck] !== undefined) {
 meta.push({ ck: ck, cached: true });
 continue;
 }

 // v4.5.8: New URL format: /tokens/v1/{chainId}/{tokenAddresses}
 var url = useLegacy
 ? (baseUrlLegacy + '/' + encodeURIComponent(dexSlug) + '/' + chunk.join(','))
 : (baseUrlV1New + '/' + encodeURIComponent(dexSlug) + '/' + chunk.join(','));
 reqs.push({
 url: url,
 timeoutMs: _pxHttpTimeoutMs(config, 20000),
 muteHttpExceptions: true
 });
 meta.push({ ck: ck, cached: false, chunk: chunk });
 }

 // First inject cached results (if any)
 for (var m0 = 0; m0 < meta.length; m0++) {
 if (meta[m0].cached) {
 try {
 Obj.forEach(PriceRunCache.dexscreener[meta[m0].ck], function(k, v) { out[k] = v; });
 } catch (eC0) {}
 }
 }

 if (!reqs.length) continue;

 var responses = [];
 try {
 responses = HTTP.fetchAll(reqs, config);
 } catch (eFA) {
 responses = [];
 }
 // Resilience: fetchAll() can fail the whole wave on a single 429/5xx.
 // If that happens, fallback to sequential fetch so we still recover partial prices
 // (very important for SVM where a single token often has transient 404/429).
 if ((!responses || !responses.length) && reqs.length) {
 responses = [];
 for (var r = 0; r < reqs.length; r++) {
 try {
 responses.push(HTTP.fetch(reqs[r], config));
 } catch (eSeq) {
 responses.push(null);
 }
 }
 }

 var respIdx = 0;
 for (var m = 0; m < meta.length; m++) {
 if (timer && timer.isTimeUp && timer.isTimeUp()) break;
 if (meta[m].cached) continue;

 var chunk = meta[m].chunk;
 var ck = meta[m].ck;
 var resp = responses[respIdx++];
 var json = HTTP.parseJson(resp);
 // /latest/dex/tokens returns {pairs:[...]}, while tokens/v1 returns an array
 try { if (json && !Array.isArray(json) && json.pairs && Array.isArray(json.pairs)) json = json.pairs; } catch (ePairs) {}

 // Dex tokens endpoint returns an array of pairs.
 // We pick the best candidate per token address (base OR quote).
 // Note: DexScreener's priceUsd is the BASE token price in USD.
 // If our target token is the QUOTE token, infer: quotePriceUsd = basePriceUsd / priceNative (when available).
 var map = {};
 try {
 if (json && Array.isArray(json)) {
 for (var j = 0; j < json.length; j++) {
 var p0 = json[j] || {};
 var baseTok = p0.baseToken || {};
 var quoteTok = p0.quoteToken || {};

 var baseAddr = Addr.normalize(baseTok.address);
 var quoteAddr = Addr.normalize(quoteTok.address);

 // Dex returns many pairs; we keep the one with highest USD liquidity for each token.
 var liqUsd = 0;
 try { liqUsd = Number((p0.liquidity && p0.liquidity.usd) || 0); } catch (e) { liqUsd = 0; }
 if (!isFinite(liqUsd) || liqUsd < 0) liqUsd = 0;

 // v4.14.4: Skip pairs with < $50 liquidity — unreliable prices from dust pools
 // (e.g. Chainbase Token on Base: $2.73 liquidity → price 2.9e-27 blocking GT)
 if (liqUsd < 50) continue;

 var basePriceUsd = Number(p0.priceUsd);
 if (!_pxIsFinitePos(basePriceUsd)) continue;

 var basePriceNative = Number(p0.priceNative);
 var hasNative = _pxIsFinitePos(basePriceNative);

 function consider(addr, sym, nm, pxUsd) {
 if (!addr) return;
 if (!_pxIsFinitePos(pxUsd)) return;
 var k = String(addr).toLowerCase();
 var prev = map[k];
 if (!prev || liqUsd > (prev._liq || 0)) {
 map[k] = { priceUsd: pxUsd, symbol: sym || '', name: nm || '', source: 'dex', _liq: liqUsd };
 }
 }

 // Candidate: BASE token direct price.
 if (baseAddr) consider(baseAddr, baseTok.symbol, baseTok.name, basePriceUsd);

 // Candidate: QUOTE token inferred price.
 if (quoteAddr && hasNative) {
 consider(quoteAddr, quoteTok.symbol, quoteTok.name, basePriceUsd / basePriceNative);
 }
 }
 }
 } catch (e) {
 // ignore parsing issues
 }


 // strip internal field
 Obj.forEach(map, function(k, v) { if (v && v._liq != null) delete v._liq; });

 // L1 CacheService store per-token (2h min) - use putAll()
 try {
 var putMap = {};
 Obj.forEach(map, function(k, v) {
 // v4.14.4: Don't cache dust prices (< 1e-18) from low-liquidity pools
 if (v && _pxIsFinitePos(v.priceUsd) && Number(v.priceUsd) > 1e-18) {
 putMap[_pxL1Key("DEX", config, k)] = { u: Number(v.priceUsd), s: v.symbol || null, n: v.name || null };
 }
 });
 _pxL1PutAllJson(putMap, PX_L1_TTL_MIN_SEC);
 } catch (eL1) {}
 
 // v4.12.7: Also persist metadata to MetaCache (TTL 7 days) - metadata rarely changes!
 // This prevents losing symbol/name when L1 cache expires after 2h
 try {
 if (typeof MetaCache !== 'undefined' && MetaCache && MetaCache.load && MetaCache.save) {
 var metaMap = MetaCache.load(null, config) || {};
 var metaUpdated = false;
 Obj.forEach(map, function(k, v) {
 if (v && (v.symbol || v.name)) {
 var keyL = String(k).toLowerCase();
 if (!metaMap[keyL]) metaMap[keyL] = {};
 if (v.symbol && !metaMap[keyL].symbol) {
 metaMap[keyL].symbol = v.symbol;
 metaUpdated = true;
 }
 if (v.name && !metaMap[keyL].name) {
 metaMap[keyL].name = v.name;
 metaUpdated = true;
 }
 if (metaUpdated && !metaMap[keyL].lastSeenMs) {
 metaMap[keyL].lastSeenMs = Date.now();
 }
 }
 });
 if (metaUpdated) {
 // Save without filtering - preserve all existing metadata
 CacheManager.init();
 var metaKey = (config && config.KEYS && config.KEYS.META) ? String(config.KEYS.META) : "META_CACHE";
 CacheManager.safeSetJson(metaKey, metaMap, config, 604800); // 7 days TTL
 }
 }
 } catch (eMetaSave) {}

 PriceRunCache.dexscreener[ck] = map;
 Obj.forEach(map, function(k, v) { out[k] = v; });
 }
 }

 return out;
};

/**
 * Jupiter Price API V2 (Solana mints) bulk lookup.
 * Endpoint: https://api.jup.ag/price/v2?ids=<mint1>,<mint2>,...
 * NOTE: Old endpoint https://price.jup.ag/v3/price deprecated Jan 2026
 * v4.9.2: Now extracts mintSymbol from response for metadata
 * Returns: { mintLower: {priceUsd:number, symbol?:string, source:'Jupiter'} }
 */
PriceSources.jupBulkMints = PriceSources.jupBulkMints || function(mints, timer, config) {
 var out = {};
 try {
 if (!mints || !mints.length) return out;

 // Jupiter Price API V2 (public): ids=<mint1>,<mint2>... (USD)
 // Note: some environments get intermittent 429/403 without a User-Agent;
 // use retry-aware fetch and shared JSON headers.
 var clean = [];
 var seen = {};
 for (var i = 0; i < mints.length; i++) {
 var m = String(mints[i] || '').trim();
 if (!m) continue;
 if (!seen[m]) { seen[m] = true; clean.push(m); }
 }
 if (!clean.length) return out;

 // v4.5.8: Updated to Jupiter Price API V2 (old v3 deprecated Jan 2026)
 // Format: https://api.jup.ag/price/v2?ids=mint1,mint2
 var url = 'https://api.jup.ag/price/v2?ids=' + clean.join(',');

 var opt = {
 muteHttpExceptions: true,
 timeoutMs: _pxHttpTimeoutMs(config, 15000),
 headers: { 
 'accept': 'application/json',
 'User-Agent': 'Mozilla/5.0 (compatible; WCORE/4.9)'
 }
 };

 var j = (HTTP && typeof HTTP.fetchJsonWithRetry === 'function')
 ? HTTP.fetchJsonWithRetry(url, opt, config, timer)
 : (HTTP && typeof HTTP.getJson === 'function' ? HTTP.getJson(url, opt, config) : null);

 // V2 response format: { data: { "mint": { id, mintSymbol, price, ... } } }
 var data = j && j.data ? j.data : null;
 if (!data) {
 // Log for debugging if no data returned
 try { Logger.log('Jupiter V2 API: no data for ' + clean.length + ' mints'); } catch(eLog){}
 return out;
 }

 clean.forEach(function(mint) {
 var r = data[mint] || null;
 var p = r && r.price != null ? Number(r.price) : NaN;
 if (!isFinite(p) || p <= 0) return;
 // v4.9.2: Extract mintSymbol from Jupiter response
 var sym = (r && r.mintSymbol) ? String(r.mintSymbol).trim() : '';
 var result = { priceUsd: p, source: 'Jupiter' };
 if (sym && sym !== 'Unknown') result.symbol = sym;
 out[_pxKeyLower(mint)] = result;
 });
 } catch (e) {
 try { Logger.log('Jupiter V2 API error: ' + String(e.message || e)); } catch(eLog){}
 }
 return out;
};

/**
 * Jupiter Token API V1 - Get token metadata (symbol, name, decimals)
 * Endpoint: https://lite-api.jup.ag/tokens/v1/token/{mint}
 * v4.9.2: New function for SPL token metadata enrichment
 * Returns: { symbol, name, decimals } or null
 */
PriceSources.getJupiterTokenMeta = PriceSources.getJupiterTokenMeta || function(mint, timer, config) {
 if (!mint) return null;
 var m = String(mint).trim();
 if (!m || m.length < 32 || m.length > 44) return null;

 // Cache key for metadata
 var ck = 'jup_meta:' + m;
 if (PriceRunCache.llama[ck] !== undefined) return PriceRunCache.llama[ck];

 // L1 CacheService hit (2h min)
 try {
 var h1 = _pxL1GetJson(_pxL1Key("JUPMETA", config, m));
 if (h1 && (h1.s || h1.n)) {
 var cached = { symbol: h1.s || '', name: h1.n || '' };
 if (h1.d != null) cached.decimals = h1.d;
 PriceRunCache.llama[ck] = cached;
 return cached;
 }
 } catch (eL1) {}

 // Jupiter Token API V1: /tokens/v1/token/{mint}
 var url = 'https://lite-api.jup.ag/tokens/v1/token/' + encodeURIComponent(m);

 var opt = {
 muteHttpExceptions: true,
 timeoutMs: _pxHttpTimeoutMs(config, 10000),
 headers: { 
 'accept': 'application/json',
 'User-Agent': 'Mozilla/5.0 (compatible; WCORE/4.9)'
 }
 };

 var json = null;
 try {
 json = (HTTP && typeof HTTP.getJson === 'function') ? HTTP.getJson(url, opt, config) : null;
 } catch (e) {
 json = null;
 }

 var meta = null;
 try {
 if (json && (json.symbol || json.name)) {
 meta = {};
 if (json.symbol) meta.symbol = String(json.symbol).trim();
 if (json.name) meta.name = String(json.name).trim();
 if (json.decimals != null) {
 var d = parseInt(json.decimals, 10);
 if (!isNaN(d) && d >= 0 && d <= 18) meta.decimals = d;
 }
 }
 } catch (e) {
 meta = null;
 }

 // L1 CacheService store (2h min)
 try {
 if (meta && (meta.symbol || meta.name)) {
 _pxL1SetJson(_pxL1Key("JUPMETA", config, m), { s: meta.symbol || null, n: meta.name || null, d: meta.decimals != null ? meta.decimals : null }, PX_L1_TTL_MIN_SEC);
 }
 } catch (eL1b) {}

 PriceRunCache.llama[ck] = meta;
 return meta;
};

/**
 * GeckoTerminal token price (single)
 * Returns priceUsd (number) or null
 * Tries /token_price/ first, then /tokens/{address}, then /tokens/{address}/pools
 */
PriceSources.gtTokenPriceUsd = PriceSources.gtTokenPriceUsd || function(contract, timer, config) {
 var net = _pxGetGtNetwork(config);
 if (!net) return null;
 var c = Addr.normalize(contract);
 if (!c) return null;

 var ck = net + ':' + c;
 var cached = PriceRunCache.geckoterminal[ck];
 // v4.14.2: "NEED_DEEP" marker = batch Try 1 returned null, skip to Try 2+3
 // v4.14.6: "NEED_TRY3" marker = Try 2 also returned null, skip to Try 3
 if (cached !== undefined && cached !== "NEED_DEEP" && cached !== "NEED_TRY3") return cached;

 // L1 CacheService hit (2h min)
 // v4.13.9: Skip L1 on forceFull (config._skipL1)
 // v4.14.3: Check L1 even for NEED_DEEP — L1 may have price from previous cycle's Try 2/3
 // Only skipL1 (forceFull) should bypass L1, not NEED_DEEP
 if (!(config && config._skipL1)) {
 try {
 var h1 = _pxL1GetJson(_pxL1Key("GT", config, c));
 if (h1 && _pxIsFinitePos(h1.u)) {
 PriceRunCache.geckoterminal[ck] = Number(h1.u);
 return PriceRunCache.geckoterminal[ck];
 }
  } catch (eL1) {}
  }

 // v4.14.6: Path hint is not a price cache. Use it even on forceFull so
 // known Try3-only tokens do not waste time on /tokens/{addr}.
 var skipTry2 = (cached === "NEED_TRY3");
 if (!skipTry2) {
  try {
   var hPath = _pxL1GetJson(_pxL1Key("GTPATH", config, c));
   if (hPath && hPath.p === "TRY3") {
    PriceRunCache.geckoterminal[ck] = "NEED_TRY3";
    skipTry2 = true;
   }
  } catch (ePath) {}
 }
 var skipTry1 = (cached === "NEED_DEEP" || cached === "NEED_TRY3" || skipTry2);

 var baseUrl = _pxGetGtBaseUrl(config);
 var simpleBaseUrl = _pxGetGtSimpleBaseUrl(config); // v4.14.4: /token_price/ needs /simple/ path
 var usd = null;
 var httpOpts = {
 timeoutMs: _pxHttpTimeoutMs(config, 20000),
 headers: { accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
 muteHttpExceptions: true
 };

 // Try 1: /token_price/ endpoint (fast, batch-capable)
 // v4.14.2: Skip if batch pre-fetch already returned null for this token
 // v4.14.4: Use /simple/networks/ path (was using /networks/ → 404)
 if (!skipTry1) {
 try {
 var url1 = simpleBaseUrl + '/' + encodeURIComponent(net) + '/token_price/' + encodeURIComponent(c);
 var json1 = HTTP.getJson(url1, httpOpts);
 if (json1 && json1.data && json1.data.attributes && json1.data.attributes.token_prices) {
 var mp = json1.data.attributes.token_prices;
 var v = mp[c];
 if (v != null) usd = Number(v);
 }
 } catch (e1) {}
 }

 // Try 2: /tokens/{address} endpoint - has price_usd in attributes
 // v4.13.8: Skip Try 2 if timer is low - save HTTP calls for other tokens
 // v4.13.8: Also extract metadata (symbol/name/decimals) to avoid duplicate getGeckoTerminalMeta call
 var _try2NoPrice = false;
 if (!skipTry2 && !_pxIsFinitePos(usd) && !(timer && timer.isLow && timer.isLow(2000))) {
 try {
 var url2 = baseUrl + '/' + encodeURIComponent(net) + '/tokens/' + encodeURIComponent(c);
 var json2 = HTTP.getJson(url2, httpOpts);
 if (json2 && json2.data && json2.data.attributes) {
 var attr2 = json2.data.attributes;
  var p2 = attr2.price_usd || attr2.token_price_usd;
  if (p2 != null) {
   usd = Number(p2);
   if (!_pxIsFinitePos(usd)) { usd = null; _try2NoPrice = true; }
  } else {
   _try2NoPrice = true;
  }
 // v4.13.8: Cache metadata from same response — avoids separate getGeckoTerminalMeta HTTP
 try {
   var metaCk = 'meta:' + net + ':' + c;
   if (PriceRunCache.geckoterminal[metaCk] === undefined) {
     var _m = null;
     if (attr2.symbol || attr2.name || attr2.decimals != null) {
       _m = {};
       if (attr2.symbol) _m.symbol = String(attr2.symbol);
       if (attr2.name) _m.name = String(attr2.name);
       if (attr2.decimals != null) { var _dd = parseInt(attr2.decimals, 10); if (!isNaN(_dd) && _dd >= 0 && _dd <= 36) _m.decimals = _dd; }
     }
     PriceRunCache.geckoterminal[metaCk] = _m;
   }
 } catch (eMeta2) {}
 }
 } catch (e2) { _try2NoPrice = true; }
 }
 // v4.15.24: If Try 2 was skipped entirely (throttle/timer/etc), treat as "no price"
 // so the hint is posted and next cycle goes direct to Try 3.
 if (!_pxIsFinitePos(usd) && !skipTry2 && !_try2NoPrice) { _try2NoPrice = true; }

 if (!_pxIsFinitePos(usd) && _try2NoPrice) {
  try { _pxL1SetJson(_pxL1Key("GTPATH", config, c), { p: "TRY3" }, 21600); } catch (ePathSet) {}
  PriceRunCache.geckoterminal[ck] = "NEED_TRY3";
  skipTry2 = true;
 }

 // Try 3: /tokens/{address}/pools endpoint — restored in v4.14.2
 // Some tokens have price_usd: null on /token_price/ and /tokens/ endpoints
 // but DO have priced pools. This is the only way to get their price.
 // v4.14.2 FIX: Must check if our token is base or quote in the pool
 // v4.14.5 FIX: NEED_DEEP tokens (skipTry1=true) use lower timer threshold (800ms vs 2000ms)
 // They have NO other pricing source — Try3 is their only option, so we push harder.
 var _try3TimerMs = skipTry1 ? 800 : 2000;
  if (!_pxIsFinitePos(usd) && !(timer && timer.isLow && timer.isLow(_try3TimerMs))) {
  try {
   var url3 = baseUrl + '/' + encodeURIComponent(net) + '/tokens/' + encodeURIComponent(c) + '/pools?page=1';
   var json3 = HTTP.getJson(url3, httpOpts);
   if (json3 && json3.data && json3.data.length > 0) {
    var bestTry3Usd = null;
    var bestTry3Reserve = -1;
    for (var p3 = 0; p3 < json3.data.length; p3++) {
     var pool = json3.data[p3];
     if (!pool || !pool.attributes || !pool.relationships) continue;
     var pa = pool.attributes;
     var rels3 = pool.relationships;
    // Determine if our token (c) is base or quote in this pool
    var isBase3 = false, isQuote3 = false;
    if (rels3.base_token && rels3.base_token.data && rels3.base_token.data.id) {
     isBase3 = String(rels3.base_token.data.id).toLowerCase().indexOf(c) >= 0;
    }
     if (rels3.quote_token && rels3.quote_token.data && rels3.quote_token.data.id) {
      isQuote3 = String(rels3.quote_token.data.id).toLowerCase().indexOf(c) >= 0;
     }
     var try3Usd = null;
     if (isBase3 && _pxIsFinitePos(Number(pa.base_token_price_usd))) {
      try3Usd = Number(pa.base_token_price_usd);
     } else if (isQuote3 && _pxIsFinitePos(Number(pa.quote_token_price_usd))) {
      try3Usd = Number(pa.quote_token_price_usd);
     } else if (_pxIsFinitePos(Number(pa.token_price_usd))) {
      try3Usd = Number(pa.token_price_usd);
     }
     if (!_pxIsFinitePos(try3Usd)) continue;
     var try3Reserve = Number(pa.reserve_in_usd || 0);
     if (!isFinite(try3Reserve) || try3Reserve < 0) try3Reserve = 0;
     if (bestTry3Usd == null || try3Reserve > bestTry3Reserve) {
      bestTry3Usd = try3Usd;
      bestTry3Reserve = try3Reserve;
     }
    }
    if (_pxIsFinitePos(bestTry3Usd)) usd = Number(bestTry3Usd);
   }
  } catch (e3) {}
  }

 if (!_pxIsFinitePos(usd)) usd = null;

 // L1 CacheService store (2h min)
 try {
 if (_pxIsFinitePos(usd)) _pxL1SetJson(_pxL1Key("GT", config, c), { u: Number(usd) }, PX_L1_TTL_MIN_SEC);
 } catch (eL1b) {}

 PriceRunCache.geckoterminal[ck] = usd;
 return usd;
};

/**
 * DefiLlama coins endpoint.
 * llamaId example: "coingecko:ethereum"
 */
PriceSources.llamaPriceUsd = PriceSources.llamaPriceUsd || function(llamaId, timer, config) {
 if (!llamaId) return null;
 var id = String(llamaId);
 if (PriceRunCache.llama[id] !== undefined) return PriceRunCache.llama[id];

 // L1 CacheService hit (2h min)
 // v4.13.9: Skip L1 on forceFull (config._skipL1)
 if (!(config && config._skipL1)) {
 try {
 var h1 = _pxL1GetJson(_pxL1Key("LLAMA", config, id));
 if (h1 && _pxIsFinitePos(h1.u)) {
 PriceRunCache.llama[id] = Number(h1.u);
 return PriceRunCache.llama[id];
 }
 } catch (eL1) {}
 }

 var baseUrl = _pxGetLlamaBaseUrl(config);
 var url = baseUrl + '/' + encodeURIComponent(id);

 var json = HTTP.getJson(url, {
 timeoutMs: _pxHttpTimeoutMs(config, 20000),
 headers: { accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
 muteHttpExceptions: true
 });

 var usd = null;
 try {
 if (json && json.coins && json.coins[id] && json.coins[id].price != null) {
 usd = Number(json.coins[id].price);
 }
 } catch (e) {}

 if (!_pxIsFinitePos(usd)) usd = null;

 // L1 CacheService store (2h min)
 try {
 if (_pxIsFinitePos(usd)) _pxL1SetJson(_pxL1Key("LLAMA", config, id), { u: Number(usd) }, PX_L1_TTL_MIN_SEC);
 } catch (eL1b) {}

 PriceRunCache.llama[id] = usd;
 return usd;
};

/**
 * DeFiLlama Coins API batch lookup by chain contract.
 * Endpoint used: https://coins.llama.fi/prices/current/{chain}:{addr},{chain}:{addr}
 * Returns: { [contractLower]: priceUsd }
 */
PriceSources.llamaCoinsBatchUsd = PriceSources.llamaCoinsBatchUsd || function(contracts, timer, config) {
 var out = {};
 var slug = _pxGetLlamaChainSlug(config);
 if (!slug) return out;

 var clean = [];
 var seen = {};
 for (var i = 0; i < (contracts || []).length; i++) {
 var c = Addr.normalize(contracts[i]);
 if (!c) continue;
 var kl = c.toLowerCase();
 if (!seen[kl]) { seen[kl] = true; clean.push(kl); }
 }
 if (!clean.length) return out;

 var skipL1 = !!(config && config._skipL1);
 var fetchList = [];

 for (var l1 = 0; l1 < clean.length; l1++) {
 var ck = slug + ':' + clean[l1];
 if (PriceRunCache.llamaCoins[ck] !== undefined) {
 if (_pxIsFinitePos(PriceRunCache.llamaCoins[ck])) out[clean[l1]] = Number(PriceRunCache.llamaCoins[ck]);
 continue;
 }
 if (!skipL1) {
 try {
 var h1 = _pxL1GetJson(_pxL1Key("LLAMACOINS", config, clean[l1]));
 if (h1 && _pxIsFinitePos(h1.u)) {
 PriceRunCache.llamaCoins[ck] = Number(h1.u);
 out[clean[l1]] = Number(h1.u);
 continue;
 }
 } catch (eL1) {}
 }
 fetchList.push(clean[l1]);
 }

 if (!fetchList.length) return out;

 // v4.15.16: Cross-chain Llama buffer. It batches pending Llama keys, writes
 // successful prices to GlobalPriceCache entries, then this per-chain path
 // continues as fallback for anything not resolved by the buffer.
 try {
 var directList = [];
 var gpcChainId = _pxL1ChainKey(config);
 for (var bf = 0; bf < fetchList.length; bf++) {
  var bfAddr = fetchList[bf];
  var bfKey = slug + ':' + bfAddr;
  LlamaFlushBuffer.add(bfKey, gpcChainId, bfAddr, null, skipL1);
 }
 LlamaFlushBuffer.flush();
 for (var br = 0; br < fetchList.length; br++) {
  var brAddr = fetchList[br];
  var brKey = slug + ':' + brAddr;
  var brUsd = LlamaFlushBuffer.get(brKey);
  if (_pxIsFinitePos(brUsd)) {
  out[brAddr] = Number(brUsd);
  PriceRunCache.llamaCoins[brKey] = Number(brUsd);
  } else {
  directList.push(brAddr);
  }
 }
 fetchList = directList;
 } catch (eBuffer) {
 try { Logger.log('[LlamaFlushBuffer] fallback: ' + String(eBuffer.message || eBuffer)); } catch (eLogBuf) {}
 }

 if (!fetchList.length) return out;

 var baseUrl = _pxGetLlamaBaseUrl(config);
 var chunks = _pxChunk(fetchList, 80);
 for (var ch = 0; ch < chunks.length; ch++) {
 if (timer && timer.isLow && timer.isLow(3000)) break;
 var chunk = chunks[ch];
 var keys = [];
 for (var k = 0; k < chunk.length; k++) keys.push(slug + ':' + chunk[k]);
 try {
 var url = baseUrl + '/' + keys.join(',');
 var json = HTTP.getJson(url, { timeoutMs: 8000, muteHttpExceptions: true });
 if (!json || !json.coins) continue;
 for (var j = 0; j < chunk.length; j++) {
 var addr = chunk[j];
 var key = slug + ':' + addr;
 var rec = json.coins[key];
 if (!rec || rec.price == null) continue;
 if (rec.confidence != null && Number(rec.confidence) < 0.6) continue;
 var usd = Number(rec.price);
 if (!_pxIsFinitePos(usd)) continue;
 out[addr] = usd;
 PriceRunCache.llamaCoins[key] = usd;
 try { _pxL1SetJson(_pxL1Key("LLAMACOINS", config, addr), { u: usd }, PX_L1_TTL_MIN_SEC); } catch (eL1b) {}
 }
 } catch (e) {
 try { Logger.log('[LlamaCoinsBatch] error: ' + String(e.message || e)); } catch (eLog) {}
 }
 }

 return out;
};

/**
 * CoinGecko simple price endpoint (USD).
 * geckoId example: "flare"
 */
PriceSources.coingeckoPriceUsd = PriceSources.coingeckoPriceUsd || function(geckoId, timer, config) {
 if (!geckoId) return null;
 var id = String(geckoId).toLowerCase();
 var ck = 'cg:' + id;
 // reuse llama cache namespace to avoid extra object, but keep key distinct
 if (PriceRunCache.llama[ck] !== undefined) return PriceRunCache.llama[ck];

 // L1 CacheService hit (2h min)
 try {
 var h1 = _pxL1GetJson(_pxL1Key("CG", config, id));
 if (h1 && _pxIsFinitePos(h1.u)) {
 PriceRunCache.llama[ck] = Number(h1.u);
 return PriceRunCache.llama[ck];
 }
 } catch (eL1) {}

 // default base URL
 var base = (config && config.PRICE_APIS && config.PRICE_APIS.COINGECKO && config.PRICE_APIS.COINGECKO.BASE_URL)
 ? String(config.PRICE_APIS.COINGECKO.BASE_URL)
 : 'https://api.coingecko.com/api/v3';
 base = base.replace(/\/$/, '');

 var endpoint = base;
 if (!/\/simple\/price$/i.test(endpoint)) endpoint = endpoint + '/simple/price';
 var url = endpoint + '?ids=' + encodeURIComponent(id) + '&vs_currencies=usd';

 var json = HTTP.getJson(url, {
 timeoutMs: _pxHttpTimeoutMs(config, 20000),
 headers: { accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
 muteHttpExceptions: true
 });

 var usd = null;
 try {
 if (json && json[id] && json[id].usd != null) usd = Number(json[id].usd);
 } catch (e) {}
 if (!_pxIsFinitePos(usd)) usd = null;

 // L1 CacheService store (2h min)
 try {
 if (_pxIsFinitePos(usd)) _pxL1SetJson(_pxL1Key("CG", config, id), { u: Number(usd) }, PX_L1_TTL_MIN_SEC);
 } catch (eL1b) {}

 PriceRunCache.llama[ck] = usd;
 return usd;
};

PriceSources._parseCmcDexHtml_ = PriceSources._parseCmcDexHtml_ || function(html, slug, contract) {
 if (!html) return null;
 var c = String(contract || '').toLowerCase();
 var s = String(slug || '').toLowerCase();
 var text = String(html);
 function escRx(v) {
  return String(v || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
 }
 var needle = '"dex-token-info","' + s + '","' + c + '"';
 var idx = text.indexOf(needle);
 var block = text;
 if (idx >= 0) {
  var start = text.lastIndexOf('{"state":{"data":', idx);
  if (start < 0) start = Math.max(0, idx - 1200);
  block = text.substring(start, Math.min(text.length, idx + 1800));
 } else {
  var byAddr = text.toLowerCase().indexOf(c);
  if (byAddr >= 0) block = text.substring(Math.max(0, byAddr - 1200), Math.min(text.length, byAddr + 1800));
 }
 var m = block.match(/"p":"([0-9]+(?:\.[0-9]+)?(?:e[-+]?[0-9]+)?)"/i);
 if (!m) {
  m = text.match(new RegExp('"addr":"' + escRx(c) + '"[\\s\\S]{0,5000}?"p":"([0-9]+(?:\\.[0-9]+)?(?:[eE][-+]?[0-9]+)?)"', 'i'));
 }
 if (!m) {
  m = text.match(new RegExp('"p":"([0-9]+(?:\\.[0-9]+)?(?:[eE][-+]?[0-9]+)?)"[\\s\\S]{0,5000}?"addr":"' + escRx(c) + '"', 'i'));
 }
 if (!m) return null;
 var usd = Number(m[1]);
 if (!_pxIsFinitePos(usd)) return null;
 function pick(rx) {
  var x = block.match(rx);
  return x && x[1] ? String(x[1]).replace(/\\"/g, '"').replace(/\\u0026/g, '&') : '';
 }
 return {
  priceUsd: usd,
  source: "cmc-dex",
  symbol: pick(/"sym":"([^"]*)"/),
  name: pick(/"n":"([^"]*)"/)
 };
};

/**
 * CoinMarketCap DEX HTML fallback for microcap DEX tokens missing from
 * DexScreener/GeckoTerminal/CoinGecko. Called by the background worker only.
 */
PriceSources.cmcDexTokenPrices = PriceSources.cmcDexTokenPrices || function(contracts, timer, config, maxCount) {
 var out = {};
 var slug = _pxGetDexSlug(config);
 if (!slug || !contracts || !contracts.length) return out;
 if (!PriceRunCache.cmcDex) PriceRunCache.cmcDex = {};
 var max = Number(maxCount || 4);
 if (!isFinite(max) || max < 1) max = 4;
 if (max > 12) max = 12;
 var tried = 0;
 var attempted = [];
 for (var i = 0; i < contracts.length; i++) {
  if (tried >= max) {
   out._partial = true;
   break;
  }
  if (timer && timer.isLow && timer.isLow(45000)) break;
  var c = _pxKeyLower(contracts[i]);
  if (!/^0x[0-9a-f]{40}$/.test(c)) continue;
  var ck = slug + ':' + c;
  if (PriceRunCache.cmcDex[ck] !== undefined) {
   if (PriceRunCache.cmcDex[ck] && _pxIsFinitePos(PriceRunCache.cmcDex[ck].priceUsd)) out[c] = PriceRunCache.cmcDex[ck];
   continue;
  }
  try {
   var h1 = _pxL1GetJson(_pxL1Key("CMCDEX", config, c));
   if (h1 && _pxIsFinitePos(h1.u)) {
    var cached = { priceUsd: Number(h1.u), source: "cmc-dex", symbol: h1.s || "", name: h1.n || "" };
    PriceRunCache.cmcDex[ck] = cached;
    out[c] = cached;
    continue;
   }
  } catch (eL1) {}

  tried++;
  attempted.push(c);
  var jsonUrl = "https://dapi.coinmarketcap.com/dex/v1/token?platform=" + encodeURIComponent(slug) + "&address=" + encodeURIComponent(c);
  try {
   if (HTTP && HTTP._record) HTTP._record(jsonUrl, 1);
   var jsonResp = UrlFetchApp.fetch(jsonUrl, {
    method: "get",
    headers: {
     "accept": "application/json",
     "origin": "https://dex.coinmarketcap.com",
     "referer": "https://dex.coinmarketcap.com/",
     "User-Agent": "Mozilla/5.0 (compatible; WCORE/4.15)"
    },
    muteHttpExceptions: true,
    followRedirects: true
   });
   var jsCode = jsonResp && jsonResp.getResponseCode ? Number(jsonResp.getResponseCode()) : 0;
   try { if (HTTP) { HTTP._lastJsonStatus = jsCode; HTTP._lastJsonHost = "dapi.coinmarketcap.com"; } } catch (eHttpJsonMeta) {}
   var jsHost = "dapi.coinmarketcap.com";
   var json = null;
   if (jsCode >= 200 && jsCode < 300 && jsonResp && jsonResp.getContentText) json = JSON.parse(jsonResp.getContentText());
   if (jsCode === 429 || jsCode >= 500) {
    if (jsHost.indexOf("coinmarketcap") >= 0 || jsHost.indexOf("dapi") >= 0) {
     out._rateLimited = true;
     PriceRunCache.cmcDex[ck] = null;
     break;
    }
   }
   var data = json && json.data ? json.data : null;
   var jp = data && data.p != null ? Number(data.p) : null;
   if (_pxIsFinitePos(jp)) {
    var jrec = { priceUsd: Number(jp), source: "cmc-dex", symbol: (data && data.sym) || "", name: (data && data.n) || "" };
    PriceRunCache.cmcDex[ck] = jrec;
    out[c] = jrec;
    try { _pxL1SetJson(_pxL1Key("CMCDEX", config, c), { u: Number(jrec.priceUsd), s: jrec.symbol || "", n: jrec.name || "" }, PX_L1_TTL_MIN_SEC); } catch (eL1j) {}
    continue;
   }
   if (jsCode >= 200 && jsCode < 300 && data) {
    PriceRunCache.cmcDex[ck] = null;
    continue;
   }
  } catch (eJson) {}

  var url = "https://dex.coinmarketcap.com/token/" + encodeURIComponent(slug) + "/" + encodeURIComponent(c) + "/";
  try {
   var resp = HTTP.get(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    timeoutMs: _pxHttpTimeoutMs(config, 20000),
    headers: {
     "accept": "text/html,application/xhtml+xml",
     "User-Agent": "Mozilla/5.0 (compatible; WCORE/4.15)"
    }
   }, config);
   var code = resp && resp.getResponseCode ? resp.getResponseCode() : 0;
   try {
    HTTP._lastJsonStatus = code;
    HTTP._lastJsonHost = "dex.coinmarketcap.com";
   } catch (eHttpMeta) {}
   if (code === 429 || code >= 500 || code === 0) {
    out._rateLimited = true;
    PriceRunCache.cmcDex[ck] = null;
    break;
   }
   if (code < 200 || code >= 300) {
    PriceRunCache.cmcDex[ck] = null;
    continue;
   }
   var htmlText = resp && resp.getContentText ? resp.getContentText() : "";
   var rec = PriceSources._parseCmcDexHtml_(htmlText, slug, c);
   if (rec && _pxIsFinitePos(rec.priceUsd)) {
    PriceRunCache.cmcDex[ck] = rec;
    out[c] = rec;
    try { _pxL1SetJson(_pxL1Key("CMCDEX", config, c), { u: Number(rec.priceUsd), s: rec.symbol || "", n: rec.name || "" }, PX_L1_TTL_MIN_SEC); } catch (eL1s) {}
   } else {
    PriceRunCache.cmcDex[ck] = null;
   }
  } catch (e) {
   PriceRunCache.cmcDex[ck] = null;
  }
 }
 if (attempted.length) out._attemptedContracts = attempted;
 return out;
};

function DIAG_CMC_DEX_TOKEN_BASE(contract) {
 var c = String(contract || "").toLowerCase();
 var out = [["Metric", "Value", "Details"]];
 if (!/^0x[0-9a-f]{40}$/.test(c)) {
  out.push(["ERROR", "bad_contract", c]);
  return out;
 }
 var url = "https://dapi.coinmarketcap.com/dex/v1/token?platform=base&address=" + encodeURIComponent(c);
 try {
  var resp = UrlFetchApp.fetch(url, {
   method: "get",
   headers: {
    "accept": "application/json",
    "origin": "https://dex.coinmarketcap.com",
    "referer": "https://dex.coinmarketcap.com/",
    "User-Agent": "Mozilla/5.0 (compatible; WCORE/diag)"
   },
   muteHttpExceptions: true,
   followRedirects: true
  });
  var code = resp && resp.getResponseCode ? Number(resp.getResponseCode()) : 0;
  var text = resp && resp.getContentText ? resp.getContentText() : "";
  out.push(["HTTP", code, "len=" + text.length]);
  out.push(["HEAD", text.substring(0, 300), ""]);
  try {
   var json = JSON.parse(text);
   var data = json && json.data ? json.data : {};
   out.push(["price_p", data.p != null ? String(data.p) : "", "sym=" + (data.sym || "") + "; name=" + (data.n || "")]);
   out.push(["liqUsd", data.liqUsd != null ? String(data.liqUsd) : "", "mcap=" + (data.mcap || "")]);
  } catch (eParse) {
   out.push(["PARSE", "ERROR", String(eParse.message || eParse).substring(0, 120)]);
  }
 } catch (e) {
  out.push(["EXCEPTION", String(e.message || e).substring(0, 200), ""]);
 }
 return out;
}

function _pxOnChainV3Spec_(chain, config) {
 var chainId = String((config && config.CHAIN && config.CHAIN.CHAIN_ID) || chain || "").toLowerCase();
 var gtNet = String(_pxGetGtNetwork(config) || chain || "").toLowerCase();

 // On-chain V3 spec map — keyed by lowercase chain ID
 // Uniswap V3 factory (0x1F98431c8aD98523631AE4a59f267346ea31F984) is identical across all chains
 var ONCHAIN_V3_SPECS = {
  "8453": { // Base
   chainKey: "base",
   weth: "0x4200000000000000000000000000000000000006",
   usdc: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
   factories: [
    { name: "uniswap-v3", address: "0x33128a8fc17869897dce68ed026d694621f6fdfd" },
    { name: "aerodrome-slipstream", address: "0x5e7bb104d84c7cb9b682aac2f3d509f5f406809a" }
   ]
  },
  "1": { // Ethereum
   chainKey: "ethereum",
   weth: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
   usdc: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
   factories: [
    { name: "uniswap-v3", address: "0x1f98431c8ad98523631ae4a59f267346ea31f984" }
   ]
  },
  "42161": { // Arbitrum One
   chainKey: "arbitrum",
   weth: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
   usdc: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
   factories: [
    { name: "uniswap-v3", address: "0x1f98431c8ad98523631ae4a59f267346ea31f984" }
   ]
  },
  "10": { // Optimism
   chainKey: "optimism",
   weth: "0x4200000000000000000000000000000000000006",
   usdc: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
   factories: [
    { name: "uniswap-v3", address: "0x1f98431c8ad98523631ae4a59f267346ea31f984" }
   ]
  },
  "137": { // Polygon
   chainKey: "polygon",
   weth: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
   usdc: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
   factories: [
    { name: "uniswap-v3", address: "0x1f98431c8ad98523631ae4a59f267346ea31f984" }
   ]
  },
  "56": { // BSC
   chainKey: "bsc",
   weth: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
   usdc: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
   factories: [
    { name: "pancakeswap-v3", address: "0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865" }
   ]
  },
  "43114": { // Avalanche
   chainKey: "avalanche",
   weth: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
   usdc: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
   factories: [
    { name: "trader-joe-v2.1", address: "0x8e42f2f4101563bf679975178e880fd87a3a3f80" }
   ]
  }
 };

 var spec = ONCHAIN_V3_SPECS[chainId];
 if (!spec && gtNet === "base") spec = ONCHAIN_V3_SPECS["8453"];
 if (!spec) return null;

 return {
  chainKey: spec.chainKey,
  weth: spec.weth,
  usdc: spec.usdc,
  fees: [500, 3000, 10000],
  factories: spec.factories,
  selectors: {
   getPool: "0x1698ee82",
   slot0: "0x3850c7bd",
   liquidity: "0x1a686502",
   token0: "0x0dfe1681",
   decimals: "0x313ce567"
  }
 };
}

function _pxOnChainV3PriceKey_(contract) {
 return "ONCHAINV3:" + String(contract || "").toLowerCase();
}

function _pxOnChainV3HintKey_(chain, contract) {
 return "NEED_ONCHAIN:" + String(chain || "unknown").toLowerCase() + ":" + String(contract || "").toLowerCase();
}

function _pxOnChainV3EthPriceUsd_(config, timer) {
 var spec = _pxOnChainV3Spec_(null, config);
 var chainId = String((config && config.CHAIN && config.CHAIN.CHAIN_ID) || "");
 try {
  if (typeof GlobalPriceCache !== "undefined" && GlobalPriceCache && GlobalPriceCache.getFresh) {
   var freshNative = GlobalPriceCache.getFresh(chainId, "native", 21600000);
   if (freshNative && _pxIsFinitePos(freshNative.price)) return Number(freshNative.price);
   if (spec) {
    var freshWrapped = GlobalPriceCache.getFresh(chainId, spec.weth, 21600000);
    if (freshWrapped && _pxIsFinitePos(freshWrapped.price)) return Number(freshWrapped.price);
   }
  }
 } catch (eFresh) {}
 try {
  if (typeof GlobalPriceCache !== "undefined" && GlobalPriceCache && GlobalPriceCache.load && spec) {
   var gpc = GlobalPriceCache.load(null, config) || {};
   var pm = gpc && gpc.priceMap ? gpc.priceMap : {};
   if (_pxIsFinitePos(pm[spec.weth])) return Number(pm[spec.weth]);
  }
 } catch (eLoad) {}
 try {
  return PriceSources.llamaPriceUsd("coingecko:ethereum", timer, config);
 } catch (eLlamaEth) {
  return null;
 }
}

function _pxOnChainV3TokenDecimals_(contract, config, timer, selectorOverride) {
 var c = Addr.normalize(contract);
 if (!c) return null;
 try {
  if (typeof MetaCache !== "undefined" && MetaCache && MetaCache.load) {
   var mm = MetaCache.load(null, config) || {};
   var meta = mm[c];
   if (meta && meta.decimals != null) {
    var md = parseInt(meta.decimals, 10);
    if (!isNaN(md) && md >= 0 && md <= 36) return md;
   }
  }
 } catch (eMeta) {}
 var selector = selectorOverride || "0x313ce567";
 var rows = RpcClient.batchWithConsensus(null, [{ method: "eth_call", params: [{ to: c, data: selector }, "latest"] }], timer, config);
 var row = rows && rows[0];
 if (!row || row.error || !row.result) return null;
 var dec = _pxHexToNumber_(_pxHexWord_(row.result, 0));
 if (!isFinite(dec) || dec < 0 || dec > 36) return null;
 return Number(dec);
}

function _pxFetchOnChainV3FromFactory_(contract, spec, factory, config, timer) {
 var pools = [];
 var calls = [];
 var lookup = [];
 var contractPad = Addr.pad32(contract);
 var quotes = [
  { quote: spec.usdc, quoteDecimals: 6, label: "USDC" },
  { quote: spec.weth, quoteDecimals: 18, label: "WETH" }
 ];
 for (var q = 0; q < quotes.length; q++) {
  for (var f = 0; f < spec.fees.length; f++) {
   calls.push({
    method: "eth_call",
    params: [{
     to: factory.address,
     data: spec.selectors.getPool + contractPad + Addr.pad32(quotes[q].quote) + _pxHexPad32_(spec.fees[f])
    }, "latest"]
   });
   lookup.push({ fee: spec.fees[f], quote: quotes[q].quote, quoteDecimals: quotes[q].quoteDecimals, quoteLabel: quotes[q].label });
  }
 }
 var rows = RpcClient.batchWithConsensus(null, calls, timer, config);
 if (!rows || rows.length !== calls.length) return { error: "getPool_batch_failed", pools: [] };
 for (var i = 0; i < rows.length; i++) {
  var row = rows[i];
  if (!row || row.error || row.result == null) return { error: "getPool_failed", pools: [] };
  var poolAddr = "0x" + _pxHexWord_(row.result, 0).slice(24);
  poolAddr = Addr.normalize(poolAddr);
  if (!poolAddr || /^0x0{40}$/.test(poolAddr)) continue;
  pools.push({
   addr: poolAddr,
   fee: lookup[i].fee,
   quote: lookup[i].quote,
   quoteLabel: lookup[i].quoteLabel,
   quoteDecimals: lookup[i].quoteDecimals,
   factory: factory.name
  });
 }
 if (!pools.length) return { error: null, pools: [] };

 var detailCalls = [];
 for (var p = 0; p < pools.length; p++) {
  detailCalls.push({ method: "eth_call", params: [{ to: pools[p].addr, data: spec.selectors.slot0 }, "latest"] });
  detailCalls.push({ method: "eth_call", params: [{ to: pools[p].addr, data: spec.selectors.liquidity }, "latest"] });
  detailCalls.push({ method: "eth_call", params: [{ to: pools[p].addr, data: spec.selectors.token0 }, "latest"] });
 }
 var detailRows = RpcClient.batchWithConsensus(null, detailCalls, timer, config);
 if (!detailRows || detailRows.length !== detailCalls.length) return { error: "pool_detail_batch_failed", pools: [] };

 var ethPriceUsd = null;
 var tokenDecimals = null;
 for (var d = 0; d < pools.length; d++) {
  var slot0Row = detailRows[d * 3];
  var liqRow = detailRows[d * 3 + 1];
  var token0Row = detailRows[d * 3 + 2];
  if (!slot0Row || slot0Row.error || !slot0Row.result) return { error: "slot0_failed", pools: [] };
  if (!liqRow || liqRow.error || !liqRow.result) return { error: "liquidity_failed", pools: [] };
  if (!token0Row || token0Row.error || !token0Row.result) return { error: "token0_failed", pools: [] };
  var token0 = Addr.normalize("0x" + _pxHexWord_(token0Row.result, 0).slice(24));
  var tokenIsToken0 = (token0 === contract);
  if (tokenDecimals == null) tokenDecimals = _pxOnChainV3TokenDecimals_(contract, config, timer, spec.selectors.decimals);
  if (tokenDecimals == null) return { error: "decimals_failed", pools: [] };
  var priceQuote = _pxSqrtRatioX96ToPrice_(_pxHexWord_(slot0Row.result, 0), tokenDecimals, pools[d].quoteDecimals, tokenIsToken0);
  if (!_pxIsFinitePos(priceQuote)) return { error: "price_calc_failed", pools: [] };
  var priceUsd = priceQuote;
  if (pools[d].quote === spec.weth) {
   if (!_pxIsFinitePos(ethPriceUsd)) ethPriceUsd = _pxOnChainV3EthPriceUsd_(config, timer);
   if (!_pxIsFinitePos(ethPriceUsd)) return { error: "eth_price_failed", pools: [] };
   priceUsd = Number(priceQuote) * Number(ethPriceUsd);
  }
  pools[d].liquidity = _pxHexToNumber_(_pxHexWord_(liqRow.result, 0));
  pools[d].token0 = token0;
  pools[d].priceUsd = (_pxIsFinitePos(priceUsd)) ? Number(priceUsd) : null;
 }
 return { error: null, pools: pools };
}

function _pxInspectOnChainV3_(contract, chain, config, timer) {
 var c = Addr.normalize(contract);
 if (!c) return { pools: [], chosen: null, priceUsd: null, error: "bad_contract" };
 var spec = _pxOnChainV3Spec_(chain, config);
 if (!spec || typeof RpcClient === "undefined" || !RpcClient.batchWithConsensus) {
  return { pools: [], chosen: null, priceUsd: null, error: "unsupported_chain" };
 }
 var chosen = null;
 var allPools = [];
  for (var i = 0; i < spec.factories.length; i++) {
   if (timer && timer.isLow && timer.isLow(6000)) return { pools: allPools, chosen: chosen, priceUsd: chosen ? chosen.priceUsd : null, error: "timer_low" };
   var pass = _pxFetchOnChainV3FromFactory_(c, spec, spec.factories[i], config, timer);
   if (pass.error) return { pools: allPools, chosen: chosen, priceUsd: null, error: pass.error };
   if (!pass.pools || !pass.pools.length) continue;
   allPools = allPools.concat(pass.pools);
   for (var p = 0; p < pass.pools.length; p++) {
    var pool = pass.pools[p];
    if (!_pxIsFinitePos(pool.priceUsd)) continue;
    if (!chosen || Number(pool.liquidity || 0) > Number(chosen.liquidity || 0)) chosen = pool;
   }
  }
 return {
  pools: allPools,
  chosen: chosen,
  priceUsd: chosen && _pxIsFinitePos(chosen.priceUsd) ? Number(chosen.priceUsd) : null,
  error: chosen ? null : null
 };
}

function _pxTryOnChainV3_(contract, chain, config, timer) {
 var c = Addr.normalize(contract);
 if (!c) return null;
 var spec = _pxOnChainV3Spec_(chain, config);
 if (!spec) return null;
 if (!PriceRunCache.onChainV3) PriceRunCache.onChainV3 = {};
 var runKey = spec.chainKey + ":" + c;
 if (PriceRunCache.onChainV3[runKey] !== undefined) return PriceRunCache.onChainV3[runKey];

 if (!(config && config._skipL1)) {
  try {
   var l1 = _pxL1GetJson(_pxOnChainV3PriceKey_(c));
   if (l1 && _pxIsFinitePos(l1.priceUsd)) {
    var cached = {
     priceUsd: Number(l1.priceUsd),
     source: "onchain-v3-l1",
     pool: l1.pool || null,
     quote: l1.quote || null,
     fee: l1.fee || null,
     factory: l1.factory || null,
     ts: l1.ts || 0
    };
    PriceRunCache.onChainV3[runKey] = cached;
    return cached;
   }
  } catch (eL1) {}
 }

 var diag = _pxInspectOnChainV3_(c, chain, config, timer);
 if (diag.error || !diag.chosen || !_pxIsFinitePos(diag.priceUsd)) {
  PriceRunCache.onChainV3[runKey] = null;
  return null;
 }
 var rec = {
  priceUsd: Number(diag.priceUsd),
  source: "onchain-v3",
  pool: diag.chosen.addr,
  quote: diag.chosen.quote,
  fee: diag.chosen.fee,
  factory: diag.chosen.factory,
  ts: _pxNowMs()
 };
 try { _pxL1SetJson(_pxOnChainV3PriceKey_(c), { pool: rec.pool, quote: rec.quote, fee: rec.fee, factory: rec.factory, priceUsd: rec.priceUsd, ts: rec.ts }, 21600); } catch (eL1Set) {}
 try { _pxL1SetJson(_pxOnChainV3HintKey_(spec.chainKey, c), { on: true, pool: rec.pool, factory: rec.factory }, 21600); } catch (eHint) {}
 PriceRunCache.onChainV3[runKey] = rec;
 return rec;
}

function DIAG_BASE_ONCHAIN_V3(contract) {
 var cfg = (typeof _BASE !== "undefined" && _BASE && _BASE.getConfig) ? _BASE.getConfig() : null;
 var diag = _pxInspectOnChainV3_(contract, "base", cfg, { isLow: function() { return false; }, isTimeUp: function() { return false; } });
 var out = {
  pools: [],
  chosen: null,
  priceUsd: diag && diag.priceUsd != null ? diag.priceUsd : null
 };
  if (diag && diag.pools && diag.pools.length) {
  for (var i = 0; i < diag.pools.length; i++) {
   out.pools.push({
    addr: diag.pools[i].addr,
    fee: diag.pools[i].fee,
    quote: diag.pools[i].quote,
    liquidity: diag.pools[i].liquidity,
    priceUsd: diag.pools[i].priceUsd
   });
  }
 }
 if (diag && diag.chosen) {
  out.chosen = {
   addr: diag.chosen.addr,
   fee: diag.chosen.fee,
   quote: diag.chosen.quote,
   liquidity: diag.chosen.liquidity,
   priceUsd: diag.chosen.priceUsd
  };
 }
 if (diag && diag.error) out.error = diag.error;
 try { console.log("[DIAG_BASE_ONCHAIN_V3] " + JSON.stringify(out)); } catch (eLog) {}
 return out;
}

function DIAG_CMC_DEX_BASE_MISSING() {
 var tokens = [
  ["LARHOC", "0x560b0307ffe0efe72fe567f30faacc927a03d5f3"],
  ["WZRD", "0xba72b8e600145e8d254bd565241a935b130f0112"],
  ["MINT", "0x9f21cd392ebdb7c1c65e32ba9d1c7d541ec910c6"],
  ["BARAN", "0x0dfd116f3b94062de121836550559836efdfec4f"],
  ["STRETCH", "0x8b8c85c61d33a7f7df7661ea4e69a34502aafca3"],
  ["JRA", "0xf37d0e4ea93aca7e0d3afa9df2a7774cf5bdd583"],
  ["ZAY", "0x26095fbf2a0f8332408198e7a89b7d54fae19bb7"],
  ["BSNOW", "0x6dcc9dba9b9bd0f4aa486b939df3a7d93d030b07"],
  ["ZECM", "0xae38dadd58b96926bf521162ebe948b132e29b07"]
 ];
 var out = [["Symbol", "HTTP", "Price USD", "Name", "Details"]];
 for (var i = 0; i < tokens.length; i++) {
  var sym = tokens[i][0];
  var addr = tokens[i][1];
  var diag = DIAG_CMC_DEX_TOKEN_BASE(addr);
  var http = "", price = "", name = "", details = "";
  for (var r = 0; r < diag.length; r++) {
   if (diag[r][0] === "HTTP") http = diag[r][1];
   if (diag[r][0] === "price_p") {
    price = diag[r][1];
    name = diag[r][2];
   }
   if (diag[r][0] === "EXCEPTION" || diag[r][0] === "PARSE") details = diag[r][1] + " " + diag[r][2];
  }
  out.push([sym, http, price, name, details]);
 }
 return out;
}

function DIAG_CMC_DEX_BASE_MISSING_SOURCE() {
 var cfg = (typeof _BASE !== "undefined" && _BASE.getConfig) ? _BASE.getConfig() : null;
 var timer = { isLow: function() { return false; } };
 var tokens = [
  "0x560b0307ffe0efe72fe567f30faacc927a03d5f3",
  "0xba72b8e600145e8d254bd565241a935b130f0112",
  "0x9f21cd392ebdb7c1c65e32ba9d1c7d541ec910c6",
  "0x0dfd116f3b94062de121836550559836efdfec4f",
  "0x8b8c85c61d33a7f7df7661ea4e69a34502aafca3",
  "0xf37d0e4ea93aca7e0d3afa9df2a7774cf5bdd583",
  "0x26095fbf2a0f8332408198e7a89b7d54fae19bb7",
  "0x6dcc9dba9b9bd0f4aa486b939df3a7d93d030b07",
  "0xae38dadd58b96926bf521162ebe948b132e29b07"
 ];
 var raw = PriceSources.cmcDexTokenPrices(tokens, timer, cfg, 12) || {};
 var out = [["Key", "Value", "Details"]];
 out.push(["_rateLimited", raw._rateLimited ? "YES" : "NO", ""]);
 out.push(["_partial", raw._partial ? "YES" : "NO", ""]);
 out.push(["_attempted", raw._attemptedContracts ? String(raw._attemptedContracts.length) : "0", raw._attemptedContracts ? raw._attemptedContracts.join(",") : ""]);
 for (var k in raw) {
  if (!raw.hasOwnProperty(k) || String(k).charAt(0) === "_") continue;
  var rec = raw[k] || {};
  out.push([k, rec.priceUsd != null ? String(rec.priceUsd) : "", (rec.symbol || "") + " | " + (rec.name || "") + " | " + (rec.source || "")]);
 }
 return out;
}

PriceSources.getLlamaIdForSymbol = PriceSources.getLlamaIdForSymbol || function(symbol, config) {
 if (!symbol) return null;
 var sym = String(symbol);

 // Chain-provided map (case sensitive tokens sometimes)
 try {
 if (config && config.LLAMA_ID_MAP) {
 if (config.LLAMA_ID_MAP[sym]) return config.LLAMA_ID_MAP[sym];
 var up = sym.toUpperCase();
 if (config.LLAMA_ID_MAP[up]) return config.LLAMA_ID_MAP[up];
 }
 } catch (e0) {}

 var up2 = sym.toUpperCase();
 var defaults = {
 'ETH': 'coingecko:ethereum',
 'WETH': 'coingecko:weth',
 'BTC': 'coingecko:bitcoin',
 'WBTC': 'coingecko:wrapped-bitcoin',
 'USDC': 'coingecko:usd-coin',
 'USDT': 'coingecko:tether',
 'DAI': 'coingecko:dai',
 'BNB': 'coingecko:binancecoin',
 'AVAX': 'coingecko:avalanche-2',
 'MATIC': 'coingecko:matic-network',
 'POL': 'coingecko:polygon-ecosystem-token',
 'FTM': 'coingecko:fantom',
 'CELO': 'coingecko:celo',
 'DOT': 'coingecko:polkadot',
 'ATOM': 'coingecko:cosmos',
 'FLR': 'coingecko:flare'
 };
 return defaults[up2] || null;
};

/**
 * GeckoTerminal token metadata (symbol, name, decimals)
 * Uses the /tokens/{address} endpoint
 * v4.9.2: Now supports both EVM (0x...) and SVM (base58) addresses
 * Returns { symbol, name, decimals } or null
 */
PriceSources.getGeckoTerminalMeta = PriceSources.getGeckoTerminalMeta || function(contract, timer, config) {
 var net = _pxGetGtNetwork(config);
 if (!net) return null;
 
 // v4.9.2: Support both EVM and SVM addresses
 var c = String(contract || '').trim();
 if (!c) return null;
 
 // For EVM addresses, normalize; for SVM base58, keep as-is
 var isEvmAddr = /^0x[0-9a-fA-F]{40}$/.test(c);
 var isSvmAddr = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(c);
 
 if (isEvmAddr) {
 c = Addr.normalize(c);
 if (!c) return null;
 } else if (!isSvmAddr) {
 return null; // Not a valid address format
 }

 // Cache key for metadata
 var ck = 'meta:' + net + ':' + c;
 if (PriceRunCache.geckoterminal[ck] !== undefined) return PriceRunCache.geckoterminal[ck];

 var baseUrl = _pxGetGtBaseUrl(config);
 // GeckoTerminal token info endpoint: /networks/{network}/tokens/{address}
 var url = baseUrl + '/' + encodeURIComponent(net) + '/tokens/' + encodeURIComponent(c);

 // v4.12.26: Track if this was a temporary error (don't cache)
 var wasTemporaryError = false;
 var json = null;
 try {
 if (_pxHttpBlocked("gt-meta")) return null;
 var response = UrlFetchApp.fetch(url, {
 muteHttpExceptions: true,
 deadline: 5,
 headers: { accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }
 });
 var httpCode = response.getResponseCode();

 // v4.12.26: 429 = rate limit, 5xx = server error Ã¢â€ â€™ don't cache null
 if (httpCode === 429 || httpCode >= 500) {
 wasTemporaryError = true;
 } else if (httpCode === 200) {
 json = JSON.parse(response.getContentText());
 }
 // 404 = token not found Ã¢â€ â€™ cache null (this is a valid "not found" result)
 } catch (e) {
 wasTemporaryError = true; // Network error, timeout, etc.
 }

 var meta = null;
 try {
 if (json && json.data && json.data.attributes) {
 var attr = json.data.attributes;
 meta = {};
 if (attr.symbol) meta.symbol = String(attr.symbol);
 if (attr.name) meta.name = String(attr.name);
 if (attr.decimals != null) {
 var d = parseInt(attr.decimals, 10);
 if (!isNaN(d) && d >= 0 && d <= 36) meta.decimals = d;
 }
 // If we got no useful data, return null
 if (!meta.symbol && !meta.name && meta.decimals == null) meta = null;
 }
 } catch (e) {
 meta = null;
 }

 // v4.12.26: Only cache if NOT a temporary error
 // This allows retry on next call for rate-limited or failed requests
 if (!wasTemporaryError) {
 PriceRunCache.geckoterminal[ck] = meta;
 }
 return meta;
};

// ============================================================
// BULK FETCH (contracts -> priceUsd objects)
// ============================================================

var BulkPriceFetch = BulkPriceFetch || {};

/**
 * Fetch prices for a list of token keys.
 * In EVM: keys are normalized 0x... contracts.
 * In SVM: keys are base58 mints (the caller passes base58), and the engine will use this map.
 *
 * Returns map: keyLower -> { priceUsd: number, symbol?, name?, source? }
 */
BulkPriceFetch.fetch = BulkPriceFetch.fetch || function(targetKeys, opts, timer, config) {
 var out = {};
 if (!targetKeys || !targetKeys.length) return out;

 var isSvm = false;
 try { isSvm = (config && config.CHAIN && String(config.CHAIN.VM || '').toUpperCase() === 'SVM'); } catch (eSvm2) {}

 // Optional throttling: allow engines to disable parallel price fetches.
 // This keeps behavior deterministic while reducing spikes in fetchAll().
 var cfg = config;
 try {
 var needCopy = false;
 if (opts && opts.parallelPrices === false) needCopy = true;
 if (opts && opts.skipL1) needCopy = true;

 if (needCopy && config) {
 cfg = JSON.parse(JSON.stringify(config));
 if (opts.parallelPrices === false) {
 cfg.PRICE_APIS = cfg.PRICE_APIS || {};
 cfg.PRICE_APIS.DEXSCREENER = cfg.PRICE_APIS.DEXSCREENER || {};
 cfg.PRICE_APIS.DEXSCREENER.MAX_PARALLEL = 1;
 cfg.PRICE_APIS.DEXSCREENER.MAX_WAVE = 1;
 }
 // v4.13.9: Propagate skipL1 to price sources (dexBulkTokens, gtTokenPriceUsd)
 // Ensures forceFull bypasses L1 CacheService to get fresh prices from APIs
 if (opts.skipL1) {
 cfg._skipL1 = true;
 }
 }
 } catch (eCfg) {
 cfg = config;
 }

 // normalize/unique
 var seen = {};
 var list = [];
 for (var i = 0; i < targetKeys.length; i++) {
 var k = String(targetKeys[i] || '').trim();
 if (!k) continue;

 // Keep as-is for non-EVM (SVM base58), normalize only if looks like 0x
 if (/^0x[0-9a-fA-F]{40}$/.test(k)) k = Addr.normalize(k);
 var kl = k.toLowerCase();
 if (!seen[kl]) { seen[kl] = true; list.push(k); }
 }
 if (!list.length) return out;

  var useDex = !!(opts && opts.dex);
  var useGt = !!(opts && opts.gt);

  // Try WCORE Web first: one authenticated batch call can replace many GAS-side API calls.
  if (!isSvm && (useDex || useGt)) {
  try {
  var webMap = PriceSources.wcoreWebBatchPrices(list, timer, cfg);
  Obj.forEach(webMap, function(k, v) {
   if (v && _pxIsFinitePos(v.priceUsd)) out[_pxKeyLower(k)] = v;
  });
  } catch (eWebBatch) {}
  }

  // Dex bulk works for EVM tokens and for Solana mints (SVM)
  if (useDex) {
 var dexSlug = _pxGetDexSlug(cfg);
 if (dexSlug || isSvm) {
 var dexMap = PriceSources.dexBulkTokens(list, timer, cfg);
 Obj.forEach(dexMap, function(k, v) { out[_pxKeyLower(k)] = v; });
 }
 }

 // SVM fallback: Jupiter price API by mint (USD). Useful when DexScreener has no pairs.
 if (isSvm) {
 var missing = [];
 for (var m = 0; m < list.length; m++) {
 var kkM = list[m];
 var klM = _pxKeyLower(kkM);
 if (!(out[klM] && _pxIsFinitePos(out[klM].priceUsd))) missing.push(kkM);
 }
 if (missing.length) {
 var jup = PriceSources.jupBulkMints(missing, timer, cfg);
 Obj.forEach(jup, function(k, v) {
 if (v && _pxIsFinitePos(v.priceUsd)) out[_pxKeyLower(k)] = v;
 });
 }
 }

 // v4.9.6: DefiLlama fallback via LLAMA_CONTRACT_MAP (for tokens not on DexScreener)
 // This runs BEFORE GeckoTerminal as Llama/CoinGecko is more reliable for mapped tokens
 if (cfg && cfg.LLAMA_CONTRACT_MAP) {
 var contractMap = cfg.LLAMA_CONTRACT_MAP;
 for (var lc = 0; lc < list.length; lc++) {
 var kkL = list[lc];
 var klL = _pxKeyLower(kkL);
 // Skip if already have a valid price
 if (out[klL] && _pxIsFinitePos(out[klL].priceUsd)) continue;
 
 // Check if this contract has a Llama mapping
 var llamaId = contractMap[klL] || contractMap[kkL] || null;
 if (llamaId) {
 try {
 var usdLlama = PriceSources.llamaPriceUsd(llamaId, timer, cfg);
 if (_pxIsFinitePos(usdLlama)) {
 out[klL] = { priceUsd: Number(usdLlama), source: 'llama-map' };
 }
 } catch (eLlamaMap) {}
 }
 }
 }

 // v4.15.12: DeFiLlama Coins batch fallback for chain contract prices.
 // Runs after Dex/Jupiter/LLAMA_CONTRACT_MAP and before GeckoTerminal to reduce GT 429 exposure.
 var llamaCoinsMissing = [];
 for (var lcb = 0; lcb < list.length; lcb++) {
 var lcbK = list[lcb];
 var lcbKl = _pxKeyLower(lcbK);
 if (out[lcbKl] && _pxIsFinitePos(out[lcbKl].priceUsd)) continue;
 if (/^0x[0-9a-f]{40}$/.test(lcbKl)) llamaCoinsMissing.push(lcbKl);
 }
 if (llamaCoinsMissing.length) {
 try {
 var llamaCoinsMap = PriceSources.llamaCoinsBatchUsd(llamaCoinsMissing, timer, cfg);
 var llamaCoinsCount = 0;
 Obj.forEach(llamaCoinsMap, function(k, v) {
 var kl = _pxKeyLower(k);
 if (!_pxIsFinitePos(v)) return;
 out[kl] = { priceUsd: Number(v), source: 'llama-coins' };
 llamaCoinsCount++;
 try {
  var lcSlug = _pxGetLlamaChainSlug(cfg);
  if (lcSlug) PriceRunCache.llamaCoins[lcSlug + ':' + kl] = Number(v);
 } catch (eRunLc) {}
 try { _pxL1SetJson(_pxL1Key("LLAMACOINS", cfg, kl), { u: Number(v) }, PX_L1_TTL_MIN_SEC); } catch (eL1Lc) {}
 });
 try { Logger.log('[LlamaCoinsBatch] priced ' + llamaCoinsCount + '/' + llamaCoinsMissing.length); } catch (eLogLc) {}
 } catch (eLlamaCoins) {
 try { Logger.log('[LlamaCoinsBatch] error: ' + String(eLlamaCoins.message || eLlamaCoins)); } catch (eLogLc2) {}
 }
 }

 // GeckoTerminal fallback per token (EVM and SVM)
 // v4.5.8: Now also supports SVM tokens (was EVM-only)
 // v4.9.7: Also fetch and persist metadata when getting price from GT
 if (useGt) {
 // v4.14.2: Batch pre-fetch via /token_price/ endpoint — replaces N individual Try 1 calls with 1-2 batch calls
 try {
 var _gtNet = _pxGetGtNetwork(cfg);
 var _gtBase = _pxGetGtSimpleBaseUrl(cfg); // v4.14.4: /token_price/ needs /simple/networks/ path
 if (_gtNet && _gtBase) {
 var _needGt = [];
 for (var bg = 0; bg < list.length; bg++) {
  var bgK = _pxKeyLower(list[bg]);
  if (out[bgK] && _pxIsFinitePos(out[bgK].priceUsd)) continue;
  if (/^0x[0-9a-f]{40}$/.test(bgK)) _needGt.push(bgK);
 }
 // GT /token_price/ supports comma-separated addresses (max 30 per call)
 for (var _bc = 0; _bc < _needGt.length; _bc += 30) {
  if (timer && timer.isLow && timer.isLow(3000)) break;
  var _batch = _needGt.slice(_bc, _bc + 30);
  try {
  var _bUrl = _gtBase + '/' + encodeURIComponent(_gtNet) + '/token_price/' + _batch.join('%2C');
  var _bJson = HTTP.getJson(_bUrl, { timeoutMs: 20000, headers: { accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }, muteHttpExceptions: true });
  if (_bJson && _bJson.data && _bJson.data.attributes && _bJson.data.attributes.token_prices) {
   var _bPrices = _bJson.data.attributes.token_prices;
   // Mark tokens that returned null — "NEED_DEEP" tells gtTokenPriceUsd to skip Try 1
   for (var _bm = 0; _bm < _batch.length; _bm++) {
   var _bmK = _batch[_bm];
   var _bmVal = _bPrices[_bmK];
   if (_bmVal != null && _pxIsFinitePos(Number(_bmVal))) {
    out[_bmK] = { priceUsd: Number(_bmVal), source: 'gt-batch' };
    PriceRunCache.geckoterminal[_gtNet + ':' + _bmK] = Number(_bmVal);
    try { _pxL1SetJson(_pxL1Key("GT", cfg, _bmK), { u: Number(_bmVal) }, PX_L1_TTL_MIN_SEC); } catch (eL1B) {}
   } else {
    // v4.14.3: Check L1 cache BEFORE marking NEED_DEEP — L1 may have price from previous cycle's Try 2/3
    // This resolves tokens instantly without needing the per-token GT fallback loop (saves HTTP + timer)
    var _l1Resolved = false;
    if (!(cfg && cfg._skipL1)) {
     try {
      var _l1Chk = _pxL1GetJson(_pxL1Key("GT", cfg, _bmK));
      if (_l1Chk && _pxIsFinitePos(_l1Chk.u)) {
       out[_bmK] = { priceUsd: Number(_l1Chk.u), source: 'gt-l1' };
       PriceRunCache.geckoterminal[_gtNet + ':' + _bmK] = Number(_l1Chk.u);
       _l1Resolved = true;
      }
     } catch (eL1Chk) {}
    }
    if (!_l1Resolved) {
     // Batch Try 1 returned null and no L1 — mark for direct Try 2+3
     var _pathTry3 = false;
     try {
      var _pathHint = _pxL1GetJson(_pxL1Key("GTPATH", cfg, _bmK));
      _pathTry3 = !!(_pathHint && _pathHint.p === "TRY3");
     } catch (ePathHint) {}
     PriceRunCache.geckoterminal[_gtNet + ':' + _bmK] = _pathTry3 ? "NEED_TRY3" : "NEED_DEEP";
    }
   }
   }
  }
  } catch (eBatch) {}
 }
 }
 } catch (eBatchOuter) {}

 // v4.9.7: Load MetaCache once for efficiency
 var gtMetaMap = null;
 var gtMetaUpdated = false;
 try {
 if (typeof MetaCache !== 'undefined' && MetaCache && MetaCache.load) {
 gtMetaMap = MetaCache.load(null, config) || {};
 }
 } catch (eGtMetaLoad) { gtMetaMap = {}; }

 // Per-token GT fallback: Try 2 (/tokens/) + Try 3 (/pools) for tokens not priced by batch
 // v4.14.3: Reorder to process NEED_DEEP tokens first — they have no price from any source
 // and need Try 2+3 HTTP calls. Tokens already priced (DexScreener, batch GT, L1) are
 // skipped via continue, but NEED_DEEP tokens are guaranteed to be processed first
 // before the timer runs out. This prevents "last token never priced" starvation.
 var _gtTry3 = [], _gtDeep = [], _gtRest = [];
 for (var _gri = 0; _gri < list.length; _gri++) {
 var _grk = _pxKeyLower(list[_gri]);
 if (out[_grk] && _pxIsFinitePos(out[_grk].priceUsd)) continue;
 var _grCk = _gtNet ? (_gtNet + ':' + _grk) : _grk;
 if (PriceRunCache.geckoterminal[_grCk] === "NEED_TRY3") { _gtTry3.push(list[_gri]); }
 else if (PriceRunCache.geckoterminal[_grCk] === "NEED_DEEP") { _gtDeep.push(list[_gri]); }
 else { _gtRest.push(list[_gri]); }
 }
 var _gtOrderedList = _gtTry3.concat(_gtDeep).concat(_gtRest);
 for (var j = 0; j < _gtOrderedList.length; j++) {
 if (timer && timer.isLow && timer.isLow((config && config.TIMEOUTS && config.TIMEOUTS.SAFE_SAVE_MARGIN_MS) ? config.TIMEOUTS.SAFE_SAVE_MARGIN_MS : 1500)) break;
 var kk = _gtOrderedList[j];
 var kl2 = _pxKeyLower(kk);
 if (out[kl2] && _pxIsFinitePos(out[kl2].priceUsd)) continue;

 // v4.5.8: Support both EVM (0x...) and SVM (base58) tokens
 var isEvm = /^0x[0-9a-f]{40}$/.test(kl2);
 var isSvmToken = isSvm && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(kk);
 if (!isEvm && !isSvmToken) continue;

 var usd = PriceSources.gtTokenPriceUsd(kk, timer, config);
 if (_pxIsFinitePos(usd)) {
 var gtResult = { priceUsd: Number(usd), source: 'gt' };
 
 // v4.9.7: Also fetch metadata if not already in MetaCache
 if (gtMetaMap && (!gtMetaMap[kl2] || !gtMetaMap[kl2].symbol || !gtMetaMap[kl2].name)) {
 try {
 var gtMeta = PriceSources.getGeckoTerminalMeta(kk, timer, config);
 if (gtMeta) {
 if (gtMeta.symbol) gtResult.symbol = gtMeta.symbol;
 if (gtMeta.name) gtResult.name = gtMeta.name;
 
 // Persist to MetaCache
 if (!gtMetaMap[kl2]) gtMetaMap[kl2] = {};
 if (gtMeta.symbol && !gtMetaMap[kl2].symbol) {
 gtMetaMap[kl2].symbol = gtMeta.symbol;
 gtMetaUpdated = true;
 }
 if (gtMeta.name && !gtMetaMap[kl2].name) {
 gtMetaMap[kl2].name = gtMeta.name;
 gtMetaUpdated = true;
 }
 if (gtMetaUpdated && !gtMetaMap[kl2].lastSeenMs) {
 gtMetaMap[kl2].lastSeenMs = Date.now();
 }
 }
 } catch (eGtMeta) {}
 } else if (gtMetaMap && gtMetaMap[kl2]) {
 // Use cached metadata
 if (gtMetaMap[kl2].symbol) gtResult.symbol = gtMetaMap[kl2].symbol;
 if (gtMetaMap[kl2].name) gtResult.name = gtMetaMap[kl2].name;
 }
 
 out[kl2] = gtResult;
 }
 }

 if ((!_gtNet || String(_gtNet).toLowerCase() === "base") && !(timer && timer.isLow && timer.isLow(6000))) {
  for (var oc = 0; oc < list.length; oc++) {
   var ocKey = _pxKeyLower(list[oc]);
   if (out[ocKey] && _pxIsFinitePos(out[ocKey].priceUsd)) continue;
   if (!/^0x[0-9a-f]{40}$/.test(ocKey)) continue;
   var ocRec = _pxTryOnChainV3_(ocKey, _gtNet || "base", cfg, timer);
   if (ocRec && _pxIsFinitePos(ocRec.priceUsd)) {
    out[ocKey] = { priceUsd: Number(ocRec.priceUsd), source: ocRec.source || 'onchain-v3' };
   }
  }
 }
 
 // v4.9.7: Save updated MetaCache
 if (gtMetaUpdated && gtMetaMap) {
 try {
 CacheManager.init();
 var metaKey = (config && config.KEYS && config.KEYS.META) ? String(config.KEYS.META) : "META_CACHE";
 CacheManager.safeSetJson(metaKey, gtMetaMap, config, 604800); // 7 days
 } catch (eGtMetaSave) {}
 }
 }

 return out;
};

// ============================================================
// PRICE MANAGER
// ============================================================

// ============================================================
// STABLECOIN SANITY (v4.8.0 - Unified via WCORE_STABLECOINS)
// ============================================================

/**
 * Get stablecoin type from centralized WCORE_STABLECOINS (01_INIT.gs)
 * @param {string} sym - Token symbol
 * @returns {string|null} 'USD', 'EUR', or null
 */
function _pxStableType_(sym) {
 var s = String(sym || '').trim().toUpperCase();
 if (!s) return null;
 
 // v4.8.0: Use WCORE_STABLECOINS from 01_INIT.gs (single source of truth)
 if (typeof WCORE_STABLECOINS !== 'undefined' && WCORE_STABLECOINS.getType) {
 return WCORE_STABLECOINS.getType(s);
 }
 
 // Fallback for backward compatibility
 if (typeof ChainFactory !== 'undefined' && ChainFactory.STABLECOINS && ChainFactory.STABLECOINS.getType) {
 return ChainFactory.STABLECOINS.getType(s);
 }
 
 return null;
}

PriceManager.getAttemptTs_ = PriceManager.getAttemptTs_ || function(attemptTsMap, key) {
 var item = attemptTsMap ? attemptTsMap[key] : null;
 if (!item) return 0;
 if (Num.isValid(item)) return Number(item);
 if (typeof item === "object" && Num.isValid(item.ts)) return Number(item.ts);
 return 0;
};

PriceManager.getAttemptTtl_ = PriceManager.getAttemptTtl_ || function(attemptTsMap, key, fallbackTtl) {
 var item = attemptTsMap ? attemptTsMap[key] : null;
 if (item && typeof item === "object" && Num.isValid(item.ttl)) return Number(item.ttl);
 return fallbackTtl;
};

PriceManager.isAttemptCooling_ = PriceManager.isAttemptCooling_ || function(attemptTsMap, key, nowMs, fallbackTtl) {
 var ts = PriceManager.getAttemptTs_(attemptTsMap, key);
 if (!ts) return false;
 var ttl = PriceManager.getAttemptTtl_(attemptTsMap, key, fallbackTtl);
 return (nowMs - ts) >= 0 && (nowMs - ts) < ttl;
};

PriceManager.setAttemptTs_ = PriceManager.setAttemptTs_ || function(attemptTsMap, key, nowMs, ttlMs, reason) {
 if (!attemptTsMap || !key) return;
 attemptTsMap[key] = {
  ts: nowMs || _pxNowMs(),
  ttl: ttlMs || PRICE_TEMP_ERROR_TTL_MS,
  reason: String(reason || "temporary")
 };
};

PriceManager._sanitizeStableEur_ = PriceManager._sanitizeStableEur_ || function(eur, asset, priceMap, keyLower) {
 try {
 var sym = (asset && (asset.symbol || asset.ticker)) ? String(asset.symbol || asset.ticker) : '';
 var t = _pxStableType_(sym);
 // Allow tokenlist-provided stable hint (some bridged stables use non-standard symbols)
 if (!t && asset && asset.isStable === true) {
 var peg = asset.peg || asset.stablePeg || null;
 t = (String(peg || '').toUpperCase() === 'EUR') ? 'EUR' : 'USD';
 }
 if (!t) return eur;

 var n = Number(eur);
 if (!isFinite(n) || n <= 0) return eur;

 // Sanity ranges (wide enough to tolerate FX swings, but filters obvious DEX garbage)
 var lo = (t === 'USD') ? 0.75 : 0.90;
 var hi = (t === 'USD') ? 1.35 : 1.10;

 if (n >= lo && n <= hi) return n;

 // If current quote is insane, keep last known EUR price if any
 var k = String(keyLower || '').toLowerCase();
 if (priceMap && typeof priceMap[k] === 'number' && isFinite(priceMap[k]) && priceMap[k] > 0) {
 return priceMap[k];
 }
 return null;
 } catch (e) {
 return eur;
 }
};


/**
 * Compute EUR price for an asset.
 * - asset.contract === 'native' uses DefiLlama via config.CHAIN.NATIVE_LLAMA_ID
 * - ERC20/SPL uses priceUsdMap first, then (optional) fallbacks.
 */
PriceManager.computePriceEur = PriceManager.computePriceEur || function(asset, key, priceUsdMap, fxRate, priceMap, priceTsMap, attemptTsMap, nowMs, timer, budget, config) {
 if (!asset || !key) return null;
 if (!_pxIsFinitePos(fxRate)) return null;

 // STABLECOIN FAST-PATH: avoid network calls when bulk sources miss
 // - USD-pegged stables: priceEUR ~= fxRate
 // - EUR-pegged stables: priceEUR ~= 1
 try {
 var sym0 = (asset && (asset.symbol || asset.ticker)) ? String(asset.symbol || asset.ticker) : '';
 var t0 = _pxStableType_(sym0);
 if (!t0 && asset && asset.isStable === true) {
 var peg0 = asset.peg || asset.stablePeg || null;
 t0 = (String(peg0 || '').toUpperCase() === 'EUR') ? 'EUR' : 'USD';
 }
 if (t0 === 'EUR') return 1;
 if (t0 === 'USD') return Number(fxRate);
 } catch (eStableFast) {}

 var k = _pxKeyLower(key);
 nowMs = nowMs || _pxNowMs();
 attemptTsMap = attemptTsMap || {};

 // 0) current-cycle live USD prices override cached EUR prices.
 // This lets GT/Llama/Dex heal a poisoned but still-fresh priceMap entry.
 try {
 if (priceUsdMap) {
 var pLive = priceUsdMap[k] || priceUsdMap[Addr.normalize(k)] || priceUsdMap[String(k)];
 if (pLive && _pxIsFinitePos(pLive.priceUsd)) {
 var eurLive = Number(pLive.priceUsd) * Number(fxRate);
 if (_pxIsFinitePos(eurLive)) {
 if (pLive.symbol && !asset.symbol) asset.symbol = pLive.symbol;
 if (pLive.name && !asset.name) asset.name = pLive.name;
 eurLive = PriceManager._sanitizeStableEur_(eurLive, asset, priceMap, k);
 if (_pxIsFinitePos(eurLive)) return eurLive;
 return null;
 }
 }
 }
 } catch (eLive0) {}

 // 0) if we already have a fresh EUR price in cache maps, reuse
 try {
 var ts = (priceTsMap && Num.isValid(priceTsMap[k])) ? priceTsMap[k] : null;
 var eur = (priceMap && Num.isValidPositive(priceMap[k])) ? priceMap[k] : null;
 var staleMs = (config && config.CACHE && config.CACHE.PRICE_STALE_MS) ? config.CACHE.PRICE_STALE_MS : 3600000;
 if (eur != null && ts != null && (nowMs - ts) >= 0 && (nowMs - ts) < staleMs) {
 return eur;
 }
 } catch (e0) {}

 // 1) if USD price map provides it, use it
 try {
 if (priceUsdMap) {
 var p = priceUsdMap[k] || priceUsdMap[Addr.normalize(k)] || priceUsdMap[String(k)];
 if (p && _pxIsFinitePos(p.priceUsd)) {
 var eur1 = Number(p.priceUsd) * Number(fxRate);
 if (_pxIsFinitePos(eur1)) {
 if (p.symbol && !asset.symbol) asset.symbol = p.symbol;
 if (p.name && !asset.name) asset.name = p.name;
 eur1 = PriceManager._sanitizeStableEur_(eur1, asset, priceMap, k);
 if (_pxIsFinitePos(eur1)) return eur1;
 return null;
 }
 }
 }
 } catch (e1) {}

 // 2) Native pricing via Llama
 if (asset.contract === 'native' || String(k).indexOf('native@') === 0) {
 var llamaId = (config && config.CHAIN && config.CHAIN.NATIVE_LLAMA_ID) ? config.CHAIN.NATIVE_LLAMA_ID : null;
 var geckoId = (config && config.CHAIN && config.CHAIN.NATIVE_GECKO_ID) ? config.CHAIN.NATIVE_GECKO_ID : null;
 if (!llamaId && config && config.CHAIN && config.CHAIN.NATIVE_SYMBOL) {
 llamaId = PriceSources.getLlamaIdForSymbol(config.CHAIN.NATIVE_SYMBOL, config);
 }

 if (llamaId) {
 var usdNat = null;
 try {
 usdNat = PriceSources.llamaPriceUsd(llamaId, timer, config);
 } catch (eLlamaNat) {
 usdNat = null;
 }
 if (_pxIsFinitePos(usdNat)) {
 var eurNat = Number(usdNat) * Number(fxRate);
 eurNat = PriceManager._sanitizeStableEur_(eurNat, asset, priceMap, k);
 if (_pxIsFinitePos(eurNat)) return eurNat;
 }
 }

 // On-chain native proxy (wrapped native) pricing via DEX aggregators.
 // For Flare: config.CHAIN.NATIVE_PRICE_CONTRACT = WFLR (1:1 with FLR)
 // This avoids CoinGecko 429 and Llama "not found".
 var proxy = (config && config.CHAIN && config.CHAIN.NATIVE_PRICE_CONTRACT) ? Addr.normalize(config.CHAIN.NATIVE_PRICE_CONTRACT) : null;
 if (proxy) {
 // Try GeckoTerminal token_price first (fast, chain aware)
 var usdPx = PriceSources.gtTokenPriceUsd(proxy, timer, config);
 if (_pxIsFinitePos(usdPx)) {
 var eurPx = Number(usdPx) * Number(fxRate);
 eurPx = PriceManager._sanitizeStableEur_(eurPx, asset, priceMap, k);
 if (_pxIsFinitePos(eurPx)) return eurPx;
 }
 // Try DexScreener bulk tokens endpoint
 try {
 var dx = PriceSources.dexBulkTokens([proxy], timer, config);
 var rec = dx && dx[proxy];
 if (rec && _pxIsFinitePos(rec.priceUsd)) {
 var eurDx = Number(rec.priceUsd) * Number(fxRate);
 eurDx = PriceManager._sanitizeStableEur_(eurDx, asset, priceMap, k);
 if (_pxIsFinitePos(eurDx)) return eurDx;
 }
 } catch (eProxy) {}
 }

 // CoinGecko fallback for native if Llama is unavailable
 if (geckoId) {
 var usdCg = null;
 try {
 usdCg = PriceSources.coingeckoPriceUsd(geckoId, timer, config);
 } catch (eCgNat) {
 usdCg = null;
 }
 if (_pxIsFinitePos(usdCg)) {
 var eurCg = Number(usdCg) * Number(fxRate);
 eurCg = PriceManager._sanitizeStableEur_(eurCg, asset, priceMap, k);
 if (_pxIsFinitePos(eurCg)) return eurCg;
 }
 }
 return null;
 }

 // 3) Fallback Llama by symbol (rate limited with attemptTsMap)
 var cooldown = (config && config.CACHE && config.CACHE.PRICE_ATTEMPT_COOLDOWN_MS) ? config.CACHE.PRICE_ATTEMPT_COOLDOWN_MS : 21600000;
 if (PriceManager.isAttemptCooling_(attemptTsMap, k, nowMs, cooldown)) {
 return null;
 }

 // Only if explicitly allowed
 if (budget && budget.allowLlamaCg) {
 PriceManager.setAttemptTs_(attemptTsMap, k, nowMs, PRICE_NEGATIVE_TTL_MS, "llama-symbol-fallback");
 var sym = (asset.symbol || asset.ticker || null);
 var llama = sym ? PriceSources.getLlamaIdForSymbol(sym, config) : null;
 if (llama) {
 var usd2 = null;
 try {
 usd2 = PriceSources.llamaPriceUsd(llama, timer, config);
 } catch (eLlamaSym) {
 usd2 = null;
 }
 if (_pxIsFinitePos(usd2)) {
 var eur2 = Number(usd2) * Number(fxRate);
 eur2 = PriceManager._sanitizeStableEur_(eur2, asset, priceMap, k);
 if (_pxIsFinitePos(eur2)) {
 delete attemptTsMap[k];
 return eur2;
 }
 }
 }
 }

 var onChainRec = null;
 try {
  if (/^0x[0-9a-f]{40}$/.test(k)) {
   onChainRec = _pxTryOnChainV3_(k, _pxGetGtNetwork(config) || (config && config.CHAIN && config.CHAIN.CHAIN_ID), config, timer);
  }
 } catch (eOnChain) {
  onChainRec = null;
 }
 if (onChainRec && _pxIsFinitePos(onChainRec.priceUsd)) {
  var eurOc = Number(onChainRec.priceUsd) * Number(fxRate);
  eurOc = PriceManager._sanitizeStableEur_(eurOc, asset, priceMap, k);
  if (_pxIsFinitePos(eurOc)) {
   delete attemptTsMap[k];
   return eurOc;
  }
 }

 return null;
};

PriceManager.cleanupAttempts = PriceManager.cleanupAttempts || function(attemptTsMap, nowMs, config) {
 if (!attemptTsMap) return;
 nowMs = nowMs || _pxNowMs();
 var maxAge = (config && config.CACHE && config.CACHE.PRICE_ATTEMPT_COOLDOWN_MS)
 ? config.CACHE.PRICE_ATTEMPT_COOLDOWN_MS
 : 21600000;

 var keys = Object.keys(attemptTsMap);
 for (var i = 0; i < keys.length; i++) {
 var k = keys[i];
 var ts = PriceManager.getAttemptTs_(attemptTsMap, k);
 if (!ts) { delete attemptTsMap[k]; continue; }
 var ttl = PriceManager.getAttemptTtl_(attemptTsMap, k, maxAge);
 if ((nowMs - ts) > (ttl * 2)) delete attemptTsMap[k];
 }
};

function TEST_REG_PRICE() {
 var config = _GNOSIS.config;
 var results = [];
 
 // 1. VÃƒÆ’Ã†â€™Ãƒâ€ Ã¢EURâ„¢ÃƒÆ’Ã¢EURÅ¡Ãƒâ€šÃ‚Â©rifier que LLAMA_CONTRACT_MAP existe
 results.push("LLAMA_CONTRACT_MAP exists: " + (config.LLAMA_CONTRACT_MAP ? "YES" : "NO"));
 
 if (config.LLAMA_CONTRACT_MAP) {
 var regContract = "0x0aa1e96d2a46ec6beb2923de1e61addf5f5f1dce";
 var llamaId = config.LLAMA_CONTRACT_MAP[regContract];
 results.push("REG llamaId: " + (llamaId || "NOT FOUND"));
 
 // 2. Tester l'appel DefiLlama direct
 if (llamaId) {
 try {
 var usd = PriceSources.llamaPriceUsd(llamaId, null, config);
 results.push("DefiLlama price USD: " + usd);
 } catch (e) {
 results.push("DefiLlama ERROR: " + e.message);
 }
 }
 }
 
 // 3. Tester BulkPriceFetch avec le contrat REG
 try {
 var bulk = BulkPriceFetch.fetch(
 ["0x0aa1e96d2a46ec6beb2923de1e61addf5f5f1dce"],
 { dex: true, gt: true },
 null,
 config
 );
 var regKey = "0x0aa1e96d2a46ec6beb2923de1e61addf5f5f1dce";
 if (bulk[regKey]) {
 results.push("BulkPriceFetch result: " + JSON.stringify(bulk[regKey]));
 } else {
 results.push("BulkPriceFetch: NO PRICE FOUND");
 }
 } catch (e2) {
 results.push("BulkPriceFetch ERROR: " + e2.message);
 }
 
 return results;
}

// ============================================================
// PURGE CHAIN PRICES (v4.13.9 - Manual cache cleanup)
// ============================================================

/**
 * Purge cached prices for specific contracts from ALL cache layers.
 * Use when tokens have wrong prices stuck in L1/GlobalPriceCache.
 *
 * @param {string} contracts - Comma-separated contract addresses to purge
 * @param {string} chainSlug - DexScreener chain slug (e.g., "base", "ethereum")
 * @param {string} gtNetwork - GeckoTerminal network (e.g., "base", "eth")
 * @returns {string[][]} Status report
 */
function PURGE_CHAIN_PRICES(contracts, chainSlug, gtNetwork) {
 var results = [["Layer", "Action", "Details"]];
 try {
 if (!contracts) return [["Error", "No contracts provided", "Usage: PURGE_CHAIN_PRICES(\"0xabc,0xdef\", \"base\", \"base\")"]];

 var list = String(contracts).split(",");
 var cleaned = [];
 for (var i = 0; i < list.length; i++) {
 var c = String(list[i] || "").trim().toLowerCase();
 if (c) cleaned.push(c);
 }
 if (!cleaned.length) return [["Error", "No valid contracts", ""]];

  // Layer 1: L1 CacheService (DEX + GT keys)
  var l1Keys = [];
  for (var j = 0; j < cleaned.length; j++) {
  if (chainSlug) l1Keys.push(CK_get("priceDex", { chainSlug: chainSlug, contract: cleaned[j] }));
  if (gtNetwork) l1Keys.push(CK_get("priceGt", { gtNetwork: gtNetwork, contract: cleaned[j] }));
  }
 try {
 var cache = CacheService.getScriptCache();
 if (cache && l1Keys.length > 0) {
 cache.removeAll(l1Keys);
 results.push(["L1 CacheService", "Removed " + l1Keys.length + " keys", l1Keys.join(", ")]);
 }
 } catch (eL1) {
 results.push(["L1 CacheService", "ERROR", eL1.message]);
 }

 // Layer 2: GlobalPriceCache (priceMap + priceTsMap + entries)
 try {
 var gpc = GlobalPriceCache._load();
 var removedPm = 0, removedPt = 0, removedEnt = 0;
 for (var k = 0; k < cleaned.length; k++) {
 var cc = cleaned[k];
 if (gpc.priceMap && gpc.priceMap[cc] != null) { delete gpc.priceMap[cc]; removedPm++; }
 if (gpc.priceTsMap && gpc.priceTsMap[cc] != null) { delete gpc.priceTsMap[cc]; removedPt++; }
 // Entries use chainId:contract format — remove ALL chainIds for this contract
 if (gpc.entries) {
 for (var ek in gpc.entries) {
 if (ek.indexOf(":" + cc) >= 0) { delete gpc.entries[ek]; removedEnt++; }
 }
 }
 }
 GlobalPriceCache._cache = gpc;
 GlobalPriceCache._save();
 results.push(["GlobalPriceCache", "Removed", "priceMap:" + removedPm + " priceTsMap:" + removedPt + " entries:" + removedEnt]);
 } catch (eGPC) {
 results.push(["GlobalPriceCache", "ERROR", eGPC.message]);
 }

 // Layer 3: WalletCache priceMap (in packed wallet cache)
 // This is more complex — the packed cache has hash-based keys.
 // forceFull (C1=TRUE) already clears WalletCache, so this is usually not needed.
 results.push(["WalletCache", "Skipped", "Use C1=TRUE to clear WalletCache"]);

 results.push(["Summary", "Purged " + cleaned.length + " contracts", new Date().toISOString()]);
 } catch (e) {
 results.push(["Error", e.message, ""]);
 }
 return results;
}
