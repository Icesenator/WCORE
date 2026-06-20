/**
 * AEVO.gs - Aevo (v4.15.51)
 * Phase 3 port from wcore-web chain config.
 */

var _AEVO = ChainFactory.createEvmChain("AEVO", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://2999.rpc.thirdweb.com",
      "https://mainnet.bityuan.com/eth"
    ]
  },
  CHAIN: {
    NAME: "Aevo",
    CHAIN_ID: 2999,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Aevo Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "aevo",
    GT_NETWORK: "aevo"
  },
  LLAMA_ID_MAP: { ETH: "coingecko:ethereum" }
});

function GET_WALLET_ASSETS_AEVO(a,r,t,f,g){return _AEVO.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_AEVO(a){return _AEVO.getCachedWalletAssets(a);}
function AEVO_REFRESH_STATUS(a,r,t,f,g){return _AEVO.getRefreshStatus(a,r,t,f,g);}
function AEVO_STATS(a,t){return _AEVO.getStats(a,t);}
