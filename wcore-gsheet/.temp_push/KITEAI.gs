/**
 * KITEAI.gs - KiteAI (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _KITEAI = ChainFactory.createEvmChain("KITEAI", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://2366.rpc.thirdweb.com",
      "https://rpc.gokite.ai"
    ]
  },
  CHAIN: {
    NAME: "KiteAI",
    CHAIN_ID: 2366,
    NATIVE_SYMBOL: "KITE",
    NATIVE_NAME: "KiteAI Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: null,
    NATIVE_GECKO_ID: null,
    DEX_SLUG: "kiteai",
    GT_NETWORK: "kiteai"
  },
  LLAMA_ID_MAP: {}
});

function GET_WALLET_ASSETS_KITEAI(a,r,t,f,g){return _KITEAI.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_KITEAI(a){return _KITEAI.getCachedWalletAssets(a);}
function KITEAI_REFRESH_STATUS(a,r,t,f,g){return _KITEAI.getRefreshStatus(a,r,t,f,g);}
function KITEAI_STATS(a,t){return _KITEAI.getStats(a,t);}
