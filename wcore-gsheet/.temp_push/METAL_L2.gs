/**
 * METAL_L2.gs - Metal L2 (v4.9.6)
 * ChainFactory pattern with explicit function declarations
 *
 * v4.9.6 - Added 1 RPC endpoint for redundancy (was single endpoint)
 */

var _METAL_L2 = ChainFactory.createEvmChain("METAL_L2", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: [
  "https://rpc.metall2.com",
  "https://metall2.drpc.org"
 ] },
 CHAIN: {
 NAME: "Metal L2",
 CHAIN_ID: 1750,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ethereum",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "metal",
 GT_NETWORK: "metal-l2"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "ETH":"coingecko:ethereum", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_METAL_L2(a,r,t,f,g){return _METAL_L2.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_METAL_L2(a){return _METAL_L2.getCachedWalletAssets(a);}
function METAL_L2_REFRESH_STATUS(a,r,t,f,g){return _METAL_L2.getRefreshStatus(a,r,t,f,g);}
function METAL_L2_STATS(a,t){return _METAL_L2.getStats(a,t);}

// Diagnostic functions
function DIAG_METAL_L2_TOKEN(w,t,r){return _METAL_L2.diag.tokenBalance(w,t,r);}
function DIAG_METAL_L2_COMPARE_RPCS(w,t){return _METAL_L2.diag.compareRpcs(w,t);}
function DIAG_METAL_L2_CHECK_ERC20(t){return _METAL_L2.diag.checkErc20(t);}
function DIAG_METAL_L2_RPC_HEALTH(){return _METAL_L2.diag.rpcHealth();}
function DIAG_METAL_L2_NATIVE_BALANCE(w){return _METAL_L2.diag.nativeBalance(w);}
function DIAG_METAL_L2_CACHE(w){return _METAL_L2.diag.cacheInspect(w);}
function DIAG_METAL_L2_CACHE_TOKEN(w,t){return _METAL_L2.diag.cacheFindToken(w,t);}
function DIAG_METAL_L2_CACHE_ASSETS(w){return _METAL_L2.diag.cacheListAssets(w);}
function DIAG_METAL_L2_TOKEN_PRICE(t){return _METAL_L2.diag.tokenPrice(t);}
function DIAG_METAL_L2_NATIVE_PRICE(){return _METAL_L2.diag.nativePrice();}
function DIAG_METAL_L2_WALLET(w){return _METAL_L2.diag.walletFull(w);}
function DIAG_METAL_L2_CACHE_STATS(){return _METAL_L2.diag.cacheStats();}
function DIAG_METAL_L2_CLEAR_CACHE(w,c){return _METAL_L2.diag.clearCache(w,c);}
