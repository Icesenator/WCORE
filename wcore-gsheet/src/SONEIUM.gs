/**
 * SONEIUM.gs - Soneium (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _SONEIUM = ChainFactory.createEvmChain("SONEIUM", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.soneium.org", "https://soneium.drpc.org"] },
 CHAIN: {
 NAME: "Soneium",
 CHAIN_ID: 1868,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "soneium",
 GT_NETWORK: "soneium"
 }
});

// Main functions
function GET_WALLET_ASSETS_SONEIUM(a,r,t,f,g){return _SONEIUM.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_SONEIUM(a){return _SONEIUM.getCachedWalletAssets(a);}
function SONEIUM_REFRESH_STATUS(a,r,t,f,g){return _SONEIUM.getRefreshStatus(a,r,t,f,g);}
function SONEIUM_STATS(a,t){return _SONEIUM.getStats(a,t);}

// Diagnostic functions
function DIAG_SONEIUM_TOKEN(w,t,r){return _SONEIUM.diag.tokenBalance(w,t,r);}
function DIAG_SONEIUM_COMPARE_RPCS(w,t){return _SONEIUM.diag.compareRpcs(w,t);}
function DIAG_SONEIUM_CHECK_ERC20(t){return _SONEIUM.diag.checkErc20(t);}
function DIAG_SONEIUM_RPC_HEALTH(){return _SONEIUM.diag.rpcHealth();}
function DIAG_SONEIUM_NATIVE_BALANCE(w){return _SONEIUM.diag.nativeBalance(w);}
function DIAG_SONEIUM_CACHE(w){return _SONEIUM.diag.cacheInspect(w);}
function DIAG_SONEIUM_CACHE_TOKEN(w,t){return _SONEIUM.diag.cacheFindToken(w,t);}
function DIAG_SONEIUM_CACHE_ASSETS(w){return _SONEIUM.diag.cacheListAssets(w);}
function DIAG_SONEIUM_TOKEN_PRICE(t){return _SONEIUM.diag.tokenPrice(t);}
function DIAG_SONEIUM_NATIVE_PRICE(){return _SONEIUM.diag.nativePrice();}
function DIAG_SONEIUM_WALLET(w){return _SONEIUM.diag.walletFull(w);}
function DIAG_SONEIUM_CACHE_STATS(){return _SONEIUM.diag.cacheStats();}
function DIAG_SONEIUM_CLEAR_CACHE(w,c){return _SONEIUM.diag.clearCache(w,c);}
