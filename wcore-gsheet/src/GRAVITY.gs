/**
 * GRAVITY.gs - Gravity (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _GRAVITY = ChainFactory.createEvmChain("GRAVITY", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.gravity.xyz", "https://rpc.ankr.com/gravity", "https://gravity-rpc.polkachu.com", "https://1625.rpc.thirdweb.com"] },
 CHAIN: {
 NAME: "Gravity",
 CHAIN_ID: 1625,
 NATIVE_SYMBOL: "G",
 NATIVE_NAME: "Gravity",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:g-token",
 NATIVE_GECKO_ID: "g-token",
 DEX_SLUG: "gravity",
 GT_NETWORK: "gravity-alpha"
 },
 LLAMA_ID_MAP: { "G":"coingecko:g-token", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_GRAVITY(a,r,t,f,g){return _GRAVITY.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_GRAVITY(a){return _GRAVITY.getCachedWalletAssets(a);}
function GRAVITY_REFRESH_STATUS(a,r,t,f,g){return _GRAVITY.getRefreshStatus(a,r,t,f,g);}
function GRAVITY_STATS(a,t){return _GRAVITY.getStats(a,t);}

// Diagnostic functions
function DIAG_GRAVITY_TOKEN(w,t,r){return _GRAVITY.diag.tokenBalance(w,t,r);}
function DIAG_GRAVITY_COMPARE_RPCS(w,t){return _GRAVITY.diag.compareRpcs(w,t);}
function DIAG_GRAVITY_CHECK_ERC20(t){return _GRAVITY.diag.checkErc20(t);}
function DIAG_GRAVITY_RPC_HEALTH(){return _GRAVITY.diag.rpcHealth();}
function DIAG_GRAVITY_NATIVE_BALANCE(w){return _GRAVITY.diag.nativeBalance(w);}
function DIAG_GRAVITY_CACHE(w){return _GRAVITY.diag.cacheInspect(w);}
function DIAG_GRAVITY_CACHE_TOKEN(w,t){return _GRAVITY.diag.cacheFindToken(w,t);}
function DIAG_GRAVITY_CACHE_ASSETS(w){return _GRAVITY.diag.cacheListAssets(w);}
function DIAG_GRAVITY_TOKEN_PRICE(t){return _GRAVITY.diag.tokenPrice(t);}
function DIAG_GRAVITY_NATIVE_PRICE(){return _GRAVITY.diag.nativePrice();}
function DIAG_GRAVITY_WALLET(w){return _GRAVITY.diag.walletFull(w);}
function DIAG_GRAVITY_CACHE_STATS(){return _GRAVITY.diag.cacheStats();}
function DIAG_GRAVITY_CLEAR_CACHE(w,c){return _GRAVITY.diag.clearCache(w,c);}
