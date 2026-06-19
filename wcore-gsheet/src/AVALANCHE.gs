/**
 * AVALANCHE.gs - Avalanche (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _AVALANCHE = ChainFactory.createEvmChain("AVALANCHE", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://api.avax.network/ext/bc/C/rpc", "https://avalanche.public-rpc.com", "https://avalanche.drpc.org"] },
 CHAIN: {
 NAME: "Avalanche",
 CHAIN_ID: 43114,
 NATIVE_SYMBOL: "AVAX",
 NATIVE_NAME: "Avalanche",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:avalanche-2",
 NATIVE_GECKO_ID: "avalanche-2",
 DEX_SLUG: "avalanche",
 GT_NETWORK: "avax"
 },
 LLAMA_ID_MAP: { "AVAX":"coingecko:avalanche-2", "DAI":"coingecko:dai", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WAVAX":"coingecko:wrapped-avax", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_AVALANCHE(a,r,t,f,g){return _AVALANCHE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_AVALANCHE(a){return _AVALANCHE.getCachedWalletAssets(a);}
function AVALANCHE_REFRESH_STATUS(a,r,t,f,g){return _AVALANCHE.getRefreshStatus(a,r,t,f,g);}
function AVALANCHE_STATS(a,t){return _AVALANCHE.getStats(a,t);}

// Diagnostic functions
function DIAG_AVALANCHE_TOKEN(w,t,r){return _AVALANCHE.diag.tokenBalance(w,t,r);}
function DIAG_AVALANCHE_COMPARE_RPCS(w,t){return _AVALANCHE.diag.compareRpcs(w,t);}
function DIAG_AVALANCHE_CHECK_ERC20(t){return _AVALANCHE.diag.checkErc20(t);}
function DIAG_AVALANCHE_RPC_HEALTH(){return _AVALANCHE.diag.rpcHealth();}
function DIAG_AVALANCHE_NATIVE_BALANCE(w){return _AVALANCHE.diag.nativeBalance(w);}
function DIAG_AVALANCHE_CACHE(w){return _AVALANCHE.diag.cacheInspect(w);}
function DIAG_AVALANCHE_CACHE_TOKEN(w,t){return _AVALANCHE.diag.cacheFindToken(w,t);}
function DIAG_AVALANCHE_CACHE_ASSETS(w){return _AVALANCHE.diag.cacheListAssets(w);}
function DIAG_AVALANCHE_TOKEN_PRICE(t){return _AVALANCHE.diag.tokenPrice(t);}
function DIAG_AVALANCHE_NATIVE_PRICE(){return _AVALANCHE.diag.nativePrice();}
function DIAG_AVALANCHE_WALLET(w){return _AVALANCHE.diag.walletFull(w);}
function DIAG_AVALANCHE_CACHE_STATS(){return _AVALANCHE.diag.cacheStats();}
function DIAG_AVALANCHE_CLEAR_CACHE(w,c){return _AVALANCHE.diag.clearCache(w,c);}
