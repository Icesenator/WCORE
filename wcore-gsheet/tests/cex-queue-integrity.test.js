// Guards the CEX manual job queue against the two ways it used to lose jobs:
//   1. Unsynchronised read-modify-write on a single ScriptProperty.
//   2. JSON.stringify(queue).substring(0, 8000), which truncates mid-structure. Every
//      reader parses inside a try/catch that falls back to [], so an oversized queue did
//      not drop its newest job - it wiped the whole queue.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const source = fs.readFileSync(path.join(SRC, '35_BITPANDA_SYNC.gs'), 'utf8');

// --- static guards ---------------------------------------------------------
assert.ok(
  !/CEX_MANUAL_JOB_QUEUE",\s*JSON\.stringify\([^)]*\)\.substring/.test(source),
  'the queue must never be written through a truncated JSON string',
);
assert.ok(
  /function _cexQueueMutate_/.test(source),
  'queue mutations must go through the guarded helper',
);
for (const caller of ['_cexEnqueueManualJobs_', '_cexRequeueManualJob_']) {
  const body = source.slice(source.indexOf(`function ${caller}`));
  const end = body.indexOf('\nfunction ');
  assert.ok(
    /_cexQueueMutate_\(/.test(body.slice(0, end > 0 ? end : body.length)),
    `${caller} must mutate the queue through _cexQueueMutate_`,
  );
}

// --- behavioural: the helper in isolation ---------------------------------
function makeContext() {
  const store = {};
  let lockHeld = false;
  const context = {
    console, Date, JSON, Math, Number, String, Array, Object, RegExp,
    isFinite, parseInt, parseFloat,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = String(v); },
        deleteProperty: (k) => { delete store[k]; },
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          if (lockHeld) return false;
          lockHeld = true;
          return true;
        },
        releaseLock: () => { lockHeld = false; },
      }),
    },
    Utilities: { getUuid: () => 'uuid', sleep: () => {} },
    Logger: { log: () => {} },
    SpreadsheetApp: {}, UrlFetchApp: {}, Session: {}, CacheService: {}, ScriptApp: {},
  };
  vm.createContext(context);
  // Only the helper and its constants are needed; the file as a whole pulls in the
  // whole Apps Script surface.
  const start = source.indexOf('var _CEX_QUEUE_MAX_CHARS');
  const end = source.indexOf('function CEX_QUEUE_MANUAL_JOB');
  vm.runInContext('var _CEX_LOCK_TRY_MS = 1000;\n' + source.slice(start, end), context);
  return { context, store, isLockHeld: () => lockHeld };
}

{
  const { context, store } = makeContext();
  let accepted = 0;
  let previousRaw = null;
  for (let i = 0; i < 400; i++) {
    try {
      context._cexQueueMutate_((q) => { q.push({ kind: `JOB_${i}`, pad: 'x'.repeat(40), ts: i }); });
      accepted++;
      previousRaw = store.CEX_MANUAL_JOB_QUEUE;
    } catch (error) {
      assert.match(String(error.message || error), /capacity exceeded/);
      assert.strictEqual(store.CEX_MANUAL_JOB_QUEUE, previousRaw, 'overflow must leave the persisted queue unchanged');
      break;
    }
  }

  const parsed = JSON.parse(store.CEX_MANUAL_JOB_QUEUE);
  assert.strictEqual(parsed.length, accepted);
  assert.strictEqual(parsed[0].kind, 'JOB_0', 'overflow must not evict the oldest job');
  assert.strictEqual(parsed[parsed.length - 1].kind, `JOB_${accepted - 1}`);
}

{
  const { context, store } = makeContext();
  store.CEX_MANUAL_JOB_QUEUE = JSON.stringify([{ kind: 'EXISTING' }]);
  context.LockService.getScriptLock = () => ({ tryLock: () => false, releaseLock: () => {} });

  assert.throws(
    () => context._cexQueueMutate_((q) => { q.push({ kind: 'LOST' }); }),
    /lock unavailable/,
  );
  assert.deepStrictEqual(JSON.parse(store.CEX_MANUAL_JOB_QUEUE).map((j) => j.kind), ['EXISTING']);
}

// Claiming and enqueueing agree on a single serialised view.
{
  const { context, store } = makeContext();
  context._cexQueueMutate_((q) => { q.push({ kind: 'A' }); q.push({ kind: 'B' }); });

  const claimed = context._cexQueueMutate_((q) => (q.length ? q.shift() : null));
  assert.strictEqual(claimed.kind, 'A', 'the worker claims the oldest job');
  assert.deepStrictEqual(
    JSON.parse(store.CEX_MANUAL_JOB_QUEUE).map((j) => j.kind), ['B'],
    'the claimed job is removed exactly once',
  );

  const empty = context._cexQueueMutate_((q) => (q.length ? q.shift() : null));
  assert.strictEqual(empty.kind, 'B');
  assert.strictEqual(context._cexQueueMutate_((q) => (q.length ? q.shift() : null)), null);
}

// A corrupted property must not crash the enqueue.
{
  const { context, store } = makeContext();
  store.CEX_MANUAL_JOB_QUEUE = '[{"kind":"TRUNCA';
  context._cexQueueMutate_((q) => { q.push({ kind: 'FRESH' }); });
  assert.deepStrictEqual(
    JSON.parse(store.CEX_MANUAL_JOB_QUEUE).map((j) => j.kind), ['FRESH'],
    'a corrupted queue recovers instead of throwing',
  );
}

// The lock is always released, even when the mutator throws.
{
  const { context, isLockHeld } = makeContext();
  assert.throws(() => context._cexQueueMutate_(() => { throw new Error('boom'); }), /boom/);
  assert.strictEqual(isLockHeld(), false, 'the queue lock must be released on failure');
}

{
  const store = {};
  let lockHeld = false;
  let uuid = 0;
  const context = {
    console, Date, JSON, Math, Number, String, Array, Object, RegExp,
    isFinite, parseInt, parseFloat,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = String(v); },
        deleteProperty: (k) => { delete store[k]; },
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          if (lockHeld) return false;
          lockHeld = true;
          return true;
        },
        releaseLock: () => { lockHeld = false; },
      }),
    },
    Utilities: { getUuid: () => `owner-${++uuid}` },
  };
  vm.createContext(context);
  const start = source.indexOf('var _CEX_WORKER_LEASE_TTL_MS');
  const end = source.indexOf('function CEX_MANUAL_REFRESH_WORKER');
  vm.runInContext('var _CEX_LOCK_TRY_MS = 1000;\n' + source.slice(start, end), context);

  assert.strictEqual(context._cexWorkerAcquireLease_(), true);
  const acquired = JSON.parse(store.CEX_WORKER_LEASE);
  assert.strictEqual(acquired.owner, 'owner-1');
  assert.strictEqual(context._cexWorkerAcquireLease_(), false, 'an active lease must reject a second worker');

  context._cexWorkerRenewLease_(context.PropertiesService.getScriptProperties());
  const renewed = JSON.parse(store.CEX_WORKER_LEASE);
  assert.strictEqual(renewed.owner, 'owner-1', 'lease renewal must preserve the current owner');
  assert.ok(renewed.until > Date.now(), 'lease renewal must extend the expiry');

  store.CEX_WORKER_LEASE = JSON.stringify({ owner: 'owner-2', until: Date.now() + 60000 });
  context._cexWorkerReleaseLease_();
  assert.strictEqual(JSON.parse(store.CEX_WORKER_LEASE).owner, 'owner-2', 'a worker must not release another owner lease');
}

console.log('OK - CEX queue integrity verified');
