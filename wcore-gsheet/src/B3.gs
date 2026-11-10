/**
 * B3.gs - B3 Mainnet (8333) RETIRE le 2026-10-31 (reseau ferme, retraits fermes).
 * Tombstone : aucune chaine creee, aucun scan, aucun appel reseau, aucune ecriture.
 * Le cache WalletCache B3 et l'onglet "Ledger - B3" sont conserves comme preuves
 * (demande de recuperation en cours). Token B3 sur Base et chaine B2 : non concernes.
 */
function _b3RemovedCell_() {
 return [["[CHAIN_REMOVED] B3 (8333) — réseau fermé, onglet archivé, aucune valeur courante"]];
}
function GET_WALLET_ASSETS_B3() { return _b3RemovedCell_(); }
function CACHED_WALLET_ASSETS_B3() { return _b3RemovedCell_(); }
function B3_REFRESH_STATUS() { return "[CHAIN_REMOVED] B3 (8333)"; }
function B3_STATS() { return _b3RemovedCell_(); }
// Lecture seule du cache conserve (preuve) : aucun appel reseau, aucune ecriture.
function DIAG_B3_CACHE_ASSETS(w) {
 var keys = (typeof EvmConfigBuilder !== "undefined" && EvmConfigBuilder.generateKeys) ? EvmConfigBuilder.generateKeys("B3") : null;
 if (!keys || !keys.PREFIX) keys = { PREFIX: "B3_CACHE_" };
 return Diagnostic.cacheListAssets({ CHAIN: { NAME: "B3 (archive)", CHAIN_ID: 8333, NATIVE_SYMBOL: "ETH", NATIVE_DECIMALS: 18 }, KEYS: keys }, w);
}
