// v4.17.0 - A partial answer from an exchange (a whole source missing) does not lower the total
// silently (P2-DATA-CEX-PARTIAL-RESPONSE). Same harness as cex-empty-answer-guard.test.js.
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
  let provider = 'binance';
  const run = (balances) => {
    const values = [['', '2026-11-11 18:00:00', '', ''], ['symbol', 'balance', 'source', 'updated_at']]
      .concat(balances.map((row) => [row[0], row[1], row[2], '2026-11-11 18:00:00']));
    return context._cexComputeAndAppendTotal_({ getSheetByName: () => sheet }, 'CEX - Test', balances, provider, values);
  };
  const later = (minutes) => { clock.now += minutes * 60 * 1000; };
  return { sheet, store, logs, run, later, setProvider: (p) => { provider = p; }, failWrites: () => { context.PropertiesService.getScriptProperties = () => ({ getProperty: (k) => (store.has(k) ? store.get(k) : null), setProperty: () => { throw new Error('quota'); }, deleteProperty: (k) => store.delete(k), getKeys: () => [...store.keys()] }); } };
}


const PREVIOUS = [
  ['', '2026-11-10 22:00:00', '', '', '', '', ''],
  ['symbol', 'balance', 'source', 'updated_at', 'value_eur', 'Vérif', ''],
  ['BTC', 0.05, 'spot', '2026-11-10 22:00:00', 5000, '=V', ''],
  ['ETH', 2, 'earn-flexible', '2026-11-10 22:00:00', 6000, '=V', ''],
  ['.', 'INFO_TOTAL', 'test', '2026-11-10 22:00:00', '', '', 11000],
];
const held = (h, sym) => h.sheet.grid.slice(2).find((row) => row[0] === sym && Number(row[1]) > 0);

test('a source missing from an answer that still holds assets is kept with its previous date', () => {
  const h = harness(PREVIOUS);
  h.run([['BTC', 0.05, 'spot']]);
  const eth = held(h, 'ETH');
  assert.ok(eth, 'the earn-flexible row is still there');
  assert.equal(eth[2], 'earn-flexible');
  assert.equal(eth[3], '2026-11-10 22:00:00', 'its date shows it is not fresh');
  assert.ok(h.logs.some((m) => m.includes('[CEX_PARTIAL_ANSWER_HELD]')));
  assert.equal(h.store.size, 1);
});

test('the missing source is accepted as gone 45 minutes after it was first seen missing', () => {
  const h = harness(PREVIOUS);
  h.run([['BTC', 0.05, 'spot']]);
  h.later(10);
  h.run([['BTC', 0.05, 'spot']]);
  assert.ok(held(h, 'ETH'), 'still kept 10 minutes later');
  h.later(40);
  h.run([['BTC', 0.05, 'spot']]);
  assert.ok(!held(h, 'ETH'), 'gone after the confirmation delay');
  assert.equal(h.store.size, 0);
});

test('an asset moved to another source is not counted twice', () => {
  const h = harness(PREVIOUS);
  h.run([['BTC', 0.05, 'spot'], ['ETH', 2, 'spot']]);
  const eths = h.sheet.grid.slice(2).filter((row) => row[0] === 'ETH' && Number(row[1]) > 0);
  assert.equal(eths.length, 1);
  assert.equal(eths[0][2], 'spot');
  assert.equal(h.store.size, 0, 'nothing carried, no episode opened (no false PARTIAL_ANSWER_HELD)');
  h.later(50);
  h.run([['BTC', 0.05, 'spot'], ['ETH', 2, 'spot']]);
  assert.equal(h.store.size, 0);
});

test('a source back in the answer closes its episode', () => {
  const h = harness(PREVIOUS);
  h.run([['BTC', 0.05, 'spot']]);
  assert.equal(h.store.size, 1);
  h.run([['BTC', 0.05, 'spot'], ['ETH', 2, 'earn-flexible']]);
  assert.equal(h.store.size, 0);
});

test('the status cell says PARTIAL_ANSWER_HELD while a source episode is open', () => {
  const S = extractFunction(SOURCE, '_cexWriteManualJobStatus_');
  assert.ok(/PARTIAL_ANSWER_HELD/.test(S) && /_cexPartialAnswerHeldSince_\(job\.sheetName\)/.test(S));
  assert.ok(/props\.getKeys\(\)/.test(extractFunction(SOURCE, '_cexPartialAnswerHeldSince_')));
});

test('only the shortfall of a symbol still held elsewhere is carried (OKX earn read failed)', () => {
  const previous = [
    ['', '2026-11-10 22:00:00', '', '', '', '', ''],
    ['symbol', 'balance', 'source', 'updated_at', 'value_eur', 'Vérif', ''],
    ['USDT', 5000, 'earn', '2026-11-10 22:00:00', 4600, '=V', ''],
    ['USDT', 20, 'funding', '2026-11-10 22:00:00', 18, '=V', ''],
    ['.', 'INFO_TOTAL', 'okx', '2026-11-10 22:00:00', '', '', 4618],
  ];
  const h = harness(previous);
  h.setProvider('okx');
  h.run([['USDT', 20, 'funding']]);
  const earn = h.sheet.grid.slice(2).find((row) => row[0] === 'USDT' && row[2] === 'earn');
  assert.ok(earn, 'the earn USDT is kept');
  assert.equal(earn[1], 5000);
  const info = h.sheet.grid.find((row) => row[1] === 'INFO_TOTAL');
  assert.match(String(info[2]), /PARTIAL_ANSWER_HELD/, 'the tab itself shows the carry-over');
});

test('Bitpanda and providers without real sources are left alone', () => {
  const h = harness(PREVIOUS);
  h.setProvider('bitpanda');
  h.run([['BTC', 0.05, 'spot']]);
  assert.ok(!held(h, 'ETH'));
  assert.equal(h.store.size, 0);
});

test('nothing is carried when the episode cannot be recorded', () => {
  const h = harness(PREVIOUS);
  h.failWrites();
  h.run([['BTC', 0.05, 'spot']]);
  assert.ok(!held(h, 'ETH'), 'a carry-over that could never end is not started');
  assert.ok(h.logs.some((m) => m.includes('[CEX_EMPTY_COUNTER_ERROR]')));
});

test('an episode older than 48 hours confirms the disappearance instead of starting over', () => {
  const h = harness(PREVIOUS);
  h.run([['BTC', 0.05, 'spot']]);
  h.later(49 * 60);
  h.run([['BTC', 0.05, 'spot']]);
  assert.ok(!held(h, 'ETH'));
  assert.equal(h.store.size, 0);
});
