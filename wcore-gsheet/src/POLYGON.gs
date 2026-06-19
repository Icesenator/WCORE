/**
 * POLYGON.gs - Polygon (v4.12.8)
 * ChainFactory pattern with explicit function declarations
 * 
 * v4.15.2 - REMOVED polygon-rpc.com (returns "API key disabled" permanently)
 *
 * v4.12.8 - REMOVED polygon.llamarpc.com (returns stale data)
 *
 * v4.12.7 - Optimized RPC list with verified endpoints
 * - Added polygon.publicnode.com (very reliable)
 * - Reordered by reliability and speed
 * - Removed blockpi (aggressive rate limits)
 * - Added meganode as backup
 */

var _POLYGON = ChainFactory.createEvmChain("POLYGON", {
 CACHE_VERSION: 64,
 RPC: { ENDPOINTS: [
 // Tier 1: Most reliable, high availability
 "https://polygon.drpc.org", // dRPC - excellent uptime
 "https://rpc.ankr.com/polygon", // Ankr direct - reliable
 "https://polygon.publicnode.com", // PublicNode - fast, privacy-focused
 // Tier 2: Good alternatives
 "https://polygon.meowrpc.com", // MeowRPC - decent backup
 "https://1rpc.io/matic" // 1RPC - privacy-focused fallback
 ] },
 CHAIN: {
 NAME: "Polygon",
 CHAIN_ID: 137,
 NATIVE_SYMBOL: "POL",
 NATIVE_NAME: "POL",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:polygon-ecosystem-token",
 NATIVE_GECKO_ID: "polygon-ecosystem-token",
 DEX_SLUG: "polygon",
 GT_NETWORK: "polygon_pos"
 },
 LLAMA_ID_MAP: { 
 "AAVE": "coingecko:aave", 
 "DAI": "coingecko:dai", 
 "LINK": "coingecko:chainlink", 
 "MATIC": "coingecko:matic-network", 
 "POL": "coingecko:polygon-ecosystem-token", 
 "USDC": "coingecko:usd-coin", 
 "USDC.e": "coingecko:bridged-usdc-polygon-pos-bridge", 
 "USDT": "coingecko:tether", 
 "WBTC": "coingecko:wrapped-bitcoin", 
 "WETH": "coingecko:weth", 
 "WMATIC": "coingecko:wmatic", 
 "WPOL": "coingecko:polygon-ecosystem-token" 
 }
});

// Main functions
function GET_WALLET_ASSETS_POLYGON(a,r,t,f,g){return _POLYGON.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_POLYGON(a){return _POLYGON.getCachedWalletAssets(a);}
function POLYGON_REFRESH_STATUS(a,r,t,f,g){return _POLYGON.getRefreshStatus(a,r,t,f,g);}
function POLYGON_STATS(a,t){return _POLYGON.getStats(a,t);}

// Diagnostic functions
function DIAG_POLYGON_TOKEN(w,t,r){return _POLYGON.diag.tokenBalance(w,t,r);}
function DIAG_POLYGON_COMPARE_RPCS(w,t){return _POLYGON.diag.compareRpcs(w,t);}
function DIAG_POLYGON_CHECK_ERC20(t){return _POLYGON.diag.checkErc20(t);}
function DIAG_POLYGON_RPC_HEALTH(){return _POLYGON.diag.rpcHealth();}
function DIAG_POLYGON_NATIVE_BALANCE(w){return _POLYGON.diag.nativeBalance(w);}
function DIAG_POLYGON_CACHE(w){return _POLYGON.diag.cacheInspect(w);}
function DIAG_POLYGON_CACHE_TOKEN(w,t){return _POLYGON.diag.cacheFindToken(w,t);}
function DIAG_POLYGON_CACHE_ASSETS(w){return _POLYGON.diag.cacheListAssets(w);}
function DIAG_POLYGON_TOKEN_PRICE(t){return _POLYGON.diag.tokenPrice(t);}
function DIAG_POLYGON_NATIVE_PRICE(){return _POLYGON.diag.nativePrice();}
function DIAG_POLYGON_WALLET(w){return _POLYGON.diag.walletFull(w);}
function DIAG_POLYGON_CACHE_STATS(){return _POLYGON.diag.cacheStats();}
function DIAG_POLYGON_CLEAR_CACHE(w,c){return _POLYGON.diag.clearCache(w,c);}