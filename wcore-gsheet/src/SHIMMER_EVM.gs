/** Shimmer EVM (148) retirée du traitement actif (RPC publics hors service le 2026-11-22). Cache conservé ; aucun onglet Ledger n'existe. */
function _shimmer_evmRemovedCell_() { return [[SHIMMER_EVM_REFRESH_STATUS()]]; }
function GET_WALLET_ASSETS_SHIMMER_EVM() { return _shimmer_evmRemovedCell_(); }
function CACHED_WALLET_ASSETS_SHIMMER_EVM() { return _shimmer_evmRemovedCell_(); }
function SHIMMER_EVM_REFRESH_STATUS() { return "[CHAIN_REMOVED] Shimmer EVM (148)"; }
function SHIMMER_EVM_STATS() { return _shimmer_evmRemovedCell_(); }
// Diagnostic d’archive séparé des formules du Ledger.
function DIAG_SHIMMER_EVM_CACHE_ASSETS(w) {
 var keys = (typeof EvmConfigBuilder !== "undefined" && EvmConfigBuilder.generateKeys) ? EvmConfigBuilder.generateKeys("SHIMMER_EVM") : null;
 if (!keys || !keys.PREFIX) keys = { PREFIX: "SHIMMER_EVM_CACHE_" };
 return Diagnostic.cacheListAssets({ CHAIN: { NAME: "Shimmer EVM (archive)", CHAIN_ID: 148, NATIVE_SYMBOL: "SMR", NATIVE_DECIMALS: 18 }, KEYS: keys }, w);
}
