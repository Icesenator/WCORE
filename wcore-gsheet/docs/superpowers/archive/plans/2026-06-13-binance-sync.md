# Connecteur Binance (Spot + Earn) Implementation Plan

> **Historical/completed plan.** Binance sync is documented in live CEX docs; keep this file for implementation history only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recuperer les soldes Binance Spot + Simple Earn (flexible/locked) via l'API officielle et les ecrire dans un onglet `Binance Spot Crypto`, avec refresh par checkbox A1 et triggers automatiques.

**Architecture:** Un seul fichier GAS `src/36_BINANCE_SYNC.gs` calque sur `35_BITPANDA_SYNC.gs`. Requetes signees HMAC-SHA256. Onglet cree par le script. Refresh manuel via flag ScriptProperty + trigger installable (un onEdit simple ne peut pas faire de UrlFetch).

**Tech Stack:** Google Apps Script, API Binance (`api.binance.com`), `Utilities.computeHmacSha256Signature`, `UrlFetchApp`, Google Sheets API (verif via service account).

**Contexte projet:** Pas de framework de tests unitaires GAS. "Test" = (1) `node scripts/validate-static.js` doit passer, (2) deploiement `clasp push --force`, (3) verification reelle via API Sheets (service account) ou execution editeur. Versions: bandeau `// vX` en tete + `BINANCE_SYNC_VERSION`. Spreadsheet ID: `1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4`. Script ID: `1I_GcliVEAHnWrV3R3j2ONntRwHh9-ebW4sSPXapJi3CxoR_qgvYxi2cw`.

---

## File Structure

- Create: `src/36_BINANCE_SYNC.gs` — tout le connecteur Binance (auth, fetch signe, buckets, ecriture onglet, onEdit, triggers, setup onglet, diagnostics).
- Modify: `src/16_REFRESH.gs` — brancher `BINANCE_ON_EDIT(e)` dans `WCORE_ON_EDIT`.

---

## Task 1: Squelette du fichier + config + auth

**Files:**
- Create: `src/36_BINANCE_SYNC.gs`

- [ ] **Step 1: Creer le fichier avec en-tete, config, et gestion des cles**

Ecrire dans `src/36_BINANCE_SYNC.gs`:

```javascript
// v4.15.78 - Binance API sync (Spot + Simple Earn flexible/locked)
//
// Recupere les soldes Binance et les ecrit dans l'onglet "Binance Spot Crypto".
// Cles API stockees dans ScriptProperties, jamais dans la spreadsheet.
//
// Setup (Apps Script editor ou bootstrap):
//   SET_BINANCE_API_KEYS("apiKey", "apiSecret")
// Diagnostic sans ecriture:
//   DIAG_BINANCE_API()
// Mise a jour:
//   UPDATE_BINANCE_SPOT()
// Installation triggers:
//   INSTALL_BINANCE_SYNC_TRIGGER()

var BINANCE_SYNC_VERSION = "4.15.78";

var BINANCE_SYNC_CONFIG = {
  BASE_URL: "https://api.binance.com",
  API_KEY_PROP: "BINANCE_API_KEY",
  API_SECRET_PROP: "BINANCE_API_SECRET",
  STATUS_PROP: "BINANCE_SYNC_STATUS",
  REFRESH_FLAG_PROP: "BINANCE_REFRESH_REQUESTED",
  SHEET: "Binance Spot Crypto",
  RECV_WINDOW: 60000,
  PAGE_SIZE: 100,
  MAX_PAGES: 50,
  SPREADSHEET_ID: "1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4"
};

function SET_BINANCE_API_KEYS(apiKey, apiSecret) {
  if (!apiKey || String(apiKey).length < 20) throw new Error("API key invalide ou trop courte");
  if (!apiSecret || String(apiSecret).length < 20) throw new Error("API secret invalide ou trop court");
  var props = PropertiesService.getScriptProperties();
  props.setProperty(BINANCE_SYNC_CONFIG.API_KEY_PROP, String(apiKey).trim());
  props.setProperty(BINANCE_SYNC_CONFIG.API_SECRET_PROP, String(apiSecret).trim());
  return "OK: BINANCE_API_KEY + BINANCE_API_SECRET saved";
}

function CLEAR_BINANCE_API_KEYS() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(BINANCE_SYNC_CONFIG.API_KEY_PROP);
  props.deleteProperty(BINANCE_SYNC_CONFIG.API_SECRET_PROP);
  return "OK: Binance API keys cleared";
}

function _binGetCreds_() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty(BINANCE_SYNC_CONFIG.API_KEY_PROP);
  var secret = props.getProperty(BINANCE_SYNC_CONFIG.API_SECRET_PROP);
  if (!key || !secret) {
    throw new Error("Missing BINANCE_API_KEY/BINANCE_API_SECRET. Run SET_BINANCE_API_KEYS(...)");
  }
  return { key: key, secret: secret };
}

function _binSetStatus_(status) {
  try {
    PropertiesService.getScriptProperties().setProperty(
      BINANCE_SYNC_CONFIG.STATUS_PROP, JSON.stringify(status)
    );
  } catch (err) {
    Logger.log("BINANCE_SYNC_STATUS skipped: " + err);
  }
}

function BINANCE_SYNC_STATUS() {
  return PropertiesService.getScriptProperties().getProperty(BINANCE_SYNC_CONFIG.STATUS_PROP) || "NO_STATUS";
}
```

- [ ] **Step 2: Valider statiquement**

Run: `rtk proxy node scripts/validate-static.js`
Expected: `Static validation OK (...)` sans erreur de parse.

- [ ] **Step 3: Commit**

```bash
rtk git add src/36_BINANCE_SYNC.gs
rtk git commit -m "feat(binance): squelette connecteur + config + gestion cles"
```

---

## Task 2: Requete signee HMAC + parseur de soldes

**Files:**
- Modify: `src/36_BINANCE_SYNC.gs`

- [ ] **Step 1: Ajouter la signature, le fetch signe et les helpers de solde**

Ajouter a la fin de `src/36_BINANCE_SYNC.gs`:

```javascript
function _binSign_(queryString, secret) {
  var raw = Utilities.computeHmacSha256Signature(queryString, secret);
  var hex = "";
  for (var i = 0; i < raw.length; i++) {
    var b = raw[i];
    if (b < 0) b += 256;
    var h = b.toString(16);
    if (h.length === 1) h = "0" + h;
    hex += h;
  }
  return hex;
}

// GET signe. params = objet de parametres (hors timestamp/signature).
function _binSignedGet_(path, params, creds) {
  params = params || {};
  params.timestamp = Date.now();
  params.recvWindow = BINANCE_SYNC_CONFIG.RECV_WINDOW;
  var qs = [];
  for (var k in params) {
    if (Object.prototype.hasOwnProperty.call(params, k)) {
      qs.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k]));
    }
  }
  var queryString = qs.join("&");
  var signature = _binSign_(queryString, creds.secret);
  var url = BINANCE_SYNC_CONFIG.BASE_URL + path + "?" + queryString + "&signature=" + signature;
  var resp = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
    headers: { "X-MBX-APIKEY": creds.key }
  });
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code === 451 || code === 403) {
    throw new Error("Binance IP/geo blocked (HTTP " + code + "): " + text.substring(0, 200));
  }
  if (code < 200 || code >= 300) {
    throw new Error("Binance " + path + " HTTP " + code + ": " + text.substring(0, 300));
  }
  return JSON.parse(text);
}

function _binParseAmount_(value) {
  var n = Number(String(value == null ? "0" : value).replace(",", "."));
  return isFinite(n) ? n : 0;
}

// Ajoute/cumule un (symbole, montant) dans une liste de lignes d'un meme bucket
// source. Cumule seulement les doublons EXACTS de la meme source (defensif).
function _binPushRow_(rows, seen, symbol, amount) {
  var s = String(symbol || "").trim().toUpperCase();
  if (!s) return;
  var amt = _binParseAmount_(amount);
  if (Object.prototype.hasOwnProperty.call(seen, s)) {
    rows[seen[s]][1] = _binParseAmount_(rows[seen[s]][1]) + amt;
    return;
  }
  seen[s] = rows.length;
  rows.push([s, amt]);
}
```

- [ ] **Step 2: Valider statiquement**

Run: `rtk proxy node scripts/validate-static.js`
Expected: `Static validation OK (...)`.

- [ ] **Step 3: Commit**

```bash
rtk git add src/36_BINANCE_SYNC.gs
rtk git commit -m "feat(binance): signature HMAC + fetch signe + helpers solde"
```

---

## Task 3: Recuperation des buckets (spot, earn-flexible, earn-locked)

**Files:**
- Modify: `src/36_BINANCE_SYNC.gs`

- [ ] **Step 1: Ajouter les fetchers par source et l'agregateur de buckets**

Ajouter a la fin de `src/36_BINANCE_SYNC.gs`:

```javascript
function _binFetchSpot_(creds) {
  var rows = [], seen = {};
  var acc = _binSignedGet_("/api/v3/account", {}, creds);
  var balances = (acc && acc.balances) || [];
  for (var i = 0; i < balances.length; i++) {
    var b = balances[i];
    var total = _binParseAmount_(b.free) + _binParseAmount_(b.locked);
    if (total > 0) _binPushRow_(rows, seen, b.asset, total);
  }
  return rows;
}

// Pagine /sapi/v1/simple-earn/{kind}/position. amountKey = champ du montant.
function _binFetchEarn_(creds, kind, amountKey) {
  var rows = [], seen = {};
  var page = 1;
  while (page <= BINANCE_SYNC_CONFIG.MAX_PAGES) {
    var data = _binSignedGet_(
      "/sapi/v1/simple-earn/" + kind + "/position",
      { current: page, size: BINANCE_SYNC_CONFIG.PAGE_SIZE },
      creds
    );
    var list = (data && data.rows) || [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var amt = _binParseAmount_(r[amountKey]);
      if (amt > 0) _binPushRow_(rows, seen, r.asset, amt);
    }
    var total = data && typeof data.total !== "undefined" ? Number(data.total) : list.length;
    if (list.length < BINANCE_SYNC_CONFIG.PAGE_SIZE) break;
    if (page * BINANCE_SYNC_CONFIG.PAGE_SIZE >= total) break;
    page++;
  }
  return rows;
}

function _binFetchBuckets_(creds) {
  return {
    spot: _binFetchSpot_(creds),
    "earn-flexible": _binFetchEarn_(creds, "flexible", "totalAmount"),
    "earn-locked": _binFetchEarn_(creds, "locked", "amount")
  };
}
```

- [ ] **Step 2: Valider statiquement**

Run: `rtk proxy node scripts/validate-static.js`
Expected: `Static validation OK (...)`.

- [ ] **Step 3: Commit**

```bash
rtk git add src/36_BINANCE_SYNC.gs
rtk git commit -m "feat(binance): fetch spot + earn flexible/locked + buckets"
```

---

## Task 4: Diagnostic sans ecriture

**Files:**
- Modify: `src/36_BINANCE_SYNC.gs`

- [ ] **Step 1: Ajouter DIAG_BINANCE_API**

Ajouter a la fin de `src/36_BINANCE_SYNC.gs`:

```javascript
function DIAG_BINANCE_API() {
  try {
    var creds = _binGetCreds_();
    var buckets = _binFetchBuckets_(creds);
    var msg = [
      "Binance API diag " + BINANCE_SYNC_VERSION,
      "spot=" + buckets.spot.length,
      "earn-flexible=" + buckets["earn-flexible"].length,
      "earn-locked=" + buckets["earn-locked"].length,
      "spot sample=" + JSON.stringify(buckets.spot.slice(0, 8)),
      "earn-flexible sample=" + JSON.stringify(buckets["earn-flexible"].slice(0, 8)),
      "earn-locked sample=" + JSON.stringify(buckets["earn-locked"].slice(0, 8))
    ].join("\n");
    Logger.log(msg);
    return msg;
  } catch (err) {
    var m = "Binance API diag ERROR: " + (err && err.message ? err.message : err);
    Logger.log(m);
    return m;
  }
}
```

- [ ] **Step 2: Valider statiquement**

Run: `rtk proxy node scripts/validate-static.js`
Expected: `Static validation OK (...)`.

- [ ] **Step 3: Commit**

```bash
rtk git add src/36_BINANCE_SYNC.gs
rtk git commit -m "feat(binance): DIAG_BINANCE_API sans ecriture"
```

---

## Task 5: Creation de l'onglet + ecriture des lignes

**Files:**
- Modify: `src/36_BINANCE_SYNC.gs`

- [ ] **Step 1: Ajouter SETUP_BINANCE_SHEET, l'ecriture et UPDATE_BINANCE_SPOT**

Ajouter a la fin de `src/36_BINANCE_SYNC.gs`:

```javascript
function _binFormatStamp_(stamp) {
  return "Refresh Binance API. Last updated " + stamp + " via Apps Script binance-api";
}

function SETUP_BINANCE_SHEET() {
  var ss = SpreadsheetApp.openById(BINANCE_SYNC_CONFIG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(BINANCE_SYNC_CONFIG.SHEET);
  if (!sh) sh = ss.insertSheet(BINANCE_SYNC_CONFIG.SHEET);
  sh.getRange("A1").insertCheckboxes().setValue(false);
  sh.getRange("B1").setValue(_binFormatStamp_(
    Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm")
  )).setNumberFormat("@");
  sh.getRange(2, 1, 1, 4).setValues([["cryptocoin_symbol", "balance", "source", "updated_at"]]);
  return "OK_BINANCE_SHEET_READY";
}

// rows = liste [symbol, amount] pour une source donnee.
function _binBuildValues_(buckets, stamp) {
  var values = [];
  var order = ["spot", "earn-flexible", "earn-locked"];
  for (var o = 0; o < order.length; o++) {
    var src = order[o];
    var list = buckets[src] || [];
    for (var i = 0; i < list.length; i++) {
      values.push([list[i][0], _binParseAmount_(list[i][1]), src, stamp]);
    }
  }
  return values;
}

function _binWriteSheet_(ss, buckets) {
  var sh = ss.getSheetByName(BINANCE_SYNC_CONFIG.SHEET);
  if (!sh) sh = ss.insertSheet(BINANCE_SYNC_CONFIG.SHEET);
  var stamp = Utilities.formatDate(new Date(), "Europe/Paris", "yyyy-MM-dd HH:mm");
  var header = [];
  header.push([false, _binFormatStamp_(stamp), "", ""]);
  header.push(["cryptocoin_symbol", "balance", "source", "updated_at"]);
  var dataRows = _binBuildValues_(buckets, stamp);
  var values = header.concat(dataRows);
  sh.getRange(1, 1, Math.max(sh.getLastRow(), 2), Math.max(sh.getLastColumn(), 4)).clearContent();
  sh.getRange(1, 1, values.length, 4).setValues(values);
  sh.getRange("A1").insertCheckboxes().setValue(false);
  sh.getRange("B1:D1").setNumberFormat("@");
  if (values.length > 2) sh.getRange(3, 2, values.length - 2, 1).setNumberFormat("0.########");
  return dataRows.length;
}

function UPDATE_BINANCE_SPOT() {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return "BUSY"; }
  try {
    var ss = SpreadsheetApp.openById(BINANCE_SYNC_CONFIG.SPREADSHEET_ID);
    var creds = _binGetCreds_();
    var buckets = _binFetchBuckets_(creds);
    var written = _binWriteSheet_(ss, buckets);
    var status = {
      ok: true,
      ts: new Date().toISOString(),
      spot: buckets.spot.length,
      "earn-flexible": buckets["earn-flexible"].length,
      "earn-locked": buckets["earn-locked"].length,
      rows: written
    };
    _binSetStatus_(status);
    return JSON.stringify(status);
  } catch (err) {
    var statusErr = { ok: false, ts: new Date().toISOString(), error: String(err) };
    _binSetStatus_(statusErr);
    Logger.log("UPDATE_BINANCE_SPOT ERROR: " + err);
    return JSON.stringify(statusErr);
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}
```

- [ ] **Step 2: Valider statiquement**

Run: `rtk proxy node scripts/validate-static.js`
Expected: `Static validation OK (...)`.

- [ ] **Step 3: Commit**

```bash
rtk git add src/36_BINANCE_SYNC.gs
rtk git commit -m "feat(binance): creation onglet + ecriture lignes + UPDATE_BINANCE_SPOT"
```

---

## Task 6: Refresh par checkbox + triggers

**Files:**
- Modify: `src/36_BINANCE_SYNC.gs`
- Modify: `src/16_REFRESH.gs`

- [ ] **Step 1: Ajouter onEdit, watchdog et installateur de triggers**

Ajouter a la fin de `src/36_BINANCE_SYNC.gs`:

```javascript
function BINANCE_ON_EDIT(e) {
  try {
    if (!e || !e.range) return false;
    var range = e.range;
    var cell = range.getA1Notation ? range.getA1Notation() : "";
    if (cell !== "A1") return false;
    var sheet = range.getSheet ? range.getSheet() : null;
    if (!sheet || sheet.getName() !== BINANCE_SYNC_CONFIG.SHEET) return false;
    var v = (typeof e.value !== "undefined") ? e.value : range.getValue();
    if (String(v).toUpperCase() !== "TRUE") return true;
    // onEdit SIMPLE ne peut pas faire UrlFetch: on pose un flag traite par le
    // trigger installable BINANCE_REFRESH_WATCHDOG.
    try {
      PropertiesService.getScriptProperties().setProperty(
        BINANCE_SYNC_CONFIG.REFRESH_FLAG_PROP, String(Date.now())
      );
    } catch (eFlag) {}
    range.setValue(false);
    return true;
  } catch (err) {
    try { Logger.log("[BINANCE_ON_EDIT] " + (err && err.message ? err.message : err)); } catch (eLog) {}
    try { if (e && e.range) e.range.setValue(false); } catch (eReset) {}
    return true;
  }
}

function BINANCE_REFRESH_WATCHDOG() {
  var props = PropertiesService.getScriptProperties();
  var flag = props.getProperty(BINANCE_SYNC_CONFIG.REFRESH_FLAG_PROP);
  if (!flag) return "NO_REQUEST";
  props.deleteProperty(BINANCE_SYNC_CONFIG.REFRESH_FLAG_PROP);
  return UPDATE_BINANCE_SPOT();
}

function BINANCE_TRIGGER_STATUS() {
  var trs = ScriptApp.getProjectTriggers();
  var hourly = 0, watchdog = 0;
  for (var i = 0; i < trs.length; i++) {
    var fn = trs[i].getHandlerFunction();
    if (fn === "UPDATE_BINANCE_SPOT") hourly++;
    else if (fn === "BINANCE_REFRESH_WATCHDOG") watchdog++;
  }
  return "hourly=" + hourly + " refreshWatchdog=" + watchdog;
}

function INSTALL_BINANCE_SYNC_TRIGGER() {
  var trs = ScriptApp.getProjectTriggers();
  for (var i = 0; i < trs.length; i++) {
    var fn = trs[i].getHandlerFunction();
    if (fn === "UPDATE_BINANCE_SPOT" || fn === "BINANCE_REFRESH_WATCHDOG") ScriptApp.deleteTrigger(trs[i]);
  }
  ScriptApp.newTrigger("UPDATE_BINANCE_SPOT").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("BINANCE_REFRESH_WATCHDOG").timeBased().everyMinutes(1).create();
  return "Triggers installed: UPDATE_BINANCE_SPOT (1h) + BINANCE_REFRESH_WATCHDOG (1min)";
}
```

- [ ] **Step 2: Brancher BINANCE_ON_EDIT dans WCORE_ON_EDIT**

Dans `src/16_REFRESH.gs`, juste apres la ligne existante
`if (typeof BITPANDA_ON_EDIT === "function" && BITPANDA_ON_EDIT(e)) return;`,
ajouter:

```javascript
    if (typeof BINANCE_ON_EDIT === "function" && BINANCE_ON_EDIT(e)) return;
```

- [ ] **Step 3: Valider statiquement**

Run: `rtk proxy node scripts/validate-static.js`
Expected: `Static validation OK (...)`.

- [ ] **Step 4: Commit**

```bash
rtk git add src/36_BINANCE_SYNC.gs src/16_REFRESH.gs
rtk git commit -m "feat(binance): refresh checkbox A1 + triggers + branchement onEdit"
```

---

## Task 7: Deploiement + injection des cles + verification reelle

**Files:** (aucune modif de code; operations runtime)

- [ ] **Step 1: Deployer**

Run: `rtk proxy npx @google/clasp push --force`
Expected: `Pushed ... files.` incluant `src/36_BINANCE_SYNC.gs`.

- [ ] **Step 2: Injecter les cles Binance**

Les cles ne doivent jamais transiter par une cellule ni le depot. Utiliser le
bootstrap temporaire distant (meme methode que Bitpanda):
1. L'utilisateur place la cle API et le secret (l'agent demandera comment les
   fournir; option presse-papiers ligne1=key, ligne2=secret, ou saisie editeur).
2. Injecter une fonction temporaire distante qui appelle
   `SET_BINANCE_API_KEYS(key, secret)` puis se supprime via re-push propre.

Alternative simple si l'utilisateur accepte de le faire lui-meme: executer
`SET_BINANCE_API_KEYS("...","...")` depuis l'editeur Apps Script.

- [ ] **Step 3: Diagnostic API (verifie cles + blocage IP eventuel)**

Ecrire `=DIAG_BINANCE_API("v1")` dans une cellule scratch (ex `Recap Chain!CP202`)
via API Sheets, attendre ~10s, relire la cellule.
Expected: chaine `Binance API diag 4.15.78\nspot=...\nearn-flexible=...`.
Si `ERROR: Binance IP/geo blocked` → l'IP Apps Script est bloquee: STOP, signaler
a l'utilisateur qu'un proxy est necessaire (hors scope).

- [ ] **Step 4: Lancer la sync**

Executer `UPDATE_BINANCE_SPOT` via l'editeur (CDP) ou via la coche A1 une fois
l'onglet cree. Si l'onglet n'existe pas encore, executer d'abord
`SETUP_BINANCE_SHEET`.

- [ ] **Step 5: Verifier l'onglet via service account**

Run (lecture seule):
```bash
rtk proxy node -e "const {JWT}=require('google-auth-library');const k=require('C:/Users/strau/.config/gsheets-mcp/service-account.json');const c=new JWT({email:k.client_email,key:k.private_key,scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});(async()=>{await c.authorize();const url='https://sheets.googleapis.com/v4/spreadsheets/1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4/values/'+encodeURIComponent('Binance Spot Crypto!A1:D15');const r=await c.request({url});console.log(JSON.stringify(r.data.values||[]));})().catch(e=>{console.error(e.message);process.exit(1);});"
```
Expected: en-tete + lignes `SYMBOL | nombre | spot|earn-flexible|earn-locked | timestamp`.

- [ ] **Step 6: Installer les triggers**

Executer `INSTALL_BINANCE_SYNC_TRIGGER` via l'editeur, puis verifier dans la page
Declencheurs la presence de `UPDATE_BINANCE_SPOT` et `BINANCE_REFRESH_WATCHDOG`.

- [ ] **Step 7: Mettre a jour la doc projet**

Ajouter une section Binance dans `AGENTS.md` (pattern, cles, fonctions diag) et,
si pertinent, un `docs/binance-sync.md` court.

```bash
rtk git add AGENTS.md docs/binance-sync.md
rtk git commit -m "docs(binance): documentation connecteur Binance"
```

---

## Self-Review

- **Spec coverage:**
  - Auth HMAC + ScriptProperties → Task 1, Task 2. OK
  - Endpoints spot/earn-flexible/earn-locked → Task 3. OK
  - Onglet a creer, une ligne par (symbole+source), sources separees → Task 5
    (`_binBuildValues_` ordonne spot/earn-flexible/earn-locked). OK
  - Balances vrais nombres, format `0.########`, virgule FR → Task 5
    (`setNumberFormat("0.########")`, valeurs numeriques). OK
  - Soldes nuls exclus → Task 3 (`if (total>0)`, `if (amt>0)`). OK
  - Refresh checkbox A1 + flag + watchdog installable → Task 6. OK
  - Triggers horaire + watchdog → Task 6 (`INSTALL_BINANCE_SYNC_TRIGGER`). OK
  - Detection blocage IP → Task 2 (`_binSignedGet_` 451/403), Task 7 step 3. OK
  - Pas d'ecrasement si erreur → Task 5 (`UPDATE_BINANCE_SPOT` catch n'ecrit pas
    l'onglet, seulement le statut). OK
  - Statut tolerant ScriptProperties plein → Task 1 (`_binSetStatus_` try/catch). OK
- **Placeholder scan:** aucun TODO/TBD; tout le code est complet.
- **Type consistency:** `_binParseAmount_`, `_binPushRow_`, `_binFetchBuckets_`,
  `_binWriteSheet_`, `_binBuildValues_`, cles de buckets `"earn-flexible"`/
  `"earn-locked"` utilisees identiquement dans Task 3/4/5. Noms de fonctions
  publiques coherents (`UPDATE_BINANCE_SPOT`, `BINANCE_REFRESH_WATCHDOG`). OK
