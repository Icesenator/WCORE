/**
 * NEUTRON.gs - Neutron (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _NEUTRON = ChainFactory.createCosmosChain("NEUTRON", {
  CACHE_VERSION: 67,
  API: {
    REST_URL: "https://neutron-rest.publicnode.com",
    RPC_URL: "https://neutron-rpc.publicnode.com"
  },
  CHAIN: {
    VM: "COSMOS",
    NAME: "Neutron",
    DISPLAY_NAME: "Ledger - Neutron",
    CHAIN_ID: "neutron-1",
    BECH32_PREFIX: "neutron",
    NATIVE_SYMBOL: "NTRN",
    NATIVE_NAME: "Neutron",
    NATIVE_DENOM: "untrn",
    NATIVE_DECIMALS: 6,
    NATIVE_LLAMA_ID: "coingecko:neutron-3",
    NATIVE_GECKO_ID: "neutron-3"
  },
  DENOM_DECIMALS: {
    untrn: 6
  },
  DENOM_SYMBOLS: {
    untrn: "NTRN"
  },
  LLAMA_ID_MAP: {
    NTRN: "coingecko:neutron-3"
  }
});

function GET_WALLET_ASSETS_NEUTRON(a,r,t,f,g){return _NEUTRON.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_NEUTRON(a){return _NEUTRON.getCachedWalletAssets(a);}
function NEUTRON_REFRESH_STATUS(a,r,t,f,g){return _NEUTRON.getRefreshStatus(a,r,t,f,g);}
function NEUTRON_STATS(a,t){return _NEUTRON.getStats(a,t);}
