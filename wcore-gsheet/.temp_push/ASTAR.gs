/**
 * ASTAR.gs - Astar (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _ASTAR = ChainFactory.createEvmChain("ASTAR", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://evm.astar.network", "https://astar.public.blastapi.io", "https://astar.api.onfinality.io/public"] },
 CHAIN: {
 NAME: "Astar",
 CHAIN_ID: 592,
 NATIVE_SYMBOL: "ASTR",
 NATIVE_NAME: "Astar",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:astar",
 NATIVE_GECKO_ID: "astar",
 DEX_SLUG: "astar",
 GT_NETWORK: "astr"
 },
 LLAMA_ID_MAP: { "ASTR":"coingecko:astar" }
});

// Main functions
function GET_WALLET_ASSETS_ASTAR(a,r,t,f,g){return _ASTAR.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ASTAR(a){return _ASTAR.getCachedWalletAssets(a);}
function ASTAR_REFRESH_STATUS(a,r,t,f,g){return _ASTAR.getRefreshStatus(a,r,t,f,g);}
function ASTAR_STATS(a,t){return _ASTAR.getStats(a,t);}

// Diagnostic functions
function DIAG_ASTAR_TOKEN(w,t,r){return _ASTAR.diag.tokenBalance(w,t,r);}
function DIAG_ASTAR_COMPARE_RPCS(w,t){return _ASTAR.diag.compareRpcs(w,t);}
function DIAG_ASTAR_CHECK_ERC20(t){return _ASTAR.diag.checkErc20(t);}
function DIAG_ASTAR_RPC_HEALTH(){return _ASTAR.diag.rpcHealth();}
function DIAG_ASTAR_NATIVE_BALANCE(w){return _ASTAR.diag.nativeBalance(w);}
function DIAG_ASTAR_CACHE(w){return _ASTAR.diag.cacheInspect(w);}
function DIAG_ASTAR_CACHE_TOKEN(w,t){return _ASTAR.diag.cacheFindToken(w,t);}
function DIAG_ASTAR_CACHE_ASSETS(w){return _ASTAR.diag.cacheListAssets(w);}
function DIAG_ASTAR_TOKEN_PRICE(t){return _ASTAR.diag.tokenPrice(t);}
function DIAG_ASTAR_NATIVE_PRICE(){return _ASTAR.diag.nativePrice();}
function DIAG_ASTAR_WALLET(w){return _ASTAR.diag.walletFull(w);}
function DIAG_ASTAR_CACHE_STATS(){return _ASTAR.diag.cacheStats();}
function DIAG_ASTAR_CLEAR_CACHE(w,c){return _ASTAR.diag.clearCache(w,c);}

