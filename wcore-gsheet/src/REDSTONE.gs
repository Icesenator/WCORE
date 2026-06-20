/**
 * REDSTONE.gs - Redstone (v4.15.51)
 * Phase 3 pilot port from wcore-web chain config.
 */

var _REDSTONE = ChainFactory.createEvmChain("REDSTONE", {
  CACHE_VERSION: 63,
  RPC: {
    ENDPOINTS: [
      "https://rpc.redstonechain.com",
      "https://690.rpc.thirdweb.com"
    ]
  },
  CHAIN: {
    NAME: "Redstone",
    CHAIN_ID: 690,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ether",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "redstone",
    GT_NETWORK: "redstone"
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
    USDC: "coingecko:usd-coin",
    WETH: "coingecko:weth"
  }
});

function GET_WALLET_ASSETS_REDSTONE(a,r,t,f,g){return _REDSTONE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_REDSTONE(a){return _REDSTONE.getCachedWalletAssets(a);}
function REDSTONE_REFRESH_STATUS(a,r,t,f,g){return _REDSTONE.getRefreshStatus(a,r,t,f,g);}
function REDSTONE_STATS(a,t){return _REDSTONE.getStats(a,t);}
