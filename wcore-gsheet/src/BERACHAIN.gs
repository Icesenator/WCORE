/**
 * BERACHAIN.gs - Berachain (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _BERACHAIN = ChainFactory.createEvmChain("BERACHAIN", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.berachain.com", "https://berachain.drpc.org", "https://berachain-rpc.publicnode.com"] }, // PublicNode
 CHAIN: {
 NAME: "Berachain",
 CHAIN_ID: 80094,
 NATIVE_SYMBOL: "BERA",
 NATIVE_NAME: "Bera",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:berachain-bera",
 NATIVE_GECKO_ID: "berachain-bera",
 DEX_SLUG: "berachain",
 GT_NETWORK: "berachain"
 },
 LLAMA_ID_MAP: { "BERA":"coingecko:berachain-bera" }
});

// Main functions
function GET_WALLET_ASSETS_BERACHAIN(a,r,t,f,g){return _BERACHAIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_BERACHAIN(a){return _BERACHAIN.getCachedWalletAssets(a);}
function BERACHAIN_REFRESH_STATUS(a,r,t,f,g){return _BERACHAIN.getRefreshStatus(a,r,t,f,g);}
function BERACHAIN_STATS(a,t){return _BERACHAIN.getStats(a,t);}

// Diagnostic functions
function DIAG_BERACHAIN_TOKEN(w,t,r){return _BERACHAIN.diag.tokenBalance(w,t,r);}
function DIAG_BERACHAIN_COMPARE_RPCS(w,t){return _BERACHAIN.diag.compareRpcs(w,t);}
function DIAG_BERACHAIN_CHECK_ERC20(t){return _BERACHAIN.diag.checkErc20(t);}
function DIAG_BERACHAIN_RPC_HEALTH(){return _BERACHAIN.diag.rpcHealth();}
function DIAG_BERACHAIN_NATIVE_BALANCE(w){return _BERACHAIN.diag.nativeBalance(w);}
function DIAG_BERACHAIN_CACHE(w){return _BERACHAIN.diag.cacheInspect(w);}
function DIAG_BERACHAIN_CACHE_TOKEN(w,t){return _BERACHAIN.diag.cacheFindToken(w,t);}
function DIAG_BERACHAIN_CACHE_ASSETS(w){return _BERACHAIN.diag.cacheListAssets(w);}
function DIAG_BERACHAIN_TOKEN_PRICE(t){return _BERACHAIN.diag.tokenPrice(t);}
function DIAG_BERACHAIN_NATIVE_PRICE(){return _BERACHAIN.diag.nativePrice();}
function DIAG_BERACHAIN_WALLET(w){return _BERACHAIN.diag.walletFull(w);}
function DIAG_BERACHAIN_CACHE_STATS(){return _BERACHAIN.diag.cacheStats();}
function DIAG_BERACHAIN_CLEAR_CACHE(w,c){return _BERACHAIN.diag.clearCache(w,c);}
