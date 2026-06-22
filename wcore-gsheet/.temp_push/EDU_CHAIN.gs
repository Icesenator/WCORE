/**
 * EDU_CHAIN.gs - EDU Chain (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _EDU_CHAIN = ChainFactory.createEvmChain("EDU_CHAIN", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://41923.rpc.thirdweb.com",
      "https://rpc.edu-chain.raas.gelato.cloud"
    ]
  },
  CHAIN: {
    NAME: "EDU Chain",
    CHAIN_ID: 41923,
    NATIVE_SYMBOL: "EDU",
    NATIVE_NAME: "EDU Chain Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:edu-chain",
    NATIVE_GECKO_ID: "edu-chain",
    DEX_SLUG: "edu-chain",
    GT_NETWORK: "edu-chain"
  },
  LLAMA_ID_MAP: {
    EDU: "coingecko:edu-chain"
  }
});

function GET_WALLET_ASSETS_EDU_CHAIN(a,r,t,f,g){return _EDU_CHAIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_EDU_CHAIN(a){return _EDU_CHAIN.getCachedWalletAssets(a);}
function EDU_CHAIN_REFRESH_STATUS(a,r,t,f,g){return _EDU_CHAIN.getRefreshStatus(a,r,t,f,g);}
function EDU_CHAIN_STATS(a,t){return _EDU_CHAIN.getStats(a,t);}
