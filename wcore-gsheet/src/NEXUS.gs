/**
 * NEXUS.gs - Nexus Mainnet (v4.15.51)
 * Phase 3 pilot port from wcore-web chain config.
 */

var _NEXUS = ChainFactory.createEvmChain("NEXUS", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://mainnet.rpc.nexus.xyz/"
    ]
  },
  CHAIN: {
    NAME: "Nexus Mainnet",
    CHAIN_ID: 3946,
    NATIVE_SYMBOL: "NEX",
    NATIVE_NAME: "NEX",
    NATIVE_DECIMALS: 18,
    DEX_SLUG: "nexus",
    GT_NETWORK: "nexus"
  }
});

function GET_WALLET_ASSETS_NEXUS(a,r,t,f,g){return _NEXUS.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_NEXUS(a){return _NEXUS.getCachedWalletAssets(a);}
function NEXUS_REFRESH_STATUS(a,r,t,f,g){return _NEXUS.getRefreshStatus(a,r,t,f,g);}
function NEXUS_STATS(a,t){return _NEXUS.getStats(a,t);}
