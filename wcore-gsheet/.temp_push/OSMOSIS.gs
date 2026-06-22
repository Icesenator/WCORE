/**
 * OSMOSIS.gs - Osmosis (v4.11.2)
 * ChainFactory pattern with explicit function declarations
 * 
 * v4.11.2 - Refactored DIAG stubs to use CosmosDiagStubs
 * v4.9.6 FIX: CACHE_VERSION bump to invalidate broken caches from v4.9.5
 * v4.9.3 FIX: Native detection + IBC filtering
 * v4.9.2 FIX: Http.fetch -> Http.getJson
 * v4.9.1 FIX: Simplified signatures - RPC extracted from config.API.REST_URL
 */

var _OSMOSIS = ChainFactory.createCosmosChain("OSMOSIS", {
 CACHE_VERSION: 67, // Bumped for v4.9.6 fix - invalidates broken caches
 API: { REST_URL: "https://osmosis-rest.publicnode.com", RPC_URL: "https://osmosis-rpc.publicnode.com" },
 CHAIN: {
 VM: "COSMOS",
 NAME: "Osmosis",
 DISPLAY_NAME: "Ledger - Osmosis",
 CHAIN_ID: "osmosis-1",
 BECH32_PREFIX: "osmo",
 NATIVE_SYMBOL: "OSMO",
 NATIVE_NAME: "Osmosis",
 NATIVE_DENOM: "uosmo",
 NATIVE_DECIMALS: 6,
 NATIVE_LLAMA_ID: "coingecko:osmosis",
 NATIVE_GECKO_ID: "osmosis"
 },
 DENOM_DECIMALS: { "uosmo": 6 },
 DENOM_SYMBOLS: { "uosmo": "OSMO" },
 LLAMA_ID_MAP: { "OSMO": "coingecko:osmosis" }
});

// Main functions
function GET_WALLET_ASSETS_OSMOSIS(address, forceFull){return _OSMOSIS.getWalletAssets(address, forceFull);}
function CACHED_WALLET_ASSETS_OSMOSIS(address){return _OSMOSIS.getCachedWalletAssets(address);}
function OSMOSIS_REFRESH_STATUS(address, forceFull){return _OSMOSIS.getRefreshStatus(address, forceFull);}
function OSMOSIS_STATS(address, trigger){return _OSMOSIS.getStats(address, trigger);}

// Diagnostic stubs (use centralized CosmosDiagStubs)
function DIAG_OSMOSIS_TOKEN(w,t,r){void w;void t;void r;return CosmosDiagStubs.token();}
function DIAG_OSMOSIS_COMPARE_RPCS(w,t){void w;void t;return CosmosDiagStubs.compareRpcs();}
function DIAG_OSMOSIS_CHECK_ERC20(t){void t;return CosmosDiagStubs.checkErc20();}
function DIAG_OSMOSIS_RPC_HEALTH(){return CosmosDiagStubs.rpcHealth();}
function DIAG_OSMOSIS_NATIVE_BALANCE(w,r){void w;void r;return CosmosDiagStubs.nativeBalance("OSMOSIS");}
function DIAG_OSMOSIS_CACHE(w){void w;return CosmosDiagStubs.cache("OSMOSIS");}
function DIAG_OSMOSIS_CACHE_TOKEN(w,t){void w;void t;return CosmosDiagStubs.cacheToken();}
function DIAG_OSMOSIS_CACHE_ASSETS(w){void w;return CosmosDiagStubs.cacheAssets("OSMOSIS");}
function DIAG_OSMOSIS_TOKEN_PRICE(t){void t;return CosmosDiagStubs.tokenPrice();}
function DIAG_OSMOSIS_NATIVE_PRICE(){return CosmosDiagStubs.nativePrice(_OSMOSIS.getConfig());}
function DIAG_OSMOSIS_WALLET(w,r){void w;void r;return CosmosDiagStubs.wallet();}
function DIAG_OSMOSIS_CACHE_STATS(){return CosmosDiagStubs.cacheStats("OSMOSIS");}
function DIAG_OSMOSIS_CLEAR_CACHE(w,c){void w;void c;return CosmosDiagStubs.clearCache();}
