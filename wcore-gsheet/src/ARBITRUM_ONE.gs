/**
 * ARBITRUM_ONE.gs - Arbitrum One (v4.9.6)
 * ChainFactory pattern with explicit function declarations
 * v4.9.6 - REMOVED arbitrum.llamarpc.com (returns stale data)
 */

var _ARBITRUM_ONE = ChainFactory.createEvmChain("ARBITRUM_ONE", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://arb1.arbitrum.io/rpc", "https://1rpc.io/arb", "https://arbitrum.drpc.org"] },
 CHAIN: {
 NAME: "Arbitrum One",
 CHAIN_ID: 42161,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "arbitrum",
 GT_NETWORK: "arbitrum"
 },
 LLAMA_ID_MAP: { "ARB":"coingecko:arbitrum", "ETH":"coingecko:ethereum", "USDC":"coingecko:usd-coin", "USDC.e":"coingecko:bridged-usdc-arbitrum", "USDT":"coingecko:tether", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_ARBITRUM_ONE(a,r,t,f,g){return _ARBITRUM_ONE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ARBITRUM_ONE(a){return _ARBITRUM_ONE.getCachedWalletAssets(a);}
function ARBITRUM_ONE_REFRESH_STATUS(a,r,t,f,g){return _ARBITRUM_ONE.getRefreshStatus(a,r,t,f,g);}
function ARBITRUM_ONE_STATS(a,t){return _ARBITRUM_ONE.getStats(a,t);}

// Diagnostic functions
function DIAG_ARBITRUM_ONE_TOKEN(w,t,r){return _ARBITRUM_ONE.diag.tokenBalance(w,t,r);}
function DIAG_ARBITRUM_ONE_COMPARE_RPCS(w,t){return _ARBITRUM_ONE.diag.compareRpcs(w,t);}
function DIAG_ARBITRUM_ONE_CHECK_ERC20(t){return _ARBITRUM_ONE.diag.checkErc20(t);}
function DIAG_ARBITRUM_ONE_RPC_HEALTH(){return _ARBITRUM_ONE.diag.rpcHealth();}
function DIAG_ARBITRUM_ONE_NATIVE_BALANCE(w){return _ARBITRUM_ONE.diag.nativeBalance(w);}
function DIAG_ARBITRUM_ONE_CACHE(w){return _ARBITRUM_ONE.diag.cacheInspect(w);}
function DIAG_ARBITRUM_ONE_CACHE_TOKEN(w,t){return _ARBITRUM_ONE.diag.cacheFindToken(w,t);}
function DIAG_ARBITRUM_ONE_CACHE_ASSETS(w){return _ARBITRUM_ONE.diag.cacheListAssets(w);}
function DIAG_ARBITRUM_ONE_TOKEN_PRICE(t){return _ARBITRUM_ONE.diag.tokenPrice(t);}
function DIAG_ARBITRUM_ONE_NATIVE_PRICE(){return _ARBITRUM_ONE.diag.nativePrice();}
function DIAG_ARBITRUM_ONE_WALLET(w){return _ARBITRUM_ONE.diag.walletFull(w);}
function DIAG_ARBITRUM_ONE_CACHE_STATS(){return _ARBITRUM_ONE.diag.cacheStats();}
function DIAG_ARBITRUM_ONE_CLEAR_CACHE(w,c){return _ARBITRUM_ONE.diag.clearCache(w,c);}