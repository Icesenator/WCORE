/**
 * DUCKCHAIN.gs - DuckChain (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _DUCKCHAIN = ChainFactory.createEvmChain("DUCKCHAIN", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.duckchain.io", "https://rpc-hk.duckchain.io"] },
 CHAIN: {
 NAME: "DuckChain",
 CHAIN_ID: 5545,
  NATIVE_SYMBOL: "GRAM",
  NATIVE_NAME: "Gram",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:the-open-network",
 NATIVE_GECKO_ID: "the-open-network",
 DEX_SLUG: "duckchain",
 GT_NETWORK: "duckchain"
 },
  LLAMA_ID_MAP: { "DAI":"coingecko:dai", "GRAM":"coingecko:the-open-network", "TON":"coingecko:the-open-network", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_DUCKCHAIN(a,r,t,f,g){return _DUCKCHAIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_DUCKCHAIN(a){return _DUCKCHAIN.getCachedWalletAssets(a);}
function DUCKCHAIN_REFRESH_STATUS(a,r,t,f,g){return _DUCKCHAIN.getRefreshStatus(a,r,t,f,g);}
function DUCKCHAIN_STATS(a,t){return _DUCKCHAIN.getStats(a,t);}

// Diagnostic functions
function DIAG_DUCKCHAIN_TOKEN(w,t,r){return _DUCKCHAIN.diag.tokenBalance(w,t,r);}
function DIAG_DUCKCHAIN_COMPARE_RPCS(w,t){return _DUCKCHAIN.diag.compareRpcs(w,t);}
function DIAG_DUCKCHAIN_CHECK_ERC20(t){return _DUCKCHAIN.diag.checkErc20(t);}
function DIAG_DUCKCHAIN_RPC_HEALTH(){return _DUCKCHAIN.diag.rpcHealth();}
function DIAG_DUCKCHAIN_NATIVE_BALANCE(w){return _DUCKCHAIN.diag.nativeBalance(w);}
function DIAG_DUCKCHAIN_CACHE(w){return _DUCKCHAIN.diag.cacheInspect(w);}
function DIAG_DUCKCHAIN_CACHE_TOKEN(w,t){return _DUCKCHAIN.diag.cacheFindToken(w,t);}
function DIAG_DUCKCHAIN_CACHE_ASSETS(w){return _DUCKCHAIN.diag.cacheListAssets(w);}
function DIAG_DUCKCHAIN_TOKEN_PRICE(t){return _DUCKCHAIN.diag.tokenPrice(t);}
function DIAG_DUCKCHAIN_NATIVE_PRICE(){return _DUCKCHAIN.diag.nativePrice();}
function DIAG_DUCKCHAIN_WALLET(w){return _DUCKCHAIN.diag.walletFull(w);}
function DIAG_DUCKCHAIN_CACHE_STATS(){return _DUCKCHAIN.diag.cacheStats();}
function DIAG_DUCKCHAIN_CLEAR_CACHE(w,c){return _DUCKCHAIN.diag.clearCache(w,c);}
