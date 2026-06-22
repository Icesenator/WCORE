/**
 * MODE.gs - Mode (v4.12.0)
 * ChainFactory pattern with explicit function declarations
 * 
 * v4.12.0 RPC OPTIMIZATION:
 * - Added 1RPC privacy-focused endpoint
 * - Added publicnode endpoint
 * - Reordered by measured reliability
 * - Added failure tolerance settings
 * - CACHE_VERSION: 63 (aligned with WCORE_VM_CACHE_VERSIONS.EVM)
 */

var _MODE = ChainFactory.createEvmChain("MODE", {
 CACHE_VERSION: 63,
 
 // Extended timeouts for OP Stack chain
 TIMEOUTS: {
 MAX_EXECUTION_MS: 20000,
 HTTP_MS: 4000,
 SAFE_MARGIN_MS: 800
 },
 
 RPC: { 
 ENDPOINTS: [
 // Tier 1: Official endpoint
 "https://mainnet.mode.network",
 
 // Tier 2: Third-party reliable
 "https://mode.drpc.org",
 "https://1rpc.io/mode",
 
 // Tier 3: Alternative endpoints
 "https://rpc.ankr.com/mode",
 "https://mode-mainnet.public.blastapi.io",
 "https://34443.rpc.thirdweb.com"
 ],
 
 // More tolerant failure handling
 MAX_FAILURES_BEFORE_BLOCK: 3,
 BLOCK_DURATION_MS: 60000 // 60s block (faster recovery)
 },
 
 CHAIN: {
 NAME: "Mode",
 CHAIN_ID: 34443,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ethereum",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "mode",
 GT_NETWORK: "mode"
 },
 
 LLAMA_ID_MAP: { 
 "ETH": "coingecko:ethereum",
 "MODE": "coingecko:mode",
 "USDC": "coingecko:usd-coin",
 "USDT": "coingecko:tether",
 "WETH": "coingecko:weth"
 }
});

// ============================================================
// MAIN FUNCTIONS
// ============================================================

function GET_WALLET_ASSETS_MODE(a,r,t,f,g){return _MODE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_MODE(a){return _MODE.getCachedWalletAssets(a);}
function MODE_REFRESH_STATUS(a,r,t,f,g){return _MODE.getRefreshStatus(a,r,t,f,g);}
function MODE_STATS(a,t){return _MODE.getStats(a,t);}

// ============================================================
// DIAGNOSTIC FUNCTIONS
// ============================================================

function DIAG_MODE_TOKEN(w,t,r){return _MODE.diag.tokenBalance(w,t,r);}
function DIAG_MODE_COMPARE_RPCS(w,t){return _MODE.diag.compareRpcs(w,t);}
function DIAG_MODE_CHECK_ERC20(t){return _MODE.diag.checkErc20(t);}
function DIAG_MODE_RPC_HEALTH(){return _MODE.diag.rpcHealth();}
function DIAG_MODE_NATIVE_BALANCE(w){return _MODE.diag.nativeBalance(w);}
function DIAG_MODE_CACHE(w){return _MODE.diag.cacheInspect(w);}
function DIAG_MODE_CACHE_TOKEN(w,t){return _MODE.diag.cacheFindToken(w,t);}
function DIAG_MODE_CACHE_ASSETS(w){return _MODE.diag.cacheListAssets(w);}
function DIAG_MODE_TOKEN_PRICE(t){return _MODE.diag.tokenPrice(t);}
function DIAG_MODE_NATIVE_PRICE(){return _MODE.diag.nativePrice();}
function DIAG_MODE_WALLET(w){return _MODE.diag.walletFull(w);}
function DIAG_MODE_CACHE_STATS(){return _MODE.diag.cacheStats();}
function DIAG_MODE_CLEAR_CACHE(w,c){return _MODE.diag.clearCache(w,c);}
