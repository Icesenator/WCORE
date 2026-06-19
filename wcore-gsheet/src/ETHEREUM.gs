/**
 * ETHEREUM.gs - Ethereum (v4.15.45)
 * ChainFactory pattern with explicit function declarations
 * 
 * v4.15.48: FIX explicit TOKEN_DECIMALS priority and add Ethereum non-18 tokens.
 * v4.15.45: FIX WBTC decimals — add TOKEN_DECIMALS to prevent fallback=18
 *   when RPC decimals() batch call fails (→ microscopic E-13 balance).
 * v4.13.1: FIX TOKEN SCAN SILENT DROP
 * - REMOVED: CONSENSUS_MIN_RPCS: 1, CONSENSUS_MAX_RPCS: 2
 *   These overrides capped RPC selection to 2 endpoints.
 *   When 1 failed (e.g. cloudflare "Internal error"), only 1 vote remained,
 *   which was insufficient for consensus (needs 2), causing ALL tokens
 *   to be silently dropped with rpcCalls=0 in diagnostics.
 * - Now uses system defaults: MIN=2, MAX=3 (from ChainFactory)
 * - With 3 RPCs, even if 1 fails, 2 can still reach consensus
 * 
 * v4.12.10: DIAG_ETHEREUM_RPC_TEST now uses generic DIAG_CHAIN_RPC_TEST
 * v4.12.2 - REMOVED eth.llamarpc.com (returns stale data)
 * v4.12.1 - Added Publicnode, MeowRPC, BlockPI endpoints (11 total)
 * v4.12.0 - Reordered by reliability, MAX_FAILURES=3, BLOCK=90s
 */

var _ETHEREUM = ChainFactory.createEvmChain("ETHEREUM", {
 CACHE_VERSION: 65,
 
 // v4.14.10: Tighter timeouts to fit within 30s GAS limit
 // Previous 3500ms HTTP timeout caused scan to exceed 30s with multiple phases
 TIMEOUTS: {
 MAX_EXECUTION_MS: 25000,
 HTTP_MS: 2500,
 SAFE_MARGIN_MS: 900,
 SAFE_SAVE_MARGIN_MS: 1400,
 SAFE_PRICE_MARGIN_MS: 4000,
 NATIVE_PRICE_MIN_LEFT_MS: 3500,
 HARD_GUARD_MS: 22000,
 HARD_PRICE_CUTOFF_MS: 3000,
 FAST_FAIL_MS: 2500
 },
 
 // v4.14.10: Trimmed to 5 fastest RPCs — 8 endpoints caused fetchAll to wait for slowest
 // Removed: mevblocker (637ms), nodies (253ms), ethereum.publicnode (duplicate of rpc.publicnode)
 // Kept: publicnode, drpc, 1rpc, tenderly, merkle — all <310ms from EU datacenter
 RPC: {
 ENDPOINTS: [
 "https://ethereum-rpc.publicnode.com",
 "https://eth.drpc.org",
 "https://1rpc.io/eth",
 "https://gateway.tenderly.co/public/mainnet",
 "https://eth.merkle.io"
 ],
 
  // v4.14.10: Cap consensus to 2 RPCs max — 3 sequential RPCs from GAS datacenter
  // exceeds 30s budget when combined with native + pricing phases.
  // With 5 diverse endpoints, 2 RPCs is sufficient for consensus.
  // v4.13.1 removed overrides because only 2 TOTAL RPCs were configured (1 fail = 0 consensus).
  // Now with 5 endpoints, failing 1 of 2 picked still allows retry with backup.
  CONSENSUS_MIN_RPCS: 2,
  CONSENSUS_MAX_RPCS: 2,

  // v4.15.48 FIX: explicit decimals must override stale cached meta decimals.
  // Some batch decimals() calls fail or old fallback=18 meta persists, making
  // non-18 tokens microscopic (WBTC/AICC/SNAP) until cache expiry.
  TOKEN_DECIMALS: {
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 6,  // USDC
    "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": 8,  // cbBTC
    "0x66a3c2fa3e467aa586e90912f977e648589cabaf": 8,  // AICC
    "0x49b5a631f54927c0007232844f06fe18cbf69786": 6,  // SNAP
    "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": 8   // WBTC
  },
  
  // Failure handling - tolerant for Ethereum mainnet
  MAX_FAILURES_BEFORE_BLOCK: 3,
  BLOCK_DURATION_MS: 90000,
  
  // Health monitoring
  HEALTH_CHECK_INTERVAL_MS: 300000
  },
 
 CHAIN: {
 NAME: "Ethereum",
 CHAIN_ID: 1,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "ethereum",
 GT_NETWORK: "eth"
 },
 
 LLAMA_ID_MAP: { 
 "AAVE": "coingecko:aave", 
 "DAI": "coingecko:dai", 
 "ETH": "coingecko:ethereum", 
 "LINK": "coingecko:chainlink", 
 "UNI": "coingecko:uniswap", 
 "USDC": "coingecko:usd-coin", 
 "USDT": "coingecko:tether", 
 "WBTC": "coingecko:wrapped-bitcoin", 
 "WETH": "coingecko:weth", 
 "cbETH": "coingecko:coinbase-wrapped-staked-eth", 
 "rETH": "coingecko:rocket-pool-eth", 
 "stETH": "coingecko:staked-ether",
 "RANGE": "coingecko:range-protocol"
 }
});

// ============================================================
// MAIN FUNCTIONS
// ============================================================

function GET_WALLET_ASSETS_ETHEREUM(a,r,t,f,g){return _ETHEREUM.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ETHEREUM(a){return _ETHEREUM.getCachedWalletAssets(a);}
function ETHEREUM_REFRESH_STATUS(a,r,t,f,g){return _ETHEREUM.getRefreshStatus(a,r,t,f,g);}
function ETHEREUM_STATS(a,t){return _ETHEREUM.getStats(a,t);}

// ============================================================
// DIAGNOSTIC FUNCTIONS
// ============================================================

function DIAG_ETHEREUM_TOKEN(w,t,r){return _ETHEREUM.diag.tokenBalance(w,t,r);}
function DIAG_ETHEREUM_COMPARE_RPCS(w,t){return _ETHEREUM.diag.compareRpcs(w,t);}
function DIAG_ETHEREUM_CHECK_ERC20(t){return _ETHEREUM.diag.checkErc20(t);}
function DIAG_ETHEREUM_RPC_HEALTH(){return _ETHEREUM.diag.rpcHealth();}
function DIAG_ETHEREUM_NATIVE_BALANCE(w){return _ETHEREUM.diag.nativeBalance(w);}
function DIAG_ETHEREUM_CACHE(w){return _ETHEREUM.diag.cacheInspect(w);}
function DIAG_ETHEREUM_CACHE_TOKEN(w,t){return _ETHEREUM.diag.cacheFindToken(w,t);}
function DIAG_ETHEREUM_CACHE_ASSETS(w){return _ETHEREUM.diag.cacheListAssets(w);}
function DIAG_ETHEREUM_TOKEN_PRICE(t){return _ETHEREUM.diag.tokenPrice(t);}
function DIAG_ETHEREUM_NATIVE_PRICE(){return _ETHEREUM.diag.nativePrice();}
function DIAG_ETHEREUM_WALLET(w){return _ETHEREUM.diag.walletFull(w);}
function DIAG_ETHEREUM_CACHE_STATS(){return _ETHEREUM.diag.cacheStats();}
function DIAG_ETHEREUM_CLEAR_CACHE(w,c){return _ETHEREUM.diag.clearCache(w,c);}

// ============================================================
// DIAGNOSTIC: RPC ENDPOINT TEST (v4.12.1)
// ============================================================

/**
 * Test all RPC endpoints individually
 * Usage: =DIAG_ETHEREUM_RPC_TEST()
 * Note: v4.12.10 uses generic DIAG_CHAIN_RPC_TEST (eth_chainId instead of eth_getBalance)
 */
function DIAG_ETHEREUM_RPC_TEST() {
  return DIAG_CHAIN_RPC_TEST("ETHEREUM");
}
