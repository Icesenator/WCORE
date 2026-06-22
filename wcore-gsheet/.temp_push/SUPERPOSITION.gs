/**
 * SUPERPOSITION.gs - Superposition (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _SUPERPOSITION = ChainFactory.createEvmChain("SUPERPOSITION", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.superposition.so", "https://55244.rpc.thirdweb.com"] }, // thirdweb
 CHAIN: {
 NAME: "Superposition",
 CHAIN_ID: 55244,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "superposition",
 GT_NETWORK: "superposition"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum", "USDC":"coingecko:usd-coin", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_SUPERPOSITION(a,r,t,f,g){return _SUPERPOSITION.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_SUPERPOSITION(a){return _SUPERPOSITION.getCachedWalletAssets(a);}
function SUPERPOSITION_REFRESH_STATUS(a,r,t,f,g){return _SUPERPOSITION.getRefreshStatus(a,r,t,f,g);}
function SUPERPOSITION_STATS(a,t){return _SUPERPOSITION.getStats(a,t);}

// Diagnostic functions
function DIAG_SUPERPOSITION_TOKEN(w,t,r){return _SUPERPOSITION.diag.tokenBalance(w,t,r);}
function DIAG_SUPERPOSITION_COMPARE_RPCS(w,t){return _SUPERPOSITION.diag.compareRpcs(w,t);}
function DIAG_SUPERPOSITION_CHECK_ERC20(t){return _SUPERPOSITION.diag.checkErc20(t);}
function DIAG_SUPERPOSITION_RPC_HEALTH(){return _SUPERPOSITION.diag.rpcHealth();}
function DIAG_SUPERPOSITION_NATIVE_BALANCE(w){return _SUPERPOSITION.diag.nativeBalance(w);}
function DIAG_SUPERPOSITION_CACHE(w){return _SUPERPOSITION.diag.cacheInspect(w);}
function DIAG_SUPERPOSITION_CACHE_TOKEN(w,t){return _SUPERPOSITION.diag.cacheFindToken(w,t);}
function DIAG_SUPERPOSITION_CACHE_ASSETS(w){return _SUPERPOSITION.diag.cacheListAssets(w);}
function DIAG_SUPERPOSITION_TOKEN_PRICE(t){return _SUPERPOSITION.diag.tokenPrice(t);}
function DIAG_SUPERPOSITION_NATIVE_PRICE(){return _SUPERPOSITION.diag.nativePrice();}
function DIAG_SUPERPOSITION_WALLET(w){return _SUPERPOSITION.diag.walletFull(w);}
function DIAG_SUPERPOSITION_CACHE_STATS(){return _SUPERPOSITION.diag.cacheStats();}
function DIAG_SUPERPOSITION_CLEAR_CACHE(w,c){return _SUPERPOSITION.diag.clearCache(w,c);}
