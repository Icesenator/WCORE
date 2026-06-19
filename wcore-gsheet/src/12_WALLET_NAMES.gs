/************************************************************
 * core/WALLET_NAMES_CORE.gs - Noms de wallets centralis?s
 * 
 * Un seul endroit pour d?finir vos wallets.
 * Le nom de la chain est ajout? automatiquement.
 * 
 * v4.2.3 - Renommage pour coh?rence (_CORE suffix)
 ************************************************************/
var WALLET_NAMES_VERSION = "4.2.3";

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
 "0x00000000000000000000000000000000000d0003": "Layer3 Wallet",
 "0x17d518736ee9341dcdc0a2498e013d33cfcdd080": "Ledger",
 "0x00000000000000000000000000000000000d0006": "Binance Web3 Wallet",
 "0x00000000000000000000000000000000000d0001": "Smart Wallet",
 "0x00000000000000000000000000000000000d0007": "Ethos",
 "0x00000000000000000000000000000000000d0004": "SafePal",

 // Solana (SVM) wallets (base58, case-sensitive)
 "11111111111111111111111111111114k": "Layer3",
 "AxU68jEGjXMj3YGRPSPVXg4qpYmUWhoBUfsbuhrFyDe4": "Ledger",
 "11111111111111111111111111111114n": "Seeker"
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
