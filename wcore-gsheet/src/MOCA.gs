/** MOCA.gs - Moca Chain Mainnet (2288), v1.0.0. RPC et prix verifies 2026-10-10. */
var _MOCA = ChainFactory.createEvmChain("MOCA", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.mocachain.org", "https://moca.drpc.org"] },
 ACTIVITY_EXPLORER: { TYPE: "blockscout", BASE_URL: "https://scan.mocachain.org", TX_PATH: "/api/v2/addresses/{address}/transactions" },
 CHAIN: {
  NAME: "Moca Chain", CHAIN_ID: 2288,
  NATIVE_SYMBOL: "MOCA", NATIVE_NAME: "MOCA", NATIVE_DECIMALS: 18,
  NATIVE_LLAMA_ID: "coingecko:mocaverse", NATIVE_GECKO_ID: "mocaverse"
 },
 LLAMA_ID_MAP: { "MOCA": "coingecko:mocaverse" }
});
// Main functions
function GET_WALLET_ASSETS_MOCA(a,r,t,f,g){return _MOCA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_MOCA(a){return _MOCA.getCachedWalletAssets(a);}
function MOCA_REFRESH_STATUS(a,r,t,f,g){return _MOCA.getRefreshStatus(a,r,t,f,g);}
function MOCA_STATS(a,t){return _MOCA.getStats(a,t);}

// Diagnostic functions
function DIAG_MOCA_TOKEN(w,t,r){return _MOCA.diag.tokenBalance(w,t,r);}
function DIAG_MOCA_COMPARE_RPCS(w,t){return _MOCA.diag.compareRpcs(w,t);}
function DIAG_MOCA_CHECK_ERC20(t){return _MOCA.diag.checkErc20(t);}
function DIAG_MOCA_RPC_HEALTH(){return _MOCA.diag.rpcHealth();}
function DIAG_MOCA_NATIVE_BALANCE(w){return _MOCA.diag.nativeBalance(w);}
function DIAG_MOCA_CACHE(w){return _MOCA.diag.cacheInspect(w);}
function DIAG_MOCA_CACHE_TOKEN(w,t){return _MOCA.diag.cacheFindToken(w,t);}
function DIAG_MOCA_CACHE_ASSETS(w){return _MOCA.diag.cacheListAssets(w);}
function DIAG_MOCA_TOKEN_PRICE(t){return _MOCA.diag.tokenPrice(t);}
function DIAG_MOCA_NATIVE_PRICE(){return _MOCA.diag.nativePrice();}
function DIAG_MOCA_WALLET(w){return _MOCA.diag.walletFull(w);}
function DIAG_MOCA_CACHE_STATS(){return _MOCA.diag.cacheStats();}
function DIAG_MOCA_CLEAR_CACHE(w,c){return _MOCA.diag.clearCache(w,c);}
