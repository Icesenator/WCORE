/**
 * PROOF_OF_PLAY_APEX.gs - Proof of Play Apex (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _PROOF_OF_PLAY_APEX = ChainFactory.createEvmChain("PROOF_OF_PLAY_APEX", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://70700.rpc.thirdweb.com",
      "https://rpc.apex.proofofplay.com"
    ]
  },
  CHAIN: {
    NAME: "Proof of Play Apex",
    CHAIN_ID: 70700,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Proof of Play Apex Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "proof-of-play-apex",
    GT_NETWORK: "proof-of-play-apex"
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum"
  }
});

function GET_WALLET_ASSETS_PROOF_OF_PLAY_APEX(a,r,t,f,g){return _PROOF_OF_PLAY_APEX.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_PROOF_OF_PLAY_APEX(a){return _PROOF_OF_PLAY_APEX.getCachedWalletAssets(a);}
function PROOF_OF_PLAY_APEX_REFRESH_STATUS(a,r,t,f,g){return _PROOF_OF_PLAY_APEX.getRefreshStatus(a,r,t,f,g);}
function PROOF_OF_PLAY_APEX_STATS(a,t){return _PROOF_OF_PLAY_APEX.getStats(a,t);}
