// v4.16.101 : mesure du drain de la file de scans (P2-REL-GAS-QUEUE-AND-J1).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/16_REFRESH.gs'), 'utf8');
function extract(name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw Error(name);
}
function load(store, opts) {
  opts = opts || {};
  const props = {
    getProperty: k => (k in store ? store[k] : null),
    setProperty: (k, v) => { if (opts.failWrite) throw Error('quota'); store[k] = v; },
  };
  const ctx = { PropertiesService: { getScriptProperties: () => props }, JSON, Math, Number, String, Date, Object };
  vm.createContext(ctx);
  vm.runInContext('var WCORE_WD_QUEUE_HIST_KEY = "WCORE_WD_QUEUE_HIST"; var WCORE_WD_QUEUE_HIST_MAX = 12;\n' +
    extract('_wd_recordQueueDrain_') + '\n' + extract('WCORE_WD_QUEUE_HIST_READ'), ctx);
  return ctx;
}
const RES = {
  reason: 'BUDGET_EXHAUSTED', elapsedMs: 88000,
  results: [
    { chain: 'GNOSIS', outcome: 'ERROR', durationMs: 63000, source: 'opaque', status: '[WEB_SCAN_ERROR] secret-ish' },
    { chain: 'KAIA', outcome: 'OK', durationMs: 5000, source: 'opaque', status: 'WEB_SCAN_OK 2026-11-24 15:00:00' },
    { chain: 'MOCA', outcome: 'OK', durationMs: 4300 },
  ],
};

test('stats and history carry drain timings, never status or source', () => {
  const store = {};
  const c = load(store);
  const stats = { scanQueueDepthBefore: 40, scanQueueDepthAfter: 37 };
  const row = c._wd_recordQueueDrain_(stats, RES, 20500.4, 180000, 'MAIN');
  assert.equal(stats.scanQueuePreDrainMs, 20500);
  assert.equal(stats.scanQueueBudgetMs, 180000);
  assert.equal(stats.scanQueueElapsedMs, 88000);
  assert.equal(stats.scanQueueLongestMs, 63000);
  assert.equal(row.n, 3);
  assert.equal(row.ok, 2);
  assert.equal(row.r, 'BUDGET_EXHAUSTED');
  assert.equal(row.d0, 40);
  assert.equal(row.d1, 37);
  assert.equal(row.w, 'MAIN');
  const raw = store.WCORE_WD_QUEUE_HIST;
  assert.doesNotMatch(raw, /opaque|WEB_SCAN|secret|0x/);
  assert.equal(JSON.parse(raw).length, 1);
  assert.equal(c.WCORE_WD_QUEUE_HIST_READ(), raw);
});

test('history keeps only the last 12 passes and stays small', () => {
  const store = {};
  const c = load(store);
  for (let i = 0; i < 20; i++) c._wd_recordQueueDrain_({}, RES, i, 180000, 'MAIN');
  const hist = JSON.parse(store.WCORE_WD_QUEUE_HIST);
  assert.equal(hist.length, 12);
  assert.equal(hist[0].p, 8);
  assert.equal(hist[11].p, 19);
  assert.equal(hist[0].d0, -1, 'unknown depth is explicit, not zero');
  assert.ok(store.WCORE_WD_QUEUE_HIST.length < 2500, 'well under the 9 KB property limit');
});

test('corrupt history is replaced, write failure is swallowed', () => {
  const store = { WCORE_WD_QUEUE_HIST: '{not json' };
  const c = load(store);
  c._wd_recordQueueDrain_({}, RES, 1, 2, 'MAIN');
  assert.equal(JSON.parse(store.WCORE_WD_QUEUE_HIST).length, 1);
  const store2 = { WCORE_WD_QUEUE_HIST: '{"a":1}' };
  load(store2)._wd_recordQueueDrain_({}, RES, 1, 2, 'MAIN');
  assert.equal(JSON.parse(store2.WCORE_WD_QUEUE_HIST).length, 1, 'non-array history is reset');
  const stats = {};
  assert.doesNotThrow(() => load({}, { failWrite: true })._wd_recordQueueDrain_(stats, RES, 1, 2, 'MAIN'));
  assert.equal(stats.scanQueueLongestMs, 63000, 'stats still filled when the history write fails');
});

test('empty or missing drain result is recorded without throwing', () => {
  const store = {};
  const c = load(store);
  const stats = {};
  c._wd_recordQueueDrain_(stats, null, 0, 0, 'MAIN');
  assert.equal(stats.scanQueueElapsedMs, 0);
  assert.equal(JSON.parse(store.WCORE_WD_QUEUE_HIST)[0].n, 0);
});

for (const fnName of ['WATCHDOG_FROM_RECAP', '_wd_watchdogFromRecapViaSheetsApi_']) {
  test(fnName + ' records drain timings after the drain and before persisting diagnostics', () => {
    const fn = extract(fnName);
    const drain = fn.indexOf('_webScanQueueDrain_({');
    const rec = fn.indexOf('_wd_recordQueueDrain_(stats, _qRes, _qPreMs, _qBudget,');
    const after = fn.indexOf('stats.scanQueueDepthAfter');
    const persist = fn.indexOf('JSON.stringify(', rec);
    assert.ok(drain >= 0 && after > drain && rec > after && persist > rec);
    assert.match(fn.slice(drain, rec), /ms: Number\(r\.durationMs\) \|\| 0/);
    assert.match(fn, /budgetMs: _qBudget/);
  });
}
