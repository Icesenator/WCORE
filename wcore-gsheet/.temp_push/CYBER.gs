/**
 * CYBER.gs - Cyber (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _CYBER = ChainFactory.createEvmChain("CYBER", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://cyber.alt.technology", "https://rpc.cyber.co"] },
 CHAIN: {
 NAME: "Cyber",
 CHAIN_ID: 7560,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "cyber",
 GT_NETWORK: "cyber"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum" }
});

// Main functions
function GET_WALLET_ASSETS_CYBER(a,r,t,f,g){return _CYBER.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_CYBER(a){return _CYBER.getCachedWalletAssets(a);}
function CYBER_REFRESH_STATUS(a,r,t,f,g){return _CYBER.getRefreshStatus(a,r,t,f,g);}
function CYBER_STATS(a,t){return _CYBER.getStats(a,t);}

// Diagnostic functions
function DIAG_CYBER_TOKEN(w,t,r){return _CYBER.diag.tokenBalance(w,t,r);}
function DIAG_CYBER_COMPARE_RPCS(w,t){return _CYBER.diag.compareRpcs(w,t);}
function DIAG_CYBER_CHECK_ERC20(t){return _CYBER.diag.checkErc20(t);}
function DIAG_CYBER_RPC_HEALTH(){return _CYBER.diag.rpcHealth();}
function DIAG_CYBER_NATIVE_BALANCE(w){return _CYBER.diag.nativeBalance(w);}
function DIAG_CYBER_CACHE(w){return _CYBER.diag.cacheInspect(w);}
function DIAG_CYBER_CACHE_TOKEN(w,t){return _CYBER.diag.cacheFindToken(w,t);}
function DIAG_CYBER_CACHE_ASSETS(w){return _CYBER.diag.cacheListAssets(w);}
function DIAG_CYBER_TOKEN_PRICE(t){return _CYBER.diag.tokenPrice(t);}
function DIAG_CYBER_NATIVE_PRICE(){return _CYBER.diag.nativePrice();}
function DIAG_CYBER_WALLET(w){return _CYBER.diag.walletFull(w);}
function DIAG_CYBER_CACHE_STATS(){return _CYBER.diag.cacheStats();}
function DIAG_CYBER_CLEAR_CACHE(w,c){return _CYBER.diag.clearCache(w,c);}
