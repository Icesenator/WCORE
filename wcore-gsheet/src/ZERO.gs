/** ZERO Network (543210) retirée du traitement actif. Cache conservé ; aucun onglet Ledger n'existe. */
function _zeroRemovedCell_() { return [[ZERO_REFRESH_STATUS()]]; }
function GET_WALLET_ASSETS_ZERO() { return _zeroRemovedCell_(); }
function CACHED_WALLET_ASSETS_ZERO() { return _zeroRemovedCell_(); }
function ZERO_REFRESH_STATUS() { return "[CHAIN_REMOVED] ZERO Network (543210)"; }
function ZERO_STATS() { return _zeroRemovedCell_(); }
// Diagnostic d’archive séparé des formules du Ledger.
function DIAG_ZERO_CACHE_ASSETS(w) {
 var keys = (typeof EvmConfigBuilder !== "undefined" && EvmConfigBuilder.generateKeys) ? EvmConfigBuilder.generateKeys("ZERO") : null;
 if (!keys || !keys.PREFIX) keys = { PREFIX: "ZERO_CACHE_" };
 return Diagnostic.cacheListAssets({ CHAIN: { NAME: "ZERO Network (archive)", CHAIN_ID: 543210, NATIVE_SYMBOL: "ETH", NATIVE_DECIMALS: 18 }, KEYS: keys }, w);
}
