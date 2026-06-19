/**
 * MITOSIS.gs - Mitosis (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _MITOSIS = ChainFactory.createEvmChain("MITOSIS", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.mitosis.org"] },
 CHAIN: {
 NAME: "Mitosis",
 CHAIN_ID: 124816,
 NATIVE_SYMBOL: "MITO",
 NATIVE_NAME: "MITO",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:mitosis",
 NATIVE_GECKO_ID: "mitosis",
 DEX_SLUG: "mitosis",
 GT_NETWORK: "mitosis"
 },
 LLAMA_ID_MAP: { "MITO":"coingecko:mitosis" }
});

// Main functions
function GET_WALLET_ASSETS_MITOSIS(a,r,t,f,g){return _MITOSIS.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_MITOSIS(a){return _MITOSIS.getCachedWalletAssets(a);}
function MITOSIS_REFRESH_STATUS(a,r,t,f,g){return _MITOSIS.getRefreshStatus(a,r,t,f,g);}
function MITOSIS_STATS(a,t){return _MITOSIS.getStats(a,t);}

// Diagnostic functions
function DIAG_MITOSIS_TOKEN(w,t,r){return _MITOSIS.diag.tokenBalance(w,t,r);}
function DIAG_MITOSIS_COMPARE_RPCS(w,t){return _MITOSIS.diag.compareRpcs(w,t);}
function DIAG_MITOSIS_CHECK_ERC20(t){return _MITOSIS.diag.checkErc20(t);}
function DIAG_MITOSIS_RPC_HEALTH(){return _MITOSIS.diag.rpcHealth();}
function DIAG_MITOSIS_NATIVE_BALANCE(w){return _MITOSIS.diag.nativeBalance(w);}
function DIAG_MITOSIS_CACHE(w){return _MITOSIS.diag.cacheInspect(w);}
function DIAG_MITOSIS_CACHE_TOKEN(w,t){return _MITOSIS.diag.cacheFindToken(w,t);}
function DIAG_MITOSIS_CACHE_ASSETS(w){return _MITOSIS.diag.cacheListAssets(w);}
function DIAG_MITOSIS_TOKEN_PRICE(t){return _MITOSIS.diag.tokenPrice(t);}
function DIAG_MITOSIS_NATIVE_PRICE(){return _MITOSIS.diag.nativePrice();}
function DIAG_MITOSIS_WALLET(w){return _MITOSIS.diag.walletFull(w);}
function DIAG_MITOSIS_CACHE_STATS(){return _MITOSIS.diag.cacheStats();}
function DIAG_MITOSIS_CLEAR_CACHE(w,c){return _MITOSIS.diag.clearCache(w,c);}
