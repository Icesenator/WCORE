/**
 * INEVM.gs - inEVM (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _INEVM = ChainFactory.createEvmChain("INEVM", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://2525.rpc.thirdweb.com",
      "https://mainnet.rpc.inevm.com/http"
    ]
  },
  CHAIN: {
    NAME: "inEVM",
    CHAIN_ID: 2525,
    NATIVE_SYMBOL: "INJ",
    NATIVE_NAME: "inEVM Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:injective-protocol",
    NATIVE_GECKO_ID: "injective-protocol",
    DEX_SLUG: "inevm",
    GT_NETWORK: "inevm"
  },
  LLAMA_ID_MAP: {
    INJ: "coingecko:injective-protocol"
  }
});

function GET_WALLET_ASSETS_INEVM(a,r,t,f,g){return _INEVM.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_INEVM(a){return _INEVM.getCachedWalletAssets(a);}
function INEVM_REFRESH_STATUS(a,r,t,f,g){return _INEVM.getRefreshStatus(a,r,t,f,g);}
function INEVM_STATS(a,t){return _INEVM.getStats(a,t);}
