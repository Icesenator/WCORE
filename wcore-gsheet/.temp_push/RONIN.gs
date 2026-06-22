/**
 * RONIN.gs - Ronin (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _RONIN = ChainFactory.createEvmChain("RONIN", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://api.roninchain.com/rpc", "https://ronin.drpc.org", "https://ronin.lgns.net/rpc"] },
 CHAIN: {
 NAME: "Ronin",
 CHAIN_ID: 2020,
 NATIVE_SYMBOL: "RON",
 NATIVE_NAME: "Ronin",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ronin",
 NATIVE_GECKO_ID: "ronin",
 DEX_SLUG: "ronin",
 GT_NETWORK: "ronin"
 },
 LLAMA_ID_MAP: { "AXS":"coingecko:axie-infinity", "RON":"coingecko:ronin", "SLP":"coingecko:smooth-love-potion", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth", "WRON":"coingecko:ronin" }
});

// Main functions
function GET_WALLET_ASSETS_RONIN(a,r,t,f,g){return _RONIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_RONIN(a){return _RONIN.getCachedWalletAssets(a);}
function RONIN_REFRESH_STATUS(a,r,t,f,g){return _RONIN.getRefreshStatus(a,r,t,f,g);}
function RONIN_STATS(a,t){return _RONIN.getStats(a,t);}

// Diagnostic functions
function DIAG_RONIN_TOKEN(w,t,r){return _RONIN.diag.tokenBalance(w,t,r);}
function DIAG_RONIN_COMPARE_RPCS(w,t){return _RONIN.diag.compareRpcs(w,t);}
function DIAG_RONIN_CHECK_ERC20(t){return _RONIN.diag.checkErc20(t);}
function DIAG_RONIN_RPC_HEALTH(){return _RONIN.diag.rpcHealth();}
function DIAG_RONIN_NATIVE_BALANCE(w){return _RONIN.diag.nativeBalance(w);}
function DIAG_RONIN_CACHE(w){return _RONIN.diag.cacheInspect(w);}
function DIAG_RONIN_CACHE_TOKEN(w,t){return _RONIN.diag.cacheFindToken(w,t);}
function DIAG_RONIN_CACHE_ASSETS(w){return _RONIN.diag.cacheListAssets(w);}
function DIAG_RONIN_TOKEN_PRICE(t){return _RONIN.diag.tokenPrice(t);}
function DIAG_RONIN_NATIVE_PRICE(){return _RONIN.diag.nativePrice();}
function DIAG_RONIN_WALLET(w){return _RONIN.diag.walletFull(w);}
function DIAG_RONIN_CACHE_STATS(){return _RONIN.diag.cacheStats();}
function DIAG_RONIN_CLEAR_CACHE(w,c){return _RONIN.diag.clearCache(w,c);}
