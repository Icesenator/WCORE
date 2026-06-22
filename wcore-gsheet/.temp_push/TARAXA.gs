/**
 * TARAXA.gs - Taraxa (v4.15.51)
 * Phase 3 pilot port from wcore-web chain config.
 */

var _TARAXA = ChainFactory.createEvmChain("TARAXA", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://841.rpc.thirdweb.com",
      "https://rpc.mainnet.taraxa.io/",
      "https://ws.mainnet.taraxa.io"
    ]
  },
  CHAIN: {
    NAME: "Taraxa",
    CHAIN_ID: 841,
    NATIVE_SYMBOL: "TARA",
    NATIVE_NAME: "Taraxa Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:taraxa",
    NATIVE_GECKO_ID: "taraxa",
    DEX_SLUG: "taraxa",
    GT_NETWORK: "taraxa"
  },
  LLAMA_ID_MAP: { TARA: "coingecko:taraxa" }
});

function GET_WALLET_ASSETS_TARAXA(a,r,t,f,g){return _TARAXA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_TARAXA(a){return _TARAXA.getCachedWalletAssets(a);}
function TARAXA_REFRESH_STATUS(a,r,t,f,g){return _TARAXA.getRefreshStatus(a,r,t,f,g);}
function TARAXA_STATS(a,t){return _TARAXA.getStats(a,t);}
