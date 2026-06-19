/**
 * SYNDICATE_COMMONS.gs - Syndicate Commons (v4.12.10)
 * ChainFactory pattern with explicit function declarations
 * 
 * v4.12.10: DIAG_SYNDICATE_COMMONS_RPC_TEST now uses generic DIAG_CHAIN_RPC_TEST
 * 
 * v4.12.1 RPC OPTIMIZATION:
 * - Added thirdweb endpoint as backup
 * - Maximum failure tolerance (very limited RPC options)
 * - Extended timeouts with retry logic
 * - Health score will be lower due to single primary RPC
 * 
 * NOTE: Syndicate Commons is an app-chain with limited RPC providers.
 * This configuration maximizes tolerance for RPC failures.
 * 
 * v4.9.1 FIX: 
 * - FIXED: CoinGecko ID corrected from "syndicate" to "syndicate-3"
 * - FIXED: DefiLlama ID corrected to use Base chain contract address
 */

var _SYNDICATE_COMMONS = ChainFactory.createEvmChain("SYNDICATE_COMMONS", {
 CACHE_VERSION: 63,
 
 // Extended timeouts for single-RPC chain
 TIMEOUTS: {
 MAX_EXECUTION_MS: 25000,
 HTTP_MS: 8000, // Longer timeout per request
 SAFE_MARGIN_MS: 1000,
 FAST_FAIL_MS: 7000 // Longer fast-fail for reliability
 },
 
 // RPC list v4.12.1 - limited options for app-chain
 RPC: { 
 ENDPOINTS: [
 // Tier 1: Official RPC (primary)
 "https://commons.rpc.syndicate.io",
 
 // Tier 2: Thirdweb (chain ID based)
 "https://510003.rpc.thirdweb.com",
 
 // Tier 3: Backup official (if available)
 "https://rpc.commons.syndicate.io"
 ],
 
 // Maximum tolerance - very limited RPC providers
 MAX_FAILURES_BEFORE_BLOCK: 5, // Very tolerant
 BLOCK_DURATION_MS: 30000, // Short block (30s)
 
 // Retry settings for resilience
 RETRY_COUNT: 3,
 RETRY_DELAY_MS: 1000
 },
 
 CHAIN: {
 NAME: "Syndicate Commons",
 CHAIN_ID: 510003,
 NATIVE_SYMBOL: "SYND",
 NATIVE_NAME: "Syndicate",
 NATIVE_DECIMALS: 18,
 // Use Base chain contract for DefiLlama pricing
 NATIVE_LLAMA_ID: "base:0x11dc28d01984079b7efe7763b533e6ed9e3722b9",
 NATIVE_GECKO_ID: "syndicate-3",
 // Use Base SYND contract for DEX pricing fallback
 NATIVE_PRICE_CONTRACT: "0x11dc28d01984079b7efe7763b533e6ed9e3722b9",
 DEX_SLUG: "base",
 GT_NETWORK: "base"
 },
 
 LLAMA_ID_MAP: { 
 "SYND": "base:0x11dc28d01984079b7efe7763b533e6ed9e3722b9" 
 }
});

// ============================================================
// MAIN FUNCTIONS
// ============================================================

function GET_WALLET_ASSETS_SYNDICATE_COMMONS(a,r,t,f,g){return _SYNDICATE_COMMONS.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_SYNDICATE_COMMONS(a){return _SYNDICATE_COMMONS.getCachedWalletAssets(a);}
function SYNDICATE_COMMONS_REFRESH_STATUS(a,r,t,f,g){return _SYNDICATE_COMMONS.getRefreshStatus(a,r,t,f,g);}
function SYNDICATE_COMMONS_STATS(a,t){return _SYNDICATE_COMMONS.getStats(a,t);}

// ============================================================
// DIAGNOSTIC FUNCTIONS
// ============================================================

function DIAG_SYNDICATE_COMMONS_TOKEN(w,t,r){return _SYNDICATE_COMMONS.diag.tokenBalance(w,t,r);}
function DIAG_SYNDICATE_COMMONS_COMPARE_RPCS(w,t){return _SYNDICATE_COMMONS.diag.compareRpcs(w,t);}
function DIAG_SYNDICATE_COMMONS_CHECK_ERC20(t){return _SYNDICATE_COMMONS.diag.checkErc20(t);}
function DIAG_SYNDICATE_COMMONS_RPC_HEALTH(){return _SYNDICATE_COMMONS.diag.rpcHealth();}
function DIAG_SYNDICATE_COMMONS_NATIVE_BALANCE(w){return _SYNDICATE_COMMONS.diag.nativeBalance(w);}
function DIAG_SYNDICATE_COMMONS_CACHE(w){return _SYNDICATE_COMMONS.diag.cacheInspect(w);}
function DIAG_SYNDICATE_COMMONS_CACHE_TOKEN(w,t){return _SYNDICATE_COMMONS.diag.cacheFindToken(w,t);}
function DIAG_SYNDICATE_COMMONS_CACHE_ASSETS(w){return _SYNDICATE_COMMONS.diag.cacheListAssets(w);}
function DIAG_SYNDICATE_COMMONS_TOKEN_PRICE(t){return _SYNDICATE_COMMONS.diag.tokenPrice(t);}
function DIAG_SYNDICATE_COMMONS_NATIVE_PRICE(){return _SYNDICATE_COMMONS.diag.nativePrice();}
function DIAG_SYNDICATE_COMMONS_WALLET(w){return _SYNDICATE_COMMONS.diag.walletFull(w);}
function DIAG_SYNDICATE_COMMONS_CACHE_STATS(){return _SYNDICATE_COMMONS.diag.cacheStats();}
function DIAG_SYNDICATE_COMMONS_CLEAR_CACHE(w,c){return _SYNDICATE_COMMONS.diag.clearCache(w,c);}

// ============================================================
// DIAGNOSTIC: RPC ENDPOINT TEST (v4.12.10 - uses generic)
// ============================================================

function DIAG_SYNDICATE_COMMONS_RPC_TEST() {
  // App-chain has slower RPCs, use extended thresholds
  var result = DIAG_CHAIN_RPC_TEST("SYNDICATE_COMMONS", {
    timeout: 8000,
    fastThreshold: 2000,
    okThreshold: 4000
  });
  // Add app-chain specific note
  result.push(["", "NOTE", "Limited RPC providers for app-chain", "", ""]);
  return result;
}
