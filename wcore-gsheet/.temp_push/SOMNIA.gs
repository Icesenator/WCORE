/**
 * SOMNIA.gs - Somnia (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _SOMNIA = ChainFactory.createEvmChain("SOMNIA", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://somnia-rpc.publicnode.com", "https://somnia.publicnode.com", "https://api.infra.mainnet.somnia.network", "https://somnia-json-rpc.stakely.io", "https://5031.rpc.thirdweb.com"] },
 CHAIN: {
 NAME: "Somnia",
 CHAIN_ID: 50311,
 NATIVE_SYMBOL: "STT",
 NATIVE_NAME: "Somnia Token",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:somnia",
 NATIVE_GECKO_ID: "somnia",
 DEX_SLUG: "somnia",
 GT_NETWORK: "somnia"
 },
 LLAMA_ID_MAP: { "STT":"coingecko:somnia", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether" }
});

// Main functions
function GET_WALLET_ASSETS_SOMNIA(a,r,t,f,g){return _SOMNIA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_SOMNIA(a){return _SOMNIA.getCachedWalletAssets(a);}
function SOMNIA_REFRESH_STATUS(a,r,t,f,g){return _SOMNIA.getRefreshStatus(a,r,t,f,g);}
function SOMNIA_STATS(a,t){return _SOMNIA.getStats(a,t);}

// Diagnostic functions
function DIAG_SOMNIA_TOKEN(w,t,r){return _SOMNIA.diag.tokenBalance(w,t,r);}
function DIAG_SOMNIA_COMPARE_RPCS(w,t){return _SOMNIA.diag.compareRpcs(w,t);}
function DIAG_SOMNIA_CHECK_ERC20(t){return _SOMNIA.diag.checkErc20(t);}
function DIAG_SOMNIA_RPC_HEALTH(){return _SOMNIA.diag.rpcHealth();}
function DIAG_SOMNIA_NATIVE_BALANCE(w){return _SOMNIA.diag.nativeBalance(w);}
function DIAG_SOMNIA_CACHE(w){return _SOMNIA.diag.cacheInspect(w);}
function DIAG_SOMNIA_CACHE_TOKEN(w,t){return _SOMNIA.diag.cacheFindToken(w,t);}
function DIAG_SOMNIA_CACHE_ASSETS(w){return _SOMNIA.diag.cacheListAssets(w);}
function DIAG_SOMNIA_TOKEN_PRICE(t){return _SOMNIA.diag.tokenPrice(t);}
function DIAG_SOMNIA_NATIVE_PRICE(){return _SOMNIA.diag.nativePrice();}
function DIAG_SOMNIA_WALLET(w){return _SOMNIA.diag.walletFull(w);}
function DIAG_SOMNIA_CACHE_STATS(){return _SOMNIA.diag.cacheStats();}
function DIAG_SOMNIA_CLEAR_CACHE(w,c){return _SOMNIA.diag.clearCache(w,c);}
