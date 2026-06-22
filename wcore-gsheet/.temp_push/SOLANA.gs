/**
 * SOLANA.gs - Solana Mainnet (v4.14.9)
 * ChainFactory pattern with explicit function declarations
 *
 * v4.14.9 - RPC FIX: Added solana-rpc.publicnode.com, reordered endpoints
 *   Official Solana RPC last (aggressive rate limits from GAS IPs)
 * v4.12.5 - Added LLAMA_ID_MAP for Solayer (LAYER) - missing from DexScreener/Jupiter pricing
 * v4.12.4 - RPC RELIABILITY UPDATE:
 * - Reordered RPCs: dRPC and Ankr first (more reliable for getTokenAccountsByOwner)
 * - Official Solana RPC last (aggressive rate limits)
 * - Added Solana PublicNode
 *
 * v4.12.0 OPTIMIZATION:
 * - Migrated DIAG stubs to use SvmDiagStubs (reduces ~30 lines)
 * - Kept debug functions (DIAG_SOLANA_TOKENS_RANGE, DIAG_SOLANA_TOKEN_BALANCES)
 * - CACHE_VERSION: 64 (aligned with WCORE_VM_CACHE_VERSIONS.SVM)
 * 
 * v4.9.6 FIX: Removed duplicate closing brace in DIAG_SOLANA_TOKEN_BALANCES
 * v4.9.5: Initial ChainFactory implementation
 */

var _SOLANA = ChainFactory.createSvmChain("SOLANA", {
 CACHE_VERSION: 64,
 RPC: {
 ENDPOINTS: [
 "https://solana-rpc.publicnode.com",
 "https://solana.publicnode.com",
 "https://api.mainnet-beta.solana.com"
 ],
 COMMITMENT: "confirmed"
 },
 CHAIN: {
 VM: "SVM",
 NAME: "Solana",
 NATIVE_SYMBOL: "SOL",
 NATIVE_NAME: "Solana",
 NATIVE_DECIMALS: 9,
 NATIVE_LLAMA_ID: "coingecko:solana",
 NATIVE_GECKO_ID: "solana",
 DEX_SLUG: "solana",
 GT_NETWORK: "solana"
 },
 LLAMA_ID_MAP: {
  "LAYER": "coingecko:solayer"
 }
});

// ============================================================
// MAIN FUNCTIONS
// ============================================================

function GET_WALLET_ASSETS_SOLANA(a,r,t,f,g){return _SOLANA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_SOLANA(a){return _SOLANA.getCachedWalletAssets(a);}
function SOLANA_REFRESH_STATUS(a,r,t,f,g){return _SOLANA.getRefreshStatus(a,r,t,f,g);}
function SOLANA_STATS(a,t){return _SOLANA.getStats(a,t);}

// ============================================================
// DIAGNOSTIC FUNCTIONS (using SvmDiagStubs)
// ============================================================

function DIAG_SOLANA_TOKEN(w,t,r){return _SOLANA.diag.tokenMeta(t);}
function DIAG_SOLANA_COMPARE_RPCS(w,t){return SvmDiagStubs.compareRpcs("SOLANA");}
function DIAG_SOLANA_CHECK_ERC20(t){return SvmDiagStubs.checkErc20();}
function DIAG_SOLANA_RPC_HEALTH(){return _SOLANA.diag.rpcHealth();}
function DIAG_SOLANA_NATIVE_BALANCE(w,r){return _SOLANA.diag.nativeBalance(w,r);}
function DIAG_SOLANA_CACHE(w){return SvmDiagStubs.cache("SOLANA");}
function DIAG_SOLANA_CACHE_TOKEN(w,t){return SvmDiagStubs.cacheToken();}
function DIAG_SOLANA_CACHE_ASSETS(w){return SvmDiagStubs.cacheAssets("SOLANA");}
function DIAG_SOLANA_TOKEN_PRICE(t){return _SOLANA.diag.tokenPrice(t);}
function DIAG_SOLANA_NATIVE_PRICE(){return _SOLANA.diag.nativePrice();}
function DIAG_SOLANA_WALLET(w,r){return _SOLANA.diag.wallet(w,r);}
function DIAG_SOLANA_CACHE_STATS(){return _SOLANA.diag.cacheStats();}
function DIAG_SOLANA_CLEAR_CACHE(w,c){return SvmDiagStubs.clearCache();}

// ============================================================
// DEBUG FUNCTIONS (Solana-specific - kept for troubleshooting)
// ============================================================

/**
 * DEBUG: Diagnose tokensRange parsing
 * Usage: =DIAG_SOLANA_TOKENS_RANGE(I2:I)
 */
function DIAG_SOLANA_TOKENS_RANGE(tokensRange) {
 var out = [["Index", "RawCell", "Type", "Length", "IsBase58", "Trimmed"]];
 
 if (!tokensRange) {
 out.push(["N/A", "tokensRange is null/undefined", typeof tokensRange, "", "", ""]);
 return out;
 }
 
 out.push(["INFO", "typeof tokensRange", typeof tokensRange, "", "", ""]);
 
 if (typeof tokensRange === "string") {
 out.push(["STRING", tokensRange.substring(0, 50), "string", tokensRange.length, "", ""]);
 return out;
 }
 
 if (!Array.isArray(tokensRange)) {
 out.push(["N/A", "Not an array", typeof tokensRange, "", "", ""]);
 return out;
 }
 
 out.push(["ARRAY", "Length=" + tokensRange.length, "array", tokensRange.length, "", ""]);
 
 var maxShow = Math.min(tokensRange.length, 20);
 for (var i = 0; i < maxShow; i++) {
 var row = tokensRange[i];
 var cell = (row && row.length) ? row[0] : row;
 var cellStr = String(cell || "");
 var trimmed = cellStr.replace(/\u00A0/g, " ").trim();
 var isBase58 = (trimmed.length >= 32 && trimmed.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed));
 
 out.push([
 i,
 cellStr.substring(0, 44) + (cellStr.length > 44 ? "..." : ""),
 typeof cell,
 cellStr.length,
 isBase58 ? "YES" : "NO",
 trimmed.substring(0, 44)
 ]);
 
 if (cell === null || cell === undefined) {
 out.push(["BREAK", "cell is null/undefined", "", "", "", ""]);
 break;
 }
 if (!trimmed) {
 out.push(["BREAK", "trimmed is empty", "", "", "", ""]);
 break;
 }
 }
 
 return out;
}

/**
 * DEBUG: Test balance fetch for each token in range
 * Usage: =DIAG_SOLANA_TOKEN_BALANCES(wallet, I2:I)
 */
function DIAG_SOLANA_TOKEN_BALANCES(wallet, tokensRange) {
 var out = [["Index", "Mint", "RPC_Status", "Accounts", "RawAmount", "Decimals", "Balance"]];
 var config = _SOLANA.getConfig();
 
 if (!wallet) {
 out.push(["ERROR", "No wallet provided", "", "", "", "", ""]);
 return out;
 }
 
 var rpcUrl = (config.RPC && config.RPC.ENDPOINTS && config.RPC.ENDPOINTS[0]) || "";
 if (!rpcUrl) {
 out.push(["ERROR", "No RPC URL", "", "", "", "", ""]);
 return out;
 }
 
 var commitment = (config.RPC && config.RPC.COMMITMENT) || "confirmed";
 
 // Parse tokens range
 var tokensList = [];
 try {
 if (typeof SvmEngine !== "undefined" && SvmEngine._parseTokensRange) {
 tokensList = SvmEngine._parseTokensRange(tokensRange, config);
 } else {
 tokensList = _parseTokensRangeFallback(tokensRange);
 }
 } catch (e) {
 out.push(["ERROR", "Failed to parse tokensRange: " + e.message, "", "", "", "", ""]);
 return out;
 }
 
 out.push(["INFO", "Tokens parsed: " + tokensList.length, "RPC: " + rpcUrl.substring(0, 40), "", "", "", ""]);
 
 for (var i = 0; i < tokensList.length && i < 20; i++) {
 var mint = tokensList[i].contract || tokensList[i];
 var status = "?", accounts = 0, rawAmt = 0, dec = "?", bal = 0;
 
 try {
 if (typeof SvmRpcClient === "undefined" || !SvmRpcClient.getTokenBalanceByMint) {
 status = "SvmRpcClient not available";
 } else {
 var resp = SvmRpcClient.getTokenBalanceByMint(rpcUrl, wallet, mint, commitment);
 
 if (resp && resp.error) {
 status = "ERROR: " + String(resp.error).substring(0, 30);
 } else if (resp && resp.result && resp.result.value) {
 accounts = resp.result.value.length;
 status = accounts > 0 ? "OK" : "NO_ACCOUNT";
 
 for (var j = 0; j < resp.result.value.length; j++) {
 var acc = resp.result.value[j];
 if (acc && acc.account && acc.account.data && acc.account.data.parsed && acc.account.data.parsed.info) {
 var info = acc.account.data.parsed.info;
 if (info.tokenAmount) {
 rawAmt += Number(info.tokenAmount.amount) || 0;
 dec = info.tokenAmount.decimals;
 }
 }
 }
 
 if (rawAmt > 0 && dec !== "?") {
 bal = rawAmt / Math.pow(10, Number(dec));
 }
 } else {
 status = "NULL_RESP";
 }
 }
 } catch (e) {
 status = "CATCH: " + String(e.message || e).substring(0, 25);
 }
 
 out.push([i, String(mint).substring(0, 20) + "...", status, accounts, rawAmt, dec, bal]);
 }
 
 return out;
}

/**
 * Fallback token range parser for DIAG functions
 * @private
 */
function _parseTokensRangeFallback(tokensRange) {
 var result = [];
 if (!tokensRange) return result;
 
 var rows = Array.isArray(tokensRange) ? tokensRange : [[tokensRange]];
 for (var i = 0; i < rows.length; i++) {
 var row = rows[i];
 var cell = Array.isArray(row) ? row[0] : row;
 var trimmed = String(cell || "").replace(/\u00A0/g, " ").trim();
 
 if (trimmed && trimmed.length >= 32 && trimmed.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed)) {
 result.push({ contract: trimmed });
 } else if (!trimmed) {
 break;
 }
 }
 return result;
}