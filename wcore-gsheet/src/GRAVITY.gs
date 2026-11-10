/**
 * GRAVITY.gs - Gravity Alpha Mainnet (1625) RETIRE le 2026-11-01 (reseau arrete par Galxe,
 * plus aucun transfert possible). Tombstone : aucune chaine creee, aucun scan, aucun appel
 * reseau, aucune ecriture. Le cache WalletCache GRAVITY et l onglet "Ledger - Gravity" sont
 * conserves comme preuves de detention (dossier de recuperation ouvert). Le solde n est jamais
 * remis a zero. Gravity L1 (127001) est un reseau distinct, non concerne.
 */
function _gravityRemovedCell_() {
 return [["[CHAIN_REMOVED] Gravity Alpha (1625) — réseau arrêté le 2026-11-01, solde conservé en archive, valeur UNKNOWN"]];
}
function GET_WALLET_ASSETS_GRAVITY() { return _gravityRemovedCell_(); }
function CACHED_WALLET_ASSETS_GRAVITY() { return _gravityRemovedCell_(); }
function GRAVITY_REFRESH_STATUS() { return "[CHAIN_REMOVED] Gravity Alpha (1625)"; }
function GRAVITY_STATS() { return _gravityRemovedCell_(); }
// Lecture seule du cache conserve (preuve) : aucun appel reseau, aucune ecriture.
function DIAG_GRAVITY_CACHE_ASSETS(w) {
 var keys = (typeof EvmConfigBuilder !== "undefined" && EvmConfigBuilder.generateKeys) ? EvmConfigBuilder.generateKeys("GRAVITY") : null;
 if (!keys || !keys.PREFIX) keys = { PREFIX: "GRAVITY_CACHE_" };
 return Diagnostic.cacheListAssets({ CHAIN: { NAME: "Gravity Alpha (archive)", CHAIN_ID: 1625, NATIVE_SYMBOL: "G", NATIVE_DECIMALS: 18 }, KEYS: keys }, w);
}
