/**
 * SUPERSEED.gs - Superseed (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _SUPERSEED = ChainFactory.createEvmChain("SUPERSEED", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://mainnet.superseed.xyz", "https://superseed.drpc.org"] }, // dRPC
 CHAIN: {
 NAME: "Superseed",
 CHAIN_ID: 5330,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "superseed",
 GT_NETWORK: "superseed"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum" }
});

// Main functions
function GET_WALLET_ASSETS_SUPERSEED(a,r,t,f,g){return _SUPERSEED.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_SUPERSEED(a){return _SUPERSEED.getCachedWalletAssets(a);}
function SUPERSEED_REFRESH_STATUS(a,r,t,f,g){return _SUPERSEED.getRefreshStatus(a,r,t,f,g);}
function SUPERSEED_STATS(a,t){return _SUPERSEED.getStats(a,t);}

// Diagnostic functions
function DIAG_SUPERSEED_TOKEN(w,t,r){return _SUPERSEED.diag.tokenBalance(w,t,r);}
function DIAG_SUPERSEED_COMPARE_RPCS(w,t){return _SUPERSEED.diag.compareRpcs(w,t);}
function DIAG_SUPERSEED_CHECK_ERC20(t){return _SUPERSEED.diag.checkErc20(t);}
function DIAG_SUPERSEED_RPC_HEALTH(){return _SUPERSEED.diag.rpcHealth();}
function DIAG_SUPERSEED_NATIVE_BALANCE(w){return _SUPERSEED.diag.nativeBalance(w);}
function DIAG_SUPERSEED_CACHE(w){return _SUPERSEED.diag.cacheInspect(w);}
function DIAG_SUPERSEED_CACHE_TOKEN(w,t){return _SUPERSEED.diag.cacheFindToken(w,t);}
function DIAG_SUPERSEED_CACHE_ASSETS(w){return _SUPERSEED.diag.cacheListAssets(w);}
function DIAG_SUPERSEED_TOKEN_PRICE(t){return _SUPERSEED.diag.tokenPrice(t);}
function DIAG_SUPERSEED_NATIVE_PRICE(){return _SUPERSEED.diag.nativePrice();}
function DIAG_SUPERSEED_WALLET(w){return _SUPERSEED.diag.walletFull(w);}
function DIAG_SUPERSEED_CACHE_STATS(){return _SUPERSEED.diag.cacheStats();}
function DIAG_SUPERSEED_CLEAR_CACHE(w,c){return _SUPERSEED.diag.clearCache(w,c);}
