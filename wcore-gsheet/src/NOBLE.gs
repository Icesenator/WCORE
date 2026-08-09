/**
 * NOBLE.gs - Noble (v4.16.42)
 * Phase 3 bulk port from wcore-web chain config.
 *
 * v4.16.42 - noble-rest.publicnode.com returns HTTP 404 on every Cosmos module
 *            route (blocks, bank, staking), so the single configured LCD could not
 *            serve a scan. Added REST_URLS failover with two endpoints verified on
 *            the bank and staking routes actually used by the engine. The dead
 *            endpoint is kept last rather than removed.
 */

var _NOBLE = ChainFactory.createCosmosChain("NOBLE", {
  CACHE_VERSION: 67,
  API: {
    REST_URL: "https://noble-api.polkachu.com",
    REST_URLS: [
      "https://noble-api.polkachu.com",
      "https://rest.cosmos.directory/noble",
      "https://noble-rest.publicnode.com"
    ],
    RPC_URL: "https://noble-rpc.publicnode.com"
  },
  CHAIN: {
    VM: "COSMOS",
    NAME: "Noble",
    DISPLAY_NAME: "Ledger - Noble",
    CHAIN_ID: "noble-1",
    BECH32_PREFIX: "noble",
    NATIVE_SYMBOL: "USDC",
    NATIVE_NAME: "Noble USDC",
    NATIVE_DENOM: "uusdc",
    NATIVE_DECIMALS: 6,
    NATIVE_LLAMA_ID: "coingecko:usd-coin",
    NATIVE_GECKO_ID: "usd-coin"
  },
  DENOM_DECIMALS: {
    uusdc: 6
  },
  DENOM_SYMBOLS: {
    uusdc: "USDC"
  },
  LLAMA_ID_MAP: {
    USDC: "coingecko:usd-coin"
  }
});

function GET_WALLET_ASSETS_NOBLE(a,r,t,f,g){return _NOBLE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_NOBLE(a){return _NOBLE.getCachedWalletAssets(a);}
function NOBLE_REFRESH_STATUS(a,r,t,f,g){return _NOBLE.getRefreshStatus(a,r,t,f,g);}
function NOBLE_STATS(a,t){return _NOBLE.getStats(a,t);}
