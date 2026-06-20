/**
 * DOGECHAIN.gs - Dogechain (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _DOGECHAIN = ChainFactory.createEvmChain("DOGECHAIN", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://2000.rpc.thirdweb.com",
      "https://rpc.dogechain.dog",
      "https://rpc01-sg.dogechain.dog",
      "https://rpc.ankr.com/dogechain"
    ]
  },
  CHAIN: {
    NAME: "Dogechain",
    CHAIN_ID: 2000,
    NATIVE_SYMBOL: "DOGE",
    NATIVE_NAME: "Dogechain Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:dogecoin",
    NATIVE_GECKO_ID: "dogecoin",
    DEX_SLUG: "dogechain",
    GT_NETWORK: "dogechain"
  },
  LLAMA_ID_MAP: {
    DOGE: "coingecko:dogecoin"
  }
});

function GET_WALLET_ASSETS_DOGECHAIN(a,r,t,f,g){return _DOGECHAIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_DOGECHAIN(a){return _DOGECHAIN.getCachedWalletAssets(a);}
function DOGECHAIN_REFRESH_STATUS(a,r,t,f,g){return _DOGECHAIN.getRefreshStatus(a,r,t,f,g);}
function DOGECHAIN_STATS(a,t){return _DOGECHAIN.getStats(a,t);}
