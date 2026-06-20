/**
 * ENDURANCE.gs - Endurance (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _ENDURANCE = ChainFactory.createEvmChain("ENDURANCE", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://648.rpc.thirdweb.com",
      "https://rpc-endurance.fusionist.io/"
    ]
  },
  CHAIN: {
    NAME: "Endurance",
    CHAIN_ID: 648,
    NATIVE_SYMBOL: "ACE",
    NATIVE_NAME: "Endurance Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:fusionist",
    NATIVE_GECKO_ID: "fusionist",
    DEX_SLUG: "endurance",
    GT_NETWORK: "endurance"
  },
  LLAMA_ID_MAP: {
    ACE: "coingecko:fusionist"
  }
});

function GET_WALLET_ASSETS_ENDURANCE(a,r,t,f,g){return _ENDURANCE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ENDURANCE(a){return _ENDURANCE.getCachedWalletAssets(a);}
function ENDURANCE_REFRESH_STATUS(a,r,t,f,g){return _ENDURANCE.getRefreshStatus(a,r,t,f,g);}
function ENDURANCE_STATS(a,t){return _ENDURANCE.getStats(a,t);}
