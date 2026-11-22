/** AirDAO (16718) retirée du traitement actif (RPC publics hors service le 2026-11-22). Cache conservé ; aucun onglet Ledger n'existe. */
function _airdaoRemovedCell_() { return [[AIRDAO_REFRESH_STATUS()]]; }
function GET_WALLET_ASSETS_AIRDAO() { return _airdaoRemovedCell_(); }
function CACHED_WALLET_ASSETS_AIRDAO() { return _airdaoRemovedCell_(); }
function AIRDAO_REFRESH_STATUS() { return "[CHAIN_REMOVED] AirDAO (16718)"; }
function AIRDAO_STATS() { return _airdaoRemovedCell_(); }
// Diagnostic d’archive séparé des formules du Ledger.
function DIAG_AIRDAO_CACHE_ASSETS(w) {
 var keys = (typeof EvmConfigBuilder !== "undefined" && EvmConfigBuilder.generateKeys) ? EvmConfigBuilder.generateKeys("AIRDAO") : null;
 if (!keys || !keys.PREFIX) keys = { PREFIX: "AIRDAO_CACHE_" };
 return Diagnostic.cacheListAssets({ CHAIN: { NAME: "AirDAO (archive)", CHAIN_ID: 16718, NATIVE_SYMBOL: "AMB", NATIVE_DECIMALS: 18 }, KEYS: keys }, w);
}
