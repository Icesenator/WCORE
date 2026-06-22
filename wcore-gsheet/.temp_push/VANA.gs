/**
 * VANA.gs - Vana (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _VANA = ChainFactory.createEvmChain("VANA", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.vana.org"] },
 CHAIN: {
 NAME: "Vana",
 CHAIN_ID: 1480,
 NATIVE_SYMBOL: "VANA",
 NATIVE_NAME: "Vana",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:vana",
 NATIVE_GECKO_ID: "vana",
 DEX_SLUG: "vana",
 GT_NETWORK: "vana"
 },
 LLAMA_ID_MAP: { "VANA":"coingecko:vana" }
});

// Main functions
function GET_WALLET_ASSETS_VANA(a,r,t,f,g){return _VANA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_VANA(a){return _VANA.getCachedWalletAssets(a);}
function VANA_REFRESH_STATUS(a,r,t,f,g){return _VANA.getRefreshStatus(a,r,t,f,g);}
function VANA_STATS(a,t){return _VANA.getStats(a,t);}

// Diagnostic functions
function DIAG_VANA_TOKEN(w,t,r){return _VANA.diag.tokenBalance(w,t,r);}
function DIAG_VANA_COMPARE_RPCS(w,t){return _VANA.diag.compareRpcs(w,t);}
function DIAG_VANA_CHECK_ERC20(t){return _VANA.diag.checkErc20(t);}
function DIAG_VANA_RPC_HEALTH(){return _VANA.diag.rpcHealth();}
function DIAG_VANA_NATIVE_BALANCE(w){return _VANA.diag.nativeBalance(w);}
function DIAG_VANA_CACHE(w){return _VANA.diag.cacheInspect(w);}
function DIAG_VANA_CACHE_TOKEN(w,t){return _VANA.diag.cacheFindToken(w,t);}
function DIAG_VANA_CACHE_ASSETS(w){return _VANA.diag.cacheListAssets(w);}
function DIAG_VANA_TOKEN_PRICE(t){return _VANA.diag.tokenPrice(t);}
function DIAG_VANA_NATIVE_PRICE(){return _VANA.diag.nativePrice();}
function DIAG_VANA_WALLET(w){return _VANA.diag.walletFull(w);}
function DIAG_VANA_CACHE_STATS(){return _VANA.diag.cacheStats();}
function DIAG_VANA_CLEAR_CACHE(w,c){return _VANA.diag.clearCache(w,c);}
