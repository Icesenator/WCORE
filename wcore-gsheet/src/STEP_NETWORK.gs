/** Step Network (1234) retirée du traitement actif (RPC publics hors service le 2026-11-22). Cache conservé ; aucun onglet Ledger n'existe. */
function _step_networkRemovedCell_() { return [[STEP_NETWORK_REFRESH_STATUS()]]; }
function GET_WALLET_ASSETS_STEP_NETWORK() { return _step_networkRemovedCell_(); }
function CACHED_WALLET_ASSETS_STEP_NETWORK() { return _step_networkRemovedCell_(); }
function STEP_NETWORK_REFRESH_STATUS() { return "[CHAIN_REMOVED] Step Network (1234)"; }
function STEP_NETWORK_STATS() { return _step_networkRemovedCell_(); }
// Diagnostic d’archive séparé des formules du Ledger.
function DIAG_STEP_NETWORK_CACHE_ASSETS(w) {
 var keys = (typeof EvmConfigBuilder !== "undefined" && EvmConfigBuilder.generateKeys) ? EvmConfigBuilder.generateKeys("STEP_NETWORK") : null;
 if (!keys || !keys.PREFIX) keys = { PREFIX: "STEP_NETWORK_CACHE_" };
 return Diagnostic.cacheListAssets({ CHAIN: { NAME: "Step Network (archive)", CHAIN_ID: 1234, NATIVE_SYMBOL: "FITFI", NATIVE_DECIMALS: 18 }, KEYS: keys }, w);
}
