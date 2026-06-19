/**
 * SONIC.gs - Sonic (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _SONIC = ChainFactory.createEvmChain("SONIC", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.soniclabs.com", "https://sonic-rpc.publicnode.com", "https://sonic.drpc.org"] },
 CHAIN: {
 NAME: "Sonic",
 CHAIN_ID: 146,
 NATIVE_SYMBOL: "S",
 NATIVE_NAME: "Sonic",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:sonic-3",
 NATIVE_GECKO_ID: "sonic-3",
 DEX_SLUG: "sonic",
 GT_NETWORK: "sonic"
 },
 LLAMA_ID_MAP: { "S":"coingecko:sonic-3", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth", "wS":"coingecko:wrapped-sonic" }
});

// Main functions
function GET_WALLET_ASSETS_SONIC(a,r,t,f,g){return _SONIC.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_SONIC(a){return _SONIC.getCachedWalletAssets(a);}
function SONIC_REFRESH_STATUS(a,r,t,f,g){return _SONIC.getRefreshStatus(a,r,t,f,g);}
function SONIC_STATS(a,t){return _SONIC.getStats(a,t);}

// Diagnostic functions
function DIAG_SONIC_TOKEN(w,t,r){return _SONIC.diag.tokenBalance(w,t,r);}
function DIAG_SONIC_COMPARE_RPCS(w,t){return _SONIC.diag.compareRpcs(w,t);}
function DIAG_SONIC_CHECK_ERC20(t){return _SONIC.diag.checkErc20(t);}
function DIAG_SONIC_RPC_HEALTH(){return _SONIC.diag.rpcHealth();}
function DIAG_SONIC_NATIVE_BALANCE(w){return _SONIC.diag.nativeBalance(w);}
function DIAG_SONIC_CACHE(w){return _SONIC.diag.cacheInspect(w);}
function DIAG_SONIC_CACHE_TOKEN(w,t){return _SONIC.diag.cacheFindToken(w,t);}
function DIAG_SONIC_CACHE_ASSETS(w){return _SONIC.diag.cacheListAssets(w);}
function DIAG_SONIC_TOKEN_PRICE(t){return _SONIC.diag.tokenPrice(t);}
function DIAG_SONIC_NATIVE_PRICE(){return _SONIC.diag.nativePrice();}
function DIAG_SONIC_WALLET(w){return _SONIC.diag.walletFull(w);}
function DIAG_SONIC_CACHE_STATS(){return _SONIC.diag.cacheStats();}
function DIAG_SONIC_CLEAR_CACHE(w,c){return _SONIC.diag.clearCache(w,c);}
