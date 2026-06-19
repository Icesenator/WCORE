/**
 * B3.gs - B3 (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _B3 = ChainFactory.createEvmChain("B3", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://mainnet-rpc.b3.fun"] },
 CHAIN: {
 NAME: "B3",
 CHAIN_ID: 8333,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "b3",
 GT_NETWORK: "b3"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "ETH":"coingecko:ethereum", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_B3(a,r,t,f,g){return _B3.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_B3(a){return _B3.getCachedWalletAssets(a);}
function B3_REFRESH_STATUS(a,r,t,f,g){return _B3.getRefreshStatus(a,r,t,f,g);}
function B3_STATS(a,t){return _B3.getStats(a,t);}

// Diagnostic functions
function DIAG_B3_TOKEN(w,t,r){return _B3.diag.tokenBalance(w,t,r);}
function DIAG_B3_COMPARE_RPCS(w,t){return _B3.diag.compareRpcs(w,t);}
function DIAG_B3_CHECK_ERC20(t){return _B3.diag.checkErc20(t);}
function DIAG_B3_RPC_HEALTH(){return _B3.diag.rpcHealth();}
function DIAG_B3_NATIVE_BALANCE(w){return _B3.diag.nativeBalance(w);}
function DIAG_B3_CACHE(w){return _B3.diag.cacheInspect(w);}
function DIAG_B3_CACHE_TOKEN(w,t){return _B3.diag.cacheFindToken(w,t);}
function DIAG_B3_CACHE_ASSETS(w){return _B3.diag.cacheListAssets(w);}
function DIAG_B3_TOKEN_PRICE(t){return _B3.diag.tokenPrice(t);}
function DIAG_B3_NATIVE_PRICE(){return _B3.diag.nativePrice();}
function DIAG_B3_WALLET(w){return _B3.diag.walletFull(w);}
function DIAG_B3_CACHE_STATS(){return _B3.diag.cacheStats();}
function DIAG_B3_CLEAR_CACHE(w,c){return _B3.diag.clearCache(w,c);}
