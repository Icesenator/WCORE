/**
 * SHIBARIUM.gs - Shibarium (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _SHIBARIUM = ChainFactory.createEvmChain("SHIBARIUM", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://shibarium.drpc.org", "https://rpc.shibarium.shib.io"] },
 CHAIN: {
 NAME: "Shibarium",
 CHAIN_ID: 109,
 NATIVE_SYMBOL: "BONE",
 NATIVE_NAME: "Bone ShibaSwap",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:bone-shibaswap",
 NATIVE_GECKO_ID: "bone-shibaswap",
 DEX_SLUG: "shibarium",
 GT_NETWORK: "shibarium"
 },
 LLAMA_ID_MAP: { "BONE":"coingecko:bone-shibaswap" }
});

// Main functions
function GET_WALLET_ASSETS_SHIBARIUM(a,r,t,f,g){return _SHIBARIUM.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_SHIBARIUM(a){return _SHIBARIUM.getCachedWalletAssets(a);}
function SHIBARIUM_REFRESH_STATUS(a,r,t,f,g){return _SHIBARIUM.getRefreshStatus(a,r,t,f,g);}
function SHIBARIUM_STATS(a,t){return _SHIBARIUM.getStats(a,t);}

// Diagnostic functions
function DIAG_SHIBARIUM_TOKEN(w,t,r){return _SHIBARIUM.diag.tokenBalance(w,t,r);}
function DIAG_SHIBARIUM_COMPARE_RPCS(w,t){return _SHIBARIUM.diag.compareRpcs(w,t);}
function DIAG_SHIBARIUM_CHECK_ERC20(t){return _SHIBARIUM.diag.checkErc20(t);}
function DIAG_SHIBARIUM_RPC_HEALTH(){return _SHIBARIUM.diag.rpcHealth();}
function DIAG_SHIBARIUM_NATIVE_BALANCE(w){return _SHIBARIUM.diag.nativeBalance(w);}
function DIAG_SHIBARIUM_CACHE(w){return _SHIBARIUM.diag.cacheInspect(w);}
function DIAG_SHIBARIUM_CACHE_TOKEN(w,t){return _SHIBARIUM.diag.cacheFindToken(w,t);}
function DIAG_SHIBARIUM_CACHE_ASSETS(w){return _SHIBARIUM.diag.cacheListAssets(w);}
function DIAG_SHIBARIUM_TOKEN_PRICE(t){return _SHIBARIUM.diag.tokenPrice(t);}
function DIAG_SHIBARIUM_NATIVE_PRICE(){return _SHIBARIUM.diag.nativePrice();}
function DIAG_SHIBARIUM_WALLET(w){return _SHIBARIUM.diag.walletFull(w);}
function DIAG_SHIBARIUM_CACHE_STATS(){return _SHIBARIUM.diag.cacheStats();}
function DIAG_SHIBARIUM_CLEAR_CACHE(w,c){return _SHIBARIUM.diag.clearCache(w,c);}
