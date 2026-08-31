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
  UrlFetchApp: {
    fetch: (url) => ({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({
        error: ['EQuery:Unknown asset pair'],
        result: {
          'XOMx/USD': { c: ['159.24', '1'] },
          'BRK.Bx/USD': { c: ['500.00', '1'] },
        },
      }),
    }),
  },
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
    XXBT: '0.1',        // BTC crypto
    XXRP: '25',         // XRP crypto
    ZEUR: '100.5',      // EUR fiat
    'NVDAx.T': '1.5',   // clé brute Balance API xStock -> NVDA
    'SKHYx.T': '2',     // xStock SK Hynix -> SKHY
    'SKHY': '3',        // forme sans suffixe -> SKHY (agrégé)
    'MUx.T': '0.4',     // xStock 3 lettres (Micron) -> MU, pas crypto
    'NVDAx': '0.1',     // variante sans suffixe .T -> NVDA (agrégé)
    'XOMx.T': '0.2',
    'BRK.Bx.T': '0.3',
    PAX: '8',           // crypto se terminant par X majuscule, pas un xStock
    'ZEUR.HOLD': '0',   // clé fiat à montant nul, ignorée
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
  [['NVDAx', 1.6], ['SKHYx', 5], ['MUx', 0.4], ['XOMx', 0.2], ['BRK.Bx', 0.3]],
  'les xStocks conservent le ticker Kraken affiché et le x final minuscule'
);
assert.deepEqual(
  buckets.crypto.map((r) => r[0]),
  ['BTC', 'XRP', 'PAX'],
  'les cryptos restent dans le bucket crypto, y compris PAX'
);
assert.equal(krakenCtx._krakenIsXStock_('MUx.T'), true, 'MUx.T (clé brute Balance API) est un xStock');
assert.equal(krakenCtx._krakenCanonicalStockSymbol_('MUx.T'), 'MU');
assert.equal(krakenCtx._krakenIsXStock_('PAX'), false, 'PAX crypto ne doit pas être un xStock');
assert.equal(krakenCtx._krakenIsXStock_('AAPLx.T'), true, 'AAPLx.T (clé brute) est un xStock');

// --- Ticker affiché et conversion canonique xStocks ---
assert.equal(krakenCtx._krakenDisplayStockSymbol_('SKHYx.T'), 'SKHYx');
assert.equal(krakenCtx._krakenDisplayStockSymbol_('XOMx.T'), 'XOMx');
assert.equal(krakenCtx._krakenDisplayStockSymbol_('BRK.Bx.T'), 'BRK.Bx');
assert.equal(krakenCtx._krakenCanonicalStockSymbol_('SKHYx.T'), 'SKHY');
assert.equal(krakenCtx._krakenCanonicalStockSymbol_('SKHY'), 'SKHY');
assert.equal(krakenCtx._krakenCanonicalStockSymbol_('NVDAx'), 'NVDA');
assert.equal(krakenCtx._krakenCanonicalStockSymbol_('XOMx.T'), 'XOM');
assert.equal(krakenCtx._krakenCanonicalStockSymbol_('BRK.Bx.T'), 'BRKB');
assert.equal(krakenCtx._krakenCanonicalStockSymbol_('SOMETHING_ELSE'), 'SOMETHING_ELSE');
assert.equal(krakenCtx._krakenCanonicalStockSymbol_(''), '');
const krakenPrices = krakenCtx._krakenFetchXStockPricesUsd_([['XOMx', 0.180866], ['BRK.Bx', 0.1]]);
assert.equal(krakenPrices.XOMX, 159.24);
assert.equal(krakenPrices['BRK.BX'], 500);
const pricedRows = krakenCtx._krakenBuildValues_([['XOMx', 0.180866]], '2026-08-31', krakenPrices);
assert.equal(pricedRows[0][5], 159.24);
assert.ok(Math.abs(pricedRows[0][4] - 0.180866 * 159.24) < 1e-9);

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
