/************************************************************
 * 04D_CACHE_SHEET.gs - Sheet Cache & Diagnostics
 *
 * Version: v4.15.0
 *
 * Cache L2 base sur Google Sheets + fonctions de diagnostic.
 * Contient:
 * - SheetCache (L2 persistent)
 * - Override safeGet/safeSet pour SheetCache
 * - CLEAR_ALL_CACHES
 * - CACHE_HEALTH_CHECK
 * - FIX_CACHE_TIMESTAMPS
 * - Diagnostic functions
 *
 * DEPENDANCES: 04A_CACHE_CORE.gs, 04B_CACHE_WALLET.gs, 04C_CACHE_GLOBAL.gs
 ************************************************************/
var CACHE_SHEET_VERSION = "4.15.0";

// ============================================================
// SHEET CACHE (L2) - Persistent storage in hidden sheet
// ============================================================

var SHEET_CACHE_NAME = "__CACHE__";

var SheetCache = {
 _sheet: null,
 _index: null,
 _loaded: false,

 _getSheet: function() {
 if (this._sheet) return this._sheet;
 var ss = SpreadsheetApp.getActiveSpreadsheet();
 var sh = ss.getSheetByName(SHEET_CACHE_NAME);
 if (!sh) {
 sh = ss.insertSheet(SHEET_CACHE_NAME);
 sh.getRange(1, 1, 1, 5).setValues([
 ["key", "updated_at", "value", "size", "ttl_sec"]
 ]);
 sh.setFrozenRows(1);
 sh.hideSheet();
 }
 this._sheet = sh;
 return sh;
 },

 _ensureIndex: function() {
 if (this._loaded && this._index) return;
 var sh = this._getSheet();
 var last = sh.getLastRow();
 this._index = {};
 if (last <= 1) {
 this._loaded = true;
 return;
 }
 var keys = sh.getRange(2, 1, last - 1, 1).getValues();
 for (var i = 0; i < keys.length; i++) {
 if (keys[i][0]) this._index[String(keys[i][0])] = i + 2;
 }
 this._loaded = true;
 },

 _nowIso: function() {
 return Utilities.formatDate(new Date(), "UTC", "yyyy-MM-dd HH:mm:ss");
 },

 _parseIso: function(s) {
 if (!s) return 0;
 try {
 return new Date(String(s).replace(" ", "T") + "Z").getTime() || 0;
 } catch (e) {
 return 0;
 }
 },

 getRaw: function(key) {
 this._ensureIndex();
 var row = this._index[String(key)];
 if (!row) return null;
 var sh = this._getSheet();
 var v = sh.getRange(row, 2, 1, 4).getValues()[0];
 var ts = this._parseIso(v[0]);
 var ttl = Number(v[3] || 0);
 if (ttl > 0 && ts > 0 && Date.now() - ts > ttl * 1000) return null;
 return v[1] ? String(v[1]) : null;
 },

 getBulk: function(keys) {
 this._ensureIndex();
 var result = {};
 var sh = this._getSheet();
 var last = sh.getLastRow();
 if (last <= 1) return result;

 var data = sh.getRange(2, 1, last - 1, 5).getValues();
 var now = Date.now();
 var keySet = {};
 for (var i = 0; i < keys.length; i++) keySet[keys[i]] = true;

 for (var r = 0; r < data.length; r++) {
 var k = String(data[r][0] || "");
 if (!k || !keySet[k]) continue;
 var ts = this._parseIso(data[r][1]);
 var val = data[r][2];
 var ttl = Number(data[r][4] || 0);
 if (ttl > 0 && ts > 0 && (now - ts) > ttl * 1000) {
 result[k] = null;
 } else {
 result[k] = val ? String(val) : null;
 }
 }
 return result;
 },

 setRaw: function(key, value, ttlSec) {
 this._ensureIndex();
 var sh = this._getSheet();
 var row = this._index[String(key)];
 var now = this._nowIso();
 var size = (value || "").length;
 var ttl = ttlSec || 0;

 if (row) {
 sh.getRange(row, 2, 1, 4).setValues([[now, value, size, ttl]]);
 } else {
 var last = sh.getLastRow();
 sh.getRange(last + 1, 1, 1, 5).setValues([[key, now, value, size, ttl]]);
 this._index[String(key)] = last + 1;
 }
 },

 deleteKey: function(key) {
 this._ensureIndex();
 var row = this._index[String(key)];
 if (!row) return;
 var sh = this._getSheet();
 sh.deleteRow(row);
 delete this._index[String(key)];
 this._loaded = false;
 this._index = null;
 },

 listKeys: function(prefix) {
 this._ensureIndex();
 var out = [];
 for (var k in this._index) {
 if (!prefix || k.indexOf(prefix) === 0) out.push(k);
 }
 return out;
 },

 clear: function() {
 var sh = this._getSheet();
 var last = sh.getLastRow();
 if (last > 1) {
 sh.deleteRows(2, last - 1);
 }
 this._index = {};
 this._loaded = true;
 }
};

function SETUP_SHEET_CACHE() {
 SheetCache._getSheet();
}

// ============================================================
// SHEETCACHE CLEANUP (incremental)
// ============================================================

function SHEETCACHE_CLEANUP(maxRows) {
 var out = [["action", "key", "reason"]];
 try {
 var sh = SheetCache._getSheet();
 var last = sh.getLastRow();
 if (last <= 1) {
 out.push(["NOOP", "", "empty"]);
 return out;
 }

 maxRows = Math.max(10, Math.min(Number(maxRows || 400) || 400, 2000));
 var scanEnd = Math.min(last, 1 + maxRows);
 var data = sh.getRange(2, 1, scanEnd - 1, 5).getValues();
 var now = Date.now();
 var toDelete = [];

 for (var i = 0; i < data.length; i++) {
 var k = String(data[i][0] || "");
 var ts = SheetCache._parseIso(data[i][1]);
 var ttl = Number(data[i][4] || 0);
 if (ttl > 0 && ts > 0 && (now - ts) > ttl * 1000) {
 toDelete.push({ row: i + 2, key: k });
 }
 }

 // Delete from bottom to top
 toDelete.sort(function(a, b) { return b.row - a.row; });
 for (var j = 0; j < toDelete.length; j++) {
 try {
 sh.deleteRow(toDelete[j].row);
 out.push(["DELETED", toDelete[j].key, "expired"]);
 } catch (e) {}
 }

 SheetCache._loaded = false;
 SheetCache._index = null;

 out.push(["SUMMARY", "scanned=" + (scanEnd - 1), "deleted=" + toDelete.length]);
 } catch (e) {
 out.push(["ERROR", "", String(e)]);
 }
 return out;
}

// ============================================================
// CLEAR_ALL_CACHES (unified v4.8.0)
// ============================================================

/**
 * CLEAR_ALL_CACHES - Master cleanup function
 * 
 * @param {boolean} confirm - Must be TRUE
 * @param {boolean} keepGlobalPrices - If TRUE, keep price/FX caches
 * @returns {Array} Results
 * @customfunction
 */
function CLEAR_ALL_CACHES(confirm, keepGlobalPrices) {
 var out = [["Category", "Count", "Size (KB)", "Status"]];
 
 if (confirm !== true) {
 out.push(["", "", "", "Usage: =CLEAR_ALL_CACHES(TRUE)"]);
 out.push(["", "", "", "Or: =CLEAR_ALL_CACHES(TRUE, TRUE) to keep prices"]);
 return out;
 }
 
 try {
 // Reset memory caches
 try {
 if (typeof GlobalPriceCache !== "undefined") GlobalPriceCache._cache = null;
 if (typeof GlobalFxCache !== "undefined") GlobalFxCache._cache = null;
 if (typeof MetaCache !== "undefined") MetaCache._cache = null;
 if (typeof PriceRunCache !== "undefined") {
 if (typeof PriceRunCache.reset === "function") PriceRunCache.reset();
 else { PriceRunCache.dexscreener = {}; PriceRunCache.geckoterminal = {}; PriceRunCache.llama = {}; PriceRunCache.fx = null; }
 }
 if (typeof FxRate !== "undefined") { FxRate._cached = null; FxRate._cachedTs = 0; }
 CacheManager._inited = false;
 CacheManager._props = null;
 CacheManager._cache = null;
 out.push(["Memory Caches", "ALL", "", "RESET"]);
 } catch (eM) {}
 
 CacheManager.init();
 var props = PropertiesService.getScriptProperties();
 var all = props.getProperties();
 
 var categories = {
 "BUDGET": { keys: [], size: 0 },
 "WALLET_CACHE": { keys: [], size: 0 },
 "META": { keys: [], size: 0 },
 "RPC_HEALTH": { keys: [], size: 0 },
 "GLOBAL_PRICE": { keys: [], size: 0 },
 "GLOBAL_FX": { keys: [], size: 0 },
 "WATCHDOG": { keys: [], size: 0 },
 "Other": { keys: [], size: 0 }
 };
 
 for (var key in all) {
 var value = all[key] || "";
 var size = key.length + value.length;
 
 var cat = "Other";
 if (key.indexOf("BUDGET") >= 0) cat = "BUDGET";
 else if (key.indexOf("WALLET_") >= 0 || key.indexOf("_CACHE_WALLET_") >= 0) cat = "WALLET_CACHE";
 else if (key.indexOf("META") >= 0) cat = "META";
 else if (key.indexOf("RPC_HEALTH") >= 0 || key.indexOf("HEALTH") >= 0) cat = "RPC_HEALTH";
 else if (key.indexOf("GLOBAL_PRICE") >= 0 || key === GLOBAL_CACHE_KEYS.GLOBAL_PRICES) cat = "GLOBAL_PRICE";
 else if (key.indexOf("GLOBAL_FX") >= 0 || key === GLOBAL_CACHE_KEYS.GLOBAL_FX) cat = "GLOBAL_FX";
 else if (key.indexOf("WD_") === 0 || key.indexOf("WATCHDOG") >= 0) cat = "WATCHDOG";
 
 categories[cat].keys.push(key);
 categories[cat].size += size;
 }
 
 var totalDeleted = 0;
 var totalFreed = 0;
 
 for (var catName in categories) {
 var catData = categories[catName];
 
 if (keepGlobalPrices && (catName === "GLOBAL_PRICE" || catName === "GLOBAL_FX")) {
 out.push([catName, catData.keys.length, (catData.size / 1024).toFixed(2), "KEPT"]);
 continue;
 }
 
 var catDeleted = 0;
 for (var i = 0; i < catData.keys.length; i++) {
 try {
 props.deleteProperty(catData.keys[i]);
 catDeleted++;
 totalDeleted++;
 totalFreed += catData.size / catData.keys.length;
 } catch (e) {}
 }
 
 out.push([catName, catDeleted, (catData.size / 1024).toFixed(2), catDeleted > 0 ? "DELETED" : "-"]);
 }
 
 out.push(["---", "---", "---", "---"]);
 out.push(["TOTAL", totalDeleted + " keys", (totalFreed / 1024).toFixed(2) + " KB", "SUCCESS"]);
 
 // Clear CacheService
 try {
 var cache = CacheService.getScriptCache();
 var allKeys = Object.keys(all);
 for (var c = 0; c < allKeys.length; c += 100) {
 cache.removeAll(allKeys.slice(c, c + 100));
 }
 } catch (e) {}
 
 } catch (e) {
 out.push(["ERROR", "", "", String(e.message || e)]);
 }
 
 return out;
}

// ============================================================
// CACHE_HEALTH_CHECK (v4.8.0)
// ============================================================

/**
 * CACHE_HEALTH_CHECK - Complete cache diagnostic
 * @returns {Array} Health report
 * @customfunction
 */
function CACHE_HEALTH_CHECK() {
 var out = [["Check", "Result", "Details", "Action"]];
 
 try {
 CacheManager.init();
 var props = CacheManager.getProps();
 var nowSec = Math.floor(Date.now() / 1000);
 var ttlSec = CacheManager._WALLET_TTL_SEC || (14 * 24 * 3600);
 var cutoff = nowSec - ttlSec;
 
 // Check packed wallet cache
 var packed = null;
 try {
 packed = CacheManager._loadPackedWalletCache_();
 } catch (e) {
 out.push(["Packed Cache Load", "ERROR", e.message || String(e), "Run CLEAR_ALL_CACHES(TRUE)"]);
 }
 
 if (packed && packed.m) {
 var totalEntries = 0;
 var noTimestamp = 0;
 var expiredEntries = 0;
 var recentEntries = 0;
 var corruptedEntries = 0;
 var recentCutoff = nowSec - 3600;
 
 Obj.forEach(packed.m, function(h, ent) {
 function checkEntry(e) {
 if (!e || typeof e !== "object") { corruptedEntries++; return; }
 totalEntries++;
 var ts = e.ts || e.t || 0;
 if (!ts || ts <= 0) noTimestamp++;
 else if (ts < cutoff) expiredEntries++;
 else if (ts >= recentCutoff) recentEntries++;
 }
 if (Array.isArray(ent)) {
 for (var i = 0; i < ent.length; i++) checkEntry(ent[i]);
 } else {
 checkEntry(ent);
 }
 });
 
 var packedSize = CacheManager._jsonSizeBytes_(packed);
 
 out.push(["Packed Cache Size", (packedSize / 1024).toFixed(2) + " KB", 
 packedSize > 400000 ? "NEAR LIMIT" : "OK",
 packedSize > 400000 ? "Consider cleanup" : "None"]);
 out.push(["Total Entries", totalEntries, "", "None"]);
 out.push(["Recent (< 1h)", recentEntries, "Protected", "None"]);
 out.push(["No Timestamp", noTimestamp, noTimestamp > 0 ? "PROBLEM" : "OK", 
 noTimestamp > 0 ? "Run FIX_CACHE_TIMESTAMPS(TRUE)" : "None"]);
 out.push(["Expired", expiredEntries, expiredEntries > 0 ? "Pending cleanup" : "OK", "None"]);
 if (corruptedEntries > 0) {
 out.push(["Corrupted", corruptedEntries, "PROBLEM", "CLEAR_ALL_CACHES(TRUE)"]);
 }
 } else {
 out.push(["Packed Cache", "EMPTY", "", "Will rebuild"]);
 }
 
 // ScriptProperties usage
 var allProps = props.getProperties();
 var totalSize = 0;
 var keyCount = 0;
 for (var k in allProps) {
 totalSize += k.length + (allProps[k] || "").length;
 keyCount++;
 }
 
 var usagePct = (totalSize / (500 * 1024)) * 100;
 var usageStatus = usagePct < 50 ? "OK" : (usagePct < 80 ? "WARNING" : "CRITICAL");
 
 out.push(["---", "---", "---", "---"]);
 out.push(["ScriptProperties", keyCount + " keys", (totalSize / 1024).toFixed(2) + " KB", 
 usagePct.toFixed(1) + "% of 500KB"]);
 out.push(["Storage Status", usageStatus, "", usagePct >= 80 ? "CLEAR_ALL_CACHES(TRUE)" : "None"]);
 
 // SheetCache stats
 try {
 var sh = SheetCache._getSheet();
 var lastRow = sh.getLastRow();
 out.push(["SheetCache", (lastRow - 1) + " rows", "", "None"]);
 } catch (e) {}
 
 // Overall
 out.push(["---", "---", "---", "---"]);
 var issues = [];
 if (noTimestamp > 0) issues.push("timestamps");
 if (usagePct >= 80) issues.push("storage");
 if (corruptedEntries > 0) issues.push("corruption");
 
 out.push(["OVERALL", issues.length === 0 ? "[OK] HEALTHY" : "[!] ISSUES", 
 issues.length > 0 ? issues.join(", ") : "All checks passed", ""]);
 
 } catch (e) {
 out.push(["FATAL ERROR", e.message || String(e), "", ""]);
 }
 
 return out;
}

// ============================================================
// FIX_CACHE_TIMESTAMPS (v4.8.0)
// ============================================================

/**
 * FIX_CACHE_TIMESTAMPS - Repair entries without valid timestamp
 * @param {boolean} confirm - Must be TRUE
 * @returns {Array} Results
 * @customfunction
 */
function FIX_CACHE_TIMESTAMPS(confirm) {
 if (confirm !== true) {
 return [
 ["Usage", "=FIX_CACHE_TIMESTAMPS(TRUE)"],
 ["", ""],
 ["Impact", "Entries without timestamp will get current time"],
 ["", "This protects them from premature deletion"]
 ];
 }
 
 var out = [["Action", "Count", "Details"]];
 
 try {
 CacheManager.init();
 var packed = CacheManager._loadPackedWalletCache_();
 
 if (!packed || !packed.m) {
 out.push(["ERROR", 0, "Packed cache empty or corrupted"]);
 return out;
 }
 
 var nowSec = Math.floor(Date.now() / 1000);
 var fixed = 0;
 var total = 0;
 
 Obj.forEach(packed.m, function(h, ent) {
 function fixEntry(e) {
 if (!e || typeof e !== "object") return;
 total++;
 var ts = e.ts || e.t || 0;
 if (!ts || ts <= 0) {
 e.ts = nowSec;
 fixed++;
 }
 }
 if (Array.isArray(ent)) {
 for (var i = 0; i < ent.length; i++) fixEntry(ent[i]);
 } else {
 fixEntry(ent);
 }
 });
 
 if (fixed > 0) {
 CacheManager._savePackedWalletCache_(packed);
 out.push(["FIXED", fixed, "Timestamps repaired"]);
 } else {
 out.push(["OK", 0, "No entries to repair"]);
 }
 out.push(["TOTAL", total, "Entries checked"]);
 
 } catch (e) {
 out.push(["ERROR", 0, e.message || String(e)]);
 }
 
 return out;
}

// ============================================================
// GET_STORAGE_STATS (v4.8.0)
// ============================================================

/**
 * GET_STORAGE_STATS - Detailed storage breakdown
 * @returns {Array} Storage statistics
 * @customfunction
 */
function GET_STORAGE_STATS() {
 var out = [["Category", "Count", "Size (KB)", "% Quota", "Sample Keys"]];
 var QUOTA_KB = 500;
 
 try {
 var props = PropertiesService.getScriptProperties();
 var all = props.getProperties();
 var keys = Object.keys(all);
 
 var categories = {
 'WALLET_CACHE': { count: 0, size: 0, keys: [] },
 'PRICE_CACHE': { count: 0, size: 0, keys: [] },
 'META_CACHE': { count: 0, size: 0, keys: [] },
 'RPC_HEALTH': { count: 0, size: 0, keys: [] },
 'BUDGET': { count: 0, size: 0, keys: [] },
 'FX_RATE': { count: 0, size: 0, keys: [] },
 'WATCHDOG': { count: 0, size: 0, keys: [] },
 'INDEX': { count: 0, size: 0, keys: [] },
 'OTHER': { count: 0, size: 0, keys: [] }
 };
 
 var totalSize = 0;
 
 for (var i = 0; i < keys.length; i++) {
 var key = keys[i];
 var value = all[key] || '';
 var size = key.length + value.length;
 totalSize += size;
 
 var cat = 'OTHER';
 if (key.indexOf('WALLET') >= 0 && key.indexOf('CACHE') >= 0) cat = 'WALLET_CACHE';
 else if (key.indexOf('PRICE') >= 0) cat = 'PRICE_CACHE';
 else if (key.indexOf('META') >= 0) cat = 'META_CACHE';
 else if (key.indexOf('RPC_HEALTH') >= 0) cat = 'RPC_HEALTH';
 else if (key.indexOf('BUDGET') >= 0) cat = 'BUDGET';
 else if (key.indexOf('FX') >= 0) cat = 'FX_RATE';
 else if (key.indexOf('WD_') === 0) cat = 'WATCHDOG';
 else if (key.indexOf('INDEX') >= 0) cat = 'INDEX';
 
 categories[cat].count++;
 categories[cat].size += size;
 if (categories[cat].keys.length < 2) categories[cat].keys.push(key.substring(0, 30));
 }
 
 var catNames = Object.keys(categories).sort(function(a, b) {
 return categories[b].size - categories[a].size;
 });
 
 for (var c = 0; c < catNames.length; c++) {
 var name = catNames[c];
 var data = categories[name];
 if (data.count === 0) continue;
 
 var sizeKb = (data.size / 1024).toFixed(2);
 var pct = ((data.size / (QUOTA_KB * 1024)) * 100).toFixed(1);
 var samples = data.keys.join(", ");
 if (data.count > 2) samples += " (+" + (data.count - 2) + ")";
 
 out.push([name, data.count, sizeKb, pct + "%", samples]);
 }
 
 out.push(['---', '---', '---', '---', '---']);
 var usagePct = (totalSize / (QUOTA_KB * 1024)) * 100;
 out.push(['TOTAL', keys.length, (totalSize / 1024).toFixed(2), usagePct.toFixed(1) + "%", 
 usagePct >= 80 ? "[!] HIGH" : "[OK]"]);
 
 // SheetCache
 try {
 var sh = SheetCache._getSheet();
 var lastRow = sh.getLastRow();
 if (lastRow > 1) {
 out.push(['SHEETCACHE', lastRow - 1 + " rows", "N/A", "Unlimited", ""]);
 }
 } catch (e) {}
 
 } catch (e) {
 out.push(['ERROR', '', '', '', String(e.message || e)]);
 }
 
 return out;
}

// ============================================================
// DEBUG HELPERS
// ============================================================

function DEBUG_TOP_PROPERTIES(n) {
 var topN = Math.max(1, Math.min(Number(n || 20) || 20, 100));
 var out = [["Key", "Size (KB)", "Preview"]];
 
 try {
 var props = PropertiesService.getScriptProperties();
 var all = props.getProperties();
 var arr = [];
 
 for (var k in all) {
 var v = all[k] || "";
 arr.push({ key: k, size: k.length + v.length, preview: v.substring(0, 50) });
 }
 
 arr.sort(function(a, b) { return b.size - a.size; });
 
 for (var i = 0; i < Math.min(topN, arr.length); i++) {
 out.push([arr[i].key, (arr[i].size / 1024).toFixed(2), arr[i].preview + "..."]);
 }
 } catch (e) {
 out.push(["ERROR", "", e.message || String(e)]);
 }
 
 return out;
}

function LIST_CACHE_KEYS(prefix) {
 var out = { props: [], sheetcache: [], index: [] };
 
 try {
 if (typeof CacheManager !== 'undefined' && CacheManager.indexList) {
 out.index = CacheManager.indexList();
 }
 } catch (e) {}
 
 try {
 var props = PropertiesService.getScriptProperties();
 var all = props.getProperties() || {};
 for (var k in all) {
 if (prefix && k.indexOf(prefix) !== 0) continue;
 if (k.indexOf('CACHE') >= 0 || k.indexOf('PRICE') >= 0 || k.indexOf('META') >= 0 || 
 k.indexOf('FX') >= 0 || k.indexOf('BUDGET') >= 0 || k.indexOf('WD_') === 0) {
 out.props.push(k);
 }
 }
 } catch (e) {}
 
 try {
 if (typeof SheetCache !== 'undefined' && SheetCache.listKeys) {
 out.sheetcache = SheetCache.listKeys(prefix || '');
 }
 } catch (e) {}
 
  out.props.sort();
  out.sheetcache.sort();
  out.index.sort();
  
  return out;
}

function DIAG_STORAGE_BREAKDOWN() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var keys = Object.keys(all);
  var total = 0;
  var byPrefix = {};
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var v = all[k] || "";
    var sz = k.length + v.length;
    total += sz;
    var prefix = "OTHER";
    if (k === "GLOBAL_WALLET_CACHE_V1") prefix = "GLOBAL_WALLET_CACHE_V1";
    else if (/^OUTSNAP_/.test(k)) prefix = "OUTSNAP_*";
    else if (/^WCORE_HTTP_/.test(k)) prefix = "WCORE_HTTP_*";
    else if (/^WCORE_ERROR_RETRY_/.test(k)) prefix = "WCORE_ERROR_RETRY_*";
    else if (/^WCORE_WD_/.test(k)) prefix = "WCORE_WD_*";
    else if (/^WCORE_AUTO_HEAL_/.test(k)) prefix = "WCORE_AUTO_HEAL_*";
    else if (/^CK_/.test(k)) prefix = "CK_*";
    else if (/^(BITPANDA|BINANCE|BITFINEX|BYBIT|COINBASE|OKX)_/.test(k)) prefix = "CEX_*";
    else if (/^attemptTsMap_/.test(k)) prefix = "attemptTsMap_*";
    else if (/^RPC_HEALTH/.test(k)) prefix = "RPC_HEALTH_*";
    else if (/^FX_/.test(k)) prefix = "FX_*";
    else if (/^DYN_RPC/.test(k)) prefix = "DYN_RPC_*";
    else if (/^GLOBAL_PRICE/.test(k)) prefix = "GLOBAL_PRICE_*";
    else if (/^BUDGET/.test(k)) prefix = "BUDGET_*";
    else if (/^WALLET/.test(k) && /CACHE/.test(k)) prefix = "WALLET_CACHE_*";
    else if (/^PHASE_C/.test(k)) prefix = "PHASE_C_*";
    
    if (!byPrefix[prefix]) byPrefix[prefix] = { count: 0, size: 0, sample: k.substring(0, 50) };
    byPrefix[prefix].count++;
    byPrefix[prefix].size += sz;
  }

  var QUOTA_KB = 500;
  console.log(JSON.stringify({ totalKeys: keys.length, totalKB: (total / 1024).toFixed(2), pct: ((total / (QUOTA_KB * 1024)) * 100).toFixed(1) + "%" }));

  var sorted = Object.keys(byPrefix).sort(function(a, b) { return byPrefix[b].size - byPrefix[a].size; });
  for (var j = 0; j < sorted.length; j++) {
    var p = sorted[j];
    var d = byPrefix[p];
    console.log(p + " count=" + d.count + " KB=" + (d.size / 1024).toFixed(2) + " pct=" + ((d.size / (QUOTA_KB * 1024)) * 100).toFixed(1) + "% sample=" + d.sample);
  }
  // Dump all OTHER keys individually for diagnosis
  var otherKeys = [];
  for (var i2 = 0; i2 < keys.length; i2++) {
    var k2 = keys[i2];
    var v2 = all[k2] || "";
    var prefix2 = "OTHER";
    if (k2 === "GLOBAL_WALLET_CACHE_V1") prefix2 = "GLOBAL_WALLET_CACHE_V1";
    else if (/^OUTSNAP_/.test(k2)) prefix2 = "OUTSNAP_*";
    else if (/^WCORE_HTTP_/.test(k2)) prefix2 = "WCORE_HTTP_*";
    else if (/^WCORE_ERROR_RETRY_/.test(k2)) prefix2 = "WCORE_ERROR_RETRY_*";
    else if (/^WCORE_WD_/.test(k2)) prefix2 = "WCORE_WD_*";
    else if (/^WCORE_AUTO_HEAL_/.test(k2)) prefix2 = "WCORE_AUTO_HEAL_*";
    else if (/^CK_/.test(k2)) prefix2 = "CK_*";
    else if (/^(BITPANDA|BINANCE|BITFINEX|BYBIT|COINBASE|OKX)_/.test(k2)) prefix2 = "CEX_*";
    else if (/^attemptTsMap_/.test(k2)) prefix2 = "attemptTsMap_*";
    else if (/^RPC_HEALTH/.test(k2)) prefix2 = "RPC_HEALTH_*";
    else if (/^FX_/.test(k2)) prefix2 = "FX_*";
    else if (/^DYN_RPC/.test(k2)) prefix2 = "DYN_RPC_*";
    else if (/^GLOBAL_PRICE/.test(k2)) prefix2 = "GLOBAL_PRICE_*";
    else if (/^BUDGET/.test(k2)) prefix2 = "BUDGET_*";
    else if (/^WALLET/.test(k2) && /CACHE/.test(k2)) prefix2 = "WALLET_CACHE_*";
    else if (/^PHASE_C/.test(k2)) prefix2 = "PHASE_C_*";
    if (prefix2 === "OTHER") otherKeys.push({ key: k2, size: k2.length + v2.length, preview: v2.substring(0, 80) });
  }
  otherKeys.sort(function(a, b) { return b.size - a.size; });
  console.log("--- OTHER keys (" + otherKeys.length + ") ---");
  for (var j2 = 0; j2 < otherKeys.length; j2++) {
    var o = otherKeys[j2];
    console.log(o.key + " KB=" + (o.size / 1024).toFixed(2) + " preview=" + o.preview);
  }
  return "OK total=" + (total / 1024).toFixed(1) + "KB keys=" + keys.length;
}

function CLEAN_OBSOLETE_PROPERTIES() {
  var props = PropertiesService.getScriptProperties();
  var toDelete = [];
  // v4.15.100: RPC lookup now memory-only, old ScriptProperties key is wasted quota
  toDelete.push("ACTIVITY_RPC_LOOKUP");
  // Stale HTTP category tracker from Feb 2026
  toDelete.push("HTTP_CATEGORY_TRACKER_v1");
  toDelete.push("HTTP_CATEGORY_DATE_v1");
  // Purge excess OUTSNAP_* keys (keep most recent 15, delete all others)
  var all = props.getProperties();
  var snaps = [];
  for (var k in all) {
    if (k.indexOf("OUTSNAP_") !== 0) continue;
    var ts = 0;
    try { ts = JSON.parse(all[k] || "{}").ts || 0; } catch (eP) {}
    snaps.push({ k: k, ts: ts });
  }
  snaps.sort(function(a, b) { return b.ts - a.ts; });
  var MAX_SNAPS = 15;
  for (var s = MAX_SNAPS; s < snaps.length; s++) { toDelete.push(snaps[s].k); }
  var deleted = [];
  for (var i = 0; i < toDelete.length; i++) {
    try {
      if (props.getProperty(toDelete[i]) !== null) {
        props.deleteProperty(toDelete[i]);
        deleted.push(toDelete[i]);
      }
    } catch (e) { Logger.log("CLEAN: error deleting " + toDelete[i] + ": " + e); }
  }
  // Also trigger emergency purge for remaining cleanup
  try {
    if (typeof CacheManager !== "undefined" && CacheManager._emergencyPurge_) {
      CacheManager._emergencyPurge_(81920);
    }
  } catch (e2) {}
  return "Deleted " + deleted.length + " keys: " + deleted.join(", ");
}

