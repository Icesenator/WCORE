/**
 * FVM.gs - Filecoin Virtual Machine (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _FVM = ChainFactory.createEvmChain("FVM", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://314.rpc.thirdweb.com",
      "https://api.node.glif.io/",
      "https://rpc.ankr.com/filecoin",
      "https://filecoin-mainnet.chainstacklabs.com/rpc/v1",
      "https://filfox.info/rpc/v1"
    ]
  },
  CHAIN: {
    NAME: "Filecoin Virtual Machine",
    CHAIN_ID: 314,
    NATIVE_SYMBOL: "FIL",
    NATIVE_NAME: "Filecoin Virtual Machine Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:filecoin",
    NATIVE_GECKO_ID: "filecoin",
    DEX_SLUG: "filecoin",
    GT_NETWORK: "filecoin"
  },
  LLAMA_ID_MAP: {
    FIL: "coingecko:filecoin"
  }
});

function GET_WALLET_ASSETS_FVM(a,r,t,f,g){return _FVM.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_FVM(a){return _FVM.getCachedWalletAssets(a);}
function FVM_REFRESH_STATUS(a,r,t,f,g){return _FVM.getRefreshStatus(a,r,t,f,g);}
function FVM_STATS(a,t){return _FVM.getStats(a,t);}
