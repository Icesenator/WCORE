/**
 * ARENA_Z.gs - Arena-Z (v4.15.51)
 * Phase 3 port from wcore-web chain config.
 */

var _ARENA_Z = ChainFactory.createEvmChain("ARENA_Z", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://7897.rpc.thirdweb.com",
      "https://rpc.arena-z.gg"
    ]
  },
  CHAIN: {
    NAME: "Arena-Z",
    CHAIN_ID: 7897,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Arena-Z Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "arena-z",
    GT_NETWORK: "arena-z"
  },
  LLAMA_ID_MAP: { ETH: "coingecko:ethereum" }
});

function GET_WALLET_ASSETS_ARENA_Z(a,r,t,f,g){return _ARENA_Z.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ARENA_Z(a){return _ARENA_Z.getCachedWalletAssets(a);}
function ARENA_Z_REFRESH_STATUS(a,r,t,f,g){return _ARENA_Z.getRefreshStatus(a,r,t,f,g);}
function ARENA_Z_STATS(a,t){return _ARENA_Z.getStats(a,t);}
