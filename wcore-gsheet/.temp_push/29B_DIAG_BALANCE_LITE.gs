/************************************************************
 * 29B_DIAG_BALANCE_LITE.gs - Balance Diagnostic LITE (v4.12.2)
 * 
 * Version allegee pour eviter les timeouts.
 * Un seul appel RPC, diagnostic rapide.
 * 
 * FONCTIONS:
 * - TRACE_BALANCE_LITE(chain, wallet, contract)
 * - TRACE_RPC_SINGLE(chain, wallet, contract)
 * - TRACE_CACHE_ONLY(chain, wallet, contract)
 * 
 ************************************************************/

/**
 * Diagnostic rapide : 1 RPC + cache + comparaison
 * @customfunction
 */
function TRACE_BALANCE_LITE(chain, wallet, contract) {
 var out = [["Step", "Value", "Details"]];
 
 try {
 chain = String(chain || "").toUpperCase();
 wallet = String(wallet || "").toLowerCase();
 contract = String(contract || "").toLowerCase();
 
 out.push(["Chain", chain, ""]);
 out.push(["Wallet", wallet.substring(0, 20) + "...", ""]);
 out.push(["Contract", contract.substring(0, 20) + "...", ""]);
 out.push(["", "", ""]);
 
 // === 1. Get chain config ===
 var chainConfig = null;
 try {
 var varName = "_" + chain;
 var chainObj = eval(varName);
 if (chainObj && chainObj.getConfig) {
 chainConfig = chainObj.getConfig();
 }
 } catch (e) {}
 
 if (!chainConfig) {
 out.push(["ERROR", "Chain config not found", ""]);
 return out;
 }
 
 var rpc = (chainConfig.RPC && chainConfig.RPC.ENDPOINTS && chainConfig.RPC.ENDPOINTS[0]) || null;
 if (!rpc) {
 out.push(["ERROR", "No RPC endpoint", ""]);
 return out;
 }
 out.push(["RPC", rpc.substring(0, 50) + "...", ""]);
 
 // === 2. Fetch from RPC (single call) ===
 out.push(["", "", ""]);
 out.push(["=== RPC ===", "", ""]);
 
 var rpcBalance = null;
 var rpcDecimals = 18;
 var rpcError = null;
 
 try {
 if (contract === "native") {
 var payload = {
 jsonrpc: "2.0",
 id: 1,
 method: "eth_getBalance",
 params: [wallet, "latest"]
 };
 
 var response = UrlFetchApp.fetch(rpc, {
 method: "post",
 contentType: "application/json",
 payload: JSON.stringify(payload),
 muteHttpExceptions: true,
 timeout: 10000
 });
 
 var json = JSON.parse(response.getContentText());
 if (json.error) {
 rpcError = json.error.message;
 } else {
 rpcDecimals = (chainConfig.CHAIN && chainConfig.CHAIN.NATIVE_DECIMALS) || 18;
 var wei = parseInt(json.result, 16);
 rpcBalance = wei / Math.pow(10, rpcDecimals);
 out.push(["RPC Raw", json.result, ""]);
 }
 } else {
 // ERC20 balanceOf
 var balanceOfSig = "0x70a08231";
 var paddedWallet = wallet.replace("0x", "").toLowerCase().padStart(64, "0");
 var data = balanceOfSig + paddedWallet;
 
 var payload = {
 jsonrpc: "2.0",
 id: 1,
 method: "eth_call",
 params: [{ to: contract, data: data }, "latest"]
 };
 
 var response = UrlFetchApp.fetch(rpc, {
 method: "post",
 contentType: "application/json",
 payload: JSON.stringify(payload),
 muteHttpExceptions: true,
 timeout: 10000
 });
 
 var json = JSON.parse(response.getContentText());
 if (json.error) {
 rpcError = json.error.message;
 } else {
 out.push(["RPC Raw", json.result, ""]);
 
 // Get decimals
 var decPayload = {
 jsonrpc: "2.0",
 id: 2,
 method: "eth_call",
 params: [{ to: contract, data: "0x313ce567" }, "latest"]
 };
 
 var decResponse = UrlFetchApp.fetch(rpc, {
 method: "post",
 contentType: "application/json",
 payload: JSON.stringify(decPayload),
 muteHttpExceptions: true,
 timeout: 5000
 });
 
 var decJson = JSON.parse(decResponse.getContentText());
 if (decJson.result && decJson.result !== "0x") {
 rpcDecimals = parseInt(decJson.result, 16);
 }
 
 // Parse balance
 if (!json.result || json.result === "0x" || json.result === "0x0") {
 rpcBalance = 0;
 } else {
 // Handle large numbers properly
 var hexStr = json.result.replace("0x", "");
 rpcBalance = _lite_hexToDecimal(hexStr, rpcDecimals);
 }
 }
 }
 } catch (e) {
 rpcError = e.message;
 }
 
 out.push(["RPC Decimals", rpcDecimals, ""]);
 
 if (rpcError) {
 out.push(["RPC ERROR", rpcError, ""]);
 } else {
 out.push(["RPC Balance", rpcBalance !== null ? rpcBalance.toFixed(12) : "ERROR", ""]);
 }
 
 // === 3. Read from cache ===
 out.push(["", "", ""]);
 out.push(["=== CACHE ===", "", ""]);
 
 var cacheBalance = null;
 var cacheSymbol = null;
 var cacheSource = "NOT FOUND";
 var cacheAge = null;
 
 try {
 var props = PropertiesService.getScriptProperties();
 var cacheKey = chain + "_CACHE_WALLET_" + wallet;
 
 out.push(["Cache Key", cacheKey.substring(0, 40) + "...", ""]);
 
 // Compute hash like CacheManager does
 var hash = _lite_hashKey(cacheKey);
 out.push(["Cache Hash", hash, ""]);
 
 // Try packed cache first (with hash lookup!)
 var packedRaw = props.getProperty("GLOBAL_WALLET_CACHE_V1");
 var rawData = null;
 
 if (packedRaw) {
 try {
 var packedObj = JSON.parse(packedRaw);
 
 // The cache uses packed.m[hash] not packed[key]!
 if (packedObj.m && packedObj.m[hash]) {
 var entry = packedObj.m[hash];
 
 // Entry can be array (hash collision) or single object
 if (Array.isArray(entry)) {
 for (var ei = 0; ei < entry.length; ei++) {
 if (entry[ei] && entry[ei].k === cacheKey) {
 rawData = _lite_readEntry(entry[ei]);
 cacheSource = "PACKED (array)";
 break;
 }
 }
 } else if (entry && entry.k === cacheKey) {
 rawData = _lite_readEntry(entry);
 cacheSource = "PACKED (single)";
 } else if (entry && !entry.k) {
 // Old format without key verification
 rawData = _lite_readEntry(entry);
 cacheSource = "PACKED (legacy)";
 }
 }
 } catch (e) {
 out.push(["Parse error", e.message, ""]);
 }
 }
 
 // Try direct property as fallback
 if (!rawData) {
 var direct = props.getProperty(cacheKey);
 if (direct) {
 try {
 rawData = JSON.parse(direct);
 cacheSource = "DIRECT";
 } catch (e) {}
 }
 }
 
 if (rawData) {
 // Inflate if deflated
 if (rawData.a && !rawData.assets) {
 if (typeof CacheManager !== "undefined" && CacheManager._inflateWalletPayload_) {
 rawData = CacheManager._inflateWalletPayload_(rawData);
 } else {
 // Manual inflate
 rawData = _lite_inflatePayload(rawData);
 }
 }
 
 // Get age
 var upAt = rawData.updatedAt || rawData.u;
 if (upAt) {
 if (typeof upAt === "number" && upAt < 2000000000) upAt = upAt * 1000;
 cacheAge = Math.round((Date.now() - upAt) / 60000) + " min ago";
 }
 
 // Find contract
 var assets = rawData.assets || [];
 for (var i = 0; i < assets.length; i++) {
 var a = assets[i];
 if (a && a.contract && String(a.contract).toLowerCase() === contract) {
 cacheBalance = parseFloat(a.balance);
 cacheSymbol = a.symbol || "?";
 break;
 }
 }
 
 // If not found, check if contract is shortened in cache
 if (cacheBalance === null && contract !== "native") {
 var shortContract = contract.substring(0, 10).toLowerCase();
 for (var j = 0; j < assets.length; j++) {
 var a2 = assets[j];
 if (a2 && a2.contract && String(a2.contract).toLowerCase().indexOf(shortContract) === 0) {
 cacheBalance = parseFloat(a2.balance);
 cacheSymbol = a2.symbol || "?";
 out.push(["Found via short match", a2.contract, ""]);
 break;
 }
 }
 }
 }
 } catch (e) {
 cacheSource = "ERROR: " + e.message;
 }
 
 out.push(["Cache Source", cacheSource, ""]);
 out.push(["Cache Age", cacheAge || "N/A", ""]);
 out.push(["Cache Symbol", cacheSymbol || "N/A", ""]);
 out.push(["Cache Balance", cacheBalance !== null ? cacheBalance.toFixed(12) : "NOT FOUND", ""]);
 
 // === 4. Comparison ===
 out.push(["", "", ""]);
 out.push(["=== COMPARISON ===", "", ""]);
 
 if (rpcBalance !== null && cacheBalance !== null) {
 var diff = rpcBalance - cacheBalance;
 var pctDiff = cacheBalance !== 0 ? Math.abs(diff / cacheBalance * 100) : (rpcBalance !== 0 ? 100 : 0);
 
 out.push(["RPC (truth)", rpcBalance.toFixed(12), ""]);
 out.push(["Cache", cacheBalance.toFixed(12), ""]);
 out.push(["Difference", diff.toFixed(12), ""]);
 out.push(["Diff %", pctDiff.toFixed(4) + "%", ""]);
 
 var status = "OK";
 if (pctDiff > 5) status = "!!! MISMATCH - CRITICAL !!!";
 else if (pctDiff > 1) status = "!! DRIFT - WARNING !!";
 else if (pctDiff > 0.01) status = "Minor drift";
 
 out.push(["STATUS", status, pctDiff > 1 ? "CACHE IS STALE!" : ""]);
 } else {
 out.push(["Cannot compare", "Missing data", ""]);
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, ""]);
 }
 
 return out;
}

/**
 * Parse hex string to decimal with decimals
 */
function _lite_hexToDecimal(hexStr, decimals) {
 // Remove leading zeros
 hexStr = hexStr.replace(/^0+/, "") || "0";
 
 // For small numbers, use parseInt
 if (hexStr.length <= 12) {
 var raw = parseInt(hexStr, 16);
 return raw / Math.pow(10, decimals);
 }
 
 // For large numbers, manual conversion
 var result = 0;
 for (var i = 0; i < hexStr.length; i++) {
 var digit = parseInt(hexStr[i], 16);
 result = result * 16 + digit;
 }
 return result / Math.pow(10, decimals);
}

/**
 * Hash key like CacheManager does (FNV-1a)
 */
function _lite_hashKey(key) {
 key = String(key || "");
 var h = 0x811c9dc5;
 for (var i = 0; i < key.length; i++) {
 h ^= key.charCodeAt(i);
 h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
 }
 return h.toString(36);
}

/**
 * Read cache entry (handles deflated format)
 */
function _lite_readEntry(entry) {
 if (!entry) return null;
 if (typeof entry === "string") {
 try { return JSON.parse(entry); } catch (e) { return null; }
 }
 if (typeof entry !== "object") return null;
 
 // Check TTL
 var ts = entry.ts || entry.t || 0;
 var nowSec = Math.floor(Date.now() / 1000);
 var cutoff = nowSec - (14 * 24 * 3600); // 14 days
 if (ts > 0 && ts < cutoff) return null; // Expired
 
 // Deflated format: { j: true, v: deflatedPayload }
 if (entry.j && entry.v) {
 return _lite_inflatePayload(entry.v);
 }
 
 // String format
 if (entry.s !== undefined) {
 try { return JSON.parse(String(entry.s)); } catch (e) { return null; }
 }
 
 // Direct object
 return entry.v || entry;
}

/**
 * Inflate deflated wallet payload
 */
function _lite_inflatePayload(d) {
 if (!d) return null;
 
 // Already inflated?
 if (d.assets) return d;
 
 var out = {
 updatedAt: d.u ? (d.u < 2000000000 ? d.u * 1000 : d.u) : null,
 version: d.v || null,
 assets: [],
 priceMap: d.pm || {},
 priceTsMap: d.ptm || {},
 balanceTsMap: d.btm || {},
 attemptTsMap: d.atm || {},
 purgedTsMap: d.pum || {},
 rrCursor: d.rr || 0,
 last_full_scan_ms: d.lfs || 0,
 last_full_price_ms: d.lfp || 0
 };
 
 // Inflate assets from compact array format
 // Format: [[contract, symbol, name, balance, price_eur], ...]
 if (d.a && Array.isArray(d.a)) {
 for (var i = 0; i < d.a.length; i++) {
 var row = d.a[i];
 if (!row) continue;
 
 if (Array.isArray(row)) {
 out.assets.push({
 contract: row[0] || "",
 symbol: row[1] || "",
 name: row[2] || "",
 balance: row[3],
 price_eur: row[4]
 });
 } else if (typeof row === "object") {
 out.assets.push(row);
 }
 }
 }
 
 return out;
}

/**
 * Test RPC only - single endpoint
 * @customfunction
 */
function TRACE_RPC_SINGLE(chain, wallet, contract) {
 var out = [["Field", "Value"]];
 
 try {
 chain = String(chain || "").toUpperCase();
 wallet = String(wallet || "").toLowerCase();
 contract = String(contract || "").toLowerCase();
 
 // Get config
 var chainConfig = null;
 try {
 var varName = "_" + chain;
 var chainObj = eval(varName);
 if (chainObj && chainObj.getConfig) chainConfig = chainObj.getConfig();
 } catch (e) {}
 
 if (!chainConfig) return [["ERROR", "No config for " + chain]];
 
 var rpc = (chainConfig.RPC && chainConfig.RPC.ENDPOINTS && chainConfig.RPC.ENDPOINTS[0]) || null;
 if (!rpc) return [["ERROR", "No RPC endpoint"]];
 
 out.push(["RPC", rpc]);
 
 // Single call
 var payload;
 if (contract === "native") {
 payload = { jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [wallet, "latest"] };
 } else {
 var data = "0x70a08231" + wallet.replace("0x", "").padStart(64, "0");
 payload = { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: contract, data: data }, "latest"] };
 }
 
 var response = UrlFetchApp.fetch(rpc, {
 method: "post",
 contentType: "application/json",
 payload: JSON.stringify(payload),
 muteHttpExceptions: true,
 timeout: 15000
 });
 
 var json = JSON.parse(response.getContentText());
 
 out.push(["Response code", response.getResponseCode()]);
 out.push(["Raw result", json.result || "null"]);
 
 if (json.error) {
 out.push(["RPC Error", JSON.stringify(json.error)]);
 }
 
 // Parse
 if (json.result && json.result !== "0x") {
 var decimals = contract === "native" 
 ? ((chainConfig.CHAIN && chainConfig.CHAIN.NATIVE_DECIMALS) || 18)
 : 8; // Default for most tokens, you may need to adjust
 
 var hexStr = json.result.replace("0x", "").replace(/^0+/, "") || "0";
 var balance = _lite_hexToDecimal(hexStr, decimals);
 out.push(["Decimals (assumed)", decimals]);
 out.push(["Parsed balance", balance.toFixed(12)]);
 }
 
 } catch (e) {
 out.push(["ERROR", e.message]);
 }
 
 return out;
}

/**
 * Read cache only - no RPC
 * @customfunction
 */
function TRACE_CACHE_ONLY(chain, wallet, contract) {
 var out = [["Field", "Value"]];
 
 try {
 chain = String(chain || "").toUpperCase();
 wallet = String(wallet || "").toLowerCase();
 contract = String(contract || "").toLowerCase();
 
 var props = PropertiesService.getScriptProperties();
 var cacheKey = chain + "_CACHE_WALLET_" + wallet;
 var hash = _lite_hashKey(cacheKey);
 
 out.push(["Cache key", cacheKey]);
 out.push(["Hash", hash]);
 
 // Check packed cache with hash lookup
 var packedRaw = props.getProperty("GLOBAL_WALLET_CACHE_V1");
 var rawData = null;
 var source = "NOT FOUND";
 
 if (packedRaw) {
 try {
 var packedObj = JSON.parse(packedRaw);
 out.push(["Packed keys", packedObj.m ? Object.keys(packedObj.m).length : 0]);
 
 if (packedObj.m && packedObj.m[hash]) {
 var entry = packedObj.m[hash];
 
 if (Array.isArray(entry)) {
 for (var ei = 0; ei < entry.length; ei++) {
 if (entry[ei] && entry[ei].k === cacheKey) {
 rawData = _lite_readEntry(entry[ei]);
 source = "PACKED (array[" + ei + "])";
 break;
 }
 }
 } else if (entry && entry.k === cacheKey) {
 rawData = _lite_readEntry(entry);
 source = "PACKED (single)";
 } else if (entry && !entry.k) {
 rawData = _lite_readEntry(entry);
 source = "PACKED (legacy)";
 }
 }
 } catch (e) {
 out.push(["Parse error", e.message]);
 }
 }
 
 if (!rawData) {
 var direct = props.getProperty(cacheKey);
 if (direct) {
 try {
 rawData = JSON.parse(direct);
 source = "DIRECT";
 } catch (e) {}
 }
 }
 
 out.push(["Source", source]);
 
 if (!rawData) {
 out.push(["Status", "NO CACHE"]);
 return out;
 }
 
 // Inflate if needed
 if (rawData.a && !rawData.assets) {
 rawData = _lite_inflatePayload(rawData);
 }
 
 // Metadata
 var upAt = rawData.updatedAt || rawData.u;
 if (upAt) {
 if (typeof upAt === "number" && upAt < 2000000000) upAt = upAt * 1000;
 out.push(["Updated", new Date(upAt).toISOString()]);
 out.push(["Age", Math.round((Date.now() - upAt) / 60000) + " min"]);
 }
 
 out.push(["Version", rawData.version || rawData.v || "?"]);
 
 // Assets
 var assets = rawData.assets || [];
 out.push(["Total assets", assets.length]);
 
 var found = false;
 for (var i = 0; i < assets.length; i++) {
 var a = assets[i];
 if (a && a.contract) {
 var c = String(a.contract).toLowerCase();
 // Check full match or partial match (contracts may be shortened)
 if (c === contract || (contract.length > 10 && c.indexOf(contract.substring(0, 10)) === 0)) {
 out.push(["", ""]);
 out.push(["=== FOUND ===", ""]);
 out.push(["Contract", a.contract]);
 out.push(["Symbol", a.symbol || "?"]);
 out.push(["Name", a.name || "?"]);
 out.push(["Balance", a.balance]);
 out.push(["Price EUR", a.price_eur || "?"]);
 found = true;
 break;
 }
 }
 }
 
 if (!found) {
 out.push(["Contract", "NOT IN CACHE"]);
 
 // List all cached assets
 out.push(["", ""]);
 out.push(["=== All cached assets ===", ""]);
 for (var j = 0; j < assets.length; j++) {
 var aa = assets[j];
 out.push([(aa.symbol || "?") + " (" + (aa.contract || "?").substring(0, 15) + "...)", aa.balance]);
 }
 }
 
 } catch (e) {
 out.push(["ERROR", e.message]);
 }
 
 return out;
}
