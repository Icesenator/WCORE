const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const krakenSource = fs.readFileSync(path.join(root, 'src/41_KRAKEN_SYNC.gs'), 'utf8');
const healSource = fs.readFileSync(path.join(root, 'src/16B_AUTO_HEAL.gs'), 'utf8');
const bitpandaSource = fs.readFileSync(path.join(root, 'src/35_BITPANDA_SYNC.gs'), 'utf8');
const stockSource = fs.readFileSync(path.join(root, 'src/42_STOCK_PORTFOLIO.gs'), 'utf8');

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

// --- Contexte VM ---
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
    getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
  },
  ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyHours: () => ({ create: () => {} }) }) }) },
  Utilities: { formatDate: () => '2026-08-27 00:00:00' },
};
vm.createContext(krakenCtx);
vm.runInContext(krakenSource, krakenCtx);

// --- UPDATE_KRAKEN_STOCKS_FIAT existe et reste sûre ---
assert.equal(typeof krakenCtx.UPDATE_KRAKEN_STOCKS_FIAT, 'function', 'UPDATE_KRAKEN_STOCKS_FIAT doit exister');

// --- A1 de CEX - Kraken Stocks lance le refresh fiat + xStocks ---
let queuedStocksRefresh = null;
krakenCtx.CEX_QUEUE_OR_MARK_MANUAL_JOB = function (sheet, flag, label, updateFn) {
  queuedStocksRefresh = { sheet, flag, label, updateFn };
};
const stocksSheet = {
  getName: () => 'CEX - Kraken Stocks',
  getRange: () => ({ setValue: () => ({ setNumberFormat: () => {} }) }),
};
const stocksRange = {
  getA1Notation: () => 'A1',
  getSheet: () => stocksSheet,
  getValue: () => true,
  setValue: () => {},
};
assert.equal(
  krakenCtx.KRAKEN_ON_EDIT({ range: stocksRange, value: 'TRUE', triggerUid: 'installed-trigger' }),
  true,
  'A1 de CEX - Kraken Stocks doit être géré par KRAKEN_ON_EDIT'
);
assert.equal(queuedStocksRefresh && queuedStocksRefresh.label, 'KRAKEN_STOCKS');
assert.equal(queuedStocksRefresh && queuedStocksRefresh.updateFn, krakenCtx.UPDATE_KRAKEN_STOCKS_FIAT);

// --- Classification fiat / xStocks / crypto --- deployment test

krakenCtx._krakenPrivatePost_ = function () {
  return {
    ZEUR: '100.5',      // EUR fiat -> bucket fiat
    'NVDAx': '1.5',     // xStock -> bucket xstocks (normalisé -> NVDA)
    'SKHYx': '2',       // xStock SK Hynix -> SKHY
    'SKHY': '3',        // forme sans x -> SKHY (agrégé)
    'MUx': '0.4',       // xStock 3 lettres (Micron) -> MU, pas crypto
    PAX: '8',           // crypto se terminant par X, sans suffixe xStock
    XXBT: '0.1',        // BTC crypto
    XXRP: '25',         // XRP crypto
  };
};
const buckets = krakenCtx._krakenFetchBuckets_({});
assert.deepEqual(
  buckets.fiat.map((r) => r[0]),
  ['EUR'],
  'le fiat EUR doit être isolé'
);
assert.equal(buckets.fiat[0][1], 100.5, 'solde EUR conservé');
assert.deepEqual(
  buckets.xstocks,
  [['NVDA', 1.5], ['SKHY', 5], ['MU', 0.4]],
  'xStocks normalisés (NVDAx -> NVDA, SKHYx+SKHY -> SKHY, MUx -> MU)'
);
assert.deepEqual(
  buckets.crypto.map((r) => r[0]),
  ['PAX', 'BTC', 'XRP'],
  'les cryptos restent dans le bucket crypto, y compris PAX'
);
assert.equal(krakenCtx._krakenIsXStock_('MUx'), true, 'MUx brut est un xStock');
assert.equal(krakenCtx._krakenCanonicalStockSymbol_('MUx'), 'MU');
assert.equal(krakenCtx._krakenIsXStock_('PAX'), false, 'PAX crypto ne doit pas être un xStock');

// --- Conversion canonique xStocks ---
assert.equal(krakenCtx._krakenCanonicalStockSymbol_('SKHYx'), 'SKHY');
assert.equal(krakenCtx._krakenCanonicalStockSymbol_('SKHY'), 'SKHY');
assert.equal(krakenCtx._krakenCanonicalStockSymbol_('NVDAx'), 'NVDA');
assert.equal(krakenCtx._krakenCanonicalStockSymbol_('SOMETHING_ELSE'), 'SOMETHING_ELSE');
assert.equal(krakenCtx._krakenCanonicalStockSymbol_(''), '');

// --- Déclencheurs gérés + requis ---
assert.ok(
  /"UPDATE_KRAKEN_STOCKS_FIAT"/.test(healSource),
  'UPDATE_KRAKEN_STOCKS_FIAT doit être dans les listes managed/required de auto-heal'
);
assert.ok(
  /newTrigger\("UPDATE_KRAKEN_STOCKS_FIAT"\)/.test(krakenSource),
  'INSTALL_KRAKEN_SYNC_TRIGGER doit créer UPDATE_KRAKEN_STOCKS_FIAT'
);
assert.ok(
  /newTrigger\("UPDATE_KRAKEN_STOCKS_FIAT"\)/.test(healSource),
  '_wcoreAutoHealCreateManagedTriggers_ doit créer UPDATE_KRAKEN_STOCKS_FIAT'
);

// --- Consolidation Portefeuille Action ---
assert.ok(
  /_stockPortfolioSpotQtyFormula_\(sheetRow\)/.test(stockSource),
  'la formule Spot doit appeler le helper _stockPortfolioSpotQtyFormula_'
);
assert.ok(
  /'CEX - Kraken Stocks'!A:B/.test(stockSource),
  'le helper doit inclure un VLOOKUP vers CEX - Kraken Stocks'
);

// La ligne Euro cash doit lire le fiat EUR de CEX - Kraken Stocks
assert.ok(
  /'CEX - Kraken Stocks'/.test(stockSource) &&
    /_stockPortfolioEurSpotFormula_/.test(stockSource),
  'la formule Euro cash doit référencer CEX - Kraken Stocks'
);

console.log('kraken fiat/xstocks routing OK');
