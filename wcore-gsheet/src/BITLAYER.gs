/**
 * BITLAYER.gs - Bitlayer (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _BITLAYER = ChainFactory.createEvmChain("BITLAYER", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.bitlayer.org", "https://rpc.bitlayer-rpc.com", "https://rpc.ankr.com/bitlayer"] },
 CHAIN: {
 NAME: "Bitlayer",
 CHAIN_ID: 200901,
 NATIVE_SYMBOL: "BTC",
 NATIVE_NAME: "Bitcoin",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:bitcoin",
 NATIVE_GECKO_ID: "bitcoin",
 DEX_SLUG: "bitlayer",
 GT_NETWORK: "bitlayer"
 },
 LLAMA_ID_MAP: { "BTC":"coingecko:bitcoin", "DAI":"coingecko:dai", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_BITLAYER(a,r,t,f,g){return _BITLAYER.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_BITLAYER(a){return _BITLAYER.getCachedWalletAssets(a);}
function BITLAYER_REFRESH_STATUS(a,r,t,f,g){return _BITLAYER.getRefreshStatus(a,r,t,f,g);}
function BITLAYER_STATS(a,t){return _BITLAYER.getStats(a,t);}

// Diagnostic functions
function DIAG_BITLAYER_TOKEN(w,t,r){return _BITLAYER.diag.tokenBalance(w,t,r);}
function DIAG_BITLAYER_COMPARE_RPCS(w,t){return _BITLAYER.diag.compareRpcs(w,t);}
function DIAG_BITLAYER_CHECK_ERC20(t){return _BITLAYER.diag.checkErc20(t);}
function DIAG_BITLAYER_RPC_HEALTH(){return _BITLAYER.diag.rpcHealth();}
function DIAG_BITLAYER_NATIVE_BALANCE(w){return _BITLAYER.diag.nativeBalance(w);}
function DIAG_BITLAYER_CACHE(w){return _BITLAYER.diag.cacheInspect(w);}
function DIAG_BITLAYER_CACHE_TOKEN(w,t){return _BITLAYER.diag.cacheFindToken(w,t);}
function DIAG_BITLAYER_CACHE_ASSETS(w){return _BITLAYER.diag.cacheListAssets(w);}
function DIAG_BITLAYER_TOKEN_PRICE(t){return _BITLAYER.diag.tokenPrice(t);}
function DIAG_BITLAYER_NATIVE_PRICE(){return _BITLAYER.diag.nativePrice();}
function DIAG_BITLAYER_WALLET(w){return _BITLAYER.diag.walletFull(w);}
function DIAG_BITLAYER_CACHE_STATS(){return _BITLAYER.diag.cacheStats();}
function DIAG_BITLAYER_CLEAR_CACHE(w,c){return _BITLAYER.diag.clearCache(w,c);}
