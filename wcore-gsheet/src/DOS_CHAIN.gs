/** DOS Chain (7979) retirée du traitement actif (RPC publics hors service le 2026-11-22). Cache conservé ; aucun onglet Ledger n'existe. */
function _dos_chainRemovedCell_() { return [[DOS_CHAIN_REFRESH_STATUS()]]; }
function GET_WALLET_ASSETS_DOS_CHAIN() { return _dos_chainRemovedCell_(); }
function CACHED_WALLET_ASSETS_DOS_CHAIN() { return _dos_chainRemovedCell_(); }
function DOS_CHAIN_REFRESH_STATUS() { return "[CHAIN_REMOVED] DOS Chain (7979)"; }
function DOS_CHAIN_STATS() { return _dos_chainRemovedCell_(); }
// Diagnostic d’archive séparé des formules du Ledger.
function DIAG_DOS_CHAIN_CACHE_ASSETS(w) {
 var keys = (typeof EvmConfigBuilder !== "undefined" && EvmConfigBuilder.generateKeys) ? EvmConfigBuilder.generateKeys("DOS_CHAIN") : null;
 if (!keys || !keys.PREFIX) keys = { PREFIX: "DOS_CHAIN_CACHE_" };
 return Diagnostic.cacheListAssets({ CHAIN: { NAME: "DOS Chain (archive)", CHAIN_ID: 7979, NATIVE_SYMBOL: "DOS", NATIVE_DECIMALS: 18 }, KEYS: keys }, w);
}
