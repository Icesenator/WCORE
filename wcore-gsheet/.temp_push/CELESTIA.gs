/**
 * CELESTIA.gs - Celestia (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _CELESTIA = ChainFactory.createCosmosChain("CELESTIA", {
  CACHE_VERSION: 67,
  API: {
    REST_URL: "https://celestia-rest.publicnode.com",
    RPC_URL: "https://celestia-rpc.publicnode.com"
  },
  CHAIN: {
    VM: "COSMOS",
    NAME: "Celestia",
    DISPLAY_NAME: "Ledger - Celestia",
    CHAIN_ID: "celestia",
    BECH32_PREFIX: "celestia",
    NATIVE_SYMBOL: "TIA",
    NATIVE_NAME: "Celestia",
    NATIVE_DENOM: "utia",
    NATIVE_DECIMALS: 6,
    NATIVE_LLAMA_ID: "coingecko:celestia",
    NATIVE_GECKO_ID: "celestia"
  },
  DENOM_DECIMALS: {
    utia: 6
  },
  DENOM_SYMBOLS: {
    utia: "TIA"
  },
  LLAMA_ID_MAP: {
    TIA: "coingecko:celestia"
  }
});

function GET_WALLET_ASSETS_CELESTIA(a,r,t,f,g){return _CELESTIA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_CELESTIA(a){return _CELESTIA.getCachedWalletAssets(a);}
function CELESTIA_REFRESH_STATUS(a,r,t,f,g){return _CELESTIA.getRefreshStatus(a,r,t,f,g);}
function CELESTIA_STATS(a,t){return _CELESTIA.getStats(a,t);}
