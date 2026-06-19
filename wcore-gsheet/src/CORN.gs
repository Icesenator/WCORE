/**
 * CORN.gs - Corn (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _CORN = ChainFactory.createEvmChain("CORN", {
 CACHE_VERSION: 63,
  RPC: { ENDPOINTS: ["https://maizenet-rpc.usecorn.com"] }, // mainnet.corn-rpc.com 403, drpc.org 404, ankr 403 (v4.15.49 fix)
 CHAIN: {
 NAME: "Corn",
 CHAIN_ID: 21000000,
 NATIVE_SYMBOL: "BTCN",
 NATIVE_NAME: "BTCN",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:bitcoin",
 NATIVE_GECKO_ID: "bitcoin",
 DEX_SLUG: "corn",
 GT_NETWORK: "corn"
 },
 LLAMA_ID_MAP: { "BTCN":"coingecko:bitcoin" }
});

// Main functions
function GET_WALLET_ASSETS_CORN(a,r,t,f,g){return _CORN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_CORN(a){return _CORN.getCachedWalletAssets(a);}
function CORN_REFRESH_STATUS(a,r,t,f,g){return _CORN.getRefreshStatus(a,r,t,f,g);}
function CORN_STATS(a,t){return _CORN.getStats(a,t);}

// Diagnostic functions
function DIAG_CORN_TOKEN(w,t,r){return _CORN.diag.tokenBalance(w,t,r);}
function DIAG_CORN_COMPARE_RPCS(w,t){return _CORN.diag.compareRpcs(w,t);}
function DIAG_CORN_CHECK_ERC20(t){return _CORN.diag.checkErc20(t);}
function DIAG_CORN_RPC_HEALTH(){return _CORN.diag.rpcHealth();}
function DIAG_CORN_NATIVE_BALANCE(w){return _CORN.diag.nativeBalance(w);}
function DIAG_CORN_CACHE(w){return _CORN.diag.cacheInspect(w);}
function DIAG_CORN_CACHE_TOKEN(w,t){return _CORN.diag.cacheFindToken(w,t);}
function DIAG_CORN_CACHE_ASSETS(w){return _CORN.diag.cacheListAssets(w);}
function DIAG_CORN_TOKEN_PRICE(t){return _CORN.diag.tokenPrice(t);}
function DIAG_CORN_NATIVE_PRICE(){return _CORN.diag.nativePrice();}
function DIAG_CORN_WALLET(w){return _CORN.diag.walletFull(w);}
function DIAG_CORN_CACHE_STATS(){return _CORN.diag.cacheStats();}
function DIAG_CORN_CLEAR_CACHE(w,c){return _CORN.diag.clearCache(w,c);}
