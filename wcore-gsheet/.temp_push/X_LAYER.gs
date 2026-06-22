/**
 * X_LAYER.gs - X Layer (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _X_LAYER = ChainFactory.createEvmChain("X_LAYER", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.xlayer.tech", "https://xlayerrpc.okx.com", "https://xlayer.drpc.org"] },
 CHAIN: {
 NAME: "X Layer",
 CHAIN_ID: 196,
 NATIVE_SYMBOL: "OKB",
 NATIVE_NAME: "OKB",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:okb",
 NATIVE_GECKO_ID: "okb",
 DEX_SLUG: "xlayer",
 GT_NETWORK: "x-layer"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum", "OKB":"coingecko:okb", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WETH":"coingecko:weth", "WOKB":"coingecko:okb" }
});

// Main functions
function GET_WALLET_ASSETS_X_LAYER(a,r,t,f,g){return _X_LAYER.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_X_LAYER(a){return _X_LAYER.getCachedWalletAssets(a);}
function X_LAYER_REFRESH_STATUS(a,r,t,f,g){return _X_LAYER.getRefreshStatus(a,r,t,f,g);}
function X_LAYER_STATS(a,t){return _X_LAYER.getStats(a,t);}

// Diagnostic functions
function DIAG_X_LAYER_TOKEN(w,t,r){return _X_LAYER.diag.tokenBalance(w,t,r);}
function DIAG_X_LAYER_COMPARE_RPCS(w,t){return _X_LAYER.diag.compareRpcs(w,t);}
function DIAG_X_LAYER_CHECK_ERC20(t){return _X_LAYER.diag.checkErc20(t);}
function DIAG_X_LAYER_RPC_HEALTH(){return _X_LAYER.diag.rpcHealth();}
function DIAG_X_LAYER_NATIVE_BALANCE(w){return _X_LAYER.diag.nativeBalance(w);}
function DIAG_X_LAYER_CACHE(w){return _X_LAYER.diag.cacheInspect(w);}
function DIAG_X_LAYER_CACHE_TOKEN(w,t){return _X_LAYER.diag.cacheFindToken(w,t);}
function DIAG_X_LAYER_CACHE_ASSETS(w){return _X_LAYER.diag.cacheListAssets(w);}
function DIAG_X_LAYER_TOKEN_PRICE(t){return _X_LAYER.diag.tokenPrice(t);}
function DIAG_X_LAYER_NATIVE_PRICE(){return _X_LAYER.diag.nativePrice();}
function DIAG_X_LAYER_WALLET(w){return _X_LAYER.diag.walletFull(w);}
function DIAG_X_LAYER_CACHE_STATS(){return _X_LAYER.diag.cacheStats();}
function DIAG_X_LAYER_CLEAR_CACHE(w,c){return _X_LAYER.diag.clearCache(w,c);}
