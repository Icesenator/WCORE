/**
 * BXN.gs - BXN (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _BXN = ChainFactory.createEvmChain("BXN", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://488.rpc.thirdweb.com",
      "https://rpc.blackfort.network/mainnet/rpc"
    ]
  },
  CHAIN: {
    NAME: "BXN",
    CHAIN_ID: 488,
    NATIVE_SYMBOL: "BXN",
    NATIVE_NAME: "BXN Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: null,
    NATIVE_GECKO_ID: null,
    DEX_SLUG: "bxn",
    GT_NETWORK: "bxn"
  },
  LLAMA_ID_MAP: {}
});

function GET_WALLET_ASSETS_BXN(a,r,t,f,g){return _BXN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_BXN(a){return _BXN.getCachedWalletAssets(a);}
function BXN_REFRESH_STATUS(a,r,t,f,g){return _BXN.getRefreshStatus(a,r,t,f,g);}
function BXN_STATS(a,t){return _BXN.getStats(a,t);}
