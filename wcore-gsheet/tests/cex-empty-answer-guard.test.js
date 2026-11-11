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

const BODY = ['_cexEmptyAnswerKey_', '_cexEmptyAnswerProps_', '_cexEmptyAnswerHeldSince_', '_cexEmptyAnswerHeldSinceKey_', '_cexComputeAndAppendTotal_']
  .map((name) => extractFunction(SOURCE, name)).join('\n')
  + '\nvar CEX_EMPTY_CONFIRM_MIN_MS = 45 * 60 * 1000; var CEX_EMPTY_EPISODE_MAX_MS = 48 * 60 * 60 * 1000;';
assert.ok(SOURCE.includes('var CEX_EMPTY_CONFIRM_MIN_MS = 45 * 60 * 1000;') && SOURCE.includes('var CEX_EMPTY_EPISODE_MAX_MS = 48 * 60 * 60 * 1000;'), 'constants in the source match the harness');

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
  const clock = { now: Date.parse('2026-11-11T17:00:00Z') };
  class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [clock.now])); } static now() { return clock.now; } }
  const context = {
    Math, Number, String, Array, Object, JSON, isFinite, Date: FakeDate,
    Logger: { log: (m) => logs.push(String(m)) },
    Utilities: { formatDate: () => '2026-11-11 18:00:00' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (store.has(k) ? store.get(k) : null), setProperty: (k, v) => store.set(k, v), deleteProperty: (k) => store.delete(k), getKeys: () => [...store.keys()] }) },
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
  const later = (minutes) => { clock.now += minutes * 60 * 1000; };
  return { sheet, store, logs, run, later };
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

test('rows that all carry a zero balance are held like an empty answer', () => {
  const h = harness(PREVIOUS);
  const total = h.run([['BTC', '0', 'spot'], ['EUR', 0, 'fiat']]);
  assert.equal(total, 5000);
  assert.equal(h.sheet.grid[2][1], 0.05, 'the held asset is still there');
});

test('a second empty answer a few minutes later, in the same incident, is still held', () => {
  const h = harness(PREVIOUS);
  h.run([]);
  h.later(10);
  assert.equal(h.run([]), 5000);
  assert.equal(h.sheet.grid[2][1], 0.05);
});

test('emptiness still there 45 minutes after the first empty answer is accepted as real', () => {
  const h = harness(PREVIOUS);
  h.run([]);
  h.later(50);
  const total = h.run([]);
  assert.equal(total, 0);
  assert.equal(h.sheet.grid[0][1], '2026-11-11 18:00:00', 'the tab is rewritten with the new date');
  assert.ok(!h.sheet.grid.slice(2).some((row) => row[0] === 'BTC' && row[1] > 0), 'the held asset is gone');
  assert.equal(h.store.size, 0, 'the episode is cleared once accepted');
});

test('an episode older than 48 hours starts over instead of confirming the emptiness', () => {
  const h = harness(PREVIOUS);
  h.run([]);
  h.later(49 * 60);
  assert.equal(h.run([]), 5000, 'held again: a lone empty answer after a long silence proves nothing');
});

test('an answer holding an asset clears the episode', () => {
  const h = harness(PREVIOUS);
  h.run([]);
  h.run([['BTC', 0.05, 'spot']]);
  assert.equal(h.store.size, 0);
  h.later(50);
  assert.equal(h.run([]), 5000, 'the next empty answer opens a new episode and is held');
});

test('an empty answer on a tab that held nothing is written as before', () => {
  const h = harness([]);
  const total = h.run([]);
  assert.equal(total, 0);
  assert.equal(h.store.size, 0);
});

test('a held answer with no known previous total reports null, never a fresh zero', () => {
  const h = harness(PREVIOUS.slice(0, 3));
  assert.equal(h.run([]), null);
});

test('an empty INFO_TOTAL cell is unknown, not zero', () => {
  const previous = PREVIOUS.slice(0, 3).concat([['.', 'INFO_TOTAL', 'test', '2026-11-10 22:00:00', '', '', '']]);
  const h = harness(previous);
  assert.equal(h.run([]), null);
});

function statusHarness(heldTs) {
  const cells = {};
  const store = new Map();
  if (heldTs != null) store.set('CEX_EMPTY_STREAK|CEX - Binance', JSON.stringify({ ts: heldTs }));
  const sheet = (name) => ({
    getRange: (a1) => ({
      setValue(v) { cells[name + '!' + a1] = v; return this; },
      setNumberFormat() { return this; },
    }),
  });
  const now = Date.parse('2026-11-11T17:10:00Z');
  class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const context = {
    Math, Number, String, JSON, isFinite, Date: FakeDate,
    Logger: { log: () => {} },
    Utilities: { formatDate: (d) => new Date(d).toISOString().slice(0, 16).replace('T', ' ') },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (store.has(k) ? store.get(k) : null), setProperty: (k, v) => store.set(k, v), deleteProperty: (k) => store.delete(k), getKeys: () => [...store.keys()] }) },
    _bpGetSpreadsheet_: () => ({ getSheetByName: (n) => sheet(n) }),
    _bpFmtStamp_: () => '2026-11-11 18:10:00',
    _bpExtractStampText_: (v) => v,
    _bpGetSheetCellText_: () => '2026-11-10 22:00:00',
    _bpSetSheetStatus_: () => {},
  };
  vm.createContext(context);
  vm.runInContext(['_cexEmptyAnswerKey_', '_cexEmptyAnswerProps_', '_cexEmptyAnswerHeldSince_', '_cexEmptyAnswerHeldSinceKey_', '_cexPartialAnswerHeldSince_', '_cexWriteManualJobStatus_']
    .map((n) => extractFunction(SOURCE, n)).join('\n') + '\nvar CEX_EMPTY_CONFIRM_MIN_MS = 45 * 60 * 1000; var CEX_EMPTY_EPISODE_MAX_MS = 48 * 60 * 60 * 1000;', context);
  context._cexWriteManualJobStatus_({ kind: 'BINANCE', sheetName: 'CEX - Binance', statusSheetName: 'Portefeuille Crypto', statusCell: 'U2' }, '{"ok":true,"rows":0}');
  return cells;
}

test('the status cell says EMPTY_ANSWER_HELD while an episode is open, and OK once it is cleared', () => {
  const held = statusHarness(Date.parse('2026-11-11T17:00:00Z'));
  assert.match(held['Portefeuille Crypto!U2'], /^BINANCE EMPTY_ANSWER_HELD: 2026-11-11 18:10:00 \(onglet conservé depuis /);
  assert.equal(held['CEX - Binance!B1'], '2026-11-10 22:00:00', 'B1 keeps the date of the data, not now');
  const cleared = statusHarness(null);
  assert.equal(cleared['Portefeuille Crypto!U2'], 'BINANCE OK: 2026-11-11 18:10:00');
});
