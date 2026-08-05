// Guards the self-repair of CEX_MANUAL_REFRESH_WORKER.
//
// Google can disable a trigger that is still present, and ScriptApp exposes no
// enabled/disabled state, so counting handlers reports it as healthy while nothing runs.
// Only a hand-run WCORE_CEX_TRIGGER_CLEANUP_FORCE brought it back. The auto-heal now
// watches the observable symptom instead: a manual queue that stops draining.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const source = fs.readFileSync(path.join(SRC, '16B_AUTO_HEAL.gs'), 'utf8');

function load(queue, opts) {
  opts = opts || {};
  const store = { CEX_MANUAL_JOB_QUEUE: queue == null ? null : JSON.stringify(queue) };
  const created = [];
  const deleted = [];
  const triggers = (opts.existing || ['CEX_MANUAL_REFRESH_WORKER', 'SYNC_J1_ALL_SHEETS']).map((fn) => ({
    getHandlerFunction: () => fn,
  }));

  const context = {
    console: { log: () => {} }, Date, JSON, Math, Number, String, Array, Object, RegExp,
    isFinite, parseInt, parseFloat,
    Logger: { log: () => {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = String(v); },
        deleteProperty: (k) => { delete store[k]; },
      }),
    },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: (t) => { deleted.push(t.getHandlerFunction()); },
      newTrigger: (fn) => ({
        timeBased: () => ({
          everyMinutes: () => ({
            create: () => {
              if (opts.createThrows) throw new Error('Trop de déclencheurs');
              created.push(fn);
            },
          }),
        }),
      }),
    },
    SpreadsheetApp: {}, UrlFetchApp: {}, Utilities: {}, CacheService: {}, LockService: {}, Session: {},
  };
  vm.createContext(context);

  // Only the checker and its constant are needed; the file as a whole reaches for the
  // whole Apps Script surface at load time.
  const start = source.indexOf('var _WCORE_CEX_QUEUE_STALE_MS');
  const end = source.indexOf('function _wcoreAutoHealJ1Staleness_');
  vm.runInContext(source.slice(start, end), context);

  const rows = [];
  context._wcoreAutoHealRow_ = (out, label, status, detail) => rows.push({ label, status, detail });
  return { context, rows, created, deleted, store };
}

const MIN = 60 * 1000;

function test(name, fn) {
  try { fn(); console.log('OK - ' + name); }
  catch (e) { console.error('FAIL - ' + name); throw e; }
}

test('an empty queue needs no repair', () => {
  const h = load([]);
  h.context._wcoreAutoHealCexQueueStaleness_([], false);
  assert.deepStrictEqual(h.created, [], 'nothing to revive when nothing is queued');
  assert.strictEqual(h.rows[0].status, 'OK');
});

test('a queue that is draining normally is left alone', () => {
  const h = load([{ kind: 'BINANCE', ts: Date.now() - 2 * MIN }]);
  h.context._wcoreAutoHealCexQueueStaleness_([], false);
  assert.deepStrictEqual(h.created, [], 'a job queued two minutes ago is still being worked');
  assert.strictEqual(h.rows[0].status, 'OK');
});

test('a queue stuck for too long revives the worker', () => {
  const h = load([
    { kind: 'BINANCE', ts: Date.now() - 25 * MIN },
    { kind: 'BYBIT', ts: Date.now() - 20 * MIN },
  ]);
  h.context._wcoreAutoHealCexQueueStaleness_([], false);

  assert.deepStrictEqual(h.deleted, ['CEX_MANUAL_REFRESH_WORKER'], 'the dead trigger must be removed');
  assert.deepStrictEqual(h.created, ['CEX_MANUAL_REFRESH_WORKER'], 'delete + recreate is what wakes it');
  assert.strictEqual(h.rows[0].status, 'REPAIRED');
});

test('the oldest job decides, not the newest', () => {
  const h = load([
    { kind: 'OLD', ts: Date.now() - 30 * MIN },
    { kind: 'FRESH', ts: Date.now() },
  ]);
  h.context._wcoreAutoHealCexQueueStaleness_([], false);
  assert.deepStrictEqual(h.created, ['CEX_MANUAL_REFRESH_WORKER'], 'a fresh job must not mask a stuck one');
});

test('a failed recreation is reported, never swallowed', () => {
  // Swallowing this is precisely why the worker stayed dead with nothing to show for it.
  const h = load([{ kind: 'BINANCE', ts: Date.now() - 25 * MIN }], { createThrows: true });
  h.context._wcoreAutoHealCexQueueStaleness_([], false);

  assert.strictEqual(h.rows[0].status, 'FAIL');
  assert.ok(/recreate failed/.test(h.rows[0].detail), 'the reason must reach the report');
});

test('a corrupted queue property does not throw', () => {
  const h = load(null);
  h.store.CEX_MANUAL_JOB_QUEUE = '[{"kind":"TRUNCA';
  h.context._wcoreAutoHealCexQueueStaleness_([], false);
  assert.strictEqual(h.rows[0].status, 'OK');
  assert.deepStrictEqual(h.created, []);
});
