/**
 * CREDITCOIN.gs - Creditcoin (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _CREDITCOIN = ChainFactory.createEvmChain("CREDITCOIN", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://102030.rpc.thirdweb.com",
      "https://mainnet3.creditcoin.network"
    ]
  },
  CHAIN: {
    NAME: "Creditcoin",
    CHAIN_ID: 102030,
    NATIVE_SYMBOL: "CTC",
    NATIVE_NAME: "Creditcoin Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:creditcoin",
    NATIVE_GECKO_ID: "creditcoin",
    DEX_SLUG: "creditcoin",
    GT_NETWORK: "creditcoin"
  },
  LLAMA_ID_MAP: {
    CTC: "coingecko:creditcoin"
  }
});

function GET_WALLET_ASSETS_CREDITCOIN(a,r,t,f,g){return _CREDITCOIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_CREDITCOIN(a){return _CREDITCOIN.getCachedWalletAssets(a);}
function CREDITCOIN_REFRESH_STATUS(a,r,t,f,g){return _CREDITCOIN.getRefreshStatus(a,r,t,f,g);}
function CREDITCOIN_STATS(a,t){return _CREDITCOIN.getStats(a,t);}
