/**
 * POLYNOMIAL.gs - Polynomial (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _POLYNOMIAL = ChainFactory.createEvmChain("POLYNOMIAL", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.polynomial.fi", "https://rpc-proxy.polynomial.fi"] },
 CHAIN: {
 NAME: "Polynomial",
 CHAIN_ID: 8008,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "polynomial",
 GT_NETWORK: "polynomial"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum", "USDC":"coingecko:usd-coin", "WETH":"coingecko:weth", "sUSD":"coingecko:susd" }
});

// Main functions
function GET_WALLET_ASSETS_POLYNOMIAL(a,r,t,f,g){return _POLYNOMIAL.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_POLYNOMIAL(a){return _POLYNOMIAL.getCachedWalletAssets(a);}
function POLYNOMIAL_REFRESH_STATUS(a,r,t,f,g){return _POLYNOMIAL.getRefreshStatus(a,r,t,f,g);}
function POLYNOMIAL_STATS(a,t){return _POLYNOMIAL.getStats(a,t);}

// Diagnostic functions
function DIAG_POLYNOMIAL_TOKEN(w,t,r){return _POLYNOMIAL.diag.tokenBalance(w,t,r);}
function DIAG_POLYNOMIAL_COMPARE_RPCS(w,t){return _POLYNOMIAL.diag.compareRpcs(w,t);}
function DIAG_POLYNOMIAL_CHECK_ERC20(t){return _POLYNOMIAL.diag.checkErc20(t);}
function DIAG_POLYNOMIAL_RPC_HEALTH(){return _POLYNOMIAL.diag.rpcHealth();}
function DIAG_POLYNOMIAL_NATIVE_BALANCE(w){return _POLYNOMIAL.diag.nativeBalance(w);}
function DIAG_POLYNOMIAL_CACHE(w){return _POLYNOMIAL.diag.cacheInspect(w);}
function DIAG_POLYNOMIAL_CACHE_TOKEN(w,t){return _POLYNOMIAL.diag.cacheFindToken(w,t);}
function DIAG_POLYNOMIAL_CACHE_ASSETS(w){return _POLYNOMIAL.diag.cacheListAssets(w);}
function DIAG_POLYNOMIAL_TOKEN_PRICE(t){return _POLYNOMIAL.diag.tokenPrice(t);}
function DIAG_POLYNOMIAL_NATIVE_PRICE(){return _POLYNOMIAL.diag.nativePrice();}
function DIAG_POLYNOMIAL_WALLET(w){return _POLYNOMIAL.diag.walletFull(w);}
function DIAG_POLYNOMIAL_CACHE_STATS(){return _POLYNOMIAL.diag.cacheStats();}
function DIAG_POLYNOMIAL_CLEAR_CACHE(w,c){return _POLYNOMIAL.diag.clearCache(w,c);}
