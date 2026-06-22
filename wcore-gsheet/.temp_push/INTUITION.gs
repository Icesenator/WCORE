/**
 * INTUITION.gs - Intuition (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _INTUITION = ChainFactory.createEvmChain("INTUITION", {
 CACHE_VERSION: 64,
 RPC: { ENDPOINTS: ["https://rpc.intuition.systems", "https://intuition.calderachain.xyz/http"] }, // Caldera
 CHAIN: {
 NAME: "Intuition",
 CHAIN_ID: 1155,
 NATIVE_SYMBOL: "TRUST",
 NATIVE_NAME: "Trust",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:intuition",
 NATIVE_GECKO_ID: "intuition",
 DEX_SLUG: "intuition",
 GT_NETWORK: "intuition"
 },
 LLAMA_ID_MAP: { "TRUST":"coingecko:intuition" }
});

// Main functions
function GET_WALLET_ASSETS_INTUITION(a,r,t,f,g){return _INTUITION.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_INTUITION(a){return _INTUITION.getCachedWalletAssets(a);}
function INTUITION_REFRESH_STATUS(a,r,t,f,g){return _INTUITION.getRefreshStatus(a,r,t,f,g);}
function INTUITION_STATS(a,t){return _INTUITION.getStats(a,t);}

// Diagnostic functions
function DIAG_INTUITION_TOKEN(w,t,r){return _INTUITION.diag.tokenBalance(w,t,r);}
function DIAG_INTUITION_COMPARE_RPCS(w,t){return _INTUITION.diag.compareRpcs(w,t);}
function DIAG_INTUITION_CHECK_ERC20(t){return _INTUITION.diag.checkErc20(t);}
function DIAG_INTUITION_RPC_HEALTH(){return _INTUITION.diag.rpcHealth();}
function DIAG_INTUITION_NATIVE_BALANCE(w){return _INTUITION.diag.nativeBalance(w);}
function DIAG_INTUITION_CACHE(w){return _INTUITION.diag.cacheInspect(w);}
function DIAG_INTUITION_CACHE_TOKEN(w,t){return _INTUITION.diag.cacheFindToken(w,t);}
function DIAG_INTUITION_CACHE_ASSETS(w){return _INTUITION.diag.cacheListAssets(w);}
function DIAG_INTUITION_TOKEN_PRICE(t){return _INTUITION.diag.tokenPrice(t);}
function DIAG_INTUITION_NATIVE_PRICE(){return _INTUITION.diag.nativePrice();}
function DIAG_INTUITION_WALLET(w){return _INTUITION.diag.walletFull(w);}
function DIAG_INTUITION_CACHE_STATS(){return _INTUITION.diag.cacheStats();}
function DIAG_INTUITION_CLEAR_CACHE(w,c){return _INTUITION.diag.clearCache(w,c);}
