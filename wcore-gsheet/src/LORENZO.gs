/** Lorenzo (8329) retirée du traitement actif (RPC publics hors service le 2026-11-22). Cache conservé ; aucun onglet Ledger n'existe. */
function _lorenzoRemovedCell_() { return [[LORENZO_REFRESH_STATUS()]]; }
function GET_WALLET_ASSETS_LORENZO() { return _lorenzoRemovedCell_(); }
function CACHED_WALLET_ASSETS_LORENZO() { return _lorenzoRemovedCell_(); }
function LORENZO_REFRESH_STATUS() { return "[CHAIN_REMOVED] Lorenzo (8329)"; }
function LORENZO_STATS() { return _lorenzoRemovedCell_(); }
// Diagnostic d’archive séparé des formules du Ledger.
function DIAG_LORENZO_CACHE_ASSETS(w) {
 var keys = (typeof EvmConfigBuilder !== "undefined" && EvmConfigBuilder.generateKeys) ? EvmConfigBuilder.generateKeys("LORENZO") : null;
 if (!keys || !keys.PREFIX) keys = { PREFIX: "LORENZO_CACHE_" };
 return Diagnostic.cacheListAssets({ CHAIN: { NAME: "Lorenzo (archive)", CHAIN_ID: 8329, NATIVE_SYMBOL: "Lorenzo", NATIVE_DECIMALS: 18 }, KEYS: keys }, w);
}
