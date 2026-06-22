/**
 * AIRDAO.gs - AirDAO (v4.15.51)
 * Phase 3 port from wcore-web chain config.
 */

var _AIRDAO = ChainFactory.createEvmChain("AIRDAO", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://16718.rpc.thirdweb.com",
      "https://network.ambrosus.io"
    ]
  },
  CHAIN: {
    NAME: "AirDAO",
    CHAIN_ID: 16718,
    NATIVE_SYMBOL: "AMB",
    NATIVE_NAME: "AirDAO Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ambrosus",
    NATIVE_GECKO_ID: "ambrosus",
    DEX_SLUG: "airdao",
    GT_NETWORK: "airdao"
  },
  LLAMA_ID_MAP: { AMB: "coingecko:ambrosus" }
});

function GET_WALLET_ASSETS_AIRDAO(a,r,t,f,g){return _AIRDAO.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_AIRDAO(a){return _AIRDAO.getCachedWalletAssets(a);}
function AIRDAO_REFRESH_STATUS(a,r,t,f,g){return _AIRDAO.getRefreshStatus(a,r,t,f,g);}
function AIRDAO_STATS(a,t){return _AIRDAO.getStats(a,t);}
