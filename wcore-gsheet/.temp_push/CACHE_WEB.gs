// wcore-gsheet/src/CACHE_WEB.gs
// v0.2.0 — Optional web-backed cache delegation
// Falls back to local flow silently on any error.

(function(global) {
  "use strict";

  function _webKeyForGsheetName(name, vars) {
    if (name === "walletGlobal") return "wallet:global";
    if (name === "fxEurUsd") return "fx:eur:usd";
    if (name === "priceDex" && vars && vars.chainSlug && vars.contract) {
      return "price:dex:" + String(vars.chainSlug).toLowerCase() + ":" + String(vars.contract).toLowerCase();
    }
    if (name === "priceGt" && vars && vars.gtNetwork && vars.contract) {
      return "price:gt:" + String(vars.gtNetwork).toLowerCase() + ":" + String(vars.contract).toLowerCase();
    }
    if (name === "priceLlama" && vars && vars.llamaId) {
      return "price:llama:" + String(vars.llamaId).toLowerCase();
    }
    if (name === "tokenMetadata" && vars && vars.chainSlug && vars.contract) {
      return "meta:" + String(vars.chainSlug).toLowerCase() + ":" + String(vars.contract).toLowerCase();
    }
    return null;
  }

  global.CK_webGet = function(name, vars) {
    var baseUrl = PropertiesService.getScriptProperties().getProperty("WCORE_WEB_API_URL");
    var token = PropertiesService.getScriptProperties().getProperty("GSHEET_API_TOKEN");
    if (!baseUrl || !token) return null;

    var webKey = _webKeyForGsheetName(name, vars);
    if (!webKey) return null;

    try {
      var resp = UrlFetchApp.fetch(baseUrl + "/api/gsheet/cache/get?key=" + encodeURIComponent(webKey), {
        method: "get",
        headers: { "x-gsheet-token": token },
        muteHttpExceptions: true
      });
      if (resp.getResponseCode() !== 200) return null;
      var body = JSON.parse(resp.getContentText());
      return body && body.found ? body.value : null;
    } catch (e) {
      return null;
    }
  };
})(this);
