/**
 * CELO.gs - Celo (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _CELO = ChainFactory.createEvmChain("CELO", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://forno.celo.org", "https://celo.drpc.org", "https://1rpc.io/celo", "https://celo-mainnet.public.blastapi.io"] },
 CHAIN: {
 NAME: "Celo",
 CHAIN_ID: 42220,
 NATIVE_SYMBOL: "CELO",
 NATIVE_NAME: "Celo",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:celo",
 NATIVE_GECKO_ID: "celo",
 DEX_SLUG: "celo",
 GT_NETWORK: "celo"
 },
 LLAMA_ID_MAP: { "CELO":"coingecko:celo", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth", "cEUR":"coingecko:celo-euro", "cREAL":"coingecko:celo-brazilian-real", "cUSD":"coingecko:celo-dollar" }
});

// Main functions
function GET_WALLET_ASSETS_CELO(a,r,t,f,g){return _CELO.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_CELO(a){return _CELO.getCachedWalletAssets(a);}
function CELO_REFRESH_STATUS(a,r,t,f,g){return _CELO.getRefreshStatus(a,r,t,f,g);}
function CELO_STATS(a,t){return _CELO.getStats(a,t);}

// Diagnostic functions
function DIAG_CELO_TOKEN(w,t,r){return _CELO.diag.tokenBalance(w,t,r);}
function DIAG_CELO_COMPARE_RPCS(w,t){return _CELO.diag.compareRpcs(w,t);}
function DIAG_CELO_CHECK_ERC20(t){return _CELO.diag.checkErc20(t);}
function DIAG_CELO_RPC_HEALTH(){return _CELO.diag.rpcHealth();}
function DIAG_CELO_NATIVE_BALANCE(w){return _CELO.diag.nativeBalance(w);}
function DIAG_CELO_CACHE(w){return _CELO.diag.cacheInspect(w);}
function DIAG_CELO_CACHE_TOKEN(w,t){return _CELO.diag.cacheFindToken(w,t);}
function DIAG_CELO_CACHE_ASSETS(w){return _CELO.diag.cacheListAssets(w);}
function DIAG_CELO_TOKEN_PRICE(t){return _CELO.diag.tokenPrice(t);}
function DIAG_CELO_NATIVE_PRICE(){return _CELO.diag.nativePrice();}
function DIAG_CELO_WALLET(w){return _CELO.diag.walletFull(w);}
function DIAG_CELO_CACHE_STATS(){return _CELO.diag.cacheStats();}
function DIAG_CELO_CLEAR_CACHE(w,c){return _CELO.diag.clearCache(w,c);}
