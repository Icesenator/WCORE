/**
 * KAIA.gs - Kaia (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _KAIA = ChainFactory.createEvmChain("KAIA", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://public-en.node.kaia.io", "https://kaia.blockpi.network/v1/rpc/public", "https://klaytn.api.onfinality.io/public", "https://klaytn.drpc.org"] },
 CHAIN: {
 NAME: "Kaia",
 CHAIN_ID: 8217,
 NATIVE_SYMBOL: "KAIA",
 NATIVE_NAME: "Kaia",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:kaia",
 NATIVE_GECKO_ID: "kaia",
 DEX_SLUG: "kaia",
 GT_NETWORK: "kaia"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "KAIA":"coingecko:kaia", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WETH":"coingecko:weth", "WKAIA":"coingecko:wrapped-klay" }
});

// Main functions
function GET_WALLET_ASSETS_KAIA(a,r,t,f,g){return _KAIA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_KAIA(a){return _KAIA.getCachedWalletAssets(a);}
function KAIA_REFRESH_STATUS(a,r,t,f,g){return _KAIA.getRefreshStatus(a,r,t,f,g);}
function KAIA_STATS(a,t){return _KAIA.getStats(a,t);}

// Diagnostic functions
function DIAG_KAIA_TOKEN(w,t,r){return _KAIA.diag.tokenBalance(w,t,r);}
function DIAG_KAIA_COMPARE_RPCS(w,t){return _KAIA.diag.compareRpcs(w,t);}
function DIAG_KAIA_CHECK_ERC20(t){return _KAIA.diag.checkErc20(t);}
function DIAG_KAIA_RPC_HEALTH(){return _KAIA.diag.rpcHealth();}
function DIAG_KAIA_NATIVE_BALANCE(w){return _KAIA.diag.nativeBalance(w);}
function DIAG_KAIA_CACHE(w){return _KAIA.diag.cacheInspect(w);}
function DIAG_KAIA_CACHE_TOKEN(w,t){return _KAIA.diag.cacheFindToken(w,t);}
function DIAG_KAIA_CACHE_ASSETS(w){return _KAIA.diag.cacheListAssets(w);}
function DIAG_KAIA_TOKEN_PRICE(t){return _KAIA.diag.tokenPrice(t);}
function DIAG_KAIA_NATIVE_PRICE(){return _KAIA.diag.nativePrice();}
function DIAG_KAIA_WALLET(w){return _KAIA.diag.walletFull(w);}
function DIAG_KAIA_CACHE_STATS(){return _KAIA.diag.cacheStats();}
function DIAG_KAIA_CLEAR_CACHE(w,c){return _KAIA.diag.clearCache(w,c);}
