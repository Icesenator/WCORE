/**
 * LISK.gs - Lisk (v4.12.10)
 * ChainFactory pattern with explicit function declarations
 * 
 * v4.12.10: DIAG_LISK_RPC_TEST now uses generic DIAG_CHAIN_RPC_TEST
 * 
 * v4.12.1 RPC OPTIMIZATION:
 * - Added Ankr, BlockPI, Publicnode endpoints
 * - Total: 9 endpoints for better redundancy
 * - Improved failure tolerance
 * - Extended timeouts for OP Stack chain
 * 
 * v4.12.0 RPC OPTIMIZATION:
 * - Added 1RPC privacy-focused endpoint
 * - Added publicnode endpoint
 * - CACHE_VERSION: 63
 */

var _LISK = ChainFactory.createEvmChain("LISK", {
 CACHE_VERSION: 63,
 
 // Extended timeouts for OP Stack chain
 TIMEOUTS: {
 MAX_EXECUTION_MS: 20000,
 HTTP_MS: 4000,
 SAFE_MARGIN_MS: 800,
 FAST_FAIL_MS: 3500
 },
 
 // Optimized RPC list v4.12.1 - 9 endpoints
 RPC: { 
 ENDPOINTS: [
 // Tier 1: Official endpoints (most reliable)
 "https://rpc.api.lisk.com",
 "https://rpc.lisk.com",
 
 // Tier 2: Third-party reliable
 "https://lisk.drpc.org",
 "https://1rpc.io/lisk",
 "https://rpc.ankr.com/lisk",
 
 // Tier 3: Public infrastructure
 "https://lisk-mainnet.public.blastapi.io",
 "https://lisk.blockpi.network/v1/rpc/public",
 
 // Tier 4: Thirdweb + backup
 "https://1135.rpc.thirdweb.com",
 "https://lisk-mainnet-rpc.publicnode.com"
 ],
 
 // More tolerant failure handling
 MAX_FAILURES_BEFORE_BLOCK: 3,
 BLOCK_DURATION_MS: 60000
 },
 
 CHAIN: {
 NAME: "Lisk",
 CHAIN_ID: 1135,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "lisk",
 GT_NETWORK: "lisk"
 },
 
 LLAMA_ID_MAP: { 
 "ETH": "coingecko:ethereum", 
 "LSK": "coingecko:lisk", 
 "USDC": "coingecko:usd-coin", 
 "USDT": "coingecko:tether", 
 "WETH": "coingecko:weth" 
 }
});

// ============================================================
// MAIN FUNCTIONS
// ============================================================

function GET_WALLET_ASSETS_LISK(a,r,t,f,g){return _LISK.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_LISK(a){return _LISK.getCachedWalletAssets(a);}
function LISK_REFRESH_STATUS(a,r,t,f,g){return _LISK.getRefreshStatus(a,r,t,f,g);}
function LISK_STATS(a,t){return _LISK.getStats(a,t);}

// ============================================================
// DIAGNOSTIC FUNCTIONS
// ============================================================

function DIAG_LISK_TOKEN(w,t,r){return _LISK.diag.tokenBalance(w,t,r);}
function DIAG_LISK_COMPARE_RPCS(w,t){return _LISK.diag.compareRpcs(w,t);}
function DIAG_LISK_CHECK_ERC20(t){return _LISK.diag.checkErc20(t);}
function DIAG_LISK_RPC_HEALTH(){return _LISK.diag.rpcHealth();}
function DIAG_LISK_NATIVE_BALANCE(w){return _LISK.diag.nativeBalance(w);}
function DIAG_LISK_CACHE(w){return _LISK.diag.cacheInspect(w);}
function DIAG_LISK_CACHE_TOKEN(w,t){return _LISK.diag.cacheFindToken(w,t);}
function DIAG_LISK_CACHE_ASSETS(w){return _LISK.diag.cacheListAssets(w);}
function DIAG_LISK_TOKEN_PRICE(t){return _LISK.diag.tokenPrice(t);}
function DIAG_LISK_NATIVE_PRICE(){return _LISK.diag.nativePrice();}
function DIAG_LISK_WALLET(w){return _LISK.diag.walletFull(w);}
function DIAG_LISK_CACHE_STATS(){return _LISK.diag.cacheStats();}
function DIAG_LISK_CLEAR_CACHE(w,c){return _LISK.diag.clearCache(w,c);}

// ============================================================
// DIAGNOSTIC: RPC ENDPOINT TEST (v4.12.10 - uses generic)
// ============================================================

function DIAG_LISK_RPC_TEST() {
  return DIAG_CHAIN_RPC_TEST("LISK");
}
