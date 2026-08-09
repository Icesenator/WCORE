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

// A job is never lost when the payload has to shrink.
{
  const { context, store } = makeContext();
  let previousLength = 0;
  let worstDrop = 0;
  for (let i = 0; i < 400; i++) {
    context._cexQueueMutate_((q) => { q.push({ kind: `JOB_${i}`, pad: 'x'.repeat(40), ts: i }); });
    let length = 0;
    try { length = JSON.parse(store.CEX_MANUAL_JOB_QUEUE).length; } catch (e) { length = 0; }
    worstDrop = Math.max(worstDrop, previousLength - length);
    previousLength = length;
  }

  // The decisive invariant. Truncating the JSON left an unparseable value, so the next
  // enqueue fell into its catch, restarted from [] and stored a single job: the queue
  // collapsed from ~100 entries to 1. Shedding the oldest entries removes a couple at a
  // time, never the whole backlog.
  assert.ok(
    worstDrop <= 5,
    `overflow must shed the oldest jobs, not reset the queue (largest single drop: ${worstDrop})`,
  );

  const raw = store.CEX_MANUAL_JOB_QUEUE;
  assert.ok(raw.length <= 8000, `stored payload must stay bounded, got ${raw.length}`);

  // The decisive property: what is stored is still parseable. With the old truncation
  // this threw, and every reader silently restarted from an empty queue.
  const parsed = JSON.parse(raw);
  assert.ok(Array.isArray(parsed), 'the stored queue must remain valid JSON');

  // Overflow drops the OLDEST jobs, never the one just submitted.
  assert.strictEqual(
    parsed[parsed.length - 1].kind, 'JOB_399',
    'the newest job must survive an overflow',
  );

  // What survives is the most recent contiguous run, with nothing lost in the middle.
  const kept = parsed.map((j) => Number(String(j.kind).replace('JOB_', '')));
  for (let i = 1; i < kept.length; i++) {
    assert.strictEqual(kept[i], kept[i - 1] + 1, 'retained jobs must stay contiguous');
  }
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

console.log('OK - CEX queue integrity verified');
