/**
 * ZERO.gs - ZERO Network (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _ZERO = ChainFactory.createEvmChain("ZERO", {
  CACHE_VERSION: 67,
  TIMEOUTS: {
    MAX_EXECUTION_MS: 22000,
    HTTP_MS: 5000,
    SAFE_MARGIN_MS: 900,
    FAST_FAIL_MS: 4000
  },
  RPC: {
    ENDPOINTS: [
      "https://rpc.zerion.io/v1/zero",
      "https://543210.rpc.thirdweb.com"
    ],
    DISABLE_JSON_RPC_BATCH: true,
    MAX_LOG_RANGE: 5000,
    TOKEN_DECIMALS: {
      "0xf1f9e08a0818594fde4713ae0db1e46672ca960e": 8
    },
    MAX_FAILURES_BEFORE_BLOCK: 4,
    BLOCK_DURATION_MS: 45000,
    RETRY_COUNT: 2,
    RETRY_DELAY_MS: 500
  },
  CHAIN: {
    NAME: "ZERO Network",
    CHAIN_ID: 543210,
    NATIVE_SYMBOL: "ETH",
    NATIVE_NAME: "Ethereum",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:ethereum",
    NATIVE_GECKO_ID: "ethereum",
    DEX_SLUG: "zero-network",
    GT_NETWORK: "zero-network"
  },
  LLAMA_ID_MAP: {
    ETH: "coingecko:ethereum",
    USDC: "coingecko:usd-coin",
    WETH: "coingecko:weth"
  }
});

function GET_WALLET_ASSETS_ZERO(a,r,t,f,g){return _ZERO.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ZERO(a){return _ZERO.getCachedWalletAssets(a);}
function ZERO_REFRESH_STATUS(a,r,t,f,g){return _ZERO.getRefreshStatus(a,r,t,f,g);}
function ZERO_STATS(a,t){return _ZERO.getStats(a,t);}
