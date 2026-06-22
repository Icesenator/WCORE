/**
 * ZORA.gs - Zora (v4.12.0)
 * ChainFactory pattern with explicit function declarations
 * 
 * v4.12.0 RPC OPTIMIZATION:
 * - Added 1RPC privacy-focused endpoint
 * - Added publicnode endpoint
 * - Reordered by measured reliability
 * - Added failure tolerance settings
 * - CACHE_VERSION: 63 (aligned with WCORE_VM_CACHE_VERSIONS.EVM)
 */

var _ZORA = ChainFactory.createEvmChain("ZORA", {
 CACHE_VERSION: 63,
 
 // Extended timeouts for OP Stack chain
 TIMEOUTS: {
 MAX_EXECUTION_MS: 20000,
 HTTP_MS: 4000,
 SAFE_MARGIN_MS: 800
 },
 
 RPC: { 
 ENDPOINTS: [
 // Tier 1: Official endpoint (most reliable)
 "https://rpc.zora.energy",
 
 // Tier 2: Third-party reliable
 "https://zora.drpc.org",
 "https://1rpc.io/zora",
 
 // Tier 3: Alternative endpoints
 "https://rpc.ankr.com/zora",
 "https://zora-mainnet.public.blastapi.io",
 "https://7777777.rpc.thirdweb.com"
 ],
 
 // More tolerant failure handling
 MAX_FAILURES_BEFORE_BLOCK: 3,
 BLOCK_DURATION_MS: 60000 // 60s block (faster recovery)
 },
 
 CHAIN: {
 NAME: "Zora",
 CHAIN_ID: 7777777,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ethereum",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "zora",
 GT_NETWORK: "zora-network"
 },
 
 LLAMA_ID_MAP: { 
 "ETH": "coingecko:ethereum",
 "USDC": "coingecko:usd-coin",
 "WETH": "coingecko:weth"
 }
});

// ============================================================
// MAIN FUNCTIONS
// ============================================================

function GET_WALLET_ASSETS_ZORA(a,r,t,f,g){return _ZORA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ZORA(a){return _ZORA.getCachedWalletAssets(a);}
function ZORA_REFRESH_STATUS(a,r,t,f,g){return _ZORA.getRefreshStatus(a,r,t,f,g);}
function ZORA_STATS(a,t){return _ZORA.getStats(a,t);}

// ============================================================
// DIAGNOSTIC FUNCTIONS
// ============================================================

function DIAG_ZORA_TOKEN(w,t,r){return _ZORA.diag.tokenBalance(w,t,r);}
function DIAG_ZORA_COMPARE_RPCS(w,t){return _ZORA.diag.compareRpcs(w,t);}
function DIAG_ZORA_CHECK_ERC20(t){return _ZORA.diag.checkErc20(t);}
function DIAG_ZORA_RPC_HEALTH(){return _ZORA.diag.rpcHealth();}
function DIAG_ZORA_NATIVE_BALANCE(w){return _ZORA.diag.nativeBalance(w);}
function DIAG_ZORA_CACHE(w){return _ZORA.diag.cacheInspect(w);}
function DIAG_ZORA_CACHE_TOKEN(w,t){return _ZORA.diag.cacheFindToken(w,t);}
function DIAG_ZORA_CACHE_ASSETS(w){return _ZORA.diag.cacheListAssets(w);}
function DIAG_ZORA_TOKEN_PRICE(t){return _ZORA.diag.tokenPrice(t);}
function DIAG_ZORA_NATIVE_PRICE(){return _ZORA.diag.nativePrice();}
function DIAG_ZORA_WALLET(w){return _ZORA.diag.walletFull(w);}
function DIAG_ZORA_CACHE_STATS(){return _ZORA.diag.cacheStats();}
function DIAG_ZORA_CLEAR_CACHE(w,c){return _ZORA.diag.clearCache(w,c);}
