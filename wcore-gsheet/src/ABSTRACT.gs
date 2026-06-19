/**
 * ABSTRACT.gs - Abstract (v4.9.6)
 * ChainFactory pattern with explicit function declarations
 *
 * v4.9.6 - Added 3 RPC endpoints for redundancy and consensus (was single endpoint causing stale cache)
 * v4.9.5 - Initial ChainFactory implementation
 */

var _ABSTRACT = ChainFactory.createEvmChain("ABSTRACT", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: [
   "https://api.mainnet.abs.xyz",
   "https://abstract.drpc.org",
   "https://abstract.api.onfinality.io/public",
   "https://2741.rpc.thirdweb.com"
 ] },
 CHAIN: {
 NAME: "Abstract",
 CHAIN_ID: 2741,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 DEX_SLUG: "abstract",
 GT_NETWORK: "abstract"
 }
});

// Main functions
function GET_WALLET_ASSETS_ABSTRACT(a,r,t,f,g){return _ABSTRACT.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ABSTRACT(a){return _ABSTRACT.getCachedWalletAssets(a);}
function ABSTRACT_REFRESH_STATUS(a,r,t,f,g){return _ABSTRACT.getRefreshStatus(a,r,t,f,g);}
function ABSTRACT_STATS(a,t){return _ABSTRACT.getStats(a,t);}

// Diagnostic functions
function DIAG_ABSTRACT_TOKEN(w,t,r){return _ABSTRACT.diag.tokenBalance(w,t,r);}
function DIAG_ABSTRACT_COMPARE_RPCS(w,t){return _ABSTRACT.diag.compareRpcs(w,t);}
function DIAG_ABSTRACT_CHECK_ERC20(t){return _ABSTRACT.diag.checkErc20(t);}
function DIAG_ABSTRACT_RPC_HEALTH(){return _ABSTRACT.diag.rpcHealth();}
function DIAG_ABSTRACT_NATIVE_BALANCE(w){return _ABSTRACT.diag.nativeBalance(w);}
function DIAG_ABSTRACT_CACHE(w){return _ABSTRACT.diag.cacheInspect(w);}
function DIAG_ABSTRACT_CACHE_TOKEN(w,t){return _ABSTRACT.diag.cacheFindToken(w,t);}
function DIAG_ABSTRACT_CACHE_ASSETS(w){return _ABSTRACT.diag.cacheListAssets(w);}
function DIAG_ABSTRACT_TOKEN_PRICE(t){return _ABSTRACT.diag.tokenPrice(t);}
function DIAG_ABSTRACT_NATIVE_PRICE(){return _ABSTRACT.diag.nativePrice();}
function DIAG_ABSTRACT_WALLET(w){return _ABSTRACT.diag.walletFull(w);}
function DIAG_ABSTRACT_CACHE_STATS(){return _ABSTRACT.diag.cacheStats();}
function DIAG_ABSTRACT_CLEAR_CACHE(w,c){return _ABSTRACT.diag.clearCache(w,c);}
