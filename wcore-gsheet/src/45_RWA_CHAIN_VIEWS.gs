var RWA_CHAIN_VIEWS_CONFIG = [
  { key:"ETHEREUM", chainKey:"ETHEREUM", cacheFn:"CACHED_WALLET_ASSETS_ETHEREUM", crypto:"Ledger - Ethereum Crypto", action:"Ledger - Ethereum Action", legacy:["Ledger - Ethereum"] },
  { key:"BSC", chainKey:"BSC", cacheFn:"CACHED_WALLET_ASSETS_BSC", crypto:"Ledger - BNB Chain Crypto", action:"Ledger - BNB Chain Action", legacy:["Ledger - BNB Chain"] },
  { key:"ARBITRUM_ONE", chainKey:"ARBITRUM_ONE", cacheFn:"CACHED_WALLET_ASSETS_ARBITRUM_ONE", crypto:"Ledger - Arbitrum One Crypto", action:"Ledger - Arbitrum One Action", legacy:["Ledger - Arbitrum One"] },
  { key:"MANTLE", chainKey:"MANTLE", cacheFn:"CACHED_WALLET_ASSETS_MANTLE", crypto:"Ledger - Mantle Crypto", action:"Ledger - Mantle Action", legacy:["Ledger - Mantle"] },
  { key:"HYPEREVM", chainKey:"HYPEREVM", cacheFn:"CACHED_WALLET_ASSETS_HYPEREVM", crypto:"Ledger - HyperEVM Crypto", action:"Ledger - HyperEVM Action", legacy:["Ledger - HyperEVM"] },
  { key:"INK", chainKey:"INK", cacheFn:"CACHED_WALLET_ASSETS_INK", crypto:"Ledger - Ink Crypto", action:"Ledger - Ink Action", legacy:["Ledger - Ink"] },
  { key:"X_LAYER", chainKey:"X_LAYER", cacheFn:"CACHED_WALLET_ASSETS_X_LAYER", crypto:"Ledger - X Layer Crypto", action:"Ledger - X Layer Action", legacy:["Ledger - X Layer"] },
  { key:"OPTIMISM", chainKey:"OPTIMISM", cacheFn:"CACHED_WALLET_ASSETS_OPTIMISM", crypto:"Ledger - Optimism Crypto", action:"Ledger - Optimism Action", legacy:["Ledger - Optimism"] },
  { key:"ROBINHOOD_CHAIN", chainKey:"ROBINHOOD_CHAIN", cacheFn:"CACHED_WALLET_ASSETS_ROBINHOOD_CHAIN", crypto:"Ledger - Robinhood Chain Crypto", action:"Ledger - Robinhood Chain Action", legacy:["Ledger - Robinhood Chain"] },
  { key:"BASE", chainKey:"BASE", cacheFn:"CACHED_WALLET_ASSETS_BASE", crypto:"Ledger - Base Crypto", action:"Ledger - Base Action", legacy:["Ledger - Base"] },
  // v4.16.82 - PEAQ: chaine CRYPTO UNIQUEMENT (pas de vue Action).
  // PEAQ n'a aucune entree dans RWA_REGISTRY_ENTRIES (pas de xStocks, pas
  // d'Ondo, pas de token Robinhood). Or _rwaProjectActionRows_ ne conserve
  // que les lignes trouvees au registre (`if (!entry) continue`), une vue
  // Action y serait donc structurellement VIDE: l'onglet existerait sans
  // jamais afficher la moindre ligne. `action` est volontairement absent
  // plutot que rempli d'un nom de tab fantome.
  { key:"PEAQ", chainKey:"PEAQ", cacheFn:"CACHED_WALLET_ASSETS_PEAQ", crypto:"Ledger - Peaq Crypto", legacy:["Ledger - Peaq"] }
];

function _rwaExpectedCacheFnByKey_(key) {
  switch (key) {
    case "ETHEREUM": return "CACHED_WALLET_ASSETS_ETHEREUM";
    case "BSC": return "CACHED_WALLET_ASSETS_BSC";
    case "ARBITRUM_ONE": return "CACHED_WALLET_ASSETS_ARBITRUM_ONE";
    case "MANTLE": return "CACHED_WALLET_ASSETS_MANTLE";
    case "HYPEREVM": return "CACHED_WALLET_ASSETS_HYPEREVM";
    case "INK": return "CACHED_WALLET_ASSETS_INK";
    case "X_LAYER": return "CACHED_WALLET_ASSETS_X_LAYER";
    case "OPTIMISM": return "CACHED_WALLET_ASSETS_OPTIMISM";
    case "ROBINHOOD_CHAIN": return "CACHED_WALLET_ASSETS_ROBINHOOD_CHAIN";
    case "BASE": return "CACHED_WALLET_ASSETS_BASE";
    case "PEAQ": return "CACHED_WALLET_ASSETS_PEAQ";
    default: return null;
  }
}

function _rwaValidateViewsConfig_(configs) {
  if (!Array.isArray(configs)) throw new Error("RWA_CHAIN_VIEWS_CONFIG: array requis");
  var keys = {};
  var cryptoNames = {};
  var actionNames = {};
  for (var i = 0; i < configs.length; i++) {
    var cfg = configs[i];
    // v4.16.82 - `action` est OPTIONNEL : une chaine crypto-only (PEAQ) n'a
    // aucune vue Action. Quand il est absent, la chaine doit bien etre
    // declaree crypto-only (hasAction=false) plutot que passer silencieusement.
    var hasAction = cfg && cfg.action !== undefined && cfg.action !== null && String(cfg.action).trim() !== "";
    if (!cfg || !String(cfg.key || "").trim() || !String(cfg.chainKey || "").trim() || !String(cfg.cacheFn || "").trim() || !String(cfg.crypto || "").trim()) throw new Error("RWA_CHAIN_VIEWS_CONFIG: champs requis index " + i);
    if (cfg.cacheFn !== _rwaExpectedCacheFnByKey_(cfg.key)) throw new Error("RWA_CHAIN_VIEWS_CONFIG: cacheFn invalide " + cfg.key);
    if (!Array.isArray(cfg.legacy) || !cfg.legacy.length) throw new Error("RWA_CHAIN_VIEWS_CONFIG: legacy array requis " + cfg.key);
    for (var legacyIndex = 0; legacyIndex < cfg.legacy.length; legacyIndex++) if (!String(cfg.legacy[legacyIndex] || "").trim()) throw new Error("RWA_CHAIN_VIEWS_CONFIG: legacy vide " + cfg.key);
    if (keys[cfg.key]) throw new Error("RWA_CHAIN_VIEWS_CONFIG: key dupliquee " + cfg.key);
    if (cryptoNames[cfg.crypto]) throw new Error("RWA_CHAIN_VIEWS_CONFIG: crypto duplique " + cfg.crypto);
    if (hasAction) {
      if (actionNames[cfg.action]) throw new Error("RWA_CHAIN_VIEWS_CONFIG: action dupliquee " + cfg.action);
    }
    if (!/ Crypto$/.test(cfg.crypto)) throw new Error("RWA_CHAIN_VIEWS_CONFIG: suffixe invalide " + cfg.key);
    if (cfg.crypto.indexOf("Ledger - ") !== 0) {
      throw new Error("RWA_CHAIN_VIEWS_CONFIG: prefixe Ledger invalide " + cfg.key);
    }
    if (hasAction) {
      if (!/ Action$/.test(cfg.action)) throw new Error("RWA_CHAIN_VIEWS_CONFIG: suffixe invalide " + cfg.key);
      if (cfg.action.indexOf("Ledger - ") !== 0) {
        throw new Error("RWA_CHAIN_VIEWS_CONFIG: prefixe Ledger invalide " + cfg.key);
      }
      actionNames[cfg.action] = true;
    }
    keys[cfg.key] = true;
    cryptoNames[cfg.crypto] = true;
  }
  return true;
}

function _rwaViewsConfigByKey_(key) {
  for (var i = 0; i < RWA_CHAIN_VIEWS_CONFIG.length; i++) if (RWA_CHAIN_VIEWS_CONFIG[i].key === key) return RWA_CHAIN_VIEWS_CONFIG[i];
  return null;
}

function _rwaCachedRowsByKey_(key, walletArg) {
  switch (key) {
    case "ETHEREUM": return CACHED_WALLET_ASSETS_ETHEREUM(walletArg);
    case "BSC": return CACHED_WALLET_ASSETS_BSC(walletArg);
    case "ARBITRUM_ONE": return CACHED_WALLET_ASSETS_ARBITRUM_ONE(walletArg);
    case "MANTLE": return CACHED_WALLET_ASSETS_MANTLE(walletArg);
    case "HYPEREVM": return CACHED_WALLET_ASSETS_HYPEREVM(walletArg);
    case "INK": return CACHED_WALLET_ASSETS_INK(walletArg);
    case "X_LAYER": return CACHED_WALLET_ASSETS_X_LAYER(walletArg);
    case "OPTIMISM": return CACHED_WALLET_ASSETS_OPTIMISM(walletArg);
    case "ROBINHOOD_CHAIN": return CACHED_WALLET_ASSETS_ROBINHOOD_CHAIN(walletArg);
    case "BASE": return CACHED_WALLET_ASSETS_BASE(walletArg);
    case "PEAQ": return CACHED_WALLET_ASSETS_PEAQ(walletArg);
    default: throw new Error("_rwaCachedRowsByKey_: unsupported key " + key);
  }
}

function _rwaProjectCryptoByCfg_(cfg,a){return _rwaProjectCryptoRows_(cfg.chainKey,cfg.crypto,_rwaCachedRowsByKey_(cfg.key,a));}
// v4.16.82 - Une chaine crypto-only (PEAQ) n'a pas de vue Action. On echoue
// explicitement plutot que de projeter vers undefined.
function _rwaProjectActionByCfg_(cfg,a){
  if (!cfg || !cfg.action) throw new Error("_rwaProjectActionByCfg_: chaine crypto-only, pas de vue Action (" + (cfg && cfg.key) + ")");
  return _rwaProjectActionRows_(cfg.chainKey,cfg.action,_rwaCachedRowsByKey_(cfg.key,a));
}
function _rwaHasActionView_(cfg){return !!(cfg && cfg.action && String(cfg.action).trim());}

_rwaValidateViewsConfig_(RWA_CHAIN_VIEWS_CONFIG);
for (var _rwaViewCfgIndex_ = 0; _rwaViewCfgIndex_ < RWA_CHAIN_VIEWS_CONFIG.length; _rwaViewCfgIndex_++) {
  // Une chaine crypto-only n'a rien a relier: l'enregistrement du couple
  // secondary->primary n'a de sens que s'il existe une vue secondaire.
  if (_rwaHasActionView_(RWA_CHAIN_VIEWS_CONFIG[_rwaViewCfgIndex_])) {
    LedgerViewRegistry_register({ secondary:RWA_CHAIN_VIEWS_CONFIG[_rwaViewCfgIndex_].action, primary:RWA_CHAIN_VIEWS_CONFIG[_rwaViewCfgIndex_].crypto });
  }
}
LedgerViewRegistry_register({ secondary:"Ledger - Solana Action", primary:"Ledger - Solana Crypto" });
