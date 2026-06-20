/**
 * MIND.gs - Mind Network (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _MIND = ChainFactory.createEvmChain("MIND", {
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc-mainnet.mindnetwork.xyz",
      "https://228.rpc.thirdweb.com"
    ]
  },
  CHAIN: {
    NAME: "Mind Network",
    CHAIN_ID: 228,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "mind",
    GT_NETWORK: "mind"
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
    FHE: "coingecko:mind-network",
    WETH: "coingecko:weth"
  }
});

function GET_WALLET_ASSETS_MIND(a,r,t,f,g){return _MIND.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_MIND(a){return _MIND.getCachedWalletAssets(a);}
function MIND_REFRESH_STATUS(a,r,t,f,g){return _MIND.getRefreshStatus(a,r,t,f,g);}
function MIND_STATS(a,t){return _MIND.getStats(a,t);}
