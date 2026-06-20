/**
 * HORIZEN_EON.gs - Horizen Eon (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _HORIZEN_EON = ChainFactory.createEvmChain("HORIZEN_EON", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://7332.rpc.thirdweb.com"
    ]
  },
  CHAIN: {
    NAME: "Horizen Eon",
    CHAIN_ID: 7332,
    NATIVE_SYMBOL: "ZEN",
    NATIVE_NAME: "Horizen Eon Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:horizen",
    NATIVE_GECKO_ID: "horizen",
    DEX_SLUG: "horizen-eon",
    GT_NETWORK: "horizen-eon"
  },
  LLAMA_ID_MAP: {
    ZEN: "coingecko:horizen"
  }
});

function GET_WALLET_ASSETS_HORIZEN_EON(a,r,t,f,g){return _HORIZEN_EON.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_HORIZEN_EON(a){return _HORIZEN_EON.getCachedWalletAssets(a);}
function HORIZEN_EON_REFRESH_STATUS(a,r,t,f,g){return _HORIZEN_EON.getRefreshStatus(a,r,t,f,g);}
function HORIZEN_EON_STATS(a,t){return _HORIZEN_EON.getStats(a,t);}
