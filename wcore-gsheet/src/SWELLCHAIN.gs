/**
 * SWELLCHAIN.gs - Swell Chain (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _SWELLCHAIN = ChainFactory.createEvmChain("SWELLCHAIN", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://swell.drpc.org", "https://rpc.ankr.com/swell"] }, // v4.16.31: alt.technology 401, hypersync 401, tenderly 404 (revalidation 2026-07-17, chaine vivante bloc frais)
 CHAIN: {
 NAME: "Swell Chain",
 CHAIN_ID: 1923,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "swellchain",
 GT_NETWORK: "swellchain"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum", "SWELL":"coingecko:swell-network", "USDC":"coingecko:usd-coin", "WETH":"coingecko:weth", "rswETH":"coingecko:restaked-swell-eth", "swETH":"coingecko:sweth" }
});

// Main functions
function GET_WALLET_ASSETS_SWELLCHAIN(a,r,t,f,g){return _SWELLCHAIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_SWELLCHAIN(a){return _SWELLCHAIN.getCachedWalletAssets(a);}
function SWELLCHAIN_REFRESH_STATUS(a,r,t,f,g){return _SWELLCHAIN.getRefreshStatus(a,r,t,f,g);}
function SWELLCHAIN_STATS(a,t){return _SWELLCHAIN.getStats(a,t);}

// Diagnostic functions
function DIAG_SWELLCHAIN_TOKEN(w,t,r){return _SWELLCHAIN.diag.tokenBalance(w,t,r);}
function DIAG_SWELLCHAIN_COMPARE_RPCS(w,t){return _SWELLCHAIN.diag.compareRpcs(w,t);}
function DIAG_SWELLCHAIN_CHECK_ERC20(t){return _SWELLCHAIN.diag.checkErc20(t);}
function DIAG_SWELLCHAIN_RPC_HEALTH(){return _SWELLCHAIN.diag.rpcHealth();}
function DIAG_SWELLCHAIN_NATIVE_BALANCE(w){return _SWELLCHAIN.diag.nativeBalance(w);}
function DIAG_SWELLCHAIN_CACHE(w){return _SWELLCHAIN.diag.cacheInspect(w);}
function DIAG_SWELLCHAIN_CACHE_TOKEN(w,t){return _SWELLCHAIN.diag.cacheFindToken(w,t);}
function DIAG_SWELLCHAIN_CACHE_ASSETS(w){return _SWELLCHAIN.diag.cacheListAssets(w);}
function DIAG_SWELLCHAIN_TOKEN_PRICE(t){return _SWELLCHAIN.diag.tokenPrice(t);}
function DIAG_SWELLCHAIN_NATIVE_PRICE(){return _SWELLCHAIN.diag.nativePrice();}
function DIAG_SWELLCHAIN_WALLET(w){return _SWELLCHAIN.diag.walletFull(w);}
function DIAG_SWELLCHAIN_CACHE_STATS(){return _SWELLCHAIN.diag.cacheStats();}
function DIAG_SWELLCHAIN_CLEAR_CACHE(w,c){return _SWELLCHAIN.diag.clearCache(w,c);}
