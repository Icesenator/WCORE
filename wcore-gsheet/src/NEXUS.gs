/** Nexus Mainnet (3946) retirée du traitement actif (RPC publics hors service le 2026-11-22). Cache conservé ; aucun onglet Ledger n'existe. */
function _nexusRemovedCell_() { return [[NEXUS_REFRESH_STATUS()]]; }
function GET_WALLET_ASSETS_NEXUS() { return _nexusRemovedCell_(); }
function CACHED_WALLET_ASSETS_NEXUS() { return _nexusRemovedCell_(); }
function NEXUS_REFRESH_STATUS() { return "[CHAIN_REMOVED] Nexus Mainnet (3946)"; }
function NEXUS_STATS() { return _nexusRemovedCell_(); }
// Diagnostic d’archive séparé des formules du Ledger.
function DIAG_NEXUS_CACHE_ASSETS(w) {
 var keys = (typeof EvmConfigBuilder !== "undefined" && EvmConfigBuilder.generateKeys) ? EvmConfigBuilder.generateKeys("NEXUS") : null;
 if (!keys || !keys.PREFIX) keys = { PREFIX: "NEXUS_CACHE_" };
 return Diagnostic.cacheListAssets({ CHAIN: { NAME: "Nexus Mainnet (archive)", CHAIN_ID: 3946, NATIVE_SYMBOL: "NEX", NATIVE_DECIMALS: 18 }, KEYS: keys }, w);
}
