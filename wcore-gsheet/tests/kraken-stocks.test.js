const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

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

// --- Stub fail-safe ---
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
  Logger: { log: () => { warnCount++; } },
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

// Trigger géré + requis
assert.ok(
  /"UPDATE_KRAKEN_STOCKS_FIAT"/.test(healSource),
  'UPDATE_KRAKEN_STOCKS_FIAT doit être dans les listes managed/required de auto-heal'
);
assert.ok(
  /newTrigger\("UPDATE_KRAKEN_STOCKS_FIAT"\)/.test(krakenSource),
  'INSTALL_KRAKEN_SYNC_TRIGGER doit créer UPDATE_KRAKEN_STOCKS_FIAT'
);

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

console.log('kraken rename OK');
