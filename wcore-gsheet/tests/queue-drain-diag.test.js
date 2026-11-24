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
  const calls = [];
  const props = {
    getProperty: k => { calls.push('get'); return k in store ? store[k] : null; },
    setProperty: (k, v) => { calls.push('set'); if (opts.failWrite) throw Error('quota'); store[k] = v; },
  };
  const ctx = { PropertiesService: { getScriptProperties: () => props }, JSON, Math, Number, String, Date, Object, calls };
  vm.createContext(ctx);
  vm.runInContext('var WCORE_WD_QUEUE_HIST_KEY = "WCORE_WD_QUEUE_HIST"; var WCORE_WD_QUEUE_HIST_MAX = 12;\n' +
    extract('_wd_recordQueueDrain_') + '\n' + extract('_wd_persistQueueHist_') + '\n' + extract('WCORE_WD_QUEUE_HIST_READ'), ctx);
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

test('the row fills stats without any property I/O; persistence carries no status or source', () => {
  const store = {};
  const c = load(store);
  const stats = { scanQueueDepthBefore: 40, scanQueueDepthAfter: 37 };
  const row = c._wd_recordQueueDrain_(stats, RES, 20500.4, 180000, 'MAIN');
  assert.equal(c.calls.length, 0, 'no PropertiesService call before the B1 acknowledgement');
  assert.equal(stats.scanQueuePreDrainMs, 20500);
  assert.equal(stats.scanQueueBudgetMs, 180000);
  assert.equal(stats.scanQueueElapsedMs, 88000);
  assert.equal(stats.scanQueueLongestMs, 63000);
  assert.deepEqual([row.n, row.ok, row.r, row.d0, row.d1, row.w], [3, 2, 'BUDGET_EXHAUSTED', 40, 37, 'MAIN']);
  assert.equal(c._wd_persistQueueHist_(row), true);
  const raw = store.WCORE_WD_QUEUE_HIST;
  assert.doesNotMatch(raw, /opaque|WEB_SCAN|secret|0x/);
  assert.equal(JSON.parse(raw).length, 1);
  assert.equal(c.WCORE_WD_QUEUE_HIST_READ(), raw);
});

test('a pass skipped for lack of budget is recorded too', () => {
  const store = {};
  const c = load(store);
  const stats = {};
  const row = c._wd_recordQueueDrain_(stats, { reason: 'WATCHDOG_BUDGET', results: [] }, 255000, 0, 'MAIN');
  c._wd_persistQueueHist_(row);
  const h = JSON.parse(store.WCORE_WD_QUEUE_HIST)[0];
  assert.deepEqual([h.r, h.p, h.b, h.n], ['WATCHDOG_BUDGET', 255000, 0, 0]);
});

test('history keeps only the last 12 passes and stays small', () => {
  const store = {};
  const c = load(store);
  for (let i = 0; i < 20; i++) c._wd_persistQueueHist_(c._wd_recordQueueDrain_({}, RES, i, 180000, 'MAIN'));
  const hist = JSON.parse(store.WCORE_WD_QUEUE_HIST);
  assert.equal(hist.length, 12);
  assert.equal(hist[0].p, 8);
  assert.equal(hist[11].p, 19);
  assert.equal(hist[0].d0, -1, 'unknown depth is explicit, not zero');
  assert.ok(store.WCORE_WD_QUEUE_HIST.length < 2500, 'well under the 9 KB property limit');
});

test('corrupt history is replaced, write failure and missing row are swallowed', () => {
  const store = { WCORE_WD_QUEUE_HIST: '{not json' };
  const c = load(store);
  c._wd_persistQueueHist_(c._wd_recordQueueDrain_({}, RES, 1, 2, 'MAIN'));
  assert.equal(JSON.parse(store.WCORE_WD_QUEUE_HIST).length, 1);
  const store2 = { WCORE_WD_QUEUE_HIST: '{"a":1}' };
  const c2 = load(store2);
  c2._wd_persistQueueHist_(c2._wd_recordQueueDrain_({}, RES, 1, 2, 'MAIN'));
  assert.equal(JSON.parse(store2.WCORE_WD_QUEUE_HIST).length, 1, 'non-array history is reset');
  const c3 = load({}, { failWrite: true });
  assert.equal(c3._wd_persistQueueHist_(c3._wd_recordQueueDrain_({}, RES, 1, 2, 'MAIN')), false);
  assert.equal(c3._wd_persistQueueHist_(null), false);
  assert.equal(c3._wd_persistQueueHist_(undefined), false);
});

test('empty or missing drain result is recorded without throwing', () => {
  const store = {};
  const c = load(store);
  const stats = {};
  c._wd_persistQueueHist_(c._wd_recordQueueDrain_(stats, null, 0, 0, 'MAIN'));
  assert.equal(stats.scanQueueElapsedMs, 0);
  assert.equal(JSON.parse(store.WCORE_WD_QUEUE_HIST)[0].n, 0);
});

test('main watchdog: timings recorded after the drain, history written only after the B1 acknowledgement', () => {
  const fn = extract('WATCHDOG_FROM_RECAP');
  const drain = fn.indexOf('_webScanQueueDrain_({');
  const after = fn.indexOf('stats.scanQueueDepthAfter', drain);
  const rec = fn.indexOf('_wdQueueHistRow = _wd_recordQueueDrain_(stats, _qRes, _qPreMs, _qBudget, "MAIN")');
  const ack = fn.indexOf('_wd_ackPulseDrained_(', rec);
  const skipped = fn.indexOf('_wd_recordQueueDrain_(stats, { reason: "WATCHDOG_BUDGET", results: [] }, _qPreMs, 0, "MAIN")');
  const persist = fn.indexOf('_wd_persistQueueHist_(_wdQueueHistRow)');
  const diag = fn.indexOf('props.setProperty("WCORE_WD_LAST_DIAG", diagJsonOut)');
  assert.ok(drain >= 0 && after > drain && rec > after && ack > rec, 'order drain -> depth -> row -> ack');
  assert.ok(skipped > ack && persist > skipped && diag > persist, 'skipped pass recorded, history after ack, before diag');
  assert.match(fn.slice(drain, rec), /ms: Number\(r\.durationMs\) \|\| 0/);
  assert.match(fn, /budgetMs: _qBudget/);
  assert.match(fn, /diagJsonOut\.length > 8000[\s\S]{0,200}diagPerSheet\.slice\(0, 20\)/, 'oversized diag is trimmed, not lost');
});

test('Sheets API fallback: timings recorded after the drain, history before the diag', () => {
  const fn = extract('_wd_watchdogFromRecapViaSheetsApi_');
  const drain = fn.indexOf('_webScanQueueDrain_({');
  const rec = fn.indexOf('_wdQueueHistRow = _wd_recordQueueDrain_(stats, _qRes, _qPreMs, _qBudget, "SHEETS_API")');
  const skipped = fn.indexOf('"WATCHDOG_BUDGET", results: [] }, _qPreMs, 0, "SHEETS_API")');
  const persist = fn.indexOf('_wd_persistQueueHist_(_wdQueueHistRow)');
  const diag = fn.indexOf('props.setProperty("WCORE_WD_LAST_DIAG", JSON.stringify(stats))');
  assert.ok(drain >= 0 && rec > drain && skipped > rec && persist > skipped && diag > persist);
});

test('trimmed diagnostic of a realistic oversized pass fits the 9 KB property limit', () => {
  const row = n => ({ name: 'Ledger - Robinhood Chain Crypto ' + n, vI1: '[REFRESH_QUEUE_DEFERRED] 2026-11-24 15:43:57', vJ1: '2026-11-24 15:43:57', vB1: '2026-11-24 15:44:05' });
  const per = Array.from({ length: 40 }, (_, i) => row(i));
  const diagOut = { lastRunTs: new Date().toISOString(), stats: { pad: 'x'.repeat(2000) }, perSheet: per };
  let out = JSON.stringify(diagOut);
  assert.ok(out.length > 8000, 'fixture is oversized');
  diagOut.perSheet = per.slice(0, 20); diagOut.perSheetTruncatedFrom = per.length; out = JSON.stringify(diagOut);
  assert.ok(Buffer.byteLength(out, 'utf8') < 9216);
});
