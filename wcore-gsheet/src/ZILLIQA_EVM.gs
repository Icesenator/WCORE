/**
 * ZILLIQA_EVM.gs - Zilliqa EVM (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _ZILLIQA_EVM = ChainFactory.createEvmChain("ZILLIQA_EVM", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://32769.rpc.thirdweb.com",
      "https://api.zilliqa.com"
    ]
  },
  CHAIN: {
    NAME: "Zilliqa EVM",
    CHAIN_ID: 32769,
    NATIVE_SYMBOL: "ZIL",
    NATIVE_NAME: "Zilliqa EVM Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:zilliqa",
    NATIVE_GECKO_ID: "zilliqa",
    DEX_SLUG: "zilliqa-evm",
    GT_NETWORK: "zilliqa-evm"
  },
  LLAMA_ID_MAP: {
    ZIL: "coingecko:zilliqa"
  }
});

function GET_WALLET_ASSETS_ZILLIQA_EVM(a,r,t,f,g){return _ZILLIQA_EVM.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ZILLIQA_EVM(a){return _ZILLIQA_EVM.getCachedWalletAssets(a);}
function ZILLIQA_EVM_REFRESH_STATUS(a,r,t,f,g){return _ZILLIQA_EVM.getRefreshStatus(a,r,t,f,g);}
function ZILLIQA_EVM_STATS(a,t){return _ZILLIQA_EVM.getStats(a,t);}
