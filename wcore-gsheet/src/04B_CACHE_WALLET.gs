/************************************************************
 * 04B_CACHE_WALLET.gs - Packed Wallet Cache System
 * 
 * Version: v4.15.18
 *
 * v4.15.18 - Preserve logical cache version (cv) through packed deflate/inflate.
 *   Without this, packed web-scan writes were reloaded as format version 5,
 *   causing CacheVersion rows like "64 vs 5 (MISMATCH)".
 *
 * v4.15.17 - Preserve web scan stats and price timestamps through packed
 *   deflate/inflate so Rotation.status can report price_missing accurately.
 *
 * v4.15.16 - AGGRESSIVE ADMIN COMPACTION: if regular forced prune cannot
 *   reach the recovery target because all old entries contain balances, the
 *   admin compactor may evict the oldest packed entries. Normal saves still
 *   preserve balance entries during quota exhaustion.
 *
 * v4.15.15 - COMPACTION FORMULA COMPAT: LockService can be unavailable when
 *   invoked through a sheet cell during recovery. Continue best-effort without
 *   a lock because the operation is explicit/admin-only and writes one compacted
 *   GLOBAL_WALLET blob.
 *
 * v4.15.14 - ADMIN COMPACTION: add COMPACT_PACKED_WALLET_CACHE()
 *   ScriptProperties can exceed 500KB while quota is tripped because normal
 *   size prune intentionally skips during quota exhaustion. Admin compaction
 *   can force size prune to recover storage without deleting the whole packed
 *   wallet cache. Default packed target lowered to 455KB for durable headroom.
 *
 * v4.15.13 - FIX: packed read always retries ScriptProperties before null
 *   Post-redeploy CacheService misses must still re-read GLOBAL_WALLET from
 *   ScriptProperties. v4.15.10 accidentally gated that retry behind usedL1,
 *   which could return "No cache available" even though packed data existed.
 *
 * v4.15.12 - TTL prune preserves entries with balance data
 *   Aligned with v4.13.4 size-prune protection. Before: a wallet idle > 14d
 *   with balance > 0 (e.g. Tempo USD/USDC) was evicted by TTL prune and
 *   never rebuilt during BLOCKED_QUOTA. Now: isExpired() returns false when
 *   at least one asset has balance > 0, regardless of age.
 *
 * v4.15.11 - FIX: Packed saves merge with ScriptProperties before writing.
 *   A stale writer can no longer replace GLOBAL_WALLET with a partial snapshot
 *   that drops other wallet-chain entries.
 *
 * v4.15.10 - FIX: Packed reads fall back to ScriptProperties on stale L1 miss
 *   CacheService can hold an older GLOBAL_WALLET blob that misses a wallet
 *   still present in ScriptProperties. Reads now refresh L1 from props instead
 *   of returning "No cache available".
 *
 * v4.15.9 - FIX: Packed writes fail closed when ScriptLock is unavailable
 *   If tryLock() fails, do not perform an unlocked load-modify-save that can
 *   overwrite the global packed wallet cache with a stale partial snapshot.
 *
 * v4.15.8 - PRICING_WORKER: preserve explicit no-market zero prices
 *   Keep priceMap entries equal to 0 only when priceTsMap has a timestamp,
 *   so no-market rows render as 0 after cache compaction while pending zero
 *   targets are still discarded.
 *
 * v4.15.7 - FIX: Skip size prune when quota exhausted
 *   Overnight quota exhaustion caused size prune to evict old cache entries
 *   that could not be rebuilt (no quota to rescan) → permanent "No cache available"
 *   Fix: check QuotaCircuitBreaker.isTripped() before size prune, skip if tripped
 *
 * v4.15.6 - FIX: "No cache available" caused by race conditions
 *   TWO bugs causing permanent cache loss for some wallets:
 *
 *   Bug 1 - Destructive reads: _packedGet_ was calling _packedDel_ and
 *   _savePackedWalletCache_ during READ operations (getCachedWalletAssets).
 *   These writes raced with concurrent _packedPut_ writes from WATCHDOG
 *   workers, overwriting their updates with stale data.
 *   FIX: Reads no longer trigger writes. TTL cleanup deferred to prune
 *   during the next _packedPut_ cycle. Timestamp refresh removed (natural
 *   refresh happens on _packedPut_).
 *
 *   Bug 2 - Concurrent writes: 20 WATCHDOG workers doing load-modify-save
 *   on the same GLOBAL_WALLET blob without locking. Last writer wins,
 *   overwriting all other workers' updates with stale data.
 *   FIX: LockService.getScriptLock() in _packedPut_ and _packedDel_
 *   makes read-modify-write atomic (3s timeout, graceful degradation).
 *
 *   Combined effect: lost updates -> stale timestamps -> prune eviction ->
 *   fallbackToCache saves empty cache (no assets) -> prune evicts again ->
 *   permanent "No cache available" loop. Both fixes needed to break the cycle.
 *
 * v4.13.5 - METADATA PRESERVATION IN PACKED CACHE
 *   CRITICAL FIX: _deflateWalletPayload_ was stripping metadata!
 *   Previous: assets compacted to [contract, balance] only
 *   Now: assets compacted to [contract, balance, symbol, name, decimals]
 *   This matches the v5 format used by WalletCache._compactAsset()
 *   
 *   Impact: Metadata (ticker/name) no longer lost when data passes
 *   through the packed cache path (_packedPut_ -> deflate -> inflate).
 *   Previously, every cache read via packed path returned symbol:"",
 *   name:"" which triggered unnecessary HTTP metadata lookups on 
 *   every single refresh cycle. This fix eliminates those wasted calls.
 *
 *   Also: _inflateWalletPayload_ now reads symbol/name/decimals from
 *   the compact array format, restoring them properly.
 *
 * v4.13.4 - CRITICAL FIX: Prune no longer evicts entries with balance data
 *   Previous: prune sorted by timestamp only, entries blocked by quota
 *   (old timestamps) were evicted â†’ permanent "No cache available"
 *   Fix: 3-tier protection in size prune:
 *     Tier 1: entries with balance > 0 â†’ NEVER evict
 *     Tier 2: entries < 1h old â†’ protected
 *     Tier 3: rest â†’ evictable by age (oldest first)
 * v4.8.2 - Increased packed cache limit from 485KB to 495KB
 *          Wallets with 50+ assets need more space
 *          Keeping only 5KB margin before 500KB hard limit
 * (Changelog v4.8.1..v4.8.1: 1 entries removed for brevity)
 * Systeme de virtualisation des caches wallet.
 * Contient:
 * - Storage virtualization layer
 * - Packed wallet cache compaction
 * - Deflate/Inflate wallet payloads
 * - Prune & TTL management
 * - Legacy migration
 * 
 * DEPENDANCES: 04A_CACHE_CORE.gs
 ************************************************************/
var CACHE_WALLET_VERSION = "4.15.18";

// ============================================================
// STORAGE VIRTUALIZATION LAYER
// ============================================================

CacheManager._VIRTUALIZE_CHAIN_CACHES = true;
CacheManager._WALLET_TTL_SEC = 10 * 24 * 3600; // 10 days (reduced from 14 to ease packed cache pressure)

CacheManager._isVirtualKey_ = function(key) {
 if (!key) return false;
 if (key === GLOBAL_CACHE_KEYS.GLOBAL_PRICES) return false;
 if (key === GLOBAL_CACHE_KEYS.GLOBAL_FX) return false;
 if (key === GLOBAL_CACHE_KEYS.GLOBAL_META) return false;
 if (key === GLOBAL_CACHE_KEYS.CACHE_VERSIONS) return false;
 if (key === GLOBAL_CACHE_KEYS.LAST_CLEANUP) return false;
 if (key === GLOBAL_CACHE_KEYS.GLOBAL_WALLET) return false;
 if (String(key).indexOf("RPC_HEALTH") === 0) return false;
 if (String(key).indexOf("META") === 0) return false;
 if (String(key).indexOf("BUDGET") === 0) return false;

 var k = String(key);
 return (/^GLOBAL_WALLET_CACHE_/i.test(k) || /_CACHE_WALLET_/i.test(k) || /WALLET_CACHE_/i.test(k));
};

// ============================================================
// HASH & HELPERS
// ============================================================

CacheManager._hashKey_ = function(key) {
 key = String(key || "");
 var h = 0x811c9dc5;
 for (var i = 0; i < key.length; i++) {
 h ^= key.charCodeAt(i);
 h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
 }
 return h.toString(36);
};

CacheManager._looksJson_ = function(s) {
 if (!s || typeof s !== "string") return false;
 var c = s.charAt(0);
 return (c === "{" || c === "[");
};

CacheManager._toEpochSec_ = function(x) {
 if (x === null || x === undefined) return null;
 if (typeof x === "number") return Math.floor(x > 1e12 ? (x / 1000) : x);
 if (typeof x !== "string") return null;
 var s = String(x);
 var d = new Date(s);
 if (!isNaN(d.getTime())) return Math.floor(d.getTime() / 1000);
 try {
 var iso = s.replace(" ", "T") + "Z";
 var d2 = new Date(iso);
 if (!isNaN(d2.getTime())) return Math.floor(d2.getTime() / 1000);
 } catch (e) {}
 return null;
};

CacheManager._fromEpochSec_ = function(sec) {
 if (sec === null || sec === undefined) return "";
 if (typeof sec !== "number") return "";
 try {
 var d = new Date(sec * 1000);
 var yyyy = d.getUTCFullYear();
 var mm = ("0" + (d.getUTCMonth() + 1)).slice(-2);
 var dd = ("0" + d.getUTCDate()).slice(-2);
 var hh = ("0" + d.getUTCHours()).slice(-2);
 var mi = ("0" + d.getUTCMinutes()).slice(-2);
 var ss = ("0" + d.getUTCSeconds()).slice(-2);
 return yyyy + "-" + mm + "-" + dd + " " + hh + ":" + mi + ":" + ss;
 } catch (e) {
 return "";
 }
};

CacheManager._jsonSizeBytes_ = function(obj) {
 try { return JSON.stringify(obj).length; } catch (e) { return 0; }
};

// ============================================================
// DEFLATE / INFLATE WALLET PAYLOADS (v4.8.0 â†’ v4.13.5)
// ============================================================

/**
 * Deflate wallet-cache payloads to compact format.
 * v4.13.5: PRESERVE METADATA (symbol, name, decimals) in compact rows!
 *   Old format: [contract, balance]           â†’ metadata LOST
 *   New format: [contract, balance, sym, name, dec] â†’ metadata PRESERVED
 *   Empty strings for sym/name are stored as "" (minimal overhead).
 *   Decimals stored only if != 18 (default) to save space.
 * v4.8.0: Conserve priceMap (pm) avec limite 100 entrees
 */
CacheManager._deflateWalletPayload_ = function(obj) {
 try {
 if (!obj || typeof obj !== "object") return obj;
 if (obj.Cache && typeof obj.Cache === "object" && !obj.assets) obj = obj.Cache;

 var assets = (obj && obj.assets) ? obj.assets : null;
 if (!assets || !Array.isArray(assets)) return obj;

  var out = {};
  if (obj.version !== undefined && obj.version !== null) out.cv = obj.version;
  else if (obj.cv !== undefined && obj.cv !== null) out.cv = obj.cv;

 // v4.13.5: Assets -> compact [contract, balance, symbol, name, decimals?]
 // Matches the v5 format from WalletCache._compactAsset()
 var rows = [];
 for (var i = 0; i < assets.length; i++) {
 var a = assets[i];
 if (!a) continue;
 var c = a.contract || a.c || "";
 if (!c) continue;
 c = String(c);
 var bal = (a.balance === null || a.balance === undefined) ? "" : String(a.balance);
 
 // v4.13.5: Preserve metadata fields
 var sym = a.symbol || a.s || a.token_ticker || "";
 var name = a.name || a.n || a.token_name || "";
 if (typeof sym !== "string") sym = String(sym || "");
 if (typeof name !== "string") name = String(name || "");
 
 var dec = (a.decimals != null) ? a.decimals : (a.d != null ? a.d : null);
 
 // Build compact row: [contract, balance, symbol, name]
 // Add decimals only if != 18 (default) to save space
 if (dec != null && isFinite(dec) && (dec | 0) !== 18) {
   rows.push([c, bal, sym, name, dec | 0]);
 } else {
   rows.push([c, bal, sym, name]);
 }
 }
 out.a = rows;

 if (obj.rrCursor !== undefined) out.r = obj.rrCursor;
 if (obj.usd_to_eur !== undefined) out.fx = obj.usd_to_eur;

 var u = CacheManager._toEpochSec_(obj.updatedAt || obj.updated_at || obj.CacheUpdatedAt);
 if (u !== null) out.u = u;

 var lfs = CacheManager._toEpochSec_(obj.last_full_scan);
 if (lfs !== null) out.s = lfs;

 var lfp = CacheManager._toEpochSec_(obj.last_full_price);
 if (lfp !== null) out.p = lfp;

 if (obj.balanceTsMap && typeof obj.balanceTsMap === "object") out.bt = obj.balanceTsMap;

 if (obj.lastInfoMetaRows && Array.isArray(obj.lastInfoMetaRows)) {
 out.im = obj.lastInfoMetaRows.slice(0, 40);
 }

 // v4.8.0: Conserver priceMap (pm) - limite 100 entrees
 // v4.15.8: Preserve explicit no-market zeros only when priceTsMap confirms
 // they were produced by the pricing pipeline, not just queued as pending.
 if (obj.priceMap && typeof obj.priceMap === "object") {
 var pmKeys = Object.keys(obj.priceMap);
 if (pmKeys.length > 0) {
 var pm = {};
 var pmCount = 0;
 var ptSrc = (obj.priceTsMap && typeof obj.priceTsMap === "object") ? obj.priceTsMap : {};
 for (var j = 0; j < pmKeys.length && pmCount < 100; j++) {
 var pk = pmKeys[j];
 var pv = obj.priceMap[pk];
 var pn = (typeof pv === "number") ? pv : parseFloat(pv);
 if ((pn > 0 && isFinite(pn)) || (pn === 0 && Object.prototype.hasOwnProperty.call(ptSrc, pk))) {
 pm[pk] = pn;
 pmCount++;
 }
 }
 if (pmCount > 0) out.pm = pm;
 }
 }
 if (obj.priceTsMap && typeof obj.priceTsMap === "object") out.pt = obj.priceTsMap;
 if (obj.scanStats && typeof obj.scanStats === "object") out.ss = obj.scanStats;

 return out;
 } catch (e) {
 return obj;
 }
};

/**
 * Inflate compact wallet payload back to legacy shape
 * v4.13.5: Read symbol/name/decimals from compact rows
 *   Supports both old format [contract, balance] and 
 *   new format [contract, balance, symbol, name, decimals?]
 */
CacheManager._inflateWalletPayload_ = function(compact) {
 try {
 if (!compact || typeof compact !== "object") return compact;
 if (compact.assets && Array.isArray(compact.assets)) return compact;
 if (compact.a === undefined && compact.r === undefined && compact.fx === undefined && compact.u === undefined) return compact;

  var out = {};
  if (compact.cv !== undefined && compact.cv !== null) out.version = compact.cv;
  else if (compact.version !== undefined && compact.version !== null) out.version = compact.version;
  var rows = compact.a || [];
 var assets = [];

 if (Array.isArray(rows)) {
 for (var i = 0; i < rows.length; i++) {
 var row = rows[i];
 if (!row) continue;
 if (Array.isArray(row)) {
 var c = row[0];
 if (!c) continue;
 var bal = row.length > 1 ? row[1] : "";
 // v4.13.5: Read metadata from compact row if present
 var sym = (row.length > 2 && row[2]) ? String(row[2]) : "";
 var nm  = (row.length > 3 && row[3]) ? String(row[3]) : "";
 var dec = (row.length > 4 && row[4] != null) ? (row[4] | 0) : 18;
 assets.push({
 contract: String(c),
 symbol: sym,
 name: nm,
 balance: bal,
 decimals: dec
 });
 } else if (row.contract) {
 assets.push(row);
 }
 }
 }

 out.assets = assets;
 if (compact.r !== undefined) out.rrCursor = compact.r;
 if (compact.fx !== undefined) out.usd_to_eur = compact.fx;
 if (compact.u !== undefined) out.updatedAt = CacheManager._fromEpochSec_(compact.u);
 if (compact.s !== undefined) out.last_full_scan = CacheManager._fromEpochSec_(compact.s);
 if (compact.p !== undefined) out.last_full_price = CacheManager._fromEpochSec_(compact.p);
 if (compact.bt) out.balanceTsMap = compact.bt;
 if (compact.im) out.lastInfoMetaRows = compact.im;
 if (compact.pm) out.priceMap = compact.pm;
 if (compact.pt) out.priceTsMap = compact.pt;
 if (compact.ss) out.scanStats = compact.ss;

 return out;
 } catch (e) {
 return compact;
 }
};

// ============================================================
// PRUNE PACKED WALLET CACHE (v4.8.0)
// ============================================================

/**
 * Prune packed wallet cache - protects entries without timestamp
 * v4.8.1: Use configurable limit instead of hardcoded 450KB
 */
CacheManager._prunePackedWalletCache_ = function(packed, maxBytes) {
 try {
 if (!packed || !packed.m) return packed;
 maxBytes = maxBytes || CacheManager._PACKED_CACHE_MAX_BYTES || 495000;
 var nowSec = Math.floor(Date.now() / 1000);
 var ttlSec = CacheManager._WALLET_TTL_SEC || (14 * 24 * 3600);
 var cutoff = nowSec - ttlSec;

 // Fix entries without timestamp FIRST
 var fixedTs = 0;
 Obj.forEach(packed.m, function(h, ent) {
 function fixTimestamp(e) {
 if (!e || typeof e !== "object") return;
 var ts = e.ts || e.t || 0;
 if (!ts || ts <= 0) {
 e.ts = nowSec;
 fixedTs++;
 }
 }
 if (Array.isArray(ent)) {
 for (var i = 0; i < ent.length; i++) fixTimestamp(ent[i]);
 } else {
 fixTimestamp(ent);
 }
 });

 // TTL prune
 var removedTtl = 0;
 var protectedBalanceTtl = 0;
 Obj.forEach(packed.m, function(h, ent) {
 function hasBalanceData(e) {
 if (!e || typeof e !== "object") return false;
 var payload = e.v || e;
 var assets = payload.a || payload.assets || [];
 if (!Array.isArray(assets)) return false;
 for (var ai = 0; ai < assets.length; ai++) {
 var asset = assets[ai];
 if (Array.isArray(asset) && asset.length >= 2) {
 var bal = parseFloat(asset[1]);
 if (bal > 0) return true;
 }
 if (asset && typeof asset === "object" && asset.balance) {
 var bal2 = parseFloat(asset.balance);
 if (bal2 > 0) return true;
 }
 }
 return false;
 }
 function isExpired(e) {
 if (!e || typeof e !== "object") return false;
 if (hasBalanceData(e)) {
 protectedBalanceTtl++;
 return false;
 }
 var ts = (e.ts || e.t || 0);
 return (ts > 0 && ts < cutoff);
 }
 if (Array.isArray(ent)) {
 var kept = [];
 for (var i = 0; i < ent.length; i++) {
 if (!isExpired(ent[i])) kept.push(ent[i]);
 else removedTtl++;
 }
 if (kept.length === 0) delete packed.m[h];
 else if (kept.length === 1) packed.m[h] = kept[0];
 else packed.m[h] = kept;
 } else {
 if (isExpired(ent)) { delete packed.m[h]; removedTtl++; }
 }
 });

 // Size check
 var size = CacheManager._jsonSizeBytes_(packed);
 if (size <= maxBytes) {
 packed._pruned = { at: nowSec, ttl: removedTtl, fixedTs: fixedTs, protectedBalanceTtl: protectedBalanceTtl, size: size };
 return packed;
 }

 // v4.15.7: Skip size prune when quota is exhausted — evicting cache
 // entries is pointless if we can't rescan to rebuild them.
 // Without this, overnight quota exhaustion causes permanent "No cache available".
  if (!CacheManager._FORCE_PACKED_SIZE_PRUNE && typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped()) {
 packed._pruned = { at: nowSec, ttl: removedTtl, fixedTs: fixedTs, protectedBalanceTtl: protectedBalanceTtl, size: size, skippedSizePrune: true, reason: "quota_exhausted" };
 return packed;
 }

 // Size prune (protect recent AND entries with balance data)
 // v4.13.4: CRITICAL FIX - Never evict entries with actual balance data.
 // Previous: only protected entries < 1h old, causing chains blocked by quota
 // (old timestamps) to be evicted permanently.
 // New: 3-tier protection: (1) entries with balance = NEVER evict,
 // (2) recent entries (< 1h) = protected, (3) rest = evictable by age.
 var recentCutoff = nowSec - 3600; // 1h protection
 var arr = [];
 Obj.forEach(packed.m, function(h, ent) {
 function classifyEntry(e) {
 if (!e || typeof e !== "object") return { hasBalance: false };
 // Check deflated payload for assets with balance > 0
 var payload = e.v || e;
 var assets = payload.a || payload.assets || [];
 if (Array.isArray(assets)) {
 for (var ai = 0; ai < assets.length; ai++) {
 var asset = assets[ai];
 // Deflated format: [contract, balance, symbol?, name?, decimals?]
 if (Array.isArray(asset) && asset.length >= 2) {
 var bal = parseFloat(asset[1]);
 if (bal > 0) return { hasBalance: true };
 }
 // Legacy format: { contract, balance }
 if (asset && typeof asset === "object" && asset.balance) {
 var bal2 = parseFloat(asset.balance);
 if (bal2 > 0) return { hasBalance: true };
 }
 }
 }
 return { hasBalance: false };
 }
 
 if (Array.isArray(ent)) {
 for (var i = 0; i < ent.length; i++) {
 var e = ent[i];
 var ts = (e && typeof e === "object") ? (e.ts || e.t || 0) : 0;
 var cls = classifyEntry(e);
 arr.push({ h: h, ts: ts, k: e && e.k ? e.k : null, isRecent: ts >= recentCutoff, hasBalance: cls.hasBalance });
 }
 } else {
 var ts2 = (ent && typeof ent === "object") ? (ent.ts || ent.t || 0) : 0;
 var cls2 = classifyEntry(ent);
 arr.push({ h: h, ts: ts2, k: ent && ent.k ? ent.k : null, isRecent: ts2 >= recentCutoff, hasBalance: cls2.hasBalance });
 }
 });

 // Sort: entries with balance last (never evict), recent next, then by timestamp
 arr.sort(function(a, b) {
 // Tier 1: entries with balance are MOST protected
 if (a.hasBalance && !b.hasBalance) return 1;
 if (!a.hasBalance && b.hasBalance) return -1;
 // Tier 2: recent entries are protected
 if (a.isRecent && !b.isRecent) return 1;
 if (!a.isRecent && b.isRecent) return -1;
 // Within same tier: oldest first (evicted first)
 return (a.ts || 0) - (b.ts || 0);
 });

 var removed = 0;
 var protectedRecent = 0;
 var protectedBalance = 0;
 for (var j = 0; j < arr.length; j++) {
 if (CacheManager._jsonSizeBytes_(packed) <= maxBytes) break;
 var item = arr[j];
 if (item.hasBalance) { protectedBalance++; continue; }
 if (item.isRecent) { protectedRecent++; continue; }
 
 var ent2 = packed.m[item.h];
 if (!ent2) continue;

 if (Array.isArray(ent2)) {
 var kept2 = [];
 for (var x = 0; x < ent2.length; x++) {
 var e2 = ent2[x];
 if (item.k && e2 && e2.k === item.k) { removed++; continue; }
 kept2.push(e2);
 }
 if (kept2.length === 0) delete packed.m[item.h];
 else if (kept2.length === 1) packed.m[item.h] = kept2[0];
 else packed.m[item.h] = kept2;
 } else {
 delete packed.m[item.h];
 removed++;
 }
 }

 packed._pruned = { at: nowSec, ttl: removedTtl, fixedTs: fixedTs, n: removed, protectedRecent: protectedRecent, protectedBalance: protectedBalance, protectedBalanceTtl: protectedBalanceTtl, size: CacheManager._jsonSizeBytes_(packed) };
 return packed;
 } catch (e) {
 return packed;
 }
};

// ============================================================
// LOAD / SAVE PACKED WALLET CACHE
// ============================================================

CacheManager._loadPackedWalletCache_ = function() {
 CacheManager.init();
 var raw = null;
 try { raw = CacheManager._props.getProperty(GLOBAL_CACHE_KEYS.GLOBAL_WALLET); } catch (e) {}
 if (!raw) return { v: 2, m: {} };
 try {
 var obj = JSON.parse(raw);
 if (!obj || typeof obj !== "object") return { v: 2, m: {} };
 if (!obj.m || typeof obj.m !== "object") obj.m = {};
 if (!obj.v) obj.v = 2;
 return obj;
 } catch (e2) {
 return { v: 2, m: {} };
 }
};

// v4.15.42: Reduced packed cache limit from 495KB to 485KB
// 119 wallets with some having 50+ assets need more space
// ScriptProperties hard limit is 500KB, keeping 15KB safety margin
CacheManager._PACKED_CACHE_MAX_BYTES = 455000;

/**
 * Admin recovery: compact GLOBAL_WALLET_CACHE_V1 under storage pressure.
 * Use only with confirm=true. Unlike normal saves, this forces size prune even
 * while the quota breaker is tripped, because the goal is to recover from a
 * ScriptProperties storage overflow.
 */
function COMPACT_PACKED_WALLET_CACHE(targetKb, confirm) {
  if (confirm !== true) return "Usage: COMPACT_PACKED_WALLET_CACHE(455, TRUE)";
  var targetBytes = Math.max(380000, Math.min(480000, Math.floor((Number(targetKb) || 455) * 1024)));
  var lock = null;
  var lockStatus = "locked";
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) { lock = null; lockStatus = "no_lock"; }
  } catch (eLock) {
    lock = null;
    lockStatus = "lock_unavailable";
  }

  try {
    CacheManager.init();
    var raw = CacheManager._props.getProperty(GLOBAL_CACHE_KEYS.GLOBAL_WALLET) || "";
    var before = raw.length;
    var packed = raw ? JSON.parse(raw) : { v: 2, m: {} };
    CacheManager._FORCE_PACKED_SIZE_PRUNE = true;
    packed = CacheManager._prunePackedWalletCache_(packed, targetBytes);
    CacheManager._FORCE_PACKED_SIZE_PRUNE = false;
    var aggressiveRemoved = 0;
    if (CacheManager._jsonSizeBytes_(packed) > targetBytes && packed && packed.m) {
      var nowSec = Math.floor(Date.now() / 1000);
      var recentCutoff = nowSec - 3600;
      var entries = [];
      Obj.forEach(packed.m, function(h, ent) {
        function hasBalanceData(e) {
          if (!e || typeof e !== "object") return false;
          var payload = e.v || e;
          var assets = payload.a || payload.assets || [];
          if (!Array.isArray(assets)) return false;
          for (var ai = 0; ai < assets.length; ai++) {
            var asset = assets[ai];
            var bal = Array.isArray(asset) ? parseFloat(asset[1]) : parseFloat(asset && asset.balance);
            if (bal > 0) return true;
          }
          return false;
        }
        function pushEntry(e, idx) {
          var ts = (e && typeof e === "object") ? Number(e.ts || e.t || 0) : 0;
          entries.push({ h: h, idx: idx, k: e && e.k ? e.k : null, ts: ts, hasBalance: hasBalanceData(e), isRecent: ts >= recentCutoff });
        }
        if (Array.isArray(ent)) {
          for (var i = 0; i < ent.length; i++) pushEntry(ent[i], i);
        } else {
          pushEntry(ent, -1);
        }
      });
      entries.sort(function(a, b) {
        if (a.hasBalance !== b.hasBalance) return a.hasBalance ? 1 : -1;
        if (a.isRecent !== b.isRecent) return a.isRecent ? 1 : -1;
        return (a.ts || 0) - (b.ts || 0);
      });
      for (var ri = 0; ri < entries.length && CacheManager._jsonSizeBytes_(packed) > targetBytes; ri++) {
        var item = entries[ri];
        var cur = packed.m[item.h];
        if (!cur) continue;
        if (Array.isArray(cur)) {
          var kept = [];
          var removedThis = false;
          for (var ci = 0; ci < cur.length; ci++) {
            var ce = cur[ci];
            var match = item.k ? (ce && ce.k === item.k) : (ci === item.idx);
            if (match && !removedThis) { removedThis = true; aggressiveRemoved++; continue; }
            kept.push(ce);
          }
          if (kept.length === 0) delete packed.m[item.h];
          else if (kept.length === 1) packed.m[item.h] = kept[0];
          else packed.m[item.h] = kept;
        } else {
          delete packed.m[item.h];
          aggressiveRemoved++;
        }
      }
      packed._adminCompact = { at: nowSec, aggressiveRemoved: aggressiveRemoved, size: CacheManager._jsonSizeBytes_(packed), target: targetBytes };
    }
    var s = JSON.stringify(packed || { v: 2, m: {} });
    CacheManager._props.setProperty(GLOBAL_CACHE_KEYS.GLOBAL_WALLET, s);
    try { CacheManager._cache.put(GLOBAL_CACHE_KEYS.GLOBAL_WALLET, s, 21600); } catch (eCache) {}
    return "OK before=" + Math.round(before / 1024) + "KB after=" + Math.round(s.length / 1024) + "KB target=" + Math.round(targetBytes / 1024) + "KB lock=" + lockStatus + " aggressiveRemoved=" + aggressiveRemoved + " pruned=" + JSON.stringify((packed && packed._pruned) || {});
  } catch (e) {
    CacheManager._FORCE_PACKED_SIZE_PRUNE = false;
    return "ERROR " + String((e && e.message) || e);
  } finally {
    try { if (lock) lock.releaseLock(); } catch (eRel) {}
  }
}

CacheManager._packedEntryAssetCount_ = function(e) {
 try {
  if (!e || typeof e !== "object") return 0;
  var payload = e.v || e;
  var assets = payload.a || payload.assets || [];
  return (assets && Array.isArray(assets)) ? assets.length : 0;
 } catch (err) {
  return 0;
 }
};

CacheManager._mergePackedWalletCache_ = function(incoming) {
 try {
  if (!incoming || !incoming.m) incoming = { v: 2, m: {} };
  var raw = CacheManager._props.getProperty(GLOBAL_CACHE_KEYS.GLOBAL_WALLET);
  if (!raw) return incoming;
  var current = JSON.parse(raw);
  if (!current || !current.m) return incoming;

  function eachEntry(ent, fn) {
   if (Array.isArray(ent)) {
    for (var i = 0; i < ent.length; i++) fn(ent[i]);
   } else {
    fn(ent);
   }
  }

  function putEntry(h, ent) {
   if (!ent) return;
   var key = ent.k || ("__hash__:" + h);
   var cur = incoming.m[h];
   if (!cur) {
    incoming.m[h] = ent;
    return;
   }
   var arr = Array.isArray(cur) ? cur.slice(0) : [cur];
   var replaced = false;
   for (var i = 0; i < arr.length; i++) {
    var arrKey = arr[i] && (arr[i].k || ("__hash__:" + h));
    if (arrKey !== key) continue;
    var aCur = CacheManager._packedEntryAssetCount_(arr[i]);
    var aNew = CacheManager._packedEntryAssetCount_(ent);
    var tCur = Number((arr[i] && (arr[i].ts || arr[i].t)) || 0);
    var tNew = Number((ent && (ent.ts || ent.t)) || 0);
    if (aNew > aCur || (aNew === aCur && tNew > tCur)) arr[i] = ent;
    replaced = true;
    break;
   }
   if (!replaced) arr.push(ent);
   incoming.m[h] = arr.length === 1 ? arr[0] : arr;
  }

  Obj.forEach(current.m, function(h, ent) {
   eachEntry(ent, function(e) { putEntry(h, e); });
  });
 } catch (eMerge) {}
 return incoming;
};

CacheManager._savePackedWalletCache_ = function(packed) {
  CacheManager.init();
  var maxBytes = CacheManager._PACKED_CACHE_MAX_BYTES || 495000;
  var retry = 0;
  while (retry <= 1) {
  try {
  if (retry === 1) {
  if (CacheManager._emergencyPurge_ && CacheManager._emergencyPurge_(65536)) {
  console.log("[Packed Cache] Emergency purge completed before retry.");
  } else { break; }
  }
  // v4.15.33: Pre-check storage before writing to avoid silent failures
  if (retry === 0 && CacheManager._getStorageUsagePct && CacheManager._getStorageUsagePct() > 85) {
  console.log("[Packed Cache] Storage > 85%, running pre-emptive purge...");
  if (CacheManager._emergencyPurge_ && CacheManager._emergencyPurge_(65536)) {
  console.log("[Packed Cache] Pre-emptive purge OK, storage now at " + (CacheManager._getStorageUsagePct ? CacheManager._getStorageUsagePct() : '?') + "%");
  }
  }
  packed = CacheManager._mergePackedWalletCache_(packed || { v: 2, m: {} });
  packed = CacheManager._prunePackedWalletCache_(packed || { v: 1, m: {} }, maxBytes);
  var s = JSON.stringify(packed || { v: 1, m: {} });
  CacheManager._props.setProperty(GLOBAL_CACHE_KEYS.GLOBAL_WALLET, s);
  try { CacheManager._cache.put(GLOBAL_CACHE_KEYS.GLOBAL_WALLET, s, 21600); } catch (e2) {}
  return true;
  } catch (e) { retry++; }
  }
  return false;
};

// ============================================================
// PACKED GET / PUT / DEL
// ============================================================

CacheManager._packedGet_ = function(key) {
 if (!CacheManager._VIRTUALIZE_CHAIN_CACHES || !CacheManager._isVirtualKey_(key)) return null;

 var packedRaw = null;
 try { packedRaw = CacheManager._cache.get(GLOBAL_CACHE_KEYS.GLOBAL_WALLET); } catch (e0) {}
 var usedL1 = !!packedRaw;
 var packed = null;

 if (packedRaw) {
 try { packed = JSON.parse(packedRaw); } catch (e1) { packed = null; }
 }
 if (!packed || !packed.m) packed = CacheManager._loadPackedWalletCache_();

 var h = CacheManager._hashKey_(key);
 var nowSec = Math.floor(Date.now() / 1000);
 var cutoff = nowSec - (CacheManager._WALLET_TTL_SEC || (14 * 24 * 3600));

 function readEntry(e) {
 if (!e) return null;
 if (typeof e === "string") return e;
 if (typeof e !== "object") return null;
 var ts = e.ts || e.t || 0;
 if (ts > 0 && ts < cutoff) return null;
 if (e.j && e.v) {
 var inflated = CacheManager._inflateWalletPayload_(e.v);
 return JSON.stringify(inflated);
 }
 if (e.s !== undefined) return String(e.s);
 return null;
 }

 function readFromPacked(p) {
 if (!p || !p.m) return null;
 var ent = p.m[h];
 if (ent === null || ent === undefined) return null;
 var val = null;
 if (Array.isArray(ent)) {
 for (var i = 0; i < ent.length; i++) {
 if (ent[i] && ent[i].k === key) { val = readEntry(ent[i]); break; }
 }
 } else if (ent && typeof ent === "object" && ent.k) {
 if (ent.k === key) val = readEntry(ent);
 } else {
 val = readEntry(ent);
 }
 return val;
 }

 var out = readFromPacked(packed);

 // v4.15.13: Always retry ScriptProperties before returning null.
 // Post-redeploy we can have an L1 miss for GLOBAL_WALLET itself; re-read
 // props directly instead of depending on usedL1. This also protects against
 // a stale GLOBAL_WALLET blob in CacheService missing a wallet entry.
 if (!out) {
 var packedProps = CacheManager._loadPackedWalletCache_();
 out = readFromPacked(packedProps);
 if (out && packedProps && packedProps.m) {
 try { CacheManager._cache.put(GLOBAL_CACHE_KEYS.GLOBAL_WALLET, JSON.stringify(packedProps), 21600); } catch (eL1Refresh) {}
 }
 }

 // v4.15.6 FIX: Do NOT delete entries during reads (_packedDel_ triggers a write
 // to GLOBAL_WALLET which races with concurrent _packedPut_ writes from other
 // wallets, potentially overwriting their updates). Let the prune handle cleanup
 // during the next _packedPut_ → _savePackedWalletCache_ cycle instead.
 if (!out) {
 return null;
 }

 // v4.15.6 FIX: Do NOT write to packed cache during reads.
 // The timestamp refresh was causing the same race condition as _packedDel_:
 // a read-triggered _savePackedWalletCache_ can overwrite concurrent writes.
 // Timestamps are refreshed naturally when _packedPut_ is called during saves.

 return out;
};

CacheManager._packedPut_ = function(key, valueStr) {
 if (!CacheManager._VIRTUALIZE_CHAIN_CACHES || !CacheManager._isVirtualKey_(key)) return false;

 var h = CacheManager._hashKey_(key);
 var nowSec = Math.floor(Date.now() / 1000);

 // Build the entry BEFORE acquiring lock (minimize lock hold time)
 var ent = null;
 try {
 var s = String(valueStr === null || valueStr === undefined ? "" : valueStr);

 if (CacheManager._looksJson_(s)) {
 var obj = null;
 try { obj = JSON.parse(s); } catch (e0) { obj = null; }

 if (obj && typeof obj === "object") {
 var def = CacheManager._deflateWalletPayload_(obj);
 ent = { k: key, ts: nowSec, j: 1, v: def };
 } else {
 ent = { k: key, ts: nowSec, s: s };
 }
 } else {
 ent = { k: key, ts: nowSec, s: s };
 }
 } catch (e1) {
 ent = { k: key, ts: nowSec, s: String(valueStr) };
 }

 // Guarantee timestamp
 if (!ent.ts || ent.ts <= 0) ent.ts = nowSec;

 // v4.15.6: Use LockService to make read-modify-write atomic.
 // Without this, 20 concurrent WATCHDOG workers load/modify/save the same
 // GLOBAL_WALLET blob, causing lost updates when a stale version overwrites
 // a fresh one. Lost updates -> stale timestamps -> prune eviction ->
 // permanent "No cache available" cycle.
 var lock = null;
 try { lock = LockService.getScriptLock(); } catch (eLs) {}

 var gotLock = false;
 if (lock) {
 try { gotLock = lock.tryLock(5000); } catch (eLk) {}
 }
 if (lock && !gotLock) {
 try { Logger.log("[PACKED_LOCK_MISS] _packedPut_ skipped for " + String(key || "").substring(0, 80)); } catch (eLog) {}
 return false;
 }

 try {
 // Load INSIDE lock to get the latest version (not a stale pre-lock copy)
 var packed = CacheManager._loadPackedWalletCache_();

 // Collision-safe set
 var cur = packed.m[h];
 if (!cur) {
 packed.m[h] = ent;
 } else if (Array.isArray(cur)) {
 var replaced = false;
 for (var i = 0; i < cur.length; i++) {
 if (cur[i] && cur[i].k === key) { cur[i] = ent; replaced = true; break; }
 }
 if (!replaced) cur.push(ent);
 packed.m[h] = cur;
 } else {
 if (cur.k && cur.k !== key) packed.m[h] = [cur, ent];
 else packed.m[h] = ent;
 }

 return CacheManager._savePackedWalletCache_(packed);
 } finally {
 if (gotLock && lock) {
 try { lock.releaseLock(); } catch (eRl) {}
 }
 }
};

CacheManager._packedDel_ = function(key) {
 if (!CacheManager._VIRTUALIZE_CHAIN_CACHES || !CacheManager._isVirtualKey_(key)) return false;

 // v4.15.6: Use LockService for atomic read-modify-write (same as _packedPut_)
 var lock = null;
 try { lock = LockService.getScriptLock(); } catch (eLs) {}

 var gotLock = false;
 if (lock) {
 try { gotLock = lock.tryLock(5000); } catch (eLk) {}
 }
 if (lock && !gotLock) {
 try { Logger.log("[PACKED_LOCK_MISS] _packedDel_ skipped for " + String(key || "").substring(0, 80)); } catch (eLog) {}
 return false;
 }

 try {
 var packed = CacheManager._loadPackedWalletCache_();
 var h = CacheManager._hashKey_(key);
 var entry = packed.m[h];
 if (!entry) return true;

 if (Array.isArray(entry)) {
 var out = [];
 for (var i = 0; i < entry.length; i++) {
 if (entry[i] && entry[i].k !== key) out.push(entry[i]);
 }
 if (out.length === 0) delete packed.m[h];
 else if (out.length === 1) packed.m[h] = out[0];
 else packed.m[h] = out;
 } else {
 if (entry.k === key) delete packed.m[h];
 }

 return CacheManager._savePackedWalletCache_(packed);
 } finally {
 if (gotLock && lock) {
 try { lock.releaseLock(); } catch (eRl) {}
 }
 }
};

// ============================================================
// LEGACY MIGRATION
// ============================================================

CacheManager._migrateLegacyChainCaches_ = function() {
 CacheManager.init();
 var MIG_KEY = "MIGRATED_TO_PACKED_WALLET_CACHE_V1";

 try {
 var last = CacheManager._props.getProperty(MIG_KEY);
 if (last && String(last).length > 0) return;
 } catch (e0) {}

 try {
 var all = CacheManager._props.getProperties() || {};
 var keys = Object.keys(all);
 var moved = 0;

 for (var i = 0; i < keys.length; i++) {
 var k = keys[i];
 if (!CacheManager._isVirtualKey_(k)) continue;
 if (k === GLOBAL_CACHE_KEYS.GLOBAL_WALLET) continue;

 var v = all[k];
 if (v === null || v === undefined) continue;

 var ok = CacheManager._packedPut_(k, String(v));
 if (ok) {
 try { CacheManager._props.deleteProperty(k); } catch (e1) {}
 moved++;
 }
 }

 try { CacheManager._props.setProperty(MIG_KEY, String(new Date().toISOString())); } catch (e2) {}
 } catch (e) {}
};
