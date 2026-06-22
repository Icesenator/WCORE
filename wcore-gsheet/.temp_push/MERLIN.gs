/**
 * MERLIN.gs - Merlin (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _MERLIN = ChainFactory.createEvmChain("MERLIN", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.merlinchain.io", "https://merlin.blockpi.network/v1/rpc/public", "https://merlin.drpc.org", "https://4200.rpc.thirdweb.com/"] },
 CHAIN: {
 NAME: "Merlin",
 CHAIN_ID: 4200,
 NATIVE_SYMBOL: "BTC",
 NATIVE_NAME: "Bitcoin",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:bitcoin",
 NATIVE_GECKO_ID: "bitcoin",
 DEX_SLUG: "merlinchain",
 GT_NETWORK: "merlin-chain"
 },
 LLAMA_ID_MAP: { "BTC":"coingecko:bitcoin", "MERL":"coingecko:merlin-chain", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin" }
});

// Main functions
function GET_WALLET_ASSETS_MERLIN(a,r,t,f,g){return _MERLIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_MERLIN(a){return _MERLIN.getCachedWalletAssets(a);}
function MERLIN_REFRESH_STATUS(a,r,t,f,g){return _MERLIN.getRefreshStatus(a,r,t,f,g);}
function MERLIN_STATS(a,t){return _MERLIN.getStats(a,t);}

// Diagnostic functions
function DIAG_MERLIN_TOKEN(w,t,r){return _MERLIN.diag.tokenBalance(w,t,r);}
function DIAG_MERLIN_COMPARE_RPCS(w,t){return _MERLIN.diag.compareRpcs(w,t);}
function DIAG_MERLIN_CHECK_ERC20(t){return _MERLIN.diag.checkErc20(t);}
function DIAG_MERLIN_RPC_HEALTH(){return _MERLIN.diag.rpcHealth();}
function DIAG_MERLIN_NATIVE_BALANCE(w){return _MERLIN.diag.nativeBalance(w);}
function DIAG_MERLIN_CACHE(w){return _MERLIN.diag.cacheInspect(w);}
function DIAG_MERLIN_CACHE_TOKEN(w,t){return _MERLIN.diag.cacheFindToken(w,t);}
function DIAG_MERLIN_CACHE_ASSETS(w){return _MERLIN.diag.cacheListAssets(w);}
function DIAG_MERLIN_TOKEN_PRICE(t){return _MERLIN.diag.tokenPrice(t);}
function DIAG_MERLIN_NATIVE_PRICE(){return _MERLIN.diag.nativePrice();}
function DIAG_MERLIN_WALLET(w){return _MERLIN.diag.walletFull(w);}
function DIAG_MERLIN_CACHE_STATS(){return _MERLIN.diag.cacheStats();}
function DIAG_MERLIN_CLEAR_CACHE(w,c){return _MERLIN.diag.clearCache(w,c);}
