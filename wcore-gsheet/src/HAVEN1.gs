/**
 * HAVEN1.gs - Haven1 (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _HAVEN1 = ChainFactory.createEvmChain("HAVEN1", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://8811.rpc.thirdweb.com",
      "https://rpc.haven1.org"
    ]
  },
  CHAIN: {
    NAME: "Haven1",
    CHAIN_ID: 8811,
    NATIVE_SYMBOL: "H1",
    NATIVE_NAME: "Haven1 Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:haven1",
    NATIVE_GECKO_ID: "haven1",
    DEX_SLUG: "haven1",
    GT_NETWORK: "haven1"
  },
  LLAMA_ID_MAP: {
    H1: "coingecko:haven1"
  },
  FLAGS: {
    DISABLE_CHAIN: true
  }
});

function GET_WALLET_ASSETS_HAVEN1(a,r,t,f,g){return _HAVEN1.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_HAVEN1(a){return _HAVEN1.getCachedWalletAssets(a);}
function HAVEN1_REFRESH_STATUS(a,r,t,f,g){return _HAVEN1.getRefreshStatus(a,r,t,f,g);}
function HAVEN1_STATS(a,t){return _HAVEN1.getStats(a,t);}
