/** Lumio (8866) retirée du traitement actif (RPC publics hors service le 2026-11-22). Cache conservé ; aucun onglet Ledger n'existe. */
function _lumioRemovedCell_() { return [[LUMIO_REFRESH_STATUS()]]; }
function GET_WALLET_ASSETS_LUMIO() { return _lumioRemovedCell_(); }
function CACHED_WALLET_ASSETS_LUMIO() { return _lumioRemovedCell_(); }
function LUMIO_REFRESH_STATUS() { return "[CHAIN_REMOVED] Lumio (8866)"; }
function LUMIO_STATS() { return _lumioRemovedCell_(); }
// Diagnostic d’archive séparé des formules du Ledger.
function DIAG_LUMIO_CACHE_ASSETS(w) {
 var keys = (typeof EvmConfigBuilder !== "undefined" && EvmConfigBuilder.generateKeys) ? EvmConfigBuilder.generateKeys("LUMIO") : null;
 if (!keys || !keys.PREFIX) keys = { PREFIX: "LUMIO_CACHE_" };
 return Diagnostic.cacheListAssets({ CHAIN: { NAME: "Lumio (archive)", CHAIN_ID: 8866, NATIVE_SYMBOL: "ETH", NATIVE_DECIMALS: 18 }, KEYS: keys }, w);
}
