/**
 * MOCA_CHAIN.gs - Moca Chain (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _MOCA_CHAIN = ChainFactory.createEvmChain("MOCA_CHAIN", {
  CACHE_VERSION: 2,
  RPC: {
    ENDPOINTS: [
      "https://moca-mainnet.drpc.org",
      "https://2288.rpc.thirdweb.com"
    ]
  },
  CHAIN: {
    NAME: "Moca Chain",
    CHAIN_ID: 2288,
    NATIVE_SYMBOL: "MOCA",
    NATIVE_NAME: "Moca Chain Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:moca-network",
    NATIVE_GECKO_ID: "moca-network",
    DEX_SLUG: "moca-chain",
    GT_NETWORK: "moca-chain"
  },
  LLAMA_ID_MAP: {
    MOCA: "coingecko:moca-network"
  },
  FLAGS: {
    DISABLE_CHAIN: true
  }
});

function GET_WALLET_ASSETS_MOCA_CHAIN(a,r,t,f,g){return _MOCA_CHAIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_MOCA_CHAIN(a){return _MOCA_CHAIN.getCachedWalletAssets(a);}
function MOCA_CHAIN_REFRESH_STATUS(a,r,t,f,g){return _MOCA_CHAIN.getRefreshStatus(a,r,t,f,g);}
function MOCA_CHAIN_STATS(a,t){return _MOCA_CHAIN.getStats(a,t);}
