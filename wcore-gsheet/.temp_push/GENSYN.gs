/**
 * GENSYN.gs - Gensyn (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _GENSYN = ChainFactory.createEvmChain("GENSYN", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://685689.rpc.thirdweb.com",
      "https://gensyn-mainnet.g.alchemy.com/public"
    ]
  },
  CHAIN: {
    NAME: "Gensyn",
    CHAIN_ID: 685689,
    NATIVE_SYMBOL: "SYN",
    NATIVE_NAME: "Gensyn Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: null,
    NATIVE_GECKO_ID: null,
    DEX_SLUG: "gensyn",
    GT_NETWORK: "gensyn"
  },
  LLAMA_ID_MAP: {}
});

function GET_WALLET_ASSETS_GENSYN(a,r,t,f,g){return _GENSYN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_GENSYN(a){return _GENSYN.getCachedWalletAssets(a);}
function GENSYN_REFRESH_STATUS(a,r,t,f,g){return _GENSYN.getRefreshStatus(a,r,t,f,g);}
function GENSYN_STATS(a,t){return _GENSYN.getStats(a,t);}
