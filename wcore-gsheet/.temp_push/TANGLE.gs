/**
 * TANGLE.gs - Tangle (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _TANGLE = ChainFactory.createEvmChain("TANGLE", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://5845.rpc.thirdweb.com",
      "https://rpc.tangle.tools"
    ]
  },
  CHAIN: {
    NAME: "Tangle",
    CHAIN_ID: 5845,
    NATIVE_SYMBOL: "TNT",
    NATIVE_NAME: "Tangle Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:tangle",
    NATIVE_GECKO_ID: "tangle",
    DEX_SLUG: "tangle",
    GT_NETWORK: "tangle"
  },
  LLAMA_ID_MAP: {
    TNT: "coingecko:tangle"
  }
});

function GET_WALLET_ASSETS_TANGLE(a,r,t,f,g){return _TANGLE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_TANGLE(a){return _TANGLE.getCachedWalletAssets(a);}
function TANGLE_REFRESH_STATUS(a,r,t,f,g){return _TANGLE.getRefreshStatus(a,r,t,f,g);}
function TANGLE_STATS(a,t){return _TANGLE.getStats(a,t);}
