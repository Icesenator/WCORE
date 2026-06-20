/**
 * FORMA.gs - Forma (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _FORMA = ChainFactory.createEvmChain("FORMA", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://984122.rpc.thirdweb.com",
      "https://rpc.forma.art"
    ]
  },
  CHAIN: {
    NAME: "Forma",
    CHAIN_ID: 984122,
    NATIVE_SYMBOL: "TIA",
    NATIVE_NAME: "Forma Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:celestia",
    NATIVE_GECKO_ID: "celestia",
    DEX_SLUG: "forma",
    GT_NETWORK: "forma"
  },
  LLAMA_ID_MAP: {
    TIA: "coingecko:celestia"
  }
});

function GET_WALLET_ASSETS_FORMA(a,r,t,f,g){return _FORMA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_FORMA(a){return _FORMA.getCachedWalletAssets(a);}
function FORMA_REFRESH_STATUS(a,r,t,f,g){return _FORMA.getRefreshStatus(a,r,t,f,g);}
function FORMA_STATS(a,t){return _FORMA.getStats(a,t);}
