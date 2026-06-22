/**
 * OPENLEDGER.gs - OpenLedger (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _OPENLEDGER = ChainFactory.createEvmChain("OPENLEDGER", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.openledger.xyz"] },
 CHAIN: {
 NAME: "OpenLedger",
 CHAIN_ID: 1612,
 NATIVE_SYMBOL: "OPEN",
 NATIVE_NAME: "OpenLedger",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:openledger-2",
 NATIVE_GECKO_ID: "openledger-2",
 DEX_SLUG: "openledger",
 GT_NETWORK: "openledger"
 },
 LLAMA_ID_MAP: { "OPEN":"coingecko:openledger-2" }
});

// Main functions
function GET_WALLET_ASSETS_OPENLEDGER(a,r,t,f,g){return _OPENLEDGER.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_OPENLEDGER(a){return _OPENLEDGER.getCachedWalletAssets(a);}
function OPENLEDGER_REFRESH_STATUS(a,r,t,f,g){return _OPENLEDGER.getRefreshStatus(a,r,t,f,g);}
function OPENLEDGER_STATS(a,t){return _OPENLEDGER.getStats(a,t);}

// Diagnostic functions
function DIAG_OPENLEDGER_TOKEN(w,t,r){return _OPENLEDGER.diag.tokenBalance(w,t,r);}
function DIAG_OPENLEDGER_COMPARE_RPCS(w,t){return _OPENLEDGER.diag.compareRpcs(w,t);}
function DIAG_OPENLEDGER_CHECK_ERC20(t){return _OPENLEDGER.diag.checkErc20(t);}
function DIAG_OPENLEDGER_RPC_HEALTH(){return _OPENLEDGER.diag.rpcHealth();}
function DIAG_OPENLEDGER_NATIVE_BALANCE(w){return _OPENLEDGER.diag.nativeBalance(w);}
function DIAG_OPENLEDGER_CACHE(w){return _OPENLEDGER.diag.cacheInspect(w);}
function DIAG_OPENLEDGER_CACHE_TOKEN(w,t){return _OPENLEDGER.diag.cacheFindToken(w,t);}
function DIAG_OPENLEDGER_CACHE_ASSETS(w){return _OPENLEDGER.diag.cacheListAssets(w);}
function DIAG_OPENLEDGER_TOKEN_PRICE(t){return _OPENLEDGER.diag.tokenPrice(t);}
function DIAG_OPENLEDGER_NATIVE_PRICE(){return _OPENLEDGER.diag.nativePrice();}
function DIAG_OPENLEDGER_WALLET(w){return _OPENLEDGER.diag.walletFull(w);}
function DIAG_OPENLEDGER_CACHE_STATS(){return _OPENLEDGER.diag.cacheStats();}
function DIAG_OPENLEDGER_CLEAR_CACHE(w,c){return _OPENLEDGER.diag.clearCache(w,c);}
