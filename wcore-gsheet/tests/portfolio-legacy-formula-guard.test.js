// Garde du 22/11/2026 : SETUP_* et REPAIR_*_FORMULAS des portefeuilles Crypto et Action refusent d'agir
// des que l'onglet contient des lignes (le generateur ne reproduit plus les formules de la feuille).
// Un onglet vide ou absent reste installable ; le rafraichissement horaire n'est pas concerne.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(file, sheetState) {
  const writes = [];
  const sheet = sheetState && {
    getLastRow: () => sheetState.lastRow,
    getRange: () => ({ setValues: (v) => writes.push(['setValues', v.length]), setValue: (v) => writes.push(['setValue', v]), getValue: () => '' }),
  };
  const ss = {
    getSheetByName: () => sheet || null,
    insertSheet: () => { writes.push(['insertSheet']); return sheet; },
  };
  const ctx = {
    Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    BITPANDA_SYNC_CONFIG: { SPREADSHEET_ID: 'test' },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), ctx);
  return { ctx, writes };
}

for (const [file, setup, repair] of [
  ['43_CRYPTO_PORTFOLIO.gs', 'SETUP_CRYPTO_PORTFOLIO_V2', 'REPAIR_CRYPTO_PORTFOLIO_V2_FORMULAS'],
  ['42_STOCK_PORTFOLIO.gs', 'SETUP_STOCK_PORTFOLIO', 'REPAIR_STOCK_PORTFOLIO_FORMULAS'],
]) {
  // Onglet en service (lignes presentes) : refus, aucune ecriture.
  for (const fn of [setup, repair]) {
    const { ctx, writes } = load(file, { lastRow: 120 });
    const out = ctx[fn]();
    assert.match(String(out), /^REFUSED: /, `${file} ${fn} refuse sur un onglet en service`);
    assert.deepEqual(writes, [], `${file} ${fn} n'ecrit rien`);
  }
  // Onglet sans ligne de donnees : la reparation ne trouve rien a faire, sans refus.
  const empty = load(file, { lastRow: 1 });
  assert.equal(String(empty.ctx[repair]()), 'OK: no source rows', `${file} ${repair} sur un onglet vide`);
  assert.equal(empty.ctx[`${file.startsWith('43') ? '_cryptoPortfolio' : '_stockPortfolio'}LegacyFormulaGuard_`](null), null, 'onglet absent : pas de refus');
}

console.log('portfolio-legacy-formula-guard: OK');
