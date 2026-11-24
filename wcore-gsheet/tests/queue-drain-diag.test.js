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
  assert.deepEqual([row.mx, row.mc, row.mo], [63000, 'GNOSIS', 'ERROR'], 'chain and outcome of the slowest scan');
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
  assert.equal(JSON.parse(store.WCORE_WD_QUEUE_HIST)[0].mc, '', 'no slowest chain without a scan');
});

test('slowest chain: first of equal durations kept, long names bounded, missing chain is empty', () => {
  const c = load({});
  const row = c._wd_recordQueueDrain_({}, { results: [
    { chain: 'A', outcome: 'OK', durationMs: 9000 },
    { chain: 'B', outcome: 'OK', durationMs: 9000 },
  ] }, 0, 0, 'MAIN');
  assert.equal(row.mc, 'A');
  const long = c._wd_recordQueueDrain_({}, { results: [{ chain: 'X'.repeat(60), outcome: 'Y'.repeat(60), durationMs: 1 }] }, 0, 0, 'MAIN');
  assert.equal(long.mc.length, 24);
  assert.equal(long.mo.length, 24);
  const none = c._wd_recordQueueDrain_({}, { results: [{ outcome: 'THROWN', durationMs: 5 }] }, 0, 0, 'MAIN');
  assert.deepEqual([none.mc, none.mo], ['', 'THROWN']);
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
  assert.match(fn, /var diagJsonOut = _wd_boundDiagJson_\(diagOut\);\s*props\.setProperty\("WCORE_WD_LAST_DIAG", diagJsonOut\)/, 'oversized diag is trimmed, not lost');
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

function bound() {
  const ctx = { JSON, String, unescape, encodeURIComponent };
  vm.createContext(ctx);
  vm.runInContext('var WCORE_WD_DIAG_MAX_BYTES = 8500;\n' + extract('_wd_utf8Bytes_') + '\n' + extract('_wd_boundDiagJson_'), ctx);
  return ctx;
}
const LIMIT = 9216;
const rowOf = (n, name) => ({ name: (name || 'Ledger - Robinhood Chain Crypto ') + n, vI1: '[REFRESH_QUEUE_DEFERRED] 2026-11-24 15:43:57', vJ1: '2026-11-24 15:43:57', vB1: '2026-11-24 15:44:05' });

test('a normal diagnostic is written unchanged', () => {
  const b = bound();
  const d = { lastRunTs: 't', stats: { a: 1 }, perSheet: [rowOf(1)], probeNames: ['x'] };
  assert.equal(b._wd_boundDiagJson_(d), JSON.stringify({ lastRunTs: 't', stats: { a: 1 }, perSheet: [rowOf(1)], probeNames: ['x'] }));
});

test('multibyte names are measured in UTF-8 bytes, not characters', () => {
  const b = bound();
  assert.equal(b._wd_utf8Bytes_('é'), 2);
  assert.equal(b._wd_utf8Bytes_('€'), 3);
  // ~7 900 characters but well over 9 KB in UTF-8: must be trimmed.
  const per = Array.from({ length: 40 }, (_, i) => rowOf(i, '€'.repeat(80)));
  const d = { lastRunTs: 't', stats: { a: 1 }, perSheet: per, probeNames: [] };
  const out = b._wd_boundDiagJson_(d);
  assert.ok(Buffer.byteLength(out, 'utf8') <= 8500);
  assert.equal(JSON.parse(out).perSheetTruncatedFrom, 40);
});

test('each trimming step re-checks the size; stats survive, the write always fits', () => {
  const b = bound();
  const per = Array.from({ length: 40 }, (_, i) => rowOf(i, 'x'.repeat(400)));
  let out = b._wd_boundDiagJson_({ lastRunTs: 't', stats: { a: 1 }, perSheet: per, probeNames: ['p'] });
  assert.ok(Buffer.byteLength(out, 'utf8') <= 8500);
  assert.deepEqual(JSON.parse(out).perSheet, [], '20 rows still too big -> no rows');
  assert.deepEqual(JSON.parse(out).stats, { a: 1 });
  out = b._wd_boundDiagJson_({ lastRunTs: 't', stats: { pad: 'x'.repeat(8300) }, extra: 'y'.repeat(600), perSheet: per, probeNames: ['x'.repeat(2000)] });
  assert.ok(Buffer.byteLength(out, 'utf8') <= 8500 && JSON.parse(out).diagTruncated === true);
  assert.equal(JSON.parse(out).stats.pad.length, 8300, 'stats kept whole when they fit alone');
  out = b._wd_boundDiagJson_({ lastRunTs: 't', stats: { pad: 'x'.repeat(12000) }, perSheet: [] });
  assert.ok(Buffer.byteLength(out, 'utf8') < LIMIT && JSON.parse(out).statsTooLarge === true);
});
