/**
 * AURORA.gs - Aurora (v4.9.6)
 * ChainFactory pattern with explicit function declarations
 *
 * v4.9.6 - Added 2 RPC endpoints for redundancy (was single endpoint)
 */

var _AURORA = ChainFactory.createEvmChain("AURORA", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: [
  "https://mainnet.aurora.dev",
  "https://1rpc.io/aurora",
  "https://aurora.drpc.org"
 ] },
 CHAIN: {
 NAME: "Aurora",
 CHAIN_ID: 1313161554,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "aurora",
 GT_NETWORK: "aurora"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "ETH":"coingecko:ethereum", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_AURORA(a,r,t,f,g){return _AURORA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_AURORA(a){return _AURORA.getCachedWalletAssets(a);}
function AURORA_REFRESH_STATUS(a,r,t,f,g){return _AURORA.getRefreshStatus(a,r,t,f,g);}
function AURORA_STATS(a,t){return _AURORA.getStats(a,t);}

// Diagnostic functions
function DIAG_AURORA_TOKEN(w,t,r){return _AURORA.diag.tokenBalance(w,t,r);}
function DIAG_AURORA_COMPARE_RPCS(w,t){return _AURORA.diag.compareRpcs(w,t);}
function DIAG_AURORA_CHECK_ERC20(t){return _AURORA.diag.checkErc20(t);}
function DIAG_AURORA_RPC_HEALTH(){return _AURORA.diag.rpcHealth();}
function DIAG_AURORA_NATIVE_BALANCE(w){return _AURORA.diag.nativeBalance(w);}
function DIAG_AURORA_CACHE(w){return _AURORA.diag.cacheInspect(w);}
function DIAG_AURORA_CACHE_TOKEN(w,t){return _AURORA.diag.cacheFindToken(w,t);}
function DIAG_AURORA_CACHE_ASSETS(w){return _AURORA.diag.cacheListAssets(w);}
function DIAG_AURORA_TOKEN_PRICE(t){return _AURORA.diag.tokenPrice(t);}
function DIAG_AURORA_NATIVE_PRICE(){return _AURORA.diag.nativePrice();}
function DIAG_AURORA_WALLET(w){return _AURORA.diag.walletFull(w);}
function DIAG_AURORA_CACHE_STATS(){return _AURORA.diag.cacheStats();}
function DIAG_AURORA_CLEAR_CACHE(w,c){return _AURORA.diag.clearCache(w,c);}
