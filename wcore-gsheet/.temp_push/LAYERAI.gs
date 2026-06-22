/**
 * LAYERAI.gs - LayerAI (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _LAYERAI = ChainFactory.createEvmChain("LAYERAI", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://2800.rpc.thirdweb.com"
    ]
  },
  CHAIN: {
    NAME: "LayerAI",
    CHAIN_ID: 2800,
    NATIVE_SYMBOL: "LAI",
    NATIVE_NAME: "LayerAI Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:layerai",
    NATIVE_GECKO_ID: "layerai",
    DEX_SLUG: "layerai",
    GT_NETWORK: "layerai"
  },
  LLAMA_ID_MAP: {
    LAI: "coingecko:layerai"
  }
});

function GET_WALLET_ASSETS_LAYERAI(a,r,t,f,g){return _LAYERAI.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_LAYERAI(a){return _LAYERAI.getCachedWalletAssets(a);}
function LAYERAI_REFRESH_STATUS(a,r,t,f,g){return _LAYERAI.getRefreshStatus(a,r,t,f,g);}
function LAYERAI_STATS(a,t){return _LAYERAI.getStats(a,t);}
