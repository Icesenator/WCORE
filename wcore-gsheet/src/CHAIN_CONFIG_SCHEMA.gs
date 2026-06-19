// wcore-gsheet/src/CHAIN_CONFIG_SCHEMA.gs
// v0.1.0 — Mirror du ChainConfig TS pour validation runtime gsheet.
// Idempotent: throws on invalid, returns true on valid.

(function(global) {
  "use strict";

  var ALLOWED_VMS = ["EVM","SVM","COSMOS","TON"];

  function _isNonEmptyString(s) { return typeof s === "string" && s.length >= 1; }
  function _isUrl(s) { return typeof s === "string" && /^https?:\/\//.test(s); }

  function _validate(config) {
    var errs = [];
    if (!config) {
      throw new Error("ChainConfig invalid: config is null");
    }
    if (!_isNonEmptyString(config.key) || config.key.length < 2) {
      errs.push("missing or short key");
    }
    if (ALLOWED_VMS.indexOf(config.vm) < 0) {
      errs.push("invalid vm (must be one of " + ALLOWED_VMS.join(",") + ")");
    }
    if (typeof config.cacheVersion !== "number") {
      errs.push("cacheVersion must be number");
    }
    if (!config.rpc || !Array.isArray(config.rpc.endpoints) || config.rpc.endpoints.length < 1) {
      errs.push("rpc.endpoints required (array, min 1)");
    } else {
      for (var i = 0; i < config.rpc.endpoints.length; i++) {
        if (!_isUrl(config.rpc.endpoints[i])) {
          errs.push("rpc.endpoints[" + i + "] invalid url");
        }
      }
    }
    if (!config.chain || !_isNonEmptyString(config.chain.nativeSymbol)) {
      errs.push("chain.nativeSymbol required");
    }
    if (!config.chain || !_isNonEmptyString(config.chain.nativeName)) {
      errs.push("chain.nativeName required");
    }
    if (!config.chain || typeof config.chain.nativeDecimals !== "number") {
      errs.push("chain.nativeDecimals must be number");
    }
    if (errs.length > 0) {
      throw new Error("ChainConfig invalid [" + (config.key || "?") + "]: " + errs.join("; "));
    }
    return true;
  }

  global.CHAIN_CONFIG_SCHEMA = {
    validate: _validate,
    requiredFields: ["key","vm","cacheVersion","rpc","chain","timeouts","llamaIdMap"]
  };
})(this);
