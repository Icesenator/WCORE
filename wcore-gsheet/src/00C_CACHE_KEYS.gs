// wcore-gsheet/src/00C_CACHE_KEYS.gs
// v1.0.2 - Cache Key Registry helpers loaded before cache modules.
// Provides canonical cache key builders for gsheet runtime.
// v1.0.2: renamed from CACHE_KEYS.gs so CK_get exists before 04C_CACHE_GLOBAL.gs.
// v1.0.1: removed buggy scanResult entry (did not match CacheManager.walletKey format);
//          added CK_walletKey(config, address) helper that mirrors the real per-wallet
//          cache key format: {PREFIX}WALLET_{addressLowercase}.

(function(global) {
  "use strict";

  var CK_REGISTRY = {
    priceDex: { vars: ["chainSlug", "contract"], pattern: "DEX:{chainSlug}:{contract}" },
    priceGt: { vars: ["gtNetwork", "contract"], pattern: "GT:{gtNetwork}:{contract}" },
    priceLlama: { vars: ["llamaId"], pattern: "LLAMA:{llamaId}" },
    tokenMetadata: { vars: ["chainSlug", "contract"], pattern: "META:{chainSlug}:{contract}" },
    walletGlobal: { vars: [], pattern: "GLOBAL_WALLET_CACHE_V1" },
    fxEurUsd: { vars: [], pattern: "FX_EUR_USD" },
    emptyWallet: { vars: ["chainKey", "address"], pattern: "EMPTY_{chainKey}_{address}" },
  };

  function _ckInterpolate(pattern, vars) {
    vars = vars || {};
    return pattern.replace(/\{(\w+)\}/g, function(_, key) {
      if (!(key in vars)) throw new Error("CK missing var: " + key);
      return String(vars[key]);
    });
  }

  global.CK_get = function(name, vars) {
    var def = CK_REGISTRY[name];
    if (!def) throw new Error("CK unknown key: " + name);
    return _ckInterpolate(def.pattern, vars);
  };

  global.CK_list = function() {
    return Object.keys(CK_REGISTRY);
  };

  global.CK_walletKey = function(config, address) {
    var prefix = (config && config.KEYS && config.KEYS.PREFIX) ? String(config.KEYS.PREFIX) : "";
    return prefix + "WALLET_" + String(address || "").toLowerCase();
  };
})(this);
