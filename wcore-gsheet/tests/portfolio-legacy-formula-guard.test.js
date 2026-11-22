// Garde du 22/11/2026 : SETUP_* et REPAIR_*_FORMULAS des portefeuilles Crypto et Action refusent d'agir
// dans tous les cas (le generateur ne reproduit plus les formules de la feuille). Le rafraichissement
// horaire (UPDATE_*) n'est pas concerne.
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
  // Toujours refuse, avant toute lecture ou ecriture : onglet en service, onglet vide, onglet absent.
  for (const state of [{ lastRow: 120 }, { lastRow: 1 }, null]) {
    for (const fn of [setup, repair]) {
      const { ctx, writes } = load(file, state);
      const out = ctx[fn]();
      assert.match(String(out), /^REFUSED: /, `${file} ${fn} refuse (${JSON.stringify(state)})`);
      assert.deepEqual(writes, [], `${file} ${fn} n'ecrit rien (${JSON.stringify(state)})`);
    }
  }
}

console.log('portfolio-legacy-formula-guard: OK');
