/** Swellchain (1923) retirée du traitement actif. Cache conservé ; aucun onglet Ledger n'existe. */
function _swellchainRemovedCell_() { return [[SWELLCHAIN_REFRESH_STATUS()]]; }
function GET_WALLET_ASSETS_SWELLCHAIN() { return _swellchainRemovedCell_(); }
function CACHED_WALLET_ASSETS_SWELLCHAIN() { return _swellchainRemovedCell_(); }
function SWELLCHAIN_REFRESH_STATUS() { return "[CHAIN_REMOVED] Swellchain (1923)"; }
function SWELLCHAIN_STATS() { return _swellchainRemovedCell_(); }
// Diagnostic d’archive séparé des formules du Ledger.
function DIAG_SWELLCHAIN_CACHE_ASSETS(w) {
 var keys = (typeof EvmConfigBuilder !== "undefined" && EvmConfigBuilder.generateKeys) ? EvmConfigBuilder.generateKeys("SWELLCHAIN") : null;
 if (!keys || !keys.PREFIX) keys = { PREFIX: "SWELLCHAIN_CACHE_" };
 return Diagnostic.cacheListAssets({ CHAIN: { NAME: "Swellchain (archive)", CHAIN_ID: 1923, NATIVE_SYMBOL: "ETH", NATIVE_DECIMALS: 18 }, KEYS: keys }, w);
}
