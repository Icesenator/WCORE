const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const keysSource = fs.readFileSync(path.join(root, 'src/00C_CACHE_KEYS.gs'), 'utf8');
const quotaSource = fs.readFileSync(path.join(root, 'src/03E_QUOTA_CIRCUIT_BREAKER.gs'), 'utf8');
const savingsSource = fs.readFileSync(path.join(root, 'src/26B_HTTP_SAVINGS.gs'), 'utf8');
const webSource = fs.readFileSync(path.join(root, 'src/41_GSHEET_WEB_SCAN.gs'), 'utf8');
const refreshSource = fs.readFileSync(path.join(root, 'src/16_REFRESH.gs'), 'utf8');

assert.match(quotaSource, /var\s+QUOTA_CIRCUIT_BREAKER_VERSION\s*=\s*["']4\.16\.79["']\s*;/,
  'QUOTA_CIRCUIT_BREAKER_VERSION must match the 4.16.79 source header');

function extractIife(source, name) {
  const marker = `var ${name} =`;
  const start = source.indexOf(marker);
  assert.notStrictEqual(start, -1, `${name} not found`);
  const end = source.indexOf('\n})();', start);
  assert.notStrictEqual(end, -1, `${name} IIFE end not found`);
  return source.slice(start, end + '\n})();'.length);
}

function balancedBody(source, bodyStart, name) {
  let depth = 0;
  let state = 'code';
  let escaped = false;
  let quote = '';
  let regexClass = false;
  for (let i = bodyStart; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (state === 'line') { if (ch === '\n') state = 'code'; continue; }
    if (state === 'block') { if (ch === '*' && next === '/') { state = 'code'; i++; } continue; }
    if (state === 'string' || state === 'template') {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if ((state === 'string' && ch === quote) || (state === 'template' && ch === '`')) state = 'code';
      continue;
    }
    if (state === 'regex') {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '[') regexClass = true;
      if (ch === ']') regexClass = false;
      if (ch === '/' && !regexClass) state = 'code';
      continue;
    }
    if (ch === '/' && next === '/') { state = 'line'; i++; continue; }
    if (ch === '/' && next === '*') { state = 'block'; i++; continue; }
    if (ch === '"' || ch === "'") { state = 'string'; quote = ch; continue; }
    if (ch === '`') { state = 'template'; continue; }
    if (ch === '/') {
      const before = source.slice(0, i).trimEnd();
      const word = before.match(/([A-Za-z_$][\w$]*)$/);
      const previous = before.charAt(before.length - 1);
      if (!previous || /[([{,:;=!?&|+\-*%^~<>]/.test(previous) || (word && /^(return|case|throw|typeof|instanceof|in|of)$/.test(word[1]))) {
        state = 'regex';
        regexClass = false;
        continue;
      }
    }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return i;
  }
  throw new Error(`${name} body not closed`);
}

function extractFunction(source, name) {
  const match = new RegExp(`\\bfunction\\s+${name}\\s*\\([^)]*\\)\\s*\\{`).exec(source);
  assert(match, `${name} not found`);
  const bodyStart = match.index + match[0].lastIndexOf('{');
  return source.slice(match.index, balancedBody(source, bodyStart, name) + 1);
}

function extractMethod(source, name) {
  const match = new RegExp(`\\b${name}\\s*:\\s*function\\s*\\([^)]*\\)\\s*\\{`).exec(source);
  assert(match, `${name} method not found`);
  const bodyStart = match.index + match[0].lastIndexOf('{');
  return source.slice(match.index, balancedBody(source, bodyStart, name) + 1);
}

function extractVar(source, name) {
  const match = new RegExp(`\\bvar\\s+${name}\\s*=\\s*([^;]+);`).exec(source);
  assert(match, `${name} constant not found`);
  return match[0];
}

const trickyFunction = 'function compact (x){const a="}";/* { ignored */return /[}]/.test(a)&&x;}function after(){return false;}';
assert.equal(extractFunction(trickyFunction, 'compact'), 'function compact (x){const a="}";/* { ignored */return /[}]/.test(a)&&x;}');

const counterCode = extractIife(quotaSource, 'HttpCounter');
const budgetCode = extractIife(quotaSource, 'BudgetHTTP');
const httpModeCode = extractIife(quotaSource, 'WcoreHttpMode');
const legacyCode = extractIife(savingsSource, 'HttpCallCounter');
const resetHttpCounterCode = extractFunction(quotaSource, 'RESET_HTTP_COUNTER');
const telemetryTransportCode = extractFunction(quotaSource, '_httpTelemetryTransport_');

const quotaProtectionStatusCode = extractFunction(quotaSource, 'GET_QUOTA_PROTECTION_STATUS');
const quotaBreakerCode = extractIife(quotaSource, 'QuotaCircuitBreaker');
const webBreakerReadCode = extractFunction(webSource, '_webScanReadBreakerState_');
const webBreakerStatusCode = extractFunction(webSource, '_webScanBreakerStatus_');
const watchdogConstantsCode = [
  extractVar(refreshSource, 'WD_STALE_I1_HOURS'),
  extractVar(refreshSource, 'WD_MAX_PULSES_PER_RUN'),
].join('\n');
const webBreakerConstantsCode = extractVar(webSource, 'GSHEET_WEB_BREAKER_THRESHOLD');

// v4.16.39: the post-trip hold READ is deliberately lock-free (atomic
// getProperty) so it stays reliable during UserLock contention; only the WRITE
// keeps the locked discipline.
const FLOOR_UNLOCKED = { allowUnlockedReads: true };

function makeShared(options = {}) {
  const values = new Map();
  const writes = { set: 0, delete: 0 };
  const reads = { locked: 0, unlocked: 0 };
  const failGetOnce = new Set();
  const failSetOnce = new Set();
  const failDeleteOnce = new Set();
  const lock = {
    held: false,
    available: true,
    tryLockCalls: 0,
    tryLock() {
      this.tryLockCalls++;
      if (!this.available || this.held) return false;
      this.held = true;
      return true;
    },
    releaseLock() {
      assert.equal(this.held, true, 'only a held UserLock may be released');
      this.held = false;
    },
  };
  const props = {
    getProperty(key) {
      if (lock.held) reads.locked++;
      else {
        assert.equal(options.allowUnlockedReads, true, `getProperty(${key}) must run under UserLock`);
        reads.unlocked++;
      }
      if (failGetOnce.delete(key)) throw new Error(`injected get failure: ${key}`);
      return values.has(key) ? values.get(key) : null;
    },
    setProperty(key, value) {
      assert.equal(lock.held, true, `setProperty(${key}) must run under UserLock`);
      if (failSetOnce.delete(key)) throw new Error(`injected set failure: ${key}`);
      writes.set++;
      values.set(key, String(value));
    },
    deleteProperty(key) {
      assert.equal(lock.held, true, `deleteProperty(${key}) must run under UserLock`);
      if (failDeleteOnce.delete(key)) throw new Error(`injected delete failure: ${key}`);
      writes.delete++;
      values.delete(key);
    },
  };
  return { values, writes, reads, lock, props, failGetOnce, failSetOnce, failDeleteOnce };
}

function installDiagnosticDependencies(runtime, cache) {
  runtime.QUOTA_BREAKER_CONFIG = {
    CACHE_KEY: 'WCORE_QUOTA_EXHAUSTED_v1',
    TRIP_MAX_LOCKOUT_MS: 24 * 60 * 60 * 1000,
  };
  runtime.CacheService = { getScriptCache: () => cache };
  runtime.Session = { getScriptTimeZone: () => 'Europe/Paris' };
  runtime.Utilities = { formatDate: () => '18/07/2026 12:00:00 CEST' };
  runtime.Logger = { log() {} };
  runtime.LockService.getScriptLock = () => { throw new Error('diagnostic must not request ScriptLock'); };
  vm.runInContext(quotaBreakerCode, runtime);
  vm.runInContext(keysSource, runtime);
  vm.runInContext(webBreakerConstantsCode, runtime);
  vm.runInContext(webBreakerReadCode, runtime);
  vm.runInContext(webBreakerStatusCode, runtime);
  vm.runInContext(watchdogConstantsCode, runtime);
}

function loadCounter(shared) {
  const context = {
    Date,
    JSON,
    Math,
    Object,
    parseInt,
    isNaN,
    CK_get: (name) => ({
      httpDroppedTelemetry: 'CANONICAL_HTTP_DROPPED',
      webApiFailureState: 'WSCAN_BREAKER:v1',
    }[name] || name),
    // v4.16.39: the post-trip hold READ is deliberately lock-free (atomic
    // getProperty) so it stays reliable during UserLock contention; only the
    // WRITE keeps the locked discipline.
    allowUnlockedReads: true,
    PropertiesService: { getScriptProperties: () => shared.props },
    LockService: { getUserLock: () => shared.lock },
  };
  vm.createContext(context);
  vm.runInContext(counterCode, context);
  vm.runInContext(budgetCode, context);
  vm.runInContext(httpModeCode, context);
  return context;
}

{
  const shared = makeShared();
  const first = loadCounter(shared);
  const second = loadCounter(shared);
  const third = loadCounter(shared);

  first.HttpCounter.record(1, 'WEB_SCAN', 'https://api-production-b5bf.up.railway.app/api/gsheet/scan');
  second.HttpCounter.record(1, 'QUOTA_PROBE', 'https://httpbin.org/status/200');
  assert.equal(third.HttpCounter.count(), 2, 'fresh reload under UserLock preserves both increments');
  assert.deepEqual(JSON.parse(JSON.stringify(third.HttpCounter.byTrigger())), { WEB_SCAN: 1, QUOTA_PROBE: 1 });
  assert.equal(third.HttpCounter.byHost()['api-production-b5bf.up.railway.app'], 1);
  assert.equal(third.HttpCounter.byHost()['httpbin.org'], 1);

  shared.values.set('WCORE_CURRENT_TRIGGER', 'WATCHDOG_FROM_RECAP');
  first.HttpCounter.record(1, 'WEB_SCAN', 'https://api-production-b5bf.up.railway.app/api/gsheet/scan');
  first.HttpCounter.record(1, null, 'https://legacy.example/test');
  assert.equal(third.HttpCounter.byTrigger().WEB_SCAN, 2, 'explicit category overrides mutable trigger context');
  assert.equal(third.HttpCounter.byTrigger()['approx:WATCHDOG_FROM_RECAP'], 1, 'legacy attribution is marked approximate');

  shared.lock.available = false;
  assert.doesNotThrow(() => first.HttpCounter.record(1, 'WEB_SCAN', 'https://ignored.example/test'), 'telemetry contention never suppresses HTTP');
  // v4.16.38: contention now RETAINS the increment in the execution-local buffer
  // instead of reclassifying it as permanently-dropped telemetry. Persisted so
  // far: first 2 + second 1; retained: 1.
  assert.equal(first.HttpCounter.dropped(), 0, 'contended telemetry is retained, not dropped');
  assert.equal(first.HttpCounter.count(), 5, 'retained increments remain visible to rolling reads before flush');
  // Under contention the persisted maps are unreadable (as before v4.16.38), so
  // byTrigger/byHost expose only the retained contributions until the next flush.
  assert.deepEqual(JSON.parse(JSON.stringify(first.HttpCounter.byTrigger())), {
    WEB_SCAN: 1,
  }, 'retained explicit-category increments stay visible under contention');
  assert.deepEqual(JSON.parse(JSON.stringify(first.HttpCounter.byHost())), {
    'ignored.example': 1,
  }, 'retained host contributions stay visible under contention');
  shared.lock.available = true;
  first.HttpCounter.record(1, 'WEB_SCAN', 'https://api-production-b5bf.up.railway.app/api/gsheet/scan');
  assert.equal(first.HttpCounter.dropped(), 0, 'retained increments persist on the next successful record without becoming dropped');
  assert.equal(third.HttpCounter.count(), 6, 'the next successful record merges retained increments into the persisted count');
  assert.equal(third.HttpCounter.byTrigger().WEB_SCAN, 4, 'retained increments persist under their original category');
  assert.equal(third.HttpCounter.dropped(), 0, 'no dropped telemetry: contention retains instead of dropping');

  {
    // v4.16.38: explicit flush() drains retained increments even without a record.
    const sharedFlush = makeShared();
    const a = loadCounter(sharedFlush);
    const b = loadCounter(sharedFlush);
    sharedFlush.lock.available = false;
    a.HttpCounter.record(2, 'QUOTA_PROBE', 'https://httpbin.org/status/200');
    assert.equal(a.HttpCounter.count(), 2, 'retained increments are counted in-memory before flush');
    sharedFlush.lock.available = true;
    assert.equal(a.HttpCounter.flush(), true, 'flush() reports success when the lock frees');
    assert.equal(b.HttpCounter.count(), 2, 'flush() persists retained increments to the shared properties');
    assert.equal(a.HttpCounter.count(), 2, 'retained buffer is cleared after a successful flush');
  }

  {
    // v4.16.38: reset() clears the retained buffer — stale memory must never
    // resurrect deleted counters.
    const sharedReset = makeShared();
    const a = loadCounter(sharedReset);
    const b = loadCounter(sharedReset);
    sharedReset.lock.available = false;
    a.HttpCounter.record(5, 'WEB_SCAN', 'https://api.example.test/scan');
    sharedReset.lock.available = true;
    assert.equal(a.HttpCounter.reset(), true, 'reset succeeds when the lock is available');
    assert.equal(a.HttpCounter.count(), 0, 'reset clears the retained buffer');
    assert.equal(b.HttpCounter.count(), 0, 'reset clears persisted buckets');
    assert.equal(a.HttpCounter.snapshot().total, 0, 'snapshot shows a fully reset counter');
  }

  {
    // v4.16.38: noteDropped() from the legacy counter still persists on the next
    // successful record, separately from retained increments.
    const sharedDropped = makeShared();
    const a = loadCounter(sharedDropped);
    const b = loadCounter(sharedDropped);
    a.HttpCounter.noteDropped(3);
    assert.equal(a.HttpCounter.dropped(), 3, 'noted drops are visible in memory before persistence');
    a.HttpCounter.record(1, 'WEB_SCAN', 'https://api.example.test/scan');
    assert.equal(b.HttpCounter.dropped(), 3, 'the next successful record persists noted drops');
    assert.ok(sharedDropped.values.has('CANONICAL_HTTP_DROPPED'), 'dropped telemetry uses the canonical key');
  }

}

{
  const shared = makeShared({ allowUnlockedReads: true });
  const bucket = String(Math.floor(Date.now() / (60 * 60 * 1000)));
  shared.values.set('WCORE_HTTP_BUCKETS_v1', JSON.stringify({ [bucket]: 37 }));
  shared.lock.available = false;
  const runtime = loadCounter(shared);

  assert.equal(runtime.HttpCounter.count(), 37, 'a cold runtime reads the persisted non-saturated snapshot when UserLock is unavailable');
  assert.equal(runtime.HttpCounter.isDegraded(), true, 'a cold unlocked snapshot is explicitly marked degraded');
  assert.equal(shared.reads.unlocked, 1, 'the cold fallback performs the intended read-only snapshot read outside UserLock');
  assert.equal(runtime.BudgetHTTP.allow('balance'), true, 'a cold non-saturated snapshot does not deny on-chain HTTP');
  assert.notEqual(runtime.WcoreHttpMode.getEffectiveMode(), 'CACHE_ONLY', 'a cold non-saturated snapshot does not force CACHE_ONLY');
  assert.deepEqual(shared.writes, { set: 0, delete: 0 }, 'the unlocked cold fallback remains read-only');
}

{
  const shared = makeShared({ allowUnlockedReads: true });
  const bucket = String(Math.floor(Date.now() / (60 * 60 * 1000)));
  shared.values.set('WCORE_HTTP_BUCKETS_v1', JSON.stringify({ [bucket]: 20000 }));
  shared.lock.available = false;
  const runtime = loadCounter(shared);

  assert.equal(runtime.HttpCounter.count(), 20000, 'a cold runtime preserves a real saturated persisted snapshot');
  assert.equal(runtime.HttpCounter.isDegraded(), true, 'a cold saturated unlocked snapshot is explicitly marked degraded');
  assert.equal(shared.reads.unlocked, 1, 'the saturated cold fallback reads the persisted snapshot outside UserLock');
  assert.equal(runtime.BudgetHTTP.allow('balance'), false, 'a cold real saturated snapshot still denies on-chain HTTP');
  assert.equal(runtime.WcoreHttpMode.getEffectiveMode(), 'CACHE_ONLY', 'a cold real saturated snapshot still forces CACHE_ONLY');
  assert.deepEqual(shared.writes, { set: 0, delete: 0 }, 'the saturated cold fallback remains read-only');
}

{
  const shared = makeShared();
  const runtime = loadCounter(shared);
  const bucket = String(Math.floor(Date.now() / (60 * 60 * 1000)));
  shared.values.set('WCORE_HTTP_BUCKETS_v1', JSON.stringify({ [bucket]: 37 }));

  assert.equal(runtime.HttpCounter.count(), 37, 'a valid rolling count seeds the conservative fallback');

  shared.lock.available = false;
  assert.equal(runtime.HttpCounter.count(), 37, 'lock contention reuses the last valid count instead of fabricating the quota ceiling');
  assert.equal(runtime.HttpCounter.isDegraded(), true, 'lock contention explicitly marks telemetry degraded');
  assert.equal(runtime.BudgetHTTP.allow('balance'), true, 'telemetry lock contention does not deny on-chain HTTP');
  assert.notEqual(runtime.WcoreHttpMode.getEffectiveMode(), 'CACHE_ONLY', 'telemetry lock contention does not force CACHE_ONLY');

  shared.lock.available = true;
  shared.failGetOnce.add('WCORE_HTTP_BUCKETS_v1');
  assert.equal(runtime.HttpCounter.count(), 37, 'property failure reuses the last valid count instead of fabricating the quota ceiling');
  assert.equal(runtime.HttpCounter.isDegraded(), true, 'property failure explicitly marks telemetry degraded');
  shared.failGetOnce.add('WCORE_HTTP_BUCKETS_v1');
  assert.equal(runtime.BudgetHTTP.allow('balance'), true, 'a temporary property read failure does not deny on-chain HTTP');
  assert.notEqual(runtime.WcoreHttpMode.getEffectiveMode(), 'CACHE_ONLY', 'a temporary property read failure does not force CACHE_ONLY');
}

{
  const shared = makeShared();
  const runtime = loadCounter(shared);
  const bucket = String(Math.floor(Date.now() / (60 * 60 * 1000)));
  shared.values.set('WCORE_HTTP_BUCKETS_v1', JSON.stringify({ [bucket]: 20000 }));

  assert.equal(runtime.HttpCounter.count(), 20000, 'a real saturated measurement remains visible');
  assert.equal(runtime.HttpCounter.isDegraded(), false, 'a real saturated measurement is not marked degraded');
  assert.equal(runtime.BudgetHTTP.allow('balance'), false, 'a real saturated measurement still denies on-chain HTTP');
  assert.equal(runtime.WcoreHttpMode.getEffectiveMode(), 'CACHE_ONLY', 'a real saturated measurement still forces CACHE_ONLY');
}

{
  const runtime = loadCounter(makeShared());
  runtime.HttpCounter.count = () => { throw new Error('telemetry unavailable'); };

  assert.equal(runtime.BudgetHTTP.used(), 0, 'BudgetHTTP never converts a telemetry exception into a saturated measurement');
  assert.equal(runtime.BudgetHTTP.allow('balance'), true, 'a telemetry API exception does not deny on-chain HTTP');
  assert.notEqual(runtime.WcoreHttpMode.getEffectiveMode(), 'CACHE_ONLY', 'a telemetry API exception does not force CACHE_ONLY');
  assert.equal(runtime.BudgetHTTP.status().telemetryDegraded, true, 'BudgetHTTP explicitly reports a telemetry API exception');
}

{
  const shared = makeShared();
  const first = loadCounter(shared);
  const second = loadCounter(shared);
  first.HttpCounter.record(1, 'WEB_SCAN', 'https://api.example.test/one');
  second.HttpCounter.record(1, 'QUOTA_PROBE', 'https://httpbin.org/status/200');
  shared.lock.tryLockCalls = 0;
  const snapshot = JSON.parse(JSON.stringify(first.HttpCounter.snapshot()));
  assert.deepEqual(snapshot, {
    available: true,
    total: 2,
    categories: { WEB_SCAN: 1, QUOTA_PROBE: 1 },
    hosts: { 'api.example.test': 1, 'httpbin.org': 1 },
    dropped: 0,
  });
  assert.equal(shared.lock.tryLockCalls, 1, 'snapshot acquires one coherent short UserLock');

  first.HttpCounter.noteDropped(2);
  shared.lock.available = false;
  assert.deepEqual(JSON.parse(JSON.stringify(first.HttpCounter.snapshot())), {
    available: false,
    total: 2,
    categories: {},
    hosts: {},
    dropped: 2,
  }, 'snapshot fails closed and explicitly reports lock contention');
}

{
  const shared = makeShared();
  const runtime = loadCounter(shared);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.HttpCounter.snapshot())), {
    available: true,
    total: 0,
    categories: {},
    hosts: {},
    dropped: 0,
  }, 'missing telemetry properties are a valid empty snapshot');
  assert.deepEqual(shared.writes, { set: 0, delete: 0 }, 'empty snapshot remains read-only');
}

for (const key of ['WCORE_HTTP_BUCKETS_v1', 'CANONICAL_HTTP_DROPPED']) {
  for (const badCase of [
    { value: '{malformed', kind: 'malformed' },
    { value: '42', kind: 'non-object' },
    { value: '[]', kind: 'array' },
  ]) {
    const badValue = badCase.value;
    const shared = makeShared();
    shared.values.set(key, badValue);
    const runtime = loadCounter(shared);
    assert.deepEqual(JSON.parse(JSON.stringify(runtime.HttpCounter.snapshot())), {
      available: false,
      corrupt: true,
      total: 0,
      categories: {},
      hosts: {},
      dropped: 0,
    }, `${key} present ${badCase.kind} JSON fails closed`);
    assert.equal(shared.values.get(key), badValue, 'snapshot must not repair corrupt telemetry');
    assert.deepEqual(shared.writes, { set: 0, delete: 0 }, 'corrupt snapshot must not write or delete properties');
  }
}

for (const key of ['WCORE_HTTP_TRIGGERS_v2', 'WCORE_HTTP_HOSTS_v1']) {
  for (const badCase of [
    { value: '{malformed', kind: 'malformed' },
    { value: '42', kind: 'non-object' },
    { value: '[]', kind: 'array' },
  ]) {
    const badValue = badCase.value;
    const shared = makeShared();
    shared.values.set(key, badValue);
    const runtime = loadCounter(shared);
    assert.deepEqual(JSON.parse(JSON.stringify(runtime.HttpCounter.snapshot())), {
      available: true,
      corrupt: true,
      total: 0,
      categories: {},
      hosts: {},
      dropped: 0,
    }, `${key} present ${badCase.kind} JSON keeps the authoritative total and reports the repaired breakdown`);
    assert.equal(shared.values.get(key), badValue, 'snapshot must not repair corrupt telemetry');
    assert.deepEqual(shared.writes, { set: 0, delete: 0 }, 'corrupt snapshot must not write or delete properties');
  }
}

{
  const shared = makeShared();
  const runtime = loadCounter(shared);
  shared.failGetOnce.add('WCORE_HTTP_HOSTS_v1');
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.HttpCounter.snapshot())), {
    available: false,
    total: 0,
    categories: {},
    hosts: {},
    dropped: 0,
  }, 'snapshot fails closed without exposing a partially read state');
}

{
  const shared = makeShared();
  shared.values.set('WCORE_HTTP_TRIGGERS_v2', '{malformed');
  shared.values.set('WCORE_HTTP_HOSTS_v1', '{malformed');
  shared.values.set('CANONICAL_HTTP_DROPPED', '{malformed');
  const runtime = loadCounter(shared);

  runtime.HttpCounter.record(1, 'WEB_SCAN', 'https://api.example.test/scan');
  assert.equal(runtime.HttpCounter.count(), 1, 'malformed auxiliary maps do not prevent the main increment');
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.HttpCounter.byTrigger())), { WEB_SCAN: 1 }, 'malformed category map is reset independently');
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.HttpCounter.byHost())), { 'api.example.test': 1 }, 'malformed host map is reset independently');
  assert.doesNotThrow(() => JSON.parse(shared.values.get('CANONICAL_HTTP_DROPPED')), 'malformed dropped map is repaired independently');
}

{
  const shared = makeShared();
  const runtime = loadCounter(shared);
  vm.runInContext(resetHttpCounterCode, runtime);

  shared.lock.available = false;
  assert.equal(runtime.HttpCounter.reset(), false, 'reset reports UserLock contention');
  assert.match(runtime.RESET_HTTP_COUNTER(true), /failed/i, 'diagnostic reports reset contention instead of success');

  shared.lock.available = true;
  shared.failDeleteOnce.add('WCORE_HTTP_BUCKETS_v1');
  assert.equal(runtime.HttpCounter.reset(), false, 'reset reports property deletion failure');
  assert.match(runtime.RESET_HTTP_COUNTER(true), /reset OK/i, 'diagnostic reports success only after all counter keys are deleted');
}

{
  const shared = makeShared();
  const runtime = loadCounter(shared);
  const now = Date.now();
  const cacheValues = new Map([
    ['WCORE_QUOTA_EXHAUSTED_v1', JSON.stringify({ time: new Date(now - 1000).toISOString(), trippedMs: now - 1000 })],
  ]);
  let removes = 0;
  installDiagnosticDependencies(runtime, {
    get: (key) => cacheValues.has(key) ? cacheValues.get(key) : null,
    put() { throw new Error('peek cache write'); },
    remove() { removes++; },
  });
  const status = JSON.parse(JSON.stringify(runtime.QuotaCircuitBreaker.peekStatus()));
  assert.equal(status.tripped, true);
  assert.equal(status.unavailable, false);
  assert.equal(removes, 0, 'peek must not clear cache state');
  assert.equal(runtime.QuotaCircuitBreaker.peekStatus().trippedMs, now - 1000, 'peek must not depend on mutable in-memory breaker state');

  cacheValues.set('WCORE_QUOTA_EXHAUSTED_v1', JSON.stringify({ time: new Date(now - 90000000).toISOString(), trippedMs: now - 90000000 }));
  assert.equal(runtime.QuotaCircuitBreaker.peekStatus().tripped, false, 'expired cache is reported without being removed');
  assert.equal(removes, 0, 'expired peek remains mutation-free');

  cacheValues.set('WCORE_QUOTA_EXHAUSTED_v1', '{}');
  const malformed = runtime.QuotaCircuitBreaker.peekStatus();
  assert.equal(malformed.tripped, true, 'structurally invalid breaker cache fails closed');
  assert.equal(malformed.unavailable, true, 'structurally invalid breaker cache is explicitly unavailable');

  runtime.CacheService.getScriptCache = () => { throw new Error('cache unavailable'); };
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.QuotaCircuitBreaker.peekStatus())), {
    tripped: true,
    tripTime: null,
    trippedMs: null,
    trippedLocal: null,
    maxClearAt: null,
    maxClearAtLocal: null,
    date: new Date().toISOString().split('T')[0],
    message: 'UNAVAILABLE - quota breaker cache unreadable; HTTP must remain blocked',
    unavailable: true,
  }, 'peek cache failure is explicit and fail-closed');
}

{
  const shared = makeShared();
  const runtime = loadCounter(shared);
  runtime.HttpCounter.record(1, 'WEB_SCAN', 'https://api-production-b5bf.up.railway.app/api/gsheet/scan');
  runtime.HttpCounter.record(1, 'QUOTA_PROBE', 'https://httpbin.org/status/200');
  runtime.HttpCounter.noteDropped(1);
  const cacheValues = new Map([
    ['WSCAN_BREAKER:v1', JSON.stringify({ failures: [Date.now() - 2, Date.now() - 1], openUntil: Date.now() + 60000 })],
  ]);
  var googleCacheUnavailable = false;
  var webCacheUnavailable = false;
  const cache = {
    get: (key) => {
      if (googleCacheUnavailable && key === 'WCORE_QUOTA_EXHAUSTED_v1') throw new Error('google breaker cache unavailable');
      if (webCacheUnavailable && key === 'WSCAN_BREAKER:v1') throw new Error('web breaker cache unavailable');
      return cacheValues.has(key) ? cacheValues.get(key) : null;
    },
    put() { throw new Error('diagnostic cache write'); },
    remove() { throw new Error('diagnostic cache remove'); },
  };
  installDiagnosticDependencies(runtime, cache);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime._webScanBreakerStatus_())), {
    open: true,
    openUntil: JSON.parse(cacheValues.get('WSCAN_BREAKER:v1')).openUntil,
    failures: 2,
  }, 'integration uses the extracted Web breaker parser and threshold');
  vm.runInContext(quotaProtectionStatusCode, runtime);

  shared.lock.tryLockCalls = 0;
  const rows = JSON.parse(JSON.stringify(runtime.GET_QUOTA_PROTECTION_STATUS('refresh-1')));
  assert.deepEqual(rows, [
    ['Observed rolling 24h calls', 2],
    ['Category QUOTA_PROBE', 1],
    ['Category WEB_SCAN', 1],
    ['Host api-production-b5bf.up.railway.app', 1],
    ['Host httpbin.org', 1],
    ['Dropped telemetry updates', 1],
    ['Google breaker status', 'OK'],
    ['Web breaker status', 'OPEN'],
    ['Watchdog cadence minutes', 10],
      ['Watchdog pulse cap', 10],
    ['Healthy freshness hours', 5],
    ['Web error backoff', '30m,2h,6h,24h'],
    ['Scope', 'WCORE project only'],
    ['Authority', 'Observed counts are not the authoritative Google account quota'],
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.GET_QUOTA_PROTECTION_STATUS('refresh-2'))), rows,
    'caller-supplied refresh token changes recalculation dependencies, not diagnostic output');
  assert.equal(shared.lock.tryLockCalls, 2, 'each diagnostic invocation acquires exactly one UserLock');

  shared.lock.available = false;
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.GET_QUOTA_PROTECTION_STATUS('refresh-snapshot'))).slice(-1), [[
    'Warning telemetry snapshot',
    'UNAVAILABLE - displayed count is a non-authoritative safe fallback',
  ]]);
  shared.lock.available = true;

  const savedHosts = shared.values.get('WCORE_HTTP_HOSTS_v1');
  shared.values.set('WCORE_HTTP_HOSTS_v1', '{malformed');
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.GET_QUOTA_PROTECTION_STATUS('refresh-corrupt'))).slice(-1), [[
    'Warning telemetry snapshot',
    'CORRUPT - displayed count is a non-authoritative safe fallback',
  ]]);
  assert.equal(shared.values.get('WCORE_HTTP_HOSTS_v1'), '{malformed', 'diagnostic must not repair corrupt telemetry');
  shared.values.set('WCORE_HTTP_HOSTS_v1', savedHosts);

  googleCacheUnavailable = true;
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.GET_QUOTA_PROTECTION_STATUS('refresh-google'))).slice(-1), [[
    'Warning Google breaker',
    'UNAVAILABLE - displayed TRIPPED is a fail-closed fallback, not an observed authoritative value',
  ]]);
  googleCacheUnavailable = false;

  webCacheUnavailable = true;
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.GET_QUOTA_PROTECTION_STATUS('refresh-web'))).slice(-1), [[
    'Warning Web breaker',
    'UNAVAILABLE - displayed OPEN is a fail-closed fallback, not an observed authoritative value',
  ]]);
  webCacheUnavailable = false;

  var missingRefreshWarning = [[
    'Warning refresh token',
    'Pass a changing cell as refreshToken to refresh this diagnostic',
  ]];
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.GET_QUOTA_PROTECTION_STATUS())).slice(-1), missingRefreshWarning);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.GET_QUOTA_PROTECTION_STATUS(null))).slice(-1), missingRefreshWarning);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.GET_QUOTA_PROTECTION_STATUS(''))).slice(-1), missingRefreshWarning);
}

assert.match(quotaProtectionStatusCode, /function\s+GET_QUOTA_PROTECTION_STATUS\s*\(refreshToken\)/);
const quotaProtectionStatusBody = quotaProtectionStatusCode.replace(/^function\s+GET_QUOTA_PROTECTION_STATUS\s*\(refreshToken\)/, '');
assert.doesNotMatch(quotaProtectionStatusBody, /(?:String|Number|Boolean|JSON\.stringify)\s*\(\s*refreshToken|refreshToken\s*\.|\b(?!(?:if|while|for|switch)\b)[A-Za-z_$][\w$]*\s*\(\s*refreshToken/,
  'refresh token may be checked for presence but must not be evaluated or passed onward');
assert.match(quotaProtectionStatusCode, /HttpCounter\.snapshot\(\)/);
assert.match(quotaProtectionStatusCode, /QuotaCircuitBreaker\.peekStatus\(\)/);
assert.doesNotMatch(quotaProtectionStatusCode, /HttpCounter\.(?:count|byTrigger|byHost|dropped)\(|QuotaCircuitBreaker\.(?:getStatus|isTripped)\(/);
const readOnlyCallGraph = [
  quotaProtectionStatusCode,
  extractMethod(quotaSource, 'snapshot'),
  extractFunction(quotaSource, '_snapshotLoadRaw'),
  extractFunction(quotaSource, '_readLocked'),
  extractFunction(quotaSource, '_loadRaw'),
  extractFunction(quotaSource, '_purge'),
  extractFunction(quotaSource, '_sum'),
  extractFunction(quotaSource, '_flatten'),
  extractMethod(quotaSource, 'peekStatus'),
  extractFunction(quotaSource, '_getTodayUTC'),
  extractFunction(quotaSource, '_fmtLocal'),
  webBreakerStatusCode,
  webBreakerReadCode,
].join('\n');
assert.doesNotMatch(extractMethod(quotaSource, 'snapshot'), /_loadRaw\(/,
  'snapshot must not use the repairing telemetry parser');
assert.doesNotMatch(readOnlyCallGraph, /UrlFetchApp|_originalUrlFetch|\.testOnce\(|\.reset\(|\.put\(|\.remove\(|setProperty\(|deleteProperty\(|WalletCache\.save|ScriptApp\.newTrigger/,
  'quota protection status must remain read-only and network-free');

{
  const url = 'https://User:Pass@API.Example.COM:8443/path?q=1#fragment';
  const rollingShared = makeShared();
  const rolling = loadCounter(rollingShared);
  rolling.HttpCounter.record(1, 'WEB_SCAN', url);
  assert.deepEqual(JSON.parse(JSON.stringify(rolling.HttpCounter.byHost())), { 'api.example.com': 1 }, 'rolling host excludes userinfo, port, query, and fragment');

  const legacyShared = makeShared();
  const legacy = loadLegacyCounter(legacyShared, []);
  legacy.HttpCallCounter.increment(url, 'WEB_SCAN');
  legacy.HttpCallCounter.flush();
  assert.deepEqual(JSON.parse(legacyShared.values.get('WCORE_HTTP_HOST_1969-12-31')), { 'api.example.com': 1 }, 'legacy host uses the same canonical lowercase hostname');
}

function loadLegacyCounter(shared, droppedCalls) {
  class FakeDate extends Date {
    static now() { return 1000; }
  }
  const context = {
    Date: FakeDate,
    JSON,
    Math,
    Object,
    parseInt,
    isFinite,
    PropertiesService: { getScriptProperties: () => shared.props },
    LockService: { getUserLock: () => shared.lock },
    HttpCounter: { count: () => 0, noteDropped: () => droppedCalls.push('dropped') },
  };
  vm.createContext(context);
  vm.runInContext(legacyCode, context);
  return context;
}

{
  const shared = makeShared();
  const droppedCalls = [];
  const first = loadLegacyCounter(shared, droppedCalls);
  const second = loadLegacyCounter(shared, droppedCalls);
  const dayKey = 'WCORE_HTTP_DAY_1969-12-31';

  first.HttpCallCounter.increment('https://api.example.test/one', 'WEB_SCAN');
  shared.values.set(dayKey, '7');
  first.HttpCallCounter.flush();
  assert.equal(shared.values.get(dayKey), '8', 'flush reloads the fresh persistent count after acquiring UserLock');

  second.HttpCallCounter.increment('https://httpbin.org/status/200', 'QUOTA_PROBE');
  shared.lock.available = false;
  second.HttpCallCounter.flush();
  assert.equal(shared.values.get(dayKey), '8', 'lock contention does not mutate persistent state');
  assert.equal(droppedCalls.length, 1, 'lock contention is reported to the shared dropped counter');
  shared.lock.available = true;
  second.HttpCallCounter.flush();
  assert.equal(shared.values.get(dayKey), '9', 'buffer is retained and merged on a later flush');
}

{
  const shared = makeShared();
  const legacy = loadLegacyCounter(shared, []);
  const day = '1969-12-31';
  const dayKey = `WCORE_HTTP_DAY_${day}`;
  const hostKey = `WCORE_HTTP_HOST_${day}`;
  const triggerKey = `WCORE_HTTP_TRIGGER_${day}`;

  legacy.HttpCallCounter.increment('https://api.example.test/one', 'WEB_SCAN');
  shared.failGetOnce.add(`WCORE_HTTP_T0_${day}`);
  legacy.HttpCallCounter.flush();
  assert.equal(shared.values.get(dayKey), '1', 'global count persists before a later T0 failure');
  assert.equal(shared.values.has(hostKey), false, 'unsaved host buffer remains pending after partial failure');
  assert.equal(shared.values.has(triggerKey), false, 'unsaved category buffer remains pending after partial failure');

  legacy.HttpCallCounter.flush();
  assert.equal(shared.values.get(dayKey), '1', 'retry after partial failure must not recount the persisted global buffer');
  assert.deepEqual(JSON.parse(shared.values.get(hostKey)), { 'api.example.test': 1 }, 'retry persists the retained host buffer once');
  assert.deepEqual(JSON.parse(shared.values.get(triggerKey)), { WEB_SCAN: 1 }, 'retry persists the retained category buffer once');
}

{
  const shared = makeShared();
  const legacy = loadLegacyCounter(shared, []);
  const day = '1969-12-31';
  const milestoneKey = `WCORE_HTTP_MILE_${day}`;
  shared.values.set(milestoneKey, '{malformed');

  legacy.HttpCallCounter.increment('https://api.example.test/one', 'WEB_SCAN');
  legacy.HttpCallCounter.flush();

  assert.doesNotThrow(() => JSON.parse(shared.values.get(milestoneKey)), 'malformed milestone map is repaired');
  assert.deepEqual(JSON.parse(shared.values.get(milestoneKey)), {}, 'repaired milestone map is empty below the first threshold');
  assert.deepEqual(JSON.parse(shared.values.get(`WCORE_HTTP_HOST_${day}`)), { 'api.example.test': 1 }, 'milestone corruption does not wedge the host buffer');
  assert.deepEqual(JSON.parse(shared.values.get(`WCORE_HTTP_TRIGGER_${day}`)), { WEB_SCAN: 1 }, 'milestone corruption does not wedge the category buffer');
}

{
  const shared = makeShared();
  const legacy = loadLegacyCounter(shared, []);
  const day = '1969-12-31';
  const hostKey = `WCORE_HTTP_HOST_${day}`;
  const triggerKey = `WCORE_HTTP_TRIGGER_${day}`;
  shared.values.set(hostKey, '{malformed');

  legacy.HttpCallCounter.increment('https://api.example.test/one', 'WEB_SCAN');
  legacy.HttpCallCounter.flush();
  assert.doesNotThrow(() => JSON.parse(shared.values.get(hostKey)), 'malformed host map is repaired');
  assert.deepEqual(JSON.parse(shared.values.get(hostKey)), { 'api.example.test': 1 }, 'malformed host map is repaired with the pending host buffer');
  assert.deepEqual(JSON.parse(shared.values.get(triggerKey)), { WEB_SCAN: 1 }, 'host corruption does not wedge the category buffer');

  legacy.HttpCallCounter.increment('https://api.example.test/two', 'WEB_SCAN');
  legacy.HttpCallCounter.flush();
  assert.deepEqual(JSON.parse(shared.values.get(hostKey)), { 'api.example.test': 2 }, 'repaired host map accepts future merges');
  assert.deepEqual(JSON.parse(shared.values.get(triggerKey)), { WEB_SCAN: 2 }, 'unaffected category buffer is neither lost nor duplicated');
}

{
  const shared = makeShared();
  const legacy = loadLegacyCounter(shared, []);
  const day = '1969-12-31';
  const dayKey = `WCORE_HTTP_DAY_${day}`;
  const hostKey = `WCORE_HTTP_HOST_${day}`;
  const triggerKey = `WCORE_HTTP_TRIGGER_${day}`;
  shared.values.set(triggerKey, '{malformed');

  legacy.HttpCallCounter.increment('https://api.example.test/one', 'WEB_SCAN');
  legacy.HttpCallCounter.flush();
  assert.equal(shared.values.get(dayKey), '1', 'trigger corruption does not recount or lose the global buffer');
  assert.deepEqual(JSON.parse(shared.values.get(hostKey)), { 'api.example.test': 1 }, 'trigger corruption does not wedge the host buffer');
  assert.doesNotThrow(() => JSON.parse(shared.values.get(triggerKey)), 'malformed trigger map is repaired');
  assert.deepEqual(JSON.parse(shared.values.get(triggerKey)), { WEB_SCAN: 1 }, 'pending category is merged into the repaired trigger map');

  legacy.HttpCallCounter.increment('https://api.example.test/two', 'WEB_SCAN');
  legacy.HttpCallCounter.flush();
  assert.equal(shared.values.get(dayKey), '2', 'future global buffers merge once after trigger repair');
  assert.deepEqual(JSON.parse(shared.values.get(hostKey)), { 'api.example.test': 2 }, 'future host buffers merge once after trigger repair');
  assert.deepEqual(JSON.parse(shared.values.get(triggerKey)), { WEB_SCAN: 2 }, 'repaired trigger map accepts future category merges');
}

function runRecoveryProbe(originalFetch) {
  const calls = { rolling: 0, legacy: 0, raw: 0, patched: 0 };
  const patchedFetch = () => {
    calls.patched++;
    return { getResponseCode: () => 200 };
  };
  patchedFetch._quotaBreakerPatched = true;
  const context = {
    UrlFetchApp: { fetch: patchedFetch },
    HttpCounter: { record: () => { calls.rolling++; } },
    HttpCallCounter: { increment: () => { calls.legacy++; } },
  };
  if (originalFetch) context._originalUrlFetch = () => {
    calls.raw++;
    return { getResponseCode: () => 200 };
  };
  vm.createContext(context);
  vm.runInContext(`${telemetryTransportCode}\n${extractFunction(refreshSource, '_recoveryProbeQuota_')}`, context);
  return { result: context._recoveryProbeQuota_(), calls };
}

{
  const raw = runRecoveryProbe(true);
  assert.equal(raw.result.ok, true);
  assert.deepEqual(raw.calls, { rolling: 1, legacy: 1, raw: 1, patched: 0 }, 'raw bypass is explicitly counted once by both counters');

  const fallback = runRecoveryProbe(false);
  assert.equal(fallback.result.ok, true);
  assert.deepEqual(fallback.calls, { rolling: 0, legacy: 0, raw: 0, patched: 1 }, 'patched fallback transport is not explicitly double counted');
}

const webWallet = extractFunction(webSource, '_webScanWallet_');
assert.doesNotMatch(webWallet, /HttpCallCounter\.setTrigger/, 'web adapter must not mutate global trigger attribution');
assert.match(webWallet, /transport\.explicitTelemetry[\s\S]*HttpCounter\.record\(1,\s*["']WEB_SCAN["'],\s*baseUrl\s*\+\s*["']\/api\/gsheet\/scan["']\)[\s\S]*HttpCallCounter\.increment\(baseUrl\s*\+\s*["']\/api\/gsheet\/scan["'],\s*["']WEB_SCAN["']\)[\s\S]*transport\.fetch\.call/,
  'each bypassed web fetch is explicitly counted by both counters immediately before the attempt');

const recoveryProbe = extractFunction(refreshSource, '_recoveryProbeQuota_');
assert.match(quotaSource, /transport\.explicitTelemetry[\s\S]*HttpCounter\.record\(1,\s*["']QUOTA_PROBE["'],\s*testUrl\)[\s\S]*HttpCallCounter\.increment\(testUrl,\s*["']QUOTA_PROBE["']\)[\s\S]*transport\.fetch\.call/,
  'quota breaker exact probe path is explicitly counted by both counters');
assert.match(recoveryProbe, /transport\.explicitTelemetry[\s\S]*HttpCounter\.record\(1,\s*["']QUOTA_PROBE["'],\s*probeUrl\)[\s\S]*HttpCallCounter\.increment\(probeUrl,\s*["']QUOTA_PROBE["']\)[\s\S]*transport\.fetch\.call/,
  'quota recovery exact probe path is explicitly counted by both counters');
// v4.16.39 — post-trip scan hold (piste 2, anti-récurrence BLOCKED:QUOTA).
// Google's UrlFetch quota is user-scoped: other scripts on the account consume
// the same 20k window, so WCORE's observed count is a lower bound and cannot be
// the only admission signal. An authoritative Google trip ("Service invoked too
// many times") is the ONLY proof the account window is really exhausted. After
// such a trip, QUOTA_RECOVERY_SWEEP resets the breaker as soon as httpbin passes
// and re-pulses every blocked sheet — the resulting wave re-exhausts the sliding
// window and re-trips immediately (observed 2026-09-09: 4 trips in 2h).
// The hold defers AUTO web scans (the dominant consumer) to cached output for 3h
// so the sliding window can refill. It is ADVISORY: budgets and modes are left
// untouched (see the CRITICAL INVARIANT below for why clamping would have
// blocked the portfolios through the generic 26B patch).
{
  const shared = makeShared(FLOOR_UNLOCKED);
  const runtime = loadCounter(shared);
  const TRIP_FLOOR_KEY = 'WCORE_HTTP_TRIP_FLOOR_UNTIL_v1';

  assert.equal(typeof runtime.BudgetHTTP.noteAuthoritativeTrip, 'function',
    'BudgetHTTP must expose the authoritative-trip hook the breaker calls on a real Google trip');

  assert.equal(runtime.BudgetHTTP.remaining(), 20000, 'no floor armed: the full budget is available');
  assert.equal(runtime.WcoreHttpMode.getEffectiveMode(), 'NORMAL', 'no floor armed: WCORE runs in NORMAL mode');

  runtime.BudgetHTTP.noteAuthoritativeTrip(Date.now());

  const floorRaw = shared.values.get(TRIP_FLOOR_KEY);
  assert.ok(floorRaw, 'an authoritative trip persists the floor deadline so it survives the execution');
  const floorUntil = parseInt(floorRaw, 10);
  assert.ok(Math.abs(floorUntil - (Date.now() + 3 * 60 * 60 * 1000)) < 5000,
    'the post-trip floor lasts exactly 3h after the authoritative trip');

  const status = JSON.parse(JSON.stringify(runtime.BudgetHTTP.status()));
  assert.equal(status.tripFloorActive, true, 'status reports the active post-trip floor');
  assert.equal(status.tripFloorUntil, floorUntil, 'status exposes the floor deadline for diagnostics');

  // CRITICAL INVARIANT (QA finding, 2026-09-10): the floor must NOT change the
  // global HTTP mode. Every UrlFetchApp.fetch goes through the generic
  // 26B_HTTP_SAVINGS patch, whose reason "26B.fetch" maps to category "other" —
  // which RECOVERY mode denies. Clamping remaining() would therefore have
  // blocked the Action/Crypto portfolios: exactly the failure being fixed.
  // The floor is an advisory signal read by the AUTO web-scan admission only.
  assert.equal(runtime.BudgetHTTP.remaining(), 20000,
    'the floor must NOT clamp the global budget: that would deny the portfolios through the generic 26B patch');
  assert.equal(runtime.WcoreHttpMode.getEffectiveMode(), 'NORMAL',
    'the floor must NOT force a global mode change — portfolios and balances keep their normal admission');
  assert.equal(runtime.BudgetHTTP.allow('26B.fetch'), true, 'the generic patched-fetch path stays admitted under the floor');
  assert.equal(runtime.WcoreHttpMode.isAllowed('26B.fetch'), true, 'the real portfolio call path is never denied by the floor');
}

{
  // The hold is anchored to the trip and must OUTLIVE the breaker reset — the
  // sweep resets the breaker within minutes, which is exactly when the wave used
  // to start. It is released by its own 3h expiry, by clearPostTripFloor(), or
  // by RESET_QUOTA_BREAKER(TRUE) (operator action) — NOT by the sweep's
  // automatic breaker reset, which is the whole point.
  const shared = makeShared(FLOOR_UNLOCKED);
  const runtime = loadCounter(shared);
  const TRIP_FLOOR_KEY = 'WCORE_HTTP_TRIP_FLOOR_UNTIL_v1';

  runtime.BudgetHTTP.noteAuthoritativeTrip(Date.now() - 60 * 60 * 1000); // tripped 1h ago
  assert.equal(runtime.BudgetHTTP.isPostTripFloorActive(), true, 'a 1h-old trip keeps the hold armed');

  // A fresh runtime (new execution, breaker already reset by the sweep) must
  // still observe the hold through the persisted deadline.
  const laterExecution = loadCounter(shared);
  assert.equal(laterExecution.BudgetHTTP.isPostTripFloorActive(), true,
    'a later execution reads the persisted hold: the sweep reset must not release the scan guard');

  // Once the 3h window elapses, normal scanning resumes on its own.
  shared.values.set(TRIP_FLOOR_KEY, String(Date.now() - 1000));
  const afterWindow = loadCounter(shared);
  assert.equal(afterWindow.BudgetHTTP.isPostTripFloorActive(), false, 'an elapsed hold is reported inactive');
  assert.equal(afterWindow.BudgetHTTP.remaining(), 20000, 'an elapsed hold leaves the budget untouched');

  // Corrupt / absurd deadlines must never wedge WCORE into a permanent guard.
  shared.values.set(TRIP_FLOOR_KEY, String(Date.now() + 999 * 60 * 60 * 1000));
  const corrupted = loadCounter(shared);
  assert.equal(corrupted.BudgetHTTP.isPostTripFloorActive(), false,
    'a deadline beyond the maximum hold window is treated as corrupt, not as a permanent guard');

  shared.values.set(TRIP_FLOOR_KEY, 'not-a-number');
  const garbage = loadCounter(shared);
  assert.equal(garbage.BudgetHTTP.isPostTripFloorActive(), false, 'a malformed deadline never arms the guard');
}

{
  // An operator must always be able to release the guard (clearPostTripFloor,
  // also wired into RESET_QUOTA_BREAKER(TRUE) and neutralized after a manual
  // TRIP_QUOTA_BREAKER test).
  const shared = makeShared(FLOOR_UNLOCKED);
  const runtime = loadCounter(shared);
  runtime.BudgetHTTP.noteAuthoritativeTrip(Date.now());
  assert.equal(runtime.BudgetHTTP.isPostTripFloorActive(), true, 'hold armed before the manual release');
  assert.equal(typeof runtime.BudgetHTTP.clearPostTripFloor, 'function', 'BudgetHTTP must expose a manual release');
  runtime.BudgetHTTP.clearPostTripFloor();
  assert.equal(runtime.BudgetHTTP.isPostTripFloorActive(), false, 'the manual release clears the hold immediately');
  assert.equal(shared.values.has('WCORE_HTTP_TRIP_FLOOR_UNTIL_v1'), false, 'the manual release deletes the persisted deadline');
}

{
  // A future-dated trip anchor must not extend the guard beyond the window.
  const shared = makeShared(FLOOR_UNLOCKED);
  const runtime = loadCounter(shared);
  runtime.BudgetHTTP.noteAuthoritativeTrip(Date.now() + 48 * 60 * 60 * 1000);
  const until = parseInt(shared.values.get('WCORE_HTTP_TRIP_FLOOR_UNTIL_v1'), 10);
  assert.ok(until <= Date.now() + 3 * 60 * 60 * 1000 + 5000,
    'a future-dated anchor is clamped: the guard can never exceed the 3h window');
}

{
  // A real saturated measurement is untouched: the floor is orthogonal to the
  // existing budget semantics.
  const shared = makeShared();
  const runtime = loadCounter(shared);
  const bucket = String(Math.floor(Date.now() / (60 * 60 * 1000)));
  shared.values.set('WCORE_HTTP_BUCKETS_v1', JSON.stringify({ [bucket]: 20000 }));
  runtime.BudgetHTTP.noteAuthoritativeTrip(Date.now());
  assert.equal(runtime.BudgetHTTP.used(), 20000, 'the floor never alters the observed count');
  assert.equal(runtime.WcoreHttpMode.getEffectiveMode(), 'CACHE_ONLY', 'real saturation still forces CACHE_ONLY on its own');
}

{
  // Persistence failures must never break admission: the floor is a safety
  // improvement, not a new failure mode.
  const shared = makeShared();
  const runtime = loadCounter(shared);
  shared.failSetOnce.add('WCORE_HTTP_TRIP_FLOOR_UNTIL_v1');
  assert.doesNotThrow(() => runtime.BudgetHTTP.noteAuthoritativeTrip(Date.now()),
    'a properties failure while arming the floor must never throw into the breaker trip path');
  shared.failGetOnce.add('WCORE_HTTP_TRIP_FLOOR_UNTIL_v1');
  assert.doesNotThrow(() => runtime.BudgetHTTP.remaining(), 'a properties read failure must not break budget reads');
}

// The breaker must arm the floor on every authoritative trip, next to the
// evidence ring (both are trip-time, best-effort side effects).
assert.match(quotaSource, /function\s+_trip\s*\(errorMessage\)[\s\S]*BudgetHTTP\.noteAuthoritativeTrip/,
  '_trip must arm the post-trip budget floor on every authoritative Google trip');

// The guard must act where the quota is actually burned. AUTO web scans bypass
// Http.canFetchNow entirely (they fetch through _originalUrlFetch), so the floor
// has to be consulted at web-scan admission — and only for AUTO scans: a manual
// forceFull refresh stays the operator's explicit decision.
const floorGateCode = extractFunction(webSource, '_webScanPostTripFloorDeferred_');
{
  const admission = extractFunction(webSource, '_webScanWallet_');
  assert.match(admission, /_webScanPostTripFloorDeferred_/,
    'the AUTO web-scan path must consult the post-trip floor before scanning');
  const floorGate = extractFunction(webSource, '_webScanPostTripFloorDeferred_');
  assert.match(floorGate, /_webScanForce_/,
    'a manual forceFull scan must bypass the post-trip floor');
  assert.match(floorGate, /BudgetHTTP[\s\S]*isPostTripFloorActive/,
    'the gate reads the shared post-trip floor state');
  assert.doesNotMatch(floorGate, /throw|BLOCKED:QUOTA/,
    'a floor-deferred scan degrades to cached output, it never surfaces an error');

  // Runtime check of the gate itself, not just its wiring.
  const gateContext = {
    _webScanForce_: (f) => f === true,
    BudgetHTTP: { isPostTripFloorActive: () => true },
  };
  vm.createContext(gateContext);
  vm.runInContext(floorGateCode, gateContext);
  assert.equal(gateContext._webScanPostTripFloorDeferred_(false), true, 'an AUTO scan is deferred while the hold is active');
  assert.equal(gateContext._webScanPostTripFloorDeferred_(true), false, 'a manual forceFull scan bypasses the hold');
  gateContext.BudgetHTTP = { isPostTripFloorActive: () => false };
  assert.equal(gateContext._webScanPostTripFloorDeferred_(false), false, 'an AUTO scan proceeds once the hold expires');
  gateContext.BudgetHTTP = {};
  assert.equal(gateContext._webScanPostTripFloorDeferred_(false), false, 'a missing BudgetHTTP leaves scans admitted (fail-open)');
}

assert.doesNotMatch(counterCode + legacyCode, /getScriptLock/, 'HTTP counters must never use ScriptLock');
assert.match(counterCode + legacyCode, /user-scoped UrlFetch quota[\s\S]*observational WCORE telemetry/i,
  'counter source documents why UserLock is intentional and cross-user totals are not authoritative');
assert.match(counterCode, /dropped[^\n]*lower bound/i,
  'counter source documents the execution-local dropped telemetry limitation');

// v4.16.76: every CEX connector exit must flush HttpCounter (the rolling-24h
// budget counter). HttpCounter.record() retains contended increments in an
// execution-local buffer; if the execution ends without a flush those counts are
// lost, which made the budget blind to CEX burn even though UPDATE_KRAKEN_SPOT /
// UPDATE_BITFINEX_SPOT re-tripped Google's per-user UrlFetch quota (2026-09-10/11).
// Same exit contract as the watchdog / recovery / portfolio wrappers wired in v4.16.71.
const bitpandaSource = fs.readFileSync(path.join(root, 'src/35_BITPANDA_SYNC.gs'), 'utf8');
const bitfinexSource = fs.readFileSync(path.join(root, 'src/37_BITFINEX_SYNC.gs'), 'utf8');
const krakenSource = fs.readFileSync(path.join(root, 'src/41_KRAKEN_SYNC.gs'), 'utf8');
const cexBulkSource = fs.readFileSync(path.join(root, 'src/44_CEX_BULK.gs'), 'utf8');

assert.match(bitpandaSource, /var\s+BITPANDA_SYNC_VERSION\s*=\s*["']4\.16\.81["']\s*;/,
  'BITPANDA_SYNC_VERSION must be bumped to 4.16.81 (manual CEX status timestamp)');
assert.match(bitfinexSource, /var\s+BITFINEX_SYNC_VERSION\s*=\s*["']4\.16\.35["']\s*;/,
  'BITFINEX_SYNC_VERSION must be bumped to 4.16.35 (CEX exit flush)');
assert.match(krakenSource, /var\s+KRAKEN_SYNC_VERSION\s*=\s*["']4\.16\.41["']\s*;/,
  'KRAKEN_SYNC_VERSION must be bumped to 4.16.41 (nonce persistant + lock partage anti lockout)');
assert.match(cexBulkSource, /var\s+CEX_BULK_VERSION\s*=\s*["']4\.16\.35["']\s*;/,
  'CEX_BULK_VERSION must be bumped to 4.16.35 (CEX exit flush)');

const cexExitFns = [
  [bitpandaSource, 'UPDATE_BITPANDA_SPOT'],
  [bitpandaSource, 'UPDATE_BITPANDA_STOCKS_FIAT'],
  [bitfinexSource, 'UPDATE_BITFINEX_SPOT'],
  [krakenSource, 'UPDATE_KRAKEN_SPOT'],
  [krakenSource, 'UPDATE_KRAKEN_STOCKS_FIAT'],
  [cexBulkSource, 'UPDATE_CEX_RELAY_ROTATION'],
];
for (const [source, name] of cexExitFns) {
  const body = extractFunction(source, name);
  assert.match(body, /finally\s*\{[\s\S]*HttpCounter\.flush/,
    `${name} must flush HttpCounter on exit so retained CEX burn reaches the budget`);
  assert.match(body, /finally\s*\{[\s\S]*HttpCallCounter\.clearTrigger/,
    `${name} must clear the trigger label on exit`);
}

// v4.16.76: the central exit hook must persist BOTH counters. HttpCallCounter's
// legacy daily breakdown and HttpCounter's rolling budget both keep
// execution-local buffers; clearTrigger() is the one exit point every trigger
// wrapper calls, so it is where both must be drained.
assert.match(savingsSource, /var\s+HTTP_SAVINGS_VERSION\s*=\s*["']4\.16\.76["']\s*;/,
  'HTTP_SAVINGS_VERSION must be bumped to 4.16.76 (clearTrigger exit flush)');
const clearTriggerCode = extractFunction(savingsSource, 'clearTrigger');
assert.match(clearTriggerCode, /try\s*\{\s*flush\(\)\s*;?\s*\}\s*catch/,
  'clearTrigger must flush the legacy HttpCallCounter buffer');
assert.match(clearTriggerCode, /HttpCounter\.flush/,
  'clearTrigger must flush the rolling HttpCounter budget buffer');

console.log('HTTP counter atomicity OK');
