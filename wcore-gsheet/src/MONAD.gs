/**
 * MONAD.gs - Monad (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _MONAD = ChainFactory.createEvmChain("MONAD", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.monad.xyz", "https://rpc1.monad.xyz", "https://rpc3.monad.xyz", "https://rpc-mainnet.monadinfra.com"] },
 CHAIN: {
 NAME: "Monad",
 CHAIN_ID: 143,
 NATIVE_SYMBOL: "MON",
 NATIVE_NAME: "Monad",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:monad",
 NATIVE_GECKO_ID: "monad",
 DEX_SLUG: "monad",
 GT_NETWORK: "monad"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "MON":"coingecko:monad", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth", "WMON":"coingecko:monad" }
});

// Main functions
function GET_WALLET_ASSETS_MONAD(a,r,t,f,g){return _MONAD.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_MONAD(a){return _MONAD.getCachedWalletAssets(a);}
function MONAD_REFRESH_STATUS(a,r,t,f,g){return _MONAD.getRefreshStatus(a,r,t,f,g);}
function MONAD_STATS(a,t){return _MONAD.getStats(a,t);}

// Diagnostic functions
function DIAG_MONAD_TOKEN(w,t,r){return _MONAD.diag.tokenBalance(w,t,r);}
function DIAG_MONAD_COMPARE_RPCS(w,t){return _MONAD.diag.compareRpcs(w,t);}
function DIAG_MONAD_CHECK_ERC20(t){return _MONAD.diag.checkErc20(t);}
function DIAG_MONAD_RPC_HEALTH(){return _MONAD.diag.rpcHealth();}
function DIAG_MONAD_NATIVE_BALANCE(w){return _MONAD.diag.nativeBalance(w);}
function DIAG_MONAD_CACHE(w){return _MONAD.diag.cacheInspect(w);}
function DIAG_MONAD_CACHE_TOKEN(w,t){return _MONAD.diag.cacheFindToken(w,t);}
function DIAG_MONAD_CACHE_ASSETS(w){return _MONAD.diag.cacheListAssets(w);}
function DIAG_MONAD_TOKEN_PRICE(t){return _MONAD.diag.tokenPrice(t);}
function DIAG_MONAD_NATIVE_PRICE(){return _MONAD.diag.nativePrice();}
function DIAG_MONAD_WALLET(w){return _MONAD.diag.walletFull(w);}
function DIAG_MONAD_CACHE_STATS(){return _MONAD.diag.cacheStats();}
function DIAG_MONAD_CLEAR_CACHE(w,c){return _MONAD.diag.clearCache(w,c);}
