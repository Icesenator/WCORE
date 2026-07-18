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

function loadQuotaCircuitBreakerRuntime(fetchImpl) {
  const values = new Map();
  values.set('WCORE_QUOTA_EXHAUSTED_v1', JSON.stringify({
    time: new Date().toISOString(),
    trippedMs: Date.now(),
    error: 'Service invoked too many times for one day: urlfetch'
  }));
  const cache = {
    get: (key) => values.get(key) || null,
    put: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key)
  };
  const configStart = quotaSource.indexOf('var QUOTA_BREAKER_CONFIG =');
  const config = `${extractBalanced(quotaSource, configStart, '{', '}')};`;
  const qcbStart = quotaSource.indexOf('var QuotaCircuitBreaker =');
  const qcbEnd = quotaSource.indexOf('})();', qcbStart);
  const context = {
    CacheService: { getScriptCache: () => cache },
    Date,
    Logger: { log() {} },
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
  const testQuotaNow = extractFunction(quotaSource, 'TEST_QUOTA_NOW');
  assert.match(quotaSource, /authorized editor\/admin execution[\s\S]*function TEST_QUOTA_NOW\(\)/i,
    'TEST_QUOTA_NOW must document authorized scheduling semantics');
  function run(initiallyTripped) {
    let state = initiallyTripped;
    let scheduled = 0;
    const context = {
      QuotaCircuitBreaker: {
        isTripped: () => state,
        testOnce: () => { state = false; return true; },
        getStatus: () => ({})
      },
      _recoverySchedulePortfolioRefresh_: () => { scheduled++; },
      Session: { getScriptTimeZone: () => 'UTC' },
      Utilities: { formatDate: () => '18/07/2026 12:00:00 UTC' },
      Date
    };
    vm.createContext(context);
    vm.runInContext(testQuotaNow, context);
    context.TEST_QUOTA_NOW();
    return scheduled;
  }
  assert.strictEqual(run(true), 1, 'TEST_QUOTA_NOW must schedule after recovering a tripped QCB');
  assert.strictEqual(run(false), 0, 'TEST_QUOTA_NOW must not schedule when quota was already healthy');
}

console.log('quota recovery state guard OK');
