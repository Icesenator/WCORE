/**
 * HEMI.gs - Hemi (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _HEMI = ChainFactory.createEvmChain("HEMI", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.hemi.network/rpc", "https://hemi.drpc.org"] },
 CHAIN: {
 NAME: "Hemi",
 CHAIN_ID: 43111,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "hemi",
 GT_NETWORK: "hemi"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_HEMI(a,r,t,f,g){return _HEMI.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_HEMI(a){return _HEMI.getCachedWalletAssets(a);}
function HEMI_REFRESH_STATUS(a,r,t,f,g){return _HEMI.getRefreshStatus(a,r,t,f,g);}
function HEMI_STATS(a,t){return _HEMI.getStats(a,t);}

// Diagnostic functions
function DIAG_HEMI_TOKEN(w,t,r){return _HEMI.diag.tokenBalance(w,t,r);}
function DIAG_HEMI_COMPARE_RPCS(w,t){return _HEMI.diag.compareRpcs(w,t);}
function DIAG_HEMI_CHECK_ERC20(t){return _HEMI.diag.checkErc20(t);}
function DIAG_HEMI_RPC_HEALTH(){return _HEMI.diag.rpcHealth();}
function DIAG_HEMI_NATIVE_BALANCE(w){return _HEMI.diag.nativeBalance(w);}
function DIAG_HEMI_CACHE(w){return _HEMI.diag.cacheInspect(w);}
function DIAG_HEMI_CACHE_TOKEN(w,t){return _HEMI.diag.cacheFindToken(w,t);}
function DIAG_HEMI_CACHE_ASSETS(w){return _HEMI.diag.cacheListAssets(w);}
function DIAG_HEMI_TOKEN_PRICE(t){return _HEMI.diag.tokenPrice(t);}
function DIAG_HEMI_NATIVE_PRICE(){return _HEMI.diag.nativePrice();}
function DIAG_HEMI_WALLET(w){return _HEMI.diag.walletFull(w);}
function DIAG_HEMI_CACHE_STATS(){return _HEMI.diag.cacheStats();}
function DIAG_HEMI_CLEAR_CACHE(w,c){return _HEMI.diag.clearCache(w,c);}
