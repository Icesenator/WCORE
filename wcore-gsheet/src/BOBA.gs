/**
 * BOBA.gs - Boba (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _BOBA = ChainFactory.createEvmChain("BOBA", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://mainnet.boba.network", "https://boba-ethereum.drpc.org", "https://1rpc.io/boba/eth", "https://gateway.tenderly.co/public/boba-ethereum"] }, // 1RPC, Tenderly
 CHAIN: {
 NAME: "Boba",
 CHAIN_ID: 288,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "boba",
 GT_NETWORK: "boba"
 },
 LLAMA_ID_MAP: { "BOBA":"coingecko:boba-network", "ETH":"coingecko:ethereum" }
});

// Main functions
function GET_WALLET_ASSETS_BOBA(a,r,t,f,g){return _BOBA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_BOBA(a){return _BOBA.getCachedWalletAssets(a);}
function BOBA_REFRESH_STATUS(a,r,t,f,g){return _BOBA.getRefreshStatus(a,r,t,f,g);}
function BOBA_STATS(a,t){return _BOBA.getStats(a,t);}

// Diagnostic functions
function DIAG_BOBA_TOKEN(w,t,r){return _BOBA.diag.tokenBalance(w,t,r);}
function DIAG_BOBA_COMPARE_RPCS(w,t){return _BOBA.diag.compareRpcs(w,t);}
function DIAG_BOBA_CHECK_ERC20(t){return _BOBA.diag.checkErc20(t);}
function DIAG_BOBA_RPC_HEALTH(){return _BOBA.diag.rpcHealth();}
function DIAG_BOBA_NATIVE_BALANCE(w){return _BOBA.diag.nativeBalance(w);}
function DIAG_BOBA_CACHE(w){return _BOBA.diag.cacheInspect(w);}
function DIAG_BOBA_CACHE_TOKEN(w,t){return _BOBA.diag.cacheFindToken(w,t);}
function DIAG_BOBA_CACHE_ASSETS(w){return _BOBA.diag.cacheListAssets(w);}
function DIAG_BOBA_TOKEN_PRICE(t){return _BOBA.diag.tokenPrice(t);}
function DIAG_BOBA_NATIVE_PRICE(){return _BOBA.diag.nativePrice();}
function DIAG_BOBA_WALLET(w){return _BOBA.diag.walletFull(w);}
function DIAG_BOBA_CACHE_STATS(){return _BOBA.diag.cacheStats();}
function DIAG_BOBA_CLEAR_CACHE(w,c){return _BOBA.diag.clearCache(w,c);}
