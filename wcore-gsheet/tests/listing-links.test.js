const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', '17_LISTING.gs'), 'utf8');

function makeContext() {
  const context = {
    console,
    Date,
    JSON,
    Math,
    String,
    Number,
    Array,
    Object,
    RegExp,
    Logger: { log: () => {} },
    SpreadsheetApp: {
      newRichTextValue: () => {
        const state = { text: '', link: null };
        const builder = {
          setText: (text) => { state.text = String(text || ''); return builder; },
          setLinkUrl: (url) => { state.link = String(url || ''); return builder; },
          build: () => ({ text: state.text, link: state.link }),
        };
        return builder;
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

{
  const ctx = makeContext();
  const written = {};
  function makeDetailsSheet(sheetName, values) {
    return {
      getLastRow: () => values.length + 1,
      getRange: (row, col, numRows, numCols) => {
        assert.equal(row, 2);
        assert.equal(col, 5);
        assert.equal(numRows, values.length);
        assert.equal(numCols, 1);
        return {
          getDisplayValues: () => values.map((value) => [value]),
          setRichTextValues: (richTexts) => { written[sheetName] = richTexts; },
        };
      },
    };
  }
  const sheets = {
    'Portefeuille Crypto Details': makeDetailsSheet('Portefeuille Crypto Details', [
      'UniSwap - Base',
      'CEX - Binance',
      'Unknown Source',
      '',
    ]),
    'Portefeuille Action Details': makeDetailsSheet('Portefeuille Action Details', [
      'CEX - Kraken Stocks',
      'Ledger - Solana Action',
    ]),
  };
  const ss = {
    getUrl: () => 'https://docs.google.com/spreadsheets/d/test',
    getSheetByName: (name) => sheets[name] || null,
  };

  ctx._setDetailsChainHyperlinks_(ss, {
    'UniSwap - Base': 123,
    'CEX - Binance': 456,
    'CEX - Kraken Stocks': 789,
    'Ledger - Solana Action': 987,
  });

  assert.deepEqual(written['Portefeuille Crypto Details'], [
    [{ text: 'UniSwap - Base', link: 'https://docs.google.com/spreadsheets/d/test#gid=123' }],
    [{ text: 'CEX - Binance', link: 'https://docs.google.com/spreadsheets/d/test#gid=456' }],
    [{ text: 'Unknown Source', link: null }],
    [{ text: '', link: null }],
  ]);
  assert.deepEqual(written['Portefeuille Action Details'], [
    [{ text: 'CEX - Kraken Stocks', link: 'https://docs.google.com/spreadsheets/d/test#gid=789' }],
    [{ text: 'Ledger - Solana Action', link: 'https://docs.google.com/spreadsheets/d/test#gid=987' }],
  ]);
}

console.log('listing links OK');
