/**
 * WORLD_MOBILE.gs - World Mobile (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _WORLD_MOBILE = ChainFactory.createEvmChain("WORLD_MOBILE", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://869.rpc.thirdweb.com",
      "https://worldmobilechain-mainnet.g.alchemy.com/public"
    ]
  },
  CHAIN: {
    NAME: "World Mobile",
    CHAIN_ID: 869,
    NATIVE_SYMBOL: "WMTX",
    NATIVE_NAME: "World Mobile Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:world-mobile-token",
    NATIVE_GECKO_ID: "world-mobile-token",
    DEX_SLUG: "world-mobile",
    GT_NETWORK: "world-mobile"
  },
  LLAMA_ID_MAP: {
    WMTX: "coingecko:world-mobile-token"
  }
});

function GET_WALLET_ASSETS_WORLD_MOBILE(a,r,t,f,g){return _WORLD_MOBILE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_WORLD_MOBILE(a){return _WORLD_MOBILE.getCachedWalletAssets(a);}
function WORLD_MOBILE_REFRESH_STATUS(a,r,t,f,g){return _WORLD_MOBILE.getRefreshStatus(a,r,t,f,g);}
function WORLD_MOBILE_STATS(a,t){return _WORLD_MOBILE.getStats(a,t);}
