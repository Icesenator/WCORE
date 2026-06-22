/**
 * CROSSBELL.gs - Crossbell (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _CROSSBELL = ChainFactory.createEvmChain("CROSSBELL", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://3737.rpc.thirdweb.com",
      "https://rpc.crossbell.io"
    ]
  },
  CHAIN: {
    NAME: "Crossbell",
    CHAIN_ID: 3737,
    NATIVE_SYMBOL: "CSB",
    NATIVE_NAME: "Crossbell Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:crossbell",
    NATIVE_GECKO_ID: "crossbell",
    DEX_SLUG: "crossbell",
    GT_NETWORK: "crossbell"
  },
  LLAMA_ID_MAP: {
    CSB: "coingecko:crossbell"
  }
});

function GET_WALLET_ASSETS_CROSSBELL(a,r,t,f,g){return _CROSSBELL.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_CROSSBELL(a){return _CROSSBELL.getCachedWalletAssets(a);}
function CROSSBELL_REFRESH_STATUS(a,r,t,f,g){return _CROSSBELL.getRefreshStatus(a,r,t,f,g);}
function CROSSBELL_STATS(a,t){return _CROSSBELL.getStats(a,t);}
