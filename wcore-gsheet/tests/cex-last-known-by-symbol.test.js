// v4.16.95 - The last-known fallback of a CEX tab belongs to the asset, not to the row.
//
// _cexComputeAndAppendTotal_ rewrites a tab sorted by value. When the pricing of one asset
// fails it falls back on the last known figure of that asset. That figure used to be read by
// position (row i of the old tab for asset i of the new answer), so the asset received the
// value of whatever happened to sit on that row, and the total was wrong (audit of 2026-11-11).
// It is now read by symbol, turned back into a unit price and applied to the current balance.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', '35_BITPANDA_SYNC.gs'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing function ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

const BODY = extractFunction(SOURCE, '_cexComputeAndAppendTotal_');

/** A sheet backed by a plain grid: enough of the Sheets API for the function under test. */
function makeSheet(rows) {
  const grid = rows.map((row) => row.slice());
  const cell = (r, c) => (grid[r - 1] && grid[r - 1][c - 1] !== undefined ? grid[r - 1][c - 1] : '');
  const range = (r, c, nr, nc) => ({
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(r + i, c + j))),
    clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) { if (grid[r - 1 + i]) grid[r - 1 + i][c - 1 + j] = ''; } return this; },
    setValues(values) { values.forEach((row, i) => { grid[r - 1 + i] = grid[r - 1 + i] || []; row.forEach((v, j) => { grid[r - 1 + i][c - 1 + j] = v; }); }); return this; },
    setNumberFormat() { return this; },
    insertCheckboxes() { return this; },
    setValue() { return this; },
  });
  return {
    grid,
    getMaxColumns: () => 7,
    getMaxRows: () => 100,
    getLastRow: () => grid.length,
    insertColumnsAfter() {},
    getRange: (a, b, c, d) => (typeof a === 'string' ? range(1, 1, 1, 1) : range(a, b, c === undefined ? 1 : c, d === undefined ? 1 : d)),
  };
}

function run({ previous, balances, webPrices }) {
  const sheet = makeSheet(previous);
  const context = {
    Math, Number, String, Array, Object, JSON, isFinite, Date,
    Logger: { log: () => {} },
    Utilities: { formatDate: () => '2026-11-11 03:00:00' },
    WCORE_STABLECOINS: { getType: () => null },
    _cexGetPriceMap_: () => ({}),
    _cexFetchWebPrices_: () => webPrices,
    _cexSymbolToGeckoId_: () => null,
    _cexBuildVerifFormula_: () => '=V',
    _cexWriteVerifMap_: () => {},
  };
  vm.createContext(context);
  vm.runInContext(BODY, context);
  const values = [['', '2026-11-11 03:00:00', '', ''], ['symbol', 'balance', 'source', 'updated_at']]
    .concat(balances.map((row) => [row[0], row[1], row[2], '2026-11-11 03:00:00']));
  const total = context._cexComputeAndAppendTotal_({ getSheetByName: () => sheet }, 'CEX - Test', balances, 'test', values);
  const written = {};
  for (const row of sheet.grid.slice(2)) if (row[0] && row[0] !== '.') written[row[0]] = row[4];
  const totalRow = sheet.grid.find((row) => row[1] === 'INFO_TOTAL');
  return { total, written, infoTotal: totalRow ? totalRow[6] : undefined };
}

// The previous tab, sorted by value: BTC 5000, ETH 1000, DOGE 50 (500 DOGE at 0.10).
const PREVIOUS = [
  ['', '2026-11-10 22:00:00', '', '', '', '', ''],
  ['symbol', 'balance', 'source', 'updated_at', 'value_eur', 'Vérif', ''],
  ['BTC', 0.05, 'spot', '2026-11-10 22:00:00', 5000, '=V', ''],
  ['ETH', 0.4, 'spot', '2026-11-10 22:00:00', 1000, '', ''],
  ['DOGE', 500, 'spot', '2026-11-10 22:00:00', 50, '', ''],
  ['.', 'INFO_TOTAL', 'test', '2026-11-10 22:00:00', '', '', 6050],
];

test('a failed price falls back on the last known price of the same asset, whatever the row order', () => {
  // The new answer lists DOGE first; its price is missing this time. BTC and ETH are priced.
  const out = run({
    previous: PREVIOUS,
    balances: [['DOGE', 500, 'spot'], ['BTC', 0.05, 'spot'], ['ETH', 0.4, 'spot']],
    webPrices: { BTC: 100000, ETH: 2500 },
  });
  assert.equal(out.written.DOGE, 50, 'DOGE keeps its own last known value, not the value of the row it lands on');
  assert.equal(out.written.BTC, 5000);
  assert.equal(out.written.ETH, 1000);
  assert.equal(out.total, 6050);
  assert.equal(out.infoTotal, 6050);
});

test('the last known price is applied to the current balance', () => {
  // Half of the DOGE were sold since the previous run: 250 DOGE at the last known 0.10.
  const out = run({
    previous: PREVIOUS,
    balances: [['BTC', 0.05, 'spot'], ['DOGE', 250, 'spot']],
    webPrices: { BTC: 100000 },
  });
  assert.equal(out.written.DOGE, 25);
  assert.equal(out.total, 5025);
});

test('an asset absent from the previous tab gets no borrowed value', () => {
  const out = run({
    previous: PREVIOUS,
    balances: [['NEWCOIN', 1000, 'spot'], ['BTC', 0.05, 'spot']],
    webPrices: { BTC: 100000 },
  });
  assert.equal(out.written.NEWCOIN, 0, 'nothing known about this asset: no value is invented from another row');
  assert.equal(out.total, 5000);
});

test('an explicit zero from the price source still wins over the last known price', () => {
  // webPrices carries the symbol with a null price: the source says the asset is worth nothing.
  const out = run({
    previous: PREVIOUS,
    balances: [['DOGE', 500, 'spot'], ['BTC', 0.05, 'spot']],
    webPrices: { BTC: 100000, DOGE: null },
  });
  assert.equal(out.written.DOGE, 0, 'authoritative zero is never replaced by the last known price');
  assert.equal(out.total, 5000);
});

test('a first run on an empty tab invents nothing and does not fail', () => {
  const out = run({ previous: [], balances: [['DOGE', 500, 'spot'], ['BTC', 0.05, 'spot']], webPrices: { BTC: 100000 } });
  assert.equal(out.written.DOGE, 0);
  assert.equal(out.total, 5000);
});

test('the same asset held in two places is valued with the same last known price', () => {
  const previous = [
    PREVIOUS[0], PREVIOUS[1],
    ['DOGE', 500, 'spot', '2026-11-10 22:00:00', 50, '', ''],
    ['DOGE', 100, 'earn', '2026-11-10 22:00:00', 10, '', ''],
    ['.', 'INFO_TOTAL', 'test', '2026-11-10 22:00:00', '', '', 60],
  ];
  const out = run({ previous, balances: [['DOGE', 100, 'earn'], ['DOGE', 500, 'spot']], webPrices: {} });
  assert.equal(out.total, 60, '500 and 100 DOGE at the last known 0.10');
});

test('a previous cell that holds no usable figure gives no last known price', () => {
  const previous = [
    PREVIOUS[0], PREVIOUS[1],
    ['DOGE', 500, 'spot', '2026-11-10 22:00:00', 'n/a', '', ''],
    ['PEPE', 0, 'spot', '2026-11-10 22:00:00', 12, '', ''],
    ['BTC', 0.05, 'spot', '2026-11-10 22:00:00', '5000', '', ''],
  ];
  const out = run({ previous, balances: [['DOGE', 500, 'spot'], ['PEPE', 3, 'spot'], ['BTC', 0.05, 'spot']], webPrices: {} });
  assert.equal(out.written.DOGE, 0, 'text is not a value');
  assert.equal(out.written.PEPE, 0, 'no previous balance, no unit price');
  assert.equal(out.written.BTC, 5000, 'a number stored as text is read');
});

test('the positional read is gone from the function', () => {
  assert.equal(/prevValues/.test(BODY), false);
  assert.match(BODY, /prevPriceBySymbol\[symbol\]/);
});
