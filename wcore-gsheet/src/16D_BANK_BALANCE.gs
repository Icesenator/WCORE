/**
 * Enable Banking read access from the workbook (for the "Virement fait" button of the low-balance alert).
 *
 * The credentials (private key, application id, account uid) live ONLY in the USER properties of the account
 * that installed them (like the exchange keys of 36_BINANCE_SYNC.gs), never in the repository (public) and
 * never in the script properties: the cache purges, RESET_ALL_PROPERTIES and the diagnostics that list or
 * preview script properties cannot see them, and another account running this script finds nothing.
 * Installed by the owner himself with WCORE_EB_INSTALL (dialogs in the open workbook).
 * Read-only: only GET calls on /accounts/<uid>/balances. Nothing here logs or returns an amount, a key or an
 * identifier.
 */
var EB_PROP_KEY = "EB_PRIVATE_KEY";
var EB_PROP_APP = "EB_APPLICATION_ID";
var EB_PROP_UID = "EB_FORTUNEO_ACCOUNT_UID";
var EB_API_BASE = "https://api.enablebanking.com";

function _wcoreEbProps_() { return PropertiesService.getUserProperties(); }

// The markers are assembled so that no secret scanner mistakes this source for a key.
var EB_PEM_BEGIN = "-----BEGIN " + "PRIVATE KEY-----";
var EB_PEM_END = "-----END " + "PRIVATE KEY-----";

/** Rebuilds a PEM from what a one-line dialog gives back (newlines lost, spaces possible). "" if not a PKCS#8 key. */
function _wcoreEbNormalizePem_(raw) {
  var s = String(raw || "").trim();
  if (s.indexOf(EB_PEM_BEGIN) !== 0 || s.length < EB_PEM_BEGIN.length + EB_PEM_END.length || s.lastIndexOf(EB_PEM_END) !== s.length - EB_PEM_END.length) return "";
  var body = s.slice(EB_PEM_BEGIN.length, s.length - EB_PEM_END.length).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+\/]+={0,2}$/.test(body)) return "";
  return EB_PEM_BEGIN + "\n" + body.replace(/(.{64})/g, "$1\n").replace(/\n$/, "") + "\n" + EB_PEM_END;
}

/**
 * Stores the credentials in the USER properties. Replacing existing ones needs overwrite = true, and the key
 * must be able to sign. Returns only a boolean and a reason code. Not a public entry point (underscore).
 */
function _wcoreEbStore_(pem, applicationId, accountUid, overwrite) {
  var props = _wcoreEbProps_();
  if (props.getProperty(EB_PROP_KEY) && overwrite !== true) return { stored: false, reason: "ALREADY_SET" };
  var key = _wcoreEbNormalizePem_(pem);
  var app = String(applicationId || "").trim();
  var uid = String(accountUid || "").trim();
  if (!key || !app || !uid) return { stored: false, reason: "INVALID" };
  try { Utilities.computeRsaSha256Signature("probe", key); } catch (eSign) { return { stored: false, reason: "KEY_REJECTED" }; }
  var o = {};
  o[EB_PROP_KEY] = key;
  o[EB_PROP_APP] = app;
  o[EB_PROP_UID] = uid;
  props.setProperties(o);
  return { stored: true };
}

function _wcoreEbAsk_(ui, title, text) {
  var r = ui.prompt(title, text, ui.ButtonSet.OK_CANCEL);
  return r.getSelectedButton() === ui.Button.OK ? String(r.getResponseText() || "") : null;
}

/**
 * Installation by the owner, from the Apps Script editor (select this function, Run) with the workbook open:
 * three dialogs (application id, account uid, key). The values go from the owner's clipboard straight into
 * the user properties; nothing is logged or shown back.
 */
function WCORE_EB_INSTALL() {
  var ui = SpreadsheetApp.getUi();
  var app = _wcoreEbAsk_(ui, "Acces bancaire 1/3", "Identifiant de l'application Enable Banking :");
  if (app === null) return;
  var uid = _wcoreEbAsk_(ui, "Acces bancaire 2/3", "Identifiant du compte Fortuneo (session) :");
  if (uid === null) return;
  var pem = _wcoreEbAsk_(ui, "Acces bancaire 3/3", "Cle privee (tout le contenu du fichier .pem) :");
  if (pem === null) return;
  var res = _wcoreEbStore_(pem, app, uid, false);
  if (res.reason === "ALREADY_SET") {
    var again = ui.alert("Acces bancaire", "Des identifiants existent deja. Les remplacer ?", ui.ButtonSet.YES_NO);
    if (again !== ui.Button.YES) return;
    res = _wcoreEbStore_(pem, app, uid, true);
  }
  ui.alert("Acces bancaire", res.stored ? "Installe." : "Refuse : " + res.reason, ui.ButtonSet.OK);
}

function _wcoreEbJwt_() {
  var props = _wcoreEbProps_();
  var key = props.getProperty(EB_PROP_KEY);
  var app = props.getProperty(EB_PROP_APP);
  if (!key || !app) return null;
  var b64u = function (s) { return Utilities.base64EncodeWebSafe(s).replace(/=+$/, ""); };
  var iat = Math.floor(Date.now() / 1000);
  var head = b64u(JSON.stringify({ typ: "JWT", alg: "RS256", kid: app }));
  var body = b64u(JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: iat, exp: iat + 3600 }));
  var sig;
  try { sig = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(head + "." + body, key)).replace(/=+$/, ""); } catch (e) { return null; }
  return head + "." + body + "." + sig;
}

/**
 * GET on the Enable Banking API. Returns {code, json}; code 0 = not configured or network failure.
 * A single attempt: a 429 or any error is returned as is, never retried here.
 */
function _wcoreEbGet_(path) {
  var jwt = _wcoreEbJwt_();
  if (!jwt) return { code: 0, json: null };
  var resp;
  try {
    resp = UrlFetchApp.fetch(EB_API_BASE + path, {
      method: "get", headers: { Authorization: "Bearer " + jwt }, muteHttpExceptions: true, followRedirects: false, deadline: 15
    });
  } catch (e) { return { code: 0, json: null }; }
  var json = null;
  try { json = JSON.parse(resp.getContentText()); } catch (eParse) { json = null; }
  return { code: resp.getResponseCode(), json: json };
}

/** One balances call on the Fortuneo account; returns the HTTP code only (never an amount). */
function _wcoreEbProbe_() {
  var uid = _wcoreEbProps_().getProperty(EB_PROP_UID);
  if (!uid) return { code: 0 };
  return { code: _wcoreEbGet_("/accounts/" + encodeURIComponent(uid) + "/balances").code };
}

/** Read-only test from the editor (Run, workbook open): says whether the bank answers from Google's servers. */
function WCORE_EB_PROBE() {
  var out = _wcoreEbProbe_();
  try {
    SpreadsheetApp.getUi().alert("Test acces bancaire", out.code ? "Reponse HTTP " + out.code + "." : "Non configure ou sans reponse.", SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { Logger.log("EB probe HTTP " + out.code); }
  return out;
}
