/**
 * ZIRCUIT.gs - Zircuit (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _ZIRCUIT = ChainFactory.createEvmChain("ZIRCUIT", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://zircuit1-mainnet.p2pify.com", "https://zircuit.drpc.org", "https://mainnet.zircuit.com"] }, // official
 CHAIN: {
 NAME: "Zircuit",
 CHAIN_ID: 48900,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "zircuit",
 GT_NETWORK: "zircuit"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum", "ZRC":"coingecko:zircuit" }
});

// Main functions
function GET_WALLET_ASSETS_ZIRCUIT(a,r,t,f,g){return _ZIRCUIT.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ZIRCUIT(a){return _ZIRCUIT.getCachedWalletAssets(a);}
function ZIRCUIT_REFRESH_STATUS(a,r,t,f,g){return _ZIRCUIT.getRefreshStatus(a,r,t,f,g);}
function ZIRCUIT_STATS(a,t){return _ZIRCUIT.getStats(a,t);}

// Diagnostic functions
function DIAG_ZIRCUIT_TOKEN(w,t,r){return _ZIRCUIT.diag.tokenBalance(w,t,r);}
function DIAG_ZIRCUIT_COMPARE_RPCS(w,t){return _ZIRCUIT.diag.compareRpcs(w,t);}
function DIAG_ZIRCUIT_CHECK_ERC20(t){return _ZIRCUIT.diag.checkErc20(t);}
function DIAG_ZIRCUIT_RPC_HEALTH(){return _ZIRCUIT.diag.rpcHealth();}
function DIAG_ZIRCUIT_NATIVE_BALANCE(w){return _ZIRCUIT.diag.nativeBalance(w);}
function DIAG_ZIRCUIT_CACHE(w){return _ZIRCUIT.diag.cacheInspect(w);}
function DIAG_ZIRCUIT_CACHE_TOKEN(w,t){return _ZIRCUIT.diag.cacheFindToken(w,t);}
function DIAG_ZIRCUIT_CACHE_ASSETS(w){return _ZIRCUIT.diag.cacheListAssets(w);}
function DIAG_ZIRCUIT_TOKEN_PRICE(t){return _ZIRCUIT.diag.tokenPrice(t);}
function DIAG_ZIRCUIT_NATIVE_PRICE(){return _ZIRCUIT.diag.nativePrice();}
function DIAG_ZIRCUIT_WALLET(w){return _ZIRCUIT.diag.walletFull(w);}
function DIAG_ZIRCUIT_CACHE_STATS(){return _ZIRCUIT.diag.cacheStats();}
function DIAG_ZIRCUIT_CLEAR_CACHE(w,c){return _ZIRCUIT.diag.clearCache(w,c);}
