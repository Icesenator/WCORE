/**
 * NEON.gs - Neon (v4.15.51)
 * Phase 3 pilot port from wcore-web chain config.
 */

var _NEON = ChainFactory.createEvmChain("NEON", {
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: [
      "https://245022934.rpc.thirdweb.com",
      "https://neon-proxy-mainnet.solana.p2p.org",
      "https://neon-evm.drpc.org"
    ]
  },
  CHAIN: {
    NAME: "Neon",
    CHAIN_ID: 245022934,
    NATIVE_SYMBOL: "NEON",
    NATIVE_NAME: "Neon Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:neon",
    NATIVE_GECKO_ID: "neon",
    DEX_SLUG: "neon",
    GT_NETWORK: "neon"
  },
  LLAMA_ID_MAP: { NEON: "coingecko:neon" }
});

function GET_WALLET_ASSETS_NEON(a,r,t,f,g){return _NEON.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_NEON(a){return _NEON.getCachedWalletAssets(a);}
function NEON_REFRESH_STATUS(a,r,t,f,g){return _NEON.getRefreshStatus(a,r,t,f,g);}
function NEON_STATS(a,t){return _NEON.getStats(a,t);}
