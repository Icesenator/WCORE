/**
 * ETHERLINK.gs - Etherlink (v4.9.6)
 * ChainFactory pattern with explicit function declarations
 *
 * v4.9.6 - Added 1 RPC endpoint for redundancy (was single endpoint)
 */

var _ETHERLINK = ChainFactory.createEvmChain("ETHERLINK", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: [
  "https://node.mainnet.etherlink.com",
  "https://rpc.ankr.com/etherlink_mainnet"
 ] },
 CHAIN: {
 NAME: "Etherlink",
 CHAIN_ID: 42793,
 NATIVE_SYMBOL: "XTZ",
 NATIVE_NAME: "Tezos",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:tezos",
 NATIVE_GECKO_ID: "tezos",
 DEX_SLUG: "etherlink",
 GT_NETWORK: "etherlink"
 },
 LLAMA_ID_MAP: { "XTZ":"coingecko:tezos" }
});

// Main functions
function GET_WALLET_ASSETS_ETHERLINK(a,r,t,f,g){return _ETHERLINK.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ETHERLINK(a){return _ETHERLINK.getCachedWalletAssets(a);}
function ETHERLINK_REFRESH_STATUS(a,r,t,f,g){return _ETHERLINK.getRefreshStatus(a,r,t,f,g);}
function ETHERLINK_STATS(a,t){return _ETHERLINK.getStats(a,t);}

// Diagnostic functions
function DIAG_ETHERLINK_TOKEN(w,t,r){return _ETHERLINK.diag.tokenBalance(w,t,r);}
function DIAG_ETHERLINK_COMPARE_RPCS(w,t){return _ETHERLINK.diag.compareRpcs(w,t);}
function DIAG_ETHERLINK_CHECK_ERC20(t){return _ETHERLINK.diag.checkErc20(t);}
function DIAG_ETHERLINK_RPC_HEALTH(){return _ETHERLINK.diag.rpcHealth();}
function DIAG_ETHERLINK_NATIVE_BALANCE(w){return _ETHERLINK.diag.nativeBalance(w);}
function DIAG_ETHERLINK_CACHE(w){return _ETHERLINK.diag.cacheInspect(w);}
function DIAG_ETHERLINK_CACHE_TOKEN(w,t){return _ETHERLINK.diag.cacheFindToken(w,t);}
function DIAG_ETHERLINK_CACHE_ASSETS(w){return _ETHERLINK.diag.cacheListAssets(w);}
function DIAG_ETHERLINK_TOKEN_PRICE(t){return _ETHERLINK.diag.tokenPrice(t);}
function DIAG_ETHERLINK_NATIVE_PRICE(){return _ETHERLINK.diag.nativePrice();}
function DIAG_ETHERLINK_WALLET(w){return _ETHERLINK.diag.walletFull(w);}
function DIAG_ETHERLINK_CACHE_STATS(){return _ETHERLINK.diag.cacheStats();}
function DIAG_ETHERLINK_CLEAR_CACHE(w,c){return _ETHERLINK.diag.clearCache(w,c);}
