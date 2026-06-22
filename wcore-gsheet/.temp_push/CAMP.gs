/**
 * CAMP.gs - Camp (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _CAMP = ChainFactory.createEvmChain("CAMP", {
 CACHE_VERSION: 63,
  RPC: { ENDPOINTS: [], BLOCKSCOUT_RPC: "https://camp.cloud.blockscout.com/api/eth-rpc" }, // pas de RPC public; Blockscout en fallback (v4.15.50)
 CHAIN: {
 NAME: "Camp",
 CHAIN_ID: 484,
 NATIVE_SYMBOL: "CAMP",
 NATIVE_NAME: "Camp",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:camp-network",
 NATIVE_GECKO_ID: "camp-network",
 DEX_SLUG: "camp",
 GT_NETWORK: "camp-network"
 },
 LLAMA_ID_MAP: { "CAMP":"coingecko:camp-network" }
});

// Main functions
function GET_WALLET_ASSETS_CAMP(a,r,t,f,g){return _CAMP.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_CAMP(a){return _CAMP.getCachedWalletAssets(a);}
function CAMP_REFRESH_STATUS(a,r,t,f,g){return _CAMP.getRefreshStatus(a,r,t,f,g);}
function CAMP_STATS(a,t){return _CAMP.getStats(a,t);}

// Diagnostic functions
function DIAG_CAMP_TOKEN(w,t,r){return _CAMP.diag.tokenBalance(w,t,r);}
function DIAG_CAMP_COMPARE_RPCS(w,t){return _CAMP.diag.compareRpcs(w,t);}
function DIAG_CAMP_CHECK_ERC20(t){return _CAMP.diag.checkErc20(t);}
function DIAG_CAMP_RPC_HEALTH(){return _CAMP.diag.rpcHealth();}
function DIAG_CAMP_NATIVE_BALANCE(w){return _CAMP.diag.nativeBalance(w);}
function DIAG_CAMP_CACHE(w){return _CAMP.diag.cacheInspect(w);}
function DIAG_CAMP_CACHE_TOKEN(w,t){return _CAMP.diag.cacheFindToken(w,t);}
function DIAG_CAMP_CACHE_ASSETS(w){return _CAMP.diag.cacheListAssets(w);}
function DIAG_CAMP_TOKEN_PRICE(t){return _CAMP.diag.tokenPrice(t);}
function DIAG_CAMP_NATIVE_PRICE(){return _CAMP.diag.nativePrice();}
function DIAG_CAMP_WALLET(w){return _CAMP.diag.walletFull(w);}
function DIAG_CAMP_CACHE_STATS(){return _CAMP.diag.cacheStats();}
function DIAG_CAMP_CLEAR_CACHE(w,c){return _CAMP.diag.clearCache(w,c);}
