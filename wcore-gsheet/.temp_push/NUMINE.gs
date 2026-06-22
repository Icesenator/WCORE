/**
 * NUMINE.gs - Numine (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _NUMINE = ChainFactory.createEvmChain("NUMINE", {
  CACHE_VERSION: 2,
  RPC: {
    ENDPOINTS: [
      "https://subnets.avax.network/numi/mainnet/rpc",
      "https://8021.rpc.thirdweb.com"
    ]
  },
  CHAIN: {
    NAME: "Numine",
    CHAIN_ID: 8021,
    NATIVE_SYMBOL: "NUMINE",
    NATIVE_NAME: "Numine Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: null,
    NATIVE_GECKO_ID: null,
    DEX_SLUG: "numine",
    GT_NETWORK: "numine"
  },
  LLAMA_ID_MAP: {}
});

function GET_WALLET_ASSETS_NUMINE(a,r,t,f,g){return _NUMINE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_NUMINE(a){return _NUMINE.getCachedWalletAssets(a);}
function NUMINE_REFRESH_STATUS(a,r,t,f,g){return _NUMINE.getRefreshStatus(a,r,t,f,g);}
function NUMINE_STATS(a,t){return _NUMINE.getStats(a,t);}
