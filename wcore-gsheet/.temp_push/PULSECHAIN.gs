/**
 * PULSECHAIN.gs - PulseChain (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _PULSECHAIN = ChainFactory.createEvmChain("PULSECHAIN", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.pulsechain.com", "https://pulsechain-rpc.publicnode.com", "https://rpc-pulsechain.g4mm4.io"] },
 CHAIN: {
 NAME: "PulseChain",
 CHAIN_ID: 369,
 NATIVE_SYMBOL: "PLS",
 NATIVE_NAME: "Pulse",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:pulsechain",
 NATIVE_GECKO_ID: "pulsechain",
 DEX_SLUG: "pulsechain",
 GT_NETWORK: "pulsechain"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai-pulsechain", "HEX":"coingecko:hex-pulsechain", "PLS":"coingecko:pulsechain", "PLSX":"coingecko:pulsex", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WPLS":"coingecko:wrapped-pulse" }
});

// Main functions
function GET_WALLET_ASSETS_PULSECHAIN(a,r,t,f,g){return _PULSECHAIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_PULSECHAIN(a){return _PULSECHAIN.getCachedWalletAssets(a);}
function PULSECHAIN_REFRESH_STATUS(a,r,t,f,g){return _PULSECHAIN.getRefreshStatus(a,r,t,f,g);}
function PULSECHAIN_STATS(a,t){return _PULSECHAIN.getStats(a,t);}

// Diagnostic functions
function DIAG_PULSECHAIN_TOKEN(w,t,r){return _PULSECHAIN.diag.tokenBalance(w,t,r);}
function DIAG_PULSECHAIN_COMPARE_RPCS(w,t){return _PULSECHAIN.diag.compareRpcs(w,t);}
function DIAG_PULSECHAIN_CHECK_ERC20(t){return _PULSECHAIN.diag.checkErc20(t);}
function DIAG_PULSECHAIN_RPC_HEALTH(){return _PULSECHAIN.diag.rpcHealth();}
function DIAG_PULSECHAIN_NATIVE_BALANCE(w){return _PULSECHAIN.diag.nativeBalance(w);}
function DIAG_PULSECHAIN_CACHE(w){return _PULSECHAIN.diag.cacheInspect(w);}
function DIAG_PULSECHAIN_CACHE_TOKEN(w,t){return _PULSECHAIN.diag.cacheFindToken(w,t);}
function DIAG_PULSECHAIN_CACHE_ASSETS(w){return _PULSECHAIN.diag.cacheListAssets(w);}
function DIAG_PULSECHAIN_TOKEN_PRICE(t){return _PULSECHAIN.diag.tokenPrice(t);}
function DIAG_PULSECHAIN_NATIVE_PRICE(){return _PULSECHAIN.diag.nativePrice();}
function DIAG_PULSECHAIN_WALLET(w){return _PULSECHAIN.diag.walletFull(w);}
function DIAG_PULSECHAIN_CACHE_STATS(){return _PULSECHAIN.diag.cacheStats();}
function DIAG_PULSECHAIN_CLEAR_CACHE(w,c){return _PULSECHAIN.diag.clearCache(w,c);}
