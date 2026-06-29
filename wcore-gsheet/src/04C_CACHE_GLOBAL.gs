/************************************************************
 * 04C_CACHE_GLOBAL.gs - Global Caches (Price, FX, Meta)
 *
 * Version: v4.15.51
 *
 * v4.15.51 - WALLET_CACHE: preserved partial scans merge positive incoming prices.
 *   When the last-line guard keeps a fuller previous cache (partial_less_assets),
 *   do not discard valid prices discovered by WCORE Web. Merge positive incoming
 *   priceMap/priceTsMap entries into the preserved cache before returning.
 *
 * v4.15.50 - FX: cascade 4 sources (frankfurter, open-er-api, coinbase, defillama-eurc)
 *   with median consensus, no fixed fallback. Mirror of @wcore/core/src/fx.ts web side.
 *   Throws if all sources fail (was: return FxRate._cached || 0.92).
 *   Sources list order: frankfurter → open-er-api → coinbase → defillama-eurc.
 *   Frankfurter and DefiLlama EURC return USD per 1 EUR natively — inverted here.
 *   Cross-deploy cache invalidation: FxRate._CURRENT_VERSION stamped in L1 + memory.
 *   Bump _CURRENT_VERSION to force a fresh fetch after deploy (no 1h wait).
 *   Cross-runtime telemetry: posts to /api/gsheet/fx-telemetry on every fetch
 *   for /api/diag/fx-parity drift detection.
 *
 * v4.15.34 - FIX: _mergeAssetsPreservingCached respects balanceTsMap zero markers.
 *   AssetManager.purgeIfZero removes zero-balance tokens from assetByKey, so
 *   they are absent from cacheObj.assets/a. The merge previously treated that
 *   absence as a consensus miss and re-preserved stale cached tokens. Now
 *   balanceTsMap[contract]=0 / bt[contract]=0 is a confirmed zero signal.
 *
 * v4.15.33 - FIX: forceFull skip removed from _mergeAssetsPreservingCached.
 *   The merge now ALWAYS runs regardless of force flag. activityForced
 *   (WATCHDOG detecting TX → state.force=true → _forceFull=true on save)
 *   was causing the entire merge to be skipped, dropping tokens that
 *   failed RPC consensus. Only tokens explicitly rescanned with balance=0
 *   (present in newSet) are removed; tokens absent from the new scan
 *   (consensus fail) are always preserved. Fixes ZERO Network WBTC
 *   disappearance.
 *
 * v4.15.32 - WALLET_CACHE: cache-consensus merge actually persists.
 *   v4.15.22 introduced _mergeAssetsPreservingCached but only pushed into
 *   cacheObj.assets (expanded format). Engines submit cacheObj already in
 *   compact form (v >= 4 with .a populated), and _migrate() short-circuits
 *   when v >= 4 â†’ additions to .assets were silently dropped. Now the merge
 *   reads existingCache assets in either format, and pushes preserved tokens
 *   into BOTH .assets (if present) AND .a (compact array, the actual store).
 *   Concrete repro: ZERO Network WBTC (0xf1f9â€¦960e) kept disappearing despite
 *   no on-chain TX â€” autoForced scans hit consensus failure on the 3rd token
 *   (Zerion+Caldera+Thirdweb, HTTP_MS=5000ms, preT often >5s) and the merge
 *   fix wasn't actually persisting the stale token. Now it does.
 *
 * v4.15.22 - WALLET_CACHE: token-level cache consensus (per-asset preservation).
 *   Existing last-line guard (v4.15.21) preserves the whole cache when the new
 *   payload is globally degraded. But when the scan reports fullCycleComplete
 *   without HTTP errors yet the RPC consensus silently dropped *one* token
 *   (e.g. WBTC on ZERO Network: 3 fragile RPCs, one timeout, no majority â†’
 *   token omitted from result), the write was accepted and the token
 *   disappeared from the Ledger. Now WalletCache.save merges cached assets
 *   the new scan does not list back into the outgoing payload as long as
 *   (a) we are not in forceFull, (b) the cached balance was strictly > 0,
 *   (c) the new scan did not explicitly return the same contract with
 *   balance = 0 (which is a legitimate confirmed removal). Preserved tokens
 *   are flagged _stale=true and counted in scanStats.preservedFromCache for
 *   observability. Respects AGENTS.md cardinal rule: never overwrite valid cache.
 *
 * v4.15.21 - WALLET_CACHE: partial scans cannot shrink existing caches.
 *   The last-line WalletCache.save guard preserves a fuller previous cache
 *   when the incoming scanStats.fullCycleComplete=false payload has fewer assets.
 *
 * v4.15.20 - PRICING_WORKER: purge no-market price sentinels.
 *   price=0/src=no-market is not a reliable market conclusion. Historical
 *   entries are removed on load and unresolved retries use worker cooldowns.
 *
 * v4.15.19 - PRESERVE: no-market never overwrites historical positive prices
 *   A zero negative-cache is only allowed when no positive price exists in
 *   entries or priceMap. This prevents temporary source failures from masking
 *   a price WCORE already found earlier.
 *
 * v4.15.18 - WALLET_CACHE: compact no-market zero prices
 *   _migrate() keeps priceMap[contract]=0 only when priceTsMap has the key,
 *   preserving explicit no-market rows without storing pending zero targets.
 *
 * v4.15.17 - PRICING_WORKER: explicit no-market entries
 *   Tokens fully exhausted by the background cascade can be stored as
 *   src="no-market" with price=0. Pending targets still use price=0 with
 *   src="wallet-active", so zero is never treated as a valid price unless the
 *   source explicitly says no-market.
 *
 * v4.15.15 - FIX: WalletCache refuses unconfirmed empty/destructive writes
 *   Quota and HTTP-error scans preserve prior wallet cache unless forceFull.
 *
 * v4.15.14 - FIX: GPC.save() re-reads ScriptProperties before merge-on-save
 *   Concurrent chains now merge into the latest stored GPC snapshot just before
 *   writing, so the last writer no longer drops prices saved by earlier writers.
 *
 * v4.14.0 - FIX: GPC.save() now MERGES instead of REPLACING priceMap/priceTsMap
 *   Previously, each chain's save() overwrote the entire GPC with only its own prices,
 *   destroying cross-chain price data. Now prices accumulate across all chains.
 *   Added pruning when entries exceed MAX_PRICE_ENTRIES (keeps freshest).
 *
 * v4.13.0 - SCANSTATS SUPPORT:
 * - Added scanStats (ss) field to wallet cache for rotation info
 * - Preserved in _migrate and _expand functions
 * - Used by BASE_ENGINE to display Rotation.status in STATS
 *
 * Caches globaux partages entre toutes les chains.
 * Contient:
 * - Global Price Cache (DeFiLlama, CoinGecko)
 * - Global FX Cache (USD/EUR)
 * - Cache Version Registry
 * - FxRate API public
 * - WalletCache adapter (pour EvmEngine) - FORMAT ULTRA-COMPACT v4.9.1
 * - MetaCache adapter
 * - GlobalPriceCache adapter
 * 
 * OPTIMISATIONS v4.9.1:
 * - Format de cache wallet ultra-compact (gain ~47%)
 * - Adresses de contrats raccourcies (8 chars)
 * - Suppression des metadonnees redondantes
 * - Compression des cles JSON
 * 
 * DEPENDANCES: 04A_CACHE_CORE.gs, 04B_CACHE_WALLET.gs
 ************************************************************/
var CACHE_GLOBAL_VERSION = "4.15.51";

// ============================================================
// AUTO-REGISTRATION (v4.13.0)
// ============================================================
if (typeof ModuleRegistry !== 'undefined') {
  ModuleRegistry.register("CACHE_GLOBAL", CACHE_GLOBAL_VERSION, {
    description: "Global caches with merge-based GPC save",
    dependencies: ["CACHE_CORE", "CACHE_WALLET"]
  });
}

// ============================================================
// CACHE COMPACT CONFIG (v4.9.1)
// ============================================================

var COMPACT_CACHE_CONFIG = {
 // Taille des adresses de contrats dans le cache (8 = premiers 8 chars apres 0x)
 ADDR_SHORT_LENGTH: 8,
 
 // Version du format compact
 COMPACT_VERSION: 1,
 
 // Seuils de compaction
 MIN_BALANCE_TO_CACHE: 0.000001, // Ignorer les dust
 MAX_TOKENS_PER_WALLET: 100, // Limiter le nombre de tokens
 
 // Cles JSON ultra-courtes (1-2 caracteres)
 KEYS: {
 NATIVE_BALANCE: 'nb',
 NATIVE_PRICE: 'np',
 TOKENS: 't',
 ADDRESS: 'a',
 BALANCE: 'b',
 PRICE: 'p',
 TIMESTAMP: 'ts',
 VERSION: 'v',
 CHAIN: 'c'
 }
};

/**
 * Raccourcir une adresse de contrat (garde 0x + premiers N chars)
 */
function shortenAddress(addr, length) {
  length = length || COMPACT_CACHE_CONFIG.ADDR_SHORT_LENGTH;
  if (!addr || typeof addr !== 'string') return '';
  var cleaned = addr.toLowerCase().replace(/^0x/, '');
  return cleaned.substring(0, length);
}

/**
 * WARNING: expandAddress CANNOT restore the full original address.
 * It only prepends "0x" to the truncated form. For exact matching,
 * use the full address from assetByKey or the wallet cache entries.
 * Shortened addresses are for display/compact storage only.
 * @deprecated Use full addresses for any matching or lookup operation.
 */
function expandAddress(shortAddr) {
  if (!shortAddr) return '';
  return '0x' + shortAddr;
}


// ============================================================
// GLOBAL PRICE CACHE (compatible EvmEngine/SvmEngine/CosmosEngine)
// ============================================================

var GlobalPriceCache = GlobalPriceCache || {};

if (typeof GLOBAL_CACHE_KEYS === "undefined") {
 var GLOBAL_CACHE_KEYS = {
 GLOBAL_PRICES: "GLOBAL_PRICE_CACHE_V2",
 GLOBAL_FX: "GLOBAL_FX_CACHE_V1",
 GLOBAL_WALLET: CK_get("walletGlobal"),
 GLOBAL_META: "GLOBAL_TOKEN_META_V1",
 CACHE_VERSIONS: "CACHE_VERSIONS_REGISTRY",
 LAST_CLEANUP: "GLOBAL_LAST_CLEANUP_TS"
 };
}

if (typeof GLOBAL_CACHE_CONFIG === "undefined") {
 var GLOBAL_CACHE_CONFIG = {
 PRICE_TTL_MS: 600000,
 PRICE_STALE_MS: 5400000,
 FX_TTL_MS: 3600000,
 META_TTL_MS: 604800000,
 CLEANUP_INTERVAL_MS: 86400000,
 MAX_PRICE_ENTRIES: 5000,
 CURRENT_CACHE_VERSION: 3
 };
}

(function() {
 var GPC = GlobalPriceCache;
 GPC._cache = GPC._cache || null;
 GPC._key = GLOBAL_CACHE_KEYS.GLOBAL_PRICES;

 GPC._load = function() {
 if (this._cache) return this._cache;
 CacheManager.init();
 var raw = CacheManager.safeGet(this._key);
 if (!raw) {
 this._cache = { v: GLOBAL_CACHE_CONFIG.CURRENT_CACHE_VERSION, entries: {}, updatedAt: 0, priceMap: {}, priceTsMap: {} };
 return this._cache;
 }
  try {
  this._cache = JSON.parse(raw);
  if (!this._cache.entries) this._cache.entries = {};
  if (!this._cache.priceMap) this._cache.priceMap = {};
  if (!this._cache.priceTsMap) this._cache.priceTsMap = {};
  var purged = this._purgeNoMarketSentinels_();
  if (purged > 0) this._save();
  } catch (e) {
  this._cache = { v: GLOBAL_CACHE_CONFIG.CURRENT_CACHE_VERSION, entries: {}, updatedAt: 0, priceMap: {}, priceTsMap: {} };
  }
  return this._cache;
  };

  GPC._purgeNoMarketSentinels_ = function() {
  var purged = 0;
  try {
  var entries = this._cache && this._cache.entries ? this._cache.entries : {};
  for (var key in entries) {
  if (!entries.hasOwnProperty(key)) continue;
  var entry = entries[key];
  if (entry && entry.src === "no-market") {
  delete entries[key];
  purged++;
  }
  }
  var pm = this._cache && this._cache.priceMap ? this._cache.priceMap : {};
  var pt = this._cache && this._cache.priceTsMap ? this._cache.priceTsMap : {};
  for (var pKey in pm) {
  if (!pm.hasOwnProperty(pKey)) continue;
  if (Number(pm[pKey]) === 0) {
  delete pm[pKey];
  if (pt && Object.prototype.hasOwnProperty.call(pt, pKey)) delete pt[pKey];
  purged++;
  }
  }
  } catch (e) {}
  return purged;
  };

 GPC._save = function() {
 if (!this._cache) return;
 this._cache.updatedAt = Date.now();
 
 // Limit entries
 var keys = Object.keys(this._cache.entries || {});
 if (keys.length > GLOBAL_CACHE_CONFIG.MAX_PRICE_ENTRIES) {
 var sorted = keys.sort(function(a, b) {
 var ta = (GPC._cache.entries[a] && GPC._cache.entries[a].ts) || 0;
 var tb = (GPC._cache.entries[b] && GPC._cache.entries[b].ts) || 0;
 return ta - tb;
 });
 var toRemove = sorted.slice(0, keys.length - GLOBAL_CACHE_CONFIG.MAX_PRICE_ENTRIES);
 for (var i = 0; i < toRemove.length; i++) {
 delete this._cache.entries[toRemove[i]];
 }
 }
 
 CacheManager.safeSet(this._key, JSON.stringify(this._cache), 21600);
 };

 // Simple get/set by chainId + contract
 GPC.get = function(chainId, contract) {
 var cache = this._load();
 var key = String(chainId || "") + ":" + String(contract || "").toLowerCase();
 var entry = cache.entries[key];
 if (!entry) return null;
 
 var age = Date.now() - (entry.ts || 0);
 if (age > GLOBAL_CACHE_CONFIG.PRICE_STALE_MS) return null;
 
 return entry.price;
 };

 GPC.set = function(chainId, contract, priceUsd, source) {
 var cache = this._load();
 var key = String(chainId || "") + ":" + String(contract || "").toLowerCase();
 cache.entries[key] = {
 price: priceUsd,
 ts: Date.now(),
 src: source || "unknown"
 };
 this._save();
 };

 GPC.getMulti = function(chainId, contracts) {
 var cache = this._load();
 var results = {};
 var now = Date.now();
 
 for (var i = 0; i < contracts.length; i++) {
 var c = String(contracts[i] || "").toLowerCase();
 var key = String(chainId || "") + ":" + c;
 var entry = cache.entries[key];
 if (entry && (now - (entry.ts || 0)) <= GLOBAL_CACHE_CONFIG.PRICE_STALE_MS) {
 results[c] = entry.price;
 }
 }
 return results;
 };

 GPC.getFresh = function(chainId, contract, maxAgeMs) {
 var cache = this._load();
 var key = String(chainId || "") + ":" + String(contract || "").toLowerCase();
 var entry = cache.entries[key];
 if (!entry) return null;
 if (entry.src === "no-market") return null;

 var ttl = Number(maxAgeMs || 21600000);
 if (!isFinite(ttl) || ttl <= 0) ttl = 21600000;
 if ((Date.now() - (entry.ts || 0)) > ttl) return null;

 return {
 price: entry.price,
 ts: entry.ts || 0,
 src: entry.src || "unknown",
 reason: entry.reason || "",
 noMarket: entry.src === "no-market"
 };
 };

 GPC.getActiveEntries = function(maxAgeMs) {
 var cache = this._load();
 var now = Date.now();
 var ttl = Number(maxAgeMs || 86400000);
 if (!isFinite(ttl) || ttl <= 0) ttl = 86400000;
 var out = [];
 var entries = cache.entries || {};
 for (var key in entries) {
 if (!entries.hasOwnProperty(key)) continue;
 var entry = entries[key];
 if (!entry || !entry.ts || (now - entry.ts) > ttl) continue;
 if (entry.src === "no-market") continue;
 var sep = key.indexOf(":");
 if (sep <= 0) continue;
 out.push({
 chainId: key.substring(0, sep),
 contract: key.substring(sep + 1),
 price: entry.price,
 ts: entry.ts,
 src: entry.src || "unknown"
 });
 }
 return out;
 };

 GPC.savePrice = function(chainId, contract, priceUsd, source) {
 return this.set(chainId, contract, priceUsd, source);
 };

 GPC.touchTargets = function(chainId, contracts, source) {
 var cache = this._load();
 var now = Date.now();
 var cid = String(chainId || "");
 var touched = 0;
 for (var i = 0; i < (contracts || []).length; i++) {
 var c = String(contracts[i] || "").toLowerCase();
 if (!cid || !c || c === "native") continue;
 var key = cid + ":" + c;
 var prev = cache.entries[key] || {};
 if (prev.src === "no-market") prev = {};
 cache.entries[key] = {
 price: Number(prev.price || 0),
 ts: now,
 src: prev.src || source || "active-target"
 };
 touched++;
 }
 if (touched > 0) this._save();
 return touched;
 };

 // EvmEngine-compatible load: returns { priceMap, priceTsMap, ... }
 GPC.load = function(timer, config) {
 var cache = this._load();
 
 // If already in EvmEngine shape, return directly
 if (cache && typeof cache === "object" && cache.priceMap && cache.priceTsMap) {
 return {
 version: cache.v || GLOBAL_CACHE_CONFIG.CURRENT_CACHE_VERSION,
 updatedAt: cache.updatedAt || Date.now(),
 priceMap: cache.priceMap || {},
 priceTsMap: cache.priceTsMap || {},
 attempts: cache.attempts || {}
 };
 }

 // Return empty compatible structure
 return {
 version: GLOBAL_CACHE_CONFIG.CURRENT_CACHE_VERSION,
 updatedAt: Date.now(),
 priceMap: {},
 priceTsMap: {},
 attempts: {}
 };
 };

 // EvmEngine-compatible save: save(priceMap, priceTsMap, config, timer)
 // v4.14.0: MERGE instead of REPLACE â€” preserve prices from other chains
 GPC.save = function(priceMap, priceTsMap, _config, timer) {
 try {
 CacheManager.init();
 var raw = CacheManager.safeGet(this._key);
 var c = null;
 if (raw) {
 try { c = JSON.parse(raw); } catch (eParse) { c = null; }
 }
 if (!c || typeof c !== "object") {
 c = { v: GLOBAL_CACHE_CONFIG.CURRENT_CACHE_VERSION, entries: {}, updatedAt: 0, priceMap: {}, priceTsMap: {} };
 }
 if (!c.entries) c.entries = {};
 if (!c.priceMap) c.priceMap = {};
 if (!c.priceTsMap) c.priceTsMap = {};
 // Merge priceMap (new values overwrite existing for same key)
 if (priceMap) {
 var keys = Object.keys(priceMap);
 for (var i = 0; i < keys.length; i++) {
 c.priceMap[keys[i]] = priceMap[keys[i]];
 }
 }
 // Merge priceTsMap
 if (priceTsMap) {
 var keys2 = Object.keys(priceTsMap);
 for (var j = 0; j < keys2.length; j++) {
 c.priceTsMap[keys2[j]] = priceTsMap[keys2[j]];
 }
 }
 // Prune if too many entries (keep freshest by priceTsMap)
 var maxEntries = GLOBAL_CACHE_CONFIG.MAX_PRICE_ENTRIES || 5000;
 var pmKeys = Object.keys(c.priceMap);
 if (pmKeys.length > maxEntries) {
 pmKeys.sort(function(a, b) { return (c.priceTsMap[a] || 0) - (c.priceTsMap[b] || 0); });
 var toRemove = pmKeys.length - maxEntries;
 for (var r = 0; r < toRemove; r++) {
 delete c.priceMap[pmKeys[r]];
 delete c.priceTsMap[pmKeys[r]];
 }
 }
 c.updatedAt = Date.now();
 this._cache = c;
 this._save();
 } catch (e) {}
 };

 GPC.clear = function() {
 this._cache = { v: GLOBAL_CACHE_CONFIG.CURRENT_CACHE_VERSION, entries: {}, updatedAt: 0, priceMap: {}, priceTsMap: {} };
 CacheManager.delete(this._key);
 };
})();

// ============================================================
// GLOBAL FX CACHE
// ============================================================

var GlobalFxCache = GlobalFxCache || {};

(function() {
 var GFC = GlobalFxCache;
 GFC._cache = GFC._cache || null;
 GFC._key = GLOBAL_CACHE_KEYS.GLOBAL_FX;

 GFC.load = function(timer) {
 if (this._cache) return this._cache;
 try {
 CacheManager.init();
 this._cache = CacheManager.safeGetJson(this._key, timer) || { rates: {} };
 if (!this._cache.rates) this._cache.rates = {};
 return this._cache;
 } catch (e) {
 this._cache = { rates: {} };
 return this._cache;
 }
 };

 GFC.get = function(pair, timer) {
 var cache = this.load(timer);
 // Support both old format (cache[pair]) and new format (cache.rates[pair])
 var entry = cache.rates ? cache.rates[pair] : cache[pair];
 if (!entry) {
 entry = cache[pair]; // fallback to old format
 }
 if (!entry) return null;

 var age = Date.now() - (entry.ts || 0);
 if (age > GLOBAL_CACHE_CONFIG.FX_TTL_MS) return null;

 return entry.rate;
 };

 GFC.set = function(pair, rate, timer) {
 var cache = this.load(timer);
 if (!isFinite(rate) || rate <= 0) return;

 if (!cache.rates) cache.rates = {};
 cache.rates[pair] = { rate: rate, ts: Date.now() };
 // Also set in old format for backward compat
 cache[pair] = { rate: rate, ts: Date.now() };
 };

 GFC.save = function(timer) {
 if (!this._cache) return;
 try {
 this._cache.updatedAt = Date.now();
 CacheManager.safeSetJson(this._key, this._cache, null, 86400, timer);
 } catch (e) {}
 };

 GFC.getUsdToEur = function(timer) {
 return this.get("USD_EUR", timer);
 };

 GFC.setUsdToEur = function(rate, timer) {
 this.set("USD_EUR", rate, timer);
 };

 GFC.clear = function() {
 this._cache = { rates: {}, updatedAt: 0 };
 CacheManager.delete(this._key);
 };
})();

// ============================================================
// CACHE VERSION REGISTRY
// ============================================================

var CacheVersionRegistry = CacheVersionRegistry || {
 _key: GLOBAL_CACHE_KEYS.CACHE_VERSIONS,

 get: function(chainName) {
 CacheManager.init();
 var raw = CacheManager.safeGet(this._key);
 if (!raw) return null;
 try {
 var reg = JSON.parse(raw);
 return reg[chainName] || null;
 } catch (e) {
 return null;
 }
 },

 set: function(chainName, version) {
 CacheManager.init();
 var raw = CacheManager.safeGet(this._key);
 var reg = {};
 try {
 if (raw) reg = JSON.parse(raw);
 } catch (e) {}
 reg[chainName] = version;
 CacheManager.safeSet(this._key, JSON.stringify(reg));
 },

 getAll: function() {
 CacheManager.init();
 var raw = CacheManager.safeGet(this._key);
 if (!raw) return {};
 try {
 return JSON.parse(raw);
 } catch (e) {
 return {};
 }
 }
};

// ============================================================
// FX RATE API (public) - used by OutputBuilder/CosmosEngine
// v4.15.50 - CASCADE: 4 sources with median consensus, no fixed fallback
// ============================================================

var FxRate = FxRate || {};

FxRate._cached = FxRate._cached || null;
FxRate._cachedTs = FxRate._cachedTs || 0;
FxRate._cachedSources = FxRate._cachedSources || [];
FxRate._cachedVersion = FxRate._cachedVersion || null;
FxRate._CURRENT_VERSION = "4.15.50"; // bump to force cache invalidation on deploy
FxRate._TTL_MS = 3600000; // 1h
FxRate._MIN_SOURCES = 1;
FxRate._DISAGREE_THRESHOLD = 0.05; // 5% max delta for 2-source mean

/**
 * FX sources — must match @wcore/shared/cache-key-registry web side
 * All return EUR per 1 USD (the natural unit used by priceEur = priceUsd * fxRate).
 * Frankfurter and DefiLlama EURC return USD per 1 EUR natively — inverted here.
 */
FxRate._SOURCES = [
 {
 name: "frankfurter",
 url: "https://api.frankfurter.app/latest?from=EUR&to=USD",
 parse: function(data) {
 var usdPerEur = data && data.rates && data.rates.USD;
 if (!isFinite(usdPerEur) || usdPerEur <= 0) return null;
 return 1 / usdPerEur;
 }
 },
 {
 name: "open-er-api",
 url: "https://open.er-api.com/v6/latest/USD",
 parse: function(data) {
 var eur = data && data.rates && data.rates.EUR;
 if (!isFinite(eur) || eur <= 0) return null;
 return eur;
 }
 },
 {
 name: "coinbase",
 url: "https://api.coinbase.com/v2/exchange-rates?currency=USD",
 parse: function(data) {
 var eur = data && data.data && data.data.rates && data.data.rates.EUR;
 if (eur == null) return null;
 var n = parseFloat(eur);
 if (!isFinite(n) || n <= 0) return null;
 return n;
 }
 },
 {
 name: "defillama-eurc",
 url: "https://coins.llama.fi/prices/current/coingecko:euro-coin",
 parse: function(data) {
 var entry = data && data.coins && data.coins["coingecko:euro-coin"];
 var usdPerEur = entry && entry.price;
 if (!isFinite(usdPerEur) || usdPerEur <= 0) return null;
 return 1 / usdPerEur;
 }
 }
];

/**
 * Median of an array of numbers (does not mutate input).
 */
FxRate._median = function(arr) {
 if (!arr || !arr.length) return null;
 var sorted = arr.slice().sort(function(a, b) { return a - b; });
 var mid = Math.floor(sorted.length / 2);
 return sorted.length % 2 === 0
 ? (sorted[mid - 1] + sorted[mid]) / 2
 : sorted[mid];
};

/**
 * Fetch all sources in parallel. Returns array of {source, rate} for successes.
 * Each source has its own try/catch — one failure does not affect the others.
 */
FxRate._fetchAllSources = function(timer) {
 var results = [];
 var sources = FxRate._SOURCES;
 for (var i = 0; i < sources.length; i++) {
 try {
 var resp = UrlFetchApp.fetch(sources[i].url, {
 muteHttpExceptions: true,
 headers: { "Accept": "application/json" }
 });
 if (resp.getResponseCode() === 200) {
 var data = JSON.parse(resp.getContentText());
 var rate = sources[i].parse(data);
 if (rate != null && isFinite(rate) && rate > 0) {
 results.push({ source: sources[i].name, rate: rate });
 }
 }
 } catch (eSrc) {
 // skip this source — others continue
 }
 }
 return results;
};

/**
 * Consensus: median if ≥3, mean of 2 if within threshold, single if 1, throw if 0.
 */
FxRate._consensus = function(results) {
 if (!results || results.length < FxRate._MIN_SOURCES) {
 throw new Error("FX cascade: only " + (results ? results.length : 0) +
 " source(s) succeeded, need " + FxRate._MIN_SOURCES);
 }
 if (results.length === 1) return results[0].rate;
 if (results.length === 2) {
 var delta = Math.abs(results[0].rate - results[1].rate) / Math.max(results[0].rate, results[1].rate);
 if (delta > FxRate._DISAGREE_THRESHOLD) {
 throw new Error("FX cascade: 2 sources disagree by " + (delta * 100).toFixed(2) +
 "% (" + results[0].source + "=" + results[0].rate + ", " +
 results[1].source + "=" + results[1].rate + ")");
 }
 return (results[0].rate + results[1].rate) / 2;
 }
 return FxRate._median(results.map(function(r) { return r.rate; }));
};

/**
 * Get EUR per 1 USD rate (cached) — cascade with consensus, no fixed fallback.
 * @param {Object} timer - Optional timer object
 * @param {boolean} forceRefresh - Force fetch
 */
FxRate.getUsdToEur = FxRate.getUsdToEur || function(timer, forceRefresh) {
 var L1_KEY = "FX:USD_EUR";
 var now = Date.now();

 // 0) Memory cache — invalidated when code version changes
 if (!forceRefresh && FxRate._cached && FxRate._cachedVersion === FxRate._CURRENT_VERSION && (now - FxRate._cachedTs) < FxRate._TTL_MS) {
 try { FxRate._postTelemetry_(FxRate._cached, (FxRate._cachedSources || []).map(function(s) { return { source: s }; })); } catch (eTel) { /* ignore */ }
 return FxRate._cached;
 }

 // 1) L1 CacheService — also tagged with version for cross-deploy invalidation
 try {
 if (!forceRefresh) {
 var v1 = CacheManager.l1Get(L1_KEY);
 if (v1) {
 var parts = String(v1).split("|");
 var v1Rate = parseFloat(parts[0]);
 var v1Ver = parts[1] || "";
 if (isFinite(v1Rate) && v1Rate > 0 && v1Ver === FxRate._CURRENT_VERSION) {
 FxRate._cached = v1Rate;
 FxRate._cachedTs = now;
 FxRate._cachedVersion = FxRate._CURRENT_VERSION;
 try { FxRate._postTelemetry_(v1Rate, []); } catch (eTel) { /* ignore */ }
 return v1Rate;
 }
 }
 }
 } catch (e0) {}

 // 2) GlobalFxCache (ScriptProperties)
 try {
 var cached = GlobalFxCache.get("USD_EUR");
 if (!forceRefresh && cached && isFinite(cached) && cached > 0) {
 try { CacheManager.l1Set(L1_KEY, String(cached) + "|" + FxRate._CURRENT_VERSION, CACHE_L1_TTL_FX_SEC); } catch (e1) {}
 FxRate._cached = cached;
 FxRate._cachedTs = now;
 FxRate._cachedVersion = FxRate._CURRENT_VERSION;
 try { FxRate._postTelemetry_(cached, []); } catch (eTel) { /* ignore */ }
 return cached;
 }
 } catch (e2) {}

 // 3) Fetch live cascade (all 4 sources in parallel)
 try {
 var results = FxRate._fetchAllSources(timer);
 var rate = FxRate._consensus(results);
 if (isFinite(rate) && rate > 0) {
 // Save to all caches (with version stamp for cross-deploy invalidation)
 GlobalFxCache.set("USD_EUR", rate);
 try { CacheManager.l1Set(L1_KEY, String(rate) + "|" + FxRate._CURRENT_VERSION, CACHE_L1_TTL_FX_SEC); } catch (e3) {}
 FxRate._cached = rate;
 FxRate._cachedTs = now;
 FxRate._cachedVersion = FxRate._CURRENT_VERSION;
 FxRate._cachedSources = results.map(function(r) { return r.source; });

 // Cross-runtime telemetry: post the gsheet rate to web so /api/diag/fx-parity
 // can detect drift between the two runtimes. Fire-and-forget — never let
 // telemetry failure affect the FX rate returned to callers. Uses the
 // WCORE_WEB_API_URL + GSHEET_API_TOKEN set by onOpen (see _SETUP_WCORE.gs).
 try { FxRate._postTelemetry_(rate, results); } catch (eTel) { /* ignore */ }

 return rate;
 }
 throw new Error("FX cascade: consensus returned invalid rate");
 } catch (e4) {
 // No fixed fallback — propagate error to caller
 try { Logger.log("[FxRate] " + (e4 && e4.message ? e4.message : String(e4))); } catch (eLog) {}
 throw e4;
 }
};

/**
 * Post gsheet's current FX rate to the web telemetry endpoint for drift
 * detection. Fire-and-forget. Requires WCORE_WEB_API_URL + GSHEET_API_TOKEN
 * in ScriptProperties (set automatically by onOpen in _SETUP_WCORE.gs).
 */
FxRate._postTelemetry_ = function(rate, results) {
 try {
 var props = PropertiesService.getScriptProperties();
 var url = props.getProperty("WCORE_WEB_API_URL");
 var token = props.getProperty("GSHEET_API_TOKEN");
 if (!url || !token) return; // not configured → skip silently
 var payload = JSON.stringify({
 rate: rate,
 ts: Date.now(),
 sources: (results || []).map(function(r) { return r.source; }),
 runtime: "gsheet"
 });
 UrlFetchApp.fetch(url.replace(/\/$/, "") + "/api/gsheet/fx-telemetry", {
 method: "post",
 contentType: "application/json",
 payload: payload,
 headers: { "x-gsheet-token": token },
 muteHttpExceptions: true
 });
 } catch (e) {
 // Never let telemetry errors break the FX call
 try { Logger.log("[FxRate] telemetry post failed: " + (e && e.message ? e.message : String(e))); } catch (_) {}
 }
};

/**
 * Convert USD to EUR
 */
FxRate.convert = FxRate.convert || function(usd, timer) {
 if (typeof usd !== "number" || !isFinite(usd)) return 0;
 var rate = FxRate.getUsdToEur(timer);
 return usd * rate;
};

/**
 * Diagnostic — returns which sources were used for the last successful rate.
 */
FxRate.lastSources = function() {
 return (FxRate._cachedSources || []).slice();
};

// ============================================================
// WALLET CACHE (full implementation for EvmEngine/SvmEngine/CosmosEngine)
// ============================================================

/**
 * WalletCache - persiste le cache d'un wallet (assets + maps)
 * Interface attendue par engines:
 * - load(address, timer, config)
 * - save(address, cacheObj, config)
 * - getLastUpdateStr(cacheObj)
 * - getLastRunUpdateStr(cacheObj)
 * - get(key, config)
 * - set(key, data, config)
 * - delete(key, config)
 * - exists(key, config)
 */
WalletCache = (function(existing) {
 var WC = existing || {};

 // Ensure CacheManager.walletKey matches EvmEngine expectations
 CacheManager.walletKey = function(walletAddr, config) {
 var prefix = (config && config.KEYS && config.KEYS.PREFIX) ? String(config.KEYS.PREFIX) : "";
 return prefix + "WALLET_" + String(walletAddr || "").toLowerCase();
 };

 function _empty(config) {
 return {
 v: 5,
 cv: null, // cache version (logical), distinct from v (storage format)
 u: 0,
 a: [],
 pm: {},
 fx: null,
 rc: 0,
 bt: {},
 at: {},
 pg: {},
 pt: {},
 im: null,
 fs: 0,
 fp: 0
 };
 }

 /**
 * Expand compact asset to full format
 */
 function _expandAsset(ca) {
 if (!ca) return null;

 // v5 array format: [contractShort, balance, symbol, name, decimals]
 if (Array.isArray(ca)) {
 var c = ca[0] || "";
 if (c === "n") c = "native";
 return {
 contract: c,
 symbol: ca[2] || "",
 name: ca[3] || "",
 balance: ca[1] || 0,
 decimals: (ca[4] != null ? ca[4] : 18),
 price_eur: null,
 value_eur: null
 };
 }

 var contract = ca.contract || ca.c || "";
 if (contract === "n") contract = "native";

 return {
 contract: contract,
 symbol: ca.symbol || ca.s || "",
 name: ca.name || ca.n || "",
 balance: ca.balance || ca.b || 0,
 decimals: ca.decimals || ca.d || 18,
 price_eur: null,
 value_eur: null
 };
 }
 
 /**
 * Compact asset to minimal format
 * v4.9.2 FIX: Always preserve native token even with balance = 0
 */
 function _compactAsset(a) {
 if (!a) return null;

 var contract = a.contract || a.c || "";
 var isNative = (contract === "native" || contract === "n");
 
 var balanceRaw = (a.balance != null) ? a.balance : a.b;
 var balance = parseFloat(String(balanceRaw || 0).replace(",", "."));
 if (!isFinite(balance)) balance = 0;
 
  // v4.9.2 FIX: Always keep native, even with balance = 0
  // For other tokens, skip only exact zero; negative balances are debt positions.
  if (balance === 0 && !isNative) return null;

 var contractShort = isNative ? "n" : contract;

 var symbol = a.symbol || a.s || a.token_ticker || "";
 var name = a.name || a.n || a.token_name || "";
 if (typeof name !== "string") name = String(name || "");
 if (typeof symbol !== "string") symbol = String(symbol || "");

 var decimals = (a.decimals != null) ? a.decimals : a.d;
 if (decimals == null || !isFinite(decimals)) decimals = 18;
 decimals = decimals | 0;

 return [contractShort, balance, symbol, name, decimals];
 }
 
 function _pruneTsMap(mapObj, maxKeys) {
 try {
 if (!mapObj || typeof mapObj !== "object") return {};
 maxKeys = (maxKeys && maxKeys > 0) ? (maxKeys | 0) : 800;
 var keys = Object.keys(mapObj);
 if (keys.length <= maxKeys) return mapObj;

 var arr = [];
 for (var i = 0; i < keys.length; i++) {
 var k = keys[i];
 var v = mapObj[k];
 var ts = (typeof v === "number") ? v : parseInt(v, 10);
 if (!isFinite(ts)) ts = 0;
 arr.push([k, ts]);
 }
 arr.sort(function(a, b) { return (b[1] || 0) - (a[1] || 0); });

 var out = {};
 for (var j = 0; j < arr.length && j < maxKeys; j++) {
 out[arr[j][0]] = arr[j][1];
 }
 return out;
 } catch (e) {
 return mapObj || {};
 }
 }

 /**
 * Migrate from any format to compact format
 */
 function _migrate(obj, config) {
 if (!obj) return null;
 if (obj.v >= 4) return obj;
 
 var oldAssets = obj.assets || obj.a || [];
 var compactAssets = [];
 for (var i = 0; i < oldAssets.length; i++) {
 var ca = _compactAsset(oldAssets[i]);
 if (ca) compactAssets.push(ca);
 }
 
 var pmSrc = obj.pm || obj.priceMap || {};
 var ptSrc = obj.pt || obj.priceTsMap || {};
 var pmCompact = {};
 try {
 var maxN = 5000;
 var n = 0;
 for (var k in pmSrc) {
 if (n >= maxN) break;
 var num = parseFloat(pmSrc[k]);
 if ((isFinite(num) && num > 0) || (num === 0 && Object.prototype.hasOwnProperty.call(ptSrc, k))) {
 pmCompact[String(k)] = num;
 n++;
 }
 }
  } catch (ePm) {
  pmCompact = pmSrc || {};
  }

  return {
 v: 5,
 cv: obj.version || obj.cv || null, // preserve logical cache version
 u: obj.u || obj.updatedAt || 0,
 a: compactAssets,
 pm: pmCompact,
 fx: obj.fx || obj.usd_to_eur_rate || null,
 rc: obj.rc || obj.rrCursor || 0,
 bt: _pruneTsMap(obj.balanceTsMap || obj.bt || {}, 800),
 at: _pruneTsMap(obj.attemptTsMap || obj.at || {}, 800),
 pg: _pruneTsMap(obj.purgedTsMap || obj.pg || {}, 800),
 pt: _pruneTsMap(obj.priceTsMap || obj.pt || {}, 800),
 im: obj.im || obj.lastInfoMetaRows || null,
 fs: obj.last_full_scan_ms || obj.fs || 0,
 fp: obj.last_full_price_ms || obj.fp || 0,
 ss: obj.scanStats || obj.ss || null  // v4.13.0: rotation scan stats
 };
 }
 
 /**
 * Expand compact format to legacy format (backward compatibility)
 */
 function _expand(compact) {
 if (!compact) return null;
 
 var compactAssets = compact.a || compact.assets || [];
 var expandedAssets = [];
  var total = 0;
  var priceMap = compact.pm || compact.priceMap || {};

  function _priceForExpandedAsset_(asset) {
  try {
  if (!asset) return null;
  var c = String(asset.contract || asset.c || "");
  var key = (c === "n" || c === "native") ? "native" : c;
  var p = parseFloat(priceMap[key]);
  if ((!isFinite(p) || p <= 0) && key && typeof key === "string") p = parseFloat(priceMap[key.toLowerCase()]);
  return (isFinite(p) && p > 0) ? p : null;
  } catch (e) {
  return null;
  }
  }
 
 for (var i = 0; i < compactAssets.length; i++) {
 var ea = _expandAsset(compactAssets[i]);
  if (ea) {
  var restoredPrice = _priceForExpandedAsset_(ea);
  if (restoredPrice != null) {
  ea.price_eur = restoredPrice;
  var restoredValue = parseFloat(ea.balance) * restoredPrice;
  ea.value_eur = isFinite(restoredValue) ? restoredValue : null;
  }
  expandedAssets.push(ea);
  if (ea.value_eur || (ea.price_eur && ea.balance)) {
  var val = ea.value_eur || (ea.price_eur * ea.balance);
  if (typeof val === "number" && isFinite(val)) {
 total += val;
 }
 }
 }
 }
 
 var lastCacheUpdate = "";
 var updatedAt = compact.u || compact.updatedAt || 0;
 if (updatedAt > 0) {
 try {
 lastCacheUpdate = Format.datetime(updatedAt);
 } catch (e) {
 try {
 lastCacheUpdate = new Date(updatedAt).toISOString();
 } catch (e2) {
 lastCacheUpdate = String(updatedAt);
 }
 }
 }
 
 var reconstructedInfoMeta = (compact.im && compact.im.length) ? compact.im.slice(0) : null;
 var fx = compact.fx;

 if (!reconstructedInfoMeta) {
 reconstructedInfoMeta = [];
 reconstructedInfoMeta.push(["", "INFO_FX", fx ? ("USD->EUR=" + fx.toFixed(4)) : "USD->EUR=N/A", "", "", "", ""]);
 reconstructedInfoMeta.push(["", "INFO_TOTAL", "Total portefeuille (sum value_eur).", "", "", "", total]);
  reconstructedInfoMeta.push(["META", "last_cache_update", lastCacheUpdate, "", "", "", ""]);
  reconstructedInfoMeta.push(["META", "script_version", "", "", "", "", ""]);
  } else {
  var hasFx = false;
  var hasTotal = false;
  for (var im = 0; im < reconstructedInfoMeta.length; im++) {
  var row = reconstructedInfoMeta[im] || [];
  if (row[1] === "INFO_FX") {
  row[2] = fx ? ("USD->EUR=" + fx.toFixed(4)) : "USD->EUR=N/A";
  hasFx = true;
  }
  if (row[1] === "INFO_TOTAL") {
  row[2] = "Total portefeuille (sum value_eur).";
  row[6] = total;
  hasTotal = true;
  }
  }
  if (!hasFx) reconstructedInfoMeta.push(["", "INFO_FX", fx ? ("USD->EUR=" + fx.toFixed(4)) : "USD->EUR=N/A", "", "", "", ""]);
  if (!hasTotal) reconstructedInfoMeta.push(["", "INFO_TOTAL", "Total portefeuille (sum value_eur).", "", "", "", total]);
  }
 
 return {
 version: compact.cv || compact.v || 0, // prefer cv (logical cache version) over v (format)
 updatedAt: updatedAt,
 last_cache_update: lastCacheUpdate,
 assets: expandedAssets,
  priceMap: priceMap,
 priceTsMap: compact.pt || {},
 balanceTsMap: compact.bt || {},
 attemptTsMap: compact.at || {},
 purgedTsMap: compact.pg || {},
 usd_to_eur_rate: fx,
 rrCursor: compact.rc || 0,
 lastInfoMetaRows: reconstructedInfoMeta,
 last_full_scan_ms: compact.fs || 0,
 last_full_price_ms: compact.fp || 0,
 scanStats: compact.ss || null  // v4.13.0: rotation scan stats
 };
 }

 // ===== PUBLIC API =====

  WC.load = WC.load || function(walletAddr, timer, config) {
  try {
  CacheManager.init();
  var key = CacheManager.walletKey(walletAddr, config);
  var obj = CacheManager.safeGetJson(key, timer);
  if (!obj || typeof obj !== "object") return null;
  return _expand(obj);
  } catch (e) {
  return null;
  }
  };

  function _assetCount(obj) {
  try {
  var assets = obj && (obj.assets || obj.a);
  return (assets && Array.isArray(assets)) ? assets.length : 0;
  } catch (e) {
  return 0;
  }
  }

  function _hasHttpErrorSignal(cacheObj) {
  try {
  if (cacheObj && (cacheObj._hadHttpErrors || cacheObj.hadHttpErrors)) return true;
  var ss = cacheObj && (cacheObj.scanStats || cacheObj.ss);
  if (ss && (ss.error || ss.hadHttpErrors || ss.httpErrors)) return true;
  var err = String((cacheObj && (cacheObj.last_error || cacheObj.lastError)) || "").toLowerCase();
  return err.indexOf("urlfetch") >= 0 ||
    err.indexOf("quota") >= 0 ||
    err.indexOf("timeout") >= 0 ||
    err.indexOf("network") >= 0 ||
    err.indexOf("429") >= 0 ||
    err.indexOf("rpc-fail") >= 0;
  } catch (e) {
  return false;
  }
  }

  function _zeroBalanceConfirmed(cacheObj) {
  try {
  var ss = cacheObj && (cacheObj.scanStats || cacheObj.ss);
  return !!(cacheObj && (cacheObj.zero_balance_confirmed || cacheObj._zeroBalanceConfirmed) ||
    ss && (ss.zero_balance_confirmed || ss.zeroBalanceConfirmed));
  } catch (e) {
  return false;
  }
  }

  function _budgetWriteBlocked() {
  try {
  if (typeof BudgetHTTP !== 'undefined' && BudgetHTTP.remaining && BudgetHTTP.remaining() < 100) return true;
  } catch (e) {}
  try {
  if (typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped()) return true;
  } catch (e2) {}
  try {
  if (typeof DegradedMode !== 'undefined' && DegradedMode.isCircuitBreakerActive && DegradedMode.isCircuitBreakerActive()) return true;
  } catch (e3) {}
  return false;
  }

   // v4.15.22 / v4.15.32 / v4.15.33: Token-level cache consensus — merge cached tokens
   // the new scan missed. Per-token granular preservation: a cached token with
   // balance > 0 that the new scan does not list at all is assumed to be a
   // consensus miss (flaky RPC) rather than a confirmed removal, and is kept
   // with _stale=true. A cached token explicitly rescanned with balance = 0 is
   // removed normally (newSet[oc] = covered by scan). The merge ALWAYS runs,
   // even in forceFull mode — only tokens the scan actually returned with
   // balance=0 are removed; tokens that simply failed RPC consensus are
   // preserved regardless of force flag.
   // v4.15.33 FIX: forceFull skip removed. Was causing ZERO Network WBTC to
   // disappear when activityForced triggered an auto-forced scan that lost
   // the WBTC token via consensus failure (3 fragile RPCs, 1 timeout, no
   // majority). The force flag set by activityForced propagated to
   // _forceFull=true on cacheObj, causing the merge to skip entirely, dropping
   // the stale WBTC token with no on-chain evidence of removal.
   //
   // v4.15.32 FIX: previous version pushed only into cacheObj.assets (expanded),
   // but engines submit cacheObj already in compact form (v >= 4 with cacheObj.a
   // populated), and _migrate() short-circuits when v >= 4 — so additions to
   // .assets were silently dropped. Now we push to BOTH .assets (if expanded
   // array exists) AND .a (if compact array exists). Also reads old assets in
   // either format. Concrete repro: ZERO Network WBTC kept ping-ponging despite
   // no on-chain activity — fix lets the merge actually persist the stale token.
    function _mergeAssetsPreservingCached(existingCache, cacheObj, config) {
    try {
    if (cacheObj) {
    var ss = cacheObj.scanStats || cacheObj.ss;
    if (ss && ss.source === "wcore-web" && ss.fullCycleComplete === true) {
    if (!cacheObj._webScanAuthoritative) {
    cacheObj._webScanAuthoritative = true;
    try {
    Logger.log("[WalletCache.save] SKIP_MERGE wcore-web fullCycleComplete — replacing asset list with " + (Array.isArray(cacheObj.assets) ? cacheObj.assets.length : Array.isArray(cacheObj.a) ? cacheObj.a.length : 0) + " assets");
    } catch (eLog) {}
    }
    return cacheObj;
    }
    }
    } catch (eAuth) {}
    if (!existingCache || !cacheObj) return cacheObj;

  var oldAssets = (existingCache.assets || existingCache.a || []);
  if (!oldAssets || !oldAssets.length) return cacheObj;

  // Both arrays may coexist; we update whichever is present. If only compact
  // `a` exists we must push compact entries; if only expanded `assets` exists
  // we must push objects. To be safe we update both whenever they exist.
  var newExpanded = Array.isArray(cacheObj.assets) ? cacheObj.assets : null;
  var newCompact = Array.isArray(cacheObj.a) ? cacheObj.a : null;

  // If neither exists yet, create the same shape as the existing cache so the
  // downstream _migrate() honours our additions.
  if (!newExpanded && !newCompact) {
  if (Array.isArray(existingCache.a) || (cacheObj.v != null && cacheObj.v >= 4)) {
  cacheObj.a = [];
  newCompact = cacheObj.a;
  } else {
  cacheObj.assets = [];
  newExpanded = cacheObj.assets;
  }
  }

  // Build lookup of contracts already present in new scan (any format).
  var newSet = {};
  function _registerContract(asset) {
  if (!asset) return;
  var c;
  if (Array.isArray(asset)) {
  c = String(asset[0] || "").toLowerCase();
  } else {
  c = String(asset.contract || asset.c || "").toLowerCase();
  }
  if (!c) return;
  if (c === "native" || c === "n") return;
  newSet[c] = true;
  }
  if (newExpanded) {
  for (var ix = 0; ix < newExpanded.length; ix++) _registerContract(newExpanded[ix]);
  }
  if (newCompact) {
  for (var ic = 0; ic < newCompact.length; ic++) _registerContract(newCompact[ic]);
  }

  var zeroSet = {};
  var zeroTs = cacheObj.balanceTsMap || cacheObj.bt || {};
  try {
  for (var zc in zeroTs) {
  if (!zeroTs.hasOwnProperty(zc)) continue;
  if (Number(zeroTs[zc]) === 0) zeroSet[String(zc || "").toLowerCase()] = true;
  }
  } catch (eZero) {}

  var strictTokenSet = null;
  try {
  if (config && config.FLAGS && config.FLAGS.STRICT_TOKEN_RANGE && cacheObj.strictTokenSet) {
  strictTokenSet = cacheObj.strictTokenSet;
  }
  } catch (eStrict) {}

  var preserved = 0;
  for (var j = 0; j < oldAssets.length; j++) {
  var oa = oldAssets[j];
  if (!oa) continue;

  // Read fields from either compact array or expanded object.
  var oc, oBalRaw, oSym, oName, oDec, oPriceEur;
  if (Array.isArray(oa)) {
  oc = String(oa[0] || "").toLowerCase();
  oBalRaw = oa[1];
  oSym = oa[2] || "";
  oName = oa[3] || "";
  oDec = (oa[4] != null) ? oa[4] : 18;
  oPriceEur = null;
  } else {
  oc = String(oa.contract || oa.c || "").toLowerCase();
  oBalRaw = (oa.balance != null) ? oa.balance : oa.b;
  oSym = oa.symbol || oa.s || "";
  oName = oa.name || oa.n || "";
  oDec = (oa.decimals != null) ? oa.decimals : (oa.d != null ? oa.d : 18);
  oPriceEur = (oa.price_eur != null && isFinite(oa.price_eur)) ? oa.price_eur : null;
  }

  if (!oc || oc === "native" || oc === "n") continue;
  if (newSet[oc]) continue;                                    // scan covered it, respect new value
  if (zeroSet[oc]) continue;                                   // scan confirmed zero, do not resurrect cache
  if (strictTokenSet && !strictTokenSet[oc]) continue;          // user removed it from I2:I whitelist

  var oBal = parseFloat(String(oBalRaw || 0).replace(",", "."));
  if (!isFinite(oBal) || oBal <= 0) continue;                  // only preserve strictly positive balances

  if (!isFinite(oDec)) oDec = 18;
  oDec = oDec | 0;

  // Resolve canonical contract string (don't lowercase it for storage â€”
  // preserve original casing if the cached entry had it). Default to
  // lowercased lookup key when only that is available.
  var contractStr = (Array.isArray(oa) ? oa[0] : (oa.contract || oa.c)) || oc;

  if (newExpanded) {
  newExpanded.push({
  contract: contractStr,
  symbol: String(oSym),
  name: String(oName),
  balance: oBal,
  decimals: oDec,
  price_eur: oPriceEur,
  value_eur: null,
  _stale: true,
  _staleReason: "consensus_miss"
  });
  }
  if (newCompact) {
  // Compact format: [contract, balance, symbol, name, decimals]
  newCompact.push([contractStr, oBal, String(oSym), String(oName), oDec]);
  }

  preserved++;
  }

  if (preserved > 0) {
  if (!cacheObj.scanStats) cacheObj.scanStats = {};
  var prev = cacheObj.scanStats.preservedFromCache;
  cacheObj.scanStats.preservedFromCache = (typeof prev === "number" ? prev : 0) + preserved;
  try {
  Logger.log("[WalletCache.save] CACHE_CONSENSUS_PRESERVED count=" + preserved);
  } catch (eLog) {}
  }

  return cacheObj;
  }

   function _shouldPreserveWalletCacheWrite(existingCache, cacheObj, config) {
  try {
  var webSs = cacheObj && (cacheObj.scanStats || cacheObj.ss);
  if (webSs && webSs.source === "wcore-web" && webSs.fullCycleComplete === true) {
  return { preserve: false, reason: "wcore_web_authoritative" };
  }
  } catch (eWebAuth) {}
  var force = !!(cacheObj && (cacheObj._forceFull || cacheObj.forceFull));
  if (!force && config && (config.FORCE_FULL || config._forceFull)) force = true;
  if (force) return { preserve: false };

  if (_budgetWriteBlocked()) {
  return { preserve: true, reason: "budget" };
  }

  var newCount = _assetCount(cacheObj);
 var prevCount = _assetCount(existingCache);
 var zeroOk = _zeroBalanceConfirmed(cacheObj);
 var hadHttpErrors = _hasHttpErrorSignal(cacheObj);
 var fullCycleComplete = true;
 try {
  var ss = cacheObj && (cacheObj.scanStats || cacheObj.ss);
  if (ss && ss.fullCycleComplete === false) fullCycleComplete = false;
 } catch (eFull) {}

 if (newCount === 0 && !zeroOk) {
 return { preserve: true, reason: "empty_unconfirmed", prevAssetsCount: prevCount, newAssetsCount: newCount };
 }

 if (newCount < prevCount && !fullCycleComplete && !zeroOk) {
 return { preserve: true, reason: "partial_less_assets", prevAssetsCount: prevCount, newAssetsCount: newCount };
 }

 if (newCount < prevCount && hadHttpErrors && !zeroOk) {
 return { preserve: true, reason: "http_error_less_assets", prevAssetsCount: prevCount, newAssetsCount: newCount };
 }

   return { preserve: false, prevAssetsCount: prevCount, newAssetsCount: newCount };
   }

   function _mergePositivePricesIntoPreservedCache(existingCache, cacheObj) {
   try {
   if (!existingCache || !cacheObj) return 0;
   var incomingPm = cacheObj.priceMap || cacheObj.pm || {};
   var incomingPt = cacheObj.priceTsMap || cacheObj.pt || {};
   if (!incomingPm || typeof incomingPm !== "object") return 0;

   var targetPm = existingCache.priceMap || existingCache.pm || {};
   var targetPt = existingCache.priceTsMap || existingCache.pt || {};
   var merged = 0;

   for (var k in incomingPm) {
   if (!Object.prototype.hasOwnProperty.call(incomingPm, k)) continue;
   var price = parseFloat(incomingPm[k]);
   if (!isFinite(price) || price <= 0) continue;
   var key = String(k);
   targetPm[key] = price;
   if (Object.prototype.hasOwnProperty.call(incomingPt, k)) {
   var ts = parseInt(incomingPt[k], 10);
   if (isFinite(ts) && ts > 0) targetPt[key] = ts;
   }
   merged++;
   }

   existingCache.priceMap = targetPm;
   existingCache.pm = targetPm;
   existingCache.priceTsMap = targetPt;
   existingCache.pt = targetPt;
   return merged;
   } catch (e) {
   return 0;
   }
   }

   WC.shouldPreserveWrite = WC.shouldPreserveWrite || function(existingCache, cacheObj, config) {
  return _shouldPreserveWalletCacheWrite(existingCache, cacheObj, config);
  };

  // v4.15.15: Last-line guard against empty/destructive wallet cache writes.
  WC.save = WC.save || function(walletAddr, cacheObj, config) {
  try {
  CacheManager.init();
  if (!walletAddr) return;
  var key = CacheManager.walletKey(walletAddr, config);
  var ttlSeconds = (config && config.CACHE && config.CACHE.WALLET_CACHE_TTL_SECONDS) || 86400;
  var existingCache = null;
  try { existingCache = WC.load(walletAddr, null, config); } catch (eLoad) {}
   var preserve = _shouldPreserveWalletCacheWrite(existingCache, cacheObj, config);
   if (preserve && preserve.preserve) {
   var mergedPrices = _mergePositivePricesIntoPreservedCache(existingCache, cacheObj);
   if (mergedPrices > 0) {
   try {
   CacheManager.safeSetJson(key, _migrate(existingCache, config) || _empty(config), config, ttlSeconds);
   } catch (eMergeSave) {}
   }
   try {
   Logger.log("[WalletCache.save] PRESERVED " + String(walletAddr).substring(0, 10) + "... reason=" + preserve.reason + (mergedPrices > 0 ? " mergedPrices=" + mergedPrices : ""));
   } catch (eLog) {}
   return { preserved: true, reason: preserve.reason, prevAssetsCount: preserve.prevAssetsCount || 0, newAssetsCount: preserve.newAssetsCount || 0, mergedPrices: mergedPrices };
   }
   // v4.15.33: Pre-check storage before save — if above 85%, purge expired/stale entries
   // to prevent silent ScriptProperties write failures that cause "No cache available"
   try {
     var _pct = typeof CacheManager !== 'undefined' && CacheManager._getStorageUsagePct ? CacheManager._getStorageUsagePct() : 0;
     if (_pct > 85 && typeof CacheManager !== 'undefined' && CacheManager._emergencyPurge_) {
       if (CacheManager._emergencyPurge_(65536)) {
         Logger.log("[WalletCache.save] Pre-save purge: storage " + _pct + "% -> " + (CacheManager._getStorageUsagePct ? CacheManager._getStorageUsagePct() : '?') + "%");
       }
     }
   } catch (ePre) {}

   // v4.15.22: per-token merge before persisting â€” keep cached tokens the new scan did not report.
  try { cacheObj = _mergeAssetsPreservingCached(existingCache, cacheObj, config); } catch (eMerge) {}
  var compact = _migrate(cacheObj, config);
  CacheManager.safeSetJson(key, compact || _empty(config), config, ttlSeconds);
  return { preserved: false };
  } catch (e) {}
  };

 WC.getLastUpdateStr = WC.getLastUpdateStr || function(cacheObj) {
 if (!cacheObj) return "";
 if (cacheObj.last_cache_update) return String(cacheObj.last_cache_update);
 if (cacheObj.lcu) return String(cacheObj.lcu);
 if (cacheObj.updatedAt) return Format.datetime(cacheObj.updatedAt);
 if (cacheObj.u) return Format.datetime(cacheObj.u);
 return "";
 };

 WC.getLastRunUpdateStr = WC.getLastRunUpdateStr || function(cacheObj) {
 if (!cacheObj) return "";

 try {
 var rows = cacheObj.lastInfoMetaRows || cacheObj.im || null;
 if (rows && rows.length) {
 for (var i = 0; i < rows.length; i++) {
 var r = rows[i];
 if (!r || r.length < 3) continue;
 if (String(r[0] || "") === "META" && String(r[1] || "") === "last_update") {
 var v = String(r[2] || "").trim();
 if (v) return v;
 }
 }
 }
 } catch (e) {}

 return WC.getLastUpdateStr(cacheObj);
 };

 // Simple key-based API (used by some modules)
 WC.get = WC.get || function(key, config) {
 CacheManager.init();
 var packed = CacheManager._packedGet_(key);
 if (packed) {
 try { return JSON.parse(packed); } catch (e) { return null; }
 }
 var raw = CacheManager.safeGet(key);
 if (!raw) return null;
 try { return JSON.parse(raw); } catch (e) { return null; }
 };

 WC.set = WC.set || function(key, data, config) {
 CacheManager.init();
 var s = JSON.stringify(data);
 if (CacheManager._isVirtualKey_ && CacheManager._isVirtualKey_(key)) {
 return CacheManager._packedPut_(key, s);
 }
 return CacheManager.safeSet(key, s);
 };

 WC.delete = WC.delete || function(key, config) {
 CacheManager.init();
 if (CacheManager._isVirtualKey_ && CacheManager._isVirtualKey_(key)) {
 CacheManager._packedDel_(key);
 }
 CacheManager.delete(key);
 };

 WC.exists = WC.exists || function(key, config) {
 return WC.get(key, config) !== null;
 };

 return WC;
})(WalletCache);

// ============================================================
// META CACHE - required by EvmEngine/SvmEngine/CosmosEngine
// ============================================================

/**
 * MetaCache - map contractKey -> { symbol, name, decimals, ... }
 * Interface:
 * - load(timer, config) -> metaMap (object)
 * - save(metaMap, knownKeysMap, config)
 * - get(chainId, contract) -> meta or null
 * - set(chainId, contract, meta)
 * - clear()
 */
MetaCache = (function(existing) {
 var MC = existing || {};
 MC._cache = MC._cache || null;
 MC._key = GLOBAL_CACHE_KEYS.GLOBAL_META;

 function _configKey(config) {
 return (config && config.KEYS && config.KEYS.META) ? String(config.KEYS.META) : "META_CACHE";
 }

 MC.load = MC.load || function(timer, config) {
 try {
 CacheManager.init();
 var key = _configKey(config);
 var obj = CacheManager.safeGetJson(key, timer);
 if (!obj || typeof obj !== "object") return {};
 return obj;
 } catch (e) {
 return {};
 }
 };

 MC.save = MC.save || function(metaMap, known, config) {
 try {
 CacheManager.init();
 var out = {};
 metaMap = metaMap || {};

 if (known && typeof known === "object") {
 Obj.forEach(metaMap, function(k, v) {
 if (known[k]) out[k] = v;
 });
 } else {
 out = metaMap;
 }

 var key = _configKey(config);
 var ttlSeconds = (config && config.CACHE && config.CACHE.META_CACHE_TTL_SECONDS) || 604800;
 CacheManager.safeSetJson(key, out, config, ttlSeconds);
 } catch (e) {}
 };

 // Simple chainId:contract API
 MC.get = MC.get || function(chainId, contract) {
 if (!MC._cache) {
 CacheManager.init();
 var raw = CacheManager.safeGet(MC._key);
 if (raw) {
 try { MC._cache = JSON.parse(raw); } catch (e) { MC._cache = { tokens: {} }; }
 } else {
 MC._cache = { tokens: {} };
 }
 if (!MC._cache.tokens) MC._cache.tokens = {};
 }
 var key = String(chainId || "") + ":" + String(contract || "").toLowerCase();
 return MC._cache.tokens[key] || null;
 };

 MC.set = MC.set || function(chainId, contract, meta) {
 if (!MC._cache) MC._cache = { tokens: {}, updatedAt: 0 };
 var key = String(chainId || "") + ":" + String(contract || "").toLowerCase();
 MC._cache.tokens[key] = {
 symbol: meta.symbol || "",
 name: meta.name || "",
 decimals: meta.decimals || 18,
 ts: Date.now()
 };
 MC._cache.updatedAt = Date.now();
 CacheManager.safeSet(MC._key, JSON.stringify(MC._cache));
 };

 MC.clear = MC.clear || function() {
 MC._cache = { tokens: {}, updatedAt: 0 };
 CacheManager.delete(MC._key);
 };

 return MC;
})(MetaCache);

// ============================================================
// GLOBAL PRICE CACHE ADAPTER (for EvmEngine)
// ============================================================

var GlobalPriceCacheAdapter = GlobalPriceCacheAdapter || {
 getPrice: function(chainId, contract) {
 return GlobalPriceCache.get(chainId, contract);
 },

 setPrice: function(chainId, contract, priceUsd, source) {
 GlobalPriceCache.set(chainId, contract, priceUsd, source);
 },

 getPrices: function(chainId, contracts) {
 return GlobalPriceCache.getMulti(chainId, contracts);
 }
};
