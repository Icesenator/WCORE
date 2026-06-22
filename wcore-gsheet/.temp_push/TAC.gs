/**
 * TAC.gs - TAC (v4.15.2)
 * ChainFactory pattern with explicit function declarations
 * v4.15.2 FIX: CHAIN_ID 2390 was Turin testnet, mainnet is 239
 */

var _TAC = ChainFactory.createEvmChain("TAC", {
 CACHE_VERSION: 64,
 RPC: { ENDPOINTS: ["https://rpc.tac.build"] },
 CHAIN: {
 NAME: "TAC",
 CHAIN_ID: 239,
 NATIVE_SYMBOL: "TAC",
 NATIVE_NAME: "TAC",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:tac",
 NATIVE_GECKO_ID: "tac",
 DEX_SLUG: "tac",
 GT_NETWORK: "tac"
 },
 LLAMA_ID_MAP: { "TAC":"coingecko:tac" }
});

// Main functions
function GET_WALLET_ASSETS_TAC(a,r,t,f,g){return _TAC.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_TAC(a){return _TAC.getCachedWalletAssets(a);}
function TAC_REFRESH_STATUS(a,r,t,f,g){return _TAC.getRefreshStatus(a,r,t,f,g);}
function TAC_STATS(a,t){return _TAC.getStats(a,t);}

// Diagnostic functions
function DIAG_TAC_TOKEN(w,t,r){return _TAC.diag.tokenBalance(w,t,r);}
function DIAG_TAC_COMPARE_RPCS(w,t){return _TAC.diag.compareRpcs(w,t);}
function DIAG_TAC_CHECK_ERC20(t){return _TAC.diag.checkErc20(t);}
function DIAG_TAC_RPC_HEALTH(){return _TAC.diag.rpcHealth();}
function DIAG_TAC_NATIVE_BALANCE(w){return _TAC.diag.nativeBalance(w);}
function DIAG_TAC_CACHE(w){return _TAC.diag.cacheInspect(w);}
function DIAG_TAC_CACHE_TOKEN(w,t){return _TAC.diag.cacheFindToken(w,t);}
function DIAG_TAC_CACHE_ASSETS(w){return _TAC.diag.cacheListAssets(w);}
function DIAG_TAC_TOKEN_PRICE(t){return _TAC.diag.tokenPrice(t);}
function DIAG_TAC_NATIVE_PRICE(){return _TAC.diag.nativePrice();}
function DIAG_TAC_WALLET(w){return _TAC.diag.walletFull(w);}
function DIAG_TAC_CACHE_STATS(){return _TAC.diag.cacheStats();}
function DIAG_TAC_CLEAR_CACHE(w,c){return _TAC.diag.clearCache(w,c);}
