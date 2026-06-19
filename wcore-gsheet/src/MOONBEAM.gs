/**
 * MOONBEAM.gs - Moonbeam (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _MOONBEAM = ChainFactory.createEvmChain("MOONBEAM", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.api.moonbeam.network", "https://moonbeam.drpc.org", "https://1rpc.io/glmr", "https://moonbeam.public.blastapi.io"] },
 CHAIN: {
 NAME: "Moonbeam",
 CHAIN_ID: 1284,
 NATIVE_SYMBOL: "GLMR",
 NATIVE_NAME: "Glimmer",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:moonbeam",
 NATIVE_GECKO_ID: "moonbeam",
 DEX_SLUG: "moonbeam",
 GT_NETWORK: "glmr"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "GLMR":"coingecko:moonbeam", "USDC":"coingecko:usd-coin", "USDC.wh":"coingecko:usd-coin-wormhole-from-ethereum", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WELL":"coingecko:moonwell", "WETH":"coingecko:weth", "WGLMR":"coingecko:wrapped-moonbeam", "xcDOT":"coingecko:polkadot" }
});

// Main functions
function GET_WALLET_ASSETS_MOONBEAM(a,r,t,f,g){return _MOONBEAM.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_MOONBEAM(a){return _MOONBEAM.getCachedWalletAssets(a);}
function MOONBEAM_REFRESH_STATUS(a,r,t,f,g){return _MOONBEAM.getRefreshStatus(a,r,t,f,g);}
function MOONBEAM_STATS(a,t){return _MOONBEAM.getStats(a,t);}

// Diagnostic functions
function DIAG_MOONBEAM_TOKEN(w,t,r){return _MOONBEAM.diag.tokenBalance(w,t,r);}
function DIAG_MOONBEAM_COMPARE_RPCS(w,t){return _MOONBEAM.diag.compareRpcs(w,t);}
function DIAG_MOONBEAM_CHECK_ERC20(t){return _MOONBEAM.diag.checkErc20(t);}
function DIAG_MOONBEAM_RPC_HEALTH(){return _MOONBEAM.diag.rpcHealth();}
function DIAG_MOONBEAM_NATIVE_BALANCE(w){return _MOONBEAM.diag.nativeBalance(w);}
function DIAG_MOONBEAM_CACHE(w){return _MOONBEAM.diag.cacheInspect(w);}
function DIAG_MOONBEAM_CACHE_TOKEN(w,t){return _MOONBEAM.diag.cacheFindToken(w,t);}
function DIAG_MOONBEAM_CACHE_ASSETS(w){return _MOONBEAM.diag.cacheListAssets(w);}
function DIAG_MOONBEAM_TOKEN_PRICE(t){return _MOONBEAM.diag.tokenPrice(t);}
function DIAG_MOONBEAM_NATIVE_PRICE(){return _MOONBEAM.diag.nativePrice();}
function DIAG_MOONBEAM_WALLET(w){return _MOONBEAM.diag.walletFull(w);}
function DIAG_MOONBEAM_CACHE_STATS(){return _MOONBEAM.diag.cacheStats();}
function DIAG_MOONBEAM_CLEAR_CACHE(w,c){return _MOONBEAM.diag.clearCache(w,c);}
