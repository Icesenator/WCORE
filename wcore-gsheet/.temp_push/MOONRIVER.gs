/**
 * MOONRIVER.gs - Moonriver (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _MOONRIVER = ChainFactory.createEvmChain("MOONRIVER", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.api.moonriver.moonbeam.network", "https://moonriver.drpc.org", "https://moonriver-rpc.publicnode.com"] },
 CHAIN: {
 NAME: "Moonriver",
 CHAIN_ID: 1285,
 NATIVE_SYMBOL: "MOVR",
 NATIVE_NAME: "Moonriver",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:moonriver",
 NATIVE_GECKO_ID: "moonriver",
 DEX_SLUG: "moonriver",
 GT_NETWORK: "movr"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "MOVR":"coingecko:moonriver", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth", "WMOVR":"coingecko:wrapped-moonriver" }
});

// Main functions
function GET_WALLET_ASSETS_MOONRIVER(a,r,t,f,g){return _MOONRIVER.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_MOONRIVER(a){return _MOONRIVER.getCachedWalletAssets(a);}
function MOONRIVER_REFRESH_STATUS(a,r,t,f,g){return _MOONRIVER.getRefreshStatus(a,r,t,f,g);}
function MOONRIVER_STATS(a,t){return _MOONRIVER.getStats(a,t);}

// Diagnostic functions
function DIAG_MOONRIVER_TOKEN(w,t,r){return _MOONRIVER.diag.tokenBalance(w,t,r);}
function DIAG_MOONRIVER_COMPARE_RPCS(w,t){return _MOONRIVER.diag.compareRpcs(w,t);}
function DIAG_MOONRIVER_CHECK_ERC20(t){return _MOONRIVER.diag.checkErc20(t);}
function DIAG_MOONRIVER_RPC_HEALTH(){return _MOONRIVER.diag.rpcHealth();}
function DIAG_MOONRIVER_NATIVE_BALANCE(w){return _MOONRIVER.diag.nativeBalance(w);}
function DIAG_MOONRIVER_CACHE(w){return _MOONRIVER.diag.cacheInspect(w);}
function DIAG_MOONRIVER_CACHE_TOKEN(w,t){return _MOONRIVER.diag.cacheFindToken(w,t);}
function DIAG_MOONRIVER_CACHE_ASSETS(w){return _MOONRIVER.diag.cacheListAssets(w);}
function DIAG_MOONRIVER_TOKEN_PRICE(t){return _MOONRIVER.diag.tokenPrice(t);}
function DIAG_MOONRIVER_NATIVE_PRICE(){return _MOONRIVER.diag.nativePrice();}
function DIAG_MOONRIVER_WALLET(w){return _MOONRIVER.diag.walletFull(w);}
function DIAG_MOONRIVER_CACHE_STATS(){return _MOONRIVER.diag.cacheStats();}
function DIAG_MOONRIVER_CLEAR_CACHE(w,c){return _MOONRIVER.diag.clearCache(w,c);}
