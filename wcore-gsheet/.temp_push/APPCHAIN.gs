/**
 * APPCHAIN.gs - AppChain (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _APPCHAIN = ChainFactory.createEvmChain("APPCHAIN", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.appchain.xyz", "https://466.rpc.thirdweb.com"] }, // thirdweb
 CHAIN: {
 NAME: "AppChain",
 CHAIN_ID: 466,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "appchain",
 GT_NETWORK: "appchain"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum" }
});

// Main functions
function GET_WALLET_ASSETS_APPCHAIN(a,r,t,f,g){return _APPCHAIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_APPCHAIN(a){return _APPCHAIN.getCachedWalletAssets(a);}
function APPCHAIN_REFRESH_STATUS(a,r,t,f,g){return _APPCHAIN.getRefreshStatus(a,r,t,f,g);}
function APPCHAIN_STATS(a,t){return _APPCHAIN.getStats(a,t);}

// Diagnostic functions
function DIAG_APPCHAIN_TOKEN(w,t,r){return _APPCHAIN.diag.tokenBalance(w,t,r);}
function DIAG_APPCHAIN_COMPARE_RPCS(w,t){return _APPCHAIN.diag.compareRpcs(w,t);}
function DIAG_APPCHAIN_CHECK_ERC20(t){return _APPCHAIN.diag.checkErc20(t);}
function DIAG_APPCHAIN_RPC_HEALTH(){return _APPCHAIN.diag.rpcHealth();}
function DIAG_APPCHAIN_NATIVE_BALANCE(w){return _APPCHAIN.diag.nativeBalance(w);}
function DIAG_APPCHAIN_CACHE(w){return _APPCHAIN.diag.cacheInspect(w);}
function DIAG_APPCHAIN_CACHE_TOKEN(w,t){return _APPCHAIN.diag.cacheFindToken(w,t);}
function DIAG_APPCHAIN_CACHE_ASSETS(w){return _APPCHAIN.diag.cacheListAssets(w);}
function DIAG_APPCHAIN_TOKEN_PRICE(t){return _APPCHAIN.diag.tokenPrice(t);}
function DIAG_APPCHAIN_NATIVE_PRICE(){return _APPCHAIN.diag.nativePrice();}
function DIAG_APPCHAIN_WALLET(w){return _APPCHAIN.diag.walletFull(w);}
function DIAG_APPCHAIN_CACHE_STATS(){return _APPCHAIN.diag.cacheStats();}
function DIAG_APPCHAIN_CLEAR_CACHE(w,c){return _APPCHAIN.diag.clearCache(w,c);}
