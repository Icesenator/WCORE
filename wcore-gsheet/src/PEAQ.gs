/**
 * PEAQ.gs - Peaq Network (v4.16.82)
 * ChainFactory pattern - EVM-compatible L1 for DePIN / Machine Economy
 *
 * Chain ID: 3338 | Native: PEAQ | EVM (London opcode set)
 * Source: https://chainlist.org/chain/3338
 * Explorer: https://peaq.subscan.io/
 *
 * v4.16.82 - PEAQ est une chaine CRYPTO UNIQUEMENT. Les wrappers
 * _ACTION sont supprimes: PEAQ n'a aucune entree dans RWA_REGISTRY_ENTRIES,
 * or _rwaProjectActionRows_ ne conserve que les lignes trouvees au registre
 * -> une vue Action y serait toujours vide. Le wrapper _CRYPTO pointait
 * vers _rwaViewsConfigByKey_("PEAQ") qui renvoyait null (PEAQ absent de
 * RWA_CHAIN_VIEWS_CONFIG) et levait un TypeError. PEAQ est desormais
 * enregistre dans RWA_CHAIN_VIEWS_CONFIG (45_RWA_CHAIN_VIEWS.gs).
 */

var _PEAQ = ChainFactory.createEvmChain("PEAQ", {
 CACHE_VERSION: 1,

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

 RPC: {
 ENDPOINTS: [
 "https://peaq-rpc.publicnode.com",
 "https://peaq.api.onfinality.io/public",
 "https://quicknode1.peaq.xyz"
 ]
 },

 CHAIN: {
 NAME: "Peaq",
 CHAIN_ID: 3338,
 NATIVE_SYMBOL: "PEAQ",
 NATIVE_NAME: "Peaq",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:peaq-2",
 NATIVE_GECKO_ID: "peaq-2",
 DEX_SLUG: "peaq",
 GT_NETWORK: "peaq"
 },

 LLAMA_ID_MAP: { PEAQ: "coingecko:peaq-2" }
});

// ============================================================
// MAIN FUNCTIONS
// ============================================================

function GET_WALLET_ASSETS_PEAQ(a,r,t,f,g){return _PEAQ.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_PEAQ(a){return _PEAQ.getCachedWalletAssets(a);}
function PEAQ_REFRESH_STATUS(a,r,t,f,g){return _PEAQ.getRefreshStatus(a,r,t,f,g);}
function PEAQ_STATS(a,t){return _PEAQ.getStats(a,t);}
// v4.16.82 - Vue Crypto uniquement (chaine crypto-only, cf. en-tete).
function CACHED_WALLET_ASSETS_PEAQ_CRYPTO(a){var cfg=_rwaViewsConfigByKey_("PEAQ");if(!cfg)throw new Error("CACHED_WALLET_ASSETS_PEAQ_CRYPTO: PEAQ absent de RWA_CHAIN_VIEWS_CONFIG");return _rwaProjectCryptoByCfg_(cfg,a);}

// ============================================================
// DIAGNOSTIC FUNCTIONS
// ============================================================

function DIAG_PEAQ_TOKEN(w,t,r){return _PEAQ.diag.tokenBalance(w,t,r);}
function DIAG_PEAQ_COMPARE_RPCS(w,t){return _PEAQ.diag.compareRpcs(w,t);}
function DIAG_PEAQ_CHECK_ERC20(t){return _PEAQ.diag.checkErc20(t);}
function DIAG_PEAQ_RPC_HEALTH(){return _PEAQ.diag.rpcHealth();}
function DIAG_PEAQ_NATIVE_BALANCE(w){return _PEAQ.diag.nativeBalance(w);}
function DIAG_PEAQ_CACHE(w){return _PEAQ.diag.cacheInspect(w);}
function DIAG_PEAQ_CACHE_TOKEN(w,t){return _PEAQ.diag.cacheFindToken(w,t);}
function DIAG_PEAQ_CACHE_ASSETS(w){return _PEAQ.diag.cacheListAssets(w);}
function DIAG_PEAQ_TOKEN_PRICE(t){return _PEAQ.diag.tokenPrice(t);}
function DIAG_PEAQ_NATIVE_PRICE(){return _PEAQ.diag.nativePrice();}
function DIAG_PEAQ_WALLET(w){return _PEAQ.diag.walletFull(w);}
function DIAG_PEAQ_CACHE_STATS(){return _PEAQ.diag.cacheStats();}
function DIAG_PEAQ_CLEAR_CACHE(w,c){return _PEAQ.diag.clearCache(w,c);}

// ============================================================
// DIAGNOSTIC: RPC ENDPOINT TEST
// ============================================================

/**
 * Test all RPC endpoints individually
 * Usage: =DIAG_PEAQ_RPC_TEST()
 */
function DIAG_PEAQ_RPC_TEST() {
 return DIAG_CHAIN_RPC_TEST("PEAQ");
}
