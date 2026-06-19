/**
 * MANTA_PACIFIC.gs - Manta Pacific (v4.10.2)
 * ChainFactory pattern with explicit function declarations
 * v4.10.2 - Added fallback RPCs for reliability
 */

var _MANTA_PACIFIC = ChainFactory.createEvmChain("MANTA_PACIFIC", {
 CACHE_VERSION: 64,
 RPC: { ENDPOINTS: [
 "https://pacific-rpc.manta.network/http",
 "https://manta-pacific.drpc.org",
 "https://1rpc.io/manta",
 "https://manta.nirvana.build",
 "https://169.rpc.thirdweb.com"
 ] },
 CHAIN: {
 NAME: "Manta Pacific",
 CHAIN_ID: 169,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "manta",
 GT_NETWORK: "manta-pacific"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "ETH":"coingecko:ethereum", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_MANTA_PACIFIC(a,r,t,f,g){return _MANTA_PACIFIC.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_MANTA_PACIFIC(a){return _MANTA_PACIFIC.getCachedWalletAssets(a);}
function MANTA_PACIFIC_REFRESH_STATUS(a,r,t,f,g){return _MANTA_PACIFIC.getRefreshStatus(a,r,t,f,g);}
function MANTA_PACIFIC_STATS(a,t){return _MANTA_PACIFIC.getStats(a,t);}

// Diagnostic functions
function DIAG_MANTA_PACIFIC_TOKEN(w,t,r){return _MANTA_PACIFIC.diag.tokenBalance(w,t,r);}
function DIAG_MANTA_PACIFIC_COMPARE_RPCS(w,t){return _MANTA_PACIFIC.diag.compareRpcs(w,t);}
function DIAG_MANTA_PACIFIC_CHECK_ERC20(t){return _MANTA_PACIFIC.diag.checkErc20(t);}
function DIAG_MANTA_PACIFIC_RPC_HEALTH(){return _MANTA_PACIFIC.diag.rpcHealth();}
function DIAG_MANTA_PACIFIC_NATIVE_BALANCE(w){return _MANTA_PACIFIC.diag.nativeBalance(w);}
function DIAG_MANTA_PACIFIC_CACHE(w){return _MANTA_PACIFIC.diag.cacheInspect(w);}
function DIAG_MANTA_PACIFIC_CACHE_TOKEN(w,t){return _MANTA_PACIFIC.diag.cacheFindToken(w,t);}
function DIAG_MANTA_PACIFIC_CACHE_ASSETS(w){return _MANTA_PACIFIC.diag.cacheListAssets(w);}
function DIAG_MANTA_PACIFIC_TOKEN_PRICE(t){return _MANTA_PACIFIC.diag.tokenPrice(t);}
function DIAG_MANTA_PACIFIC_NATIVE_PRICE(){return _MANTA_PACIFIC.diag.nativePrice();}
function DIAG_MANTA_PACIFIC_WALLET(w){return _MANTA_PACIFIC.diag.walletFull(w);}
function DIAG_MANTA_PACIFIC_CACHE_STATS(){return _MANTA_PACIFIC.diag.cacheStats();}
function DIAG_MANTA_PACIFIC_CLEAR_CACHE(w,c){return _MANTA_PACIFIC.diag.clearCache(w,c);}
