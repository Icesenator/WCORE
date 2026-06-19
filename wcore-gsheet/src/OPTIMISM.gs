/**
 * OPTIMISM.gs - Optimism (v4.9.6)
 * ChainFactory pattern with explicit function declarations
 * v4.9.6 - REMOVED optimism.llamarpc.com (returns stale data)
 */

var _OPTIMISM = ChainFactory.createEvmChain("OPTIMISM", {
  CACHE_VERSION: 64,
  RPC: { ENDPOINTS: ["https://mainnet.optimism.io", "https://1rpc.io/op", "https://optimism.drpc.org"], MAX_BATCH_SIZE: 10 },
 CHAIN: {
 NAME: "Optimism",
 CHAIN_ID: 10,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "optimism",
 GT_NETWORK: "optimism"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "ETH":"coingecko:ethereum", "LINK":"coingecko:chainlink", "OP":"coingecko:optimism", "SNX":"coingecko:havven", "USDC":"coingecko:usd-coin", "USDC.e":"coingecko:bridged-usd-coin-optimism", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_OPTIMISM(a,r,t,f,g){return _OPTIMISM.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_OPTIMISM(a){return _OPTIMISM.getCachedWalletAssets(a);}
function OPTIMISM_REFRESH_STATUS(a,r,t,f,g){return _OPTIMISM.getRefreshStatus(a,r,t,f,g);}
function OPTIMISM_STATS(a,t){return _OPTIMISM.getStats(a,t);}

// Diagnostic functions
function DIAG_OPTIMISM_TOKEN(w,t,r){return _OPTIMISM.diag.tokenBalance(w,t,r);}
function DIAG_OPTIMISM_COMPARE_RPCS(w,t){return _OPTIMISM.diag.compareRpcs(w,t);}
function DIAG_OPTIMISM_CHECK_ERC20(t){return _OPTIMISM.diag.checkErc20(t);}
function DIAG_OPTIMISM_RPC_HEALTH(){return _OPTIMISM.diag.rpcHealth();}
function DIAG_OPTIMISM_NATIVE_BALANCE(w){return _OPTIMISM.diag.nativeBalance(w);}
function DIAG_OPTIMISM_CACHE(w){return _OPTIMISM.diag.cacheInspect(w);}
function DIAG_OPTIMISM_CACHE_TOKEN(w,t){return _OPTIMISM.diag.cacheFindToken(w,t);}
function DIAG_OPTIMISM_CACHE_ASSETS(w){return _OPTIMISM.diag.cacheListAssets(w);}
function DIAG_OPTIMISM_TOKEN_PRICE(t){return _OPTIMISM.diag.tokenPrice(t);}
function DIAG_OPTIMISM_NATIVE_PRICE(){return _OPTIMISM.diag.nativePrice();}
function DIAG_OPTIMISM_WALLET(w){return _OPTIMISM.diag.walletFull(w);}
function DIAG_OPTIMISM_CACHE_STATS(){return _OPTIMISM.diag.cacheStats();}
function DIAG_OPTIMISM_CLEAR_CACHE(w,c){return _OPTIMISM.diag.clearCache(w,c);}