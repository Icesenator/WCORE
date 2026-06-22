/**
 * PLUME.gs - Plume (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _PLUME = ChainFactory.createEvmChain("PLUME", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.plume.org", "https://plume.drpc.org", "https://plume-mainnet.gateway.tatum.io"] }, // Tatum
 CHAIN: {
 NAME: "Plume",
 CHAIN_ID: 98866,
 NATIVE_SYMBOL: "PLUME",
 NATIVE_NAME: "Plume",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:plume",
 NATIVE_GECKO_ID: "plume",
 DEX_SLUG: "plume-network",
 GT_NETWORK: "plume-network"
 },
 LLAMA_ID_MAP: { "PLUME":"coingecko:plume", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WETH":"coingecko:weth", "pETH":"coingecko:plume-eth", "pUSD":"coingecko:plume-usd" }
});

// Main functions
function GET_WALLET_ASSETS_PLUME(a,r,t,f,g){return _PLUME.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_PLUME(a){return _PLUME.getCachedWalletAssets(a);}
function PLUME_REFRESH_STATUS(a,r,t,f,g){return _PLUME.getRefreshStatus(a,r,t,f,g);}
function PLUME_STATS(a,t){return _PLUME.getStats(a,t);}

// Diagnostic functions
function DIAG_PLUME_TOKEN(w,t,r){return _PLUME.diag.tokenBalance(w,t,r);}
function DIAG_PLUME_COMPARE_RPCS(w,t){return _PLUME.diag.compareRpcs(w,t);}
function DIAG_PLUME_CHECK_ERC20(t){return _PLUME.diag.checkErc20(t);}
function DIAG_PLUME_RPC_HEALTH(){return _PLUME.diag.rpcHealth();}
function DIAG_PLUME_NATIVE_BALANCE(w){return _PLUME.diag.nativeBalance(w);}
function DIAG_PLUME_CACHE(w){return _PLUME.diag.cacheInspect(w);}
function DIAG_PLUME_CACHE_TOKEN(w,t){return _PLUME.diag.cacheFindToken(w,t);}
function DIAG_PLUME_CACHE_ASSETS(w){return _PLUME.diag.cacheListAssets(w);}
function DIAG_PLUME_TOKEN_PRICE(t){return _PLUME.diag.tokenPrice(t);}
function DIAG_PLUME_NATIVE_PRICE(){return _PLUME.diag.nativePrice();}
function DIAG_PLUME_WALLET(w){return _PLUME.diag.walletFull(w);}
function DIAG_PLUME_CACHE_STATS(){return _PLUME.diag.cacheStats();}
function DIAG_PLUME_CLEAR_CACHE(w,c){return _PLUME.diag.clearCache(w,c);}
