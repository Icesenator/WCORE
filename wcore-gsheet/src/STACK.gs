/**
 * STACK.gs - Stack (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _STACK = ChainFactory.createEvmChain("STACK", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://78225.rpc.thirdweb.com"
    ]
  },
  CHAIN: {
    NAME: "Stack",
    CHAIN_ID: 78225,
    NATIVE_SYMBOL: "STACK",
    NATIVE_NAME: "Stack Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:stack",
    NATIVE_GECKO_ID: "stack-2",
    DEX_SLUG: "stack",
    GT_NETWORK: "stack"
  },
  LLAMA_ID_MAP: {
    STACK: "coingecko:stack"
  },
  FLAGS: {
    DISABLE_CHAIN: true
  }
});

function GET_WALLET_ASSETS_STACK(a,r,t,f,g){return _STACK.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_STACK(a){return _STACK.getCachedWalletAssets(a);}
function STACK_REFRESH_STATUS(a,r,t,f,g){return _STACK.getRefreshStatus(a,r,t,f,g);}
function STACK_STATS(a,t){return _STACK.getStats(a,t);}
