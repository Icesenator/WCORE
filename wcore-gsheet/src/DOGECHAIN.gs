/** Dogechain (2000) retirée du traitement actif (RPC publics hors service le 2026-11-22). Cache conservé ; aucun onglet Ledger n'existe. */
function _dogechainRemovedCell_() { return [[DOGECHAIN_REFRESH_STATUS()]]; }
function GET_WALLET_ASSETS_DOGECHAIN() { return _dogechainRemovedCell_(); }
function CACHED_WALLET_ASSETS_DOGECHAIN() { return _dogechainRemovedCell_(); }
function DOGECHAIN_REFRESH_STATUS() { return "[CHAIN_REMOVED] Dogechain (2000)"; }
function DOGECHAIN_STATS() { return _dogechainRemovedCell_(); }
// Diagnostic d’archive séparé des formules du Ledger.
function DIAG_DOGECHAIN_CACHE_ASSETS(w) {
 var keys = (typeof EvmConfigBuilder !== "undefined" && EvmConfigBuilder.generateKeys) ? EvmConfigBuilder.generateKeys("DOGECHAIN") : null;
 if (!keys || !keys.PREFIX) keys = { PREFIX: "DOGECHAIN_CACHE_" };
 return Diagnostic.cacheListAssets({ CHAIN: { NAME: "Dogechain (archive)", CHAIN_ID: 2000, NATIVE_SYMBOL: "DOGE", NATIVE_DECIMALS: 18 }, KEYS: keys }, w);
}
