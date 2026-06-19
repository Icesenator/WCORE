/************************************************************
 * 02_UTILS.gs - Utilitaires generiques (multi-chain)
 * 
 * v4.9.2 - Added timer.isTimeUp() for EVM_ENGINE compatibility
 * v4.8.1 - Added Arr.pickRoundRobin (was missing, used by 06_TOKENS and 08_ASSETS)
 * v4.8.0 - Phase 1: Added Obj.deepClone, Obj.deepMerge (centralized)
 * v4.2.3 - Renommage pour coherence
 ************************************************************/
var UTILS_VERSION = "4.9.2";

// ============================================================
// NUMBERS
// ============================================================

var Num = {
 parse: function(x) {
 if (x == null) return null;
 if (typeof x === "number") return isFinite(x) ? x : null;
 var s = String(x).trim().replace(/\s+/g, "").replace(",", ".");
 if (!s) return null;
 var n = Number(s);
 return isFinite(n) ? n : null;
 },
 
 parseOr: function(x, defaultVal) {
 var n = this.parse(x);
 return n !== null ? n : (defaultVal !== undefined ? defaultVal : 0);
 },
 
 /**
 * Parse a string to number (alias for parse, used by Cosmos)
 * @param {string} s - String to parse
 * @returns {number|null}
 */
 fromString: function(s) {
 return this.parse(s);
 },
 
 isPositive: function(x) {
 var n = this.parse(x);
 if (n !== null) return n > 0;
 var s = String(x || "").trim();
 if (!s) return false;
 if (/^0+(\.0+)?$/.test(s)) return false;
 return true;
 },
 
 isValidPositive: function(x) {
 return typeof x === "number" && isFinite(x) && x > 0;
 },
 
 isValid: function(x) {
 return typeof x === "number" && isFinite(x);
 },
 
 median: function(arr) {
 var filtered = (arr || []).filter(function(x) {
 return typeof x === "number" && isFinite(x);
 }).sort(function(a, b) { return a - b; });
 if (!filtered.length) return null;
 var mid = Math.floor(filtered.length / 2);
 return filtered.length % 2 ? filtered[mid] : (filtered[mid - 1] + filtered[mid]) / 2;
 },
 
 average: function(arr) {
 var filtered = (arr || []).filter(function(x) {
 return typeof x === "number" && isFinite(x);
 });
 if (!filtered.length) return null;
 var sum = 0;
 for (var i = 0; i < filtered.length; i++) sum += filtered[i];
 return sum / filtered.length;
 },
 
 clamp: function(val, min, max) {
 if (!this.isValid(val)) return min;
 return Math.max(min, Math.min(max, val));
 }
};

// ============================================================
// BIGINT
// ============================================================

var BigNum = {
 median: function(arr) {
 var filtered = (arr || []).filter(function(x) { return typeof x === "bigint"; });
 if (!filtered.length) return null;
 filtered.sort(function(x, y) { return x < y ? -1 : (x > y ? 1 : 0); });
 var mid = Math.floor(filtered.length / 2);
 return filtered.length % 2 ? filtered[mid] : filtered[mid - 1];
 },
 
 toDecimal: function(rawBig, decimals) {
 if (rawBig == null || rawBig === BigInt(0)) return 0;
 decimals = Num.clamp(decimals | 0, 0, 36);
 var negative = rawBig < 0;
 if (negative) rawBig = -rawBig;
 var s = rawBig.toString();
 if (s.length <= 6 && decimals === 0) return negative ? -Number(s) : Number(s);
 if (s.length > decimals + 15) s = s.slice(0, decimals + 15);
 if (s.length <= decimals) s = new Array(decimals - s.length + 2).join("0") + s;
 var intPart = s.slice(0, s.length - decimals);
 var fracPart = s.slice(s.length - decimals);
 if (fracPart.length > 12) fracPart = fracPart.slice(0, 12);
 var numStr = intPart + "." + fracPart;
 var n = Number(numStr);
 if (!isFinite(n)) {
 fracPart = fracPart.replace(/0+$/g, "");
 var str = fracPart ? (intPart + "." + fracPart) : intPart;
 return negative ? ("-" + str) : str;
 }
 return negative ? -n : n;
 }
};

// ============================================================
// ADDRESS
// ============================================================

var Addr = {
 normalize: function(addr) {
 var s = String(addr || "").trim();
 if (!s) return "";
 return (s.indexOf("0x") === 0 || s.indexOf("0X") === 0) ? s.toLowerCase() : s;
 },
 
 isValid: function(addr) {
 var normalized = this.normalize(addr);
 return /^0x[a-f0-9]{40}$/.test(normalized);
 },
 
 pad32: function(addr) {
 return this.normalize(addr).replace(/^0x/, "").padStart(64, "0");
 }
};

// ============================================================
// TIME
// ============================================================

function createTimer(maxMs) {
 var start = Date.now();
 maxMs = maxMs || 30000;
 
 return {
 start: start,
 elapsed: function() { return Date.now() - start; },
 remaining: function() { return maxMs - (Date.now() - start); },
 isLow: function(margin) { return this.remaining() < (margin || 750); },
 canDo: function(estimatedMs) { return this.remaining() > (estimatedMs || 1000); },
 // v4.9.2: Added isTimeUp for EVM_ENGINE compatibility
 isTimeUp: function() { return this.remaining() <= 0; }
 };
}

// ============================================================
// FORMAT
// ============================================================

var Format = {
 datetime: function(ts) {
 if (!Num.isValid(ts) || ts <= 0) return "N/A";
 try {
 return Utilities.formatDate(new Date(ts), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
 } catch (e) { return "N/A"; }
 },
 
 now: function() { return this.datetime(Date.now()); }
};

// ============================================================
// BOOL
// ============================================================

var Bool = {
 parse: function(v) {
 if (typeof v === "boolean") return v;
 if (v == null) return false;
 var s = String(v).trim().toLowerCase();
 return s === "true" || s === "1";
 }
};

// ============================================================
// OBJ (v4.8.0 - Added deepClone, deepMerge)
// ============================================================

var Obj = {
 keyCount: function(obj) {
 if (!obj || typeof obj !== "object" || Array.isArray(obj)) return 0;
 try { return Object.keys(obj).length; } catch (e) { return 0; }
 },
 
 has: function(obj, key) {
 return obj && Object.prototype.hasOwnProperty.call(obj, key);
 },
 
 forEach: function(obj, callback) {
 if (!obj || typeof obj !== "object") return;
 for (var key in obj) {
 if (this.has(obj, key)) callback(key, obj[key]);
 }
 },
 
 /**
 * Deep clone an object or array (v4.8.0)
 * @param {*} obj - Object to clone
 * @returns {*} Deep copy
 */
 deepClone: function(obj) {
 if (obj === null || typeof obj !== "object") return obj;
 if (Array.isArray(obj)) {
 var arr = [];
 for (var i = 0; i < obj.length; i++) {
 arr[i] = this.deepClone(obj[i]);
 }
 return arr;
 }
 var clone = {};
 for (var key in obj) {
 if (Object.prototype.hasOwnProperty.call(obj, key)) {
 clone[key] = this.deepClone(obj[key]);
 }
 }
 return clone;
 },
 
 /**
 * Deep merge source into target (v4.8.0)
 * @param {Object} target
 * @param {Object} source
 * @returns {Object} Modified target
 */
 deepMerge: function(target, source) {
 if (!source) return target;
 for (var key in source) {
 if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
 var srcVal = source[key];
 var tgtVal = target[key];
 if (srcVal && typeof srcVal === "object" && !Array.isArray(srcVal) &&
 tgtVal && typeof tgtVal === "object" && !Array.isArray(tgtVal)) {
 target[key] = this.deepMerge(tgtVal, srcVal);
 } else {
 target[key] = this.deepClone(srcVal);
 }
 }
 return target;
 }
};

// ============================================================
// ARR (v4.8.1 - Added pickRoundRobin)
// ============================================================

var Arr = {
 chunk: function(arr, size) {
 if (!arr || !arr.length) return [];
 size = size || 10;
 var out = [];
 for (var i = 0; i < arr.length; i += size) {
 out.push(arr.slice(i, i + size));
 }
 return out;
 },
 
 unique: function(arr) {
 if (!arr || !arr.length) return [];
 var seen = {};
 var out = [];
 for (var i = 0; i < arr.length; i++) {
 var v = arr[i];
 var key = String(v);
 if (!seen[key]) {
 seen[key] = true;
 out.push(v);
 }
 }
 return out;
 },
 
 flatten: function(arr) {
 if (!arr || !arr.length) return [];
 var out = [];
 for (var i = 0; i < arr.length; i++) {
 if (Array.isArray(arr[i])) {
 out = out.concat(this.flatten(arr[i]));
 } else {
 out.push(arr[i]);
 }
 }
 return out;
 },
 
 /**
 * Pick elements from array in round-robin fashion starting at cursor (v4.8.1)
 * Used by TokenRefresh.selectForRefresh and AssetScanner.fullScan
 * @param {Array} arr - Source array
 * @param {number} cursor - Starting index (will wrap around)
 * @param {number} count - Number of elements to pick
 * @returns {Array} Selected elements
 */
 pickRoundRobin: function(arr, cursor, count) {
 if (!arr || !arr.length || count <= 0) return [];
 var len = arr.length;
 cursor = Num.isValid(cursor) ? (cursor % len) : 0;
 if (cursor < 0) cursor = (cursor % len) + len;
 
 var out = [];
 var picked = 0;
 while (picked < count && picked < len) {
 out.push(arr[(cursor + picked) % len]);
 picked++;
 }
 return out;
 }
};

// ============================================================
// SAFE
// ============================================================

var Safe = {
 get: function(obj, path, defaultVal) {
 if (!obj || !path) return defaultVal;
 var keys = String(path).split(".");
 var current = obj;
 for (var i = 0; i < keys.length; i++) {
 if (current == null || typeof current !== "object") return defaultVal;
 current = current[keys[i]];
 }
 return current !== undefined ? current : defaultVal;
 },
 
 call: function(fn, args, defaultVal) {
 try {
 return fn.apply(null, args || []);
 } catch (e) {
 return defaultVal;
 }
 }
};

// ============================================================
// STRING
// ============================================================

var Str = {
 truncate: function(s, maxLen, suffix) {
 s = String(s || "");
 maxLen = maxLen || 80;
 suffix = suffix || "...";
 if (s.length <= maxLen) return s;
 return s.substring(0, maxLen - suffix.length) + suffix;
 },
 
 padLeft: function(s, len, char) {
 s = String(s || "");
 char = char || " ";
 while (s.length < len) s = char + s;
 return s;
 },
 
 padRight: function(s, len, char) {
 s = String(s || "");
 char = char || " ";
 while (s.length < len) s = s + char;
 return s;
 }
};

// ============================================================
// CACHE KEY UTILITIES (v4.13.5)
// ============================================================

var CacheKeyUtils = {
 /**
  * Check if a ScriptProperties key is a wallet cache key
  */
 isWalletKey: function(key) {
   if (!key) return false;
   var k = String(key).toUpperCase();
   return k.indexOf("WALLET") >= 0 || k.indexOf("_CACHE_0X") >= 0 ||
          k.indexOf("_CACHE_SVM_") >= 0 || k.indexOf("GLOBAL_WALLET_CACHE") >= 0;
 },

 /**
  * Extract chain name from a cache key
  * Pattern: CHAINNAME_CACHE_xxx or CHAINNAME_GLOBAL_xxx
  * @returns {string|null}
  */
 extractChain: function(key) {
   if (!key) return null;
   var match = key.match(/^([A-Z0-9_]+?)_(?:CACHE_|GLOBAL_)/i);
   if (match && match[1]) {
     var name = match[1].toUpperCase();
     if (name !== "GLOBAL" && name !== "WCORE" && name.length > 1) return name;
   }
   return null;
 },

 /**
  * Extract wallet address from a cache key
  * @returns {string|null}
  */
 extractWallet: function(key) {
   if (!key) return null;
   var evmMatch = key.match(/_CACHE_(0x[a-fA-F0-9]+)/i);
   if (evmMatch) return evmMatch[1].toLowerCase();
   var svmMatch = key.match(/_CACHE_SVM_([A-Za-z0-9]+)/i);
   if (svmMatch) return svmMatch[1];
   return null;
 },

 /**
  * Return VM type for a chain name
  * @returns {string} "EVM", "SVM", or "COSMOS"
  */
 getVM: function(chainName) {
   var upper = String(chainName).toUpperCase();
   if (upper === "SOLANA" || upper === "FOGO") return "SVM";
   if (upper === "INJECTIVE" || upper === "TERRA" || upper === "OSMOSIS" || upper === "COSMOS_HUB") return "COSMOS";
   return "EVM";
 }
};
