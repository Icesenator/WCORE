/**
 * SWAN.gs - Swan (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _SWAN = ChainFactory.createEvmChain("SWAN", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://mainnet-rpc.swanchain.org", "https://mainnet-rpc-01.swanchain.org", "https://mainnet-rpc-02.swanchain.org"] }, // official
 CHAIN: {
 NAME: "Swan",
 CHAIN_ID: 254,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "swan",
 GT_NETWORK: "swanchain"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum" }
});

// Main functions
function GET_WALLET_ASSETS_SWAN(a,r,t,f,g){return _SWAN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_SWAN(a){return _SWAN.getCachedWalletAssets(a);}
function SWAN_REFRESH_STATUS(a,r,t,f,g){return _SWAN.getRefreshStatus(a,r,t,f,g);}
function SWAN_STATS(a,t){return _SWAN.getStats(a,t);}

// Diagnostic functions
function DIAG_SWAN_TOKEN(w,t,r){return _SWAN.diag.tokenBalance(w,t,r);}
function DIAG_SWAN_COMPARE_RPCS(w,t){return _SWAN.diag.compareRpcs(w,t);}
function DIAG_SWAN_CHECK_ERC20(t){return _SWAN.diag.checkErc20(t);}
function DIAG_SWAN_RPC_HEALTH(){return _SWAN.diag.rpcHealth();}
function DIAG_SWAN_NATIVE_BALANCE(w){return _SWAN.diag.nativeBalance(w);}
function DIAG_SWAN_CACHE(w){return _SWAN.diag.cacheInspect(w);}
function DIAG_SWAN_CACHE_TOKEN(w,t){return _SWAN.diag.cacheFindToken(w,t);}
function DIAG_SWAN_CACHE_ASSETS(w){return _SWAN.diag.cacheListAssets(w);}
function DIAG_SWAN_TOKEN_PRICE(t){return _SWAN.diag.tokenPrice(t);}
function DIAG_SWAN_NATIVE_PRICE(){return _SWAN.diag.nativePrice();}
function DIAG_SWAN_WALLET(w){return _SWAN.diag.walletFull(w);}
function DIAG_SWAN_CACHE_STATS(){return _SWAN.diag.cacheStats();}
function DIAG_SWAN_CLEAR_CACHE(w,c){return _SWAN.diag.clearCache(w,c);}
