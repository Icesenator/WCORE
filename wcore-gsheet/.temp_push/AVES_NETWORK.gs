/**
 * AVES_NETWORK.gs - Aves Network (v4.15.51)
 * Phase 3 port from wcore-web chain config.
 */

var _AVES_NETWORK = ChainFactory.createEvmChain("AVES_NETWORK", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://3333.rpc.thirdweb.com"
    ]
  },
  CHAIN: {
    NAME: "Aves Network",
    CHAIN_ID: 3333,
    NATIVE_SYMBOL: "AVES",
    NATIVE_NAME: "Aves Network Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:aves",
    NATIVE_GECKO_ID: "aves",
    DEX_SLUG: "aves-network",
    GT_NETWORK: "aves-network"
  },
  LLAMA_ID_MAP: { AVES: "coingecko:aves" }
});

function GET_WALLET_ASSETS_AVES_NETWORK(a,r,t,f,g){return _AVES_NETWORK.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_AVES_NETWORK(a){return _AVES_NETWORK.getCachedWalletAssets(a);}
function AVES_NETWORK_REFRESH_STATUS(a,r,t,f,g){return _AVES_NETWORK.getRefreshStatus(a,r,t,f,g);}
function AVES_NETWORK_STATS(a,t){return _AVES_NETWORK.getStats(a,t);}
