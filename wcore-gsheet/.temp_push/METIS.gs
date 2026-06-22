/**
 * METIS.gs - Metis (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _METIS = ChainFactory.createEvmChain("METIS", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://andromeda.metis.io/?owner=1088", "https://metis-rpc.publicnode.com", "https://metis.drpc.org"] },
 CHAIN: {
 NAME: "Metis",
 CHAIN_ID: 1088,
 NATIVE_SYMBOL: "METIS",
 NATIVE_NAME: "Metis",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:metis-token",
 NATIVE_GECKO_ID: "metis-token",
 DEX_SLUG: "metis",
 GT_NETWORK: "metis"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "METIS":"coingecko:metis-token", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WETH":"coingecko:weth", "WMETIS":"coingecko:metis-token" }
});

// Main functions
function GET_WALLET_ASSETS_METIS(a,r,t,f,g){return _METIS.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_METIS(a){return _METIS.getCachedWalletAssets(a);}
function METIS_REFRESH_STATUS(a,r,t,f,g){return _METIS.getRefreshStatus(a,r,t,f,g);}
function METIS_STATS(a,t){return _METIS.getStats(a,t);}

// Diagnostic functions
function DIAG_METIS_TOKEN(w,t,r){return _METIS.diag.tokenBalance(w,t,r);}
function DIAG_METIS_COMPARE_RPCS(w,t){return _METIS.diag.compareRpcs(w,t);}
function DIAG_METIS_CHECK_ERC20(t){return _METIS.diag.checkErc20(t);}
function DIAG_METIS_RPC_HEALTH(){return _METIS.diag.rpcHealth();}
function DIAG_METIS_NATIVE_BALANCE(w){return _METIS.diag.nativeBalance(w);}
function DIAG_METIS_CACHE(w){return _METIS.diag.cacheInspect(w);}
function DIAG_METIS_CACHE_TOKEN(w,t){return _METIS.diag.cacheFindToken(w,t);}
function DIAG_METIS_CACHE_ASSETS(w){return _METIS.diag.cacheListAssets(w);}
function DIAG_METIS_TOKEN_PRICE(t){return _METIS.diag.tokenPrice(t);}
function DIAG_METIS_NATIVE_PRICE(){return _METIS.diag.nativePrice();}
function DIAG_METIS_WALLET(w){return _METIS.diag.walletFull(w);}
function DIAG_METIS_CACHE_STATS(){return _METIS.diag.cacheStats();}
function DIAG_METIS_CLEAR_CACHE(w,c){return _METIS.diag.clearCache(w,c);}
