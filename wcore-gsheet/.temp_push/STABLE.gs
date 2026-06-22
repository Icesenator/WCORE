/**
 * STABLE.gs - Stable (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _STABLE = ChainFactory.createEvmChain("STABLE", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.stable.xyz"] },
 CHAIN: {
 NAME: "Stable",
 CHAIN_ID: 988,
 NATIVE_SYMBOL: "gUSDT",
 NATIVE_NAME: "gUSDT",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:tether",
 NATIVE_GECKO_ID: "tether",
 DEX_SLUG: "stable",
 GT_NETWORK: "stable"
 },
 LLAMA_ID_MAP: { "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "gUSDT":"coingecko:tether" }
});

// Main functions
function GET_WALLET_ASSETS_STABLE(a,r,t,f,g){return _STABLE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_STABLE(a){return _STABLE.getCachedWalletAssets(a);}
function STABLE_REFRESH_STATUS(a,r,t,f,g){return _STABLE.getRefreshStatus(a,r,t,f,g);}
function STABLE_STATS(a,t){return _STABLE.getStats(a,t);}

// Diagnostic functions
function DIAG_STABLE_TOKEN(w,t,r){return _STABLE.diag.tokenBalance(w,t,r);}
function DIAG_STABLE_COMPARE_RPCS(w,t){return _STABLE.diag.compareRpcs(w,t);}
function DIAG_STABLE_CHECK_ERC20(t){return _STABLE.diag.checkErc20(t);}
function DIAG_STABLE_RPC_HEALTH(){return _STABLE.diag.rpcHealth();}
function DIAG_STABLE_NATIVE_BALANCE(w){return _STABLE.diag.nativeBalance(w);}
function DIAG_STABLE_CACHE(w){return _STABLE.diag.cacheInspect(w);}
function DIAG_STABLE_CACHE_TOKEN(w,t){return _STABLE.diag.cacheFindToken(w,t);}
function DIAG_STABLE_CACHE_ASSETS(w){return _STABLE.diag.cacheListAssets(w);}
function DIAG_STABLE_TOKEN_PRICE(t){return _STABLE.diag.tokenPrice(t);}
function DIAG_STABLE_NATIVE_PRICE(){return _STABLE.diag.nativePrice();}
function DIAG_STABLE_WALLET(w){return _STABLE.diag.walletFull(w);}
function DIAG_STABLE_CACHE_STATS(){return _STABLE.diag.cacheStats();}
function DIAG_STABLE_CLEAR_CACHE(w,c){return _STABLE.diag.clearCache(w,c);}
