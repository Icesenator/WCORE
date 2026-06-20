/**
 * LUMIO.gs - Lumio (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _LUMIO = ChainFactory.createEvmChain("LUMIO", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://8866.rpc.thirdweb.com",
      "https://mainnet.lumio.io/"
    ]
  },
  CHAIN: {
    NAME: "Lumio",
    CHAIN_ID: 8866,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Lumio Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "lumio",
    GT_NETWORK: "lumio"
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum"
  }
});

function GET_WALLET_ASSETS_LUMIO(a,r,t,f,g){return _LUMIO.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_LUMIO(a){return _LUMIO.getCachedWalletAssets(a);}
function LUMIO_REFRESH_STATUS(a,r,t,f,g){return _LUMIO.getRefreshStatus(a,r,t,f,g);}
function LUMIO_STATS(a,t){return _LUMIO.getStats(a,t);}
