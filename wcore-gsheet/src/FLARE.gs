/**
 * FLARE.gs - Flare (v4.9.7)
 * ChainFactory pattern with explicit function declarations
 * 
 * v4.15.2 FIX: CoinGecko ID is "flare-networks" not "flare" (both Llama and CG were broken)
 *
 * v4.9.7 FIX:
 * - BUMPED: CACHE_VERSION to 64 to force price refresh
 * - ADDED: NATIVE_PRICE_CONTRACT (WFLR) for DEX pricing fallback
 */

var _FLARE = ChainFactory.createEvmChain("FLARE", {
 CACHE_VERSION: 64,
 RPC: { 
 ENDPOINTS: [
 "https://flare-api.flare.network/ext/C/rpc", 
 "https://rpc.ankr.com/flare", 
 "https://flare.rpc.thirdweb.com", 
 "https://rpc.au.cc/flare"
 ] 
 },
 CHAIN: {
 NAME: "Flare",
 CHAIN_ID: 14,
 NATIVE_SYMBOL: "FLR",
 NATIVE_NAME: "Flare",
 NATIVE_DECIMALS: 18,
 // PRICING: DefiLlama ID for native token
 NATIVE_LLAMA_ID: "coingecko:flare-networks",
 // PRICING: CoinGecko ID fallback
 NATIVE_GECKO_ID: "flare-networks",
 // PRICING: Wrapped FLR contract for DEX price fallback
 // WFLR on Flare: 0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d
 NATIVE_PRICE_CONTRACT: "0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d",
 // DexScreener slug for Flare
 DEX_SLUG: "flare",
 // GeckoTerminal network identifier
 GT_NETWORK: "flare"
 },
 // Token pricing mappings
 LLAMA_ID_MAP: { 
 "FLR": "coingecko:flare-networks",
 "WFLR": "coingecko:flare-networks"
 }
});

// Main functions
function GET_WALLET_ASSETS_FLARE(a,r,t,f,g){return _FLARE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_FLARE(a){return _FLARE.getCachedWalletAssets(a);}
function FLARE_REFRESH_STATUS(a,r,t,f,g){return _FLARE.getRefreshStatus(a,r,t,f,g);}
function FLARE_STATS(a,t){return _FLARE.getStats(a,t);}

// Diagnostic functions
function DIAG_FLARE_TOKEN(w,t,r){return _FLARE.diag.tokenBalance(w,t,r);}
function DIAG_FLARE_COMPARE_RPCS(w,t){return _FLARE.diag.compareRpcs(w,t);}
function DIAG_FLARE_CHECK_ERC20(t){return _FLARE.diag.checkErc20(t);}
function DIAG_FLARE_RPC_HEALTH(){return _FLARE.diag.rpcHealth();}
function DIAG_FLARE_NATIVE_BALANCE(w){return _FLARE.diag.nativeBalance(w);}
function DIAG_FLARE_CACHE(w){return _FLARE.diag.cacheInspect(w);}
function DIAG_FLARE_CACHE_TOKEN(w,t){return _FLARE.diag.cacheFindToken(w,t);}
function DIAG_FLARE_CACHE_ASSETS(w){return _FLARE.diag.cacheListAssets(w);}
function DIAG_FLARE_TOKEN_PRICE(t){return _FLARE.diag.tokenPrice(t);}
function DIAG_FLARE_NATIVE_PRICE(){return _FLARE.diag.nativePrice();}
function DIAG_FLARE_WALLET(w){return _FLARE.diag.walletFull(w);}
function DIAG_FLARE_CACHE_STATS(){return _FLARE.diag.cacheStats();}
function DIAG_FLARE_CLEAR_CACHE(w,c){return _FLARE.diag.clearCache(w,c);}
