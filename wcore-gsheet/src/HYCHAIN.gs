/** Hychain (2911) retirée du traitement actif (RPC publics hors service le 2026-11-22). Cache conservé ; aucun onglet Ledger n'existe. */
function _hychainRemovedCell_() { return [[HYCHAIN_REFRESH_STATUS()]]; }
function GET_WALLET_ASSETS_HYCHAIN() { return _hychainRemovedCell_(); }
function CACHED_WALLET_ASSETS_HYCHAIN() { return _hychainRemovedCell_(); }
function HYCHAIN_REFRESH_STATUS() { return "[CHAIN_REMOVED] Hychain (2911)"; }
function HYCHAIN_STATS() { return _hychainRemovedCell_(); }
// Diagnostic d’archive séparé des formules du Ledger.
function DIAG_HYCHAIN_CACHE_ASSETS(w) {
 var keys = (typeof EvmConfigBuilder !== "undefined" && EvmConfigBuilder.generateKeys) ? EvmConfigBuilder.generateKeys("HYCHAIN") : null;
 if (!keys || !keys.PREFIX) keys = { PREFIX: "HYCHAIN_CACHE_" };
 return Diagnostic.cacheListAssets({ CHAIN: { NAME: "Hychain (archive)", CHAIN_ID: 2911, NATIVE_SYMBOL: "TOPIA", NATIVE_DECIMALS: 18 }, KEYS: keys }, w);
}
