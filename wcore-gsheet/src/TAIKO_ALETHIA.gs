/**
 * TAIKO_ALETHIA.gs - Taiko Alethia (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _TAIKO_ALETHIA = ChainFactory.createEvmChain("TAIKO_ALETHIA", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.mainnet.taiko.xyz", "https://taiko.drpc.org"] },
 CHAIN: {
 NAME: "Taiko Alethia",
 CHAIN_ID: 167000,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "taiko",
 GT_NETWORK: "taiko"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum", "TAIKO":"coingecko:taiko" }
});

// Main functions
function GET_WALLET_ASSETS_TAIKO_ALETHIA(a,r,t,f,g){return _TAIKO_ALETHIA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_TAIKO_ALETHIA(a){return _TAIKO_ALETHIA.getCachedWalletAssets(a);}
function TAIKO_ALETHIA_REFRESH_STATUS(a,r,t,f,g){return _TAIKO_ALETHIA.getRefreshStatus(a,r,t,f,g);}
function TAIKO_ALETHIA_STATS(a,t){return _TAIKO_ALETHIA.getStats(a,t);}

// Diagnostic functions
function DIAG_TAIKO_ALETHIA_TOKEN(w,t,r){return _TAIKO_ALETHIA.diag.tokenBalance(w,t,r);}
function DIAG_TAIKO_ALETHIA_COMPARE_RPCS(w,t){return _TAIKO_ALETHIA.diag.compareRpcs(w,t);}
function DIAG_TAIKO_ALETHIA_CHECK_ERC20(t){return _TAIKO_ALETHIA.diag.checkErc20(t);}
function DIAG_TAIKO_ALETHIA_RPC_HEALTH(){return _TAIKO_ALETHIA.diag.rpcHealth();}
function DIAG_TAIKO_ALETHIA_NATIVE_BALANCE(w){return _TAIKO_ALETHIA.diag.nativeBalance(w);}
function DIAG_TAIKO_ALETHIA_CACHE(w){return _TAIKO_ALETHIA.diag.cacheInspect(w);}
function DIAG_TAIKO_ALETHIA_CACHE_TOKEN(w,t){return _TAIKO_ALETHIA.diag.cacheFindToken(w,t);}
function DIAG_TAIKO_ALETHIA_CACHE_ASSETS(w){return _TAIKO_ALETHIA.diag.cacheListAssets(w);}
function DIAG_TAIKO_ALETHIA_TOKEN_PRICE(t){return _TAIKO_ALETHIA.diag.tokenPrice(t);}
function DIAG_TAIKO_ALETHIA_NATIVE_PRICE(){return _TAIKO_ALETHIA.diag.nativePrice();}
function DIAG_TAIKO_ALETHIA_WALLET(w){return _TAIKO_ALETHIA.diag.walletFull(w);}
function DIAG_TAIKO_ALETHIA_CACHE_STATS(){return _TAIKO_ALETHIA.diag.cacheStats();}
function DIAG_TAIKO_ALETHIA_CLEAR_CACHE(w,c){return _TAIKO_ALETHIA.diag.clearCache(w,c);}
