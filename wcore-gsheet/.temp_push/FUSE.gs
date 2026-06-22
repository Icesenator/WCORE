/**
 * FUSE.gs - Fuse (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _FUSE = ChainFactory.createEvmChain("FUSE", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.fuse.io", "https://fuse.drpc.org", "https://fuse-mainnet.chainstacklabs.com"] },
 CHAIN: {
 NAME: "Fuse",
 CHAIN_ID: 122,
 NATIVE_SYMBOL: "FUSE",
 NATIVE_NAME: "Fuse",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:fuse-network-token",
 NATIVE_GECKO_ID: "fuse-network-token",
 DEX_SLUG: "fuse",
 GT_NETWORK: "fuse"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "FUSE":"coingecko:fuse-network-token", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth", "WFUSE":"coingecko:fuse-network-token" }
});

// Main functions
function GET_WALLET_ASSETS_FUSE(a,r,t,f,g){return _FUSE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_FUSE(a){return _FUSE.getCachedWalletAssets(a);}
function FUSE_REFRESH_STATUS(a,r,t,f,g){return _FUSE.getRefreshStatus(a,r,t,f,g);}
function FUSE_STATS(a,t){return _FUSE.getStats(a,t);}

// Diagnostic functions
function DIAG_FUSE_TOKEN(w,t,r){return _FUSE.diag.tokenBalance(w,t,r);}
function DIAG_FUSE_COMPARE_RPCS(w,t){return _FUSE.diag.compareRpcs(w,t);}
function DIAG_FUSE_CHECK_ERC20(t){return _FUSE.diag.checkErc20(t);}
function DIAG_FUSE_RPC_HEALTH(){return _FUSE.diag.rpcHealth();}
function DIAG_FUSE_NATIVE_BALANCE(w){return _FUSE.diag.nativeBalance(w);}
function DIAG_FUSE_CACHE(w){return _FUSE.diag.cacheInspect(w);}
function DIAG_FUSE_CACHE_TOKEN(w,t){return _FUSE.diag.cacheFindToken(w,t);}
function DIAG_FUSE_CACHE_ASSETS(w){return _FUSE.diag.cacheListAssets(w);}
function DIAG_FUSE_TOKEN_PRICE(t){return _FUSE.diag.tokenPrice(t);}
function DIAG_FUSE_NATIVE_PRICE(){return _FUSE.diag.nativePrice();}
function DIAG_FUSE_WALLET(w){return _FUSE.diag.walletFull(w);}
function DIAG_FUSE_CACHE_STATS(){return _FUSE.diag.cacheStats();}
function DIAG_FUSE_CLEAR_CACHE(w,c){return _FUSE.diag.clearCache(w,c);}
