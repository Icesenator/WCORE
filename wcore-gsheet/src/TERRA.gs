/**
 * TERRA.gs - Terra Phoenix (v4.11.2)
 * ChainFactory pattern with explicit function declarations
 * 
 * v4.11.2 - Refactored DIAG stubs to use CosmosDiagStubs
 * v4.9.6 FIX: CACHE_VERSION bump to invalidate broken caches from v4.9.5
 * v4.9.3 FIX: Native detection + IBC filtering
 * v4.9.2 FIX: Http.fetch -> Http.getJson
 * v4.9.1 FIX: Simplified signatures - RPC extracted from config.API.REST_URL
 */

var _TERRA = ChainFactory.createCosmosChain("TERRA", {
 CACHE_VERSION: 67, // Bumped for v4.9.6 fix - invalidates broken caches
 API: {
 REST_URL: "https://terra-rest.publicnode.com",
 LCD_URL: "https://terra-rest.publicnode.com",
 RPC_URL: "https://terra-rpc.publicnode.com"
 },
 CHAIN: {
 VM: "COSMOS",
 NAME: "Terra",
 DISPLAY_NAME: "Ledger - Terra",
 CHAIN_ID: "phoenix-1",
 BECH32_PREFIX: "terra",
 NATIVE_SYMBOL: "LUNA",
 NATIVE_NAME: "Terra Luna",
 NATIVE_DENOM: "uluna",
 NATIVE_DECIMALS: 6,
 INCLUDE_STAKED_NATIVE: true,
 NATIVE_LLAMA_ID: "coingecko:terra-luna-2",
 NATIVE_GECKO_ID: "terra-luna-2"
 },
 DENOM_DECIMALS: { "uluna": 6 },
 DENOM_SYMBOLS: { "uluna": "LUNA" },
 LLAMA_ID_MAP: { "LUNA": "coingecko:terra-luna-2" }
});

// Main functions
function GET_WALLET_ASSETS_TERRA(address, forceFull){return _TERRA.getWalletAssets(address, forceFull);}
function CACHED_WALLET_ASSETS_TERRA(address){return _TERRA.getCachedWalletAssets(address);}
function TERRA_REFRESH_STATUS(address, forceFull){return _TERRA.getRefreshStatus(address, forceFull);}
function TERRA_STATS(address, trigger){return _TERRA.getStats(address, trigger);}

// Diagnostic stubs (use centralized CosmosDiagStubs)
function DIAG_TERRA_TOKEN(w,t,r){void w;void t;void r;return CosmosDiagStubs.token();}
function DIAG_TERRA_COMPARE_RPCS(w,t){void w;void t;return CosmosDiagStubs.compareRpcs();}
function DIAG_TERRA_CHECK_ERC20(t){void t;return CosmosDiagStubs.checkErc20();}
function DIAG_TERRA_RPC_HEALTH(){return CosmosDiagStubs.rpcHealth();}
function DIAG_TERRA_NATIVE_BALANCE(w,r){void w;void r;return CosmosDiagStubs.nativeBalance("TERRA");}
function DIAG_TERRA_CACHE(w){void w;return CosmosDiagStubs.cache("TERRA");}
function DIAG_TERRA_CACHE_TOKEN(w,t){void w;void t;return CosmosDiagStubs.cacheToken();}
function DIAG_TERRA_CACHE_ASSETS(w){void w;return CosmosDiagStubs.cacheAssets("TERRA");}
function DIAG_TERRA_TOKEN_PRICE(t){void t;return CosmosDiagStubs.tokenPrice();}
function DIAG_TERRA_NATIVE_PRICE(){return CosmosDiagStubs.nativePrice(_TERRA.getConfig());}
function DIAG_TERRA_WALLET(w,r){void w;void r;return CosmosDiagStubs.wallet();}
function DIAG_TERRA_CACHE_STATS(){return CosmosDiagStubs.cacheStats("TERRA");}
function DIAG_TERRA_CLEAR_CACHE(w,c){void w;void c;return CosmosDiagStubs.clearCache();}
