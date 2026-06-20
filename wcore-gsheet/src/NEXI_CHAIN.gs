/**
 * NEXI_CHAIN.gs - Nexi Chain (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _NEXI_CHAIN = ChainFactory.createEvmChain("NEXI_CHAIN", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://4242.rpc.thirdweb.com",
      "https://rpc.chain.nexi.technology/",
      "https://chain.nexilix.com",
      "https://chain.nexi.evmnode.online"
    ]
  },
  CHAIN: {
    NAME: "Nexi Chain",
    CHAIN_ID: 4242,
    NATIVE_SYMBOL: "NEXI",
    NATIVE_NAME: "Nexi Chain Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:nexi",
    NATIVE_GECKO_ID: "nexi",
    DEX_SLUG: "nexi-chain",
    GT_NETWORK: "nexi-chain"
  },
  LLAMA_ID_MAP: {
    NEXI: "coingecko:nexi"
  }
});

function GET_WALLET_ASSETS_NEXI_CHAIN(a,r,t,f,g){return _NEXI_CHAIN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_NEXI_CHAIN(a){return _NEXI_CHAIN.getCachedWalletAssets(a);}
function NEXI_CHAIN_REFRESH_STATUS(a,r,t,f,g){return _NEXI_CHAIN.getRefreshStatus(a,r,t,f,g);}
function NEXI_CHAIN_STATS(a,t){return _NEXI_CHAIN.getStats(a,t);}
