/**
 * COSMOS_HUB.gs - Cosmos Hub (v4.11.2)
 * ChainFactory pattern with explicit function declarations
 * 
 * v4.11.2 - Refactored DIAG stubs to use CosmosDiagStubs
 * v4.9.6 FIX: CACHE_VERSION bump to invalidate broken caches from v4.9.5
 * v4.9.3 FIX: Native detection + IBC filtering
 * v4.9.2 FIX: Http.fetch -> Http.getJson
 * v4.9.1 FIX: Simplified signatures - RPC extracted from config.API.REST_URL
 */

var _COSMOS_HUB = ChainFactory.createCosmosChain("COSMOS_HUB", {
 CACHE_VERSION: 67, // Bumped for v4.9.6 fix - invalidates broken caches
 API: {
 REST_URL: "https://cosmos-rest.publicnode.com",
 LCD_URL: "https://cosmos-rest.publicnode.com",
 RPC_URL: "https://cosmos-rpc.publicnode.com"
 },
 CHAIN: {
 VM: "COSMOS",
 NAME: "Cosmos Hub",
 DISPLAY_NAME: "Ledger - Cosmos Hub",
 CHAIN_ID: "cosmoshub-4",
 BECH32_PREFIX: "cosmos",
 NATIVE_SYMBOL: "ATOM",
 NATIVE_NAME: "Cosmos",
 NATIVE_DENOM: "uatom",
 NATIVE_DECIMALS: 6,
 INCLUDE_STAKED_NATIVE: true,
 NATIVE_LLAMA_ID: "coingecko:cosmos",
 NATIVE_GECKO_ID: "cosmos"
 },
 DENOM_DECIMALS: { "uatom": 6 },
 DENOM_SYMBOLS: { "uatom": "ATOM" },
 LLAMA_ID_MAP: { "ATOM": "coingecko:cosmos" }
});

// Main functions
function GET_WALLET_ASSETS_COSMOS_HUB(address, forceFull){return _COSMOS_HUB.getWalletAssets(address, forceFull);}
function CACHED_WALLET_ASSETS_COSMOS_HUB(address){return _COSMOS_HUB.getCachedWalletAssets(address);}
function COSMOS_HUB_REFRESH_STATUS(address, forceFull){return _COSMOS_HUB.getRefreshStatus(address, forceFull);}
function COSMOS_HUB_STATS(address, trigger){return _COSMOS_HUB.getStats(address, trigger);}

// Diagnostic stubs (use centralized CosmosDiagStubs)
function DIAG_COSMOS_HUB_TOKEN(w,t,r){void w;void t;void r;return CosmosDiagStubs.token();}
function DIAG_COSMOS_HUB_COMPARE_RPCS(w,t){void w;void t;return CosmosDiagStubs.compareRpcs();}
function DIAG_COSMOS_HUB_CHECK_ERC20(t){void t;return CosmosDiagStubs.checkErc20();}
function DIAG_COSMOS_HUB_RPC_HEALTH(){return CosmosDiagStubs.rpcHealth();}
function DIAG_COSMOS_HUB_NATIVE_BALANCE(w,r){void w;void r;return CosmosDiagStubs.nativeBalance("COSMOS_HUB");}
function DIAG_COSMOS_HUB_CACHE(w){void w;return CosmosDiagStubs.cache("COSMOS_HUB");}
function DIAG_COSMOS_HUB_CACHE_TOKEN(w,t){void w;void t;return CosmosDiagStubs.cacheToken();}
function DIAG_COSMOS_HUB_CACHE_ASSETS(w){void w;return CosmosDiagStubs.cacheAssets("COSMOS_HUB");}
function DIAG_COSMOS_HUB_TOKEN_PRICE(t){void t;return CosmosDiagStubs.tokenPrice();}
function DIAG_COSMOS_HUB_NATIVE_PRICE(){return CosmosDiagStubs.nativePrice(_COSMOS_HUB.getConfig());}
function DIAG_COSMOS_HUB_WALLET(w,r){void w;void r;return CosmosDiagStubs.wallet();}
function DIAG_COSMOS_HUB_CACHE_STATS(){return CosmosDiagStubs.cacheStats("COSMOS_HUB");}
function DIAG_COSMOS_HUB_CLEAR_CACHE(w,c){void w;void c;return CosmosDiagStubs.clearCache();}
