/** Proof of Play Apex (70700) retirée du traitement actif (RPC publics hors service le 2026-11-22). Cache conservé ; aucun onglet Ledger n'existe. */
function _proof_of_play_apexRemovedCell_() { return [[PROOF_OF_PLAY_APEX_REFRESH_STATUS()]]; }
function GET_WALLET_ASSETS_PROOF_OF_PLAY_APEX() { return _proof_of_play_apexRemovedCell_(); }
function CACHED_WALLET_ASSETS_PROOF_OF_PLAY_APEX() { return _proof_of_play_apexRemovedCell_(); }
function PROOF_OF_PLAY_APEX_REFRESH_STATUS() { return "[CHAIN_REMOVED] Proof of Play Apex (70700)"; }
function PROOF_OF_PLAY_APEX_STATS() { return _proof_of_play_apexRemovedCell_(); }
// Diagnostic d’archive séparé des formules du Ledger.
function DIAG_PROOF_OF_PLAY_APEX_CACHE_ASSETS(w) {
 var keys = (typeof EvmConfigBuilder !== "undefined" && EvmConfigBuilder.generateKeys) ? EvmConfigBuilder.generateKeys("PROOF_OF_PLAY_APEX") : null;
 if (!keys || !keys.PREFIX) keys = { PREFIX: "PROOF_OF_PLAY_APEX_CACHE_" };
 return Diagnostic.cacheListAssets({ CHAIN: { NAME: "Proof of Play Apex (archive)", CHAIN_ID: 70700, NATIVE_SYMBOL: "ETH", NATIVE_DECIMALS: 18 }, KEYS: keys }, w);
}
