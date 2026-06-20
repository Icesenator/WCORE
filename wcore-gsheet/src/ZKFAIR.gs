/**
 * ZKFAIR.gs - zkFair (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _ZKFAIR = ChainFactory.createEvmChain("ZKFAIR", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://42766.rpc.thirdweb.com",
      "https://rpc.zkfair.io"
    ]
  },
  CHAIN: {
    NAME: "zkFair",
    CHAIN_ID: 42766,
    NATIVE_SYMBOL: "ZKF",
    NATIVE_NAME: "zkFair Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:zkfair",
    NATIVE_GECKO_ID: "zkfair-token",
    DEX_SLUG: "zkfair",
    GT_NETWORK: "zkfair"
  },
  LLAMA_ID_MAP: {
    ZKF: "coingecko:zkfair"
  }
});

function GET_WALLET_ASSETS_ZKFAIR(a,r,t,f,g){return _ZKFAIR.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ZKFAIR(a){return _ZKFAIR.getCachedWalletAssets(a);}
function ZKFAIR_REFRESH_STATUS(a,r,t,f,g){return _ZKFAIR.getRefreshStatus(a,r,t,f,g);}
function ZKFAIR_STATS(a,t){return _ZKFAIR.getStats(a,t);}
