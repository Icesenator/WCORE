/**
 * FRAXTAL.gs - Fraxtal (v4.9.6)
 * ChainFactory pattern with explicit function declarations
 * Fix: Fraxtal native gas token is FRAX after Frax Finance 2025 rebrand
 */

var _FRAXTAL = ChainFactory.createEvmChain("FRAXTAL", {
 CACHE_VERSION: 64,
 RPC: { ENDPOINTS: ["https://rpc.frax.com", "https://fraxtal.drpc.org", "https://fraxtal.gateway.tenderly.co"] },
 CHAIN: {
 NAME: "Fraxtal",
 CHAIN_ID: 252,
 NATIVE_SYMBOL: "FRAX",
 NATIVE_NAME: "Frax",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:frax-share",
 NATIVE_GECKO_ID: "frax-share",
 DEX_SLUG: "fraxtal",
 GT_NETWORK: "fraxtal"
 },
 LLAMA_ID_MAP: { "FRAX":"coingecko:frax-share", "FXS":"coingecko:frax-share", "USDC":"coingecko:usd-coin", "WETH":"coingecko:weth", "frxETH":"coingecko:frax-ether", "sfrxETH":"coingecko:staked-frax-ether", "frxUSD":"coingecko:frax-usd" }
});

// Main functions
function GET_WALLET_ASSETS_FRAXTAL(a,r,t,f,g){return _FRAXTAL.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_FRAXTAL(a){return _FRAXTAL.getCachedWalletAssets(a);}
function FRAXTAL_REFRESH_STATUS(a,r,t,f,g){return _FRAXTAL.getRefreshStatus(a,r,t,f,g);}
function FRAXTAL_STATS(a,t){return _FRAXTAL.getStats(a,t);}

// Diagnostic functions
function DIAG_FRAXTAL_TOKEN(w,t,r){return _FRAXTAL.diag.tokenBalance(w,t,r);}
function DIAG_FRAXTAL_COMPARE_RPCS(w,t){return _FRAXTAL.diag.compareRpcs(w,t);}
function DIAG_FRAXTAL_CHECK_ERC20(t){return _FRAXTAL.diag.checkErc20(t);}
function DIAG_FRAXTAL_RPC_HEALTH(){return _FRAXTAL.diag.rpcHealth();}
function DIAG_FRAXTAL_NATIVE_BALANCE(w){return _FRAXTAL.diag.nativeBalance(w);}
function DIAG_FRAXTAL_CACHE(w){return _FRAXTAL.diag.cacheInspect(w);}
function DIAG_FRAXTAL_CACHE_TOKEN(w,t){return _FRAXTAL.diag.cacheFindToken(w,t);}
function DIAG_FRAXTAL_CACHE_ASSETS(w){return _FRAXTAL.diag.cacheListAssets(w);}
function DIAG_FRAXTAL_TOKEN_PRICE(t){return _FRAXTAL.diag.tokenPrice(t);}
function DIAG_FRAXTAL_NATIVE_PRICE(){return _FRAXTAL.diag.nativePrice();}
function DIAG_FRAXTAL_WALLET(w){return _FRAXTAL.diag.walletFull(w);}
function DIAG_FRAXTAL_CACHE_STATS(){return _FRAXTAL.diag.cacheStats();}
function DIAG_FRAXTAL_CLEAR_CACHE(w,c){return _FRAXTAL.diag.clearCache(w,c);}
