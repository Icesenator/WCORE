/**
 * SCROLL.gs - Scroll (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _SCROLL = ChainFactory.createEvmChain("SCROLL", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.scroll.io", "https://scroll.drpc.org", "https://1rpc.io/scroll", "https://scroll-mainnet.public.blastapi.io"] },
 CHAIN: {
 NAME: "Scroll",
 CHAIN_ID: 534352,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "scroll",
 GT_NETWORK: "scroll"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "ETH":"coingecko:ethereum", "SCR":"coingecko:scroll", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth", "wstETH":"coingecko:wrapped-steth" }
});

// Main functions
function GET_WALLET_ASSETS_SCROLL(a,r,t,f,g){return _SCROLL.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_SCROLL(a){return _SCROLL.getCachedWalletAssets(a);}
function SCROLL_REFRESH_STATUS(a,r,t,f,g){return _SCROLL.getRefreshStatus(a,r,t,f,g);}
function SCROLL_STATS(a,t){return _SCROLL.getStats(a,t);}

// Diagnostic functions
function DIAG_SCROLL_TOKEN(w,t,r){return _SCROLL.diag.tokenBalance(w,t,r);}
function DIAG_SCROLL_COMPARE_RPCS(w,t){return _SCROLL.diag.compareRpcs(w,t);}
function DIAG_SCROLL_CHECK_ERC20(t){return _SCROLL.diag.checkErc20(t);}
function DIAG_SCROLL_RPC_HEALTH(){return _SCROLL.diag.rpcHealth();}
function DIAG_SCROLL_NATIVE_BALANCE(w){return _SCROLL.diag.nativeBalance(w);}
function DIAG_SCROLL_CACHE(w){return _SCROLL.diag.cacheInspect(w);}
function DIAG_SCROLL_CACHE_TOKEN(w,t){return _SCROLL.diag.cacheFindToken(w,t);}
function DIAG_SCROLL_CACHE_ASSETS(w){return _SCROLL.diag.cacheListAssets(w);}
function DIAG_SCROLL_TOKEN_PRICE(t){return _SCROLL.diag.tokenPrice(t);}
function DIAG_SCROLL_NATIVE_PRICE(){return _SCROLL.diag.nativePrice();}
function DIAG_SCROLL_WALLET(w){return _SCROLL.diag.walletFull(w);}
function DIAG_SCROLL_CACHE_STATS(){return _SCROLL.diag.cacheStats();}
function DIAG_SCROLL_CLEAR_CACHE(w,c){return _SCROLL.diag.clearCache(w,c);}
