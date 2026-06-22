/**
 * B2.gs - B2 (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _B2 = ChainFactory.createEvmChain("B2", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.bsquared.network", "https://b2-mainnet.alt.technology"] },
 CHAIN: {
 NAME: "B2",
 CHAIN_ID: 223,
 NATIVE_SYMBOL: "BTC",
 NATIVE_NAME: "Bitcoin",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:bitcoin",
 NATIVE_GECKO_ID: "bitcoin",
 DEX_SLUG: "b2-network",
 GT_NETWORK: "bsquared-network"
 },
 LLAMA_ID_MAP: { "BTC":"coingecko:bitcoin" }
});

// Main functions
function GET_WALLET_ASSETS_B2(a,r,t,f,g){return _B2.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_B2(a){return _B2.getCachedWalletAssets(a);}
function B2_REFRESH_STATUS(a,r,t,f,g){return _B2.getRefreshStatus(a,r,t,f,g);}
function B2_STATS(a,t){return _B2.getStats(a,t);}

// Diagnostic functions
function DIAG_B2_TOKEN(w,t,r){return _B2.diag.tokenBalance(w,t,r);}
function DIAG_B2_COMPARE_RPCS(w,t){return _B2.diag.compareRpcs(w,t);}
function DIAG_B2_CHECK_ERC20(t){return _B2.diag.checkErc20(t);}
function DIAG_B2_RPC_HEALTH(){return _B2.diag.rpcHealth();}
function DIAG_B2_NATIVE_BALANCE(w){return _B2.diag.nativeBalance(w);}
function DIAG_B2_CACHE(w){return _B2.diag.cacheInspect(w);}
function DIAG_B2_CACHE_TOKEN(w,t){return _B2.diag.cacheFindToken(w,t);}
function DIAG_B2_CACHE_ASSETS(w){return _B2.diag.cacheListAssets(w);}
function DIAG_B2_TOKEN_PRICE(t){return _B2.diag.tokenPrice(t);}
function DIAG_B2_NATIVE_PRICE(){return _B2.diag.nativePrice();}
function DIAG_B2_WALLET(w){return _B2.diag.walletFull(w);}
function DIAG_B2_CACHE_STATS(){return _B2.diag.cacheStats();}
function DIAG_B2_CLEAR_CACHE(w,c){return _B2.diag.clearCache(w,c);}
