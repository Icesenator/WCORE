// v4.16.98 - An empty answer from an exchange does not wipe a tab that held assets (audit of
// 2026-11-11, G1). The first empty answer keeps the tab and its date; a second consecutive
// empty answer is accepted as real (everything withdrawn). A non-empty answer resets the count.
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

function harness(previous) {
  const sheet = makeSheet(previous);
  const store = new Map();
  const logs = [];
  const context = {
    Math, Number, String, Array, Object, JSON, isFinite, Date,
    Logger: { log: (m) => logs.push(String(m)) },
    Utilities: { formatDate: () => '2026-11-11 18:00:00' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (store.has(k) ? store.get(k) : null), setProperty: (k, v) => store.set(k, v), deleteProperty: (k) => store.delete(k) }) },
    WCORE_STABLECOINS: { getType: () => null },
    _cexGetPriceMap_: () => ({}),
    _cexFetchWebPrices_: () => ({ BTC: 100000 }),
    _cexSymbolToGeckoId_: () => null,
    _cexBuildVerifFormula_: () => '=V',
    _cexWriteVerifMap_: () => {},
  };
  vm.createContext(context);
  vm.runInContext(BODY, context);
  const run = (balances) => {
    const values = [['', '2026-11-11 18:00:00', '', ''], ['symbol', 'balance', 'source', 'updated_at']]
      .concat(balances.map((row) => [row[0], row[1], row[2], '2026-11-11 18:00:00']));
    return context._cexComputeAndAppendTotal_({ getSheetByName: () => sheet }, 'CEX - Test', balances, 'test', values);
  };
  return { sheet, store, logs, run };
}

const PREVIOUS = [
  ['', '2026-11-10 22:00:00', '', '', '', '', ''],
  ['symbol', 'balance', 'source', 'updated_at', 'value_eur', 'Vérif', ''],
  ['BTC', 0.05, 'spot', '2026-11-10 22:00:00', 5000, '=V', ''],
  ['.', 'INFO_TOTAL', 'test', '2026-11-10 22:00:00', '', '', 5000],
];

test('a first empty answer keeps the tab, its date and its total', () => {
  const h = harness(PREVIOUS);
  const total = h.run([]);
  assert.equal(total, 5000, 'the previous total is reported, not a fresh zero');
  assert.equal(h.sheet.grid[0][1], '2026-11-10 22:00:00', 'B1 keeps the date of the last real answer');
  assert.equal(h.sheet.grid[2][0], 'BTC');
  assert.equal(h.sheet.grid[2][1], 0.05);
  assert.ok(h.logs.some((m) => m.includes('[CEX_EMPTY_ANSWER_HELD]')));
});

test('a second consecutive empty answer is accepted as real', () => {
  const h = harness(PREVIOUS);
  h.run([]);
  const total = h.run([]);
  assert.equal(total, 0);
  assert.equal(h.sheet.grid[0][1], '2026-11-11 18:00:00', 'the tab is rewritten with the new date');
  assert.ok(!h.sheet.grid.slice(2).some((row) => row[0] === 'BTC' && row[1] > 0), 'the held asset is gone');
  assert.equal(h.store.size, 0, 'the counter is cleared once accepted');
});

test('a non-empty answer between two empty ones resets the count', () => {
  const h = harness(PREVIOUS);
  h.run([]);
  h.run([['BTC', 0.05, 'spot']]);
  assert.equal(h.store.size, 0);
  const total = h.run([]);
  assert.equal(total, 5000, 'the next empty answer is again only held');
});

test('an empty answer on a tab that held nothing is written as before', () => {
  const h = harness([]);
  const total = h.run([]);
  assert.equal(total, 0);
  assert.equal(h.store.size, 0);
});
