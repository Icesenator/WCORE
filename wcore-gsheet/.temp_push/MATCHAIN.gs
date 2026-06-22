/**
 * MATCHAIN.gs - Matchain (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _MATCHAIN = ChainFactory.createEvmChain("MATCHAIN", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.matchain.io", "https://rpc.ankr.com/matchain_mainnet", "https://698.rpc.thirdweb.com"] },
 CHAIN: {
 NAME: "Matchain",
 CHAIN_ID: 698,
 NATIVE_SYMBOL: "BNB",
 NATIVE_NAME: "BNB",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:binancecoin",
 NATIVE_GECKO_ID: "binancecoin",
 DEX_SLUG: "matchain",
 GT_NETWORK: "matchain"
 },
 LLAMA_ID_MAP: { "BNB":"coingecko:binancecoin", "DAI":"coingecko:dai", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBNB":"coingecko:wbnb", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_MATCHAIN(a,r,t,f,g){return _MATCHAIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_MATCHAIN(a){return _MATCHAIN.getCachedWalletAssets(a);}
function MATCHAIN_REFRESH_STATUS(a,r,t,f,g){return _MATCHAIN.getRefreshStatus(a,r,t,f,g);}
function MATCHAIN_STATS(a,t){return _MATCHAIN.getStats(a,t);}

// Diagnostic functions
function DIAG_MATCHAIN_TOKEN(w,t,r){return _MATCHAIN.diag.tokenBalance(w,t,r);}
function DIAG_MATCHAIN_COMPARE_RPCS(w,t){return _MATCHAIN.diag.compareRpcs(w,t);}
function DIAG_MATCHAIN_CHECK_ERC20(t){return _MATCHAIN.diag.checkErc20(t);}
function DIAG_MATCHAIN_RPC_HEALTH(){return _MATCHAIN.diag.rpcHealth();}
function DIAG_MATCHAIN_NATIVE_BALANCE(w){return _MATCHAIN.diag.nativeBalance(w);}
function DIAG_MATCHAIN_CACHE(w){return _MATCHAIN.diag.cacheInspect(w);}
function DIAG_MATCHAIN_CACHE_TOKEN(w,t){return _MATCHAIN.diag.cacheFindToken(w,t);}
function DIAG_MATCHAIN_CACHE_ASSETS(w){return _MATCHAIN.diag.cacheListAssets(w);}
function DIAG_MATCHAIN_TOKEN_PRICE(t){return _MATCHAIN.diag.tokenPrice(t);}
function DIAG_MATCHAIN_NATIVE_PRICE(){return _MATCHAIN.diag.nativePrice();}
function DIAG_MATCHAIN_WALLET(w){return _MATCHAIN.diag.walletFull(w);}
function DIAG_MATCHAIN_CACHE_STATS(){return _MATCHAIN.diag.cacheStats();}
function DIAG_MATCHAIN_CLEAR_CACHE(w,c){return _MATCHAIN.diag.clearCache(w,c);}
