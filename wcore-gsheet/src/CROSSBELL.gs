/** Crossbell (3737) retirée du traitement actif (RPC publics hors service le 2026-11-22). Cache conservé ; aucun onglet Ledger n'existe. */
function _crossbellRemovedCell_() { return [[CROSSBELL_REFRESH_STATUS()]]; }
function GET_WALLET_ASSETS_CROSSBELL() { return _crossbellRemovedCell_(); }
function CACHED_WALLET_ASSETS_CROSSBELL() { return _crossbellRemovedCell_(); }
function CROSSBELL_REFRESH_STATUS() { return "[CHAIN_REMOVED] Crossbell (3737)"; }
function CROSSBELL_STATS() { return _crossbellRemovedCell_(); }
// Diagnostic d’archive séparé des formules du Ledger.
function DIAG_CROSSBELL_CACHE_ASSETS(w) {
 var keys = (typeof EvmConfigBuilder !== "undefined" && EvmConfigBuilder.generateKeys) ? EvmConfigBuilder.generateKeys("CROSSBELL") : null;
 if (!keys || !keys.PREFIX) keys = { PREFIX: "CROSSBELL_CACHE_" };
 return Diagnostic.cacheListAssets({ CHAIN: { NAME: "Crossbell (archive)", CHAIN_ID: 3737, NATIVE_SYMBOL: "CSB", NATIVE_DECIMALS: 18 }, KEYS: keys }, w);
}
