/**
 * STARGAZE.gs - Stargaze (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _STARGAZE = ChainFactory.createCosmosChain("STARGAZE", {
  CACHE_VERSION: 67,
  API: {
    REST_URL: "https://stargaze-rest.publicnode.com",
    RPC_URL: "https://stargaze-rpc.publicnode.com"
  },
  CHAIN: {
    VM: "COSMOS",
    NAME: "Stargaze",
    DISPLAY_NAME: "Ledger - Stargaze",
    CHAIN_ID: "stargaze-1",
    BECH32_PREFIX: "stars",
    NATIVE_SYMBOL: "STARS",
    NATIVE_NAME: "Stargaze",
    NATIVE_DENOM: "ustars",
    NATIVE_DECIMALS: 6,
    NATIVE_LLAMA_ID: "coingecko:stargaze",
    NATIVE_GECKO_ID: "stargaze"
  },
  DENOM_DECIMALS: {
    ustars: 6
  },
  DENOM_SYMBOLS: {
    ustars: "STARS"
  },
  LLAMA_ID_MAP: {
    STARS: "coingecko:stargaze"
  }
});

function GET_WALLET_ASSETS_STARGAZE(a,r,t,f,g){return _STARGAZE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_STARGAZE(a){return _STARGAZE.getCachedWalletAssets(a);}
function STARGAZE_REFRESH_STATUS(a,r,t,f,g){return _STARGAZE.getRefreshStatus(a,r,t,f,g);}
function STARGAZE_STATS(a,t){return _STARGAZE.getStats(a,t);}
