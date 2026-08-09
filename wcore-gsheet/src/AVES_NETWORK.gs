/**
 * AVES_NETWORK.gs - Aves Network (v4.15.51)
 * Phase 3 port from wcore-web chain config.
 */

// 2026-08-02: chain disabled, the config points at the wrong network.
// chainId 3333 is "EthStorage Testnet" in the chain registry, not Aves. Aves Mainnet
// is chainId 33333 with native AVS (not AVES) and its only RPC, rpc.avescoin.io, times
// out. The configured 3333.rpc.thirdweb.com is dead too ("We are not able to process
// your request", 3 probes out of 3), which is the only reason the mismatch never
// surfaced: if that proxy ever came back, WCORE would scan a TESTNET and label it Aves,
// violating the no-testnets rule. GeckoTerminal has no "aves-network" network either,
// so pricing could not resolve. Not tracked in the spreadsheet and absent from the web
// default chains. Re-enable only with chainId 33333, symbol AVS and a verified RPC.
var _AVES_NETWORK = ChainFactory.createEvmChain("AVES_NETWORK", {
  CACHE_VERSION: 1,
  FLAGS: { DISABLE_CHAIN: true },
  RPC: {
    ENDPOINTS: [
      "https://3333.rpc.thirdweb.com"
    ]
  },
  CHAIN: {
    NAME: "Aves Network",
    CHAIN_ID: 3333,
    NATIVE_SYMBOL: "AVES",
    NATIVE_NAME: "Aves Network Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: "coingecko:aves",
    NATIVE_GECKO_ID: "aves",
    DEX_SLUG: "aves-network",
    GT_NETWORK: "aves-network"
  },
  LLAMA_ID_MAP: { AVES: "coingecko:aves" }
});

function GET_WALLET_ASSETS_AVES_NETWORK(a,r,t,f,g){return _AVES_NETWORK.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_AVES_NETWORK(a){return _AVES_NETWORK.getCachedWalletAssets(a);}
function AVES_NETWORK_REFRESH_STATUS(a,r,t,f,g){return _AVES_NETWORK.getRefreshStatus(a,r,t,f,g);}
function AVES_NETWORK_STATS(a,t){return _AVES_NETWORK.getStats(a,t);}
