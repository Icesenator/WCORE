/**
 * SHIMMER_EVM.gs - Shimmer EVM (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _SHIMMER_EVM = ChainFactory.createEvmChain("SHIMMER_EVM", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://148.rpc.thirdweb.com",
      "https://json-rpc.evm.shimmer.network"
    ]
  },
  CHAIN: {
    NAME: "Shimmer EVM",
    CHAIN_ID: 148,
    NATIVE_SYMBOL: "SMR",
    NATIVE_NAME: "Shimmer EVM Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:shimmer",
    NATIVE_GECKO_ID: "shimmer",
    DEX_SLUG: "shimmer-evm",
    GT_NETWORK: "shimmer-evm"
  },
  LLAMA_ID_MAP: {
    SMR: "coingecko:shimmer"
  }
});

function GET_WALLET_ASSETS_SHIMMER_EVM(a,r,t,f,g){return _SHIMMER_EVM.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_SHIMMER_EVM(a){return _SHIMMER_EVM.getCachedWalletAssets(a);}
function SHIMMER_EVM_REFRESH_STATUS(a,r,t,f,g){return _SHIMMER_EVM.getRefreshStatus(a,r,t,f,g);}
function SHIMMER_EVM_STATS(a,t){return _SHIMMER_EVM.getStats(a,t);}
