/**
 * UNICHAIN.gs - Unichain (v4.12.10)
 * ChainFactory pattern with explicit function declarations
 * 
 * v4.12.10: DIAG_UNICHAIN_RPC_TEST now uses generic DIAG_CHAIN_RPC_TEST
 * 
 * v4.12.1 RPC OPTIMIZATION:
 * - Added Ankr, BlockPI, Publicnode endpoints
 * - Total: 8 endpoints for better redundancy
 * - Improved failure tolerance for newer chain
 * 
 * v4.12.0 RPC OPTIMIZATION:
 * - Reordered RPCs by measured reliability
 * - Added Dwellir public RPC endpoint
 * - Added failure tolerance settings
 */

var _UNICHAIN = ChainFactory.createEvmChain("UNICHAIN", {
 CACHE_VERSION: 63,
 
 // Extended timeouts for newer chain
 TIMEOUTS: {
 MAX_EXECUTION_MS: 20000,
 HTTP_MS: 4000,
 SAFE_MARGIN_MS: 800,
 FAST_FAIL_MS: 3500
 },
 
 // Optimized RPC list v4.12.1 - 8 endpoints
  RPC: { 
  MAX_BATCH_SIZE: 10,
  ENDPOINTS: [
 // Tier 1: Official + reliable
 "https://mainnet.unichain.org",
 "https://rpc.unichain.org",
 
 // Tier 2: Third-party reliable
 "https://unichain.drpc.org",
 "https://rpc.ankr.com/unichain",
 "https://1rpc.io/unichain",
 
 // Tier 3: Public infrastructure
 "https://unichain.blockpi.network/v1/rpc/public",
 "https://130.rpc.thirdweb.com",
 
 // Tier 4: Alchemy public (rate limited)
 "https://unichain-mainnet.g.alchemy.com/public"
 ],
 
 // More tolerant failure handling for newer chain
 MAX_FAILURES_BEFORE_BLOCK: 3,
 BLOCK_DURATION_MS: 60000
 },
 
 CHAIN: {
 NAME: "Unichain",
 CHAIN_ID: 130,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "unichain",
 GT_NETWORK: "unichain"
 },
 
 LLAMA_ID_MAP: { 
 "ETH": "coingecko:ethereum", 
 "UNI": "coingecko:uniswap",
 "USDC": "coingecko:usd-coin",
 "WETH": "coingecko:weth"
 }
});

// ============================================================
// MAIN FUNCTIONS
// ============================================================

function GET_WALLET_ASSETS_UNICHAIN(a,r,t,f,g){return _UNICHAIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_UNICHAIN(a){return _UNICHAIN.getCachedWalletAssets(a);}
function UNICHAIN_REFRESH_STATUS(a,r,t,f,g){return _UNICHAIN.getRefreshStatus(a,r,t,f,g);}
function UNICHAIN_STATS(a,t){return _UNICHAIN.getStats(a,t);}

// ============================================================
// DIAGNOSTIC FUNCTIONS
// ============================================================

function DIAG_UNICHAIN_TOKEN(w,t,r){return _UNICHAIN.diag.tokenBalance(w,t,r);}
function DIAG_UNICHAIN_COMPARE_RPCS(w,t){return _UNICHAIN.diag.compareRpcs(w,t);}
function DIAG_UNICHAIN_CHECK_ERC20(t){return _UNICHAIN.diag.checkErc20(t);}
function DIAG_UNICHAIN_RPC_HEALTH(){return _UNICHAIN.diag.rpcHealth();}
function DIAG_UNICHAIN_NATIVE_BALANCE(w){return _UNICHAIN.diag.nativeBalance(w);}
function DIAG_UNICHAIN_CACHE(w){return _UNICHAIN.diag.cacheInspect(w);}
function DIAG_UNICHAIN_CACHE_TOKEN(w,t){return _UNICHAIN.diag.cacheFindToken(w,t);}
function DIAG_UNICHAIN_CACHE_ASSETS(w){return _UNICHAIN.diag.cacheListAssets(w);}
function DIAG_UNICHAIN_TOKEN_PRICE(t){return _UNICHAIN.diag.tokenPrice(t);}
function DIAG_UNICHAIN_NATIVE_PRICE(){return _UNICHAIN.diag.nativePrice();}
function DIAG_UNICHAIN_WALLET(w){return _UNICHAIN.diag.walletFull(w);}
function DIAG_UNICHAIN_CACHE_STATS(){return _UNICHAIN.diag.cacheStats();}
function DIAG_UNICHAIN_CLEAR_CACHE(w,c){return _UNICHAIN.diag.clearCache(w,c);}

// ============================================================
// DIAGNOSTIC: RPC ENDPOINT TEST (v4.12.10 - uses generic)
// ============================================================

function DIAG_UNICHAIN_RPC_TEST() {
  return DIAG_CHAIN_RPC_TEST("UNICHAIN");
}
