/**
 * PLASMA.gs - Plasma (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _PLASMA = ChainFactory.createEvmChain("PLASMA", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.plasma.to", "https://plasma.drpc.org", "https://9745.rpc.thirdweb.com", "https://plasma.gateway.tenderly.co", "https://plasma-mainnet.gateway.tatum.io"] },
 CHAIN: {
 NAME: "Plasma",
 CHAIN_ID: 9745,
 NATIVE_SYMBOL: "XPL",
 NATIVE_NAME: "Plasma",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:plasma",
 NATIVE_GECKO_ID: "plasma",
 DEX_SLUG: "plasma",
 GT_NETWORK: "plasma"
 },
 LLAMA_ID_MAP: { "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WXPL":"coingecko:plasma", "XPL":"coingecko:plasma" }
});

// Main functions
function GET_WALLET_ASSETS_PLASMA(a,r,t,f,g){return _PLASMA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_PLASMA(a){return _PLASMA.getCachedWalletAssets(a);}
function PLASMA_REFRESH_STATUS(a,r,t,f,g){return _PLASMA.getRefreshStatus(a,r,t,f,g);}
function PLASMA_STATS(a,t){return _PLASMA.getStats(a,t);}

// Diagnostic functions
function DIAG_PLASMA_TOKEN(w,t,r){return _PLASMA.diag.tokenBalance(w,t,r);}
function DIAG_PLASMA_COMPARE_RPCS(w,t){return _PLASMA.diag.compareRpcs(w,t);}
function DIAG_PLASMA_CHECK_ERC20(t){return _PLASMA.diag.checkErc20(t);}
function DIAG_PLASMA_RPC_HEALTH(){return _PLASMA.diag.rpcHealth();}
function DIAG_PLASMA_NATIVE_BALANCE(w){return _PLASMA.diag.nativeBalance(w);}
function DIAG_PLASMA_CACHE(w){return _PLASMA.diag.cacheInspect(w);}
function DIAG_PLASMA_CACHE_TOKEN(w,t){return _PLASMA.diag.cacheFindToken(w,t);}
function DIAG_PLASMA_CACHE_ASSETS(w){return _PLASMA.diag.cacheListAssets(w);}
function DIAG_PLASMA_TOKEN_PRICE(t){return _PLASMA.diag.tokenPrice(t);}
function DIAG_PLASMA_NATIVE_PRICE(){return _PLASMA.diag.nativePrice();}
function DIAG_PLASMA_WALLET(w){return _PLASMA.diag.walletFull(w);}
function DIAG_PLASMA_CACHE_STATS(){return _PLASMA.diag.cacheStats();}
function DIAG_PLASMA_CLEAR_CACHE(w,c){return _PLASMA.diag.clearCache(w,c);}
