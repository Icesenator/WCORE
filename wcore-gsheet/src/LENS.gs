/**
 * LENS.gs - Lens Chain (v4.12.7)
 * ChainFactory pattern with explicit function declarations
 * 
 * Lens Chain is a Layer 2 built on ZKsync stack with Avail DA.
 * Native gas token is GHO (Aave stablecoin, pegged to USD).
 * Chain ID: 232
 * Explorer: https://explorer.lens.xyz
 * 
 * NOTE: GHO is a USD stablecoin — pricing handled via stablecoin fast-path + DefiLlama/CoinGecko fallback.
 * NOTE: DEX_SLUG/GT_NETWORK may need updating once DexScreener/GeckoTerminal add Lens chain support.
 */

var _LENS = ChainFactory.createEvmChain("LENS", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: [
   "https://rpc.lens.xyz",
   "https://lens.drpc.org",
   "https://232.rpc.thirdweb.com"
 ]},
 CHAIN: {
   NAME: "Lens",
   CHAIN_ID: 232,
   NATIVE_SYMBOL: "GHO",
   NATIVE_NAME: "GHO",
   NATIVE_DECIMALS: 18,
   NATIVE_LLAMA_ID: "coingecko:gho",
   NATIVE_GECKO_ID: "gho",
   DEX_SLUG: "lens",
   GT_NETWORK: "lens"
 },
 LLAMA_ID_MAP: { "GHO":"coingecko:gho", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WETH":"coingecko:weth", "WBTC":"coingecko:wrapped-bitcoin" }
});

// Main functions
function GET_WALLET_ASSETS_LENS(a,r,t,f,g){return _LENS.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_LENS(a){return _LENS.getCachedWalletAssets(a);}
function LENS_REFRESH_STATUS(a,r,t,f,g){return _LENS.getRefreshStatus(a,r,t,f,g);}
function LENS_STATS(a,t){return _LENS.getStats(a,t);}

// Diagnostic functions
function DIAG_LENS_TOKEN(w,t,r){return _LENS.diag.tokenBalance(w,t,r);}
function DIAG_LENS_COMPARE_RPCS(w,t){return _LENS.diag.compareRpcs(w,t);}
function DIAG_LENS_CHECK_ERC20(t){return _LENS.diag.checkErc20(t);}
function DIAG_LENS_RPC_HEALTH(){return _LENS.diag.rpcHealth();}
function DIAG_LENS_NATIVE_BALANCE(w){return _LENS.diag.nativeBalance(w);}
function DIAG_LENS_CACHE(w){return _LENS.diag.cacheInspect(w);}
function DIAG_LENS_CACHE_TOKEN(w,t){return _LENS.diag.cacheFindToken(w,t);}
function DIAG_LENS_CACHE_ASSETS(w){return _LENS.diag.cacheListAssets(w);}
function DIAG_LENS_TOKEN_PRICE(t){return _LENS.diag.tokenPrice(t);}
function DIAG_LENS_NATIVE_PRICE(){return _LENS.diag.nativePrice();}
function DIAG_LENS_WALLET(w){return _LENS.diag.walletFull(w);}
function DIAG_LENS_CACHE_STATS(){return _LENS.diag.cacheStats();}
function DIAG_LENS_CLEAR_CACHE(w,c){return _LENS.diag.clearCache(w,c);}
