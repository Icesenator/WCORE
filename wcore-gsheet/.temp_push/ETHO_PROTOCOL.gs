/**
 * ETHO_PROTOCOL.gs - Etho Protocol (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _ETHO_PROTOCOL = ChainFactory.createEvmChain("ETHO_PROTOCOL", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://1577.rpc.thirdweb.com"
    ]
  },
  CHAIN: {
    NAME: "Etho Protocol",
    CHAIN_ID: 1577,
    NATIVE_SYMBOL: "ETHO",
    NATIVE_NAME: "Etho Protocol Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:etho-protocol",
    NATIVE_GECKO_ID: "etho-protocol",
    DEX_SLUG: "etho-protocol",
    GT_NETWORK: "etho-protocol"
  },
  LLAMA_ID_MAP: {
    ETHO: "coingecko:etho-protocol"
  },
  FLAGS: {
    DISABLE_CHAIN: true
  }
});

function GET_WALLET_ASSETS_ETHO_PROTOCOL(a,r,t,f,g){return _ETHO_PROTOCOL.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ETHO_PROTOCOL(a){return _ETHO_PROTOCOL.getCachedWalletAssets(a);}
function ETHO_PROTOCOL_REFRESH_STATUS(a,r,t,f,g){return _ETHO_PROTOCOL.getRefreshStatus(a,r,t,f,g);}
function ETHO_PROTOCOL_STATS(a,t){return _ETHO_PROTOCOL.getStats(a,t);}
