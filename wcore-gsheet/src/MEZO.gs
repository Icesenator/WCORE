/**
 * MEZO.gs - Mezo (v4.12.0)
 * ChainFactory pattern with explicit function declarations
 * 
 * v4.12.0 RPC OPTIMIZATION:
 * - FIXED: Chain ID corrected from 31611 (testnet) to 31612 (mainnet)
 * - Added 3 official mainnet RPC endpoints (Boar, Imperator, ValidationCloud)
 * - Added failure tolerance settings
 * - CACHE_VERSION: 63 (aligned with WCORE_VM_CACHE_VERSIONS.EVM)
 * 
 * Mezo is a Bitcoin L2 (EVM-compatible) using BTC as native gas token.
 */

var _MEZO = ChainFactory.createEvmChain("MEZO", {
 CACHE_VERSION: 63,
 
 // Extended timeouts for Bitcoin L2
 TIMEOUTS: {
 MAX_EXECUTION_MS: 22000,
 HTTP_MS: 5000,
 SAFE_MARGIN_MS: 900
 },
 
 RPC: { 
 ENDPOINTS: [
 // Tier 1: Official Mezo RPCs from documentation
 "https://rpc-http.mezo.boar.network",
 "https://mainnet.mezo.public.validationcloud.io",
 
 // Tier 2: Third-party aggregator
 "https://mezo.drpc.org",
 
 // Tier 3: Alternative official
 "https://rpc_evm-mezo.imperator.co"
 ],
 
 // Tolerant failure handling for Bitcoin L2
 MAX_FAILURES_BEFORE_BLOCK: 3,
 BLOCK_DURATION_MS: 60000 // 60s block
 },
 
 CHAIN: {
 NAME: "Mezo",
 // v4.12.0 FIX: Correct mainnet chain ID (was 31611 = testnet)
 CHAIN_ID: 31612,
 NATIVE_SYMBOL: "BTC",
 NATIVE_NAME: "Bitcoin",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:bitcoin",
 NATIVE_GECKO_ID: "bitcoin",
 DEX_SLUG: "mezo",
 GT_NETWORK: "mezo"
 },
 
 LLAMA_ID_MAP: { 
 "BTC": "coingecko:bitcoin", 
 "USDC": "coingecko:usd-coin", 
 "USDT": "coingecko:tether", 
 "WBTC": "coingecko:wrapped-bitcoin",
 "MUSD": "coingecko:musd"
 }
});

// ============================================================
// MAIN FUNCTIONS
// ============================================================

function GET_WALLET_ASSETS_MEZO(a,r,t,f,g){return _MEZO.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_MEZO(a){return _MEZO.getCachedWalletAssets(a);}
function MEZO_REFRESH_STATUS(a,r,t,f,g){return _MEZO.getRefreshStatus(a,r,t,f,g);}
function MEZO_STATS(a,t){return _MEZO.getStats(a,t);}

// ============================================================
// DIAGNOSTIC FUNCTIONS
// ============================================================

function DIAG_MEZO_TOKEN(w,t,r){return _MEZO.diag.tokenBalance(w,t,r);}
function DIAG_MEZO_COMPARE_RPCS(w,t){return _MEZO.diag.compareRpcs(w,t);}
function DIAG_MEZO_CHECK_ERC20(t){return _MEZO.diag.checkErc20(t);}
function DIAG_MEZO_RPC_HEALTH(){return _MEZO.diag.rpcHealth();}
function DIAG_MEZO_NATIVE_BALANCE(w){return _MEZO.diag.nativeBalance(w);}
function DIAG_MEZO_CACHE(w){return _MEZO.diag.cacheInspect(w);}
function DIAG_MEZO_CACHE_TOKEN(w,t){return _MEZO.diag.cacheFindToken(w,t);}
function DIAG_MEZO_CACHE_ASSETS(w){return _MEZO.diag.cacheListAssets(w);}
function DIAG_MEZO_TOKEN_PRICE(t){return _MEZO.diag.tokenPrice(t);}
function DIAG_MEZO_NATIVE_PRICE(){return _MEZO.diag.nativePrice();}
function DIAG_MEZO_WALLET(w){return _MEZO.diag.walletFull(w);}
function DIAG_MEZO_CACHE_STATS(){return _MEZO.diag.cacheStats();}
function DIAG_MEZO_CLEAR_CACHE(w,c){return _MEZO.diag.clearCache(w,c);}
