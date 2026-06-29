/************************************************************
 * 04A_CACHE_CORE.gs - Cache Manager Core
 * 
 * Version: v4.15.100 - Emergency purge: add ACTIVITY_RPC_LOOKUP/NONCE_MAP, stale HTTP_CATEGORY_TRACKER, ACTIVITY_NONCE_MAP
 * 
 * v4.15.75 - Purge global price cache before wallet data in storage emergency
 * - GLOBAL_PRICE_CACHE_V2 is reconstructible and can free ~50KB immediately.
 * - Wallet cache remains protected.
 *
 * v4.15.74 - Purge all ACTIVITY_FORCE_* in storage emergency
 * - If expired flags alone do not free enough space, recent force flags are
 *   also expendable. Losing an activity-forced refresh is safer than blocking
 *   wallet-cache writes at 500KB.
 *
 * v4.15.72 - Purge expired ACTIVITY_FORCE_* and reconstructible pending queue
 * - ACTIVITY_FORCE_* flags expire after 2h but were only deleted when checked.
 * - Accumulated stale flags pushed ScriptProperties over 500KB and blocked
 *   wallet-cache writes, surfacing NO_CACHE_WAITING_REFRESH fallbacks.
 * - Emergency purge now removes expired force flags and ACTIVITY_PENDING_REFRESH
 *   before touching any cache data.
 *
 * v4.15.56 - CRITICAL FIX: emergency purge must never delete GLOBAL_WALLET_CACHE_V1
 * - Root cause of NO_CACHE_WAITING_REFRESH wave: storage pressure purge matched
 *   GLOBAL_WALLET_CACHE_V1 as a wallet key, deleted the packed cache, then the
 *   next wallet save rewrote only one entry.
 * - GLOBAL_WALLET_CACHE_V1 is now explicitly protected from all purge candidate lists.
 *
 * v4.12.20 - TTL ALIGNMENT:
 * - CACHE_L1_TTL_MIN_SEC: 7200 -> 10800 (3h)
 * - Aligned with WALLET_TTL to prevent false "stale" flags
 * - Fixes WARN status on chains refreshed late in 2h cycle
 * 
 * v4.12.19 - DEBUG L2 WRITE TRACKING
 * - Tracks exactly what happens during _packedPut_ calls
 * - Logs stored in DEBUG_L2_* ScriptProperties
 * - Read with DIAG_READ_L2_DEBUG() after refresh
 * 
 * v4.12.17 - CRITICAL FIX: Packed cache container was being deleted
 * - PROBLEM: The regex /^GLOBAL_WALLET_CACHE_/i matched GLOBAL_WALLET_CACHE_V1
 * (Changelog v4.8.0..v4.12.16: 2 entries removed for brevity)
 * Module de base du systeme de cache WCORE.
 * Contient:
 * - CacheManager init & configuration
 * - Cache Key Index
 * - CacheService (L1) helpers
 * - Global cache keys & config
 * 
 * DEPENDANCES: 01_INIT.gs, 02_UTILS.gs
 * CHARGE AVANT: 04B, 04C, 04D
 ************************************************************/
var CACHE_CORE_VERSION = "4.15.100";

// ============================================================
// DEPENDENCY CHECK (v4.8.0)
// ============================================================

(function() {
 if (typeof Num === "undefined" || typeof Num.isValid !== "function") {
 throw new Error('[04A_CACHE_CORE] FATAL: 02_UTILS.gs must be loaded before cache modules (Num missing)');
 }
 if (typeof Obj === "undefined" || typeof Obj.forEach !== "function") {
 throw new Error('[04A_CACHE_CORE] FATAL: 02_UTILS.gs must be loaded before cache modules (Obj missing)');
 }
 if (typeof Format === "undefined" || typeof Format.datetime !== "function") {
 throw new Error('[04A_CACHE_CORE] FATAL: 02_UTILS.gs must be loaded before cache modules (Format missing)');
 }
})();

// ============================================================
// INTERNAL HELPER
// ============================================================

function _timerRemainingMs(timer) {
 try {
 if (timer && typeof timer.remaining === "function") return timer.remaining();
 } catch (e) {}
 return 999999999;
}

// ============================================================
// CACHE MANAGER CORE (fills stub from 01_INIT.gs)
// ============================================================

CacheManager = CacheManager || {};

CacheManager._inited = CacheManager._inited || false;
CacheManager._props = CacheManager._props || null;
CacheManager._cache = CacheManager._cache || null;

/**
 * Initialize cache backends
 */
CacheManager.init = CacheManager.init || function() {
 if (CacheManager._inited) return;
 
 var _rawProps = PropertiesService.getScriptProperties();
 CacheManager._props = {
 getProperty: function(k) { return _rawProps.getProperty(k); },
 getProperties: function() { return _rawProps.getProperties(); },
 getKeys: function() {
 try {
 if (typeof _rawProps.getKeys === 'function') return _rawProps.getKeys();
 } catch (e) {}
 var p = {};
 try { p = _rawProps.getProperties() || {}; } catch (e2) { p = {}; }
 return Object.keys(p);
 },
 deleteProperty: function(k) {
 try { return _rawProps.deleteProperty(k); } catch (e) { return null; }
 },
 deleteAllProperties: function() {
 try { return _rawProps.deleteAllProperties(); } catch (e) { return null; }
 },
 setProperty: function(k, v) {
 try {
 var _k = String(k);
 var _isVirt = false;
 
 // v4.12.17 FIX: NEVER redirect GLOBAL_WALLET_CACHE_V1 to SheetCache
 // This is the packed wallet cache container itself - it MUST stay in ScriptProperties
 // Only individual wallet keys should be virtualized, not the container
 if (_k === 'GLOBAL_WALLET_CACHE_V1' || _k === GLOBAL_CACHE_KEYS.GLOBAL_WALLET) {
 // Write directly to ScriptProperties - this is the packed cache container
 return _rawProps.setProperty(k, v);
 }
 
 // Check if this is a virtualized wallet key (individual wallet caches)
 if (/_CACHE_WALLET_/i.test(_k) || /WALLET_CACHE_/i.test(_k)) _isVirt = true;
 try { if (CacheManager._isVirtualKey_) _isVirt = _isVirt || CacheManager._isVirtualKey_(_k); } catch (eV) {}
 if (_isVirt) {
 try { if (typeof SETUP_SHEET_CACHE === 'function') SETUP_SHEET_CACHE(); } catch (e0) {}
 try { if (typeof SheetCache !== 'undefined' && SheetCache && SheetCache.setRaw) SheetCache.setRaw(_k, String(v || ''), 7200); } catch (e1) {}
 try { _rawProps.deleteProperty(_k); } catch (e2) {}
 return null;
 }
 } catch (e3) {}
 return _rawProps.setProperty(k, v);
 },
 setProperties: function(obj) { return _rawProps.setProperties(obj); }
 };
 CacheManager._cache = CacheService.getScriptCache();
 CacheManager._inited = true;
};

// ============================================================
// CACHE KEY INDEX (for targeted purge & orphan detection)
// ============================================================

CacheManager.INDEX_KEY = CacheManager.INDEX_KEY || 'WCORE_CACHE_INDEX_V1';
CacheManager.INDEX_MAX = CacheManager.INDEX_MAX || 500;

CacheManager._isIndexableKey_ = CacheManager._isIndexableKey_ || function(k) {
 try {
 var s = String(k || '');
 if (!s) return false;
 if (s === CacheManager.INDEX_KEY) return false;
 return (
 s.indexOf('CACHE') >= 0 ||
 s.indexOf('PRICE') >= 0 ||
 s.indexOf('FX') >= 0 ||
 s.indexOf('RPC_HEALTH') >= 0 ||
 s.indexOf('_LOCK') >= 0 ||
 s.indexOf('META_') >= 0 ||
 s.indexOf('WD_') >= 0 ||
 s.indexOf('_REFRESH_STATUS') >= 0
 );
 } catch (e) {
 return false;
 }
};

CacheManager.indexList = CacheManager.indexList || function() {
 CacheManager.init();
 try {
 var raw = CacheManager._props.getProperty(CacheManager.INDEX_KEY) || '';
 if (!raw) return [];
 var arr = raw.split('\n').map(function(x){return String(x||'').trim();}).filter(Boolean);
 var seen = {};
 var out = [];
 for (var i = 0; i < arr.length; i++) {
 var k = arr[i];
 if (seen[k]) continue;
 seen[k] = true;
 out.push(k);
 }
 return out;
 } catch (e) {
 return [];
 }
};

CacheManager._indexBufKey = CacheManager._indexBufKey || (CacheManager.INDEX_KEY + ':L1');
CacheManager._indexWriteEvery = CacheManager._indexWriteEvery || 25;
CacheManager._indexWriteMinMs = CacheManager._indexWriteMinMs || 90000;

CacheManager._indexTrackKey_ = CacheManager._indexTrackKey_ || function(key) {
 try {
 if (!CacheManager._isIndexableKey_(key)) return;
 CacheManager.init();

 var k = String(key);
 var buf = null;
 try { buf = CacheManager._cache.get(CacheManager._indexBufKey); } catch (e0) {}
 var arr = [];
 if (buf) {
 arr = buf.split('\n').map(function(x){return String(x||'').trim();}).filter(Boolean);
 } else {
 arr = CacheManager.indexList();
 }

 arr = [k].concat(arr.filter(function(x){ return x !== k; }));
 if (arr.length > CacheManager.INDEX_MAX) arr = arr.slice(0, CacheManager.INDEX_MAX);

 try { CacheManager._cache.put(CacheManager._indexBufKey, arr.join('\n'), CACHE_L1_TTL_MIN_SEC || 7200); } catch (e1) {}

 CacheManager._indexWrites = (CacheManager._indexWrites || 0) + 1;
 var now = Date.now();
 var last = CacheManager._indexLastFlushMs || 0;
 if ((CacheManager._indexWrites % CacheManager._indexWriteEvery) === 0 || (now - last) > CacheManager._indexWriteMinMs) {
 CacheManager._props.setProperty(CacheManager.INDEX_KEY, arr.join('\n'));
 CacheManager._indexLastFlushMs = now;
 }
 } catch (e) {}
};

CacheManager._indexRemoveKey_ = CacheManager._indexRemoveKey_ || function(key) {
 try {
 CacheManager.init();
 var k = String(key);
 var buf = null;
 try { buf = CacheManager._cache.get(CacheManager._indexBufKey); } catch (e0) {}
 var arr = [];
 if (buf) {
 arr = buf.split('\n').map(function(x){return String(x||'').trim();}).filter(Boolean);
 } else {
 arr = CacheManager.indexList();
 }
 arr = arr.filter(function(x){ return x !== k; });
 try { CacheManager._cache.put(CacheManager._indexBufKey, arr.join('\n'), CACHE_L1_TTL_MIN_SEC || 7200); } catch (e1) {}
 CacheManager._props.setProperty(CacheManager.INDEX_KEY, arr.join('\n'));
 } catch (e) {}
};

// ============================================================
// CACHE SERVICE (L1) HELPERS - TTL MIN 3H
// ============================================================

var CACHE_L1_TTL_MIN_SEC = 10800; // 3h minimum (aligne avec WALLET_TTL)
var CACHE_L1_TTL_FX_SEC = 14400; // 4h for FX

CacheManager.l1Get = CacheManager.l1Get || function(key) {
 CacheManager.init();
 if (!key) return null;
 try {
 var v = CacheManager._cache.get(key);
 if (v !== null && v !== undefined) return v;
 } catch (e) {}
 return null;
};

CacheManager.l1Set = CacheManager.l1Set || function(key, value, ttlSec) {
 CacheManager.init();
 if (!key) return false;
 var ttl = Math.max(Number(ttlSec || CACHE_L1_TTL_MIN_SEC) || CACHE_L1_TTL_MIN_SEC, CACHE_L1_TTL_MIN_SEC);
 try {
 CacheManager._cache.put(key, String(value), ttl);
 return true;
 } catch (e) {
 return false;
 }
};

CacheManager.l1Remove = CacheManager.l1Remove || function(key) {
 CacheManager.init();
 if (!key) return;
 try { CacheManager._cache.remove(key); } catch (e) {}
};

CacheManager.l1GetJson = CacheManager.l1GetJson || function(key) {
 var raw = CacheManager.l1Get(key);
 if (!raw) return null;
 try { return JSON.parse(raw); } catch (e) { return null; }
};

CacheManager.l1SetJson = CacheManager.l1SetJson || function(key, obj, ttlSec) {
 try { return CacheManager.l1Set(key, JSON.stringify(obj || null), ttlSec); } catch (e) { return false; }
};

CacheManager.getProps = CacheManager.getProps || function() {
 CacheManager.init();
 return CacheManager._props;
};

// ============================================================
// SAFE GET/SET (L1 + ScriptProperties)
// ============================================================

CacheManager.safeGet = CacheManager.safeGet || function(key) {
 CacheManager.init();
 if (!key) return null;
 
 // Try L1 (CacheService) first - fastest
 try {
 var v = CacheManager._cache.get(key);
 if (v !== null && v !== undefined) return v;
 } catch (e) {}
 
 // v4.12.16 FIX: Route virtualized keys through packed cache
 // This ensures we read from L2 packed cache when L1 has expired
 if (CacheManager._isVirtualKey_ && CacheManager._isVirtualKey_(key)) {
 try {
 if (CacheManager._packedGet_) {
 var packed = CacheManager._packedGet_(key);
 if (packed !== null && packed !== undefined) return packed;
 }
 } catch (e2) {}
 return null;
 }
 
 // Non-virtualized keys: read directly from ScriptProperties
 try {
 return CacheManager._props.getProperty(key);
 } catch (e3) {
 return null;
 }
};

CacheManager.safeSet = CacheManager.safeSet || function(key, value, ttlSeconds) {
 CacheManager.init();
 if (!key) return false;

 var s = (value === null || value === undefined) ? "" : String(value);
 
 // v4.12.19 DEBUG: Track L2 writes for debugging persistence issues
 var _debugL2 = (String(key).indexOf("BASE_CACHE_WALLET_0x6a35") >= 0);
 var _debugLog = [];
 
 // v4.12.16 FIX: Route virtualized keys through packed cache
 // This fixes the bug where wallet caches were only saved to L1 (CacheService)
 // and never to L2 (ScriptProperties), causing data loss on L1 expiry
 if (CacheManager._isVirtualKey_ && CacheManager._isVirtualKey_(key)) {
 if (_debugL2) _debugLog.push("isVirtual=YES, size=" + s.length);
 
 // Write to L1 (CacheService) for fast access
 try {
 var ttl = (ttlSeconds && ttlSeconds > 0) ? ttlSeconds : 21600;
 CacheManager._cache.put(key, s, ttl);
 if (_debugL2) _debugLog.push("L1=OK");
 } catch (e1) {
 if (_debugL2) _debugLog.push("L1=ERR:" + e1.message);
 }
 
 // Write to L2 via packed cache (persistent storage)
 try {
 if (CacheManager._packedPut_) {
 if (_debugL2) _debugLog.push("_packedPut_=EXISTS");
 var l2Result = CacheManager._packedPut_(key, s);
 if (_debugL2) {
 _debugLog.push("L2=" + (l2Result ? "OK" : "FAILED"));
 // Store debug log
 try {
 var props = PropertiesService.getScriptProperties();
 props.setProperty("DEBUG_L2_" + Date.now(), _debugLog.join("|"));
 } catch (eLog) {}
 }
 return l2Result;
 } else {
 if (_debugL2) _debugLog.push("_packedPut_=UNDEFINED!");
 }
 } catch (e2) {
 if (_debugL2) {
 _debugLog.push("L2=EXCEPTION:" + e2.message);
 try {
 var props = PropertiesService.getScriptProperties();
 props.setProperty("DEBUG_L2_" + Date.now(), _debugLog.join("|"));
 } catch (eLog) {}
 }
 }
 
 return false;
 }
 
 // Non-virtualized keys: write directly to ScriptProperties
 var wroteProps = false;

 try {
 CacheManager._props.setProperty(key, s);
 wroteProps = true;
 } catch (e) {
 try {
 if (CacheManager._emergencyPurge_ && CacheManager._emergencyPurge_(Math.max(16384, s.length + key.length))) {
 CacheManager._props.setProperty(key, s);
 wroteProps = true;
 }
 } catch (e2) {}
 }

 try {
 var ttl = (ttlSeconds && ttlSeconds > 0) ? ttlSeconds : 21600;
 CacheManager._cache.put(key, s, ttl);
 } catch (e3) {}

 try { CacheManager._indexTrackKey_(key); } catch (e4) {}

 return wroteProps;
};

CacheManager.safeGetJson = CacheManager.safeGetJson || function(key) {
 var raw = CacheManager.safeGet(key);
 if (!raw) return null;
 try { return JSON.parse(raw); } catch (e) { return null; }
};

CacheManager.safeSetJson = CacheManager.safeSetJson || function(key, obj, _config, ttlSeconds) {
 try {
 CacheManager.safeSet(key, JSON.stringify(obj || null), ttlSeconds);
 } catch (e) {}
};

CacheManager.delete = CacheManager.delete || function(key) {
 CacheManager.init();
 if (!key) return;
 try { CacheManager._props.deleteProperty(key); } catch (e) {}
 try { CacheManager._cache.remove(key); } catch (e2) {}
};

// v4.15.33: Quick storage usage check (lightweight, no iteration)
CacheManager._getStorageUsagePct = CacheManager._getStorageUsagePct || function() {
  try {
    CacheManager.init();
    var all = CacheManager._props.getProperties();
    var keys = Object.keys(all);
    var total = 0;
    for (var i = 0; i < keys.length; i++) {
      total += keys[i].length + String(all[keys[i]] || "").length;
    }
    return Math.round((total / (500 * 1024)) * 100);
  } catch (e) { return 100; }
};

CacheManager._emergencyPurge_ = CacheManager._emergencyPurge_ || function(targetBytes) {
 try {
 CacheManager.init();
 var props = CacheManager._props;
 if (!props) return false;

 var all = props.getProperties();
 var keys = Object.keys(all);
 var nowMs = Date.now();
 var recentMs = 2 * 3600 * 1000; // 2 hours protection

 var total = 0;
 for (var i = 0; i < keys.length; i++) {
 total += keys[i].length + String(all[keys[i]] || "").length;
 }

 var QUOTA = 500 * 1024;
 var TARGET = QUOTA - 40 * 1024;
 var need = Math.max(targetBytes || 0, (total > TARGET ? (total - TARGET) : 0));
 if (need <= 0) return true;

  var cands = [];
  function isProtectedKey_(k) {
  return k === GLOBAL_CACHE_KEYS.GLOBAL_WALLET || k === "GLOBAL_WALLET_CACHE_V1";
  }
  function pushIf(matchFn, prio) {
  for (var j = 0; j < keys.length; j++) {
  var kk = keys[j];
  if (isProtectedKey_(kk)) continue;
  if (!kk || !matchFn(kk)) continue;
  cands.push({ k: kk, size: kk.length + String(all[kk] || "").length, prio: prio });
  }
  }

 // Priority: HTTP counters(5) > OUTSNAP(8) > expired activity force flags(12)
 // > pending activity queue(15) > recent activity force flags(16) > BUDGET(20) > RPC(30) > WD(40) > META(50) > global price cache(55)
 // > other caches(60) > old wallets(90)
 // v4.15.62: WCORE_HTTP_* daily counters and OUTSNAP_* output snapshots accumulate
 // without bound and were the overflow tipping ScriptProperties past 500KB
 // (2026-06-01 storage-quota freeze). Purge them FIRST — they are reconstructible.
  pushIf(function(k){ return k.indexOf("WCORE_HTTP_") === 0; }, 5);
  pushIf(function(k){ return k.indexOf("OUTSNAP_") === 0; }, 8);
  // v4.15.100: stale activity data stored in ScriptProperties (should be SheetCache/memory)
  // HTTP category tracker from Feb 2026 (4+ months stale, reconstructible)
  pushIf(function(k){ return k === "HTTP_CATEGORY_TRACKER_v1" || k === "HTTP_CATEGORY_DATE_v1"; }, 5);
  // Old RPC_LOOKUP (now memory-only, ~28KB wasted quota)
  pushIf(function(k){ return k === "ACTIVITY_RPC_LOOKUP"; }, 45);
  // Large NONCE_MAP (15KB, can be rebuilt from scratch on next watchdog cycle)
  pushIf(function(k){ return k === "ACTIVITY_NONCE_MAP"; }, 47);
 for (var af = 0; af < keys.length; af++) {
 var afk = keys[af];
 if (!afk || afk.indexOf("ACTIVITY_FORCE_") !== 0) continue;
 try {
 var afd = JSON.parse(all[afk] || "{}");
 var requestedAt = Number(afd.requestedAt || 0);
 var afExpired = (!requestedAt || (nowMs - requestedAt) > 7200000);
 cands.push({ k: afk, size: afk.length + String(all[afk] || "").length, prio: afExpired ? 12 : 16 });
 } catch (eAF) {
 cands.push({ k: afk, size: afk.length + String(all[afk] || "").length, prio: 12 });
 }
 }
 pushIf(function(k){ return k === "ACTIVITY_PENDING_REFRESH"; }, 15);
 pushIf(function(k){ return k.indexOf("_DYNAMIC_BUDGET_STATS_") >= 0; }, 10);
 pushIf(function(k){ return k.indexOf("BUDGET_") === 0 || k.indexOf("_BUDGET_") >= 0; }, 20);
 pushIf(function(k){ return k.indexOf("RPC_HEALTH") >= 0; }, 30);
 pushIf(function(k){ return k.indexOf("WD_") === 0 || k.indexOf("WATCHDOG") >= 0; }, 40);
 pushIf(function(k){ return k.indexOf("META") >= 0; }, 50);
 pushIf(function(k){ return k === GLOBAL_CACHE_KEYS.GLOBAL_PRICES || k === "GLOBAL_PRICE_CACHE_V2"; }, 55);
 pushIf(function(k){ return k.indexOf("_CACHE_") >= 0 && k.indexOf("WALLET_") < 0 && k.indexOf("GLOBAL_") < 0; }, 60);
 
 // Wallets: only OLD ones (> 2h)
  for (var w = 0; w < keys.length; w++) {
  var wk = keys[w];
  if (isProtectedKey_(wk)) continue;
  if (!wk || (wk.indexOf("WALLET_") < 0 && wk.indexOf("_CACHE_WALLET_") < 0)) continue;
 var isRecent = false;
 try {
 var wobj = JSON.parse(all[wk]);
 var updAt = wobj.updatedAt || wobj.u || 0;
 if (updAt > 1e12) updAt = updAt;
 else if (updAt > 1e9) updAt = updAt * 1000;
 if (updAt > 0 && (nowMs - updAt) < recentMs) isRecent = true;
 } catch (eW) {}
 if (!isRecent) {
 cands.push({ k: wk, size: wk.length + String(all[wk] || "").length, prio: 90 });
 }
 }

 if (!cands.length) return false;

 cands.sort(function(a,b){
 if (a.prio !== b.prio) return a.prio - b.prio;
 return b.size - a.size;
 });

 var freed = 0;
 var deletedKeys = [];
 for (var x = 0; x < cands.length && freed < need; x++) {
 try {
 props.deleteProperty(cands[x].k);
 freed += cands[x].size;
 deletedKeys.push(cands[x].k);
 } catch (eDel) {}
 }

 try {
 if (deletedKeys.length) CacheService.getScriptCache().removeAll(deletedKeys);
 } catch (eC) {}

 return freed > 0;
 } catch (e) {
 return false;
 }
};

// ============================================================
// GLOBAL CACHE KEYS & CONFIG
// ============================================================

var GLOBAL_CACHE_KEYS = {
 GLOBAL_PRICES: "GLOBAL_PRICE_CACHE_V2",
 GLOBAL_FX: "GLOBAL_FX_CACHE_V1",
 GLOBAL_WALLET: "GLOBAL_WALLET_CACHE_V1",
 GLOBAL_META: "GLOBAL_TOKEN_META_V1",
 CACHE_VERSIONS: "CACHE_VERSIONS_REGISTRY",
 LAST_CLEANUP: "GLOBAL_LAST_CLEANUP_TS"
};

var GLOBAL_CACHE_CONFIG = {
 PRICE_TTL_MS: 600000, // 10 min
 PRICE_STALE_MS: 5400000, // 90min (aligné avec WCORE_CACHE_CONFIG.PRICE_STALE_MS)
 FX_TTL_MS: 3600000, // 1h
 META_TTL_MS: 604800000, // 7d
 CLEANUP_INTERVAL_MS: 86400000, // 24h
 MAX_PRICE_ENTRIES: 5000,
 CURRENT_CACHE_VERSION: 3
};

// ============================================================
// HELPER EXPORTS
// ============================================================

CacheManager.walletKey = CacheManager.walletKey || function(walletAddr, config) {
 var prefix = (config && config.KEYS && config.KEYS.WALLET_CACHE_PREFIX) || "WALLET_";
 return prefix + String(walletAddr || "").toLowerCase();
};

CacheManager.rpcHealthKey = CacheManager.rpcHealthKey || function(config) {
 var prefix = (config && config.KEYS && config.KEYS.RPC_HEALTH_PREFIX) || "RPC_HEALTH_";
 var chainId = config && config.CHAIN && (config.CHAIN.CHAIN_ID || config.CHAIN.ID);
 var name = config && config.CHAIN && (config.CHAIN.NAME || config.CHAIN.CHAIN_NAME);
 return prefix + String(chainId || name || "UNKNOWN");
};

// ============================================================
// DEBUG: L2 Write Logging (v4.12.19)
// ============================================================

/**
 * Read debug logs from L2 write tracking
 * Run this AFTER refreshing the Base wallet to see what happened
 * @customfunction
 */
function DIAG_READ_L2_DEBUG() {
 var out = [["Timestamp", "Log"]];
 
 try {
 var props = PropertiesService.getScriptProperties();
 var all = props.getProperties();
 var debugKeys = Object.keys(all).filter(function(k) { return k.indexOf("DEBUG_L2_") === 0; });
 
 // Sort by timestamp (newest first)
 debugKeys.sort().reverse();
 
 if (debugKeys.length === 0) {
 out.push(["No debug logs", "Refresh Base wallet first, then run this again"]);
 return out;
 }
 
 for (var i = 0; i < Math.min(10, debugKeys.length); i++) {
 var key = debugKeys[i];
 var ts = key.replace("DEBUG_L2_", "");
 var log = all[key];
 
 out.push([new Date(parseInt(ts)).toISOString().substring(11, 19), log]);
 }
 
 // Cleanup old logs (keep last 5)
 for (var j = 10; j < debugKeys.length; j++) {
 try { props.deleteProperty(debugKeys[j]); } catch (e) {}
 }
 
 } catch (e) {
 out.push(["Error", e.message]);
 }
 
 return out;
}

/**
 * Clear all L2 debug logs
 * @customfunction 
 */
function DIAG_CLEAR_L2_DEBUG() {
 try {
 var props = PropertiesService.getScriptProperties();
 var all = props.getProperties();
 var debugKeys = Object.keys(all).filter(function(k) { return k.indexOf("DEBUG_L2_") === 0; });
 
 for (var i = 0; i < debugKeys.length; i++) {
 props.deleteProperty(debugKeys[i]);
 }
 
 return "Cleared " + debugKeys.length + " debug logs";
 } catch (e) {
 return "Error: " + e.message;
 }
}
