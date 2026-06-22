/**
 * APECHAIN.gs - ApeChain (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _APECHAIN = ChainFactory.createEvmChain("APECHAIN", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.apechain.com/http", "https://apechain.drpc.org"] },
 CHAIN: {
 NAME: "ApeChain",
 CHAIN_ID: 33139,
 NATIVE_SYMBOL: "APE",
 NATIVE_NAME: "ApeCoin",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:apecoin",
 NATIVE_GECKO_ID: "apecoin",
 DEX_SLUG: "apechain",
 GT_NETWORK: "apechain"
 },
 LLAMA_ID_MAP: { "APE":"coingecko:apecoin" }
});

// Main functions
function GET_WALLET_ASSETS_APECHAIN(a,r,t,f,g){return _APECHAIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_APECHAIN(a){return _APECHAIN.getCachedWalletAssets(a);}
function APECHAIN_REFRESH_STATUS(a,r,t,f,g){return _APECHAIN.getRefreshStatus(a,r,t,f,g);}
function APECHAIN_STATS(a,t){return _APECHAIN.getStats(a,t);}

// Diagnostic functions
function DIAG_APECHAIN_TOKEN(w,t,r){return _APECHAIN.diag.tokenBalance(w,t,r);}
function DIAG_APECHAIN_COMPARE_RPCS(w,t){return _APECHAIN.diag.compareRpcs(w,t);}
function DIAG_APECHAIN_CHECK_ERC20(t){return _APECHAIN.diag.checkErc20(t);}
function DIAG_APECHAIN_RPC_HEALTH(){return _APECHAIN.diag.rpcHealth();}
function DIAG_APECHAIN_NATIVE_BALANCE(w){return _APECHAIN.diag.nativeBalance(w);}
function DIAG_APECHAIN_CACHE(w){return _APECHAIN.diag.cacheInspect(w);}
function DIAG_APECHAIN_CACHE_TOKEN(w,t){return _APECHAIN.diag.cacheFindToken(w,t);}
function DIAG_APECHAIN_CACHE_ASSETS(w){return _APECHAIN.diag.cacheListAssets(w);}
function DIAG_APECHAIN_TOKEN_PRICE(t){return _APECHAIN.diag.tokenPrice(t);}
function DIAG_APECHAIN_NATIVE_PRICE(){return _APECHAIN.diag.nativePrice();}
function DIAG_APECHAIN_WALLET(w){return _APECHAIN.diag.walletFull(w);}
function DIAG_APECHAIN_CACHE_STATS(){return _APECHAIN.diag.cacheStats();}
function DIAG_APECHAIN_CLEAR_CACHE(w,c){return _APECHAIN.diag.clearCache(w,c);}
