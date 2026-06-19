/************************************************************
 * core/TOKENS_CORE.gs - Gestion des tokens ERC20 (multi-chain)
 * 
 * Ce fichier contient la logique token generique.
 * ERC-20 est un standard, donc identique sur toutes les chains.
 * 
 * v4.12.25 - METADATA TIME THRESHOLD FIX
 * - Reduced stringsTimeThreshold from 2400ms to 1200ms
 * - New tokens NEED metadata, so we're more aggressive
 * - Matches changes in 11_EVM_ENGINE.gs for consistent behavior
 *
 * v4.12.3 - CRITICAL FIX: Improved decimals fetching
 * - Reduced time threshold for decimals fetch (1200ms instead of 2400ms)
 * - Always retry "suspect" decimals (previously set to fallback 18)
 * - Decimals are CRITICAL for correct balance calculation
 * v4.9.2 - Added ContractListBuilder for EVM_ENGINE compatibility
 ************************************************************/
var TOKENS_VERSION = "4.12.25";

// ============================================================
// ABI DECODE
// ============================================================

var AbiDecode = {
 
 hexToBytes: function(hex) {
 hex = String(hex || "").replace(/^0x/, "");
 if (!hex || hex.length % 2 !== 0) return [];
 var out = new Array(hex.length / 2);
 for (var i = 0, j = 0; i < hex.length; i += 2, j++) out[j] = parseInt(hex.substr(i, 2), 16);
 return out;
 },
 
 readU256: function(bytes, start) {
 var v = BigInt(0);
 for (var i = 0; i < 32; i++) v = (v << BigInt(8)) + BigInt(bytes[start + i] || 0);
 return v;
 },
 
 bytesToString: function(bytes) {
 if (!bytes || !bytes.length) return "";
 try {
 var s = Utilities.newBlob(bytes).getDataAsString("UTF-8");
 return String(s || "").replace(/\u0000/g, "").trim();
 } catch (e) { return ""; }
 },
 
 decodeStringOrBytes32: function(hex) {
 try {
 hex = String(hex || "");
 if (!hex || hex === "0x") return "";
 if (!/^0x[0-9a-fA-F]+$/.test(hex)) return "";
 
 if (/^0x[0-9a-fA-F]{64}$/.test(hex)) {
 var b32 = this.hexToBytes(hex);
 while (b32.length && b32[b32.length - 1] === 0) b32.pop();
 return this.bytesToString(b32);
 }
 
 var bytes = this.hexToBytes(hex);
 if (bytes.length < 64) return "";
 
 var offsetBI = this.readU256(bytes, 0);
 if (offsetBI < BigInt(0)) offsetBI = BigInt(0);
 var maxOffset = BigInt(Math.max(0, bytes.length - 32));
 if (offsetBI > maxOffset) offsetBI = BigInt(32);
 var offset = Number(offsetBI);
 if (!isFinite(offset) || offset < 0 || offset + 32 > bytes.length) return "";
 
 var lenBI = this.readU256(bytes, offset);
 if (lenBI <= BigInt(0)) return "";
 var MAX_LEN = 256;
 if (lenBI > BigInt(MAX_LEN)) lenBI = BigInt(MAX_LEN);
 var len = Number(lenBI);
 
 var start = offset + 32;
 var end = Math.min(start + len, bytes.length);
 if (end <= start) return "";
 
 return this.bytesToString(bytes.slice(start, end));
 } catch (e) { return ""; }
 }
};

// ============================================================
// TOKEN METADATA
// ============================================================

var TokenMeta = {
 SELECTOR_DECIMALS: "0x313ce567",
 SELECTOR_SYMBOL: "0x95d89b41",
 SELECTOR_NAME: "0x06fdde03",
 
 get: function(rpc, contract, metaMap, nowMs, timer, budget, config) {
 var addr = Addr.normalize(contract);
 var decimalsFallback = (config && config.LIMITS && config.LIMITS.DECIMALS_FALLBACK) || 18;
 var decimalsMax = (config && config.LIMITS && config.LIMITS.DECIMALS_SANITY_MAX) || 36;
 var metaRefreshMs = (config && config.CACHE && config.CACHE.META_REFRESH_MS) || 259200000;
 
 // v4.12.25: Reduced thresholds significantly
 // API calls are fast (~100-300ms), no need to reserve 1200-2400ms
 var decimalsTimeThreshold = 600;
 var stringsTimeThreshold = 600;
 
 if (!addr) return { symbol: "", name: "", decimals: decimalsFallback };
 metaMap = metaMap || {};
 var existing = metaMap[addr] || null;
 
 function isDecimalsValid(d) { return Num.isValid(d) && d >= 0 && d <= decimalsMax; }
 
 if (existing) {
 existing.lastSeenMs = nowMs;
 var lastFetch = Num.isValid(existing.lastFetchMs) ? existing.lastFetchMs : 0;
 var decimals = existing.decimals;
 var decimalsOk = isDecimalsValid(decimals);
 
 // v4.12.3: Also refresh if decimals is 18 and contract is known to have different decimals
 // This helps fix previously corrupted data
 var needRefresh = false;
 if (!decimalsOk) needRefresh = true;
 if (existing.decimalsSuspect) needRefresh = true; // v4.12.3: Always retry suspect decimals
 if (!needRefresh && metaRefreshMs > 0 && (!lastFetch || (nowMs - lastFetch) > metaRefreshMs)) needRefresh = true;
 
 if (needRefresh && !(timer && timer.isLow(decimalsTimeThreshold))) {
 var newDecimals = this._fetchDecimals(rpc, addr, timer, config);
 if (isDecimalsValid(newDecimals)) { existing.decimals = newDecimals; existing.lastFetchMs = nowMs; existing.decimalsSuspect = false; }
 else if (!decimalsOk) { existing.decimals = decimalsFallback; existing.decimalsSuspect = true; }
 }
 
 if ((!existing.symbol || !existing.name) && !(timer && timer.isLow(stringsTimeThreshold))) {
 this._fillStrings(rpc, addr, existing, timer, budget, config);
 }
 
 if (!isDecimalsValid(existing.decimals)) existing.decimals = decimalsFallback;
 return { symbol: existing.symbol || "", name: existing.name || "", decimals: existing.decimals };
 }
 
 var created = { symbol: "", name: "", decimals: decimalsFallback, lastSeenMs: nowMs, lastFetchMs: 0, decimalsSuspect: false };
 
 // v4.12.3: Try to fetch decimals even with less time (critical for correct balances)
 if (timer && timer.isLow(decimalsTimeThreshold)) { metaMap[addr] = created; return { symbol: "", name: "", decimals: created.decimals }; }
 
 var fetchedDecimals = this._fetchDecimals(rpc, addr, timer, config);
 if (isDecimalsValid(fetchedDecimals)) { created.decimals = fetchedDecimals; created.lastFetchMs = nowMs; }
 else { created.decimals = decimalsFallback; created.decimalsSuspect = true; }
 
 this._fillStrings(rpc, addr, created, timer, budget, config);
 if (!isDecimalsValid(created.decimals)) { created.decimals = decimalsFallback; created.decimalsSuspect = true; }
 
 metaMap[addr] = created;
 return { symbol: created.symbol || "", name: created.name || "", decimals: created.decimals };
 },
 
 _fetchDecimals: function(rpc, addr, timer, config) {
 // v4.12.25: Reduced threshold from 2400ms to 800ms
 // RPC call for decimals is fast (~100-200ms)
 try {
 if (!(timer && timer.isLow(800))) {
 var result = RpcClient.call(rpc, "eth_call", [{ to: addr, data: this.SELECTOR_DECIMALS }, "latest"], timer, 1, config);
 var n = parseInt(result, 16);
 var decimalsMax = (config && config.LIMITS && config.LIMITS.DECIMALS_SANITY_MAX) || 36;
 if (!isNaN(n) && n >= 0 && n <= decimalsMax) return n;
 }
 } catch (e) {}
 
 // v4.12.25: Reduced threshold from 2400ms to 600ms for GeckoTerminal fallback
 try {
 if (!(timer && timer.isLow(600))) {
 var gtMeta = PriceSources.getGeckoTerminalMeta(addr, timer, config);
 if (gtMeta && gtMeta.decimals != null) { var d = Number(gtMeta.decimals); if (Num.isValid(d) && d >= 0) return d | 0; }
 }
 } catch (e) {}
 return null;
 },
 
 _fillStrings: function(rpc, addr, obj, timer, budget, config) {
 var allowStrings = budget && budget.allowMetaStrings;
 if (!allowStrings) return;
 
 // v4.12.25: Reduced thresholds from 2400/2900/2700 to 800/1200/1000
 // GeckoTerminal API is fast (~200ms), no need to reserve 2400ms
 if ((!obj.symbol || !obj.name) && !(timer && timer.isLow(800))) {
 var gtMeta = PriceSources.getGeckoTerminalMeta(addr, timer, config);
 if (gtMeta) {
 if (!obj.symbol && gtMeta.symbol) obj.symbol = gtMeta.symbol;
 if (!obj.name && gtMeta.name) obj.name = gtMeta.name;
 }
 }
 
 // v4.12.25: Only use RPC fallback if GeckoTerminal failed and enough time
 if (!obj.symbol && !(timer && timer.isLow(1200))) {
 try {
 var symResult = RpcClient.call(rpc, "eth_call", [{ to: addr, data: this.SELECTOR_SYMBOL }, "latest"], timer, 1, config);
 var sym = AbiDecode.decodeStringOrBytes32(symResult);
 if (sym) obj.symbol = sym;
 } catch (e) {}
 }
 
 if (!obj.name && !(timer && timer.isLow(1000))) {
 try {
 var nameResult = RpcClient.call(rpc, "eth_call", [{ to: addr, data: this.SELECTOR_NAME }, "latest"], timer, 1, config);
 var name = AbiDecode.decodeStringOrBytes32(nameResult);
 if (name) obj.name = name;
 } catch (e) {}
 }
 }
};

// ============================================================
// TOKEN RANGE
// ============================================================

var TokenRange = {
 
 isA1Reference: function(s) {
 if (!s) return false;
 s = String(s).trim();
 if (!s) return false;
 if (s.indexOf("!") !== -1) return true;
 return /^[A-Za-z]{1,3}(\d+)?(:[A-Za-z]{1,3}(\d+)?)?$/.test(s);
 },
 
 readFromA1: function(rangeStr, maxRows, config) {
 try {
 var s = String(rangeStr || "").trim();
 if (!s) return null;
 var ss = SpreadsheetApp.getActive();
 if (!ss) return null;
 var sheet = null, a1 = s;
 var bang = s.lastIndexOf("!");
 if (bang > 0) {
 var sheetName = s.slice(0, bang).replace(/^'/, "").replace(/'$/, "");
 a1 = s.slice(bang + 1);
 sheet = ss.getSheetByName(sheetName);
 if (!sheet) return null;
 } else { sheet = ss.getActiveSheet(); if (!sheet) return null; }
 
 var maxScan = maxRows || (config && config.LIMITS && config.LIMITS.MAX_TOKENS_RANGE_SCAN) || 500;
 var match = a1.match(/^([A-Z]+)(\d+):\1$/i);
 if (match) {
 var col = match[1].toUpperCase();
 var startRow = parseInt(match[2], 10);
 if (isNaN(startRow) || startRow <= 0) startRow = 2;
 var endRow = startRow + Math.max(1, maxScan) - 1;
 a1 = col + startRow + ":" + col + endRow;
 }
 return sheet.getRange(a1).getValues();
 } catch (e) { return null; }
 },
 
 parse: function(tokensRange, config) {
 var out = [];
 var maxScan = (config && config.LIMITS && config.LIMITS.MAX_TOKENS_RANGE_SCAN) || 500;
 
 if (typeof tokensRange === "string" && this.isA1Reference(tokensRange)) {
 var values = this.readFromA1(tokensRange, maxScan, config);
 if (values && Array.isArray(values)) tokensRange = values;
 else return out;
 }
 
 if (!tokensRange || !Array.isArray(tokensRange) || !tokensRange.length) return out;
 
 var seen = {}, scanned = 0;
 for (var i = 0; i < tokensRange.length; i++) {
 if (maxScan > 0 && scanned >= maxScan) break;
 scanned++;
 var row = tokensRange[i];
 var cell = (row && row.length) ? row[0] : null;
 if (cell === null || cell === undefined) break;
 if (typeof cell === "string" && cell.charAt(0) === "#") continue;
 var raw = String(cell).replace(/\u00A0/g, " ").trim();
 if (!raw) break;
 var lower = raw.toLowerCase();
 if (lower === "native") continue;
 if (!Addr.isValid(lower)) continue;
 if (!seen[lower]) { seen[lower] = true; out.push(lower); }
 }
 return out;
 }
};

// ============================================================
// TOKEN SELECTOR
// ============================================================

var TokenSelector = {
 
 hasPositiveBalance: function(contract, cache) {
 if (!cache || !cache.assets) return false;
 var addr = Addr.normalize(contract);
 for (var i = 0; i < cache.assets.length; i++) {
 var asset = cache.assets[i];
 if (!asset || !asset.contract || asset.contract === "native") continue;
 if (Addr.normalize(asset.contract) !== addr) continue;
 if (Num.isPositive(asset.balance)) return true;
 }
 return false;
 },
 
 isRecentlyPurged: function(contract, purgedTsMap, nowMs, config) {
 if (!purgedTsMap) return false;
 var recheckMs = (config && config.CACHE && config.CACHE.RECENT_RECHECK_MS) || 900000;
 var ts = purgedTsMap[Addr.normalize(contract)];
 if (!Num.isValid(ts) || ts <= 0) return false;
 return (nowMs - ts) <= recheckMs;
 },
 
 isRecentlyAttempted: function(contract, attemptTsMap, nowMs, config) {
 if (!attemptTsMap) return false;
 var recheckMs = (config && config.CACHE && config.CACHE.RECENT_RECHECK_MS) || 900000;
 var ts = attemptTsMap[Addr.normalize(contract)];
 if (!Num.isValid(ts) || ts <= 0) return false;
 var age = nowMs - ts;
 return Num.isValid(age) && age >= 0 && age <= recheckMs;
 },
 
 computeScore: function(contract, balanceTsMap, attemptTsMap, purgedTsMap, cache, nowMs, config) {
 var addr = Addr.normalize(contract);
 var hasBal = balanceTsMap && Num.isValid(balanceTsMap[addr]);
 var hasAtt = attemptTsMap && Num.isValid(attemptTsMap[addr]);
 if (!hasBal && !hasAtt) return 1000;
 if (this.isRecentlyPurged(addr, purgedTsMap, nowMs, config)) return 900;
 
 var score = 0;
 if (this.hasPositiveBalance(addr, cache)) score += 500;
 
 var balTs = (balanceTsMap && balanceTsMap[addr]) ? balanceTsMap[addr] : 0;
 if (balTs > 0) {
 var ageHours = (nowMs - balTs) / (3600 * 1000);
 if (Num.isValid(ageHours) && ageHours > 0) score += Math.min(400, ageHours * 10);
 } else { score += 350; }
 
 var attemptTs = (attemptTsMap && attemptTsMap[addr]) ? attemptTsMap[addr] : 0;
 if (attemptTs > 0 && (nowMs - attemptTs) < 5 * 60 * 1000) score -= 50;
 if (this.isRecentlyAttempted(addr, attemptTsMap, nowMs, config)) score += 40;
 
 return score;
 },
 
 selectForRefresh: function(allContracts, cache, balanceTsMap, attemptTsMap, purgedTsMap, nowMs, maxPerRun, rrCursor, config) {
 var out = [];
 if (!allContracts || !allContracts.length || maxPerRun <= 0) return out;
 maxPerRun = Num.clamp(maxPerRun | 0, 0, 120);
 var self = this;
 
 var scored = [];
 for (var i = 0; i < allContracts.length; i++) {
 var addr = Addr.normalize(allContracts[i]);
 scored.push({ contract: addr, score: this.computeScore(addr, balanceTsMap, attemptTsMap, purgedTsMap, cache, nowMs, config) });
 }
 scored.sort(function(a, b) { return b.score - a.score; });
 
 for (var j = 0; j < scored.length && out.length < maxPerRun; j++) out.push(scored[j].contract);
 
 if (out.length < maxPerRun) {
 var remain = maxPerRun - out.length;
 var rr = Arr.pickRoundRobin(allContracts, rrCursor || 0, remain);
 for (var k = 0; k < rr.length && out.length < maxPerRun; k++) {
 var addr2 = Addr.normalize(rr[k]);
 if (out.indexOf(addr2) === -1) out.push(addr2);
 }
 }
 return out;
 }
};

// ============================================================
// CONTRACT LIST BUILDER (v4.9.2)
// Builds the complete list of contracts to scan from:
// 1. tokensRange (user-specified token list from spreadsheet)
// 2. assetByKey (tokens already in cache with balances)
// ============================================================

var ContractListBuilder = {
 
 /**
 * Build list of all contracts to scan
 * @param {string|Array} tokensRange - User-specified token range (A1 ref or array)
 * @param {Object} assetByKey - Map of cached assets keyed by contract address
 * @param {Object} config - Chain configuration
 * @returns {Array} List of contract addresses to scan
 */
 build: function(tokensRange, assetByKey, config) {
 var out = [];
 var seen = {};
 
  // 1. Parse tokensRange (user-specified watchlist)
  var strictRange = !!(config && config.FLAGS && config.FLAGS.STRICT_TOKEN_RANGE);
  var hasTokenRange = false;
  try {
  var fromRange = TokenRange.parse(tokensRange, config);
  if (fromRange && fromRange.length) {
  hasTokenRange = true;
  for (var i = 0; i < fromRange.length; i++) {
  var addr = Addr.normalize(fromRange[i]);
 if (addr && addr !== "native" && !seen[addr]) {
 seen[addr] = true;
 out.push(addr);
 }
  }
  }
  } catch (e) {}
  if (strictRange && hasTokenRange) return out;
 
// 2. Add contracts from existing cache (assetByKey)
 // These are tokens previously discovered with balances
 try {
 if (assetByKey && typeof assetByKey === "object") {
 var keys = Object.keys(assetByKey);
 for (var j = 0; j < keys.length; j++) {
 var key = keys[j];
 if (!key || key === "native") continue;
 var addr2 = Addr.normalize(key);
 if (addr2 && !seen[addr2]) {
 seen[addr2] = true;
 out.push(addr2);
 }
 }
 }
 } catch (e2) {}
 
 // 3. Add chain-level known tokens.
 // Useful for new chains where explorer/RPC shows canonical tokens but the
 // wallet has no prior cache entry and the spreadsheet token range is empty.
 try {
 if (config && config.KNOWN_TOKENS && typeof config.KNOWN_TOKENS === "object") {
 var knownKeys = Object.keys(config.KNOWN_TOKENS);
 for (var kt = 0; kt < knownKeys.length; kt++) {
 var kAddr = Addr.normalize(knownKeys[kt]);
 if (kAddr && kAddr !== "native" && !seen[kAddr]) {
 seen[kAddr] = true;
 out.push(kAddr);
 }
 }
 }
 } catch (e3) {}
 
 // 4. Respect max limit
 var maxTokens = (config && config.LIMITS && config.LIMITS.MAX_TOKENS_RANGE_SCAN) || 500;
 if (out.length > maxTokens) {
 out = out.slice(0, maxTokens);
 }
 
 return out;
 }
};
