/**
 * MOONCHAIN.gs - Moonchain (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _MOONCHAIN = ChainFactory.createEvmChain("MOONCHAIN", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://1111.rpc.thirdweb.com",
      "https://api.wemix.com"
    ]
  },
  CHAIN: {
    NAME: "Moonchain",
    CHAIN_ID: 1111,
    NATIVE_SYMBOL: "MHC",
    NATIVE_NAME: "Moonchain Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:moonchain",
    NATIVE_GECKO_ID: "moonchain",
    DEX_SLUG: "moonchain",
    GT_NETWORK: "moonchain"
  },
  LLAMA_ID_MAP: {
    MHC: "coingecko:moonchain"
  }
});

function GET_WALLET_ASSETS_MOONCHAIN(a,r,t,f,g){return _MOONCHAIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_MOONCHAIN(a){return _MOONCHAIN.getCachedWalletAssets(a);}
function MOONCHAIN_REFRESH_STATUS(a,r,t,f,g){return _MOONCHAIN.getRefreshStatus(a,r,t,f,g);}
function MOONCHAIN_STATS(a,t){return _MOONCHAIN.getStats(a,t);}
