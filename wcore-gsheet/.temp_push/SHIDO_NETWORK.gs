/**
 * SHIDO_NETWORK.gs - Shido Network (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _SHIDO_NETWORK = ChainFactory.createEvmChain("SHIDO_NETWORK", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://9008.rpc.thirdweb.com",
      "https://shido-mainnet-archive-lb-nw5es9.zeeve.net/USjg7xqUmCZ4wCsqEOOE/rpc",
      "https://evm.shidoscan.net"
    ]
  },
  CHAIN: {
    NAME: "Shido Network",
    CHAIN_ID: 9008,
    NATIVE_SYMBOL: "SHIDO",
    NATIVE_NAME: "Shido Network Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:shido",
    NATIVE_GECKO_ID: "shido",
    DEX_SLUG: "shido",
    GT_NETWORK: "shido"
  },
  LLAMA_ID_MAP: {
    SHIDO: "coingecko:shido"
  }
});

function GET_WALLET_ASSETS_SHIDO_NETWORK(a,r,t,f,g){return _SHIDO_NETWORK.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_SHIDO_NETWORK(a){return _SHIDO_NETWORK.getCachedWalletAssets(a);}
function SHIDO_NETWORK_REFRESH_STATUS(a,r,t,f,g){return _SHIDO_NETWORK.getRefreshStatus(a,r,t,f,g);}
function SHIDO_NETWORK_STATS(a,t){return _SHIDO_NETWORK.getStats(a,t);}
