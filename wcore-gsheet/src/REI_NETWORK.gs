/**
 * REI_NETWORK.gs - Rei Network (v4.15.51)
 * Phase 3 pilot port from wcore-web chain config.
 */

var _REI_NETWORK = ChainFactory.createEvmChain("REI_NETWORK", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://47805.rpc.thirdweb.com",
      "https://rpc.rei.network"
    ]
  },
  CHAIN: {
    NAME: "Rei Network",
    CHAIN_ID: 47805,
    NATIVE_SYMBOL: "REI",
    NATIVE_NAME: "Rei Network Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:rei-network",
    NATIVE_GECKO_ID: "rei-network",
    DEX_SLUG: "rei-network",
    GT_NETWORK: "rei-network"
  },
  LLAMA_ID_MAP: { REI: "coingecko:rei-network" }
});

function GET_WALLET_ASSETS_REI_NETWORK(a,r,t,f,g){return _REI_NETWORK.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_REI_NETWORK(a){return _REI_NETWORK.getCachedWalletAssets(a);}
function REI_NETWORK_REFRESH_STATUS(a,r,t,f,g){return _REI_NETWORK.getRefreshStatus(a,r,t,f,g);}
function REI_NETWORK_STATS(a,t){return _REI_NETWORK.getStats(a,t);}
