/**
 * GEB.gs - GEB (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _GEB = ChainFactory.createEvmChain("GEB", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc-mainnet-1.bevm.io", "https://rpc-mainnet-2.bevm.io"] },
 CHAIN: {
 NAME: "GEB",
 CHAIN_ID: 11501,
 NATIVE_SYMBOL: "BTC",
 NATIVE_NAME: "Bitcoin",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:bitcoin",
 NATIVE_GECKO_ID: "bitcoin",
 DEX_SLUG: "bevm",
 GT_NETWORK: "bevm"
 },
 LLAMA_ID_MAP: { "BTC":"coingecko:bitcoin", "WSTBTC":"coingecko:bitcoin" },
 LLAMA_CONTRACT_MAP: { "0xf2692468666e459d87052f68ae474e36c1a34fbb":"coingecko:tether" }
});

// Main functions
function GET_WALLET_ASSETS_GEB(a,r,t,f,g){return _GEB.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_GEB(a){return _GEB.getCachedWalletAssets(a);}
function GEB_REFRESH_STATUS(a,r,t,f,g){return _GEB.getRefreshStatus(a,r,t,f,g);}
function GEB_STATS(a,t){return _GEB.getStats(a,t);}

// Diagnostic functions
function DIAG_GEB_TOKEN(w,t,r){return _GEB.diag.tokenBalance(w,t,r);}
function DIAG_GEB_COMPARE_RPCS(w,t){return _GEB.diag.compareRpcs(w,t);}
function DIAG_GEB_CHECK_ERC20(t){return _GEB.diag.checkErc20(t);}
function DIAG_GEB_RPC_HEALTH(){return _GEB.diag.rpcHealth();}
function DIAG_GEB_NATIVE_BALANCE(w){return _GEB.diag.nativeBalance(w);}
function DIAG_GEB_CACHE(w){return _GEB.diag.cacheInspect(w);}
function DIAG_GEB_CACHE_TOKEN(w,t){return _GEB.diag.cacheFindToken(w,t);}
function DIAG_GEB_CACHE_ASSETS(w){return _GEB.diag.cacheListAssets(w);}
function DIAG_GEB_TOKEN_PRICE(t){return _GEB.diag.tokenPrice(t);}
function DIAG_GEB_NATIVE_PRICE(){return _GEB.diag.nativePrice();}
function DIAG_GEB_WALLET(w){return _GEB.diag.walletFull(w);}
function DIAG_GEB_CACHE_STATS(){return _GEB.diag.cacheStats();}
function DIAG_GEB_CLEAR_CACHE(w,c){return _GEB.diag.clearCache(w,c);}
