/**
 * ROOTSTOCK.gs - Rootstock (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _ROOTSTOCK = ChainFactory.createEvmChain("ROOTSTOCK", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://public-node.rsk.co", "https://rsk.drpc.org", "https://rpc.ankr.com/rsk"] },
 CHAIN: {
 NAME: "Rootstock",
 CHAIN_ID: 30,
 NATIVE_SYMBOL: "RBTC",
 NATIVE_NAME: "Rootstock Bitcoin",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:bitcoin",
 NATIVE_GECKO_ID: "bitcoin",
 DEX_SLUG: "rootstock",
 GT_NETWORK: "rootstock"
 },
 LLAMA_ID_MAP: { "RBTC":"bitcoin" }
});

// Main functions
function GET_WALLET_ASSETS_ROOTSTOCK(a,r,t,f,g){return _ROOTSTOCK.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ROOTSTOCK(a){return _ROOTSTOCK.getCachedWalletAssets(a);}
function ROOTSTOCK_REFRESH_STATUS(a,r,t,f,g){return _ROOTSTOCK.getRefreshStatus(a,r,t,f,g);}
function ROOTSTOCK_STATS(a,t){return _ROOTSTOCK.getStats(a,t);}

// Diagnostic functions
function DIAG_ROOTSTOCK_TOKEN(w,t,r){return _ROOTSTOCK.diag.tokenBalance(w,t,r);}
function DIAG_ROOTSTOCK_COMPARE_RPCS(w,t){return _ROOTSTOCK.diag.compareRpcs(w,t);}
function DIAG_ROOTSTOCK_CHECK_ERC20(t){return _ROOTSTOCK.diag.checkErc20(t);}
function DIAG_ROOTSTOCK_RPC_HEALTH(){return _ROOTSTOCK.diag.rpcHealth();}
function DIAG_ROOTSTOCK_NATIVE_BALANCE(w){return _ROOTSTOCK.diag.nativeBalance(w);}
function DIAG_ROOTSTOCK_CACHE(w){return _ROOTSTOCK.diag.cacheInspect(w);}
function DIAG_ROOTSTOCK_CACHE_TOKEN(w,t){return _ROOTSTOCK.diag.cacheFindToken(w,t);}
function DIAG_ROOTSTOCK_CACHE_ASSETS(w){return _ROOTSTOCK.diag.cacheListAssets(w);}
function DIAG_ROOTSTOCK_TOKEN_PRICE(t){return _ROOTSTOCK.diag.tokenPrice(t);}
function DIAG_ROOTSTOCK_NATIVE_PRICE(){return _ROOTSTOCK.diag.nativePrice();}
function DIAG_ROOTSTOCK_WALLET(w){return _ROOTSTOCK.diag.walletFull(w);}
function DIAG_ROOTSTOCK_CACHE_STATS(){return _ROOTSTOCK.diag.cacheStats();}
function DIAG_ROOTSTOCK_CLEAR_CACHE(w,c){return _ROOTSTOCK.diag.clearCache(w,c);}
