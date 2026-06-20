/**
 * CROSS_MAINNET.gs - Cross Mainnet (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _CROSS_MAINNET = ChainFactory.createEvmChain("CROSS_MAINNET", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://612055.rpc.thirdweb.com"
    ]
  },
  CHAIN: {
    NAME: "Cross Mainnet",
    CHAIN_ID: 612055,
    NATIVE_SYMBOL: "CROSS",
    NATIVE_NAME: "Cross Mainnet Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: null,
    NATIVE_GECKO_ID: null,
    DEX_SLUG: "cross-mainnet",
    GT_NETWORK: "cross-mainnet"
  },
  LLAMA_ID_MAP: {},
  FLAGS: {
    DISABLE_CHAIN: true
  }
});

function GET_WALLET_ASSETS_CROSS_MAINNET(a,r,t,f,g){return _CROSS_MAINNET.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_CROSS_MAINNET(a){return _CROSS_MAINNET.getCachedWalletAssets(a);}
function CROSS_MAINNET_REFRESH_STATUS(a,r,t,f,g){return _CROSS_MAINNET.getRefreshStatus(a,r,t,f,g);}
function CROSS_MAINNET_STATS(a,t){return _CROSS_MAINNET.getStats(a,t);}
