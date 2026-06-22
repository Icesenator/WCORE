/**
 * SURFLAYER.gs - SurfLayer (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _SURFLAYER = ChainFactory.createEvmChain("SURFLAYER", {
  CACHE_VERSION: 67,
  TIMEOUTS: {
    HTTP_MS: 3000
  },
  RPC: {
    ENDPOINTS: [
      "https://rpc.surflayer.com",
      "https://surflayer.drpc.org"
    ]
  },
  CHAIN: {
    VM: "EVM",
    NAME: "SurfLayer",
    DISPLAY_NAME: "Ledger - SurfLayer",
    CHAIN_ID: 68775,
    NATIVE_SYMBOL: "SURF",
    NATIVE_NAME: "SurfLayer",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:surflayer",
    NATIVE_GECKO_ID: "surflayer",
    DEX_SLUG: "surflayer"
  },
  LLAMA_ID_MAP: {
    SURF: "coingecko:surflayer"
  },
  FLAGS: {
    DISABLE_CHAIN: true
  }
});

function GET_WALLET_ASSETS_SURFLAYER(a,r,t,f,g){return _SURFLAYER.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_SURFLAYER(a){return _SURFLAYER.getCachedWalletAssets(a);}
function SURFLAYER_REFRESH_STATUS(a,r,t,f,g){return _SURFLAYER.getRefreshStatus(a,r,t,f,g);}
function SURFLAYER_STATS(a,t){return _SURFLAYER.getStats(a,t);}
