/**
 * ANCIENT8.gs - Ancient8 (v4.16.30 DISABLED)
 * RPC public passe derriere Conduit (cle API obligatoire) depuis maintenance du 19 juin 2026.
 * Aucun endpoint public accessible. Chaîne en maintenance prolongee, pas de news depuis le 17/06.
 * ChainFactory pattern with explicit function declarations
 */

var _ANCIENT8 = ChainFactory.createEvmChain("ANCIENT8", {
 CACHE_VERSION: 63,
 FLAGS: { DISABLE_CHAIN: true },
 RPC: { ENDPOINTS: ["https://rpc.ancient8.gg"] },
 CHAIN: {
 NAME: "Ancient8",
 CHAIN_ID: 888888888,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "ancient8",
 GT_NETWORK: "ancient8"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum" }
});

// Main functions
function GET_WALLET_ASSETS_ANCIENT8(a,r,t,f,g){return _ANCIENT8.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ANCIENT8(a){return _ANCIENT8.getCachedWalletAssets(a);}
function ANCIENT8_REFRESH_STATUS(a,r,t,f,g){return _ANCIENT8.getRefreshStatus(a,r,t,f,g);}
function ANCIENT8_STATS(a,t){return _ANCIENT8.getStats(a,t);}

// Diagnostic functions
function DIAG_ANCIENT8_TOKEN(w,t,r){return _ANCIENT8.diag.tokenBalance(w,t,r);}
function DIAG_ANCIENT8_COMPARE_RPCS(w,t){return _ANCIENT8.diag.compareRpcs(w,t);}
function DIAG_ANCIENT8_CHECK_ERC20(t){return _ANCIENT8.diag.checkErc20(t);}
function DIAG_ANCIENT8_RPC_HEALTH(){return _ANCIENT8.diag.rpcHealth();}
function DIAG_ANCIENT8_NATIVE_BALANCE(w){return _ANCIENT8.diag.nativeBalance(w);}
function DIAG_ANCIENT8_CACHE(w){return _ANCIENT8.diag.cacheInspect(w);}
function DIAG_ANCIENT8_CACHE_TOKEN(w,t){return _ANCIENT8.diag.cacheFindToken(w,t);}
function DIAG_ANCIENT8_CACHE_ASSETS(w){return _ANCIENT8.diag.cacheListAssets(w);}
function DIAG_ANCIENT8_TOKEN_PRICE(t){return _ANCIENT8.diag.tokenPrice(t);}
function DIAG_ANCIENT8_NATIVE_PRICE(){return _ANCIENT8.diag.nativePrice();}
function DIAG_ANCIENT8_WALLET(w){return _ANCIENT8.diag.walletFull(w);}
function DIAG_ANCIENT8_CACHE_STATS(){return _ANCIENT8.diag.cacheStats();}
function DIAG_ANCIENT8_CLEAR_CACHE(w,c){return _ANCIENT8.diag.clearCache(w,c);}
