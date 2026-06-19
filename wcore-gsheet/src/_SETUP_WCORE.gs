// _SETUP_WCORE.gs
// v0.8.0 - Minimal auto-setup: keeps non-secret ScriptProperties set on every sheet open.
// Secrets must be set manually in ScriptProperties; this file must not overwrite them.

var WCORE_WEB_API_URL_VALUE = "https://api-production-b5bf.up.railway.app";
var WCORE_GSHEET_TOKEN_VALUE = "";

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
}
