/**
 * BOTANIX.gs - Botanix (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _BOTANIX = ChainFactory.createEvmChain("BOTANIX", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.ankr.com/botanix_mainnet", "https://rpc.botanixlabs.com"] },
 CHAIN: {
 NAME: "Botanix",
 CHAIN_ID: 3637,
 NATIVE_SYMBOL: "BTC",
 NATIVE_NAME: "Bitcoin",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:bitcoin",
 NATIVE_GECKO_ID: "bitcoin",
 DEX_SLUG: "botanix",
 GT_NETWORK: "botanix"
 },
 LLAMA_ID_MAP: { "BTC":"coingecko:bitcoin" }
});

// Main functions
function GET_WALLET_ASSETS_BOTANIX(a,r,t,f,g){return _BOTANIX.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_BOTANIX(a){return _BOTANIX.getCachedWalletAssets(a);}
function BOTANIX_REFRESH_STATUS(a,r,t,f,g){return _BOTANIX.getRefreshStatus(a,r,t,f,g);}
function BOTANIX_STATS(a,t){return _BOTANIX.getStats(a,t);}

// Diagnostic functions
function DIAG_BOTANIX_TOKEN(w,t,r){return _BOTANIX.diag.tokenBalance(w,t,r);}
function DIAG_BOTANIX_COMPARE_RPCS(w,t){return _BOTANIX.diag.compareRpcs(w,t);}
function DIAG_BOTANIX_CHECK_ERC20(t){return _BOTANIX.diag.checkErc20(t);}
function DIAG_BOTANIX_RPC_HEALTH(){return _BOTANIX.diag.rpcHealth();}
function DIAG_BOTANIX_NATIVE_BALANCE(w){return _BOTANIX.diag.nativeBalance(w);}
function DIAG_BOTANIX_CACHE(w){return _BOTANIX.diag.cacheInspect(w);}
function DIAG_BOTANIX_CACHE_TOKEN(w,t){return _BOTANIX.diag.cacheFindToken(w,t);}
function DIAG_BOTANIX_CACHE_ASSETS(w){return _BOTANIX.diag.cacheListAssets(w);}
function DIAG_BOTANIX_TOKEN_PRICE(t){return _BOTANIX.diag.tokenPrice(t);}
function DIAG_BOTANIX_NATIVE_PRICE(){return _BOTANIX.diag.nativePrice();}
function DIAG_BOTANIX_WALLET(w){return _BOTANIX.diag.walletFull(w);}
function DIAG_BOTANIX_CACHE_STATS(){return _BOTANIX.diag.cacheStats();}
function DIAG_BOTANIX_CLEAR_CACHE(w,c){return _BOTANIX.diag.clearCache(w,c);}
