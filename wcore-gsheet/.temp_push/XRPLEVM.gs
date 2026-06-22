/**
 * XRPLEVM.gs - XRPL EVM (v4.15.2)
 * ChainFactory pattern with explicit function declarations
 * v4.15.2 FIX: CHAIN_ID 1440002 was Devnet, mainnet is 1440000
 * v4.9.6 - Added 2 RPC endpoints for redundancy (was single endpoint)
 */

var _XRPLEVM = ChainFactory.createEvmChain("XRPLEVM", {
 CACHE_VERSION: 64,
 RPC: { ENDPOINTS: [
  "https://rpc.xrplevm.org",
  "https://xrpl.drpc.org",
  "https://evmrpc.xrp.nodestake.org"
 ] },
 CHAIN: {
 NAME: "XRPL EVM",
 CHAIN_ID: 1440000,
 NATIVE_SYMBOL: "XRP",
 NATIVE_NAME: "XRP",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ripple",
 NATIVE_GECKO_ID: "ripple",
 DEX_SLUG: "xrpl-evm",
 GT_NETWORK: "xrpl-evm"
 },
 LLAMA_ID_MAP: { "XRP":"coingecko:ripple" }
});

// Main functions
function GET_WALLET_ASSETS_XRPLEVM(a,r,t,f,g){return _XRPLEVM.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_XRPLEVM(a){return _XRPLEVM.getCachedWalletAssets(a);}
function XRPLEVM_REFRESH_STATUS(a,r,t,f,g){return _XRPLEVM.getRefreshStatus(a,r,t,f,g);}
function XRPLEVM_STATS(a,t){return _XRPLEVM.getStats(a,t);}

// Diagnostic functions
function DIAG_XRPLEVM_TOKEN(w,t,r){return _XRPLEVM.diag.tokenBalance(w,t,r);}
function DIAG_XRPLEVM_COMPARE_RPCS(w,t){return _XRPLEVM.diag.compareRpcs(w,t);}
function DIAG_XRPLEVM_CHECK_ERC20(t){return _XRPLEVM.diag.checkErc20(t);}
function DIAG_XRPLEVM_RPC_HEALTH(){return _XRPLEVM.diag.rpcHealth();}
function DIAG_XRPLEVM_NATIVE_BALANCE(w){return _XRPLEVM.diag.nativeBalance(w);}
function DIAG_XRPLEVM_CACHE(w){return _XRPLEVM.diag.cacheInspect(w);}
function DIAG_XRPLEVM_CACHE_TOKEN(w,t){return _XRPLEVM.diag.cacheFindToken(w,t);}
function DIAG_XRPLEVM_CACHE_ASSETS(w){return _XRPLEVM.diag.cacheListAssets(w);}
function DIAG_XRPLEVM_TOKEN_PRICE(t){return _XRPLEVM.diag.tokenPrice(t);}
function DIAG_XRPLEVM_NATIVE_PRICE(){return _XRPLEVM.diag.nativePrice();}
function DIAG_XRPLEVM_WALLET(w){return _XRPLEVM.diag.walletFull(w);}
function DIAG_XRPLEVM_CACHE_STATS(){return _XRPLEVM.diag.cacheStats();}
function DIAG_XRPLEVM_CLEAR_CACHE(w,c){return _XRPLEVM.diag.clearCache(w,c);}
