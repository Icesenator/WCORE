/************************************************************
 * 04A_CACHE_CORE.gs - Cache Manager Core
 * 
 * Version: v4.15.103 - Virtual wallet reads prefer authoritative packed L2 over stale per-key L1.
 *
 * v4.15.102 - safeSetJson propagates the real persistence result.
 * v4.15.101 - Emergency purge: protect active watchdog and auto-heal leases.
 *
 * v4.15.100 - Emergency purge: add ACTIVITY_RPC_LOOKUP/NONCE_MAP, stale HTTP_CATEGORY_TRACKER, ACTIVITY_NONCE_MAP
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
var CACHE_CORE_VERSION = "4.15.103";

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
 
 // Virtualized wallet keys: packed cache is authoritative. Its GLOBAL_WALLET
 // blob already has its own L1; a separate per-key L1 can be overwritten by a
 // stale concurrent worker after a fresh web scan and must never short-circuit L2.
 if (CacheManager._isVirtualKey_ && CacheManager._isVirtualKey_(key)) {
 try {
 if (CacheManager._packedGet_) {
 var packed = CacheManager._packedGet_(key);
 if (packed !== null && packed !== undefined) return packed;
 }
 } catch (e2) {}
 return null;
 }

 // Non-virtualized keys: try L1 (CacheService) first.
 try {
 var v = CacheManager._cache.get(key);
 if (v !== null && v !== undefined) return v;
 } catch (e) {}
 
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
 // v4.16.68 : journal uniquement ; plus de cle DEBUG_L2_<ts> par ecriture
 // (famille non bornee, jamais purgee avant ce correctif).
 try { Logger.log("[DEBUG_L2] " + _debugLog.join("|")); } catch (eLog) {}
 }
 return l2Result;
 } else {
 if (_debugL2) _debugLog.push("_packedPut_=UNDEFINED!");
 }
 } catch (e2) {
 if (_debugL2) {
 _debugLog.push("L2=EXCEPTION:" + e2.message);
 try { Logger.log("[DEBUG_L2] " + _debugLog.join("|")); } catch (eLog) {}
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
 return CacheManager.safeSet(key, JSON.stringify(obj || null), ttlSeconds) === true;
 } catch (e) { return false; }
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

// v4.16.68 (STORAGE_LOCAL_RECOVERY) : quota et classification des familles
// ScriptProperties. Une seule source de verite pour la purge et le diagnostic.
CacheManager._STORAGE_QUOTA_BYTES = 500 * 1024;

/**
 * Lecture unique du store : { all, total }. Un seul getProperties() global.
 * Les appelants qui purgent passent ce snapshot a _emergencyPurge_ pour ne
 * pas relire le store (la purge le met a jour en place).
 */
CacheManager._storageSnapshot_ = function() {
 try {
 CacheManager.init();
 var all = CacheManager._props.getProperties() || {};
 var total = 0;
 for (var k in all) total += k.length + String(all[k] || "").length;
 return { all: all, total: total };
 } catch (e) { return null; }
};

/**
 * v4.16.68 : purge restreinte aux familles jetables/reconstructibles.
 * - targetBytes : octets a liberer (au minimum total - (QUOTA - 40 Ko), comme avant).
 * - snapshot (optionnel) : { all, total } deja lu ; evite un getProperties()
 *   supplementaire et est mis a jour en place.
 * - targetBytes = { classifierOnly: true } : renvoie le classifieur, sans aucune
 *   lecture ni ecriture (source unique pour DIAG_STORAGE_FAMILIES). La fonction
 *   reste autonome car des tests l'extraient seule du fichier.
 * Ne supprime JAMAIS une famille protegee (tier 0) : nonces, etat watchdog,
 * compteurs HTTP actifs, packed wallet, caches wallet, prix, etat CEX.
 * Retour : true si des octets ont ete liberes (ou rien a faire), false sinon.
 */
CacheManager._emergencyPurge_ = CacheManager._emergencyPurge_ || function(targetBytes, snapshot) {
 // Classe une cle. tier 0 = PROTEGEE (jamais purgee) ; tier >= 1 = purgeable,
 // dans l'ordre croissant. Familles protegees : observations financieres
 // (packed, caches wallet, prix), nonces, compteurs HTTP non expires, etat de
 // recuperation watchdog / auto-heal / file d'activite, etat CEX et secrets.
 function classify_(k, v, nowMs) {
 k = String(k || "");
 nowMs = nowMs || Date.now();
 function httpDayExpired(key) {
 var m = /^WCORE_HTTP_(?:DAY|HOST|TRIGGER|T0|MILE)_(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(key);
 if (!m) return false;
 var start = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 9);
 return isFinite(start) && nowMs >= start + 2 * 24 * 3600000;
 }
 // --- Jetables / diagnostiques (tier 1) : jamais lus par une decision metier.
 if (k.indexOf("DEBUG_L2_") === 0) return { fam: "DEBUG_L2", tier: 1, prio: 1 };
 if (k.indexOf("GSHEET_WEB_SCAN_LAST_ERROR") === 0) return { fam: "WEB_SCAN_ERRORS", tier: 1, prio: 2 };
 if (k === "WCORE_WD_LAST_DIAG" || k === "WCORE_WD_TRIGGER_SNAPSHOT" || k === "WCORE_AUTO_HEAL_LAST_RESULT" ||
 k === "WCORE_SS_OPEN_ERR" || k === "CACHE_OPTIMIZER_STATS_v1" || k === "PRICING_WORKER_STATS" || k === "TEST_KEY" ||
 k === "HTTP_CATEGORY_TRACKER_v1" || k === "HTTP_CATEGORY_DATE_v1" || k === "ACTIVITY_RPC_LOOKUP") {
 return { fam: "DIAGNOSTIC", tier: 1, prio: 3 };
 }
 // --- Compteurs HTTP : proteges tant que non expires (fenetre 2 jours).
 if (k.indexOf("WCORE_HTTP_") === 0) return httpDayExpired(k) ? { fam: "HTTP_COUNTERS_EXPIRED", tier: 2, prio: 5 } : { fam: "HTTP_COUNTERS", tier: 0 };
 if (k.indexOf("OUTSNAP_") === 0) return { fam: "OUTSNAP", tier: 2, prio: 8 };
 // --- Etat de recuperation : demandes de refresh recentes protegees.
 if (k.indexOf("ACTIVITY_FORCE_") === 0) {
 var reqAt = 0;
 try { reqAt = Number(JSON.parse(v || "{}").requestedAt || 0); } catch (eAF) { reqAt = 0; }
 return (!reqAt || (nowMs - reqAt) > 7200000) ? { fam: "ACTIVITY_FORCE_EXPIRED", tier: 2, prio: 12 } : { fam: "RECOVERY_STATE", tier: 0 };
 }
 if (k === "ACTIVITY_NONCE_MAP") return { fam: "NONCES", tier: 0 };
 if (k === GLOBAL_CACHE_KEYS.GLOBAL_WALLET || k === "GLOBAL_WALLET_CACHE_V1") return { fam: "PACKED_WALLET", tier: 0 };
 if (k === GLOBAL_CACHE_KEYS.GLOBAL_PRICES || k === "GLOBAL_PRICE_CACHE_V2") return { fam: "GLOBAL_PRICES", tier: 0 };
 if (k === "ACTIVITY_PENDING_REFRESH" || k.indexOf("WD_") === 0 || k.indexOf("WATCHDOG") >= 0 ||
 k.indexOf("WCORE_WD_") === 0 || k.indexOf("WCORE_AUTO_HEAL_") === 0 || k.indexOf("WCORE_ERROR_RETRY_") === 0 ||
 k.indexOf("WCORE_RECOVERY_") === 0 || k.indexOf("WCORE_TRIGGER_REPAIR_LAST_") === 0 || k.indexOf("WCORE_QCB_") === 0 ||
 k.indexOf("_LEASE") >= 0 || k.indexOf("_LOCK") >= 0) {
 return { fam: "RECOVERY_STATE", tier: 0 };
 }
 if (k.indexOf("WALLET_") >= 0 || k.indexOf("_CACHE_WALLET_") >= 0) return { fam: "WALLET_CACHE", tier: 0 };
 // Chaine retiree : jamais rafraichie, son cache paraitrait toujours le plus ancien ;
 // conserve comme preuve (fonds potentiellement recuperables), jamais purge pour la place.
 if (k.indexOf("_CACHE_") > 0 && typeof _wcoreRemovedChain_ === "function" && _wcoreRemovedChain_(k.split("_CACHE_")[0])) return { fam: "RETIRED_CHAIN_EVIDENCE", tier: 0 };
 // --- Reconstructibles (tier 3) : stats/sante/metadonnees, regenerees au cycle suivant.
 if (k.indexOf("_DYNAMIC_BUDGET_STATS_") >= 0) return { fam: "BUDGET_STATS", tier: 3, prio: 10 };
 if (k.indexOf("BUDGET_") === 0 || k.indexOf("_BUDGET_") >= 0) return { fam: "BUDGET_STATS", tier: 3, prio: 20 };
 if (k.indexOf("RPC_HEALTH") >= 0) return { fam: "RPC_HEALTH", tier: 3, prio: 30 };
 if (k.indexOf("META") >= 0) return { fam: "META", tier: 3, prio: 50 };
 if (k.indexOf("_CACHE_") >= 0 && k.indexOf("GLOBAL_") < 0) return { fam: "OTHER_CACHE", tier: 3, prio: 60 };
 // --- Tout le reste (CEX, Kraken, secrets, configuration, marqueurs) : protege.
 if (/^(KRAKEN|BINANCE|BITFINEX|BITPANDA|BYBIT|COINBASE|OKX|CEX)_/.test(k) || k.indexOf("CRYPTO_CEX_") === 0) return { fam: "CEX_STATE_AND_SECRETS", tier: 0 };
 return { fam: "OTHER", tier: 0 };
 }
 if (targetBytes && typeof targetBytes === "object" && targetBytes.classifierOnly) return classify_;

 try {
 CacheManager.init();
 var props = CacheManager._props;
 if (!props) return false;

 var snap = (snapshot && snapshot.all) ? snapshot : null;
 if (!snap) {
 var all0 = props.getProperties() || {};
 var total0 = 0;
 for (var k0 in all0) total0 += k0.length + String(all0[k0] || "").length;
 snap = { all: all0, total: total0 };
 }
 var all = snap.all;
 var keys = Object.keys(all);
 var nowMs = Date.now();
 var total = snap.total;

 var QUOTA = CacheManager._STORAGE_QUOTA_BYTES || (500 * 1024);
 var TARGET = QUOTA - 40 * 1024;
 var need = Math.max(targetBytes || 0, (total > TARGET ? (total - TARGET) : 0));
 CacheManager._lastPurgeFreedBytes = 0;
 if (need <= 0) return true;

 // v4.16.68 : liste blanche de familles purgeables, dans l'ordre :
 // tier 1 jetables (DEBUG_L2, erreurs web scan, diagnostics) > tier 2 expires
 // (HTTP > 2 j, OUTSNAP, ACTIVITY_FORCE > 2 h) > tier 3 reconstructibles
 // (budget stats, RPC_HEALTH, META, autres caches). Les anciens tiers 15/16/40/47/55/90
 // (file d'activite, WD_*, ACTIVITY_NONCE_MAP, prix globaux, wallets) sont retires :
 // les purger relancait la decouverte de wallets et remettait le watchdog a zero.
 var cands = [];
 for (var j = 0; j < keys.length; j++) {
 var kk = keys[j];
 if (!kk) continue;
 var cls = classify_(kk, all[kk], nowMs);
 if (!cls || !cls.tier) continue;
 cands.push({ k: kk, size: kk.length + String(all[kk] || "").length, prio: cls.tier * 100 + (cls.prio || 0) });
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
 delete all[cands[x].k];
 snap.total -= cands[x].size;
 } catch (eDel) {}
 }

 try {
 if (deletedKeys.length) CacheService.getScriptCache().removeAll(deletedKeys);
 } catch (eC) {}

 CacheManager._lastPurgeFreedBytes = freed;
 if (deletedKeys.length) {
 try { console.log("[Storage purge] freed=" + freed + "B keys=" + deletedKeys.length + " need=" + need + "B (familles protegees intactes)"); } catch (eLog) {}
 }
 return freed > 0;
 } catch (e) {
 return false;
 }
};

// Classifieur partage (meme source que la purge) ; aucune E/S.
CacheManager._storageClassify_ = function(k, v, nowMs) {
 return CacheManager._emergencyPurge_({ classifierOnly: true })(k, v, nowMs);
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

/**
 * v4.16.68 : repartition du stockage ScriptProperties par famille.
 * LECTURE SEULE : exactement un getProperties(), aucune ecriture, aucune
 * suppression, aucun appel HTTP. N'expose jamais de valeur ni de nom de cle
 * individuel (secrets, adresses) : seulement familles, nombres et tailles.
 * @customfunction
 */
function DIAG_STORAGE_FAMILIES() {
 var out = [["Famille", "Cles", "Octets", "% quota", "Purge"]];
 try {
 CacheManager.init();
 var all = CacheManager._props.getProperties() || {};
 var QUOTA = CacheManager._STORAGE_QUOTA_BYTES || (500 * 1024);
 var nowMs = Date.now();
 var fams = {};
 var total = 0;
 var packedRaw = null;
 for (var k in all) {
 var v = String(all[k] || "");
 var size = k.length + v.length;
 total += size;
 var cls = CacheManager._storageClassify_(k, v, nowMs) || { fam: "OTHER", tier: 0 };
 var f = fams[cls.fam] || (fams[cls.fam] = { n: 0, b: 0, tier: cls.tier });
 f.n++;
 f.b += size;
 if (cls.fam === "PACKED_WALLET") packedRaw = v;
 }
 var names = Object.keys(fams).sort(function(a, b) { return fams[b].b - fams[a].b; });
 for (var i = 0; i < names.length; i++) {
 var fx = fams[names[i]];
 out.push([names[i], fx.n, fx.b, Math.round(fx.b / QUOTA * 1000) / 10, fx.tier ? ("tier " + fx.tier) : "PROTEGEE"]);
 }
 out.push(["TOTAL", Object.keys(all).length, total, Math.round(total / QUOTA * 1000) / 10, "libre=" + (QUOTA - total)]);
 if (packedRaw) {
 try {
 var p = JSON.parse(packedRaw);
 var nEnt = 0, nBal = 0, bBal = 0, bNoBal = 0;
 var m = (p && p.m) || {};
 for (var h in m) {
 var ents = Array.isArray(m[h]) ? m[h] : [m[h]];
 for (var e = 0; e < ents.length; e++) {
 var sz = JSON.stringify(ents[e] || null).length;
 nEnt++;
 if (CacheManager._packedEntryHasPositiveBalance_ && CacheManager._packedEntryHasPositiveBalance_(ents[e])) { nBal++; bBal += sz; }
 else bNoBal += sz;
 }
 }
 out.push(["PACKED_ENTRIES_WITH_BALANCE", nBal, bBal, Math.round(bBal / QUOTA * 1000) / 10, "jamais evincees"]);
 out.push(["PACKED_ENTRIES_NO_BALANCE", nEnt - nBal, bNoBal, Math.round(bNoBal / QUOTA * 1000) / 10, "evincables (UNKNOWN)"]);
 out.push(["PACKED_SOFT_CAP", "", CacheManager._PACKED_CACHE_MAX_BYTES || "", "", ""]);
 } catch (eP) {
 out.push(["PACKED_PARSE_ERROR", "", "", "", String(eP && eP.message || eP).substring(0, 80)]);
 }
 }
 } catch (e) {
 out.push(["ERROR", "", "", "", String(e && e.message || e).substring(0, 120)]);
 }
 return out;
}
