/**
 * DOMA.gs - Doma (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _DOMA = ChainFactory.createEvmChain("DOMA", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://doma.drpc.org", "https://rpc.doma.xyz"] },
 CHAIN: {
 NAME: "Doma",
 CHAIN_ID: 97477,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "doma",
 GT_NETWORK: "doma"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_DOMA(a,r,t,f,g){return _DOMA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_DOMA(a){return _DOMA.getCachedWalletAssets(a);}
function DOMA_REFRESH_STATUS(a,r,t,f,g){return _DOMA.getRefreshStatus(a,r,t,f,g);}
function DOMA_STATS(a,t){return _DOMA.getStats(a,t);}

// Diagnostic functions
function DIAG_DOMA_TOKEN(w,t,r){return _DOMA.diag.tokenBalance(w,t,r);}
function DIAG_DOMA_COMPARE_RPCS(w,t){return _DOMA.diag.compareRpcs(w,t);}
function DIAG_DOMA_CHECK_ERC20(t){return _DOMA.diag.checkErc20(t);}
function DIAG_DOMA_RPC_HEALTH(){return _DOMA.diag.rpcHealth();}
function DIAG_DOMA_NATIVE_BALANCE(w){return _DOMA.diag.nativeBalance(w);}
function DIAG_DOMA_CACHE(w){return _DOMA.diag.cacheInspect(w);}
function DIAG_DOMA_CACHE_TOKEN(w,t){return _DOMA.diag.cacheFindToken(w,t);}
function DIAG_DOMA_CACHE_ASSETS(w){return _DOMA.diag.cacheListAssets(w);}
function DIAG_DOMA_TOKEN_PRICE(t){return _DOMA.diag.tokenPrice(t);}
function DIAG_DOMA_NATIVE_PRICE(){return _DOMA.diag.nativePrice();}
function DIAG_DOMA_WALLET(w){return _DOMA.diag.walletFull(w);}
function DIAG_DOMA_CACHE_STATS(){return _DOMA.diag.cacheStats();}
function DIAG_DOMA_CLEAR_CACHE(w,c){return _DOMA.diag.clearCache(w,c);}
