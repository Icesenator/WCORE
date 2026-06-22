/**
 * LINEA.gs - Linea (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _LINEA = ChainFactory.createEvmChain("LINEA", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://linea.drpc.org", "https://rpc.linea.build", "https://1rpc.io/linea"] },
 CHAIN: {
 NAME: "Linea",
 CHAIN_ID: 59144,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "linea",
 GT_NETWORK: "linea"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "ETH":"coingecko:ethereum", "USDC":"coingecko:usd-coin", "USDC.e":"coingecko:bridged-usd-coin-linea", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_LINEA(a,r,t,f,g){return _LINEA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_LINEA(a){return _LINEA.getCachedWalletAssets(a);}
function LINEA_REFRESH_STATUS(a,r,t,f,g){return _LINEA.getRefreshStatus(a,r,t,f,g);}
function LINEA_STATS(a,t){return _LINEA.getStats(a,t);}

// Diagnostic functions
function DIAG_LINEA_TOKEN(w,t,r){return _LINEA.diag.tokenBalance(w,t,r);}
function DIAG_LINEA_COMPARE_RPCS(w,t){return _LINEA.diag.compareRpcs(w,t);}
function DIAG_LINEA_CHECK_ERC20(t){return _LINEA.diag.checkErc20(t);}
function DIAG_LINEA_RPC_HEALTH(){return _LINEA.diag.rpcHealth();}
function DIAG_LINEA_NATIVE_BALANCE(w){return _LINEA.diag.nativeBalance(w);}
function DIAG_LINEA_CACHE(w){return _LINEA.diag.cacheInspect(w);}
function DIAG_LINEA_CACHE_TOKEN(w,t){return _LINEA.diag.cacheFindToken(w,t);}
function DIAG_LINEA_CACHE_ASSETS(w){return _LINEA.diag.cacheListAssets(w);}
function DIAG_LINEA_TOKEN_PRICE(t){return _LINEA.diag.tokenPrice(t);}
function DIAG_LINEA_NATIVE_PRICE(){return _LINEA.diag.nativePrice();}
function DIAG_LINEA_WALLET(w){return _LINEA.diag.walletFull(w);}
function DIAG_LINEA_CACHE_STATS(){return _LINEA.diag.cacheStats();}
function DIAG_LINEA_CLEAR_CACHE(w,c){return _LINEA.diag.clearCache(w,c);}
