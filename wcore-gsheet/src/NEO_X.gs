/**
 * NEO_X.gs - Neo X (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _NEO_X = ChainFactory.createEvmChain("NEO_X", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://47763.rpc.thirdweb.com",
      "https://mainnet-1.rpc.banelabs.org",
      "https://mainnet-2.rpc.banelabs.org"
    ]
  },
  CHAIN: {
    NAME: "Neo X",
    CHAIN_ID: 47763,
    NATIVE_SYMBOL: "GAS",
    NATIVE_NAME: "Neo X Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:neo",
    NATIVE_GECKO_ID: "neo",
    DEX_SLUG: "neo-x",
    GT_NETWORK: "neo-x"
  },
  LLAMA_ID_MAP: {
    GAS: "coingecko:neo"
  }
});

function GET_WALLET_ASSETS_NEO_X(a,r,t,f,g){return _NEO_X.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_NEO_X(a){return _NEO_X.getCachedWalletAssets(a);}
function NEO_X_REFRESH_STATUS(a,r,t,f,g){return _NEO_X.getRefreshStatus(a,r,t,f,g);}
function NEO_X_STATS(a,t){return _NEO_X.getStats(a,t);}
