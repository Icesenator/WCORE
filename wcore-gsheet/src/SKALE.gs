/**
 * SKALE.gs - Skale (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _SKALE = ChainFactory.createEvmChain("SKALE", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://2046399126.rpc.thirdweb.com",
      "https://mainnet.skalenodes.com/v1/elated-tan-skat"
    ]
  },
  CHAIN: {
    NAME: "Skale",
    CHAIN_ID: 2046399126,
    NATIVE_SYMBOL: "sFUEL",
    NATIVE_NAME: "Skale Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: null,
    NATIVE_GECKO_ID: null,
    DEX_SLUG: "skale",
    GT_NETWORK: "skale"
  },
  LLAMA_ID_MAP: {}
});

function GET_WALLET_ASSETS_SKALE(a,r,t,f,g){return _SKALE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_SKALE(a){return _SKALE.getCachedWalletAssets(a);}
function SKALE_REFRESH_STATUS(a,r,t,f,g){return _SKALE.getRefreshStatus(a,r,t,f,g);}
function SKALE_STATS(a,t){return _SKALE.getStats(a,t);}
