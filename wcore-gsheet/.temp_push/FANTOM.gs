/**
 * FANTOM.gs - Fantom (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _FANTOM = ChainFactory.createEvmChain("FANTOM", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://250.rpc.thirdweb.com",
      "https://rpc.ftm.tools",
      "https://fantom-rpc.publicnode.com",
      "https://fantom.drpc.org"
    ]
  },
  CHAIN: {
    NAME: "Fantom",
    CHAIN_ID: 250,
    NATIVE_SYMBOL: "FTM",
    NATIVE_NAME: "Fantom Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:fantom",
    NATIVE_GECKO_ID: "fantom",
    DEX_SLUG: "fantom",
    GT_NETWORK: "fantom"
  },
  LLAMA_ID_MAP: {
    FTM: "coingecko:fantom"
  }
});

function GET_WALLET_ASSETS_FANTOM(a,r,t,f,g){return _FANTOM.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_FANTOM(a){return _FANTOM.getCachedWalletAssets(a);}
function FANTOM_REFRESH_STATUS(a,r,t,f,g){return _FANTOM.getRefreshStatus(a,r,t,f,g);}
function FANTOM_STATS(a,t){return _FANTOM.getStats(a,t);}
