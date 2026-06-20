/**
 * PLAYNANCE_PLAYBLOCK.gs - Playnance Playblock (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _PLAYNANCE_PLAYBLOCK = ChainFactory.createEvmChain("PLAYNANCE_PLAYBLOCK", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://1829.rpc.thirdweb.com",
      "https://rpc.playblock.io"
    ]
  },
  CHAIN: {
    NAME: "Playnance Playblock",
    CHAIN_ID: 1829,
    NATIVE_SYMBOL: "PAY",
    NATIVE_NAME: "Playnance Playblock Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:playnance",
    NATIVE_GECKO_ID: "play-2-earn",
    DEX_SLUG: "playnance-playblock",
    GT_NETWORK: "playnance-playblock"
  },
  LLAMA_ID_MAP: {
    PAY: "coingecko:playnance"
  }
});

function GET_WALLET_ASSETS_PLAYNANCE_PLAYBLOCK(a,r,t,f,g){return _PLAYNANCE_PLAYBLOCK.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_PLAYNANCE_PLAYBLOCK(a){return _PLAYNANCE_PLAYBLOCK.getCachedWalletAssets(a);}
function PLAYNANCE_PLAYBLOCK_REFRESH_STATUS(a,r,t,f,g){return _PLAYNANCE_PLAYBLOCK.getRefreshStatus(a,r,t,f,g);}
function PLAYNANCE_PLAYBLOCK_STATS(a,t){return _PLAYNANCE_PLAYBLOCK.getStats(a,t);}
