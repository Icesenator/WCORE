/**
 * INK.gs - Ink (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _INK = ChainFactory.createEvmChain("INK", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc-gel.inkonchain.com", "https://ink.drpc.org", "https://rpc-qnd.inkonchain.com"] }, // official
 CHAIN: {
 NAME: "Ink",
 CHAIN_ID: 57073,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "ink",
 GT_NETWORK: "ink"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum" }
});

// Main functions
function GET_WALLET_ASSETS_INK(a,r,t,f,g){return _INK.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_INK(a){return _INK.getCachedWalletAssets(a);}
function INK_REFRESH_STATUS(a,r,t,f,g){return _INK.getRefreshStatus(a,r,t,f,g);}
function INK_STATS(a,t){return _INK.getStats(a,t);}

// Diagnostic functions
function DIAG_INK_TOKEN(w,t,r){return _INK.diag.tokenBalance(w,t,r);}
function DIAG_INK_COMPARE_RPCS(w,t){return _INK.diag.compareRpcs(w,t);}
function DIAG_INK_CHECK_ERC20(t){return _INK.diag.checkErc20(t);}
function DIAG_INK_RPC_HEALTH(){return _INK.diag.rpcHealth();}
function DIAG_INK_NATIVE_BALANCE(w){return _INK.diag.nativeBalance(w);}
function DIAG_INK_CACHE(w){return _INK.diag.cacheInspect(w);}
function DIAG_INK_CACHE_TOKEN(w,t){return _INK.diag.cacheFindToken(w,t);}
function DIAG_INK_CACHE_ASSETS(w){return _INK.diag.cacheListAssets(w);}
function DIAG_INK_TOKEN_PRICE(t){return _INK.diag.tokenPrice(t);}
function DIAG_INK_NATIVE_PRICE(){return _INK.diag.nativePrice();}
function DIAG_INK_WALLET(w){return _INK.diag.walletFull(w);}
function DIAG_INK_CACHE_STATS(){return _INK.diag.cacheStats();}
function DIAG_INK_CLEAR_CACHE(w,c){return _INK.diag.clearCache(w,c);}
