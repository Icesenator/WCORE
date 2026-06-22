/**
 * AWAJI.gs - Awaji (v4.15.51)
 * Phase 3 port from wcore-web chain config.
 */

var _AWAJI = ChainFactory.createEvmChain("AWAJI", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://6497.rpc.thirdweb.com",
      "https://rpc.awaji.mizuhiki.io"
    ]
  },
  CHAIN: {
    NAME: "Awaji",
    CHAIN_ID: 6497,
    NATIVE_SYMBOL: "AWAJI",
    NATIVE_NAME: "Awaji Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: null,
    NATIVE_GECKO_ID: null,
    DEX_SLUG: "awaji",
    GT_NETWORK: "awaji"
  },
  LLAMA_ID_MAP: {}
});

function GET_WALLET_ASSETS_AWAJI(a,r,t,f,g){return _AWAJI.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_AWAJI(a){return _AWAJI.getCachedWalletAssets(a);}
function AWAJI_REFRESH_STATUS(a,r,t,f,g){return _AWAJI.getRefreshStatus(a,r,t,f,g);}
function AWAJI_STATS(a,t){return _AWAJI.getStats(a,t);}
