/**
 * MANTLE.gs - Mantle (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _MANTLE = ChainFactory.createEvmChain("MANTLE", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.mantle.xyz", "https://1rpc.io/mantle", "https://mantle.drpc.org", "https://mantle-rpc.publicnode.com"] },
 CHAIN: {
 NAME: "Mantle",
 CHAIN_ID: 5000,
 NATIVE_SYMBOL: "MNT",
 NATIVE_NAME: "Mantle",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:mantle",
 NATIVE_GECKO_ID: "mantle",
 DEX_SLUG: "mantle",
 GT_NETWORK: "mantle"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "ETH":"coingecko:ethereum", "MNT":"coingecko:mantle", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth", "WMNT":"coingecko:mantle" }
});

// Main functions
function GET_WALLET_ASSETS_MANTLE(a,r,t,f,g){return _MANTLE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_MANTLE(a){return _MANTLE.getCachedWalletAssets(a);}
function MANTLE_REFRESH_STATUS(a,r,t,f,g){return _MANTLE.getRefreshStatus(a,r,t,f,g);}
function MANTLE_STATS(a,t){return _MANTLE.getStats(a,t);}

// Diagnostic functions
function DIAG_MANTLE_TOKEN(w,t,r){return _MANTLE.diag.tokenBalance(w,t,r);}
function DIAG_MANTLE_COMPARE_RPCS(w,t){return _MANTLE.diag.compareRpcs(w,t);}
function DIAG_MANTLE_CHECK_ERC20(t){return _MANTLE.diag.checkErc20(t);}
function DIAG_MANTLE_RPC_HEALTH(){return _MANTLE.diag.rpcHealth();}
function DIAG_MANTLE_NATIVE_BALANCE(w){return _MANTLE.diag.nativeBalance(w);}
function DIAG_MANTLE_CACHE(w){return _MANTLE.diag.cacheInspect(w);}
function DIAG_MANTLE_CACHE_TOKEN(w,t){return _MANTLE.diag.cacheFindToken(w,t);}
function DIAG_MANTLE_CACHE_ASSETS(w){return _MANTLE.diag.cacheListAssets(w);}
function DIAG_MANTLE_TOKEN_PRICE(t){return _MANTLE.diag.tokenPrice(t);}
function DIAG_MANTLE_NATIVE_PRICE(){return _MANTLE.diag.nativePrice();}
function DIAG_MANTLE_WALLET(w){return _MANTLE.diag.walletFull(w);}
function DIAG_MANTLE_CACHE_STATS(){return _MANTLE.diag.cacheStats();}
function DIAG_MANTLE_CLEAR_CACHE(w,c){return _MANTLE.diag.clearCache(w,c);}
