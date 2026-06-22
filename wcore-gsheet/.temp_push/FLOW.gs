/**
 * FLOW.gs - Flow EVM (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _FLOW = ChainFactory.createEvmChain("FLOW", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://mainnet.evm.nodes.onflow.org", "https://flow-mainnet.gateway.tatum.io"] }, // Tatum
 CHAIN: {
 NAME: "Flow EVM",
 CHAIN_ID: 747,
 NATIVE_SYMBOL: "FLOW",
 NATIVE_NAME: "Flow",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:flow",
 NATIVE_GECKO_ID: "flow",
 DEX_SLUG: "flow",
 GT_NETWORK: "flow-evm"
 },
 LLAMA_ID_MAP: { "FLOW":"coingecko:flow" }
});

// Main functions
function GET_WALLET_ASSETS_FLOW(a,r,t,f,g){return _FLOW.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_FLOW(a){return _FLOW.getCachedWalletAssets(a);}
function FLOW_REFRESH_STATUS(a,r,t,f,g){return _FLOW.getRefreshStatus(a,r,t,f,g);}
function FLOW_STATS(a,t){return _FLOW.getStats(a,t);}

// Diagnostic functions
function DIAG_FLOW_TOKEN(w,t,r){return _FLOW.diag.tokenBalance(w,t,r);}
function DIAG_FLOW_COMPARE_RPCS(w,t){return _FLOW.diag.compareRpcs(w,t);}
function DIAG_FLOW_CHECK_ERC20(t){return _FLOW.diag.checkErc20(t);}
function DIAG_FLOW_RPC_HEALTH(){return _FLOW.diag.rpcHealth();}
function DIAG_FLOW_NATIVE_BALANCE(w){return _FLOW.diag.nativeBalance(w);}
function DIAG_FLOW_CACHE(w){return _FLOW.diag.cacheInspect(w);}
function DIAG_FLOW_CACHE_TOKEN(w,t){return _FLOW.diag.cacheFindToken(w,t);}
function DIAG_FLOW_CACHE_ASSETS(w){return _FLOW.diag.cacheListAssets(w);}
function DIAG_FLOW_TOKEN_PRICE(t){return _FLOW.diag.tokenPrice(t);}
function DIAG_FLOW_NATIVE_PRICE(){return _FLOW.diag.nativePrice();}
function DIAG_FLOW_WALLET(w){return _FLOW.diag.walletFull(w);}
function DIAG_FLOW_CACHE_STATS(){return _FLOW.diag.cacheStats();}
function DIAG_FLOW_CLEAR_CACHE(w,c){return _FLOW.diag.clearCache(w,c);}
