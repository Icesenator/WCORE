/**
 * FOGO.gs - Fogo Mainnet (v4.12.0)
 * ChainFactory pattern with explicit function declarations
 * SVM-based Layer 1 blockchain (Solana Virtual Machine compatible)
 * 
 * v4.12.0 OPTIMIZATION:
 * - Migrated DIAG stubs to use SvmDiagStubs (reduces ~20 lines)
 * - Kept FOGO-specific logic (known tokens, price application)
 * - CACHE_VERSION: 64 (aligned with WCORE_VM_CACHE_VERSIONS.SVM)
 * 
 * v4.9.1 Changes:
 * - Added KNOWN_TOKENS registry for USDC (Wormhole bridged) and other verified tokens
 * - Since FOGO is a new chain (mainnet Jan 2026), DexScreener/GeckoTerminal don't support it yet
 */

// ============================================================
// FOGO KNOWN TOKENS REGISTRY
// ============================================================

/**
 * Known tokens on FOGO mainnet.
 * Since DexScreener/GeckoTerminal don't yet support FOGO network,
 * we maintain a hardcoded list of verified tokens.
 */
var FOGO_KNOWN_TOKENS = {
 // USDC bridged via Wormhole from Solana
 'uSd2czE61Evaf76RNbq4KPpXnkiL3irdzgLFUMe3NoG': {
 symbol: 'USDC',
 name: 'USD Coin (Wormhole)',
 decimals: 6,
 isStable: true,
 peg: 'USD'
 },
 
 // Chase Dog - FOGO ecosystem memecoin
 'GPK71dya1H975s3U4gYaJjrRCp3BGyAD8fmZCtSmBCcz': {
 symbol: 'CHASE',
 name: 'Chase Dog',
 decimals: 9,
 isStable: false
 }
};

// ============================================================
// FOGO CHAIN CONFIGURATION
// ============================================================

var _FOGO = ChainFactory.createSvmChain("FOGO", {
 CACHE_VERSION: 64,
 RPC: {
 ENDPOINTS: ["https://mainnet.fogo.io/"],
 COMMITMENT: "confirmed"
 },
 CHAIN: {
 VM: "SVM",
 NAME: "Fogo",
 NATIVE_SYMBOL: "FOGO",
 NATIVE_NAME: "Fogo",
 NATIVE_DECIMALS: 9,
 NATIVE_LLAMA_ID: "coingecko:fogo",
 NATIVE_GECKO_ID: "fogo",
 DEX_SLUG: "fogo",
 GT_NETWORK: "fogo"
 },
 KNOWN_TOKENS: FOGO_KNOWN_TOKENS
});

// ============================================================
// KNOWN TOKENS HELPERS
// ============================================================

/**
 * Enhanced wrapper that applies FOGO_KNOWN_TOKENS metadata
 * @private
 */
function _FOGO_applyKnownTokens(output) {
 if (!output || !Array.isArray(output) || !output.length) return output;
 
 for (var i = 0; i < output.length; i++) {
 var row = output[i];
 if (!row || row.length < 7) continue;
 
 var col0 = String(row[0] || '');
 if (col0 === 'chain_name' || col0 === 'META' || col0.indexOf('INFO') === 0) continue;
 
 var ticker = String(row[1] || '').trim();
 var name = String(row[2] || '').trim();
 var contract = String(row[3] || '').trim();
 var balance = row[4];
 var priceEur = row[5];
 
 var needsMeta = (ticker === 'SPL' || ticker === 'SPL Token' || !ticker);
 var needsPrice = (priceEur === null || priceEur === undefined || priceEur === '' || priceEur === 0);
 
 if (contract && (needsMeta || needsPrice)) {
 var known = FOGO_KNOWN_TOKENS[contract];
 if (known) {
 if (needsMeta || ticker === 'SPL') {
 row[1] = known.symbol || ticker;
 row[2] = known.name || name;
 }
 
 if (needsPrice && known.isStable) {
 var balNum = Number(balance) || 0;
 if (balNum > 0) {
 var pricePerUnit = 1;
 if (known.peg === 'USD') {
 try {
 var fxRate = FxRate.getUsdToEur(null);
 pricePerUnit = (fxRate && fxRate > 0) ? fxRate : 0;
 } catch (e) {
 pricePerUnit = 0;
 }
 }
 row[5] = pricePerUnit;
 row[6] = balNum * pricePerUnit;
 }
 }
 }
 }
 }
 
 _FOGO_recalculateTotal(output);
 return output;
}

/**
 * Recalculate INFO_TOTAL row after applying known token prices
 * @private
 */
function _FOGO_recalculateTotal(output) {
 if (!output || !Array.isArray(output)) return;
 
 var totalEur = 0;
 var totalRowIndex = -1;
 
 for (var i = 0; i < output.length; i++) {
 var row = output[i];
 if (!row || row.length < 7) continue;
 
 var col0 = String(row[0] || '');
 var col1 = String(row[1] || '');
 
 if (col1 === 'INFO_TOTAL') {
 totalRowIndex = i;
 continue;
 }
 
 if (col0 === 'chain_name' || col0 === 'META' || col1.indexOf('INFO') === 0) continue;
 
 var valueEur = Number(row[6] || 0);
 if (valueEur > 0) totalEur += valueEur;
 }
 
 if (totalRowIndex >= 0 && output[totalRowIndex]) {
 output[totalRowIndex][2] = 'Total portefeuille (sum value_eur).';
 output[totalRowIndex][6] = totalEur;
 }
}

// ============================================================
// MAIN FUNCTIONS (with known tokens support)
// ============================================================

function GET_WALLET_ASSETS_FOGO(a, r, t, f, g) {
 return _FOGO_applyKnownTokens(_FOGO.getWalletAssets(a, r, t, f, g));
}

function CACHED_WALLET_ASSETS_FOGO(a) {
 return _FOGO_applyKnownTokens(_FOGO.getCachedWalletAssets(a));
}

function FOGO_REFRESH_STATUS(a, r, t, f, g) {
 return _FOGO.getRefreshStatus(a, r, t, f, g);
}

function FOGO_STATS(a, t) {
 return _FOGO.getStats(a, t);
}

// ============================================================
// DIAGNOSTIC FUNCTIONS (using SvmDiagStubs)
// ============================================================

function DIAG_FOGO_TOKEN(w, t, r) {
 // First check known tokens
 if (t && FOGO_KNOWN_TOKENS[t]) {
 var known = FOGO_KNOWN_TOKENS[t];
 return [
 ["Metric", "Value", "Details"],
 ["Source", "FOGO_KNOWN_TOKENS", "Hardcoded registry"],
 ["Symbol", known.symbol || "N/A", ""],
 ["Name", known.name || "N/A", ""],
 ["Decimals", known.decimals != null ? known.decimals : "N/A", ""],
 ["IsStable", known.isStable ? "YES" : "NO", known.peg || ""],
 ["Note", "DexScreener/GT not yet supported", "Chain launched Jan 2026"]
 ];
 }
 return _FOGO.diag.tokenMeta(t);
}

function DIAG_FOGO_COMPARE_RPCS(w, t){return SvmDiagStubs.compareRpcs("FOGO");}
function DIAG_FOGO_CHECK_ERC20(t){return SvmDiagStubs.checkErc20();}
function DIAG_FOGO_RPC_HEALTH(){return _FOGO.diag.rpcHealth();}
function DIAG_FOGO_NATIVE_BALANCE(w, r){return _FOGO.diag.nativeBalance(w, r);}
function DIAG_FOGO_CACHE(w){return SvmDiagStubs.cache("FOGO");}
function DIAG_FOGO_CACHE_TOKEN(w, t){return SvmDiagStubs.cacheToken();}
function DIAG_FOGO_CACHE_ASSETS(w){return SvmDiagStubs.cacheAssets("FOGO");}

function DIAG_FOGO_TOKEN_PRICE(t) {
 // Check known tokens first for stablecoin pricing
 if (t && FOGO_KNOWN_TOKENS[t] && FOGO_KNOWN_TOKENS[t].isStable) {
 var known = FOGO_KNOWN_TOKENS[t];
 var priceEur = 1;
 if (known.peg === 'USD') {
 try {
 var fx = FxRate.getUsdToEur(null);
 priceEur = (fx && fx > 0) ? fx : 0;
 } catch (e) {
 priceEur = 0;
 }
 }
 return [
 ["Metric", "Value", "Details"],
 ["Token", t, ""],
 ["Symbol", known.symbol, ""],
 ["Source", "FOGO_KNOWN_TOKENS", "Stablecoin"],
 ["Peg", known.peg || "EUR", ""],
 ["Price_EUR", priceEur.toFixed(4), ""]
 ];
 }
 return _FOGO.diag.tokenPrice(t);
}

function DIAG_FOGO_NATIVE_PRICE(){return _FOGO.diag.nativePrice();}
function DIAG_FOGO_WALLET(w, r){return _FOGO.diag.wallet(w, r);}
function DIAG_FOGO_CACHE_STATS(){return _FOGO.diag.cacheStats();}
function DIAG_FOGO_CLEAR_CACHE(w, c){return SvmDiagStubs.clearCache();}

/**
 * List all known tokens registered for FOGO
 */
function DIAG_FOGO_KNOWN_TOKENS() {
 var out = [["Mint", "Symbol", "Name", "Decimals", "Stable", "Peg"]];
 for (var mint in FOGO_KNOWN_TOKENS) {
 if (FOGO_KNOWN_TOKENS.hasOwnProperty(mint)) {
 var t = FOGO_KNOWN_TOKENS[mint];
 out.push([mint, t.symbol || "", t.name || "", t.decimals != null ? t.decimals : "", t.isStable ? "YES" : "NO", t.peg || ""]);
 }
 }
 return out;
}
