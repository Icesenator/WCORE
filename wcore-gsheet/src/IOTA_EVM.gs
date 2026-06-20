/**
 * IOTA_EVM.gs - IOTA EVM (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _IOTA_EVM = ChainFactory.createEvmChain("IOTA_EVM", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://8822.rpc.thirdweb.com",
      "https://json-rpc.evm.iotaledger.net"
    ]
  },
  CHAIN: {
    NAME: "IOTA EVM",
    CHAIN_ID: 8822,
    NATIVE_SYMBOL: "IOTA",
    NATIVE_NAME: "IOTA EVM Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:iota",
    NATIVE_GECKO_ID: "iota",
    DEX_SLUG: "iota-evm",
    GT_NETWORK: "iota-evm"
  },
  LLAMA_ID_MAP: {
    IOTA: "coingecko:iota"
  }
});

function GET_WALLET_ASSETS_IOTA_EVM(a,r,t,f,g){return _IOTA_EVM.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_IOTA_EVM(a){return _IOTA_EVM.getCachedWalletAssets(a);}
function IOTA_EVM_REFRESH_STATUS(a,r,t,f,g){return _IOTA_EVM.getRefreshStatus(a,r,t,f,g);}
function IOTA_EVM_STATS(a,t){return _IOTA_EVM.getStats(a,t);}
