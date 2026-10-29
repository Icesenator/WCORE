// Incident Portefeuille Crypto!B1 — "API call to sheets.spreadsheets.values.clear failed with error: Empty response".
// Cause locale : la queue source A:E est nettoyée inconditionnellement après l'écriture, et une
// réponse vide du service avancé est traitée comme un échec dur alors que les lignes sont déjà écrites.
// Ces tests pilotent _cryptoPortfolioClearSourceTail_ avec un faux service Sheets et une fausse feuille.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "src", "43_CRYPTO_PORTFOLIO.gs"), "utf8");

function load(overrides) {
  const context = { console, ...overrides };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

const FIRST = 3;
const MAX = 6012;

// Fausse feuille : seule A:E compte pour la queue ; F:T restent intacts (jamais lus ici).
function fakeSheet(tail) {
  const reads = [];
  return {
    reads,
    tail,
    getLastRow() {
      for (let r = tail.length - 1; r >= 0; r--) {
        for (const c of Array.isArray(tail[r]) ? tail[r] : [tail[r]]) {
          if (c !== "" && c !== null && c !== undefined) return 100 + r;
        }
      }
      return 0;
    },
    getRange(row, col, numRows, numCols) {
      reads.push({ row, col, numRows, numCols });
      return {
        getFormulas() {
          return Array.from({ length: numRows }, () => Array(numCols).fill(""));
        },
        getValues() {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const srcRow = tail[row - 100 + r];
            const row5 = Array.isArray(srcRow) ? srcRow : [srcRow ?? "", "", "", "", ""];
            out.push(row5.slice(0, numCols));
          }
          return out;
        },
      };
    },
  };
}

function fakeSheets(behaviour) {
  const calls = [];
  return {
    calls,
    Sheets: {
      Spreadsheets: {
        Values: {
          clear(_opts, _id, range) {
            calls.push(range);
            return behaviour(range, calls.length);
          },
        },
      },
    },
  };
}

function emptyTail() {
  return new Array(MAX - 100 + 1).fill("");
}

test('queue déjà vide : aucun appel clear inutile', () => {
  const sheet = fakeSheet(emptyTail());
  const s = fakeSheets(() => ({ clearedRange: "x" }));
  const ctx = load({ Sheets: s.Sheets });
  const outcome = ctx._cryptoPortfolioClearSourceTail_("id", 97, sheet);
  assert.equal(s.calls.length, 0, "aucun clear ne doit être émis quand la queue est vide");
  assert.equal(outcome.cleared, false);
  assert.equal(outcome.reason, "already-empty");
});

test('portefeuille raccourci : clear limité à la queue A<start>:E6012 exacte', () => {
  const tail = emptyTail();
  tail[0] = "STALE"; // ligne 100 restante
  const sheet = fakeSheet(tail);
  const s = fakeSheets(() => { tail[0] = ""; return { clearedRange: "ok" }; });
  const ctx = load({ Sheets: s.Sheets });
  const outcome = ctx._cryptoPortfolioClearSourceTail_("id", 97, sheet);
  assert.equal(s.calls.length, 1);
  assert.match(s.calls[0], /'Portefeuille Crypto'!A100:E100$/, "seule la dernière ligne réellement occupée est effacée");
  assert.equal(outcome.cleared, true);
});

test('réponse vide alors que le clear a été appliqué : succès vérifié, pas erreur', () => {
  const tail = emptyTail();
  tail[0] = "STALE";
  const sheet = fakeSheet(tail);
  let read = 0;
  const s = fakeSheets(() => { throw new Error("API call to sheets.spreadsheets.values.clear failed with error: Empty response"); });
  const ctx = load({ Sheets: s.Sheets });
  // 1re lecture (avant clear) : données présentes ; 2e lecture (après) : vide.
  const original = sheet.getRange;
  sheet.getRange = function (...args) {
    const res = original.apply(this, args);
    const wrapped = { getValues: () => (read++ === 0 ? res.getValues() : new Array(res.getValues().length).fill(["", "", "", "", ""])), getFormulas: () => res.getFormulas() };
    return wrapped;
  };
  const outcome = ctx._cryptoPortfolioClearSourceTail_("id", 97, sheet);
  assert.equal(outcome.cleared, true, "la réponse vide ne doit pas produire une erreur non vérifiée");
  assert.equal(outcome.reason, "cleared-empty-response");
});

test('échec avec zone encore renseignée : fail-closed, aucune réussite déclarée', () => {
  const tail = emptyTail();
  tail[0] = "STALE";
  const sheet = fakeSheet(tail); // reste renseignée après l'échec
  const s = fakeSheets(() => { throw new Error("Empty response"); });
  const ctx = load({ Sheets: s.Sheets });
  assert.throws(() => ctx._cryptoPortfolioClearSourceTail_("id", 97, sheet), /Empty response/);
});

test('réponse apparemment réussie mais queue intacte : refus, un seul clear', () => {
  const tail = emptyTail(); tail[0] = 'STALE';
  const s = fakeSheets(() => ({ clearedRange: 'ok' }));
  const ctx = load({ Sheets: s.Sheets });
  assert.throws(() => ctx._cryptoPortfolioClearSourceTail_('id', 97, fakeSheet(tail)), /still populated/);
  assert.equal(s.calls.length, 1);
});

test('formule A:E renvoyant chaîne vide est du contenu, pas une cellule vide', () => {
  let applied = false; const calls = [];
  const sheet = { getRange: (_r, _c, count, width) => ({
    getValues: () => Array.from({length:count}, () => Array(width).fill('')),
    getFormulas: () => Array.from({length:count}, (_, i) => Array.from({length:width}, (_, c) => !applied && i === 0 && c === 2 ? '=IF(1;"";"")' : '')),
  }) };
  const ctx = load({ Sheets: fakeSheets(range => { calls.push(range); applied = true; return {}; }).Sheets });
  const result = ctx._cryptoPortfolioClearSourceTail_('id', 97, sheet);
  assert.equal(result.cleared, true);
  assert.deepEqual(calls, ["'Portefeuille Crypto'!A100:E100"]);
});

test('absence de feuille de vérification : aucun clear ne doit être envoyé', () => {
  const s = fakeSheets(() => ({})); const ctx = load({Sheets:s.Sheets});
  assert.throws(() => ctx._cryptoPortfolioClearSourceTail_('id',97,null), /verification unavailable/);
  assert.equal(s.calls.length,0);
});

test('sans feuille pour vérifier, un échec reste un échec (pas de succès non prouvé)', () => {
  const s = fakeSheets(() => { throw new Error("Empty response"); });
  const ctx = load({ Sheets: s.Sheets });
  assert.throws(() => ctx._cryptoPortfolioClearSourceTail_("id", 97, null), /verification unavailable/);
  assert.equal(s.calls.length, 0);
});

test('queue au-delà de la limite fixe : aucun appel du tout', () => {
  const sheet = fakeSheet([]);
  const s = fakeSheets(() => ({ clearedRange: "ok" }));
  const ctx = load({ Sheets: s.Sheets });
  const outcome = ctx._cryptoPortfolioClearSourceTail_("id", MAX, sheet);
  assert.equal(s.calls.length, 0);
  assert.equal(outcome.reason, "no-tail");
});

test('le clear reste scopé à A:E depuis la première ligne de données, jamais F:T', () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "43_CRYPTO_PORTFOLIO.gs"), "utf8");
  const fn = src.match(/function _cryptoPortfolioClearSourceTail_[\s\S]*?\n\}/)[0];
  assert.match(fn, /FIRST_DATA_ROW \+ Number\(sourceRowCount \|\| 0\)/);
  assert.match(fn, /"A" \+ clearStart \+ ":E" \+ clearEnd/, 'borne haute en E uniquement');
  assert.match(fn, /Math\.min\(lastDataRow, maxRow\)/, 'borne à la dernière ligne réellement occupée');
  assert.ok(!/clearDataValidations|sh\.clear\(|\.clear\(\)/.test(fn), "aucun clear non scopé");
});
