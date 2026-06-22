/**
 * STRIDE.gs - Stride (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _STRIDE = ChainFactory.createCosmosChain("STRIDE", {
  CACHE_VERSION: 67,
  API: {
    REST_URL: "https://stride-rest.publicnode.com",
    RPC_URL: "https://stride-rpc.publicnode.com"
  },
  CHAIN: {
    VM: "COSMOS",
    NAME: "Stride",
    DISPLAY_NAME: "Ledger - Stride",
    CHAIN_ID: "stride-1",
    BECH32_PREFIX: "stride",
    NATIVE_SYMBOL: "STRD",
    NATIVE_NAME: "Stride",
    NATIVE_DENOM: "ustrd",
    NATIVE_DECIMALS: 6,
    NATIVE_LLAMA_ID: "coingecko:stride",
    NATIVE_GECKO_ID: "stride"
  },
  DENOM_DECIMALS: {
    ustrd: 6
  },
  DENOM_SYMBOLS: {
    ustrd: "STRD"
  },
  LLAMA_ID_MAP: {
    STRD: "coingecko:stride"
  }
});

function GET_WALLET_ASSETS_STRIDE(a,r,t,f,g){return _STRIDE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_STRIDE(a){return _STRIDE.getCachedWalletAssets(a);}
function STRIDE_REFRESH_STATUS(a,r,t,f,g){return _STRIDE.getRefreshStatus(a,r,t,f,g);}
function STRIDE_STATS(a,t){return _STRIDE.getStats(a,t);}
