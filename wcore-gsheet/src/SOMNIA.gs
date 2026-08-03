/**
 * SOMNIA.gs - Somnia (v4.16.42)
 * ChainFactory pattern with explicit function declarations
 *
 * v4.16.43 - Capped eth_getLogs and reordered endpoints. With the chainId fixed, the
 *            first real scan surfaced what that bug had been masking: no MAX_LOG_RANGE
 *            was set, so the engine asked for a window far beyond what the chain
 *            accepts and every discovery failed with "block range exceeds 1000".
 *            Measured on api.infra.mainnet.somnia.network: a span of 1000 is accepted,
 *            1001 is rejected. 999 is used to keep a margin on the endpoints whose own
 *            limit could not be measured. Both publicnode hosts answer HTTP 403 from
 *            Railway while working elsewhere, so they are demoted, not removed, and
 *            stakely is demoted too since it fails to connect from either location.
 * v4.16.42 - CHAIN_ID corrected from 50311 to 5031. All five configured RPCs
 *            answer eth_chainId with 0x13a7 (5031); 50311 matched no endpoint,
 *            so every consensus check on the chainId failed silently.
 */

var _SOMNIA = ChainFactory.createEvmChain("SOMNIA", {
 CACHE_VERSION: 63,
 RPC: {
  ENDPOINTS: [
   "https://api.infra.mainnet.somnia.network",
   "https://5031.rpc.thirdweb.com",
   // DEMOTED v4.16.43: HTTP 403 from Railway datacenter IPs, functional elsewhere.
   "https://somnia-rpc.publicnode.com",
   "https://somnia.publicnode.com",
   "https://somnia-json-rpc.stakely.io"
  ],
  MAX_LOG_RANGE: 999
 },
 CHAIN: {
 NAME: "Somnia",
 CHAIN_ID: 5031,
 NATIVE_SYMBOL: "STT",
 NATIVE_NAME: "Somnia Token",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:somnia",
 NATIVE_GECKO_ID: "somnia",
 DEX_SLUG: "somnia",
 GT_NETWORK: "somnia"
 },
 LLAMA_ID_MAP: { "STT":"coingecko:somnia", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether" }
});

// Main functions
function GET_WALLET_ASSETS_SOMNIA(a,r,t,f,g){return _SOMNIA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_SOMNIA(a){return _SOMNIA.getCachedWalletAssets(a);}
function SOMNIA_REFRESH_STATUS(a,r,t,f,g){return _SOMNIA.getRefreshStatus(a,r,t,f,g);}
function SOMNIA_STATS(a,t){return _SOMNIA.getStats(a,t);}

// Diagnostic functions
function DIAG_SOMNIA_TOKEN(w,t,r){return _SOMNIA.diag.tokenBalance(w,t,r);}
function DIAG_SOMNIA_COMPARE_RPCS(w,t){return _SOMNIA.diag.compareRpcs(w,t);}
function DIAG_SOMNIA_CHECK_ERC20(t){return _SOMNIA.diag.checkErc20(t);}
function DIAG_SOMNIA_RPC_HEALTH(){return _SOMNIA.diag.rpcHealth();}
function DIAG_SOMNIA_NATIVE_BALANCE(w){return _SOMNIA.diag.nativeBalance(w);}
function DIAG_SOMNIA_CACHE(w){return _SOMNIA.diag.cacheInspect(w);}
function DIAG_SOMNIA_CACHE_TOKEN(w,t){return _SOMNIA.diag.cacheFindToken(w,t);}
function DIAG_SOMNIA_CACHE_ASSETS(w){return _SOMNIA.diag.cacheListAssets(w);}
function DIAG_SOMNIA_TOKEN_PRICE(t){return _SOMNIA.diag.tokenPrice(t);}
function DIAG_SOMNIA_NATIVE_PRICE(){return _SOMNIA.diag.nativePrice();}
function DIAG_SOMNIA_WALLET(w){return _SOMNIA.diag.walletFull(w);}
function DIAG_SOMNIA_CACHE_STATS(){return _SOMNIA.diag.cacheStats();}
function DIAG_SOMNIA_CLEAR_CACHE(w,c){return _SOMNIA.diag.clearCache(w,c);}
