/**
 * LISK.gs - Lisk L2 (1135) RETIRE le 2026-11-02 (Portal et Bridge fermes, reseau arrete).
 * Tombstone (v4.15.52, 2026-11-10) : aucune chaine creee, aucun scan, aucun appel reseau,
 * aucune ecriture. L onglet "Ledger - Lisk" a ete supprime d Invest 2.0 apres archive privee ;
 * le cache WalletCache LISK est conserve comme preuve de detention (reclamation manuelle
 * annoncee pour janvier 2027, droits a preserver). Le solde n est jamais remis a zero.
 * Le token LSK detenu sur Ethereum n est PAS concerne (chaine ETHEREUM, inchangee).
 * Toute recreation de l onglet n affiche que le marqueur [CHAIN_REMOVED] (reconnu par la
 * colonne Verif du Recap), jamais un solde ni une valeur.
 */
function _liskRemovedCell_() {
 return [["[CHAIN_REMOVED] Lisk (1135) — réseau arrêté le 2026-11-02, réclamation annoncée pour janvier 2027, valeur UNKNOWN"]];
}
function GET_WALLET_ASSETS_LISK() { return _liskRemovedCell_(); }
function CACHED_WALLET_ASSETS_LISK() { return _liskRemovedCell_(); }
function LISK_REFRESH_STATUS() { return "[CHAIN_REMOVED] Lisk (1135)"; }
function LISK_STATS() { return _liskRemovedCell_(); }
// Lecture seule du cache conserve (preuve) : aucun appel reseau, aucune ecriture.
function DIAG_LISK_CACHE_ASSETS(w) {
 var keys = (typeof EvmConfigBuilder !== "undefined" && EvmConfigBuilder.generateKeys) ? EvmConfigBuilder.generateKeys("LISK") : null;
 if (!keys || !keys.PREFIX) keys = { PREFIX: "LISK_CACHE_" };
 return Diagnostic.cacheListAssets({ CHAIN: { NAME: "Lisk (archive)", CHAIN_ID: 1135, NATIVE_SYMBOL: "ETH", NATIVE_DECIMALS: 18 }, KEYS: keys }, w);
}
