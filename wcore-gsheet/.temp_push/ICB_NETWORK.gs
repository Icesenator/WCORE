/**
 * ICB_NETWORK.gs - ICB Network (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _ICB_NETWORK = ChainFactory.createEvmChain("ICB_NETWORK", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://73115.rpc.thirdweb.com",
      "https://rpc1-mainnet.icbnetwork.info/",
      "https://rpc2-mainnet.icbnetwork.info/"
    ]
  },
  CHAIN: {
    NAME: "ICB Network",
    CHAIN_ID: 73115,
    NATIVE_SYMBOL: "ICB",
    NATIVE_NAME: "ICB Network Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: null,
    NATIVE_GECKO_ID: null,
    DEX_SLUG: "icb-network",
    GT_NETWORK: "icb-network"
  },
  LLAMA_ID_MAP: {}
});

function GET_WALLET_ASSETS_ICB_NETWORK(a,r,t,f,g){return _ICB_NETWORK.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ICB_NETWORK(a){return _ICB_NETWORK.getCachedWalletAssets(a);}
function ICB_NETWORK_REFRESH_STATUS(a,r,t,f,g){return _ICB_NETWORK.getRefreshStatus(a,r,t,f,g);}
function ICB_NETWORK_STATS(a,t){return _ICB_NETWORK.getStats(a,t);}
