/**
 * SHAPE.gs - Shape (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _SHAPE = ChainFactory.createEvmChain("SHAPE", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://mainnet.shape.network", "https://shape-mainnet.g.alchemy.com/public", "https://360.rpc.thirdweb.com"] },
 CHAIN: {
 NAME: "Shape",
 CHAIN_ID: 360,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "shape",
 GT_NETWORK: "shape"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "ETH":"coingecko:ethereum", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_SHAPE(a,r,t,f,g){return _SHAPE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_SHAPE(a){return _SHAPE.getCachedWalletAssets(a);}
function SHAPE_REFRESH_STATUS(a,r,t,f,g){return _SHAPE.getRefreshStatus(a,r,t,f,g);}
function SHAPE_STATS(a,t){return _SHAPE.getStats(a,t);}

// Diagnostic functions
function DIAG_SHAPE_TOKEN(w,t,r){return _SHAPE.diag.tokenBalance(w,t,r);}
function DIAG_SHAPE_COMPARE_RPCS(w,t){return _SHAPE.diag.compareRpcs(w,t);}
function DIAG_SHAPE_CHECK_ERC20(t){return _SHAPE.diag.checkErc20(t);}
function DIAG_SHAPE_RPC_HEALTH(){return _SHAPE.diag.rpcHealth();}
function DIAG_SHAPE_NATIVE_BALANCE(w){return _SHAPE.diag.nativeBalance(w);}
function DIAG_SHAPE_CACHE(w){return _SHAPE.diag.cacheInspect(w);}
function DIAG_SHAPE_CACHE_TOKEN(w,t){return _SHAPE.diag.cacheFindToken(w,t);}
function DIAG_SHAPE_CACHE_ASSETS(w){return _SHAPE.diag.cacheListAssets(w);}
function DIAG_SHAPE_TOKEN_PRICE(t){return _SHAPE.diag.tokenPrice(t);}
function DIAG_SHAPE_NATIVE_PRICE(){return _SHAPE.diag.nativePrice();}
function DIAG_SHAPE_WALLET(w){return _SHAPE.diag.walletFull(w);}
function DIAG_SHAPE_CACHE_STATS(){return _SHAPE.diag.cacheStats();}
function DIAG_SHAPE_CLEAR_CACHE(w,c){return _SHAPE.diag.clearCache(w,c);}
