# Onglet `CEX - Kraken Stocks` + renommage `CEX - Kraken Crypto` — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renommer l'onglet `CEX - Kraken` en `CEX - Kraken Crypto`, créer l'onglet `CEX - Kraken Stocks` (structure Bitpanda) avec un stub de sync fail-safe, et intégrer les positions Kraken Stocks dans le portefeuille actions.

**Architecture:** Le sync Kraken crypto reste inchangé (uniquement la constante de feuille change). Un nouvel onglet `CEX - Kraken Stocks` est créé en miroir de `CEX - Bitpanda Stocks`, alimenté par un stub `UPDATE_KRAKEN_STOCKS_FIAT()` read-only (API Securities non disponible à ce jour). La consolidation `Portefeuille Action` étend sa formule de quantité pour lire d'abord Bitpanda puis Kraken Stocks. Les alias canoniques sont réutilisés via un nouveau mapping API.

**Tech Stack:** Apps Script (.gs), Node.js (tests GSheet via `vm`), TypeScript (API `wcore-web`), node:test.

**Correction spec (2026-08-27):** le point d'intégration `Portefeuille Action` est la formule de quantité `42_STOCK_PORTFOLIO.gs:592` (pas la ligne 616 qui est la formule du cash EUR). Voir Task 4.

---

### Task 0: Préparation — worktree + baseline

**Files:**
- Test: `wcore-gsheet/tests/kraken-stocks.test.js`

- [ ] **Step 1: Vérifier la baseline**

Run: `node --test "K:\ProjetIA\WCORE\wcore-gsheet\tests\kraken-stocks.test.js"` (fichier absent → échec, attendu).

- [ ] **Step 2: Créer le worktree (optionnel si déjà sur main)**

```bash
git worktree add -b feature/kraken-stocks K:\ProjetIA\WCORE\.worktrees\kraken-stocks
```

- [ ] **Step 3: Vérifier que les tests existants passent avant toute modif**

Run: `npm test` depuis `K:\ProjetIA\WCORE\wcore-gsheet`
Expected: validate:static OK + suite complète verte.

---

### Task 1: Renommage `CEX - Kraken` → `CEX - Kraken Crypto` (constante + commentaires)

**Files:**
- Modify: `wcore-gsheet/src/41_KRAKEN_SYNC.gs:3,13`
- Modify: `wcore-gsheet/src/16B_AUTO_HEAL.gs:213`
- Modify: `wcore-gsheet/src/35_BITPANDA_SYNC.gs:1839`
- Test: `wcore-gsheet/tests/kraken-stocks.test.js` (créé ici)

- [ ] **Step 1: Écrire le test statique (fichier de test complet)**

Créer `wcore-gsheet/tests/kraken-stocks.test.js` :

```javascript
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const krakenSource = fs.readFileSync(path.join(root, 'src/41_KRAKEN_SYNC.gs'), 'utf8');
const healSource = fs.readFileSync(path.join(root, 'src/16B_AUTO_HEAL.gs'), 'utf8');
const bitpandaSource = fs.readFileSync(path.join(root, 'src/35_BITPANDA_SYNC.gs'), 'utf8');

// Renommage: plus aucune référence à l'ancien nom "CEX - Kraken" seul
assert.ok(
  /SHEET:\s*"CEX - Kraken Crypto"/.test(krakenSource),
  'KRAKEN_SYNC_CONFIG.SHEET doit pointer vers "CEX - Kraken Crypto"'
);
assert.ok(
  !/SHEET:\s*"CEX - Kraken"([^C]|$)/.test(krakenSource),
  'plus de SHEET pointant vers "CEX - Kraken" seul'
);

// Onglet frère stocks déclaré
assert.ok(
  /SHEET_STOCKS:\s*"CEX - Kraken Stocks"/.test(krakenSource),
  'KRAKEN_SYNC_CONFIG.SHEET_STOCKS doit exister'
);

// Auto-heal surveille le nouveau nom Crypto et le Stocks
assert.ok(
  /"CEX - Kraken Crypto"/.test(healSource),
  '16B_AUTO_HEAL doit surveiller "CEX - Kraken Crypto"'
);

// REPAIR_CEX_SHEETS_STRUCTURE référence le nouveau nom
assert.ok(
  /"CEX - Kraken Crypto"/.test(bitpandaSource),
  'REPAIR_CEX_SHEETS_STRUCTURE doit lister "CEX - Kraken Crypto"'
);

console.log('kraken rename OK');
```

- [ ] **Step 2: Lancer le test → échec attendu**

Run: `node --test "K:\ProjetIA\WCORE\wcore-gsheet\tests\kraken-stocks.test.js"`
Expected: FAIL (l'ancien nom est encore présent, pas de SHEET_STOCKS).

- [ ] **Step 3: Modifier `41_KRAKEN_SYNC.gs:3` (commentaire)**

```
// Onglet de sortie: "CEX - Kraken Crypto" (crypto) et "CEX - Kraken Stocks" (actions).
```

- [ ] **Step 4: Modifier `41_KRAKEN_SYNC.gs:13` (constante)**

```javascript
  SHEET: "CEX - Kraken Crypto",
  SHEET_STOCKS: "CEX - Kraken Stocks",
```

- [ ] **Step 5: Modifier `16B_AUTO_HEAL.gs:213`**

```
    "CEX - Kraken Crypto"
```

- [ ] **Step 6: Modifier `35_BITPANDA_SYNC.gs:1839`**

```
    "CEX - Kraken Crypto",
```

- [ ] **Step 7: Lancer le test → succès attendu**

Run: `node --test "K:\ProjetIA\WCORE\wcore-gsheet\tests\kraken-stocks.test.js"`
Expected: PASS ("kraken rename OK").

- [ ] **Step 8: Commit**

```bash
git add wcore-gsheet/src/41_KRAKEN_SYNC.gs wcore-gsheet/src/16B_AUTO_HEAL.gs wcore-gsheet/src/35_BITPANDA_SYNC.gs wcore-gsheet/tests/kraken-stocks.test.js
git commit -m "refactor(gsheet): rename CEX - Kraken to CEX - Kraken Crypto and declare stocks tab"
```

---

### Task 2: Stub de sync `UPDATE_KRAKEN_STOCKS_FIAT()` (fail-safe, read-only)

**Files:**
- Modify: `wcore-gsheet/src/41_KRAKEN_SYNC.gs` (append avant la fin du fichier, après `INSTALL_KRAKEN_SYNC_TRIGGER`)
- Test: `wcore-gsheet/tests/kraken-stocks.test.js` (extension)

- [ ] **Step 1: Étendre le test avec le test du stub**

Ajouter à `wcore-gsheet/tests/kraken-stocks.test.js` (avant `console.log('kraken rename OK')`) :

```javascript
// --- Stub fail-safe ---
const vm = require('vm');
let warnCount = 0;
const krakenCtx = {
  console,
  JSON,
  Math,
  Date,
  String,
  Number,
  Array,
  Object,
  isFinite,
  Logger: { log: () => {} },
  HttpCallCounter: { setTrigger: () => {} },
  PropertiesService: {
    getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
    getUserProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
  },
  ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyHours: () => ({ create: () => {} }) }) }) },
  Utilities: { formatDate: () => '2026-08-27 00:00:00' },
};
vm.createContext(krakenCtx);
vm.runInContext(krakenSource, krakenCtx);

assert.equal(typeof krakenCtx.UPDATE_KRAKEN_STOCKS_FIAT, 'function', 'UPDATE_KRAKEN_STOCKS_FIAT doit exister');
const result = krakenCtx.UPDATE_KRAKEN_STOCKS_FIAT();
assert.match(String(result), /SKIP|UNAVAILABLE|STUB|DISABLED/i, 'stub doit indiquer une indisponibilité');
assert.doesNotThrow(() => krakenCtx.UPDATE_KRAKEN_STOCKS_FIAT(), 'stub ne doit jamais lever');
```

- [ ] **Step 2: Lancer le test → échec attendu (fonction absente)**

Run: `node --test "K:\ProjetIA\WCORE\wcore-gsheet\tests\kraken-stocks.test.js"`
Expected: FAIL (`UPDATE_KRAKEN_STOCKS_FIAT` non définie).

- [ ] **Step 3: Implémenter le stub à la fin de `41_KRAKEN_SYNC.gs`**

```javascript
// Stub fail-safe: Kraken Securities (actions) n'expose pas d'API publique stable
// à ce jour. Cette fonction est conçue avec la même signature que
// UPDATE_BITPANDA_STOCKS_FIAT() afin d'accueillir un vrai fetch plus tard.
// Elle ne lit ni n'écrit aucune cellule tant que la source n'est pas branchée.
var KRAKEN_STOCKS_WARN_PROP = "KRAKEN_STOCKS_API_UNAVAILABLE_WARNED";

function UPDATE_KRAKEN_STOCKS_FIAT() {
  try { HttpCallCounter.setTrigger('UPDATE_KRAKEN_STOCKS_FIAT'); } catch (eCounter) {}
  var warned = false;
  try {
    warned = String(PropertiesService.getScriptProperties().getProperty(KRAKEN_STOCKS_WARN_PROP) || "") === "1";
  } catch (eProp) {}
  if (!warned) {
    Logger.log("WARN: Kraken Stocks API unavailable - skip (read-only stub)");
    try {
      PropertiesService.getScriptProperties().setProperty(KRAKEN_STOCKS_WARN_PROP, "1");
    } catch (eSet) {}
  }
  return "SKIP: Kraken Securities API unavailable - onglet 'CEX - Kraken Stocks' en attente de source (stub read-only)";
}
```

- [ ] **Step 4: Lancer le test → succès attendu**

Run: `node --test "K:\ProjetIA\WCORE\wcore-gsheet\tests\kraken-stocks.test.js"`
Expected: PASS (rename + stub).

- [ ] **Step 5: Commit**

```bash
git add wcore-gsheet/src/41_KRAKEN_SYNC.gs wcore-gsheet/tests/kraken-stocks.test.js
git commit -m "feat(gsheet): add fail-safe UPDATE_KRAKEN_STOCKS_FIAT stub"
```

---

### Task 3: Trigger `UPDATE_KRAKEN_STOCKS_FIAT` dans auto-heal + installer

**Files:**
- Modify: `wcore-gsheet/src/16B_AUTO_HEAL.gs:243,244`
- Modify: `wcore-gsheet/src/41_KRAKEN_SYNC.gs:291-299` (INSTALL_KRAKEN_SYNC_TRIGGER)
- Test: `wcore-gsheet/tests/kraken-stocks.test.js` (extension)

- [ ] **Step 1: Étendre le test**

Ajouter à `wcore-gsheet/tests/kraken-stocks.test.js` :

```javascript
// Trigger géré + requis
assert.ok(
  /"UPDATE_KRAKEN_STOCKS_FIAT"/.test(healSource),
  'UPDATE_KRAKEN_STOCKS_FIAT doit être dans les listes managed/required de auto-heal'
);
assert.ok(
  /newTrigger\("UPDATE_KRAKEN_STOCKS_FIAT"\)/.test(krakenSource),
  'INSTALL_KRAKEN_SYNC_TRIGGER doit créer UPDATE_KRAKEN_STOCKS_FIAT'
);
```

- [ ] **Step 2: Lancer → échec attendu**

Run: `node --test "K:\ProjetIA\WCORE\wcore-gsheet\tests\kraken-stocks.test.js"`
Expected: FAIL (trigger absent).

- [ ] **Step 3: Ajouter `UPDATE_KRAKEN_STOCKS_FIAT` aux listes managed et required dans `16B_AUTO_HEAL.gs:243` et `:244`**

Ligne 243 (managed) : insérer `"UPDATE_KRAKEN_STOCKS_FIAT",` juste après `"UPDATE_BITPANDA_STOCKS_FIAT",`.
Ligne 244 (required) : insérer `"UPDATE_KRAKEN_STOCKS_FIAT",` juste après `"UPDATE_BITPANDA_STOCKS_FIAT",`.

- [ ] **Step 4: Mettre à jour `INSTALL_KRAKEN_SYNC_TRIGGER` (41_KRAKEN_SYNC.gs:291-299)**

```javascript
function INSTALL_KRAKEN_SYNC_TRIGGER() {
  var trs = ScriptApp.getProjectTriggers();
  for (var i = 0; i < trs.length; i++) {
    var fn = trs[i].getHandlerFunction();
    if (fn === "UPDATE_KRAKEN_SPOT" || fn === "UPDATE_KRAKEN_STOCKS_FIAT" || fn === "KRAKEN_REFRESH_WATCHDOG") ScriptApp.deleteTrigger(trs[i]);
  }
  ScriptApp.newTrigger("UPDATE_KRAKEN_SPOT").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("UPDATE_KRAKEN_STOCKS_FIAT").timeBased().everyHours(1).create();
  return "Triggers installed: UPDATE_KRAKEN_SPOT (1h) + UPDATE_KRAKEN_STOCKS_FIAT (1h)";
}
```

- [ ] **Step 5: Lancer → succès attendu**

Run: `node --test "K:\ProjetIA\WCORE\wcore-gsheet\tests\kraken-stocks.test.js"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add wcore-gsheet/src/16B_AUTO_HEAL.gs wcore-gsheet/src/41_KRAKEN_SYNC.gs wcore-gsheet/tests/kraken-stocks.test.js
git commit -m "feat(gsheet): manage UPDATE_KRAKEN_STOCKS_FIAT trigger in auto-heal"
```

---

### Task 4: Consolidation `Portefeuille Action` — ajout de la source Kraken Stocks

**Files:**
- Modify: `wcore-gsheet/src/42_STOCK_PORTFOLIO.gs:585-592` (extraire la formule en helper + fallback Kraken)
- Test: `wcore-gsheet/tests/kraken-stocks.test.js` (extension)

**Contexte:** la ligne 592 construit la formule de quantité Spot. On extrait le littéral dans un helper `_stockPortfolioSpotQtyFormula_(sheetRow)` et on ajoute un fallback `CEX - Kraken Stocks` après Bitpanda (mêmes alias canoniques).

- [ ] **Step 1: Étendre le test (assertions statiques sur le helper)**

Ajouter à `wcore-gsheet/tests/kraken-stocks.test.js` :

```javascript
// Consolidation Portefeuille Action
const stockSource = fs.readFileSync(path.join(root, 'src/42_STOCK_PORTFOLIO.gs'), 'utf8');
assert.ok(
  /_stockPortfolioSpotQtyFormula_\(sheetRow\)/.test(stockSource),
  'la formule Spot doit appeler le helper _stockPortfolioSpotQtyFormula_'
);
assert.ok(
  /'CEX - Kraken Stocks'!A:B/.test(stockSource),
  'le helper doit inclure un VLOOKUP vers CEX - Kraken Stocks'
);
```

- [ ] **Step 2: Lancer → échec attendu**

Run: `node --test "K:\ProjetIA\WCORE\wcore-gsheet\tests\kraken-stocks.test.js"`
Expected: FAIL.

- [ ] **Step 3: Extraire le helper et remplacer la ligne 592 dans `42_STOCK_PORTFOLIO.gs`**

Ajouter juste avant `_stockPortfolioApplyFormulasToRow_` (ligne 585) :

```javascript
// Quantité Spot pour une ligne action: cherche d'abord dans CEX - Bitpanda Stocks
// (avec alias canoniques), puis fallback sur CEX - Kraken Stocks (mêmes alias).
function _stockPortfolioSpotQtyFormula_(sheetRow) {
  var a = "A" + sheetRow;
  var c = "C" + sheetRow;
  var bp = "'CEX - Bitpanda Stocks'!A:B";
  var kr = "'CEX - Kraken Stocks'!A:B";
  var aliasSwitch = "\"GOOG\";\"GOOGL\";\"META\";\"FB\";\"NYSE:BRK.B\";\"BRKB\";\"KRX:005930\";\"SSU\";\"KRX:000660\";\"HYXS\";\"EPA:MC\";\"MC\";\"EPA:OR\";\"OR\";\"NVO\";\"NOVO\";\"CPH:NOVO-B\";\"NOVO\";\"SWX:NESN\";\"NESN\";\"SWX:RO\";\"ROG\";\"TYO:7203\";\"TM\";\"\"";
  return "=(IFERROR(VLOOKUP(" + a + ";" + bp + ";2;FALSE);" +
    "IFERROR(VLOOKUP(REGEXREPLACE(" + a + ";\"^.*:\";\"\");" + bp + ";2;FALSE);" +
    "IFERROR(VLOOKUP(SWITCH(" + a + ";" + aliasSwitch + ");" + bp + ";2;FALSE);" +
    "IFERROR(VLOOKUP(SWITCH(" + a + ";\"KRX:005930\";\"SMSN\";\"005930\";\"SMSN\";\"\");" + bp + ";2;FALSE);" +
    "IFERROR(VLOOKUP(" + a + ";" + kr + ";2;FALSE);" +
    "IFERROR(VLOOKUP(REGEXREPLACE(" + a + ";\"^.*:\";\"\");" + kr + ";2;FALSE);" +
    "IFERROR(VLOOKUP(SWITCH(" + a + ";" + aliasSwitch + ");" + kr + ";2;FALSE);0))))))))*" + c;
}
```

Remplacer le contenu de `row[6]` ligne 592 par :

```javascript
  row[6] = isCashRow
    ? _stockPortfolioEurSpotFormula_(sheetRow)
    : _stockPortfolioSpotQtyFormula_(sheetRow);
```

- [ ] **Step 4: Lancer → succès attendu**

Run: `node --test "K:\ProjetIA\WCORE\wcore-gsheet\tests\kraken-stocks.test.js"`
Expected: PASS.

- [ ] **Step 5: Vérifier la non-régression du layout du portefeuille**

Run: `node --test "K:\ProjetIA\WCORE\wcore-gsheet\tests\stock-portfolio-sheet-layout.test.js"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add wcore-gsheet/src/42_STOCK_PORTFOLIO.gs wcore-gsheet/tests/kraken-stocks.test.js
git commit -m "feat(gsheet): consolidate Kraken Stocks as fallback in stock portfolio quantity"
```

---

### Task 5: Aliases API — `KRAKEN_STOCKS_ALIASES` (wcore-web)

**Files:**
- Modify: `wcore-web/apps/api/src/stocks/mappings.ts` (append)
- Test: `wcore-web/apps/api/src/stocks/kraken-stocks-alias.test.ts` (create)

**Contexte:** un xStock Kraken (ex. `JPMx`) doit être normalisé vers le symbole canonique du pipeline existant (ex. `JPM`). On réutilise `BITPANDA_SECURITIES` sans dupliquer les sous-jacents.

- [ ] **Step 1: Écrire le test**

Créer `wcore-web/apps/api/src/stocks/kraken-stocks-alias.test.ts` :

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { krakenStockCanonicalSymbol } from "./mappings.js";

test("maps Kraken xStock symbols to canonical underlying tickers", () => {
  assert.equal(krakenStockCanonicalSymbol("JPMx"), "JPM");
  assert.equal(krakenStockCanonicalSymbol("AAPLx"), "AAPL");
  assert.equal(krakenStockCanonicalSymbol("NVDAx"), "NVDA");
  assert.equal(krakenStockCanonicalSymbol("GOOGLx"), "GOOG");
  assert.equal(krakenStockCanonicalSymbol("KRX:005930"), "KRX:005930");
});

test("keeps unknown or already-canonical symbols unchanged", () => {
  assert.equal(krakenStockCanonicalSymbol("SOMETHING_ELSE"), "SOMETHING_ELSE");
  assert.equal(krakenStockCanonicalSymbol("JPM"), "JPM");
  assert.equal(krakenStockCanonicalSymbol(""), "");
  assert.equal(krakenStockCanonicalSymbol(""), "");
});
```

- [ ] **Step 2: Lancer → échec attendu (import inconnu)**

Run: `pnpm --dir wcore-web exec tsx --test apps/api/src/stocks/kraken-stocks-alias.test.ts`
Expected: FAIL (module `mappings.js` n'exporte pas `krakenStockCanonicalSymbol`).

- [ ] **Step 3: Implémenter dans `mappings.ts` (append en fin de fichier)**

```typescript
/**
 * Normalise un symbole xStock Kraken (ex. "JPMx") vers le symbole canonique du
 * pipeline WCORE (ex. "JPM"). Réutilise BITPANDA_SECURITIES pour les
 * sous-jacents identiques ; tout ce qui est inconnu ou déjà canonique passe tel quel.
 */
export function krakenStockCanonicalSymbol(symbol: string): string {
  const raw = String(symbol ?? "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  // Résolution inverse: trouver le mapping dont un yahooTickers/alias correspond.
  for (const mapping of Object.values(BITPANDA_SECURITIES)) {
    const candidates = [...(mapping.yahooTickers ?? []), ...(mapping.bitpandaAliases ?? [])];
    for (const c of candidates) {
      if (upper === c || upper === `${c}x` || upper === `${c}-US`) {
        return mapping.canonicalTicker;
      }
    }
  }
  return raw;
}
```

- [ ] **Step 4: Lancer → succès attendu**

Run: `pnpm --dir wcore-web exec tsx --test apps/api/src/stocks/kraken-stocks-alias.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck API**

Run: `pnpm --dir wcore-web exec tsc -p apps/api --noEmit`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add wcore-web/apps/api/src/stocks/mappings.ts wcore-web/apps/api/src/stocks/kraken-stocks-alias.test.ts
git commit -m "feat(api): add krakenStockCanonicalSymbol alias resolver"
```

---

### Task 6: Suite complète + validation statique + typecheck

**Files:** aucun (vérification).

- [ ] **Step 1: Suite GSheet complète**

Run: `npm test` depuis `K:\ProjetIA\WCORE\wcore-gsheet`
Expected: validate:static OK + 100 % tests GSheet PASS (y compris `kraken-stocks.test.js`).

- [ ] **Step 2: Typecheck API**

Run: `pnpm --dir wcore-web exec tsc -p apps/api --noEmit`
Expected: OK.

- [ ] **Step 3: Commit final**

```bash
git add -A
git commit -m "chore: kraken stocks tab baseline verified"
```

---

### Task 7: Journal + mémoire (post-implantation)

**Files:** (Obsidian vault, hors repo)

- [ ] **Step 1: Journaliser dans Obsidian**

Append à `journal/2026-08-27.md` : renommage `CEX - Kraken` → `CEX - Kraken Crypto`, onglet `CEX - Kraken Stocks` créé (stub read-only, API Securities indisponible), fallback consolidation Portefeuille Action, alias `krakenStockCanonicalSymbol`.

- [ ] **Step 2: Mémoriser Mem0**

`mem0_add` (source `journal/2026-08-27.md`, kind `decision`) : décision de créer l'onglet `CEX - Kraken Stocks` en stub fail-safe avec renommage Crypto, en attendant une API Kraken Securities stable.

---

## Self-Review (auto-vérification du plan)

- **Couverture spec:** renommage (T1) ✔, onglet Stocks (T1 constante + T2 stub) ✔, alias API (T5) ✔, stub sync (T2) ✔, trigger (T3) ✔, consolidation (T4) ✔, tests (toutes tasks) ✔, validate:static (T6) ✔, doc journal (T7) ✔.
- **Correction intégrée:** point d'intégration = ligne 592 (formule quantité), pas 616 (cash EUR) — documenté en tête de plan et dans Task 4.
- **Placeholders:** aucun "TBD/TODO" ; tout le code est fourni inline.
- **Cohérence types:** `_stockPortfolioSpotQtyFormula_` défini en T4 et utilisé à la ligne 592 ; `krakenStockCanonicalSymbol` défini en T5 et testé ; `UPDATE_KRAKEN_STOCKS_FIAT` cohérent entre T2 et T3.
