/**
 * ROLLUX.gs - Rollux (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _ROLLUX = ChainFactory.createEvmChain("ROLLUX", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://570.rpc.thirdweb.com",
      "https://rpc.rollux.com",
      "https://rpc.ankr.com/rollux"
    ]
  },
  CHAIN: {
    NAME: "Rollux",
    CHAIN_ID: 570,
    NATIVE_SYMBOL: "SYS",
    NATIVE_NAME: "Rollux Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:syscoin",
    NATIVE_GECKO_ID: "syscoin",
    DEX_SLUG: "rollux",
    GT_NETWORK: "rollux"
  },
  LLAMA_ID_MAP: {
    SYS: "coingecko:syscoin"
  }
});

function GET_WALLET_ASSETS_ROLLUX(a,r,t,f,g){return _ROLLUX.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ROLLUX(a){return _ROLLUX.getCachedWalletAssets(a);}
function ROLLUX_REFRESH_STATUS(a,r,t,f,g){return _ROLLUX.getRefreshStatus(a,r,t,f,g);}
function ROLLUX_STATS(a,t){return _ROLLUX.getStats(a,t);}
