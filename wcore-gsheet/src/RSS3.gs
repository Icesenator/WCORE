/**
 * RSS3.gs - RSS3 (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _RSS3 = ChainFactory.createEvmChain("RSS3", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://12553.rpc.thirdweb.com",
      "https://rpc.rss3.io"
    ]
  },
  CHAIN: {
    NAME: "RSS3",
    CHAIN_ID: 12553,
    NATIVE_SYMBOL: "RSS3",
    NATIVE_NAME: "RSS3 Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:rss3",
    NATIVE_GECKO_ID: "rss3",
    DEX_SLUG: "rss3",
    GT_NETWORK: "rss3"
  },
  LLAMA_ID_MAP: {
    RSS3: "coingecko:rss3"
  }
});

function GET_WALLET_ASSETS_RSS3(a,r,t,f,g){return _RSS3.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_RSS3(a){return _RSS3.getCachedWalletAssets(a);}
function RSS3_REFRESH_STATUS(a,r,t,f,g){return _RSS3.getRefreshStatus(a,r,t,f,g);}
function RSS3_STATS(a,t){return _RSS3.getStats(a,t);}
