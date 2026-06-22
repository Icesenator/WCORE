/**
 * EDGELESS.gs - Edgeless (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _EDGELESS = ChainFactory.createEvmChain("EDGELESS", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://2026.rpc.thirdweb.com",
      "https://rpc.edgeless.network/http"
    ]
  },
  CHAIN: {
    NAME: "Edgeless",
    CHAIN_ID: 2026,
    NATIVE_SYMBOL: "EDG",
    NATIVE_NAME: "Edgeless Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:edgeless",
    NATIVE_GECKO_ID: "edgeless",
    DEX_SLUG: "edgeless",
    GT_NETWORK: "edgeless"
  },
  LLAMA_ID_MAP: {
    EDG: "coingecko:edgeless"
  }
});

function GET_WALLET_ASSETS_EDGELESS(a,r,t,f,g){return _EDGELESS.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_EDGELESS(a){return _EDGELESS.getCachedWalletAssets(a);}
function EDGELESS_REFRESH_STATUS(a,r,t,f,g){return _EDGELESS.getRefreshStatus(a,r,t,f,g);}
function EDGELESS_STATS(a,t){return _EDGELESS.getStats(a,t);}
