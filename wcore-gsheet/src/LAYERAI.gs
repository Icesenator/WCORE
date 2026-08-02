/**
 * LAYERAI.gs - LayerAI (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _LAYERAI = ChainFactory.createEvmChain("LAYERAI", {
  CACHE_VERSION: 1,
  RPC: {
    // 2026-08-02: the thirdweb endpoint was the only one configured and answers
    // "We are not able to process your request" on eth_blockNumber/eth_getBalance
    // (3/3 probes), so this chain could not be scanned at all. Both aere.network
    // hosts return chainId 2800 and serve eth_getBalance/eth_call, and agree on the
    // head block within one. Kept thirdweb last in case its block is IP-scoped.
    ENDPOINTS: [
      "https://rpc.aere.network",
      "https://rpc2.aere.network",
      "https://2800.rpc.thirdweb.com"
    ]
  },
  CHAIN: {
    NAME: "LayerAI",
    CHAIN_ID: 2800,
    NATIVE_SYMBOL: "LAI",
    NATIVE_NAME: "LayerAI Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:layerai",
    NATIVE_GECKO_ID: "layerai",
    DEX_SLUG: "layerai",
    GT_NETWORK: "layerai"
  },
  LLAMA_ID_MAP: {
    LAI: "coingecko:layerai"
  }
});

function GET_WALLET_ASSETS_LAYERAI(a,r,t,f,g){return _LAYERAI.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_LAYERAI(a){return _LAYERAI.getCachedWalletAssets(a);}
function LAYERAI_REFRESH_STATUS(a,r,t,f,g){return _LAYERAI.getRefreshStatus(a,r,t,f,g);}
function LAYERAI_STATS(a,t){return _LAYERAI.getStats(a,t);}
