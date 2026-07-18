const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const quotaSource = fs.readFileSync(path.join(root, 'src/03E_QUOTA_CIRCUIT_BREAKER.gs'), 'utf8');
const savingsSource = fs.readFileSync(path.join(root, 'src/26B_HTTP_SAVINGS.gs'), 'utf8');
const webSource = fs.readFileSync(path.join(root, 'src/41_GSHEET_WEB_SCAN.gs'), 'utf8');
const refreshSource = fs.readFileSync(path.join(root, 'src/16_REFRESH.gs'), 'utf8');

function extractIife(source, name) {
  const marker = `var ${name} =`;
  const start = source.indexOf(marker);
  assert.notStrictEqual(start, -1, `${name} not found`);
  const end = source.indexOf('\n})();', start);
  assert.notStrictEqual(end, -1, `${name} IIFE end not found`);
  return source.slice(start, end + '\n})();'.length);
}

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notStrictEqual(start, -1, `${name} not found`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} body not closed`);
}

const counterCode = extractIife(quotaSource, 'HttpCounter');
const budgetCode = extractIife(quotaSource, 'BudgetHTTP');
const legacyCode = extractIife(savingsSource, 'HttpCallCounter');
const resetHttpCounterCode = extractFunction(quotaSource, 'RESET_HTTP_COUNTER');
const telemetryTransportCode = extractFunction(quotaSource, '_httpTelemetryTransport_');

function makeShared() {
  const values = new Map();
  const failGetOnce = new Set();
  const failSetOnce = new Set();
  const failDeleteOnce = new Set();
  const lock = {
    held: false,
    available: true,
    tryLock() {
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
      assert.equal(lock.held, true, `getProperty(${key}) must run under UserLock`);
      if (failGetOnce.delete(key)) throw new Error(`injected get failure: ${key}`);
      return values.has(key) ? values.get(key) : null;
    },
    setProperty(key, value) {
      assert.equal(lock.held, true, `setProperty(${key}) must run under UserLock`);
      if (failSetOnce.delete(key)) throw new Error(`injected set failure: ${key}`);
      values.set(key, String(value));
    },
    deleteProperty(key) {
      assert.equal(lock.held, true, `deleteProperty(${key}) must run under UserLock`);
      if (failDeleteOnce.delete(key)) throw new Error(`injected delete failure: ${key}`);
      values.delete(key);
    },
  };
  return { values, lock, props, failGetOnce, failSetOnce, failDeleteOnce };
}

function loadCounter(shared) {
  const context = {
    Date,
    JSON,
    Math,
    Object,
    parseInt,
    isNaN,
    CK_get: (name) => name === 'httpDroppedTelemetry' ? 'CANONICAL_HTTP_DROPPED' : name,
    PropertiesService: { getScriptProperties: () => shared.props },
    LockService: { getUserLock: () => shared.lock },
  };
  vm.createContext(context);
  vm.runInContext(counterCode, context);
  vm.runInContext(budgetCode, context);
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
  assert.equal(first.HttpCounter.dropped(), 1, 'contended telemetry remains visible in memory');
  shared.lock.available = true;
  first.HttpCounter.record(1, 'WEB_SCAN', 'https://api-production-b5bf.up.railway.app/api/gsheet/scan');
  assert.ok(third.HttpCounter.dropped() >= 1, 'next successful record persists dropped telemetry');
  assert.ok(shared.values.has('CANONICAL_HTTP_DROPPED'), 'dropped telemetry uses the canonical key');
}

{
  const shared = makeShared();
  const runtime = loadCounter(shared);
  const ceiling = runtime.BudgetHTTP.limit();

  shared.lock.available = false;
  assert.equal(runtime.HttpCounter.count(), ceiling, 'lock contention fails closed at the configured count ceiling');
  assert.equal(runtime.BudgetHTTP.allow('balance'), false, 'budget denies HTTP while telemetry lock is unavailable');

  shared.lock.available = true;
  shared.failGetOnce.add('WCORE_HTTP_BUCKETS_v1');
  assert.equal(runtime.HttpCounter.count(), ceiling, 'property failure fails closed at the configured count ceiling');
  shared.failGetOnce.add('WCORE_HTTP_BUCKETS_v1');
  assert.equal(runtime.BudgetHTTP.allow('balance'), false, 'budget denies HTTP when the persisted count cannot be read');
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
assert.doesNotMatch(counterCode + legacyCode, /getScriptLock/, 'HTTP counters must never use ScriptLock');
assert.match(counterCode + legacyCode, /user-scoped UrlFetch quota[\s\S]*observational WCORE telemetry/i,
  'counter source documents why UserLock is intentional and cross-user totals are not authoritative');
assert.match(counterCode, /dropped[^\n]*lower bound/i,
  'counter source documents the execution-local dropped telemetry limitation');

console.log('HTTP counter atomicity OK');
