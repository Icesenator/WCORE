/**
 * RARI.gs - RARI Chain (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _RARI = ChainFactory.createEvmChain("RARI", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://mainnet.rpc.rarichain.org/http", "https://rari.calderachain.xyz/http", "https://1380012617.rpc.thirdweb.com"] }, // Caldera, thirdweb
 CHAIN: {
 NAME: "RARI Chain",
 CHAIN_ID: 1380012617,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "rari",
 GT_NETWORK: "rari"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum" }
});

// Main functions
function GET_WALLET_ASSETS_RARI(a,r,t,f,g){return _RARI.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_RARI(a){return _RARI.getCachedWalletAssets(a);}
function RARI_REFRESH_STATUS(a,r,t,f,g){return _RARI.getRefreshStatus(a,r,t,f,g);}
function RARI_STATS(a,t){return _RARI.getStats(a,t);}

// Diagnostic functions
function DIAG_RARI_TOKEN(w,t,r){return _RARI.diag.tokenBalance(w,t,r);}
function DIAG_RARI_COMPARE_RPCS(w,t){return _RARI.diag.compareRpcs(w,t);}
function DIAG_RARI_CHECK_ERC20(t){return _RARI.diag.checkErc20(t);}
function DIAG_RARI_RPC_HEALTH(){return _RARI.diag.rpcHealth();}
function DIAG_RARI_NATIVE_BALANCE(w){return _RARI.diag.nativeBalance(w);}
function DIAG_RARI_CACHE(w){return _RARI.diag.cacheInspect(w);}
function DIAG_RARI_CACHE_TOKEN(w,t){return _RARI.diag.cacheFindToken(w,t);}
function DIAG_RARI_CACHE_ASSETS(w){return _RARI.diag.cacheListAssets(w);}
function DIAG_RARI_TOKEN_PRICE(t){return _RARI.diag.tokenPrice(t);}
function DIAG_RARI_NATIVE_PRICE(){return _RARI.diag.nativePrice();}
function DIAG_RARI_WALLET(w){return _RARI.diag.walletFull(w);}
function DIAG_RARI_CACHE_STATS(){return _RARI.diag.cacheStats();}
function DIAG_RARI_CLEAR_CACHE(w,c){return _RARI.diag.clearCache(w,c);}
