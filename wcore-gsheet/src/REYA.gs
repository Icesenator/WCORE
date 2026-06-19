/**
 * REYA.gs - Reya Network (v4.10.2)
 * ChainFactory pattern with explicit function declarations
 * v4.10.2 - Reordered RPCs for better reliability
 */

var _REYA = ChainFactory.createEvmChain("REYA", {
 CACHE_VERSION: 64,
 RPC: { ENDPOINTS: [
 "https://rpc.reya.network",
 "https://reya.drpc.org",
 "https://1729.rpc.thirdweb.com",
 "https://rpc.reya-cronos.gelato.digital"
 ] },
 CHAIN: {
 NAME: "Reya Network",
 CHAIN_ID: 1729,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "reya",
 GT_NETWORK: "reya"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum", "USDC":"coingecko:usd-coin", "WETH":"coingecko:weth", "rUSD":"coingecko:reya-usd" }
});

// Main functions
function GET_WALLET_ASSETS_REYA(a,r,t,f,g){return _REYA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_REYA(a){return _REYA.getCachedWalletAssets(a);}
function REYA_REFRESH_STATUS(a,r,t,f,g){return _REYA.getRefreshStatus(a,r,t,f,g);}
function REYA_STATS(a,t){return _REYA.getStats(a,t);}

// Diagnostic functions
function DIAG_REYA_TOKEN(w,t,r){return _REYA.diag.tokenBalance(w,t,r);}
function DIAG_REYA_COMPARE_RPCS(w,t){return _REYA.diag.compareRpcs(w,t);}
function DIAG_REYA_CHECK_ERC20(t){return _REYA.diag.checkErc20(t);}
function DIAG_REYA_RPC_HEALTH(){return _REYA.diag.rpcHealth();}
function DIAG_REYA_NATIVE_BALANCE(w){return _REYA.diag.nativeBalance(w);}
function DIAG_REYA_CACHE(w){return _REYA.diag.cacheInspect(w);}
function DIAG_REYA_CACHE_TOKEN(w,t){return _REYA.diag.cacheFindToken(w,t);}
function DIAG_REYA_CACHE_ASSETS(w){return _REYA.diag.cacheListAssets(w);}
function DIAG_REYA_TOKEN_PRICE(t){return _REYA.diag.tokenPrice(t);}
function DIAG_REYA_NATIVE_PRICE(){return _REYA.diag.nativePrice();}
function DIAG_REYA_WALLET(w){return _REYA.diag.walletFull(w);}
function DIAG_REYA_CACHE_STATS(){return _REYA.diag.cacheStats();}
function DIAG_REYA_CLEAR_CACHE(w,c){return _REYA.diag.clearCache(w,c);}
