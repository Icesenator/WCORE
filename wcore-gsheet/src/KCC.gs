/**
 * KCC.gs - KCC (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _KCC = ChainFactory.createEvmChain("KCC", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc-mainnet.kcc.network", "https://kcc.drpc.org", "https://kcc-rpc.com"] }, // official
 CHAIN: {
 NAME: "KCC",
 CHAIN_ID: 321,
 NATIVE_SYMBOL: "KCS",
 NATIVE_NAME: "KuCoin Token",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:kucoin-shares",
 NATIVE_GECKO_ID: "kucoin-shares",
 DEX_SLUG: "kcc",
 GT_NETWORK: "kcc"
 },
 LLAMA_ID_MAP: { "KCS":"coingecko:kucoin-shares" }
});

// Main functions
function GET_WALLET_ASSETS_KCC(a,r,t,f,g){return _KCC.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_KCC(a){return _KCC.getCachedWalletAssets(a);}
function KCC_REFRESH_STATUS(a,r,t,f,g){return _KCC.getRefreshStatus(a,r,t,f,g);}
function KCC_STATS(a,t){return _KCC.getStats(a,t);}

// Diagnostic functions
function DIAG_KCC_TOKEN(w,t,r){return _KCC.diag.tokenBalance(w,t,r);}
function DIAG_KCC_COMPARE_RPCS(w,t){return _KCC.diag.compareRpcs(w,t);}
function DIAG_KCC_CHECK_ERC20(t){return _KCC.diag.checkErc20(t);}
function DIAG_KCC_RPC_HEALTH(){return _KCC.diag.rpcHealth();}
function DIAG_KCC_NATIVE_BALANCE(w){return _KCC.diag.nativeBalance(w);}
function DIAG_KCC_CACHE(w){return _KCC.diag.cacheInspect(w);}
function DIAG_KCC_CACHE_TOKEN(w,t){return _KCC.diag.cacheFindToken(w,t);}
function DIAG_KCC_CACHE_ASSETS(w){return _KCC.diag.cacheListAssets(w);}
function DIAG_KCC_TOKEN_PRICE(t){return _KCC.diag.tokenPrice(t);}
function DIAG_KCC_NATIVE_PRICE(){return _KCC.diag.nativePrice();}
function DIAG_KCC_WALLET(w){return _KCC.diag.walletFull(w);}
function DIAG_KCC_CACHE_STATS(){return _KCC.diag.cacheStats();}
function DIAG_KCC_CLEAR_CACHE(w,c){return _KCC.diag.clearCache(w,c);}
