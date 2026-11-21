/** Moonriver (1285) retirée du traitement actif. Cache et onglet conservés. */
function _moonriverRemovedCell_() { return [[MOONRIVER_REFRESH_STATUS()]]; }
function GET_WALLET_ASSETS_MOONRIVER() { return _moonriverRemovedCell_(); }
function CACHED_WALLET_ASSETS_MOONRIVER() { return _moonriverRemovedCell_(); }
function MOONRIVER_REFRESH_STATUS() { return "[CHAIN_REMOVED] Moonriver (1285)"; }
function MOONRIVER_STATS() { return _moonriverRemovedCell_(); }
// Diagnostic d’archive séparé des formules du Ledger.
function DIAG_MOONRIVER_CACHE_ASSETS(w) {
 var keys = (typeof EvmConfigBuilder !== "undefined" && EvmConfigBuilder.generateKeys) ? EvmConfigBuilder.generateKeys("MOONRIVER") : null;
 if (!keys || !keys.PREFIX) keys = { PREFIX: "MOONRIVER_CACHE_" };
 return Diagnostic.cacheListAssets({ CHAIN: { NAME: "Moonriver (archive)", CHAIN_ID: 1285, NATIVE_SYMBOL: "MOVR", NATIVE_DECIMALS: 18 }, KEYS: keys }, w);
}
