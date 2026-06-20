/**
 * KAVA.gs - Kava (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _KAVA = ChainFactory.createCosmosChain("KAVA", {
  CACHE_VERSION: 67,
  API: {
    REST_URL: "https://kava-rest.publicnode.com",
    RPC_URL: "https://kava-rpc.publicnode.com"
  },
  CHAIN: {
    VM: "COSMOS",
    NAME: "Kava",
    DISPLAY_NAME: "Ledger - Kava",
    CHAIN_ID: "kava_2222-10",
    BECH32_PREFIX: "kava",
    NATIVE_SYMBOL: "KAVA",
    NATIVE_NAME: "Kava",
    NATIVE_DENOM: "ukava",
    NATIVE_DECIMALS: 6,
    NATIVE_LLAMA_ID: "coingecko:kava",
    NATIVE_GECKO_ID: "kava"
  },
  DENOM_DECIMALS: {
    ukava: 6
  },
  DENOM_SYMBOLS: {
    ukava: "KAVA"
  },
  LLAMA_ID_MAP: {
    KAVA: "coingecko:kava"
  }
});

function GET_WALLET_ASSETS_KAVA(a,r,t,f,g){return _KAVA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_KAVA(a){return _KAVA.getCachedWalletAssets(a);}
function KAVA_REFRESH_STATUS(a,r,t,f,g){return _KAVA.getRefreshStatus(a,r,t,f,g);}
function KAVA_STATS(a,t){return _KAVA.getStats(a,t);}
