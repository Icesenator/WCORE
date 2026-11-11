/************************************************************
 * core/WALLET_NAMES_CORE.gs - Noms de wallets centralis?s
 * 
 * Un seul endroit pour d?finir vos wallets.
 * Le nom de la chain est ajout? automatiquement.
 * 
 * v4.2.3 - Renommage pour coh?rence (_CORE suffix)
 ************************************************************/
var WALLET_NAMES_VERSION = "4.2.6";

// ============================================================
// D?FINITION CENTRALIS?E DES WALLETS
// ============================================================

/**
 * D?finissez vos wallets ICI, UNE SEULE FOIS.
 * Le nom de la chain sera ajout? automatiquement.
 * 
 * Format: "adresse": "Nom du wallet"
 */
// v4.2.6 (audit du 11/11/2026) : le registre reel (adresses et noms des portefeuilles du
// proprietaire) n'est plus dans le depot Git, qui est public. Il vit dans un fichier present
// seulement dans le script en ligne, 12B_WALLET_REGISTRY_PRIVATE.gs, qui definit
// WALLET_REGISTRY_PRIVATE au meme format. Ce fichier est ignore par Git : ne jamais le commiter.
var WALLET_REGISTRY = {};

function _walletRegistry_() {
 if (!_walletRegistry_.merged && typeof WALLET_REGISTRY_PRIVATE !== "undefined" && WALLET_REGISTRY_PRIVATE) {
  for (var pa in WALLET_REGISTRY_PRIVATE) {
   if (Object.prototype.hasOwnProperty.call(WALLET_REGISTRY_PRIVATE, pa) && !Object.prototype.hasOwnProperty.call(WALLET_REGISTRY, pa)) {
    WALLET_REGISTRY[pa] = WALLET_REGISTRY_PRIVATE[pa];
   }
  }
  _walletRegistry_.merged = true;
 }
 return WALLET_REGISTRY;
}

// ============================================================
// WALLET NAME RESOLVER
// ============================================================

var WalletNames = {
 
 /**
 * R?cup?re le nom d'un wallet avec le nom de la chain
 * 
 * @param {string} address - Adresse du wallet
 * @param {string} chainName - Nom de la chain (ex: "Base", "Arbitrum")
 * @param {Object} customNames - Map de noms personnalis?s (optionnel, override)
 * @returns {string} Nom format? ou chainName si non trouv?
 * 
 * Exemple: "0x6a35..." sur Base ' "Layer3 Wallet - Base"
 */
 get: function(address, chainName, customNames) {
 var norm = Addr.normalize(address);
 
 // 1. V?rifier les noms personnalis?s (priorit?)
 if (customNames && customNames[norm]) {
 return customNames[norm];
 }
 
 // 2. V?rifier le registre central
 var registry = _walletRegistry_();
 if (registry && registry[norm]) {
 return registry[norm] + " - " + chainName;
 }

 // Defensive lookup for entries added with checksum/mixed-case keys.
 if (registry) {
 for (var addr in registry) {
 if (Object.prototype.hasOwnProperty.call(registry, addr) && Addr.normalize(addr) === norm) {
 return registry[addr] + " - " + chainName;
 }
 }
 }
 
 // 3. Fallback: juste le nom de la chain
 return chainName;
 },
 
 generateForChain: function(chainName) {
 var result = {};
 var registry = _walletRegistry_();
 for (var addr in registry) {
 if (Object.prototype.hasOwnProperty.call(registry, addr)) {
 result[addr] = registry[addr] + " - " + chainName;
 }
 }
 return result;
 },
 
 register: function(wallets) {
 if (!wallets) return;
 for (var addr in wallets) {
 if (Object.prototype.hasOwnProperty.call(wallets, addr)) {
 _walletRegistry_()[Addr.normalize(addr)] = wallets[addr];
 }
 }
 }
};
