/**
 * BOB.gs - BOB (v4.9.6)
 * ChainFactory pattern with explicit function declarations
 *
 * v4.9.6 - Added 2 RPC endpoints for redundancy (was single endpoint)
 */

var _BOB = ChainFactory.createEvmChain("BOB", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: [
  "https://rpc.gobob.xyz/",
  "https://bob.drpc.org",
  "https://bob-mainnet.public.blastapi.io"
 ] },
 CHAIN: {
 NAME: "BOB",
 CHAIN_ID: 60808,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ethereum",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "bob",
 GT_NETWORK: "bob-network"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum" }
});

// Main functions
function GET_WALLET_ASSETS_BOB(a,r,t,f,g){return _BOB.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_BOB(a){return _BOB.getCachedWalletAssets(a);}
function BOB_REFRESH_STATUS(a,r,t,f,g){return _BOB.getRefreshStatus(a,r,t,f,g);}
function BOB_STATS(a,t){return _BOB.getStats(a,t);}

// Diagnostic functions
function DIAG_BOB_TOKEN(w,t,r){return _BOB.diag.tokenBalance(w,t,r);}
function DIAG_BOB_COMPARE_RPCS(w,t){return _BOB.diag.compareRpcs(w,t);}
function DIAG_BOB_CHECK_ERC20(t){return _BOB.diag.checkErc20(t);}
function DIAG_BOB_RPC_HEALTH(){return _BOB.diag.rpcHealth();}
function DIAG_BOB_NATIVE_BALANCE(w){return _BOB.diag.nativeBalance(w);}
function DIAG_BOB_CACHE(w){return _BOB.diag.cacheInspect(w);}
function DIAG_BOB_CACHE_TOKEN(w,t){return _BOB.diag.cacheFindToken(w,t);}
function DIAG_BOB_CACHE_ASSETS(w){return _BOB.diag.cacheListAssets(w);}
function DIAG_BOB_TOKEN_PRICE(t){return _BOB.diag.tokenPrice(t);}
function DIAG_BOB_NATIVE_PRICE(){return _BOB.diag.nativePrice();}
function DIAG_BOB_WALLET(w){return _BOB.diag.walletFull(w);}
function DIAG_BOB_CACHE_STATS(){return _BOB.diag.cacheStats();}
function DIAG_BOB_CLEAR_CACHE(w,c){return _BOB.diag.clearCache(w,c);}
