/**
 * CYSIC.gs - Cysic (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _CYSIC = ChainFactory.createEvmChain("CYSIC", {
  CACHE_VERSION: 2,
  RPC: {
    ENDPOINTS: [
      "https://rpc-evm.cysic.xyz",
      "https://4399.rpc.thirdweb.com"
    ]
  },
  CHAIN: {
    NAME: "Cysic",
    CHAIN_ID: 4399,
    NATIVE_SYMBOL: "CYS",
    NATIVE_NAME: "Cysic Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:cysic",
    NATIVE_GECKO_ID: "cysic",
    DEX_SLUG: "cysic",
    GT_NETWORK: "cysic"
  },
  LLAMA_ID_MAP: {
    CYS: "coingecko:cysic"
  }
});

function GET_WALLET_ASSETS_CYSIC(a,r,t,f,g){return _CYSIC.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_CYSIC(a){return _CYSIC.getCachedWalletAssets(a);}
function CYSIC_REFRESH_STATUS(a,r,t,f,g){return _CYSIC.getRefreshStatus(a,r,t,f,g);}
function CYSIC_STATS(a,t){return _CYSIC.getStats(a,t);}
