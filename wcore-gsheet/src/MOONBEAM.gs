/** Moonbeam (1284) retirée du traitement actif. Cache et onglet conservés. */
function _moonbeamRemovedCell_() { return [[MOONBEAM_REFRESH_STATUS()]]; }
function GET_WALLET_ASSETS_MOONBEAM() { return _moonbeamRemovedCell_(); }
function CACHED_WALLET_ASSETS_MOONBEAM() { return _moonbeamRemovedCell_(); }
function MOONBEAM_REFRESH_STATUS() { return "[CHAIN_REMOVED] Moonbeam (1284)"; }
function MOONBEAM_STATS() { return _moonbeamRemovedCell_(); }
// Diagnostic d’archive séparé des formules du Ledger.
function DIAG_MOONBEAM_CACHE_ASSETS(w) {
 var keys = (typeof EvmConfigBuilder !== "undefined" && EvmConfigBuilder.generateKeys) ? EvmConfigBuilder.generateKeys("MOONBEAM") : null;
 if (!keys || !keys.PREFIX) keys = { PREFIX: "MOONBEAM_CACHE_" };
 return Diagnostic.cacheListAssets({ CHAIN: { NAME: "Moonbeam (archive)", CHAIN_ID: 1284, NATIVE_SYMBOL: "GLMR", NATIVE_DECIMALS: 18 }, KEYS: keys }, w);
}
