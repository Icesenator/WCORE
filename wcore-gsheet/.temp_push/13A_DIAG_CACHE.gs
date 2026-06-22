/************************************************************
 * 13A_DIAG_CACHE.gs - Cache diagnostics (consolidated)
 * 
 * Version: v4.12.9 (cleanup)
 * 
 * CONSOLIDATED FROM:
 * - DIAG_CACHE_L1.gs
 * - DIAG_CACHE_META.gs 
 * - DIAG_CACHE_QUICK.gs
 * - DIAG_CACHE_SOURCE.gs
 * - DIAG_FIND_WALLET_KEY.gs
 * - DIAG_PACKED_L2_WRITE.gs
 * - DIAG_WALLET_CACHE_COMPARE.gs
 ************************************************************/


// ============================================================
// FROM: DIAG_CACHE_L1.gs
// ============================================================
function DIAG_CACHE_L1_DIRECT(wallet) {
 var out = [["Source", "Key", "Result", "Details"]];
 
 try {
 wallet = String(wallet || "").toLowerCase().trim();
 if (!wallet) {
 return [["ERROR", "Missing wallet", "", ""]];
 }
 
 out.push(["Wallet", wallet.substring(0, 15) + "...", "", ""]);
 out.push(["", "", "", ""]);
 
 // Get config pour trouver le prefix
 var config = null;
 var prefix = "";
 if (typeof _BASE !== 'undefined' && _BASE.getConfig) {
 config = _BASE.getConfig();
 prefix = (config.KEYS && config.KEYS.PREFIX) ? config.KEYS.PREFIX : "";
 }
 
 out.push(["Config prefix", prefix || "(empty)", "", ""]);
 
 // Construire les cles possibles
 var possibleKeys = [
 prefix + "WALLET_" + wallet, // BASE_CACHE_WALLET_0x...
 "WALLET_" + wallet, // WALLET_0x...
 "WALLET_CACHE_" + wallet, // WALLET_CACHE_0x...
 prefix + "CACHE_WALLET_" + wallet, // BASE_CACHE_CACHE_WALLET_0x... (peu probable)
 "BASE_WALLET_" + wallet, // BASE_WALLET_0x...
 "BASE_CACHE_WALLET_" + wallet // BASE_CACHE_WALLET_0x...
 ];
 
 out.push(["", "", "", ""]);
 out.push(["=== Checking CacheService (L1) ===", "", "", ""]);
 
 var cache = CacheService.getScriptCache();
 var foundInL1 = null;
 
 for (var i = 0; i < possibleKeys.length; i++) {
 var key = possibleKeys[i];
 var value = null;
 try {
 value = cache.get(key);
 } catch (e) {}
 
 if (value) {
 out.push(["L1 FOUND!", key.substring(0, 40) + "...", value.length + " chars", ""]);
 foundInL1 = { key: key, value: value };
 
 // Parse and show content
 try {
 var parsed = JSON.parse(value);
 var assets = parsed.a || parsed.assets || [];
 var updatedAt = parsed.u || parsed.updatedAt || 0;
 out.push([" assets", assets.length, "", ""]);
 out.push([" updatedAt", updatedAt, updatedAt ? new Date(updatedAt).toISOString() : "", ""]);
 } catch (e) {
 out.push([" parse error", e.message, "", ""]);
 }
 } else {
 out.push(["L1", key.substring(0, 35) + "...", "NOT FOUND", ""]);
 }
 }
 
 out.push(["", "", "", ""]);
 out.push(["=== Checking ScriptProperties (L2) ===", "", "", ""]);
 
 var props = PropertiesService.getScriptProperties();
 var foundInL2 = null;
 
 for (var j = 0; j < possibleKeys.length; j++) {
 var key2 = possibleKeys[j];
 var value2 = null;
 try {
 value2 = props.getProperty(key2);
 } catch (e) {}
 
 if (value2) {
 out.push(["L2 FOUND!", key2.substring(0, 40) + "...", value2.length + " chars", ""]);
 foundInL2 = { key: key2, value: value2 };
 
 // Parse and show content
 try {
 var parsed2 = JSON.parse(value2);
 var assets2 = parsed2.a || parsed2.assets || [];
 var updatedAt2 = parsed2.u || parsed2.updatedAt || 0;
 out.push([" assets", assets2.length, "", ""]);
 out.push([" updatedAt", updatedAt2, updatedAt2 ? new Date(updatedAt2).toISOString() : "", ""]);
 } catch (e) {
 out.push([" parse error", e.message, "", ""]);
 }
 } else {
 out.push(["L2", key2.substring(0, 35) + "...", "NOT FOUND", ""]);
 }
 }
 
 // Check packed cache
 out.push(["", "", "", ""]);
 out.push(["=== Checking Packed Cache ===", "", "", ""]);
 
 var packedKey = "GLOBAL_WALLET_CACHE_V1";
 var packedRaw = null;
 
 // L1
 try {
 packedRaw = cache.get(packedKey);
 if (packedRaw) {
 out.push(["Packed L1", packedKey, packedRaw.length + " chars", ""]);
 } else {
 out.push(["Packed L1", packedKey, "NOT FOUND", ""]);
 }
 } catch (e) {
 out.push(["Packed L1", "ERROR", e.message, ""]);
 }
 
 // L2
 try {
 var packedL2 = props.getProperty(packedKey);
 if (packedL2) {
 out.push(["Packed L2", packedKey, packedL2.length + " chars", ""]);
 
 // Try to find our wallet in packed
 var packed = JSON.parse(packedL2);
 var walletHash = _simpleHash(wallet);
 var fullKeyHash = _simpleHash(prefix + "WALLET_" + wallet);
 
 out.push([" wallet hash", walletHash, "", ""]);
 out.push([" fullkey hash", fullKeyHash, "", ""]);
 
 if (packed.m && (packed.m[walletHash] || packed.m[fullKeyHash])) {
 out.push([" wallet in packed", "FOUND!", "", ""]);
 } else {
 out.push([" wallet in packed", "NOT FOUND", "", ""]);
 }
 } else {
 out.push(["Packed L2", packedKey, "NOT FOUND", ""]);
 }
 } catch (e) {
 out.push(["Packed L2", "ERROR", e.message, ""]);
 }
 
 // Summary
 out.push(["", "", "", ""]);
 out.push(["=== SUMMARY ===", "", "", ""]);
 
 if (foundInL1) {
 out.push(["Cache source", "L1 (CacheService)", foundInL1.key.substring(0, 30) + "...", ""]);
 out.push(["aÃ…Â¡Ã‚Â iÃ‚Â¸Ã‚Â WARNING", "L1 only - will be lost if cache expires!", "", ""]);
 } else if (foundInL2) {
 out.push(["Cache source", "L2 (ScriptProperties)", foundInL2.key.substring(0, 30) + "...", ""]);
 } else {
 out.push(["Cache source", "UNKNOWN", "Cache loads but source not found!", ""]);
 out.push(["This might indicate a bug in cache layer detection", "", "", ""]);
 }
 
 // What does WalletCache.load actually return?
 out.push(["", "", "", ""]);
 out.push(["=== WalletCache.load() Result ===", "", "", ""]);
 
 if (config) {
 CacheManager.init();
 var loaded = WalletCache.load(wallet, null, config);
 if (loaded) {
 out.push(["Loaded assets", (loaded.assets || []).length, "", ""]);
 out.push(["Loaded updatedAt", loaded.updatedAt || "?", "", ""]);
 } else {
 out.push(["Loaded", "NULL", "", ""]);
 }
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, "", ""]);
 }
 
 return out;
}


/**
 * Simple hash function (same as CacheManager._hashKey_)
 */
function _simpleHash(key) {
 key = String(key || "");
 var h = 0x811c9dc5;
 for (var i = 0; i < key.length; i++) {
 h ^= key.charCodeAt(i);
 h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
 }
 return h.toString(36);
}


/**
 * Force clear le cache L1 pour un wallet (pour debug)
 * @param {string} wallet - Adresse du wallet
 * @param {boolean} confirm - Doit ÃƒÆ’Ã‚Âªtre TRUE
 * @customfunction
 */
function DIAG_CLEAR_L1_CACHE(wallet, confirm) {
 if (confirm !== true) {
 return [["Usage", "=DIAG_CLEAR_L1_CACHE(\"0x...\"; TRUE)", ""]];
 }
 
 var out = [["Action", "Result", "Details"]];
 
 try {
 wallet = String(wallet || "").toLowerCase().trim();
 
 var config = null;
 var prefix = "";
 if (typeof _BASE !== 'undefined' && _BASE.getConfig) {
 config = _BASE.getConfig();
 prefix = (config.KEYS && config.KEYS.PREFIX) ? config.KEYS.PREFIX : "";
 }
 
 var key = prefix + "WALLET_" + wallet;
 out.push(["Key to clear", key.substring(0, 40) + "...", ""]);
 
 var cache = CacheService.getScriptCache();
 cache.remove(key);
 
 out.push(["L1 cache", "CLEARED", ""]);
 out.push(["Next load will use L2", "", ""]);
 
 } catch (e) {
 out.push(["ERROR", e.message, ""]);
 }
 
 return out;
}
// ============================================================
// FROM: DIAG_CACHE_META.gs
// ============================================================
function DIAG_CACHE_META_BASE() {
 var out = [["Contract", "In Cache?", "Symbol", "Name", "Balance", "Price EUR"]];
 
 var tokens = [
 "0xb3b32f9f8827d4634fe7d973fa1034ec9fddb3b3", // B3
 "0x23418de10d422ad71c9d5713a2b8991a9c586443" // BGCI
 ];
 
 try {
 var config = _BASE.getConfig();
 var wallet = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";
 
 // Load wallet cache
 var cache = WalletCache.load(wallet, null, config);
 
 if (!cache) {
 out.push(["ERROR", "Cache not found", "", "", "", ""]);
 return out;
 }
 
 out.push(["Cache.updatedAt", cache.updatedAt || "(none)", "", "", "", ""]);
 out.push(["Cache.assets count", cache.assets ? cache.assets.length : 0, "", "", "", ""]);
 out.push(["", "", "", "", "", ""]);
 
 // Build lookup map
 var assetMap = {};
 if (cache.assets) {
 for (var i = 0; i < cache.assets.length; i++) {
 var a = cache.assets[i];
 if (a && a.contract) {
 var k = a.contract.toLowerCase();
 assetMap[k] = a;
 }
 }
 }
 
 // Check each token
 for (var j = 0; j < tokens.length; j++) {
 var contract = tokens[j].toLowerCase();
 var asset = assetMap[contract];
 
 if (asset) {
 out.push([
 contract.substring(0, 15) + "...",
 "YES",
 asset.symbol || "(empty)",
 asset.name || "(empty)",
 asset.balance || 0,
 asset.price_eur || 0
 ]);
 } else {
 out.push([contract.substring(0, 15) + "...", "NO", "", "", "", ""]);
 }
 }
 
 // Show all assets with empty metadata
 out.push(["", "", "", "", "", ""]);
 out.push(["=== ALL TOKENS WITH EMPTY METADATA ===", "", "", "", "", ""]);
 
 var emptyMeta = [];
 if (cache.assets) {
 for (var k = 0; k < cache.assets.length; k++) {
 var a2 = cache.assets[k];
 if (a2 && a2.contract && a2.contract !== "native") {
 if (!a2.symbol || !a2.name) {
 emptyMeta.push(a2);
 }
 }
 }
 }
 
 out.push(["Count", emptyMeta.length, "", "", "", ""]);
 
 for (var m = 0; m < Math.min(10, emptyMeta.length); m++) {
 var em = emptyMeta[m];
 out.push([
 (em.contract || "").substring(0, 15) + "...",
 "EMPTY META",
 em.symbol || "(none)",
 em.name || "(none)",
 em.balance || 0,
 em.price_eur || 0
 ]);
 }
 
 } catch (e) {
 out.push(["FATAL ERROR", e.message, "", "", "", ""]);
 }
 
 return out;
}

// ============================================================
// FROM: DIAG_CACHE_QUICK.gs
// ============================================================
function DIAG_CACHE_QUICK(wallet) {
 var out = [["Key", "Value", "Details"]];
 
 try {
 wallet = String(wallet || "").toLowerCase().trim();
 if (!wallet) {
 return [["ERROR", "Missing wallet", ""]];
 }
 
 out.push(["Wallet", wallet.substring(0, 15) + "...", ""]);
 
 // La vraie cle utilisee par WCORE
 var CACHE_KEY = "GLOBAL_WALLET_CACHE_V1";
 
 // Hash du wallet (mÃƒÆ’Ã‚Âªme algo que CacheManager._hashKey_)
 var h = _hashKey(wallet);
 out.push(["Hash", h, ""]);
 
 // Chercher aussi avec la cle complete comme la fait le systeme
 var fullKey = "WALLET_CACHE_" + wallet;
 var fullHash = _hashKey(fullKey);
 out.push(["Full key hash", fullHash, "WALLET_CACHE_" + wallet.substring(0, 10) + "..."]);
 
 // Check L2 (ScriptProperties)
 out.push(["", "", ""]);
 out.push(["=== L2: ScriptProperties ===", "", ""]);
 
 var props = PropertiesService.getScriptProperties();
 var raw = props.getProperty(CACHE_KEY);
 
 if (!raw) {
 out.push(["L2 " + CACHE_KEY, "NOT FOUND", ""]);
 } else {
 out.push(["L2 size", raw.length + " chars", ""]);
 
 try {
 var packed = JSON.parse(raw);
 out.push(["L2 version", packed.v || "?", ""]);
 out.push(["L2 entries", Object.keys(packed.m || {}).length, ""]);
 
 // Essayer les deux hashes
 var entry = packed.m[h] || packed.m[fullHash];
 
 if (!entry) {
 // Chercher parmi toutes les entrees
 out.push(["Entry by hash", "NOT FOUND", "Trying scan..."]);
 
 var found = false;
 var keys = Object.keys(packed.m || {});
 for (var i = 0; i < keys.length; i++) {
 var e = packed.m[keys[i]];
 if (e && e.k && String(e.k).toLowerCase().indexOf(wallet.substring(0, 10)) >= 0) {
 entry = e;
 found = true;
 out.push(["Found via scan", "YES", "key=" + keys[i]]);
 break;
 }
 // Check array entries
 if (Array.isArray(e)) {
 for (var j = 0; j < e.length; j++) {
 if (e[j] && e[j].k && String(e[j].k).toLowerCase().indexOf(wallet.substring(0, 10)) >= 0) {
 entry = e[j];
 found = true;
 out.push(["Found via scan (array)", "YES", "key=" + keys[i]]);
 break;
 }
 }
 }
 if (found) break;
 }
 } else {
 out.push(["Entry by hash", "FOUND", ""]);
 }
 
 if (entry) {
 out.push(["Entry.ts", entry.ts || "?", entry.ts ? new Date(entry.ts * 1000).toISOString() : ""]);
 out.push(["Entry.k", entry.k ? entry.k.substring(0, 30) + "..." : "?", ""]);
 
 // Count assets
 var assets = [];
 if (entry.j && entry.v) {
 var v = entry.v;
 if (v.a && Array.isArray(v.a)) assets = v.a;
 else if (v.assets) assets = v.assets;
 }
 out.push(["L2 assets count", assets.length, ""]);
 
 // List first 5 assets
 if (assets.length > 0) {
 out.push(["", "", ""]);
 out.push(["=== L2 ASSETS (first 5) ===", "", ""]);
 for (var a = 0; a < Math.min(5, assets.length); a++) {
 var asset = assets[a];
 if (Array.isArray(asset)) {
 // Deflated format: [contract, balance]
 out.push(["Asset " + (a+1), asset[0] ? asset[0].substring(0, 15) + "..." : "?", "bal=" + (asset[1] || 0)]);
 } else if (asset && typeof asset === "object") {
 out.push(["Asset " + (a+1), (asset.contract || "?").substring(0, 15) + "...", "bal=" + (asset.balance || 0)]);
 }
 }
 if (assets.length > 5) {
 out.push(["...", "+" + (assets.length - 5) + " more", ""]);
 }
 }
 } else {
 out.push(["Entry", "NOT FOUND", "Wallet not in L2 cache"]);
 }
 
 } catch (e) {
 out.push(["Parse error", e.message, ""]);
 }
 }
 
 // Check what WalletCache.load returns
 out.push(["", "", ""]);
 out.push(["=== WalletCache.load() ===", "", ""]);
 
 var config = null;
 if (typeof _BASE !== 'undefined' && _BASE.getConfig) {
 config = _BASE.getConfig();
 }
 
 if (config) {
 CacheManager.init();
 var loaded = WalletCache.load(wallet, null, config);
 if (loaded) {
 out.push(["Loaded assets", (loaded.assets || []).length, ""]);
 out.push(["Loaded updatedAt", loaded.updatedAt || "?", loaded.updatedAt ? new Date(loaded.updatedAt).toISOString() : ""]);
 
 // Compare
 out.push(["", "", ""]);
 out.push(["=== COMPARISON ===", "", ""]);
 
 var loadedCount = (loaded.assets || []).length;
 // Compare with L2 if we found it
 out.push(["Loaded count", loadedCount, "This is what the system uses"]);
 } else {
 out.push(["Loaded", "NULL", ""]);
 }
 } else {
 out.push(["Config", "NOT FOUND", ""]);
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, e.stack ? e.stack.substring(0, 100) : ""]);
 }
 
 return out;
}


/**
 * Hash function (same as CacheManager._hashKey_)
 */
function _hashKey(key) {
 key = String(key || "");
 var h = 0x811c9dc5;
 for (var i = 0; i < key.length; i++) {
 h ^= key.charCodeAt(i);
 h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
 }
 return h.toString(36);
}


/**
 * Liste TOUS les wallets dans le cache L2
 * @customfunction
 */
function DIAG_LIST_ALL_CACHED_WALLETS() {
 var out = [["#", "Hash", "Key", "Assets", "Timestamp"]];
 
 try {
 var CACHE_KEY = "GLOBAL_WALLET_CACHE_V1";
 var props = PropertiesService.getScriptProperties();
 var raw = props.getProperty(CACHE_KEY);
 
 if (!raw) {
 return [["INFO", "No cache found", "", "", ""]];
 }
 
 var packed = JSON.parse(raw);
 var keys = Object.keys(packed.m || {});
 
 out.push(["TOTAL", keys.length + " entries", "", "", ""]);
 out.push(["", "", "", "", ""]);
 
 var count = 0;
 for (var i = 0; i < keys.length; i++) {
 var entry = packed.m[keys[i]];
 
 function processEntry(e, hash) {
 if (!e) return;
 count++;
 var k = e.k || "?";
 var ts = e.ts || 0;
 var assets = 0;
 
 if (e.j && e.v) {
 var v = e.v;
 if (v.a && Array.isArray(v.a)) assets = v.a.length;
 else if (v.assets) assets = v.assets.length;
 }
 
 out.push([
 count,
 hash,
 k.substring(0, 30) + (k.length > 30 ? "..." : ""),
 assets,
 ts ? new Date(ts * 1000).toISOString().substring(0, 19) : "?"
 ]);
 }
 
 if (Array.isArray(entry)) {
 for (var j = 0; j < entry.length; j++) {
 processEntry(entry[j], keys[i]);
 }
 } else {
 processEntry(entry, keys[i]);
 }
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, "", "", ""]);
 }
 
 return out;
}
// ============================================================
// FROM: DIAG_CACHE_SOURCE.gs
// ============================================================
function DIAG_CACHE_SOURCE(wallet) {
 var out = [["Layer", "Key", "Value", "Details"]];
 
 try {
 wallet = String(wallet || "").toLowerCase().trim();
 if (!wallet) {
 return [["ERROR", "Missing wallet address", "", ""]];
 }
 
 // Get config
 var config = null;
 if (typeof _BASE !== 'undefined' && _BASE.getConfig) {
 config = _BASE.getConfig();
 }
 if (!config) {
 return [["ERROR", "Config not found", "", ""]];
 }
 
 var cacheKey = "WALLET_CACHE_" + wallet.substring(0, 10);
 
 out.push(["=== CACHE KEY ===", "", "", ""]);
 out.push(["Wallet", wallet.substring(0, 15) + "...", "", ""]);
 out.push(["Expected key pattern", cacheKey + "...", "", ""]);
 
 // 1. Check L1 (CacheService)
 out.push(["", "", "", ""]);
 out.push(["=== L1: CacheService ===", "", "", ""]);
 
 var l1Data = null;
 var l1Assets = [];
 try {
 var cache = CacheService.getScriptCache();
 var globalWalletL1 = cache.get("GLOBAL_WALLET_CACHE");
 
 if (globalWalletL1) {
 out.push(["L1 GLOBAL_WALLET", "EXISTS", globalWalletL1.length + " chars", ""]);
 try {
 var parsed = JSON.parse(globalWalletL1);
 out.push(["L1 version", parsed.v || "?", "", ""]);
 out.push(["L1 entries", Object.keys(parsed.m || {}).length, "", ""]);
 
 // Find our wallet
 var h = _hashKeySimple(wallet);
 out.push(["Hash for wallet", h, "", ""]);
 
 if (parsed.m && parsed.m[h]) {
 var entry = parsed.m[h];
 out.push(["L1 entry found", "YES", "", ""]);
 
 // Extract assets
 var entryData = _extractEntryData(entry, wallet);
 if (entryData) {
 l1Data = entryData;
 l1Assets = entryData.assets || [];
 out.push(["L1 assets count", l1Assets.length, "", ""]);
 out.push(["L1 timestamp", entryData.ts || "?", entryData.ts ? new Date(entryData.ts * 1000).toISOString() : "", ""]);
 }
 } else {
 out.push(["L1 entry found", "NO", "Wallet not in L1", ""]);
 }
 } catch (e) {
 out.push(["L1 parse error", e.message, "", ""]);
 }
 } else {
 out.push(["L1 GLOBAL_WALLET", "NOT FOUND", "CacheService empty", ""]);
 }
 } catch (e) {
 out.push(["L1 error", e.message, "", ""]);
 }
 
 // 2. Check L2 (ScriptProperties)
 out.push(["", "", "", ""]);
 out.push(["=== L2: ScriptProperties ===", "", "", ""]);
 
 var l2Data = null;
 var l2Assets = [];
 try {
 var props = PropertiesService.getScriptProperties();
 var globalWalletL2 = props.getProperty("GLOBAL_WALLET_CACHE");
 
 if (globalWalletL2) {
 out.push(["L2 GLOBAL_WALLET", "EXISTS", globalWalletL2.length + " chars", ""]);
 try {
 var parsed2 = JSON.parse(globalWalletL2);
 out.push(["L2 version", parsed2.v || "?", "", ""]);
 out.push(["L2 entries", Object.keys(parsed2.m || {}).length, "", ""]);
 
 // Find our wallet
 var h2 = _hashKeySimple(wallet);
 
 if (parsed2.m && parsed2.m[h2]) {
 var entry2 = parsed2.m[h2];
 out.push(["L2 entry found", "YES", "", ""]);
 
 // Extract assets
 var entryData2 = _extractEntryData(entry2, wallet);
 if (entryData2) {
 l2Data = entryData2;
 l2Assets = entryData2.assets || [];
 out.push(["L2 assets count", l2Assets.length, "", ""]);
 out.push(["L2 timestamp", entryData2.ts || "?", entryData2.ts ? new Date(entryData2.ts * 1000).toISOString() : "", ""]);
 }
 } else {
 out.push(["L2 entry found", "NO", "Wallet not in L2", ""]);
 }
 } catch (e) {
 out.push(["L2 parse error", e.message, "", ""]);
 }
 } else {
 out.push(["L2 GLOBAL_WALLET", "NOT FOUND", "ScriptProperties empty", ""]);
 }
 } catch (e) {
 out.push(["L2 error", e.message, "", ""]);
 }
 
 // 3. Compare L1 vs L2
 out.push(["", "", "", ""]);
 out.push(["=== COMPARISON ===", "", "", ""]);
 
 out.push(["L1 assets", l1Assets.length, "", ""]);
 out.push(["L2 assets", l2Assets.length, "", ""]);
 
 if (l1Assets.length !== l2Assets.length) {
 out.push(["aÃ…Â¡Ã‚Â iÃ‚Â¸Ã‚Â MISMATCH", "Different asset count!", "L1=" + l1Assets.length + " vs L2=" + l2Assets.length, ""]);
 }
 
 // Find assets in L2 but not L1
 var l1Contracts = {};
 for (var i = 0; i < l1Assets.length; i++) {
 var c = l1Assets[i].contract || l1Assets[i][0];
 if (c) l1Contracts[String(c).toLowerCase()] = true;
 }
 
 var zombiesInL2 = [];
 for (var j = 0; j < l2Assets.length; j++) {
 var c2 = l2Assets[j].contract || l2Assets[j][0];
 if (c2 && !l1Contracts[String(c2).toLowerCase()]) {
 zombiesInL2.push(c2);
 }
 }
 
 if (zombiesInL2.length > 0) {
 out.push(["", "", "", ""]);
 out.push(["=== ZOMBIES (in L2 but not L1) ===", "", "", ""]);
 for (var z = 0; z < Math.min(10, zombiesInL2.length); z++) {
 out.push(["Zombie " + (z+1), zombiesInL2[z].substring(0, 20) + "...", "", ""]);
 }
 if (zombiesInL2.length > 10) {
 out.push(["...", "+" + (zombiesInL2.length - 10) + " more", "", ""]);
 }
 }
 
 // 4. What WalletCache.load returns
 out.push(["", "", "", ""]);
 out.push(["=== WalletCache.load RESULT ===", "", "", ""]);
 
 try {
 CacheManager.init();
 var loaded = WalletCache.load(wallet, null, config);
 if (loaded) {
 out.push(["Loaded assets", (loaded.assets || []).length, "", ""]);
 out.push(["Loaded updatedAt", loaded.updatedAt || "?", loaded.updatedAt ? new Date(loaded.updatedAt).toISOString() : "", ""]);
 
 var loadedFromWhere = "UNKNOWN";
 if (l1Data && (loaded.assets || []).length === l1Assets.length) {
 loadedFromWhere = "L1 (CacheService)";
 } else if (l2Data && (loaded.assets || []).length === l2Assets.length) {
 loadedFromWhere = "L2 (ScriptProperties)";
 }
 out.push(["Likely loaded from", loadedFromWhere, "", ""]);
 } else {
 out.push(["Loaded", "NULL", "No cache found", ""]);
 }
 } catch (e) {
 out.push(["Load error", e.message, "", ""]);
 }
 
 } catch (e) {
 out.push(["FATAL ERROR", e.message, "", ""]);
 }
 
 return out;
}


/**
 * Verifie si des sauvegardes ont ete bloquees
 * @customfunction
 */
function DIAG_BLOCKED_SAVES() {
 var out = [["System", "Metric", "Value", "Details"]];
 
 try {
 // Check CacheGuard (03B)
 out.push(["=== CacheGuard (03B) ===", "", "", ""]);
 if (typeof CacheGuard !== "undefined" && CacheGuard.getStats) {
 var stats = CacheGuard.getStats();
 out.push(["CacheGuard", "blockedSaves", stats.blockedSaves || 0, ""]);
 out.push(["CacheGuard", "allowedSaves", stats.allowedSaves || 0, ""]);
 out.push(["CacheGuard", "quotaExhausted", stats.quotaExhausted ? "YES" : "no", ""]);
 } else {
 out.push(["CacheGuard", "NOT AVAILABLE", "", ""]);
 }
 
 // Check HttpErrorGuard (03B)
 out.push(["", "", "", ""]);
 out.push(["=== HttpErrorGuard (03B) ===", "", "", ""]);
 if (typeof HttpErrorGuard !== "undefined" && HttpErrorGuard.getStats) {
 var httpStats = HttpErrorGuard.getStats();
 out.push(["HttpErrorGuard", "quotaExhausted", httpStats.quotaExhausted ? "YES aÃ…Â¡Ã‚Â iÃ‚Â¸Ã‚Â" : "no", ""]);
 out.push(["HttpErrorGuard", "errorCount", httpStats.errorCount || 0, ""]);
 out.push(["HttpErrorGuard", "weightedScore", httpStats.weightedScore || 0, ""]);
 if (httpStats.lastQuotaError) {
 out.push(["HttpErrorGuard", "lastQuotaError", httpStats.lastQuotaError.msg || "?", ""]);
 }
 } else {
 out.push(["HttpErrorGuard", "NOT AVAILABLE", "", ""]);
 }
 
 // CacheFortress (03C) - removed in v4.13.5
 out.push(["", "", "", ""]);
 out.push(["=== CacheFortress (03C) ===", "REMOVED", "v4.13.5", ""]);
 // Check HTTP Budget (03A)
 out.push(["", "", "", ""]);
 out.push(["=== HTTP Budget (03A) ===", "", "", ""]);
 if (typeof HttpBudget !== "undefined" && HttpBudget.getStats) {
 var budgetStats = HttpBudget.getStats();
 out.push(["HttpBudget", "used", budgetStats.used || 0, ""]);
 out.push(["HttpBudget", "limit", budgetStats.limit || 20000, ""]);
 out.push(["HttpBudget", "remaining", budgetStats.remaining || "?", ""]);
 out.push(["HttpBudget", "percentUsed", budgetStats.percentUsed || "?", ""]);
 } else {
 out.push(["HttpBudget", "NOT AVAILABLE", "", ""]);
 }
 
 // Summary
 out.push(["", "", "", ""]);
 out.push(["=== DIAGNOSIS ===", "", "", ""]);
 
 var anyBlocked = false;
 if (typeof CacheGuard !== "undefined" && CacheGuard.getStats) {
 var s = CacheGuard.getStats();
 if (s.blockedSaves > 0) anyBlocked = true;
 }
 
 if (anyBlocked) {
 out.push(["aÃ…Â¡Ã‚Â iÃ‚Â¸Ã‚Â BLOCKED SAVES DETECTED", "", "", ""]);
 out.push(["This may cause zombie tokens!", "", "", ""]);
 out.push(["L2 cache may not have been updated", "", "", ""]);
 } else {
 out.push(["No blocked saves in this session", "", "", ""]);
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, "", ""]);
 }
 
 return out;
}


/**
 * Helper: Simple hash function (same as CacheManager._hashKey_)
 */
function _hashKeySimple(key) {
 key = String(key || "");
 var h = 0x811c9dc5;
 for (var i = 0; i < key.length; i++) {
 h ^= key.charCodeAt(i);
 h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
 }
 return h.toString(36);
}


/**
 * Helper: Extract data from packed entry
 */
function _extractEntryData(entry, expectedKey) {
 if (!entry) return null;
 
 // Handle array (collision bucket)
 if (Array.isArray(entry)) {
 for (var i = 0; i < entry.length; i++) {
 if (entry[i] && entry[i].k && entry[i].k.toLowerCase().indexOf(expectedKey.substring(0, 10)) >= 0) {
 return _extractEntryData(entry[i], expectedKey);
 }
 }
 return null;
 }
 
 // Handle object
 if (typeof entry === "object") {
 var result = { ts: entry.ts || entry.t || 0, assets: [] };
 
 // Deflated format
 if (entry.j && entry.v) {
 var deflated = entry.v;
 if (deflated.a && Array.isArray(deflated.a)) {
 result.assets = deflated.a;
 } else if (deflated.assets && Array.isArray(deflated.assets)) {
 result.assets = deflated.assets;
 }
 }
 // String format
 else if (entry.s) {
 try {
 var parsed = JSON.parse(entry.s);
 result.assets = parsed.assets || [];
 } catch (e) {}
 }
 
 return result;
 }
 
 return null;
}


/**
 * List les assets actuellement dans le cache (version simplifiee)
 * @param {string} wallet - Adresse du wallet
 * @customfunction 
 */
function DIAG_LIST_CACHED_ASSETS(wallet) {
 var out = [["#", "Contract", "Symbol", "Balance", "In Cache"]];
 
 try {
 wallet = String(wallet || "").toLowerCase().trim();
 
 var config = null;
 if (typeof _BASE !== 'undefined' && _BASE.getConfig) {
 config = _BASE.getConfig();
 }
 if (!config) {
 return [["ERROR", "Config not found", "", "", ""]];
 }
 
 CacheManager.init();
 var cache = WalletCache.load(wallet, null, config);
 
 if (!cache || !cache.assets) {
 return [["INFO", "No cache or no assets", "", "", ""]];
 }
 
 var assets = cache.assets;
 for (var i = 0; i < assets.length; i++) {
 var a = assets[i];
 if (!a) continue;
 out.push([
 i + 1,
 (a.contract || "?").substring(0, 20) + "...",
 a.symbol || "?",
 a.balance || 0,
 "YES"
 ]);
 }
 
 out.push(["", "", "", "", ""]);
 out.push(["TOTAL", assets.length + " assets", "", "", ""]);
 out.push(["Cache updatedAt", cache.updatedAt ? new Date(cache.updatedAt).toISOString() : "?", "", "", ""]);
 
 } catch (e) {
 out.push(["ERROR", e.message, "", "", ""]);
 }
 
 return out;
}
// ============================================================
// FROM: DIAG_FIND_WALLET_KEY.gs
// ============================================================
function DIAG_FIND_WALLET_KEY(wallet) {
 var out = [["Key", "Size", "Assets", "Timestamp"]];
 
 try {
 wallet = String(wallet || "").toLowerCase().trim();
 if (!wallet) {
 return [["ERROR", "Missing wallet", "", ""]];
 }
 
 var walletShort = wallet.substring(0, 10);
 out.push(["Searching for", walletShort + "...", "", ""]);
 out.push(["", "", "", ""]);
 
 var props = PropertiesService.getScriptProperties();
 var allKeys = props.getKeys();
 
 out.push(["Total keys in ScriptProperties", allKeys.length, "", ""]);
 out.push(["", "", "", ""]);
 
 var found = 0;
 for (var i = 0; i < allKeys.length; i++) {
 var key = allKeys[i];
 
 // Check if key contains wallet address
 if (key.toLowerCase().indexOf(walletShort) >= 0) {
 found++;
 var value = props.getProperty(key);
 var size = value ? value.length : 0;
 
 var assets = "?";
 var ts = "?";
 
 try {
 var parsed = JSON.parse(value);
 // Try to find assets
 if (parsed.assets) assets = parsed.assets.length;
 else if (parsed.a) assets = parsed.a.length;
 
 // Try to find timestamp
 if (parsed.updatedAt) ts = new Date(parsed.updatedAt).toISOString().substring(0, 19);
 else if (parsed.u) ts = new Date(parsed.u).toISOString().substring(0, 19);
 } catch (e) {}
 
 out.push([key, size + " chars", assets + " assets", ts]);
 }
 }
 
 if (found === 0) {
 out.push(["NO KEYS FOUND", "containing " + walletShort, "", ""]);
 } else {
 out.push(["", "", "", ""]);
 out.push(["FOUND", found + " keys", "", ""]);
 }
 
 // Also check what walletKey() would generate
 out.push(["", "", "", ""]);
 out.push(["=== Expected Key ===", "", "", ""]);
 
 var config = null;
 if (typeof _BASE !== 'undefined' && _BASE.getConfig) {
 config = _BASE.getConfig();
 }
 
 if (config) {
 var prefix = (config.KEYS && config.KEYS.PREFIX) ? config.KEYS.PREFIX : "";
 var expectedKey = prefix + "WALLET_" + wallet;
 out.push(["Expected key", expectedKey.substring(0, 40) + "...", "", ""]);
 
 // Check if this key exists
 var exists = props.getProperty(expectedKey);
 out.push(["Key exists?", exists ? "YES (" + exists.length + " chars)" : "NO", "", ""]);
 }
 
 // List ALL keys that contain WALLET (for debugging)
 out.push(["", "", "", ""]);
 out.push(["=== All WALLET keys (first 20) ===", "", "", ""]);
 
 var walletKeys = [];
 for (var j = 0; j < allKeys.length; j++) {
 if (allKeys[j].indexOf("WALLET") >= 0) {
 walletKeys.push(allKeys[j]);
 }
 }
 
 for (var k = 0; k < Math.min(20, walletKeys.length); k++) {
 var wk = walletKeys[k];
 var wv = props.getProperty(wk);
 out.push([wk.substring(0, 40) + (wk.length > 40 ? "..." : ""), wv ? wv.length + " chars" : "empty", "", ""]);
 }
 
 if (walletKeys.length > 20) {
 out.push(["...", "+" + (walletKeys.length - 20) + " more", "", ""]);
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, "", ""]);
 }
 
 return out;
}


/**
 * Affiche le contenu detaille d'une cle cache
 * @param {string} key - Cle exacte
 * @customfunction
 */
function DIAG_SHOW_CACHE_KEY(key) {
 var out = [["Field", "Value", "Details"]];
 
 try {
 key = String(key || "").trim();
 if (!key) {
 return [["ERROR", "Missing key", ""]];
 }
 
 var props = PropertiesService.getScriptProperties();
 var value = props.getProperty(key);
 
 if (!value) {
 return [["Key not found", key, ""]];
 }
 
 out.push(["Key", key, ""]);
 out.push(["Size", value.length + " chars", ""]);
 out.push(["", "", ""]);
 
 var parsed = JSON.parse(value);
 
 // Show main fields
 out.push(["=== Parsed Content ===", "", ""]);
 
 var fields = Object.keys(parsed);
 for (var i = 0; i < fields.length; i++) {
 var f = fields[i];
 var v = parsed[f];
 
 if (f === "a" || f === "assets") {
 out.push([f, Array.isArray(v) ? v.length + " items" : typeof v, ""]);
 } else if (f === "pm" || f === "priceMap" || f === "bt" || f === "balanceTsMap") {
 out.push([f, typeof v === "object" ? Object.keys(v).length + " keys" : typeof v, ""]);
 } else if (typeof v === "object") {
 out.push([f, JSON.stringify(v).substring(0, 50), ""]);
 } else {
 out.push([f, String(v).substring(0, 50), ""]);
 }
 }
 
 // List assets if present
 var assets = parsed.a || parsed.assets || [];
 if (assets.length > 0) {
 out.push(["", "", ""]);
 out.push(["=== Assets ===", "", ""]);
 
 for (var j = 0; j < Math.min(20, assets.length); j++) {
 var a = assets[j];
 if (Array.isArray(a)) {
 // Compact format [contract, balance, symbol, ...]
 out.push(["#" + (j+1), a[0] ? a[0].substring(0, 15) + "..." : "?", "bal=" + (a[1] || 0) + " sym=" + (a[2] || "?")]);
 } else if (a && typeof a === "object") {
 out.push(["#" + (j+1), (a.contract || a.c || "?").substring(0, 15) + "...", "bal=" + (a.balance || a.b || 0)]);
 }
 }
 
 if (assets.length > 20) {
 out.push(["...", "+" + (assets.length - 20) + " more", ""]);
 }
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, ""]);
 }
 
 return out;
}
// ============================================================
// FROM: DIAG_PACKED_L2_WRITE.gs
// ============================================================
function DIAG_TEST_PACKED_L2_WRITE() {
 var out = [["Test", "Result", "Details"]];
 
 try {
 // 1. Check current state
 out.push(["=== CURRENT STATE ===", "", ""]);
 
 var props = PropertiesService.getScriptProperties();
 var packedKey = "GLOBAL_WALLET_CACHE_V1";
 
 var currentPacked = props.getProperty(packedKey);
 out.push(["Current Packed L2", currentPacked ? currentPacked.length + " chars" : "NOT FOUND", ""]);
 
 // 2. Check total ScriptProperties size
 out.push(["", "", ""]);
 out.push(["=== SCRIPTPROPERTIES USAGE ===", "", ""]);
 
 var allProps = props.getProperties();
 var totalSize = 0;
 var keyCount = 0;
 var largestKeys = [];
 
 for (var key in allProps) {
 keyCount++;
 var size = key.length + (allProps[key] ? allProps[key].length : 0);
 totalSize += size;
 largestKeys.push({ key: key, size: size });
 }
 
 // Sort by size
 largestKeys.sort(function(a, b) { return b.size - a.size; });
 
 out.push(["Total keys", keyCount, ""]);
 out.push(["Total size", totalSize + " chars", (totalSize / 1024).toFixed(1) + " KB"]);
 out.push(["Limit", "500 KB", "ScriptProperties max"]);
 out.push(["Usage", ((totalSize / 512000) * 100).toFixed(1) + "%", ""]);
 
 // Show top 5 largest keys
 out.push(["", "", ""]);
 out.push(["=== TOP 5 LARGEST KEYS ===", "", ""]);
 for (var i = 0; i < Math.min(5, largestKeys.length); i++) {
 var k = largestKeys[i];
 out.push([k.key.substring(0, 35), k.size + " chars", (k.size / 1024).toFixed(1) + " KB"]);
 }
 
 // 3. Test write
 out.push(["", "", ""]);
 out.push(["=== WRITE TEST ===", "", ""]);
 
 var testKey = "DIAG_TEST_WRITE_" + Date.now();
 var testValue = "test_" + Date.now();
 
 try {
 props.setProperty(testKey, testValue);
 var readBack = props.getProperty(testKey);
 
 if (readBack === testValue) {
 out.push(["Small write test", "SUCCESS", ""]);
 props.deleteProperty(testKey);
 } else {
 out.push(["Small write test", "FAILED", "Read back mismatch"]);
 }
 } catch (e) {
 out.push(["Small write test", "FAILED", e.message]);
 }
 
 // 4. Test packed cache write
 out.push(["", "", ""]);
 out.push(["=== PACKED CACHE WRITE TEST ===", "", ""]);
 
 // Try to initialize or update packed cache
 CacheManager.init();
 
 if (CacheManager._loadPackedWalletCache_ && CacheManager._savePackedWalletCache_) {
 var packed = CacheManager._loadPackedWalletCache_();
 out.push(["Loaded packed", "v=" + packed.v + ", entries=" + Object.keys(packed.m || {}).length, ""]);
 
 // Try to save it back (without changes)
 try {
 var saveResult = CacheManager._savePackedWalletCache_(packed);
 out.push(["Save packed", saveResult ? "SUCCESS" : "FAILED", ""]);
 
 // Verify in L2
 var l2Check = props.getProperty(packedKey);
 out.push(["L2 after save", l2Check ? l2Check.length + " chars" : "NOT FOUND", ""]);
 } catch (e) {
 out.push(["Save packed", "ERROR", e.message]);
 }
 } else {
 out.push(["Packed functions", "NOT AVAILABLE", ""]);
 }
 
 // 5. Check safeSet version
 out.push(["", "", ""]);
 out.push(["=== SAFESET VERSION CHECK ===", "", ""]);
 
 // Check if safeSet has the v4.12.16 fix
 var safeSetCode = CacheManager.safeSet ? CacheManager.safeSet.toString() : "";
 var hasVirtualKeyCheck = safeSetCode.indexOf("_isVirtualKey_") >= 0;
 var hasPackedPut = safeSetCode.indexOf("_packedPut_") >= 0;
 
 out.push(["safeSet has _isVirtualKey_", hasVirtualKeyCheck ? "YES (v4.12.16+)" : "NO (old version)", ""]);
 out.push(["safeSet has _packedPut_", hasPackedPut ? "YES (v4.12.16+)" : "NO (old version)", ""]);
 
 if (!hasVirtualKeyCheck || !hasPackedPut) {
 out.push(["aÃ…Â¡Ã‚Â iÃ‚Â¸Ã‚Â OLD VERSION", "Deploy 04A_CACHE_CORE.gs v4.12.16!", ""]);
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, ""]);
 }
 
 return out;
}


/**
 * Force initialize the packed cache in L2
 * @param {boolean} confirm - Must be TRUE
 * @customfunction
 */
function DIAG_INIT_PACKED_L2(confirm) {
 if (confirm !== true) {
 return [["Usage", "=DIAG_INIT_PACKED_L2(TRUE)", "Forces creation of packed cache in L2"]];
 }
 
 var out = [["Action", "Result", "Details"]];
 
 try {
 var props = PropertiesService.getScriptProperties();
 var packedKey = "GLOBAL_WALLET_CACHE_V1";
 
 // Check current
 var current = props.getProperty(packedKey);
 out.push(["Current L2", current ? current.length + " chars" : "NOT FOUND", ""]);
 
 // Create empty packed cache
 var newPacked = { v: 2, m: {} };
 
 // If L1 has data, try to copy it
 var cache = CacheService.getScriptCache();
 var l1Packed = cache.get(packedKey);
 if (l1Packed) {
 try {
 newPacked = JSON.parse(l1Packed);
 out.push(["Copying from L1", Object.keys(newPacked.m || {}).length + " entries", ""]);
 } catch (e) {}
 }
 
 // Write to L2
 var jsonStr = JSON.stringify(newPacked);
 out.push(["Data size", jsonStr.length + " chars", ""]);
 
 try {
 props.setProperty(packedKey, jsonStr);
 out.push(["L2 write", "SUCCESS", ""]);
 
 // Verify
 var verify = props.getProperty(packedKey);
 out.push(["Verification", verify ? verify.length + " chars" : "FAILED", ""]);
 } catch (e) {
 out.push(["L2 write", "FAILED", e.message]);
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, ""]);
 }
 
 return out;
}
// ============================================================
// FROM: DIAG_WALLET_CACHE_COMPARE.gs
// ============================================================
function DIAG_WALLET_CACHE_COMPARE(walletAddress, chainName) {
 var out = [["Check", "L1 (Apps Script)", "L2 (Packed)", "Status"]];
 
 try {
 walletAddress = String(walletAddress || "").toLowerCase().trim();
 chainName = String(chainName || "Base").trim();
 
 if (!walletAddress) {
 out.push(["ERROR", "No wallet address", "", ""]);
 return out;
 }
 
 out.push(["Wallet", walletAddress.substring(0, 15) + "...", "", ""]);
 out.push(["Chain", chainName, "", ""]);
 out.push(["", "", "", ""]);
 
 // === Build cache key ===
 var cacheKey = "WC:" + chainName.toUpperCase() + ":" + walletAddress;
 out.push(["Cache Key", cacheKey, "", ""]);
 
 // === L1: Apps Script Cache ===
 var l1Cache = CacheService.getScriptCache();
 var l1Raw = null;
 var l1Data = null;
 var l1Assets = [];
 
 try {
 l1Raw = l1Cache.get(cacheKey);
 if (l1Raw) {
 l1Data = JSON.parse(l1Raw);
 l1Assets = l1Data.assets || [];
 }
 } catch (e) {
 out.push(["L1 Error", e.message, "", "ERROR"]);
 }
 
 out.push(["L1 Raw Length", l1Raw ? l1Raw.length + " chars" : "NULL", "", l1Raw ? "OK" : "MISS"]);
 out.push(["L1 Assets Count", l1Assets.length, "", ""]);
 out.push(["L1 rrCursor", l1Data ? l1Data.rrCursor : "N/A", "", ""]);
 out.push(["L1 Version", l1Data ? l1Data.version : "N/A", "", ""]);
 
 // === L2: Packed ScriptProperties ===
 var props = PropertiesService.getScriptProperties();
 var packedRaw = null;
 var packed = null;
 var l2Data = null;
 var l2Assets = [];
 
 try {
 packedRaw = props.getProperty("GLOBAL_WALLET_CACHE_V1");
 if (packedRaw) {
 packed = JSON.parse(packedRaw);
 
 // Find this wallet in packed cache
 if (packed && packed.w) {
 for (var i = 0; i < packed.w.length; i++) {
 var entry = packed.w[i];
 if (entry && entry.k === cacheKey) {
 l2Data = entry.d;
 l2Assets = l2Data.assets || [];
 break;
 }
 }
 }
 }
 } catch (e) {
 out.push(["L2 Error", e.message, "", "ERROR"]);
 }
 
 out.push(["L2 Packed Size", packedRaw ? packedRaw.length + " chars" : "NULL", "", packedRaw ? "OK" : "MISS"]);
 out.push(["L2 Total Wallets", packed && packed.w ? packed.w.length : 0, "", ""]);
 out.push(["L2 Wallet Found", l2Data ? "YES" : "NO", "", l2Data ? "OK" : "MISS"]);
 out.push(["L2 Assets Count", l2Assets.length, "", ""]);
 out.push(["L2 rrCursor", l2Data ? l2Data.rrCursor : "N/A", "", ""]);
 out.push(["L2 Version", l2Data ? l2Data.version : "N/A", "", ""]);
 
 // === Compare assets ===
 out.push(["", "", "", ""]);
 out.push(["=== ASSET COMPARISON ===", "", "", ""]);
 
 var l1Contracts = {};
 var l2Contracts = {};
 
 for (var i = 0; i < l1Assets.length; i++) {
 var a = l1Assets[i];
 if (a && a.contract) l1Contracts[a.contract.toLowerCase()] = a;
 }
 for (var i = 0; i < l2Assets.length; i++) {
 var a = l2Assets[i];
 if (a && a.contract) l2Contracts[a.contract.toLowerCase()] = a;
 }
 
 var allContracts = {};
 for (var k in l1Contracts) allContracts[k] = true;
 for (var k in l2Contracts) allContracts[k] = true;
 
 var keys = Object.keys(allContracts).sort();
 
 for (var i = 0; i < keys.length; i++) {
 var contract = keys[i];
 var l1A = l1Contracts[contract];
 var l2A = l2Contracts[contract];
 
 var l1Info = l1A ? (l1A.symbol || "???") + " bal=" + (l1A.balance || 0) : "MISSING";
 var l2Info = l2A ? (l2A.symbol || "???") + " bal=" + (l2A.balance || 0) : "MISSING";
 
 var status = "";
 if (l1A && l2A) {
 status = (l1A.balance === l2A.balance) ? "SYNC" : "DIFF";
 } else if (l1A && !l2A) {
 status = "L1 ONLY";
 } else if (!l1A && l2A) {
 status = "L2 ONLY";
 }
 
 var contractDisplay = (contract === "native") ? "native" : contract.substring(0, 10) + "...";
 out.push([contractDisplay, l1Info, l2Info, status]);
 }
 
 // === Summary ===
 out.push(["", "", "", ""]);
 var l1Only = 0, l2Only = 0, synced = 0, diff = 0;
 for (var i = 0; i < keys.length; i++) {
 var contract = keys[i];
 var l1A = l1Contracts[contract];
 var l2A = l2Contracts[contract];
 if (l1A && l2A) {
 if (l1A.balance === l2A.balance) synced++; else diff++;
 } else if (l1A) l1Only++;
 else l2Only++;
 }
 
 out.push(["Summary", "Synced: " + synced, "L1 only: " + l1Only + ", L2 only: " + l2Only, "Diff: " + diff]);
 
 } catch (e) {
 out.push(["FATAL ERROR", e.message, "", ""]);
 }
 
 return out;
}

/**
 * List all wallets in packed L2 cache
 * @customfunction
 */
function DIAG_LIST_PACKED_WALLETS() {
 var out = [["#", "Cache Key", "Assets", "rrCursor", "Version", "Updated"]];
 
 try {
 var props = PropertiesService.getScriptProperties();
 var packedRaw = props.getProperty("GLOBAL_WALLET_CACHE_V1");
 
 if (!packedRaw) {
 out.push(["", "NO PACKED CACHE", "", "", "", ""]);
 return out;
 }
 
 var packed = JSON.parse(packedRaw);
 if (!packed || !packed.w) {
 out.push(["", "INVALID FORMAT", "", "", "", ""]);
 return out;
 }
 
 out.push(["Total", packed.w.length + " wallets", "Size: " + packedRaw.length + " chars", "", "", ""]);
 out.push(["", "", "", "", "", ""]);
 
 for (var i = 0; i < packed.w.length; i++) {
 var entry = packed.w[i];
 if (!entry) continue;
 
 var key = entry.k || "???";
 var data = entry.d || {};
 var assets = data.assets || [];
 var rrCursor = data.rrCursor || 0;
 var version = data.version || "?";
 var updated = data.updatedAt ? new Date(data.updatedAt).toISOString().substring(11, 19) : "?";
 
 out.push([(i+1), key, assets.length + " assets", rrCursor, version, updated]);
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, "", "", "", ""]);
 }
 
 return out;
}

function DIAG_RAW_PACKED_CACHE() {
 var props = PropertiesService.getScriptProperties();
 var raw = props.getProperty("GLOBAL_WALLET_CACHE_V1");
 
 if (!raw) return [["Status", "NO CACHE FOUND"]];
 
 var out = [["Field", "Value"]];
 out.push(["Raw Length", raw.length + " chars"]);
 out.push(["First 500 chars", raw.substring(0, 500)]);
 out.push(["Last 200 chars", raw.substring(raw.length - 200)]);
 
 try {
 var parsed = JSON.parse(raw);
 out.push(["Parsed OK", "YES"]);
 out.push(["Top keys", Object.keys(parsed).join(", ")]);
 out.push(["Version (v)", parsed.v || "N/A"]);
 out.push(["Wallets array (w)", parsed.w ? "Array[" + parsed.w.length + "]" : "MISSING"]);
 
 if (parsed.w && parsed.w.length > 0) {
 out.push(["First wallet key", parsed.w[0].k || "N/A"]);
 }
 } catch (e) {
 out.push(["Parse Error", e.message]);
 }
 
 return out;
}

function DIAG_FIND_BASE_WALLET() {
 var props = PropertiesService.getScriptProperties();
 var raw = props.getProperty("GLOBAL_WALLET_CACHE_V1");
 
 if (!raw) return [["Status", "NO CACHE"]];
 
 var out = [["Key", "Chain", "Address", "Assets"]];
 
 try {
 var parsed = JSON.parse(raw);
 var m = parsed.m || {};
 var keys = Object.keys(m);
 
 out.push(["Total entries", keys.length, "", ""]);
 out.push(["", "", "", ""]);
 
 // Find all BASE entries
 var baseFound = 0;
 for (var i = 0; i < keys.length; i++) {
 var shortKey = keys[i];
 var entry = m[shortKey];
 var fullKey = entry.k || "";
 
 // Check if it's a BASE wallet
 if (fullKey.indexOf("BASE") >= 0 || fullKey.indexOf("0x6a3530") >= 0) {
 var data = entry.v || {};
 var assets = data.a || [];
 out.push(["FOUND!", fullKey.substring(0, 40) + "...", assets.length + " assets", ""]);
 baseFound++;
 
 // Show assets
 for (var j = 0; j < assets.length && j < 10; j++) {
 var a = assets[j];
 out.push([" Asset " + j, a[0] || "?", a[2] || "?", "bal=" + (a[1] || 0)]);
 }
 }
 }
 
 if (baseFound === 0) {
 out.push(["BASE wallet", "NOT FOUND in packed cache", "", ""]);
 out.push(["", "", "", ""]);
 out.push(["=== ALL KEYS (first 20) ===", "", "", ""]);
 for (var i = 0; i < Math.min(20, keys.length); i++) {
 var entry = m[keys[i]];
 out.push([keys[i], entry.k ? entry.k.substring(0, 50) : "?", "", ""]);
 }
 }
 
 } catch (e) {
 out.push(["Error", e.message, "", ""]);
 }
 
 return out;
}

function DIAG_SEARCH_WALLET_IN_PACKED(partialAddr) {
 var props = PropertiesService.getScriptProperties();
 var raw = props.getProperty("GLOBAL_WALLET_CACHE_V1");
 
 if (!raw) return [["Status", "NO CACHE"]];
 
 var out = [["Match", "Full Key", "Assets"]];
 partialAddr = String(partialAddr || "").toLowerCase();
 
 try {
 var parsed = JSON.parse(raw);
 var m = parsed.m || {};
 var keys = Object.keys(m);
 
 out.push(["Search for", partialAddr, ""]);
 out.push(["Total entries", keys.length, ""]);
 out.push(["", "", ""]);
 
 var found = 0;
 for (var i = 0; i < keys.length; i++) {
 var hash = keys[i];
 var entry = m[hash];
 var fullKey = entry.k || "";
 
 if (fullKey.toLowerCase().indexOf(partialAddr) >= 0) {
 var data = entry.v || {};
 var assets = data.a || [];
 out.push(["FOUND!", fullKey, assets.length + " assets"]);
 found++;
 }
 }
 
 if (found === 0) {
 out.push(["NOT FOUND", "No entries match: " + partialAddr, ""]);
 out.push(["", "", ""]);
 out.push(["=== ALL ADDRESSES IN CACHE ===", "", ""]);
 for (var i = 0; i < keys.length; i++) {
 var entry = m[keys[i]];
 var fullKey = entry.k || "";
 // Extract address from key like "BASE_CACHE_WALLET_0x..."
 var match = fullKey.match(/0x[a-f0-9]+/i);
 if (match) {
 out.push([i+1, match[0].substring(0, 20) + "...", fullKey.split("_")[0]]);
 }
 }
 }
 
 } catch (e) {
 out.push(["Error", e.message, ""]);
 }
 
 return out;
}

function DIAG_TRACE_WALLET_SAVE(walletAddr, chainName) {
 var out = [["Step", "Result", "Details"]];
 
 try {
 walletAddr = String(walletAddr || "").toLowerCase().trim();
 chainName = String(chainName || "Base").trim();
 
 out.push(["Input wallet", walletAddr.substring(0, 15) + "...", ""]);
 out.push(["Input chain", chainName, ""]);
 out.push(["", "", ""]);
 
 // Step 1: Build cache key like WalletCache.save does
 var prefix = chainName.toUpperCase() + "_CACHE_";
 var cacheKey = prefix + "WALLET_" + walletAddr;
 out.push(["1. Cache Key", cacheKey.substring(0, 50) + "...", ""]);
 
 // Step 2: Check _isVirtualKey_
 var isVirtual = false;
 try {
 if (CacheManager._isVirtualKey_) {
 isVirtual = CacheManager._isVirtualKey_(cacheKey);
 }
 } catch (e) {}
 out.push(["2. isVirtualKey()", isVirtual ? "TRUE" : "FALSE", isVirtual ? "Will use packed cache" : "PROBLEM: Not routed to packed!"]);
 
 // Step 3: Check regex patterns
 var pattern1 = /_CACHE_WALLET_/i.test(cacheKey);
 var pattern2 = /WALLET_CACHE_/i.test(cacheKey);
 var pattern3 = /^GLOBAL_WALLET_CACHE_/i.test(cacheKey);
 out.push(["3a. /_CACHE_WALLET_/", pattern1 ? "MATCH" : "no match", ""]);
 out.push(["3b. /WALLET_CACHE_/", pattern2 ? "MATCH" : "no match", ""]);
 out.push(["3c. /^GLOBAL_WALLET/", pattern3 ? "MATCH" : "no match", ""]);
 
 // Step 4: Check if CacheGuard is blocking
 var guardActive = false;
 try {
 if (typeof CacheGuard !== 'undefined' && CacheGuard.isActive) {
 guardActive = CacheGuard.isActive();
 }
 } catch (e) {}
 out.push(["4. CacheGuard active?", guardActive ? "YES - BLOCKING!" : "no", ""]);
 
 // Step 5: CacheFortress removed in v4.13.5
 out.push(["5. Fortress active?", "REMOVED (v4.13.5)", ""]);
 
 // Step 6: Try to compute hash like _packedPut_ does
 var hash = "";
 try {
 if (CacheManager._hashKey_) {
 hash = CacheManager._hashKey_(cacheKey);
 }
 } catch (e) {}
 out.push(["6. Hash of key", hash || "N/A", ""]);
 
 // Step 7: Check if this hash exists in packed cache
 var hashExists = false;
 try {
 var props = PropertiesService.getScriptProperties();
 var raw = props.getProperty("GLOBAL_WALLET_CACHE_V1");
 if (raw) {
 var parsed = JSON.parse(raw);
 if (parsed.m && parsed.m[hash]) {
 hashExists = true;
 var entry = parsed.m[hash];
 out.push(["7. Hash in packed?", "YES", "Entry key: " + (entry.k || "?").substring(0, 40)]);
 } else {
 out.push(["7. Hash in packed?", "NO - NOT SAVED!", ""]);
 }
 }
 } catch (e) {
 out.push(["7. Hash check error", e.message, ""]);
 }
 
 // Step 8: Check L1 cache
 var l1Data = null;
 try {
 var l1Cache = CacheService.getScriptCache();
 var l1Raw = l1Cache.get(cacheKey);
 if (l1Raw) {
 l1Data = JSON.parse(l1Raw);
 out.push(["8. L1 Cache", "EXISTS", l1Raw.length + " chars, " + ((l1Data.a || l1Data.assets || []).length) + " assets"]);
 } else {
 out.push(["8. L1 Cache", "EMPTY", "No data in CacheService"]);
 }
 } catch (e) {
 out.push(["8. L1 Cache error", e.message, ""]);
 }
 
 // Step 9: Try a test write
 out.push(["", "", ""]);
 out.push(["=== TEST WRITE ===", "", ""]);
 
 var testKey = cacheKey + "_TEST_" + Date.now();
 var testData = JSON.stringify({ test: true, ts: Date.now() });
 var writeResult = false;
 
 try {
 if (CacheManager._packedPut_) {
 writeResult = CacheManager._packedPut_(testKey, testData);
 out.push(["9. _packedPut_ result", writeResult ? "SUCCESS" : "FAILED", ""]);
 
 // Verify it was saved
 var props = PropertiesService.getScriptProperties();
 var raw = props.getProperty("GLOBAL_WALLET_CACHE_V1");
 if (raw) {
 var parsed = JSON.parse(raw);
 var testHash = CacheManager._hashKey_(testKey);
 if (parsed.m && parsed.m[testHash]) {
 out.push(["10. Verified in L2", "YES", ""]);
 // Clean up test
 delete parsed.m[testHash];
 props.setProperty("GLOBAL_WALLET_CACHE_V1", JSON.stringify(parsed));
 out.push(["11. Cleanup", "Done", ""]);
 } else {
 out.push(["10. Verified in L2", "NO - WRITE FAILED!", ""]);
 }
 }
 } else {
 out.push(["9. _packedPut_", "NOT AVAILABLE", ""]);
 }
 } catch (e) {
 out.push(["Test write error", e.message, ""]);
 }
 
 } catch (e) {
 out.push(["FATAL ERROR", e.message, ""]);
 }
 
 return out;
}

function DIAG_SIMULATE_REAL_SAVE() {
 var out = [["Step", "Result", "Error"]];
 
 var walletAddr = "0x6a3530ad9e5b1779de37f5e6af82999c325ea3f7";
 var chainName = "Base";
 
 // Simulate config like EVM_ENGINE builds it
 var config = {
 KEYS: { PREFIX: "BASE_CACHE_" },
 CACHE: { WALLET_CACHE_TTL_SECONDS: 86400 }
 };
 
 try {
 CacheManager.init();
 out.push(["1. CacheManager.init()", "OK", ""]);
 
 // Step 2: Build key like WalletCache.save does
 var key = CacheManager.walletKey(walletAddr, config);
 out.push(["2. walletKey()", key.substring(0, 50), ""]);
 
 // Step 3: Create test cache object (like _migrate would produce)
 var compact = {
 v: 5,
 cv: 63,
 u: Date.now(),
 a: [["n", 0, "ETH", "Ether", 18], ["0xtest", 100, "TEST", "Test Token", 18]],
 pm: {},
 fx: 0.836,
 rc: 3,
 bt: {},
 at: {},
 pg: {},
 pt: {},
 im: null,
 fs: Date.now(),
 fp: Date.now()
 };
 out.push(["3. Test compact obj", "Created", JSON.stringify(compact).length + " chars"]);
 
 // Step 4: Try safeSetJson
 var jsonStr = null;
 try {
 jsonStr = JSON.stringify(compact);
 out.push(["4. JSON.stringify()", "OK", jsonStr.length + " chars"]);
 } catch (e) {
 out.push(["4. JSON.stringify()", "FAILED!", e.message]);
 return out;
 }
 
 // Step 5: Check isVirtualKey
 var isVirt = CacheManager._isVirtualKey_ ? CacheManager._isVirtualKey_(key) : false;
 out.push(["5. isVirtualKey()", isVirt ? "TRUE" : "FALSE", ""]);
 
 // Step 6: Write to L1
 try {
 CacheManager._cache.put(key, jsonStr, 21600);
 out.push(["6. L1 write", "OK", ""]);
 } catch (e) {
 out.push(["6. L1 write", "FAILED!", e.message]);
 }
 
 // Step 7: Write to L2 via _packedPut_
 var l2Result = false;
 var l2Error = "";
 try {
 if (CacheManager._packedPut_) {
 l2Result = CacheManager._packedPut_(key, jsonStr);
 out.push(["7. _packedPut_()", l2Result ? "SUCCESS" : "FAILED (returned false)", ""]);
 } else {
 out.push(["7. _packedPut_()", "NOT AVAILABLE", ""]);
 }
 } catch (e) {
 l2Error = e.message || String(e);
 out.push(["7. _packedPut_()", "EXCEPTION!", l2Error.substring(0, 100)]);
 }
 
 // Step 8: Verify L2 write
 var hash = CacheManager._hashKey_ ? CacheManager._hashKey_(key) : "?";
 out.push(["8. Hash", hash, ""]);
 
 try {
 var props = PropertiesService.getScriptProperties();
 var raw = props.getProperty("GLOBAL_WALLET_CACHE_V1");
 if (raw) {
 var parsed = JSON.parse(raw);
 if (parsed.m && parsed.m[hash]) {
 var entry = parsed.m[hash];
 out.push(["9. Verify L2", "FOUND!", "Entry key: " + (entry.k || "?").substring(0, 40)]);
 
 // Clean up test
 delete parsed.m[hash];
 props.setProperty("GLOBAL_WALLET_CACHE_V1", JSON.stringify(parsed));
 out.push(["10. Cleanup", "Done", ""]);
 } else {
 out.push(["9. Verify L2", "NOT FOUND!", "L2 write failed silently"]);
 }
 }
 } catch (e) {
 out.push(["9. Verify L2", "ERROR", e.message]);
 }
 
 } catch (e) {
 out.push(["FATAL", "ERROR", e.message]);
 }
 
 return out;
}

function DIAG_CHECK_SAFESET_CODE() {
 var out = [["Check", "Result", "Details"]];
 
 // Check safeSet source code
 try {
 var code = CacheManager.safeSet.toString();
 out.push(["safeSet length", code.length + " chars", ""]);
 
 // Check if it contains _packedPut_
 var hasPacked = code.indexOf("_packedPut_") >= 0;
 out.push(["Has _packedPut_?", hasPacked ? "YES" : "NO - BUG!", hasPacked ? "v4.12.16+ code" : "OLD CODE!"]);
 
 // Check if it has the virtual key routing
 var hasVirtual = code.indexOf("_isVirtualKey_") >= 0;
 out.push(["Has _isVirtualKey_?", hasVirtual ? "YES" : "NO", ""]);
 
 // Show first 500 chars
 out.push(["", "", ""]);
 out.push(["=== safeSet code (first 800) ===", "", ""]);
 out.push(["Code", code.substring(0, 800), ""]);
 
 } catch (e) {
 out.push(["safeSet check", "ERROR", e.message]);
 }
 
 // Check safeSetJson source code
 out.push(["", "", ""]);
 try {
 var code2 = CacheManager.safeSetJson.toString();
 out.push(["safeSetJson length", code2.length + " chars", ""]);
 
 // Check if it calls safeSet
 var callsSafeSet = code2.indexOf("safeSet") >= 0;
 out.push(["Calls safeSet?", callsSafeSet ? "YES" : "NO - BUG!", ""]);
 
 out.push(["Code", code2, ""]);
 
 } catch (e) {
 out.push(["safeSetJson check", "ERROR", e.message]);
 }
 
 return out;
}

