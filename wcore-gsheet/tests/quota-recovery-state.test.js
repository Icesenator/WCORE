const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const quotaSource = fs.readFileSync(path.join(root, 'src/03E_QUOTA_CIRCUIT_BREAKER.gs'), 'utf8');
const httpGuardSource = fs.readFileSync(path.join(root, 'src/03B_HTTP_GUARD.gs'), 'utf8');
const degradedSource = fs.readFileSync(path.join(root, 'src/24_DEGRADED_MODE.gs'), 'utf8');
const recoverySource = fs.readFileSync(path.join(root, 'src/16_REFRESH.gs'), 'utf8');
const stockSource = fs.readFileSync(path.join(root, 'src/42_STOCK_PORTFOLIO.gs'), 'utf8');
const cryptoSource = fs.readFileSync(path.join(root, 'src/43_CRYPTO_PORTFOLIO.gs'), 'utf8');

function extractBalanced(source, start, openChar, closeChar) {
  const bodyStart = source.indexOf(openChar, start);
  assert.notStrictEqual(bodyStart, -1, `Missing ${openChar} after offset ${start}`);
  let depth = 0;
  let quote = '';
  let escaped = false;
  let comment = '';
  for (let i = bodyStart; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (comment === 'line') {
      if (ch === '\n') comment = '';
      continue;
    }
    if (comment === 'block') {
      if (ch === '*' && next === '/') { comment = ''; i++; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') { comment = 'line'; i++; continue; }
    if (ch === '/' && next === '*') { comment = 'block'; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === openChar) depth++;
    if (ch === closeChar && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed ${openChar} after offset ${start}`);
}

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notStrictEqual(start, -1, `${name} not found`);
  return extractBalanced(source, start, '{', '}');
}

function extractAssignment(source, lhs, from = 0) {
  const marker = `${lhs} = function`;
  const start = source.indexOf(marker, from);
  assert.notStrictEqual(start, -1, `${lhs} assignment not found`);
  const fn = extractBalanced(source, start, '{', '}');
  return { code: `${fn};`, next: start + fn.length };
}

function loadQuotaCircuitBreaker() {
  const configStart = quotaSource.indexOf('var QUOTA_BREAKER_CONFIG =');
  const config = `${extractBalanced(quotaSource, configStart, '{', '}')};`;
  const qcbStart = quotaSource.indexOf('var QuotaCircuitBreaker =');
  const qcbEnd = quotaSource.indexOf('})();', qcbStart);
  assert.notStrictEqual(qcbEnd, -1, 'QuotaCircuitBreaker IIFE must close');
  const context = { console };
  vm.createContext(context);
  vm.runInContext(`${config}\n${quotaSource.slice(qcbStart, qcbEnd + 5)}`, context);
  return context.QuotaCircuitBreaker;
}

function createSharedQuotaRuntimeState() {
  const values = new Map([['WCORE_QUOTA_EXHAUSTED_v1', JSON.stringify({
    time: new Date().toISOString(),
    trippedMs: Date.now(),
    error: 'Service invoked too many times for one day: urlfetch'
  })]]);
  const propsMap = new Map();
  const metrics = { lockAttempts: 0, lockHeld: false, puts: [], removals: [] };
  const cache = {
    get(key) {
      if (key === 'WCORE_QUOTA_TEST_ATTEMPT_v1' && !metrics.lockHeld) {
        throw new Error('attempt lease read must hold ScriptLock');
      }
      return values.get(key) || null;
    },
    put(key, value, ttl) {
      if (key === 'WCORE_QUOTA_TEST_ATTEMPT_v1' && !metrics.lockHeld) {
        throw new Error('attempt lease write must hold ScriptLock');
      }
      metrics.puts.push({ key, value, ttl });
      values.set(key, value);
    },
    remove(key) {
      metrics.removals.push(key);
      values.delete(key);
    }
  };
  const lock = {
    tryLock() {
      metrics.lockAttempts++;
      metrics.lockHeld = true;
      return true;
    },
    releaseLock() { metrics.lockHeld = false; }
  };
  const propsApi = {
    get: (key) => propsMap.get(key) || null,
    set: (key, value) => { propsMap.set(key, value); },
    delete: (key) => { propsMap.delete(key); }
  };
  return { values, cache, lock, metrics, propsMap, propsApi };
}

function loadQuotaCircuitBreakerRuntime(fetchImpl, shared = createSharedQuotaRuntimeState()) {
  const configStart = quotaSource.indexOf('var QUOTA_BREAKER_CONFIG =');
  const config = `${extractBalanced(quotaSource, configStart, '{', '}')};`;
  const qcbStart = quotaSource.indexOf('var QuotaCircuitBreaker =');
  const qcbEnd = quotaSource.indexOf('})();', qcbStart);
  const context = {
    CacheService: { getScriptCache: () => shared.cache },
    Date,
    LockService: { getScriptLock: () => shared.lock },
    Logger: { log() {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => shared.propsApi.get(key),
        setProperty: (key, value) => shared.propsApi.set(key, value),
        deleteProperty: (key) => shared.propsApi.delete(key)
      })
    },
    Session: { getScriptTimeZone: () => 'UTC' },
    Utilities: { formatDate: () => '' },
    UrlFetchApp: {},
    _originalUrlFetch: fetchImpl
  };
  vm.createContext(context);
  vm.runInContext(`${config}\n${quotaSource.slice(qcbStart, qcbEnd + 5)}`, context);
  return context.QuotaCircuitBreaker;
}

const actualGoogleQuotaErrors = [
  new Error('Service invoked too many times for one day: urlfetch.'),
  'Exception: Service invoked too many times: urlfetch',
  'Quota exceeded for quota metric URL Fetch calls and limit URL Fetch calls per day'
];
const nonAuthoritativeErrors = [
  'RPC endpoint rate limit exceeded',
  'generic quota warning from provider',
  'HTTP 429 Too Many Requests',
  'Exceeded maximum execution time'
];
const nearMissQuotaErrors = [
  'Service invoked too many times for one day: spreadsheets. See UrlFetch documentation.',
  'Service invoked too many times: drive; previous UrlFetch call succeeded.',
  "Quota exceeded for quota metric 'Drive API calls'; URL Fetch calls remain healthy"
];

const qcb = loadQuotaCircuitBreaker();
assert.strictEqual(typeof qcb.isQuotaError, 'function', 'QCB must expose its authoritative matcher');
actualGoogleQuotaErrors.forEach((error) => assert.strictEqual(qcb.isQuotaError(error), true, String(error)));
nonAuthoritativeErrors.forEach((error) => assert.strictEqual(qcb.isQuotaError(error), false, String(error)));
nearMissQuotaErrors.forEach((error) => assert.strictEqual(qcb.isQuotaError(error), false, String(error)));

{
  const staleQcb = loadQuotaCircuitBreakerRuntime(() => { throw new Error('Address unavailable: httpbin.org'); });
  assert.strictEqual(staleQcb.testOnce(), false, 'an inconclusive non-quota probe must not report recovery');
  assert.strictEqual(staleQcb.isTripped(), true, 'an inconclusive non-quota probe must preserve the stale breaker');
}

{
  // v4.16.37: trip evidence must survive reset and cap at 5 entries.
  const shared = createSharedQuotaRuntimeState();
  const tripping = loadQuotaCircuitBreakerRuntime(() => {}, shared);
  const first = loadQuotaCircuitBreakerRuntime(() => {}, shared);
  const second = loadQuotaCircuitBreakerRuntime(() => {}, shared);
  const third = loadQuotaCircuitBreakerRuntime(() => {}, shared);

  first.trip('Service invoked too many times for one day: urlfetch');
  second.trip('Service invoked too many times: urlfetch');
  third.trip('Service invoked too many times for one day: urlfetch');

  const rawEvidence = shared.propsMap.get('WCORE_QCB_TRIP_EVIDENCE_v1');
  assert.ok(rawEvidence, 'trips must persist evidence to ScriptProperties');
  const evidence = JSON.parse(rawEvidence);
  assert.strictEqual(evidence.length, 3, 'every trip appends one evidence entry');
  assert.match(evidence[0].error, /for one day/, 'raw Google error text is preserved verbatim');
  assert.strictEqual(typeof evidence[0].ts, 'number', 'evidence carries a numeric trip timestamp');

  // reset() (run by the sweep) must NOT destroy the evidence ring.
  tripping.reset();
  const evidenceAfterReset = JSON.parse(shared.propsMap.get('WCORE_QCB_TRIP_EVIDENCE_v1'));
  assert.strictEqual(evidenceAfterReset.length, 3, 'reset must preserve trip evidence — the sweep must not erase root-cause data');

  // Ring cap: a 6th entry evicts the oldest, keeping the newest 5.
  const fourth = loadQuotaCircuitBreakerRuntime(() => {}, shared);
  const fifth = loadQuotaCircuitBreakerRuntime(() => {}, shared);
  const sixth = loadQuotaCircuitBreakerRuntime(() => {}, shared);
  fourth.trip('Quota exceeded for quota metric URL Fetch calls and limit URL Fetch calls per day');
  fifth.trip('Service invoked too many times: urlfetch');
  sixth.trip('Service invoked too many times for one day: urlfetch');
  const capped = JSON.parse(shared.propsMap.get('WCORE_QCB_TRIP_EVIDENCE_v1'));
  assert.strictEqual(capped.length, 5, 'evidence ring is capped at 5 entries');
  assert.match(capped[0].error, /Service invoked too many times: urlfetch/, 'the oldest entry is evicted first');
  assert.match(capped[2].error, /Quota exceeded for quota metric/, 'newer entries keep their original order');

  // Properties failure must never break tripping itself.
  const failingShared = createSharedQuotaRuntimeState();
  failingShared.propsApi.set = () => { throw new Error('properties unavailable'); };
  failingShared.propsApi.get = () => { throw new Error('properties unavailable'); };
  const failing = loadQuotaCircuitBreakerRuntime(() => {}, failingShared);
  let threw = null;
  try {
    failing.trip('Service invoked too many times: urlfetch');
  } catch (e) {
    threw = e;
  }
  assert.strictEqual(threw, null, 'trip evidence failure must never break tripping');
  assert.strictEqual(failing.isTripped(), true, 'breaker still trips when evidence persistence fails');
}

{
  const shared = createSharedQuotaRuntimeState();
  let fetches = 0;
  const quotaFetch = () => {
    fetches++;
    throw new Error('Service invoked too many times for one day: urlfetch');
  };
  const firstRuntime = loadQuotaCircuitBreakerRuntime(quotaFetch, shared);
  const secondRuntime = loadQuotaCircuitBreakerRuntime(quotaFetch, shared);

  assert.strictEqual(firstRuntime.testOnce(), false, 'the first tripped runtime must perform the automatic recovery probe');
  assert.strictEqual(secondRuntime.testOnce(), false, 'the leased-out runtime must remain tripped');
  assert.strictEqual(fetches, 1, 'shared attempt lease must allow only one automatic probe per 15 minutes');
  assert.strictEqual(shared.metrics.lockAttempts, 2, 'each automatic runtime must coordinate through ScriptLock');
  assert.deepStrictEqual(shared.metrics.puts.find((entry) => entry.key === 'WCORE_QUOTA_TEST_ATTEMPT_v1'), {
    key: 'WCORE_QUOTA_TEST_ATTEMPT_v1',
    value: '1',
    ttl: 900
  }, 'automatic probe lease must be cached for exactly 900 seconds');

  const forcedAdminRuntime = loadQuotaCircuitBreakerRuntime(quotaFetch, shared);
  assert.strictEqual(forcedAdminRuntime.testOnce(true), false, 'a forced admin probe must still report authoritative exhaustion');
  assert.strictEqual(fetches, 2, 'a forced admin probe must bypass the shared attempt lease');
  assert.strictEqual(shared.metrics.lockAttempts, 2, 'a forced admin probe must bypass ScriptLock coordination');
}

{
  const shared = createSharedQuotaRuntimeState();
  shared.lock.tryLock = () => false;
  let fetches = 0;
  const qcbWithBusyLock = loadQuotaCircuitBreakerRuntime(() => { fetches++; }, shared);

  assert.strictEqual(qcbWithBusyLock.testOnce(), false, 'an automatic probe with an unavailable ScriptLock must fail closed');
  assert.strictEqual(fetches, 0, 'an automatic probe must not fetch when ScriptLock is unavailable');
}

for (const operation of ['get', 'put']) {
  const shared = createSharedQuotaRuntimeState();
  const original = shared.cache[operation];
  shared.cache[operation] = function(key, ...args) {
    if (key === 'WCORE_QUOTA_TEST_ATTEMPT_v1') throw new Error(`cache ${operation} unavailable`);
    return original.call(this, key, ...args);
  };
  let fetches = 0;
  const qcbWithCacheFailure = loadQuotaCircuitBreakerRuntime(() => { fetches++; }, shared);

  assert.strictEqual(qcbWithCacheFailure.testOnce(), false, `an automatic probe must fail closed when cache ${operation} throws`);
  assert.strictEqual(fetches, 0, `an automatic probe must not fetch when cache ${operation} throws`);
  assert.strictEqual(shared.metrics.lockHeld, false, `ScriptLock must be released after cache ${operation} failure`);
}

{
  const shared = createSharedQuotaRuntimeState();
  shared.values.set('WCORE_QUOTA_TEST_ATTEMPT_v1', '1');
  const qcbToReset = loadQuotaCircuitBreakerRuntime(() => {}, shared);

  qcbToReset.reset();
  assert.strictEqual(shared.values.get('WCORE_QUOTA_TEST_ATTEMPT_v1'), '1', 'reset must preserve the automatic attempt lease');
  assert.ok(!shared.metrics.removals.includes('WCORE_QUOTA_TEST_ATTEMPT_v1'), 'reset must not remove the automatic attempt lease key');
}

function loadDegradedMode(qcbValue) {
  const context = { DegradedMode: {}, QuotaCircuitBreaker: qcbValue };
  vm.createContext(context);
  for (const lhs of [
    'DegradedMode.isQuotaError',
    'DegradedMode.activateCircuitBreaker',
    'DegradedMode.handleError'
  ]) {
    vm.runInContext(extractAssignment(degradedSource, lhs).code, context);
  }
  context.DegradedMode._getChainName = () => 'Test Chain';
  context.DegradedMode.returnCacheOnly = (_address, _config, _chain, reason) => reason;
  return context.DegradedMode;
}

let delegatedCalls = 0;
const delegated = loadDegradedMode({
  isQuotaError(error) {
    delegatedCalls++;
    return String(error).includes('authoritative');
  },
  trip() {
    throw new Error('trip should not be called by this matcher test');
  }
});
assert.strictEqual(delegated.isQuotaError('authoritative'), true);
assert.strictEqual(delegatedCalls, 1, 'DegradedMode must delegate matching to QCB when available');

const fallback = loadDegradedMode(undefined);
actualGoogleQuotaErrors.forEach((error) => assert.strictEqual(fallback.isQuotaError(error), true, String(error)));
nonAuthoritativeErrors.forEach((error) => assert.strictEqual(fallback.isQuotaError(error), false, String(error)));
nearMissQuotaErrors.forEach((error) => assert.strictEqual(fallback.isQuotaError(error), false, String(error)));

let tripCalls = 0;
const guarded = loadDegradedMode({
  isQuotaError: (error) => String(error).includes('Service invoked too many times'),
  trip() { tripCalls++; }
});
for (const error of nonAuthoritativeErrors) {
  assert.match(guarded.handleError(new Error(error), '', {}, null, null), /^Exception:/);
}
assert.strictEqual(tripCalls, 0, 'Non-authoritative errors must not globally trip QCB');

{
  const assignments = [];
  let offset = 0;
  while (degradedSource.indexOf('DegradedMode.resetCircuitBreaker = function', offset) !== -1) {
    const found = extractAssignment(degradedSource, 'DegradedMode.resetCircuitBreaker', offset);
    assignments.push(found.code);
    offset = found.next;
  }
  const removed = [];
  let resets = 0;
  const context = {
    DegradedMode: {},
    QuotaCircuitBreaker: { reset() { resets++; } },
    CacheService: { getScriptCache: () => ({ remove: (key) => removed.push(key) }) }
  };
  vm.createContext(context);
  vm.runInContext(assignments.join('\n'), context);
  context.DegradedMode.resetCircuitBreaker();
  assert.strictEqual(resets, 1, 'Effective duplicate reset must delegate to QCB.reset');
  assert.deepStrictEqual(removed.sort(), [
    'WCORE_HTTP_ERROR_COUNT',
    'WCORE_LAST_HTTP_ERROR',
    'WCORE_RECOVERY_MODE'
  ]);
  assert.ok(!assignments.at(-1).includes('CIRCUIT_BREAKER_KEY'), 'Effective reset must not use undefined legacy key');
}

const schedule = extractFunction(recoverySource, '_recoverySchedulePortfolioRefresh_');
assert.match(schedule, /PORTFOLIO_RECOVERY_REFRESH/);
assert.doesNotMatch(schedule, /STOCK_PORTFOLIO_RECOVERY_REFRESH|CRYPTO_PORTFOLIO_V2_RECOVERY_REFRESH/);
assert.doesNotMatch(schedule, /STOCK_PORTFOLIO_HOURLY_REFRESH|CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH/);
assert.match(schedule, /LockService\.getScriptLock\s*\(\)/, 'Recovery scheduling must serialize dedup inspection and creation');
assert.match(schedule, /\.after\s*\(/, 'Recovery portfolio refresh must be a one-shot trigger');

{
  const created = [];
  const values = new Map();
  let releases = 0;
  const context = {
    P_PORTFOLIO_RECOVERY_PENDING: 'WCORE_PORTFOLIO_RECOVERY_PENDING',
    PORTFOLIO_RECOVERY_RETRY_DELAY_MS: 5 * 60 * 1000,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => values.get(key) || null,
      setProperty: (key, value) => values.set(key, value),
      deleteProperty: (key) => values.delete(key)
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => { releases++; } }) },
    ScriptApp: {
      getProjectTriggers: () => [],
      newTrigger(handler) {
        created.push(handler);
        return { timeBased: () => ({ after: () => ({ create() {} }) }) };
      }
    },
    Logger: { log() {} }
  };
  vm.createContext(context);
  for (const name of ['_recoverySetPortfolioRefreshPending_', '_recoverySchedulePortfolioRefresh_']) {
    vm.runInContext(extractFunction(recoverySource, name), context);
  }
  assert.strictEqual(context._recoverySchedulePortfolioRefresh_(), true, 'scheduler must report successful creation');
  assert.strictEqual(values.get('WCORE_PORTFOLIO_RECOVERY_PENDING') != null, true, 'scheduler must persist pending before ScriptApp calls');
  assert.deepStrictEqual(created, ['PORTFOLIO_RECOVERY_REFRESH'], 'scheduler must create only the combined handler');
  assert.strictEqual(releases, 1, 'scheduler must release the script lock');

  context.ScriptApp.getProjectTriggers = () => [{ getHandlerFunction: () => 'PORTFOLIO_RECOVERY_REFRESH' }];
  assert.strictEqual(context._recoverySchedulePortfolioRefresh_(), true, 'existing combined trigger must count as scheduled');
  assert.deepStrictEqual(created, ['PORTFOLIO_RECOVERY_REFRESH'], 'dedup must not create a second combined trigger');

  context.ScriptApp.getProjectTriggers = () => { throw new Error('ScriptApp authorization required'); };
  assert.strictEqual(context._recoverySchedulePortfolioRefresh_(), false, 'authorization failure must be reported');
  assert.strictEqual(values.get('WCORE_PORTFOLIO_RECOVERY_PENDING') != null, true, 'authorization failure must preserve pending state');

  let scriptCalls = 0;
  context.PropertiesService = { getScriptProperties: () => ({ setProperty() { throw new Error('properties unavailable'); } }) };
  context.ScriptApp.getProjectTriggers = () => { scriptCalls++; return []; };
  assert.strictEqual(context._recoverySchedulePortfolioRefresh_(), false, 'marker persistence failure must abort scheduling');
  assert.strictEqual(scriptCalls, 0, 'scheduler must persist the marker before any ScriptApp call');

  context.PropertiesService = { getScriptProperties: () => ({ setProperty: (key, value) => values.set(key, value) }) };
  context.LockService = { getScriptLock: () => null };
  assert.strictEqual(context._recoverySchedulePortfolioRefresh_(), false, 'null script lock must fail safely');
}

assert.doesNotMatch(stockSource, /function STOCK_PORTFOLIO_RECOVERY_REFRESH\s*\(/, 'old stock recovery handler must be removed');
assert.doesNotMatch(cryptoSource, /function CRYPTO_PORTFOLIO_V2_RECOVERY_REFRESH\s*\(/, 'old crypto recovery handler must be removed');

function runCombined({ stockResult = 'OK: stock', cryptoResult = 'OK: crypto', stockError = null, cryptoError = null }) {
  const values = new Map([['WCORE_PORTFOLIO_RECOVERY_PENDING', 'pending']]);
  const calls = [];
  const createdDelays = [];
  let clearTriggerCalls = 0;
  const currentTrigger = {
    getHandlerFunction: () => 'PORTFOLIO_RECOVERY_REFRESH',
    getUniqueId: () => 'trigger-1'
  };
  const context = {
    P_PORTFOLIO_RECOVERY_PENDING: 'WCORE_PORTFOLIO_RECOVERY_PENDING',
    PORTFOLIO_RECOVERY_RETRY_DELAY_MS: 5 * 60 * 1000,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => values.get(key) || null,
      setProperty: (key, value) => values.set(key, value),
      deleteProperty: (key) => values.delete(key)
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ScriptApp: {
      getProjectTriggers: () => [currentTrigger],
      deleteTrigger(trigger) { calls.push('delete:' + trigger.getUniqueId()); },
      newTrigger: () => ({ timeBased: () => ({ after: (delay) => ({ create() { createdDelays.push(delay); } }) }) })
    },
    HttpCallCounter: { setTrigger() {}, clearTrigger() { clearTriggerCalls++; } },
    Logger: { log() {} },
    UPDATE_STOCK_PORTFOLIO() {
      calls.push('stock');
      if (stockError) throw stockError;
      return stockResult;
    },
    UPDATE_CRYPTO_PORTFOLIO_V2() {
      calls.push('crypto');
      if (cryptoError) throw cryptoError;
      return cryptoResult;
    }
  };
  vm.createContext(context);
  for (const name of [
    '_recoverySetPortfolioRefreshPending_',
    '_recoveryClearPortfolioRefreshPending_',
    '_recoverySchedulePortfolioRefresh_',
    '_recoveryDeleteCurrentPortfolioTrigger_',
    'PORTFOLIO_RECOVERY_REFRESH'
  ]) vm.runInContext(extractFunction(recoverySource, name), context);
  const result = context.PORTFOLIO_RECOVERY_REFRESH({ triggerUid: 'trigger-1' });
  return { result, values, calls, createdDelays, clearTriggerCalls };
}

{
  const result = runCombined({});
  assert.deepStrictEqual(result.calls, ['stock', 'crypto'], 'combined handler must run stock then crypto sequentially');
  assert.strictEqual(result.values.has('WCORE_PORTFOLIO_RECOVERY_PENDING'), false, 'both successes must clear pending state');
  assert.deepStrictEqual(result.createdDelays, [], 'both successes must not create a retry');
  assert.strictEqual(result.clearTriggerCalls, 1, 'combined handler must clear trigger attribution');
}

for (const failure of [
  { stockResult: 'BUSY: another portfolio refresh is running' },
  { stockError: new Error('stock failed') }
]) {
  const result = runCombined(failure);
  assert.deepStrictEqual(result.calls.slice(0, 2), ['stock', 'crypto'], 'stock failure must not prevent the crypto attempt');
  assert.strictEqual(result.values.has('WCORE_PORTFOLIO_RECOVERY_PENDING'), true, 'incomplete combined refresh must preserve pending state');
  assert.ok(result.calls.includes('delete:trigger-1'), 'incomplete handler must delete its visible current trigger before retry');
  assert.deepStrictEqual(result.createdDelays, [5 * 60 * 1000], 'incomplete handler must queue one conservative retry');
}

for (const name of ['QUOTA_RECOVERY_SWEEP', 'QUOTA_RECOVERY_SWEEP_FOLLOWUP']) {
  const fn = extractFunction(recoverySource, name);
  assert.match(fn, /QuotaCircuitBreaker\.reset\s*\(/, `${name} must reset QCB after a successful probe`);
  assert.match(fn, /HttpErrorGuard\.reset\s*\(/, `${name} must call the real HttpErrorGuard reset API`);
  assert.doesNotMatch(fn, /HttpErrorGuard\.clearQuotaFlag\s*\(/, `${name} must not call a nonexistent API`);
  assert.match(fn, /_recoverySchedulePortfolioRefresh_\s*\(/, `${name} must schedule portfolio recovery`);
  assert.match(fn, /typeof _wcoreGetSpreadsheet_ === ['"]function['"]/, `${name} must prefer _wcoreGetSpreadsheet_`);
  assert.match(fn, /if\s*\(!ss\)/, `${name} must handle missing spreadsheet access`);
  assert.doesNotMatch(fn, /UPDATE_STOCK_PORTFOLIO\s*\(|UPDATE_CRYPTO_PORTFOLIO_V2\s*\(/, `${name} must not run heavy portfolio work directly`);
}

assert.match(httpGuardSource, /reset:\s*function\s*\(\)/, 'HttpErrorGuard source must expose reset()');
assert.doesNotMatch(httpGuardSource, /clearQuotaFlag:\s*function/, 'HttpErrorGuard source does not expose clearQuotaFlag()');

function runMainSweep({ probeOk, qcbBlocked = false, guardBlocked = false, quotaRows = [], pending = false }) {
  let scheduled = 0;
  let created = 0;
  const context = {
    Date,
    HttpCallCounter: { setTrigger() {}, clearTrigger() {} },
    HttpErrorGuard: { isQuotaExhausted: () => guardBlocked, reset() {} },
    Logger: { log() {} },
    QuotaCircuitBreaker: { isTripped: () => qcbBlocked, reset() {} },
    ScriptApp: {
      newTrigger() {
        created++;
        return { timeBased: () => ({ after: () => ({ create() {} }) }) };
      }
    },
    WCORE_AUTO_HEAL() {},
    _recoveryAcquireLock_: () => true,
    _recoveryReleaseLock_() {},
    _recoveryProbeQuota_: () => ({ ok: probeOk, err: probeOk ? '' : 'network', code: probeOk ? 200 : 0 }),
    _recoveryIsFollowupPending_: () => false,
    _recoverySetFollowupPending_() {},
    _recoverySchedulePortfolioRefresh_: () => { scheduled++; },
    _recoveryIsPortfolioRefreshPending_: () => pending,
    _recoveryCollectBlocked_: () => ({ quota: quotaRows, timeout: [], all: quotaRows }),
    _recoverySelectPulseList_: (list) => ({ pulse: (list || []).slice(0, 5), deferred: (list || []).slice(5) }),
    _recoveryPulseBatches_: () => ({ pulsed: 0, batches: 0, skippedFromIdx: -1 }),
    _recoverySetSkipped_() {},
    _recoveryClearSkipped_() {},
    _recoveryClearFollowupPending_() {},
    _wcoreGetSpreadsheet_: () => ({ getSheetByName: () => ({}) }),
    P_RECOVERY_SWEEP_LOCK: 'lock',
    RECOVERY_LOCK_TTL_MS: 600000,
    RECAP_SHEET_NAME: 'Recap Portfolio'
  };
  vm.createContext(context);
  vm.runInContext(extractFunction(recoverySource, 'QUOTA_RECOVERY_SWEEP'), context);
  context.QUOTA_RECOVERY_SWEEP();
  return { scheduled, created };
}

assert.deepStrictEqual(
  runMainSweep({ probeOk: true }),
  { scheduled: 0, created: 0 },
  'healthy recurring poll with no blocked state must not queue portfolio work'
);
assert.strictEqual(
  runMainSweep({ probeOk: true, qcbBlocked: true }).scheduled,
  1,
  'a genuinely tripped QCB must queue portfolio recovery after collection'
);
assert.strictEqual(
  runMainSweep({ probeOk: true, quotaRows: ['Ledger - Test'] }).scheduled,
  1,
  'blocked quota rows must queue portfolio recovery after collection'
);
assert.strictEqual(
  runMainSweep({ probeOk: true, pending: true }).scheduled,
  1,
  'durable pending state must reschedule portfolio recovery after guards and rows are clear'
);
assert.strictEqual(
  runMainSweep({ probeOk: false }).created,
  0,
  'main probe failure must rely on the recurring poller, not add a duplicate one-shot main trigger'
);

function runFollowup({ qcbBlocked = false, guardBlocked = false, quotaRows = [], skippedRows = [], pending = false }) {
  let scheduled = 0;
  const context = {
    Date,
    HttpCallCounter: { setTrigger() {}, clearTrigger() {} },
    HttpErrorGuard: { isQuotaExhausted: () => guardBlocked, reset() {} },
    Logger: { log() {} },
    QuotaCircuitBreaker: { isTripped: () => qcbBlocked, reset() {} },
    _recoveryIsSweepRunning_: () => false,
    _recoveryClearFollowupPending_() {},
    _recoveryProbeQuota_: () => ({ ok: true, err: '', code: 200 }),
    _recoverySchedulePortfolioRefresh_: () => { scheduled++; },
    _recoveryIsPortfolioRefreshPending_: () => pending,
    _recoveryGetSkipped_: () => ({ sheets: skippedRows }),
    _recoveryCollectBlocked_: () => ({ quota: quotaRows, timeout: [], all: quotaRows }),
    _recoverySelectPulseList_: (list) => ({ pulse: (list || []).slice(0, 5), deferred: (list || []).slice(5) }),
    _recoveryPulseBatches_: () => ({ pulsed: 0, batches: 0, skippedFromIdx: -1 }),
    _recoverySetSkipped_() {},
    _recoveryClearSkipped_() {},
    _wcoreGetSpreadsheet_: () => ({ getSheetByName: () => ({}) }),
    RECAP_SHEET_NAME: 'Recap Portfolio'
  };
  vm.createContext(context);
  vm.runInContext(extractFunction(recoverySource, 'QUOTA_RECOVERY_SWEEP_FOLLOWUP'), context);
  context.QUOTA_RECOVERY_SWEEP_FOLLOWUP();
  return scheduled;
}

assert.strictEqual(runFollowup({}), 0, 'healthy followup with no recovery state must not queue portfolio work');
assert.strictEqual(runFollowup({ skippedRows: ['Ledger - Skipped'] }), 1, 'followup skipped recovery state must queue portfolio work');
assert.strictEqual(runFollowup({ guardBlocked: true }), 1, 'followup tripped quota guard must queue portfolio work');
assert.strictEqual(runFollowup({ pending: true }), 1, 'followup pending marker must queue portfolio work');

// v4.16.71 — piste 3: hold-aware recovery sweep.
// After an authoritative Google trip, BudgetHTTP holds AUTO web scans for 3h.
// Pulsing on-chain wallets during that window only writes B1 (the scan returns
// cached output) and burns watchdog pulse budget. The sweep must therefore:
//   1. still schedule portfolio recovery (Action/Crypto are 1 fetch each and
//      bypass the hold);
//   2. skip on-chain wallet pulses while the hold is active, persisting them
//      as skipped so FOLLOWUP retries after the hold;
//   3. cap the first-pass pulse list at 5 even when the hold is inactive, so
//      a 100-wallet herd cannot re-exhaust the sliding window in one run.
{
  const helper = extractFunction(recoverySource, '_recoverySelectPulseList_');
  assert.match(helper, /isPostTripFloorActive/,
    'the sweep must consult the post-trip scan hold before pulsing on-chain wallets');
  assert.match(helper, /RECOVERY_FIRST_PASS_CAP/,
    'the first-pass pulse list must be hard-capped');
  const context = { BudgetHTTP: { isPostTripFloorActive: () => false } };
  vm.createContext(context);
  vm.runInContext(
    'var RECOVERY_FIRST_PASS_CAP = 5;\n' + helper,
    context
  );

  const wallets = [];
  for (let i = 1; i <= 12; i++) wallets.push('Ledger - W' + i);
  const uncapped = JSON.parse(JSON.stringify(context._recoverySelectPulseList_(wallets, false)));
  assert.deepStrictEqual(uncapped.pulse, wallets.slice(0, 5),
    'first pass pulses at most 5 on-chain wallets even with a healthy quota');
  assert.deepStrictEqual(uncapped.deferred, wallets.slice(5),
    'overflow wallets are deferred to FOLLOWUP, not dropped');

  context.BudgetHTTP = { isPostTripFloorActive: () => true };
  const held = JSON.parse(JSON.stringify(context._recoverySelectPulseList_(wallets, true)));
  assert.deepStrictEqual(held.pulse, [],
    'while the post-trip hold is active the sweep must not pulse on-chain wallets');
  assert.deepStrictEqual(held.deferred, wallets,
    'held wallets are persisted as skipped so FOLLOWUP retries after the hold');

  // Production call site omits the second arg and reads BudgetHTTP.
  const heldViaBudget = JSON.parse(JSON.stringify(context._recoverySelectPulseList_(wallets)));
  assert.deepStrictEqual(heldViaBudget.pulse, [],
    'omitted holdActive still defers every wallet when BudgetHTTP reports the hold');
  assert.deepStrictEqual(heldViaBudget.deferred, wallets,
    'omitted holdActive still persists the full list for FOLLOWUP');
}

{
  const sweep = extractFunction(recoverySource, 'QUOTA_RECOVERY_SWEEP');
  const followup = extractFunction(recoverySource, 'QUOTA_RECOVERY_SWEEP_FOLLOWUP');
  assert.match(sweep, /_recoverySelectPulseList_/,
    'the main sweep must filter its pulse list through the hold-aware selector');
  assert.match(followup, /_recoverySelectPulseList_/,
    'FOLLOWUP must also honor the hold — it must not become the wave the hold just blocked');
  assert.match(sweep, /_recoverySchedulePortfolioRefresh_/,
    'portfolio recovery stays scheduled independently of the on-chain pulse skip');
}

for (const [sheetName, updateName] of [
  ['Portefeuille Action', 'UPDATE_STOCK_PORTFOLIO'],
  ['Portefeuille Crypto', 'UPDATE_CRYPTO_PORTFOLIO_V2']
]) {
  const writes = {};
  const sheet = {
    getName: () => sheetName,
    getRange(a1) {
      return {
        setValue(value) { writes[a1] = value; return this; },
        setNumberFormat() { return this; }
      };
    }
  };
  const range = {
    getSheet: () => sheet,
    getA1Notation: () => 'A1',
    getValue: () => true,
    setValue(value) { writes.A1 = value; }
  };
  const context = {
    Date,
    Logger: { log() {} },
    _wd_fmtDate_: () => 'now',
    [updateName]: () => 'BUSY: another portfolio refresh is running'
  };
  vm.createContext(context);
  vm.runInContext(extractFunction(recoverySource, 'WCORE_ON_EDIT'), context);
  context.WCORE_ON_EDIT({ range, value: 'TRUE' });
  assert.strictEqual(writes.B1, 'BUSY: another portfolio refresh is running', `${sheetName} manual BUSY must be visible in B1`);
  assert.strictEqual(writes.A1, false, `${sheetName} manual BUSY must reset A1`);
}

{
  const liveProbeQuotaNow = extractFunction(quotaSource, 'LIVE_PROBE_QUOTA_NOW');
  assert.match(quotaSource, /authorized editor\/admin execution[\s\S]*function LIVE_PROBE_QUOTA_NOW\(\)/i,
    'LIVE_PROBE_QUOTA_NOW must document authorized scheduling semantics');
  assert.doesNotMatch(quotaSource, /function TEST_QUOTA_NOW\s*\(/,
    'network diagnostics must not retain the ambiguous TEST_QUOTA_NOW alias');
  const quotaStatus = extractFunction(quotaSource, 'GET_QUOTA_BREAKER_STATUS');
  assert.doesNotMatch(quotaStatus, /_originalUrlFetch|\.testOnce\s*\(/,
    'GET_QUOTA_BREAKER_STATUS must remain read-only');
  function run(initiallyTripped) {
    let state = initiallyTripped;
    let scheduled = 0;
    let forceProbe;
    const context = {
      QuotaCircuitBreaker: {
        isTripped: () => state,
        testOnce: (force) => { forceProbe = force; state = false; return true; },
        getStatus: () => ({})
      },
      _recoverySchedulePortfolioRefresh_: () => { scheduled++; },
      Session: { getScriptTimeZone: () => 'UTC' },
      Utilities: { formatDate: () => '18/07/2026 12:00:00 UTC' },
      Date
    };
    vm.createContext(context);
    vm.runInContext(liveProbeQuotaNow, context);
    context.LIVE_PROBE_QUOTA_NOW();
    return { scheduled, forceProbe };
  }
  assert.deepStrictEqual(run(true), { scheduled: 1, forceProbe: true },
    'LIVE_PROBE_QUOTA_NOW must force a real probe and schedule after recovering a tripped QCB');
  assert.deepStrictEqual(run(false), { scheduled: 0, forceProbe: true },
    'LIVE_PROBE_QUOTA_NOW must force a real probe without scheduling when quota was already healthy');
}

console.log('quota recovery state guard OK');
