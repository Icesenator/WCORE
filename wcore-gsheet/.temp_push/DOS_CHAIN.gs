/**
 * DOS_CHAIN.gs - DOS Chain (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _DOS_CHAIN = ChainFactory.createEvmChain("DOS_CHAIN", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://7979.rpc.thirdweb.com",
      "https://main.doschain.com"
    ]
  },
  CHAIN: {
    NAME: "DOS Chain",
    CHAIN_ID: 7979,
    NATIVE_SYMBOL: "DOS",
    NATIVE_NAME: "DOS Chain Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:dos",
    NATIVE_GECKO_ID: "dos",
    DEX_SLUG: "dos-chain",
    GT_NETWORK: "dos-chain"
  },
  LLAMA_ID_MAP: {
    DOS: "coingecko:dos"
  }
});

function GET_WALLET_ASSETS_DOS_CHAIN(a,r,t,f,g){return _DOS_CHAIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_DOS_CHAIN(a){return _DOS_CHAIN.getCachedWalletAssets(a);}
function DOS_CHAIN_REFRESH_STATUS(a,r,t,f,g){return _DOS_CHAIN.getRefreshStatus(a,r,t,f,g);}
function DOS_CHAIN_STATS(a,t){return _DOS_CHAIN.getStats(a,t);}
