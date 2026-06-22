/**
 * LIGHTLINK.gs - LightLink Phoenix (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _LIGHTLINK = ChainFactory.createEvmChain("LIGHTLINK", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://1890.rpc.thirdweb.com",
      "https://replicator.phoenix.lightlink.io/rpc/v1"
    ]
  },
  CHAIN: {
    NAME: "LightLink Phoenix",
    CHAIN_ID: 1890,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "LightLink Phoenix Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "lightlink",
    GT_NETWORK: "lightlink"
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum"
  }
});

function GET_WALLET_ASSETS_LIGHTLINK(a,r,t,f,g){return _LIGHTLINK.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_LIGHTLINK(a){return _LIGHTLINK.getCachedWalletAssets(a);}
function LIGHTLINK_REFRESH_STATUS(a,r,t,f,g){return _LIGHTLINK.getRefreshStatus(a,r,t,f,g);}
function LIGHTLINK_STATS(a,t){return _LIGHTLINK.getStats(a,t);}
