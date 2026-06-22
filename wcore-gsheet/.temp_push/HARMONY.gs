/**
 * HARMONY.gs - Harmony (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _HARMONY = ChainFactory.createEvmChain("HARMONY", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://1666600000.rpc.thirdweb.com",
      "https://api.harmony.one",
      "https://a.api.s0.t.hmny.io",
      "https://api.s0.t.hmny.io",
      "https://rpc.ankr.com/harmony"
    ]
  },
  CHAIN: {
    NAME: "Harmony",
    CHAIN_ID: 1666600000,
    NATIVE_SYMBOL: "ONE",
    NATIVE_NAME: "Harmony Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:harmony",
    NATIVE_GECKO_ID: "harmony",
    DEX_SLUG: "harmony",
    GT_NETWORK: "harmony"
  },
  LLAMA_ID_MAP: {
    ONE: "coingecko:harmony"
  }
});

function GET_WALLET_ASSETS_HARMONY(a,r,t,f,g){return _HARMONY.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_HARMONY(a){return _HARMONY.getCachedWalletAssets(a);}
function HARMONY_REFRESH_STATUS(a,r,t,f,g){return _HARMONY.getRefreshStatus(a,r,t,f,g);}
function HARMONY_STATS(a,t){return _HARMONY.getStats(a,t);}
