/**
 * ZKSYNC_ERA.gs - zkSync Era (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _ZKSYNC_ERA = ChainFactory.createEvmChain("ZKSYNC_ERA", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://mainnet.era.zksync.io", "https://zksync.drpc.org", "https://1rpc.io/zksync2-era", "https://zksync-era.blockpi.network/v1/rpc/public"] },
 CHAIN: {
 NAME: "zkSync Era",
 CHAIN_ID: 324,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "zksync",
 GT_NETWORK: "zksync"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "ETH":"coingecko:ethereum", "USDC":"coingecko:usd-coin", "USDC.e":"coingecko:bridged-usd-coin-zksync", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth", "ZK":"coingecko:zksync" }
});

// Main functions
function GET_WALLET_ASSETS_ZKSYNC_ERA(a,r,t,f,g){return _ZKSYNC_ERA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ZKSYNC_ERA(a){return _ZKSYNC_ERA.getCachedWalletAssets(a);}
function ZKSYNC_ERA_REFRESH_STATUS(a,r,t,f,g){return _ZKSYNC_ERA.getRefreshStatus(a,r,t,f,g);}
function ZKSYNC_ERA_STATS(a,t){return _ZKSYNC_ERA.getStats(a,t);}

// Diagnostic functions
function DIAG_ZKSYNC_ERA_TOKEN(w,t,r){return _ZKSYNC_ERA.diag.tokenBalance(w,t,r);}
function DIAG_ZKSYNC_ERA_COMPARE_RPCS(w,t){return _ZKSYNC_ERA.diag.compareRpcs(w,t);}
function DIAG_ZKSYNC_ERA_CHECK_ERC20(t){return _ZKSYNC_ERA.diag.checkErc20(t);}
function DIAG_ZKSYNC_ERA_RPC_HEALTH(){return _ZKSYNC_ERA.diag.rpcHealth();}
function DIAG_ZKSYNC_ERA_NATIVE_BALANCE(w){return _ZKSYNC_ERA.diag.nativeBalance(w);}
function DIAG_ZKSYNC_ERA_CACHE(w){return _ZKSYNC_ERA.diag.cacheInspect(w);}
function DIAG_ZKSYNC_ERA_CACHE_TOKEN(w,t){return _ZKSYNC_ERA.diag.cacheFindToken(w,t);}
function DIAG_ZKSYNC_ERA_CACHE_ASSETS(w){return _ZKSYNC_ERA.diag.cacheListAssets(w);}
function DIAG_ZKSYNC_ERA_TOKEN_PRICE(t){return _ZKSYNC_ERA.diag.tokenPrice(t);}
function DIAG_ZKSYNC_ERA_NATIVE_PRICE(){return _ZKSYNC_ERA.diag.nativePrice();}
function DIAG_ZKSYNC_ERA_WALLET(w){return _ZKSYNC_ERA.diag.walletFull(w);}
function DIAG_ZKSYNC_ERA_CACHE_STATS(){return _ZKSYNC_ERA.diag.cacheStats();}
function DIAG_ZKSYNC_ERA_CLEAR_CACHE(w,c){return _ZKSYNC_ERA.diag.clearCache(w,c);}
