/**
 * RIVALZ.gs - Rivalz (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _RIVALZ = ChainFactory.createEvmChain("RIVALZ", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://7534.rpc.thirdweb.com"
    ]
  },
  CHAIN: {
    NAME: "Rivalz",
    CHAIN_ID: 7534,
    NATIVE_SYMBOL: "RI",
    NATIVE_NAME: "Rivalz Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:rivalz",
    NATIVE_GECKO_ID: "rivalz",
    DEX_SLUG: "rivalz",
    GT_NETWORK: "rivalz"
  },
  LLAMA_ID_MAP: {
    RI: "coingecko:rivalz"
  },
  FLAGS: {
    DISABLE_CHAIN: true
  }
});

function GET_WALLET_ASSETS_RIVALZ(a,r,t,f,g){return _RIVALZ.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_RIVALZ(a){return _RIVALZ.getCachedWalletAssets(a);}
function RIVALZ_REFRESH_STATUS(a,r,t,f,g){return _RIVALZ.getRefreshStatus(a,r,t,f,g);}
function RIVALZ_STATS(a,t){return _RIVALZ.getStats(a,t);}
