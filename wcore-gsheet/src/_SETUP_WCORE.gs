// _SETUP_WCORE.gs
// v0.9.0 - Enable Web-required scan mode by default.
// v0.8.0 - Minimal auto-setup: keeps non-secret ScriptProperties set on every sheet open.
// Secrets must be set manually in ScriptProperties; this file must not overwrite them.

var WCORE_WEB_API_URL_VALUE = "https://api-production-b5bf.up.railway.app";
var WCORE_GSHEET_TOKEN_VALUE = "";
var WCORE_GSHEET_WEB_SCAN_REQUIRE_VALUE = "true";

function onOpen() {
  _WCORE_APPLY_PROPERTIES_();
}

function _WCORE_APPLY_PROPERTIES_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty("WCORE_WEB_API_URL") !== WCORE_WEB_API_URL_VALUE) {
    props.setProperty("WCORE_WEB_API_URL", WCORE_WEB_API_URL_VALUE);
  }
  if (WCORE_GSHEET_TOKEN_VALUE && props.getProperty("GSHEET_API_TOKEN") !== WCORE_GSHEET_TOKEN_VALUE) {
    props.setProperty("GSHEET_API_TOKEN", WCORE_GSHEET_TOKEN_VALUE);
  }
  if (props.getProperty("GSHEET_WEB_SCAN_REQUIRE") !== WCORE_GSHEET_WEB_SCAN_REQUIRE_VALUE) {
    props.setProperty("GSHEET_WEB_SCAN_REQUIRE", WCORE_GSHEET_WEB_SCAN_REQUIRE_VALUE);
  }
  return "WCORE properties applied";
}

function WCORE_ENABLE_WEB_SCAN_REQUIRE() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty("GSHEET_WEB_SCAN_REQUIRE", "true");
  return "GSHEET_WEB_SCAN_REQUIRE=true";
}

function WCORE_FORCE_HEAL_AND_UPDATE_CRYPTO_V2_NOW() {
  if (typeof WCORE_AUTO_HEAL_FORCE === "function") {
    WCORE_AUTO_HEAL_FORCE();
  }
  if (typeof UPDATE_CRYPTO_PORTFOLIO_V2 !== "function") {
    throw new Error("UPDATE_CRYPTO_PORTFOLIO_V2 not available");
  }
  return UPDATE_CRYPTO_PORTFOLIO_V2();
}

function WCORE_UPDATE_CRYPTO_V2_NOW_ONLY() {
  if (typeof UPDATE_CRYPTO_PORTFOLIO_V2 !== "function") {
    throw new Error("UPDATE_CRYPTO_PORTFOLIO_V2 not available");
  }
  return UPDATE_CRYPTO_PORTFOLIO_V2();
}
