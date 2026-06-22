/**
 * ETHEREUM_CLASSIC.gs - Ethereum Classic (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _ETHEREUM_CLASSIC = ChainFactory.createEvmChain("ETHEREUM_CLASSIC", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://61.rpc.thirdweb.com",
      "https://etc.rivet.link",
      "https://besu-at.etc-network.info",
      "https://geth-at.etc-network.info",
      "https://etc.etcdesktop.com"
    ]
  },
  CHAIN: {
    NAME: "Ethereum Classic",
    CHAIN_ID: 61,
    NATIVE_SYMBOL: "ETC",
    NATIVE_NAME: "Ethereum Classic Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum-classic",
    NATIVE_GECKO_ID: "ethereum-classic",
    DEX_SLUG: "ethereum-classic",
    GT_NETWORK: "ethereum-classic"
  },
  LLAMA_ID_MAP: {
    ETC: "coingecko:ethereum-classic"
  }
});

function GET_WALLET_ASSETS_ETHEREUM_CLASSIC(a,r,t,f,g){return _ETHEREUM_CLASSIC.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ETHEREUM_CLASSIC(a){return _ETHEREUM_CLASSIC.getCachedWalletAssets(a);}
function ETHEREUM_CLASSIC_REFRESH_STATUS(a,r,t,f,g){return _ETHEREUM_CLASSIC.getRefreshStatus(a,r,t,f,g);}
function ETHEREUM_CLASSIC_STATS(a,t){return _ETHEREUM_CLASSIC.getStats(a,t);}
