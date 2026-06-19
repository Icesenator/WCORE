/**
 * MORPH.gs - Morph (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _MORPH = ChainFactory.createEvmChain("MORPH", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.morphl2.io", "https://morph.drpc.org", "https://rpc.ankr.com/morph"] },
 CHAIN: {
 NAME: "Morph",
 CHAIN_ID: 2818,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ethereum",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "morph",
 GT_NETWORK: "morph-l2"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum" }
});

// Main functions
function GET_WALLET_ASSETS_MORPH(a,r,t,f,g){return _MORPH.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_MORPH(a){return _MORPH.getCachedWalletAssets(a);}
function MORPH_REFRESH_STATUS(a,r,t,f,g){return _MORPH.getRefreshStatus(a,r,t,f,g);}
function MORPH_STATS(a,t){return _MORPH.getStats(a,t);}

// Diagnostic functions
function DIAG_MORPH_TOKEN(w,t,r){return _MORPH.diag.tokenBalance(w,t,r);}
function DIAG_MORPH_COMPARE_RPCS(w,t){return _MORPH.diag.compareRpcs(w,t);}
function DIAG_MORPH_CHECK_ERC20(t){return _MORPH.diag.checkErc20(t);}
function DIAG_MORPH_RPC_HEALTH(){return _MORPH.diag.rpcHealth();}
function DIAG_MORPH_NATIVE_BALANCE(w){return _MORPH.diag.nativeBalance(w);}
function DIAG_MORPH_CACHE(w){return _MORPH.diag.cacheInspect(w);}
function DIAG_MORPH_CACHE_TOKEN(w,t){return _MORPH.diag.cacheFindToken(w,t);}
function DIAG_MORPH_CACHE_ASSETS(w){return _MORPH.diag.cacheListAssets(w);}
function DIAG_MORPH_TOKEN_PRICE(t){return _MORPH.diag.tokenPrice(t);}
function DIAG_MORPH_NATIVE_PRICE(){return _MORPH.diag.nativePrice();}
function DIAG_MORPH_WALLET(w){return _MORPH.diag.walletFull(w);}
function DIAG_MORPH_CACHE_STATS(){return _MORPH.diag.cacheStats();}
function DIAG_MORPH_CLEAR_CACHE(w,c){return _MORPH.diag.clearCache(w,c);}
