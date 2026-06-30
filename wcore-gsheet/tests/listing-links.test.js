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
  const written = [];
  const sheet = {
    getLastRow: () => 5,
    getRange: (row, col, numRows, numCols) => {
      assert.equal(row, 2);
      assert.equal(col, 5);
      assert.equal(numRows, 4);
      assert.equal(numCols, 1);
      return {
        getDisplayValues: () => [
          ['UniSwap - Base'],
          ['CEX - Binance'],
          ['Unknown Source'],
          [''],
        ],
        setRichTextValues: (values) => written.push(values),
      };
    },
  };
  const ss = {
    getUrl: () => 'https://docs.google.com/spreadsheets/d/test',
    getSheetByName: (name) => name === 'Portefeuille Crypto Details' ? sheet : null,
  };

  ctx._setDetailsChainHyperlinks_(ss, { 'UniSwap - Base': 123, 'CEX - Binance': 456 });

  assert.equal(written.length, 1);
  assert.deepEqual(written[0], [
    [{ text: 'UniSwap - Base', link: 'https://docs.google.com/spreadsheets/d/test#gid=123' }],
    [{ text: 'CEX - Binance', link: 'https://docs.google.com/spreadsheets/d/test#gid=456' }],
    [{ text: 'Unknown Source', link: null }],
    [{ text: '', link: null }],
  ]);
}

console.log('listing links OK');
