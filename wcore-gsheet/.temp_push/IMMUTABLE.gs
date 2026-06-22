/**
 * IMMUTABLE.gs - Immutable zkEVM (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _IMMUTABLE = ChainFactory.createEvmChain("IMMUTABLE", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.immutable.com", "https://immutable-zkevm.drpc.org", "https://immutable.gateway.tenderly.co"] }, // Tenderly
 CHAIN: {
 NAME: "Immutable zkEVM",
 CHAIN_ID: 13371,
 NATIVE_SYMBOL: "IMX",
 NATIVE_NAME: "Immutable X",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:immutable-x",
 NATIVE_GECKO_ID: "immutable-x",
 DEX_SLUG: "immutable",
 GT_NETWORK: "immutable-zkevm"
 },
 LLAMA_ID_MAP: { "IMX":"coingecko:immutable-x" }
});

// Main functions
function GET_WALLET_ASSETS_IMMUTABLE(a,r,t,f,g){return _IMMUTABLE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_IMMUTABLE(a){return _IMMUTABLE.getCachedWalletAssets(a);}
function IMMUTABLE_REFRESH_STATUS(a,r,t,f,g){return _IMMUTABLE.getRefreshStatus(a,r,t,f,g);}
function IMMUTABLE_STATS(a,t){return _IMMUTABLE.getStats(a,t);}

// Diagnostic functions
function DIAG_IMMUTABLE_TOKEN(w,t,r){return _IMMUTABLE.diag.tokenBalance(w,t,r);}
function DIAG_IMMUTABLE_COMPARE_RPCS(w,t){return _IMMUTABLE.diag.compareRpcs(w,t);}
function DIAG_IMMUTABLE_CHECK_ERC20(t){return _IMMUTABLE.diag.checkErc20(t);}
function DIAG_IMMUTABLE_RPC_HEALTH(){return _IMMUTABLE.diag.rpcHealth();}
function DIAG_IMMUTABLE_NATIVE_BALANCE(w){return _IMMUTABLE.diag.nativeBalance(w);}
function DIAG_IMMUTABLE_CACHE(w){return _IMMUTABLE.diag.cacheInspect(w);}
function DIAG_IMMUTABLE_CACHE_TOKEN(w,t){return _IMMUTABLE.diag.cacheFindToken(w,t);}
function DIAG_IMMUTABLE_CACHE_ASSETS(w){return _IMMUTABLE.diag.cacheListAssets(w);}
function DIAG_IMMUTABLE_TOKEN_PRICE(t){return _IMMUTABLE.diag.tokenPrice(t);}
function DIAG_IMMUTABLE_NATIVE_PRICE(){return _IMMUTABLE.diag.nativePrice();}
function DIAG_IMMUTABLE_WALLET(w){return _IMMUTABLE.diag.walletFull(w);}
function DIAG_IMMUTABLE_CACHE_STATS(){return _IMMUTABLE.diag.cacheStats();}
function DIAG_IMMUTABLE_CLEAR_CACHE(w,c){return _IMMUTABLE.diag.clearCache(w,c);}
