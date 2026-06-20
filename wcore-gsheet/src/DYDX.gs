/**
 * DYDX.gs - dYdX (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _DYDX = ChainFactory.createCosmosChain("DYDX", {
  CACHE_VERSION: 67,
  API: {
    REST_URL: "https://dydx-rest.publicnode.com",
    RPC_URL: "https://dydx-rpc.publicnode.com"
  },
  CHAIN: {
    VM: "COSMOS",
    NAME: "dYdX",
    DISPLAY_NAME: "Ledger - dYdX",
    CHAIN_ID: "dydx-mainnet-1",
    BECH32_PREFIX: "dydx",
    NATIVE_SYMBOL: "DYDX",
    NATIVE_NAME: "dYdX",
    NATIVE_DENOM: "adydx",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:dydx-chain",
    NATIVE_GECKO_ID: "dydx-chain"
  },
  DENOM_DECIMALS: {
    adydx: 18
  },
  DENOM_SYMBOLS: {
    adydx: "DYDX"
  },
  LLAMA_ID_MAP: {
    DYDX: "coingecko:dydx-chain"
  }
});

function GET_WALLET_ASSETS_DYDX(a,r,t,f,g){return _DYDX.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_DYDX(a){return _DYDX.getCachedWalletAssets(a);}
function DYDX_REFRESH_STATUS(a,r,t,f,g){return _DYDX.getRefreshStatus(a,r,t,f,g);}
function DYDX_STATS(a,t){return _DYDX.getStats(a,t);}
