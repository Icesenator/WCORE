/**
 * ZKLINKNOVA.gs - zkLink Nova (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _ZKLINKNOVA = ChainFactory.createEvmChain("ZKLINKNOVA", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://810180.rpc.thirdweb.com", "https://zklink-nova.api.pocket.network/", "https://rpc.zklink.io"] }, // official
 CHAIN: {
 NAME: "zkLink Nova",
 CHAIN_ID: 810180,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ethereum",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "zklink-nova",
 GT_NETWORK: "zklink-nova"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum" }
});

// Main functions
function GET_WALLET_ASSETS_ZKLINKNOVA(a,r,t,f,g){return _ZKLINKNOVA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ZKLINKNOVA(a){return _ZKLINKNOVA.getCachedWalletAssets(a);}
function ZKLINKNOVA_REFRESH_STATUS(a,r,t,f,g){return _ZKLINKNOVA.getRefreshStatus(a,r,t,f,g);}
function ZKLINKNOVA_STATS(a,t){return _ZKLINKNOVA.getStats(a,t);}

// Diagnostic functions
function DIAG_ZKLINKNOVA_TOKEN(w,t,r){return _ZKLINKNOVA.diag.tokenBalance(w,t,r);}
function DIAG_ZKLINKNOVA_COMPARE_RPCS(w,t){return _ZKLINKNOVA.diag.compareRpcs(w,t);}
function DIAG_ZKLINKNOVA_CHECK_ERC20(t){return _ZKLINKNOVA.diag.checkErc20(t);}
function DIAG_ZKLINKNOVA_RPC_HEALTH(){return _ZKLINKNOVA.diag.rpcHealth();}
function DIAG_ZKLINKNOVA_NATIVE_BALANCE(w){return _ZKLINKNOVA.diag.nativeBalance(w);}
function DIAG_ZKLINKNOVA_CACHE(w){return _ZKLINKNOVA.diag.cacheInspect(w);}
function DIAG_ZKLINKNOVA_CACHE_TOKEN(w,t){return _ZKLINKNOVA.diag.cacheFindToken(w,t);}
function DIAG_ZKLINKNOVA_CACHE_ASSETS(w){return _ZKLINKNOVA.diag.cacheListAssets(w);}
function DIAG_ZKLINKNOVA_TOKEN_PRICE(t){return _ZKLINKNOVA.diag.tokenPrice(t);}
function DIAG_ZKLINKNOVA_NATIVE_PRICE(){return _ZKLINKNOVA.diag.nativePrice();}
function DIAG_ZKLINKNOVA_WALLET(w){return _ZKLINKNOVA.diag.walletFull(w);}
function DIAG_ZKLINKNOVA_CACHE_STATS(){return _ZKLINKNOVA.diag.cacheStats();}
function DIAG_ZKLINKNOVA_CLEAR_CACHE(w,c){return _ZKLINKNOVA.diag.clearCache(w,c);}
