/** Edgeless (2026) retirée du traitement actif (RPC publics hors service le 2026-11-22). Cache conservé ; aucun onglet Ledger n'existe. */
function _edgelessRemovedCell_() { return [[EDGELESS_REFRESH_STATUS()]]; }
function GET_WALLET_ASSETS_EDGELESS() { return _edgelessRemovedCell_(); }
function CACHED_WALLET_ASSETS_EDGELESS() { return _edgelessRemovedCell_(); }
function EDGELESS_REFRESH_STATUS() { return "[CHAIN_REMOVED] Edgeless (2026)"; }
function EDGELESS_STATS() { return _edgelessRemovedCell_(); }
// Diagnostic d’archive séparé des formules du Ledger.
function DIAG_EDGELESS_CACHE_ASSETS(w) {
 var keys = (typeof EvmConfigBuilder !== "undefined" && EvmConfigBuilder.generateKeys) ? EvmConfigBuilder.generateKeys("EDGELESS") : null;
 if (!keys || !keys.PREFIX) keys = { PREFIX: "EDGELESS_CACHE_" };
 return Diagnostic.cacheListAssets({ CHAIN: { NAME: "Edgeless (archive)", CHAIN_ID: 2026, NATIVE_SYMBOL: "EDG", NATIVE_DECIMALS: 18 }, KEYS: keys }, w);
}
