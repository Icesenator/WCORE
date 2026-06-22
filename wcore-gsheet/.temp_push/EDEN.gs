/**
 * EDEN.gs - Eden (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _EDEN = ChainFactory.createEvmChain("EDEN", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://714.rpc.thirdweb.com",
      "https://rpc.eden.gateway.fm"
    ]
  },
  CHAIN: {
    NAME: "Eden",
    CHAIN_ID: 714,
    NATIVE_SYMBOL: "EDEN",
    NATIVE_NAME: "Eden Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: null,
    NATIVE_GECKO_ID: null,
    DEX_SLUG: "eden",
    GT_NETWORK: "eden"
  },
  LLAMA_ID_MAP: {}
});

function GET_WALLET_ASSETS_EDEN(a,r,t,f,g){return _EDEN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_EDEN(a){return _EDEN.getCachedWalletAssets(a);}
function EDEN_REFRESH_STATUS(a,r,t,f,g){return _EDEN.getRefreshStatus(a,r,t,f,g);}
function EDEN_STATS(a,t){return _EDEN.getStats(a,t);}
