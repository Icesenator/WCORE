/**
 * STEP_NETWORK.gs - Step Network (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _STEP_NETWORK = ChainFactory.createEvmChain("STEP_NETWORK", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://1234.rpc.thirdweb.com",
      "https://rpc.step.network"
    ]
  },
  CHAIN: {
    NAME: "Step Network",
    CHAIN_ID: 1234,
    NATIVE_SYMBOL: "FITFI",
    NATIVE_NAME: "Step Network Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:step-app-fit-to-earn",
    NATIVE_GECKO_ID: "step-app-fit-to-earn",
    DEX_SLUG: "step-network",
    GT_NETWORK: "step-network"
  },
  LLAMA_ID_MAP: {
    FITFI: "coingecko:step-app-fit-to-earn"
  }
});

function GET_WALLET_ASSETS_STEP_NETWORK(a,r,t,f,g){return _STEP_NETWORK.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_STEP_NETWORK(a){return _STEP_NETWORK.getCachedWalletAssets(a);}
function STEP_NETWORK_REFRESH_STATUS(a,r,t,f,g){return _STEP_NETWORK.getRefreshStatus(a,r,t,f,g);}
function STEP_NETWORK_STATS(a,t){return _STEP_NETWORK.getStats(a,t);}
