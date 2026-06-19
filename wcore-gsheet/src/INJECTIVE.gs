/**
 * INJECTIVE.gs - Injective (v4.11.2)
 * ChainFactory pattern with explicit function declarations
 * 
 * v4.11.2 - Refactored DIAG stubs to use CosmosDiagStubs
 * v4.9.6 FIX: CACHE_VERSION bump to invalidate broken caches from v4.9.5
 * v4.9.3 FIX: Native detection + IBC filtering
 * v4.9.2 FIX: Http.fetch -> Http.getJson
 * v4.9.1 FIX: Simplified signatures - RPC extracted from config.API.REST_URL
 */

var _INJECTIVE = ChainFactory.createCosmosChain("INJECTIVE", {
 CACHE_VERSION: 67, // Bumped for v4.9.6 fix - invalidates broken caches
 API: { REST_URL: "https://sentry.lcd.injective.network", LCD_URL: "https://sentry.lcd.injective.network", VERSION: "v1beta1" },
CHAIN: {
  VM: "COSMOS",
  NAME: "Injective",
  DISPLAY_NAME: "Ledger - Injective",
  CHAIN_ID: "injective-1",
  NATIVE_SYMBOL: "INJ",
 NATIVE_NAME: "Injective",
 NATIVE_DENOM: "inj",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:injective-protocol",
 NATIVE_GECKO_ID: "injective-protocol"
 },
 DENOM_DECIMALS: { "inj": 18 },
 DENOM_SYMBOLS: { "inj": "INJ" },
 LLAMA_ID_MAP: { "INJ": "coingecko:injective-protocol" }
});

// Main functions
function GET_WALLET_ASSETS_INJECTIVE(address, forceFull){return _INJECTIVE.getWalletAssets(address, forceFull);}
function CACHED_WALLET_ASSETS_INJECTIVE(address){return _INJECTIVE.getCachedWalletAssets(address);}
function INJECTIVE_REFRESH_STATUS(address, forceFull){return _INJECTIVE.getRefreshStatus(address, forceFull);}
function INJECTIVE_STATS(address, trigger){return _INJECTIVE.getStats(address, trigger);}

// Diagnostic stubs (use centralized CosmosDiagStubs)
function DIAG_INJECTIVE_TOKEN(w,t,r){void w;void t;void r;return CosmosDiagStubs.token();}
function DIAG_INJECTIVE_COMPARE_RPCS(w,t){void w;void t;return CosmosDiagStubs.compareRpcs();}
function DIAG_INJECTIVE_CHECK_ERC20(t){void t;return CosmosDiagStubs.checkErc20();}
function DIAG_INJECTIVE_RPC_HEALTH(){return CosmosDiagStubs.rpcHealth();}
function DIAG_INJECTIVE_NATIVE_BALANCE(w,r){void w;void r;return CosmosDiagStubs.nativeBalance("INJECTIVE");}
function DIAG_INJECTIVE_CACHE(w){void w;return CosmosDiagStubs.cache("INJECTIVE");}
function DIAG_INJECTIVE_CACHE_TOKEN(w,t){void w;void t;return CosmosDiagStubs.cacheToken();}
function DIAG_INJECTIVE_CACHE_ASSETS(w){void w;return CosmosDiagStubs.cacheAssets("INJECTIVE");}
function DIAG_INJECTIVE_TOKEN_PRICE(t){void t;return CosmosDiagStubs.tokenPrice();}
function DIAG_INJECTIVE_NATIVE_PRICE(){return CosmosDiagStubs.nativePrice(_INJECTIVE.getConfig());}
function DIAG_INJECTIVE_WALLET(w,r){void w;void r;return CosmosDiagStubs.wallet();}
function DIAG_INJECTIVE_CACHE_STATS(){return CosmosDiagStubs.cacheStats("INJECTIVE");}
function DIAG_INJECTIVE_CLEAR_CACHE(w,c){void w;void c;return CosmosDiagStubs.clearCache();}
