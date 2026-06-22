/**
 * OPBNB.gs - opBNB (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _OPBNB = ChainFactory.createEvmChain("OPBNB", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://opbnb-mainnet-rpc.bnbchain.org", "https://opbnb.drpc.org", "https://opbnb-rpc.publicnode.com", "https://1rpc.io/opbnb"] }, // PublicNode, 1RPC
 CHAIN: {
 NAME: "opBNB",
 CHAIN_ID: 204,
 NATIVE_SYMBOL: "BNB",
 NATIVE_NAME: "BNB",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:binancecoin",
 NATIVE_GECKO_ID: "binancecoin",
 DEX_SLUG: "opbnb",
 GT_NETWORK: "opbnb"
 },
 LLAMA_ID_MAP: { "BNB":"coingecko:binancecoin" }
});

// Main functions
function GET_WALLET_ASSETS_OPBNB(a,r,t,f,g){return _OPBNB.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_OPBNB(a){return _OPBNB.getCachedWalletAssets(a);}
function OPBNB_REFRESH_STATUS(a,r,t,f,g){return _OPBNB.getRefreshStatus(a,r,t,f,g);}
function OPBNB_STATS(a,t){return _OPBNB.getStats(a,t);}

// Diagnostic functions
function DIAG_OPBNB_TOKEN(w,t,r){return _OPBNB.diag.tokenBalance(w,t,r);}
function DIAG_OPBNB_COMPARE_RPCS(w,t){return _OPBNB.diag.compareRpcs(w,t);}
function DIAG_OPBNB_CHECK_ERC20(t){return _OPBNB.diag.checkErc20(t);}
function DIAG_OPBNB_RPC_HEALTH(){return _OPBNB.diag.rpcHealth();}
function DIAG_OPBNB_NATIVE_BALANCE(w){return _OPBNB.diag.nativeBalance(w);}
function DIAG_OPBNB_CACHE(w){return _OPBNB.diag.cacheInspect(w);}
function DIAG_OPBNB_CACHE_TOKEN(w,t){return _OPBNB.diag.cacheFindToken(w,t);}
function DIAG_OPBNB_CACHE_ASSETS(w){return _OPBNB.diag.cacheListAssets(w);}
function DIAG_OPBNB_TOKEN_PRICE(t){return _OPBNB.diag.tokenPrice(t);}
function DIAG_OPBNB_NATIVE_PRICE(){return _OPBNB.diag.nativePrice();}
function DIAG_OPBNB_WALLET(w){return _OPBNB.diag.walletFull(w);}
function DIAG_OPBNB_CACHE_STATS(){return _OPBNB.diag.cacheStats();}
function DIAG_OPBNB_CLEAR_CACHE(w,c){return _OPBNB.diag.clearCache(w,c);}
