/**
 * HYCHAIN.gs - Hychain (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _HYCHAIN = ChainFactory.createEvmChain("HYCHAIN", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://2911.rpc.thirdweb.com",
      "https://rpc.hychain.com/http"
    ]
  },
  CHAIN: {
    NAME: "Hychain",
    CHAIN_ID: 2911,
    NATIVE_SYMBOL: "TOPIA",
    NATIVE_NAME: "Hychain Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:hychain",
    NATIVE_GECKO_ID: "hychain",
    DEX_SLUG: "hychain",
    GT_NETWORK: "hychain"
  },
  LLAMA_ID_MAP: {
    TOPIA: "coingecko:hychain"
  }
});

function GET_WALLET_ASSETS_HYCHAIN(a,r,t,f,g){return _HYCHAIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_HYCHAIN(a){return _HYCHAIN.getCachedWalletAssets(a);}
function HYCHAIN_REFRESH_STATUS(a,r,t,f,g){return _HYCHAIN.getRefreshStatus(a,r,t,f,g);}
function HYCHAIN_STATS(a,t){return _HYCHAIN.getStats(a,t);}
