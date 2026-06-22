/**
 * LORENZO.gs - Lorenzo (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _LORENZO = ChainFactory.createEvmChain("LORENZO", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://8329.rpc.thirdweb.com",
      "https://rpc.lorenzo-protocol.xyz"
    ]
  },
  CHAIN: {
    NAME: "Lorenzo",
    CHAIN_ID: 8329,
    NATIVE_SYMBOL: "Lorenzo",
    NATIVE_NAME: "Lorenzo Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:lorenzo",
    NATIVE_GECKO_ID: "lorenzo-protocol",
    DEX_SLUG: "lorenzo",
    GT_NETWORK: "lorenzo"
  },
  LLAMA_ID_MAP: {
    Lorenzo: "coingecko:lorenzo"
  }
});

function GET_WALLET_ASSETS_LORENZO(a,r,t,f,g){return _LORENZO.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_LORENZO(a){return _LORENZO.getCachedWalletAssets(a);}
function LORENZO_REFRESH_STATUS(a,r,t,f,g){return _LORENZO.getRefreshStatus(a,r,t,f,g);}
function LORENZO_STATS(a,t){return _LORENZO.getStats(a,t);}
