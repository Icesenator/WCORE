/************************************************************
 * 29_DIAG_BALANCE_TRACE.gs - Balance Diagnostic Tracer (v4.12.2)
 * 
 * Diagnostic approfondi pour comprendre pourquoi les balances
 * sont incorrectes meme apres force=true.
 * 
 * TESTS:
 * 1. RPC direct : Fetch balance directement sans passer par le cache
 * 2. Cache actuel : Lire ce qui est stocke
 * 3. Comparaison : Identifier l'ecart
 * 4. Trace complete : Suivre le flux de donnees
 * 
 * FONCTIONS:
 * - TRACE_BALANCE(chain, wallet, contract) : Diagnostic complet
 * - TRACE_RPC_RAW(chain, wallet, contract) : Appel RPC brut
 * - TRACE_CACHE_RAW(chain, wallet) : Lecture cache brut
 * - TRACE_FULL_REFRESH(chain, wallet) : Force refresh avec trace
 * 
 ************************************************************/

// ============================================================
// TRACE BALANCE - DIAGNOSTIC COMPLET
// ============================================================

/**
 * Diagnostic complet d'une balance specifique
 * Compare RPC direct vs Cache vs ce que GET_WALLET_ASSETS retourne
 * 
 * @param {string} chain - Ex: "BASE"
 * @param {string} wallet - Ex: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080"
 * @param {string} contract - Ex: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf" ou "native"
 * @customfunction
 */
function TRACE_BALANCE(chain, wallet, contract) {
 var out = [["Step", "Source", "Value", "Details"]];
 
 try {
 chain = String(chain || "").toUpperCase();
 wallet = String(wallet || "").toLowerCase();
 contract = String(contract || "").toLowerCase();
 
 out.push(["INPUT", "Chain", chain, ""]);
 out.push(["INPUT", "Wallet", wallet, ""]);
 out.push(["INPUT", "Contract", contract, ""]);
 out.push(["", "", "", ""]);
 
 // === STEP 1: Get chain config ===
 var chainConfig = _trace_getChainConfig(chain);
 if (!chainConfig) {
 out.push(["ERROR", "Chain config", "NOT FOUND", "Chain " + chain + " not configured"]);
 return out;
 }
 out.push(["CONFIG", "Chain found", "OK", chainConfig.CHAIN ? chainConfig.CHAIN.DISPLAY_NAME || chain : chain]);
 
 // Get RPC endpoints
 var endpoints = [];
 if (chainConfig.RPC && chainConfig.RPC.ENDPOINTS) {
 endpoints = chainConfig.RPC.ENDPOINTS;
 }
 out.push(["CONFIG", "RPC endpoints", endpoints.length, endpoints.slice(0, 3).join(", ")]);
 
 // === STEP 2: Fetch from RPC directly (multiple RPCs for comparison) ===
 out.push(["", "", "", ""]);
 out.push(["=== RPC DIRECT ===", "", "", ""]);
 
 var rpcResults = [];
 var decimals = 18;
 
 for (var i = 0; i < Math.min(endpoints.length, 3); i++) {
 var rpc = endpoints[i];
 var rpcResult = _trace_fetchBalanceRaw(wallet, contract, rpc, chainConfig);
 
 out.push(["RPC " + (i+1), rpc.substring(0, 40) + "...", "", ""]);
 out.push(["", "Raw hex", rpcResult.rawHex || "ERROR", ""]);
 out.push(["", "Decimals", rpcResult.decimals, ""]);
 out.push(["", "Balance", rpcResult.balance !== null ? rpcResult.balance.toFixed(12) : "ERROR", rpcResult.error || ""]);
 
 if (rpcResult.balance !== null) {
 rpcResults.push(rpcResult.balance);
 decimals = rpcResult.decimals;
 }
 }
 
 // Consensus
 var rpcConsensus = null;
 if (rpcResults.length > 0) {
 rpcConsensus = rpcResults[0]; // Prendre le premier pour simplifier
 if (rpcResults.length > 1) {
 // Verifier si tous les RPCs retournent la meme valeur
 var allSame = rpcResults.every(function(v) { return Math.abs(v - rpcResults[0]) < 0.0000001; });
 out.push(["RPC CONSENSUS", allSame ? "UNANIMOUS" : "DIVERGENT", rpcConsensus.toFixed(12), ""]);
 }
 }
 
 // === STEP 3: Read from cache ===
 out.push(["", "", "", ""]);
 out.push(["=== CACHE ===", "", "", ""]);
 
 var cacheResult = _trace_readCache(chain, wallet, contract);
 out.push(["CACHE", "Key", cacheResult.cacheKey, ""]);
 out.push(["CACHE", "Source", cacheResult.source, ""]);
 out.push(["CACHE", "updatedAt", cacheResult.updatedAt || "N/A", cacheResult.cacheAge || ""]);
 out.push(["CACHE", "Balance", cacheResult.balance !== null ? cacheResult.balance.toFixed(12) : "NOT FOUND", ""]);
 out.push(["CACHE", "Symbol", cacheResult.symbol || "?", ""]);
 
 // === STEP 4: Compare ===
 out.push(["", "", "", ""]);
 out.push(["=== COMPARISON ===", "", "", ""]);
 
 if (rpcConsensus !== null && cacheResult.balance !== null) {
 var diff = rpcConsensus - cacheResult.balance;
 var pctDiff = cacheResult.balance !== 0 ? Math.abs(diff / cacheResult.balance * 100) : (rpcConsensus !== 0 ? 100 : 0);
 
 out.push(["COMPARE", "RPC balance", rpcConsensus.toFixed(12), ""]);
 out.push(["COMPARE", "Cache balance", cacheResult.balance.toFixed(12), ""]);
 out.push(["COMPARE", "Difference", diff.toFixed(12), ""]);
 out.push(["COMPARE", "Difference %", pctDiff.toFixed(4) + "%", ""]);
 
 var status = "OK";
 if (pctDiff > 5) status = "MISMATCH - CRITICAL";
 else if (pctDiff > 1) status = "DRIFT - WARNING";
 else if (pctDiff > 0.01) status = "MINOR DRIFT";
 
 out.push(["STATUS", status, "", pctDiff > 1 ? "Cache is STALE!" : ""]);
 } else {
 out.push(["COMPARE", "Cannot compare", "", "Missing RPC or cache data"]);
 }
 
 // === STEP 5: Check what GET_WALLET_ASSETS would return ===
 out.push(["", "", "", ""]);
 out.push(["=== GET_WALLET_ASSETS OUTPUT ===", "", "", ""]);
 
 try {
 var getFuncName = "GET_WALLET_ASSETS_" + chain;
 var getFunc = eval(getFuncName);
 if (typeof getFunc === "function") {
 var getResult = getFunc(wallet, "", false);
 
 // Find the contract in output
 var foundInOutput = null;
 for (var r = 0; r < getResult.length; r++) {
 var row = getResult[r];
 if (row && row[3] && String(row[3]).toLowerCase() === contract) {
 foundInOutput = row;
 break;
 }
 }
 
 if (foundInOutput) {
 out.push(["OUTPUT", "Symbol", foundInOutput[1], ""]);
 out.push(["OUTPUT", "Balance", foundInOutput[4], ""]);
 out.push(["OUTPUT", "Price EUR", foundInOutput[5], ""]);
 out.push(["OUTPUT", "Value EUR", foundInOutput[6], ""]);
 
 // Compare with RPC
 var outputBal = parseFloat(String(foundInOutput[4]).replace(",", "."));
 if (!isNaN(outputBal) && rpcConsensus !== null) {
 var outputDiff = rpcConsensus - outputBal;
 var outputPct = outputBal !== 0 ? Math.abs(outputDiff / outputBal * 100) : 0;
 out.push(["OUTPUT vs RPC", "Difference", outputDiff.toFixed(12), outputPct.toFixed(4) + "%"]);
 
 if (outputPct > 1) {
 out.push(["PROBLEM", "GET_WALLET_ASSETS returns WRONG balance!", "", "Even after refresh!"]);
 }
 }
 } else {
 out.push(["OUTPUT", "Contract not found in output", "", ""]);
 }
 }
 } catch (e) {
 out.push(["OUTPUT", "Error calling GET_WALLET_ASSETS", e.message, ""]);
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, "", ""]);
 out.push(["STACK", String(e.stack || "").substring(0, 200), "", ""]);
 }
 
 return out;
}

// ============================================================
// TRACE RPC RAW - APPEL RPC DIRECT SANS AUCUN CACHE
// ============================================================

/**
 * Appel RPC brut pour une balance
 * @customfunction
 */
function TRACE_RPC_RAW(chain, wallet, contract) {
 var out = [["RPC", "Raw Hex", "Decimals", "Balance"]];
 
 try {
 chain = String(chain || "").toUpperCase();
 wallet = String(wallet || "").toLowerCase();
 contract = String(contract || "").toLowerCase();
 
 var chainConfig = _trace_getChainConfig(chain);
 if (!chainConfig) {
 return [["ERROR", "Chain not found: " + chain, "", ""]];
 }
 
 var endpoints = (chainConfig.RPC && chainConfig.RPC.ENDPOINTS) || [];
 
 for (var i = 0; i < Math.min(endpoints.length, 5); i++) {
 var rpc = endpoints[i];
 var result = _trace_fetchBalanceRaw(wallet, contract, rpc, chainConfig);
 
 out.push([
 rpc.substring(0, 50),
 result.rawHex || result.error || "ERROR",
 result.decimals,
 result.balance !== null ? result.balance.toString() : "ERROR"
 ]);
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, "", ""]);
 }
 
 return out;
}

// ============================================================
// TRACE CACHE RAW - LECTURE CACHE BRUT
// ============================================================

/**
 * Lecture du cache brut pour un wallet
 * @customfunction
 */
function TRACE_CACHE_RAW(chain, wallet) {
 var out = [["Field", "Value"]];
 
 try {
 chain = String(chain || "").toUpperCase();
 wallet = String(wallet || "").toLowerCase();
 
 var cacheKey = chain + "_CACHE_WALLET_" + wallet;
 out.push(["Cache Key", cacheKey]);
 
 var props = PropertiesService.getScriptProperties();
 
 // Check packed cache
 var packed = props.getProperty("GLOBAL_WALLET_CACHE_V1");
 var rawData = null;
 var source = "NOT FOUND";
 
 if (packed) {
 try {
 var packedObj = JSON.parse(packed);
 if (packedObj[cacheKey]) {
 rawData = packedObj[cacheKey];
 source = "GLOBAL_WALLET_CACHE_V1 (packed)";
 }
 } catch (e) {}
 }
 
 // Check direct
 if (!rawData) {
 var direct = props.getProperty(cacheKey);
 if (direct) {
 try {
 rawData = JSON.parse(direct);
 source = "Direct property";
 } catch (e) {}
 }
 }
 
 out.push(["Source", source]);
 
 if (!rawData) {
 out.push(["Status", "NO CACHE FOUND"]);
 return out;
 }
 
 // Check format
 var isDeflated = rawData.a && !rawData.assets;
 out.push(["Format", isDeflated ? "DEFLATED" : "INFLATED"]);
 
 // Show raw fields
 out.push(["", ""]);
 out.push(["=== RAW FIELDS ===", ""]);
 
 var fields = Object.keys(rawData);
 for (var i = 0; i < fields.length; i++) {
 var f = fields[i];
 var v = rawData[f];
 
 if (f === "a" || f === "assets") {
 out.push([f, Array.isArray(v) ? v.length + " assets" : typeof v]);
 } else if (f === "pm" || f === "priceMap") {
 out.push([f, typeof v === "object" ? Object.keys(v).length + " prices" : typeof v]);
 } else if (typeof v === "object") {
 out.push([f, JSON.stringify(v).substring(0, 80)]);
 } else {
 out.push([f, String(v)]);
 }
 }
 
 // Inflate and show assets
 if (isDeflated && typeof CacheManager !== "undefined" && CacheManager._inflateWalletPayload_) {
 rawData = CacheManager._inflateWalletPayload_(rawData);
 }
 
 out.push(["", ""]);
 out.push(["=== ASSETS ===", ""]);
 
 var assets = rawData.assets || [];
 for (var j = 0; j < assets.length; j++) {
 var a = assets[j];
 out.push([(a.symbol || "?") + " (" + (a.contract || "?").substring(0, 15) + "...)", a.balance]);
 }
 
 } catch (e) {
 out.push(["ERROR", e.message]);
 }
 
 return out;
}

// ============================================================
// TRACE FULL REFRESH - FORCE REFRESH AVEC TRACE DETAILLEE
// ============================================================

/**
 * Force un refresh avec trace detaillee pour voir ou ca plante
 * @customfunction
 */
function TRACE_FULL_REFRESH(chain, wallet, contract) {
 var out = [["Step", "Action", "Result", "Details"]];
 
 try {
 chain = String(chain || "").toUpperCase();
 wallet = String(wallet || "").toLowerCase();
 contract = String(contract || "native").toLowerCase();
 
 out.push(["START", "Chain: " + chain, "Wallet: " + wallet.substring(0, 15) + "...", "Contract: " + contract.substring(0, 15) + "..."]);
 out.push(["", "", "", ""]);
 
 // Step 1: Read current cache
 out.push(["1. BEFORE", "Reading cache...", "", ""]);
 var beforeCache = _trace_readCache(chain, wallet, contract);
 out.push(["", "Cache balance BEFORE", beforeCache.balance !== null ? beforeCache.balance.toFixed(12) : "NOT FOUND", ""]);
 
 // Step 2: Read RPC balance before
 out.push(["2. RPC CHECK", "Fetching from RPC...", "", ""]);
 var chainConfig = _trace_getChainConfig(chain);
 var rpc = (chainConfig.RPC && chainConfig.RPC.ENDPOINTS && chainConfig.RPC.ENDPOINTS[0]) || null;
 
 if (!rpc) {
 out.push(["ERROR", "No RPC endpoint", "", ""]);
 return out;
 }
 
 var rpcBefore = _trace_fetchBalanceRaw(wallet, contract, rpc, chainConfig);
 out.push(["", "RPC balance", rpcBefore.balance !== null ? rpcBefore.balance.toFixed(12) : "ERROR", rpcBefore.error || ""]);
 
 // Step 3: Call GET_WALLET_ASSETS with force=true
 out.push(["3. FORCE REFRESH", "Calling GET_WALLET_ASSETS_" + chain + " with force=TRUE...", "", ""]);
 
 var refreshResult = null;
 var refreshError = null;
 
 try {
 var getFuncName = "GET_WALLET_ASSETS_" + chain;
 var getFunc = eval(getFuncName);
 if (typeof getFunc === "function") {
 refreshResult = getFunc(wallet, "", true); // force=true
 out.push(["", "Refresh completed", refreshResult.length + " rows", ""]);
 } else {
 refreshError = "Function not found: " + getFuncName;
 }
 } catch (e) {
 refreshError = e.message;
 }
 
 if (refreshError) {
 out.push(["ERROR", "Refresh failed", refreshError, ""]);
 return out;
 }
 
 // Step 4: Find the contract in refresh result
 out.push(["4. OUTPUT CHECK", "Looking for contract in output...", "", ""]);
 
 var outputBalance = null;
 for (var i = 0; i < refreshResult.length; i++) {
 var row = refreshResult[i];
 if (row && row[3] && String(row[3]).toLowerCase() === contract) {
 outputBalance = parseFloat(String(row[4]).replace(",", "."));
 out.push(["", "Found in output", row[1] + " = " + row[4], ""]);
 break;
 }
 }
 
 if (outputBalance === null) {
 out.push(["", "Contract NOT in output", "", "Token may have 0 balance or not found"]);
 }
 
 // Step 5: Read cache AFTER refresh
 out.push(["5. AFTER", "Reading cache AFTER refresh...", "", ""]);
 
 // Small delay to ensure cache is written
 Utilities.sleep(500);
 
 var afterCache = _trace_readCache(chain, wallet, contract);
 out.push(["", "Cache balance AFTER", afterCache.balance !== null ? afterCache.balance.toFixed(12) : "NOT FOUND", ""]);
 
 // Step 6: Final comparison
 out.push(["", "", "", ""]);
 out.push(["=== FINAL COMPARISON ===", "", "", ""]);
 out.push(["RPC (truth)", rpcBefore.balance !== null ? rpcBefore.balance.toFixed(12) : "ERROR", "", ""]);
 out.push(["Cache BEFORE", beforeCache.balance !== null ? beforeCache.balance.toFixed(12) : "N/A", "", ""]);
 out.push(["Output (force)", outputBalance !== null ? outputBalance.toFixed(12) : "N/A", "", ""]);
 out.push(["Cache AFTER", afterCache.balance !== null ? afterCache.balance.toFixed(12) : "N/A", "", ""]);
 
 // Diagnosis
 out.push(["", "", "", ""]);
 if (rpcBefore.balance !== null && outputBalance !== null) {
 var outVsRpc = Math.abs(outputBalance - rpcBefore.balance);
 if (outVsRpc > 0.0000001) {
 out.push(["DIAGNOSIS", "BUG: Output differs from RPC!", outVsRpc.toFixed(12), "Problem in balance FETCH or PARSE"]);
 } else if (afterCache.balance !== null && Math.abs(afterCache.balance - rpcBefore.balance) > 0.0000001) {
 out.push(["DIAGNOSIS", "BUG: Cache not updated correctly!", "", "Problem in SAVE logic"]);
 } else {
 out.push(["DIAGNOSIS", "OK - All values match", "", ""]);
 }
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, "", ""]);
 }
 
 return out;
}

// ============================================================
// HELPERS
// ============================================================

function _trace_getChainConfig(chainName) {
 try {
 var varName = "_" + String(chainName).toUpperCase();
 var chainObj = eval(varName);
 if (chainObj && chainObj.getConfig) {
 return chainObj.getConfig();
 }
 } catch (e) {}
 return null;
}

function _trace_fetchBalanceRaw(wallet, contract, rpc, chainConfig) {
 var result = {
 rawHex: null,
 decimals: 18,
 balance: null,
 error: null
 };
 
 try {
 if (contract === "native") {
 // eth_getBalance
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
 muteHttpExceptions: true
 });
 
 var json = JSON.parse(response.getContentText());
 
 if (json.error) {
 result.error = json.error.message || JSON.stringify(json.error);
 return result;
 }
 
 result.rawHex = json.result;
 result.decimals = (chainConfig && chainConfig.CHAIN && chainConfig.CHAIN.NATIVE_DECIMALS) || 18;
 
 // Parse
 var wei = parseInt(result.rawHex, 16);
 result.balance = wei / Math.pow(10, result.decimals);
 
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
 muteHttpExceptions: true
 });
 
 var json = JSON.parse(response.getContentText());
 
 if (json.error) {
 result.error = json.error.message || JSON.stringify(json.error);
 return result;
 }
 
 result.rawHex = json.result;
 
 // Get decimals
 var decimalsSig = "0x313ce567";
 var decPayload = {
 jsonrpc: "2.0",
 id: 2,
 method: "eth_call",
 params: [{ to: contract, data: decimalsSig }, "latest"]
 };
 
 var decResponse = UrlFetchApp.fetch(rpc, {
 method: "post",
 contentType: "application/json",
 payload: JSON.stringify(decPayload),
 muteHttpExceptions: true
 });
 
 var decJson = JSON.parse(decResponse.getContentText());
 if (decJson.result && decJson.result !== "0x") {
 result.decimals = parseInt(decJson.result, 16);
 }
 
 // Parse balance
 if (!result.rawHex || result.rawHex === "0x" || result.rawHex === "0x0") {
 result.balance = 0;
 } else {
 var rawInt = parseInt(result.rawHex, 16);
 result.balance = rawInt / Math.pow(10, result.decimals);
 }
 }
 
 } catch (e) {
 result.error = e.message;
 }
 
 return result;
}

function _trace_readCache(chain, wallet, contract) {
 var result = {
 cacheKey: chain + "_CACHE_WALLET_" + wallet,
 source: "NOT FOUND",
 updatedAt: null,
 cacheAge: null,
 balance: null,
 symbol: null
 };
 
 try {
 var props = PropertiesService.getScriptProperties();
 
 // Try packed cache
 var packed = props.getProperty("GLOBAL_WALLET_CACHE_V1");
 var rawData = null;
 
 if (packed) {
 try {
 var packedObj = JSON.parse(packed);
 if (packedObj[result.cacheKey]) {
 rawData = packedObj[result.cacheKey];
 result.source = "PACKED";
 }
 } catch (e) {}
 }
 
 // Try direct
 if (!rawData) {
 var direct = props.getProperty(result.cacheKey);
 if (direct) {
 try {
 rawData = JSON.parse(direct);
 result.source = "DIRECT";
 } catch (e) {}
 }
 }
 
 if (!rawData) return result;
 
 // Inflate if needed
 if (rawData.a && !rawData.assets && typeof CacheManager !== "undefined" && CacheManager._inflateWalletPayload_) {
 rawData = CacheManager._inflateWalletPayload_(rawData);
 }
 
 // Get updatedAt
 if (rawData.updatedAt || rawData.u) {
 var upAt = rawData.updatedAt || rawData.u;
 if (typeof upAt === "number" && upAt < 2000000000) upAt = upAt * 1000; // epoch seconds to ms
 result.updatedAt = new Date(upAt).toISOString();
 result.cacheAge = Math.round((Date.now() - upAt) / 60000) + " min ago";
 }
 
 // Find contract in assets
 var assets = rawData.assets || [];
 for (var i = 0; i < assets.length; i++) {
 var a = assets[i];
 if (!a || !a.contract) continue;
 
 var c = String(a.contract).toLowerCase();
 if (c === contract) {
 result.balance = parseFloat(a.balance);
 result.symbol = a.symbol || "?";
 break;
 }
 }
 
 } catch (e) {
 result.source = "ERROR: " + e.message;
 }
 
 return result;
}
