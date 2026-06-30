/************************************************************
 * core/WALLET_NAMES_CORE.gs - Noms de wallets centralis?s
 * 
 * Un seul endroit pour d?finir vos wallets.
 * Le nom de la chain est ajout? automatiquement.
 * 
 * v4.2.3 - Renommage pour coh?rence (_CORE suffix)
 ************************************************************/
var WALLET_NAMES_VERSION = "4.2.5";

// ============================================================
// D?FINITION CENTRALIS?E DES WALLETS
// ============================================================

/**
 * D?finissez vos wallets ICI, UNE SEULE FOIS.
 * Le nom de la chain sera ajout? automatiquement.
 * 
 * Format: "adresse": "Nom du wallet"
 */
var WALLET_REGISTRY = {
 "0x6a3530ad9e5b1779de37f5e6af82999c325ea3f7": "Layer3 Wallet",
 "0x17d518736ee9341dcdc0a2498e013d33cfcdd080": "Ledger",
 "0xd5b0dbd75056a30411be789775e40664ec858e51": "Binance Web3 Wallet",
 "0x09875c42713f9525384afb83f95c2858d1cbccc4": "Smart Wallet",
 "0xe39c0d6439a71d2bddfdeee94420601cdf8fd22d": "Ethos",
 "0x6f6d5c6ecf999d330ef942b9288089b7746f0b60": "SafePal",
 "0xe9c01999dee7562c07a048ffe5c866dc1f337569": "Startale",

 // Solana (SVM) wallets (base58, case-sensitive)
  "9gjm5Hw5E6hLisCrCiewCnQv9mT1L4DcM9w2AReX6pe5": "Layer3",
  "AxU68jEGjXMj3YGRPSPVXg4qpYmUWhoBUfsbuhrFyDe4": "Ledger",
  "GWLCYszJB8H5Pe3nYw6uoFTApoAqP9P7uzgTmbFm4Nqk": "Seeker",
  "0x9eb34b670f79491329f71080717edf071ff5353f": "UniSwap",
  "0x18bbec24e4ff9c43d538121528c08a88cacd4e4c": "Warpcast"
  // Ajoutez vos wallets ici...
};

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
 if (WALLET_REGISTRY && WALLET_REGISTRY[norm]) {
 return WALLET_REGISTRY[norm] + " - " + chainName;
 }

 // Defensive lookup for entries added with checksum/mixed-case keys.
 if (WALLET_REGISTRY) {
 for (var addr in WALLET_REGISTRY) {
 if (Object.prototype.hasOwnProperty.call(WALLET_REGISTRY, addr) && Addr.normalize(addr) === norm) {
 return WALLET_REGISTRY[addr] + " - " + chainName;
 }
 }
 }
 
 // 3. Fallback: juste le nom de la chain
 return chainName;
 },
 
 generateForChain: function(chainName) {
 var result = {};
 for (var addr in WALLET_REGISTRY) {
 if (Object.prototype.hasOwnProperty.call(WALLET_REGISTRY, addr)) {
 result[addr] = WALLET_REGISTRY[addr] + " - " + chainName;
 }
 }
 return result;
 },
 
 register: function(wallets) {
 if (!wallets) return;
 for (var addr in wallets) {
 if (Object.prototype.hasOwnProperty.call(wallets, addr)) {
 WALLET_REGISTRY[Addr.normalize(addr)] = wallets[addr];
 }
 }
 }
};
