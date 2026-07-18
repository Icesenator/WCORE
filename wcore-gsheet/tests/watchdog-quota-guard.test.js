const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', '16_REFRESH.gs'), 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notStrictEqual(start, -1, `${name} not found`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} body not closed`);
}

const watchdog = extractFunction('WATCHDOG_FROM_RECAP');
const watchdogApi = extractFunction('_wd_watchdogFromRecapViaSheetsApi_');
const watchdogApiDiag = extractFunction('DIAG_RUN_WATCHDOG_SHEETS_API_FALLBACK');
const partialCheck = extractFunction('_wd_checkPartialCycles_');
const partialDiag = extractFunction('DIAG_WATCHDOG_PARTIAL_CYCLES');
const forcePartial = extractFunction('FORCE_WATCHDOG_PARTIAL_CHECK');
const tryUnblock = extractFunction('_wd_tryUnblock_');
const maxPulsesMatch = source.match(/var\s+WD_MAX_PULSES_PER_RUN\s*=\s*(\d+)\s*;/);
assert(maxPulsesMatch, 'WD_MAX_PULSES_PER_RUN must be defined');
assert.strictEqual(Number(maxPulsesMatch[1]), 5, 'WATCHDOG should allow at most 5 B1 pulses per run');

function loadWatchdogHelpers(options = {}) {
  const scriptProperties = options.scriptProperties || {};
  const names = [
    '_wd_norm_',
    '_wd_fmtDate_',
    '_wd_isLastUpdateFormat_',
    '_wd_extractTimestamp_',
    '_wd_extractSuccessTimestamp_',
    '_wd_isUnsafeLatchSource_',
    '_wd_isBlocked_',
    '_wd_parseLocalDateTimeToMs_',
    '_wd_bumpTimestampSeconds_',
    '_wd_shouldPulseB1_',
    '_wd_staleAgeMs_',
    '_wd_refreshReasonPriority_',
    '_wd_isCexSheet_',
    '_wd_loadWebBackoff_',
    '_wd_saveWebBackoff_',
    '_wd_pruneWebBackoff_',
    '_wd_webErrorDecision_',
    '_wd_loadPartialPulseMap_',
    '_wd_reservePulseStates_',
    '_wd_rollbackPulseReservations_',
    '_wd_collectGlobalRefreshActions_',
    '_wd_quoteA1Sheet_',
    '_wd_addApiWrite_',
    '_wd_flushApiWrites_',
    '_wd_executeApiActions_',
    '_wd_applySpreadsheetActions_',
    '_wd_shouldSyncJ1_',
    '_wd_needsRefresh_',
    '_wd_isSystemBlocked_',
    '_wd_tryUnblock_'
  ];
  const code = names.map(extractFunction).join('\n');
  let getPropertyCalls = 0;
  let setPropertyCalls = 0;
  const context = {
    WD_MAX_PULSES_PER_RUN: 5,
    WD_PULSE_MIN: 10,
    WD_PULSE_MIN_BLOCKED: 30,
    WD_WEB_ERROR_BACKOFF_MS: [30 * 60000, 2 * 3600000, 6 * 3600000, 24 * 3600000],
    WD_WEB_BACKOFF_MAX_ENTRIES: 200,
    WD_WEB_BACKOFF_RETENTION_MS: 48 * 3600000,
    P_WD_PARTIAL_LAST: 'WD_PARTIAL_LAST',
    WCORE_SPREADSHEET_ID: 'spreadsheet-id',
    CK_get: (name) => name === 'watchdogWebBackoff' ? 'WD_WEB_BACKOFF:v1' : name,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => {
          getPropertyCalls++;
          if (options.failLoad) throw new Error('property load failed');
          if ((options.failGetPropertyCalls || []).includes(getPropertyCalls)) throw new Error('property load failed');
          return Object.prototype.hasOwnProperty.call(scriptProperties, key) ? scriptProperties[key] : null;
        },
        setProperty: (key, value) => {
          setPropertyCalls++;
          if (options.failSave) throw new Error('property save failed');
          if ((options.failSetPropertyCalls || []).includes(setPropertyCalls)) throw new Error('property save failed');
          scriptProperties[key] = String(value);
        }
      })
    },
    Sheets: {
      Spreadsheets: {
        Values: {
          batchUpdate: (...args) => {
            if (options.failApiWrite) throw new Error('api write failed');
            if (options.apiBatchUpdate) return options.apiBatchUpdate(...args);
            return {};
          }
        }
      }
    },
    QuotaCircuitBreaker: { isTripped: () => !!options.quotaBlocked },
    HttpErrorGuard: { isQuotaExhausted: () => false },
    CacheGuard: { isBlocked: () => false },
    Logger: { log() {} }
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  context.__scriptProperties = scriptProperties;
  context.__propertyCalls = () => ({ get: getPropertyCalls, set: setPropertyCalls });
  return context;
}

assert(
  !/day-start[\s\S]*QuotaCircuitBreaker\.reset\s*\(/.test(watchdog),
  'WATCHDOG_FROM_RECAP must not reset quota breaker on day-start without a live quota probe'
);

assert.match(watchdog, /_wd_applySpreadsheetActions_\(ss, actions, nowMs, WD_MAX_PULSES_PER_RUN\)/, 'main watchdog must commit state through the spreadsheet action executor');
assert.match(watchdogApi, /_wd_executeApiActions_\(globalActions, nowMs\)/, 'Sheets API watchdog must commit state only after its batch succeeds');
assert.match(forcePartial, /_wd_applySpreadsheetActions_\(ss,[\s\S]*WD_MAX_PULSES_PER_RUN\)/, 'forced partial check must execute candidates through the capped spreadsheet executor');
assert.match(forcePartial, /_wd_collectGlobalRefreshActions_\(\[\],[\s\S]*partialStats\.actions\)/, 'forced partial check must reserve its collected candidates');
assert.match(forcePartial, /partialStats\.pulsed = execution\.pulses/, 'forced partial check must report actual successful writes');
assert.match(watchdogApi, /_wd_loadPartialPulseMap_\(\)/, 'Sheets API path must validate the partial pulse map');
assert.match(partialCheck, /_wd_loadPartialPulseMap_\(\)/, 'Spreadsheet path must validate the partial pulse map');
assert.match(partialDiag, /_wd_loadPartialPulseMap_\(\)/, 'partial diagnostics must use the shared sanitized map');
assert.match(source, /Apps Script has no cross-service transaction[\s\S]*quota-safe at-most-once/, 'source must document the quota-safe transaction policy');
for (const [name, entryPoint] of [['API diagnostic', watchdogApiDiag], ['forced partial check', forcePartial]]) {
  assert.match(entryPoint, /LockService\.getScriptLock\(\)/, `${name} must acquire ScriptLock`);
  assert.match(entryPoint, /tryLock\(5000\)/, `${name} must use bounded lock acquisition`);
  assert.match(entryPoint, /finally[\s\S]*releaseLock\(\)/, `${name} must release its acquired lock in finally`);
}
assert.doesNotMatch(watchdogApi, /LockService|getScriptLock|tryLock/, 'internal API fallback must not acquire a nested ScriptLock');
assert.doesNotMatch(partialCheck, /LockService|getScriptLock|tryLock/, 'internal partial collector must not acquire a nested ScriptLock');

assert(
  !/blockedReason\s*===\s*["']QUOTA["'][\s\S]*QuotaCircuitBreaker\.reset\s*\(/.test(tryUnblock),
  '_wd_tryUnblock_(QUOTA) must not reset quota breaker before pulsing B1'
);

const vm = require('vm');

function loadPublicEntryPoints(options = {}) {
  const calls = { internal: 0, release: 0, writes: 0 };
  const lock = {
    tryLock: () => options.lockBusy ? false : true,
    releaseLock: () => { calls.release++; }
  };
  const ss = { getSpreadsheetTimeZone: () => 'Europe/Paris' };
  const context = {
    Date,
    LockService: {
      getScriptLock: () => {
        if (options.lockFailure) throw new Error('lock unavailable');
        return lock;
      }
    },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    Utilities: { formatDate: () => '2026-07-18 00:00:00' },
    Logger: { log() {} },
    WD_MAX_PULSES_PER_RUN: 5,
    WD_STALE_I1_HOURS: 5,
    _wd_watchdogFromRecapViaSheetsApi_: () => {
      calls.internal++;
      if (options.internalFailure) throw new Error('internal failed');
      return { ok: true };
    },
    _wd_checkPartialCycles_: () => ({ checked: 0, partial: 0, pulsed: 0, errors: 0, actions: [] }),
    _wd_collectGlobalRefreshActions_: () => [],
    _wd_applySpreadsheetActions_: () => ({ pulses: 0, errors: 0, stateErrors: 0 })
  };
  vm.createContext(context);
  vm.runInContext(`${extractFunction('DIAG_RUN_WATCHDOG_SHEETS_API_FALLBACK')}\n${extractFunction('FORCE_WATCHDOG_PARTIAL_CHECK')}`, context);
  context.__calls = calls;
  return context;
}

{
  const busy = loadPublicEntryPoints({ lockBusy: true });
  const apiBusy = busy.DIAG_RUN_WATCHDOG_SHEETS_API_FALLBACK();
  const forceBusy = busy.FORCE_WATCHDOG_PARTIAL_CHECK();
  assert.equal(apiBusy.skipped, 'LOCK_BUSY', 'busy API diagnostic returns an explicit safe result');
  assert.equal(forceBusy[1][1], 'LOCK_BUSY', 'busy forced partial check returns explicit safe stats');
  assert.equal(busy.__calls.internal, 0, 'busy public entry points perform no internal work');
  assert.equal(busy.__calls.release, 0, 'an unacquired busy lock is not released');
}

{
  const available = loadPublicEntryPoints();
  assert.deepEqual(available.DIAG_RUN_WATCHDOG_SHEETS_API_FALLBACK(), { ok: true });
  available.FORCE_WATCHDOG_PARTIAL_CHECK();
  assert.equal(available.__calls.release, 2, 'both public entry points release acquired locks');
}

const helpers = loadWatchdogHelpers();
const t0 = Date.parse('2026-07-18T00:00:00Z');

{
  const delays = [30, 120, 360, 1440].map((minutes) => minutes * 60000);
  const state = { 'Ledger - Error': { attempts: 0, lastPulseMs: t0, lastErrorMs: t0 } };
  const nextDelays = [delays[1], delays[2], delays[3], delays[3]];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    const at = state['Ledger - Error'].lastPulseMs + delays[attempt];
    const decision = helpers._wd_webErrorDecision_(state, 'Ledger - Error', at, t0);
    assert.equal(decision.allowed, true, `attempt ${attempt + 1} becomes eligible at its boundary`);
    assert.equal(decision.nextDelayMs, nextDelays[attempt]);
  }

  const beforeBoundary = helpers._wd_webErrorDecision_({ 'Ledger - Error': { attempts: 1, lastPulseMs: t0, lastErrorMs: t0 } }, 'Ledger - Error', t0 + 2 * 3600000 - 1, t0);
  assert.equal(beforeBoundary.allowed, false, 'second retry waits the full two hours');

  const deferred = helpers._wd_needsRefresh_('', '[WEB_SCAN_DEFERRED] N/A', t0, 5 * 3600000);
  assert.deepEqual(deferred, { needsPulse: false, reason: 'deferred', blockedReason: null, useBlockedCooldown: false });

  const healthyState = { 'Ledger - Healthy': { attempts: 4, lastPulseMs: t0 } };
  helpers._wd_webErrorDecision_(healthyState, 'Ledger - Healthy', t0 + 1, null);
  assert.equal(healthyState['Ledger - Healthy'], undefined, 'healthy timestamp clears error backoff');
}

{
  const state = {};
  for (let i = 0; i < 250; i++) {
    const old = i < 25;
    state[`Ledger - ${i}`] = {
      attempts: i % 4,
      lastPulseMs: old ? t0 - 49 * 3600000 : t0 - i * 60000,
      lastErrorMs: old ? t0 - 50 * 3600000 : t0 - i * 60000
    };
  }
  helpers._wd_pruneWebBackoff_(state, t0);
  assert.equal(Object.keys(state).some((name) => Number(name.split(' - ')[1]) < 25), false, 'entries older than 48 hours are removed');
  assert.ok(Object.keys(state).length <= 200, 'Web backoff state retains at most 200 entries');
}

{
  const malformed = loadWatchdogHelpers({ scriptProperties: { 'WD_WEB_BACKOFF:v1': '{bad json' } });
  assert.deepEqual(malformed._wd_loadWebBackoff_(), {}, 'malformed Web backoff JSON loads as an empty map');
  const state = { 'Ledger - Saved': { attempts: 1, lastPulseMs: t0, lastErrorMs: t0 } };
  malformed._wd_saveWebBackoff_(state, t0);
  assert.deepEqual(JSON.parse(malformed.__scriptProperties['WD_WEB_BACKOFF:v1']), state, 'Web backoff state saves as one JSON property');
}

{
  const state = {
    valid: { attempts: 4, lastPulseMs: t0, lastErrorMs: t0 },
    negativeAttempts: { attempts: -1, lastPulseMs: t0, lastErrorMs: t0 },
    fractionalAttempts: { attempts: 1.5, lastPulseMs: t0, lastErrorMs: t0 },
    excessiveAttempts: { attempts: 5, lastPulseMs: t0, lastErrorMs: t0 },
    negativePulse: { attempts: 1, lastPulseMs: -1, lastErrorMs: t0 },
    invalidError: { attempts: 1, lastPulseMs: t0, lastErrorMs: 'not-a-number' },
    notAnObject: 'bad'
  };
  helpers._wd_pruneWebBackoff_(state, t0);
  assert.deepEqual(Object.keys(state), ['valid'], 'malformed Web backoff entries are removed fail-closed');
}

for (const rawPartial of [null, '[]', '42', '"scalar"', '{bad json']) {
  const partialProps = rawPartial == null ? {} : { WD_PARTIAL_LAST: rawPartial };
  const partialHelpers = loadWatchdogHelpers({ scriptProperties: partialProps });
  assert.deepEqual(partialHelpers._wd_loadPartialPulseMap_(), {}, `invalid partial map ${String(rawPartial)} loads safely`);
}

{
  const mixedPartial = loadWatchdogHelpers({
    scriptProperties: {
      WD_PARTIAL_LAST: JSON.stringify({
        validZero: 0,
        validTimestamp: t0,
        numericString: String(t0),
        negative: -1,
        nullValue: null,
        objectValue: { ts: t0 },
        arrayValue: [t0]
      })
    }
  });
  assert.deepEqual(mixedPartial._wd_loadPartialPulseMap_(), {
    validZero: 0,
    validTimestamp: t0
  }, 'partial map retains only finite nonnegative numeric timestamps');
}

{
  const partialLoadFailure = loadWatchdogHelpers({ failLoad: true });
  const partialLoadStats = { b1Set: 0, b1Partial: 0, toSync: 0, stateErrors: 0 };
  const partialLoadActions = partialLoadFailure._wd_collectGlobalRefreshActions_([], t0, 5 * 3600000, '2026-07-18 00:00:00', partialLoadStats, [{
    sheetName: 'Ledger - Partial Load Failure', range: 'B1', value: '2026-07-18 00:00:00',
    type: 'pulse', reason: 'partial', priority: 250, staleAgeMs: 0
  }]);
  assert.equal(partialLoadActions.some((action) => action.type === 'pulse'), false, 'partial property load failure suppresses its B1 reservation');
  assert.ok(partialLoadStats.stateErrors >= 1, 'partial property load failure is reported');
}

{
  const progressionProps = {};
  const progression = loadWatchdogHelpers({ scriptProperties: progressionProps });
  const delays = [30 * 60000, 2 * 3600000, 6 * 3600000, 24 * 3600000];
  let lastPulseMs = t0;
  let errorTimestampMs = t0;
  for (let attempt = 0; attempt < delays.length; attempt++) {
    const nowMs = lastPulseMs + delays[attempt];
    const statsProgression = { b1Set: 0, b1Blocked: 0, b1Stale: 0, b1Empty: 0, b1Error: 0, toSync: 0 };
    const actionsProgression = progression._wd_collectGlobalRefreshActions_([{
      sheetName: 'Ledger - Progression',
      vA2: '1,00 €',
      vB1: '',
      vI1: `[WEB_SCAN_ERROR] ${progression._wd_fmtDate_(new Date(errorTimestampMs))}`,
      vJ1: ''
    }], nowMs, 5 * 3600000, progression._wd_fmtDate_(new Date(nowMs)), statsProgression);
    const pulse = actionsProgression.find((action) => action.type === 'pulse');
    assert.ok(pulse, `retry ${attempt + 1} is eligible after ${delays[attempt]}ms`);
    let saved = JSON.parse(progressionProps['WD_WEB_BACKOFF:v1'])['Ledger - Progression'];
    assert.equal(saved.attempts, attempt + 1, `retry ${attempt + 1} is reserved before B1`);
    assert.equal(saved.lastPulseMs, nowMs, `retry ${attempt + 1} reservation records its B1 boundary`);
    lastPulseMs = nowMs;

    if (attempt < delays.length - 1) {
      errorTimestampMs = nowMs + 60000;
      const earlyActions = progression._wd_collectGlobalRefreshActions_([{
        sheetName: 'Ledger - Progression',
        vA2: '1,00 €',
        vB1: '',
        vI1: `[WEB_SCAN_ERROR] ${progression._wd_fmtDate_(new Date(errorTimestampMs))}`,
        vJ1: ''
      }], errorTimestampMs, 5 * 3600000, progression._wd_fmtDate_(new Date(errorTimestampMs)), statsProgression);
      assert.equal(earlyActions.some((action) => action.type === 'pulse'), false, 'a fresh error timestamp does not reset retry cooldown');
      saved = JSON.parse(progressionProps['WD_WEB_BACKOFF:v1'])['Ledger - Progression'];
      assert.equal(saved.attempts, attempt + 1, 'a fresh error timestamp preserves attempts');
      assert.equal(saved.lastPulseMs, lastPulseMs, 'a fresh error timestamp preserves the actual pulse time');
      assert.equal(saved.lastErrorMs, errorTimestampMs, 'a fresh error timestamp updates lastErrorMs');
    }
  }
}
const stats = { b1Set: 0, b1Blocked: 0, b1Stale: 0, b1Empty: 0, b1Error: 0, toSync: 0 };
const actions = helpers._wd_collectGlobalRefreshActions_([
  {
    sheetName: 'Ledger - B2',
    vA2: '0,45 €',
    vB1: '2026-06-26 15:41:39',
    vI1: '[BLOCKED:QUOTA] 2026-06-27 12:39:14',
    vJ1: '2026-06-27 12:39:14'
  },
  {
    sheetName: 'Ledger - Healthy Stale',
    vA2: '1,00 €',
    vB1: '2026-06-26 15:41:39',
    vI1: '2026-06-27 17:40:48',
    vJ1: '2026-06-27 17:40:48'
  }
], helpers._wd_parseLocalDateTimeToMs_('2026-06-28 09:40:48'), 5 * 3600000, '2026-06-28 09:40:48', stats);

assert(
  actions.some((action) => action.type === 'pulse' && action.sheetName === 'Ledger - Healthy Stale'),
  'A [BLOCKED:QUOTA] row must not globally suppress B1 pulses for non-quota stale rows'
);

{
  const quota = helpers._wd_needsRefresh_('', '[BLOCKED:QUOTA] 2026-07-17 00:00:00', t0, 5 * 3600000);
  assert.equal(quota.needsPulse, false, 'quota rows are released only by the recovery sweep');
}

{
  const statsBudget = { b1Set: 0, b1Blocked: 0, b1Stale: 0, b1Empty: 0, b1Error: 0, toSync: 0 };
  const staleAndError = Array.from({ length: 12 }, (_, i) => ({
    sheetName: `Ledger - Candidate ${i}`,
    vA2: '1,00 €',
    vB1: '',
    vI1: i < 6 ? '[ERROR] scan failed' : '2026-07-17 00:00:00',
    vJ1: ''
  }));
  const partialCandidates = Array.from({ length: 3 }, (_, i) => ({
    sheet: null,
    sheetName: `Ledger - Partial ${i}`,
    range: 'B1',
    value: '2026-07-18 02:00:00',
    type: 'pulse',
    reason: 'partial',
    priority: 500,
    staleAgeMs: 0
  }));
  const budgetActions = helpers._wd_collectGlobalRefreshActions_(staleAndError, t0 + 2 * 3600000, 5 * 3600000, '2026-07-18 02:00:00', statsBudget, partialCandidates);
  const pulses = budgetActions.filter((action) => action.type === 'pulse');
  assert.ok(pulses.length <= 5, 'stale, error, and partial work share one five-pulse budget');
  assert.ok(pulses.some((action) => action.reason === 'partial'), 'partial candidates use the global collection path');
}

{
  const quotaHelpers = loadWatchdogHelpers({ quotaBlocked: true });
  const quotaStats = { b1Set: 0, b1Blocked: 0, b1Stale: 0, b1Empty: 0, b1Error: 0, toSync: 0 };
  const quotaActions = quotaHelpers._wd_collectGlobalRefreshActions_([{
    sheetName: 'Ledger - Stale Under Quota', vA2: '1,00 €', vB1: '', vI1: '2026-07-17 00:00:00', vJ1: ''
  }], t0 + 24 * 3600000, 5 * 3600000, '2026-07-19 00:00:00', quotaStats, [{
    sheet: null, sheetName: 'Ledger - Partial Under Quota', range: 'B1', value: '2026-07-19 00:00:00',
    type: 'pulse', reason: 'partial', priority: 250, staleAgeMs: 24 * 3600000
  }]);
  assert.equal(quotaActions.some((action) => action.type === 'pulse'), false, 'global quota suppression includes partial candidates');
}

{
  const dedupeStats = { b1Set: 0, b1Blocked: 0, b1Stale: 0, b1Empty: 0, b1Error: 0, toSync: 0 };
  const dedupeActions = helpers._wd_collectGlobalRefreshActions_([{
    sheetName: 'Ledger - Overlap', vA2: '1,00 €', vB1: '', vI1: '[ERROR] scan failed', vJ1: ''
  }], t0 + 24 * 3600000, 5 * 3600000, '2026-07-19 00:00:00', dedupeStats, [{
    sheet: null, sheetName: 'Ledger - Overlap', range: 'B1', value: '2026-07-19 00:00:00',
    type: 'pulse', reason: 'partial', priority: 250, staleAgeMs: 24 * 3600000
  }]);
  const overlapPulses = dedupeActions.filter((action) => action.type === 'pulse' && action.sheetName === 'Ledger - Overlap' && action.range === 'B1');
  assert.equal(overlapPulses.length, 1, 'overlapping partial and refresh candidates produce one B1 action');
  assert.equal(overlapPulses[0].reason, 'error', 'deduplication preserves the higher-priority candidate');
}

{
  const overlapProps = {
    'WD_WEB_BACKOFF:v1': JSON.stringify({
      'Ledger - Backoff Overlap': { attempts: 1, lastPulseMs: t0, lastErrorMs: t0 }
    })
  };
  const overlapHelpers = loadWatchdogHelpers({ scriptProperties: overlapProps });
  const overlapStats = { b1Set: 0, b1Blocked: 0, b1Stale: 0, b1Empty: 0, b1Error: 0, toSync: 0 };
  const overlapActions = overlapHelpers._wd_collectGlobalRefreshActions_([{
    sheetName: 'Ledger - Backoff Overlap', vA2: '1,00 €', vB1: '', vI1: '[WEB_SCAN_ERROR] 2026-07-18 00:30:00', vJ1: ''
  }], t0 + 60 * 60000, 5 * 3600000, '2026-07-18 01:00:00', overlapStats, [{
    sheetName: 'Ledger - Backoff Overlap', range: 'B1', value: '2026-07-18 01:00:00',
    type: 'pulse', reason: 'partial', priority: 250, staleAgeMs: 0
  }]);
  assert.equal(overlapActions.some((action) => action.type === 'pulse'), false, 'active Web backoff suppresses an overlapping partial pulse');
}

{
  const deferredStats = { b1Set: 0, b1Blocked: 0, b1Stale: 0, b1Empty: 0, b1Error: 0, toSync: 0 };
  const deferredActions = helpers._wd_collectGlobalRefreshActions_([{
    sheetName: 'Ledger - Deferred', vA2: '', vB1: '', vI1: '[WEB_SCAN_DEFERRED] N/A', vJ1: '2026-07-17 00:00:00'
  }], t0, 5 * 3600000, '2026-07-18 00:00:00', deferredStats);
  assert.deepEqual(deferredActions, [], 'deferred scans neither retry B1 nor sync J1');
}

for (const failure of ['failLoad', 'failSave']) {
  const failingHelpers = loadWatchdogHelpers({ [failure]: true });
  const failureStats = { b1Set: 0, b1Blocked: 0, b1Stale: 0, b1Empty: 0, b1Error: 0, toSync: 0 };
  const failureActions = failingHelpers._wd_collectGlobalRefreshActions_([
    { sheetName: 'Ledger - Web Error', vA2: '1,00 €', vB1: '', vI1: '[WEB_SCAN_ERROR] 2026-07-18 00:00:00', vJ1: '' },
    { sheetName: 'Ledger - Stale', vA2: '1,00 €', vB1: '', vI1: '2026-07-17 00:00:00', vJ1: '' }
  ], t0 + 6 * 3600000, 5 * 3600000, '2026-07-18 06:00:00', failureStats);
  assert.equal(failureActions.some((action) => action.sheetName === 'Ledger - Web Error' && action.type === 'pulse'), false, `${failure} suppresses Web-error pulses`);
  assert.equal(failureActions.some((action) => action.sheetName === 'Ledger - Stale' && action.type === 'pulse'), true, `${failure} preserves stale scheduling`);
}

{
  const budgetProps = {};
  const budgetHelpers = loadWatchdogHelpers({ scriptProperties: budgetProps });
  const budgetStats = { b1Set: 0, b1Blocked: 0, b1Stale: 0, b1Empty: 0, b1Error: 0, toSync: 0 };
  const webErrors = Array.from({ length: 6 }, (_, i) => ({
    sheetName: `Ledger - Web ${i}`,
    vA2: '1,00 €',
    vB1: '',
    vI1: '[WEB_SCAN_ERROR] 2026-07-18 00:00:00',
    vJ1: ''
  }));
  const webActions = budgetHelpers._wd_collectGlobalRefreshActions_(webErrors, t0 + 30 * 60000, 5 * 3600000, '2026-07-18 00:30:00', budgetStats);
  const selectedNames = new Set(webActions.filter((action) => action.type === 'pulse').map((action) => action.sheetName));
  const saved = JSON.parse(budgetProps['WD_WEB_BACKOFF:v1']);
  const unselectedName = webErrors.map((item) => item.sheetName).find((name) => !selectedNames.has(name));
  assert.equal(saved[unselectedName].attempts, 0, 'an unselected Web error does not advance its backoff attempt');
  assert.equal(saved[unselectedName].lastPulseMs, budgetHelpers._wd_parseLocalDateTimeToMs_('2026-07-18 00:00:00'), 'an unselected Web error keeps its original pulse boundary');
  for (const selectedName of selectedNames) {
    assert.equal(saved[selectedName].attempts, 1, 'collection reserves selected Web errors before B1');
  }
}

{
  const changedAt = helpers._wd_parseLocalDateTimeToMs_('2026-07-18 06:00:00');
  const changedProps = {
    'WD_WEB_BACKOFF:v1': JSON.stringify({
      'Ledger - Changed Error': { attempts: 3, lastPulseMs: t0, lastErrorMs: t0 }
    })
  };
  const changedHelpers = loadWatchdogHelpers({ scriptProperties: changedProps });
  const changedStats = { b1Set: 0, b1Blocked: 0, b1Stale: 0, b1Empty: 0, b1Error: 0, toSync: 0 };
  const changedActions = changedHelpers._wd_collectGlobalRefreshActions_([{
    sheetName: 'Ledger - Changed Error', vA2: '1,00 €', vB1: '', vI1: '[WEB_SCAN_ERROR] 2026-07-18 06:00:00', vJ1: ''
  }], changedAt + 60000, 5 * 3600000, '2026-07-18 06:01:00', changedStats);
  const changedSaved = JSON.parse(changedProps['WD_WEB_BACKOFF:v1'])['Ledger - Changed Error'];
  assert.equal(changedActions.some((action) => action.type === 'pulse'), false, 'a changed Web error keeps the existing 24-hour retry boundary');
  assert.equal(changedSaved.attempts, 3, 'a changed Web error preserves attempts before B1 succeeds');
  assert.equal(changedSaved.lastPulseMs, t0, 'a changed Web error preserves the last actual pulse timestamp');
  assert.equal(changedSaved.lastErrorMs, changedAt, 'a changed Web error persists its new baseline immediately');
}

{
  const writeProps = {};
  const writeHelpers = loadWatchdogHelpers({ scriptProperties: writeProps });
  const writeStats = { b1Set: 0, b1Blocked: 0, b1Stale: 0, b1Empty: 0, b1Error: 0, toSync: 0 };
  const partialCandidate = {
    sheetName: 'Ledger - Failed Partial', range: 'B1', value: '2026-07-18 00:30:00',
    type: 'pulse', reason: 'partial', priority: 250, staleAgeMs: 0
  };
  let reservedActions = writeHelpers._wd_collectGlobalRefreshActions_([{
    sheetName: 'Ledger - Failed Web', vA2: '1,00 €', vB1: '', vI1: '[WEB_SCAN_ERROR] 2026-07-18 00:00:00', vJ1: ''
  }], t0 + 30 * 60000, 5 * 3600000, '2026-07-18 00:30:00', writeStats, [partialCandidate]);
  assert.equal(JSON.parse(writeProps['WD_WEB_BACKOFF:v1'])['Ledger - Failed Web'].attempts, 1, 'Web retry is reserved before spreadsheet B1');
  assert.equal(JSON.parse(writeProps.WD_PARTIAL_LAST)['Ledger - Failed Partial'], t0 + 30 * 60000, 'partial cooldown is reserved before spreadsheet B1');
  const missingSpreadsheet = { getSheetByName: () => null };
  const failed = writeHelpers._wd_applySpreadsheetActions_(missingSpreadsheet, reservedActions, t0 + 30 * 60000, 5);
  assert.equal(failed.pulses, 0, 'missing spreadsheet targets report no successful pulses');
  assert.equal(failed.stateErrors, 0, 'successful rollback reports no state error');
  assert.equal(JSON.parse(writeProps['WD_WEB_BACKOFF:v1'])['Ledger - Failed Web'].attempts, 0, 'failed spreadsheet B1 rolls back Web reservation');
  assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(writeProps.WD_PARTIAL_LAST), 'Ledger - Failed Partial'), false, 'failed spreadsheet B1 rolls back partial reservation');

  const ranges = {};
  const successfulSpreadsheet = {
    getSheetByName: (name) => ({
      getRange: () => ({
        setValue: (value) => { ranges[name] = value; },
        setNumberFormat() {}
      })
    })
  };
  reservedActions = writeHelpers._wd_collectGlobalRefreshActions_([{
    sheetName: 'Ledger - Failed Web', vA2: '1,00 €', vB1: '', vI1: '[WEB_SCAN_ERROR] 2026-07-18 00:00:00', vJ1: ''
  }], t0 + 30 * 60000, 5 * 3600000, '2026-07-18 00:30:00', writeStats, [partialCandidate]);
  const savesBeforeWrite = writeHelpers.__propertyCalls().set;
  const succeeded = writeHelpers._wd_applySpreadsheetActions_(successfulSpreadsheet, reservedActions, t0 + 30 * 60000, 5);
  assert.equal(succeeded.pulses, 2, 'successful spreadsheet writes report actual pulse count');
  assert.equal(succeeded.stateErrors, 0);
  assert.equal(writeHelpers.__propertyCalls().set, savesBeforeWrite, 'successful spreadsheet B1 performs no post-write state save');
  assert.equal(JSON.parse(writeProps['WD_WEB_BACKOFF:v1'])['Ledger - Failed Web'].attempts, 1, 'successful spreadsheet B1 keeps its reservation');
  assert.equal(JSON.parse(writeProps.WD_PARTIAL_LAST)['Ledger - Failed Partial'], t0 + 30 * 60000, 'successful spreadsheet B1 keeps its partial reservation');
}

{
  const conservativeProps = {};
  const conservative = loadWatchdogHelpers({ scriptProperties: conservativeProps, failSetPropertyCalls: [3, 4] });
  const conservativeStats = { b1Set: 0, b1Blocked: 0, b1Stale: 0, b1Empty: 0, b1Error: 0, toSync: 0 };
  const conservativeActions = conservative._wd_collectGlobalRefreshActions_([{
    sheetName: 'Ledger - Conservative Web', vA2: '1,00 €', vB1: '', vI1: '[WEB_SCAN_ERROR] 2026-07-18 00:00:00', vJ1: ''
  }], t0 + 30 * 60000, 5 * 3600000, '2026-07-18 00:30:00', conservativeStats, [{
    sheetName: 'Ledger - Conservative Partial', range: 'B1', value: '2026-07-18 00:30:00',
    type: 'pulse', reason: 'partial', priority: 250, staleAgeMs: 0
  }]);
  const rollbackFailure = conservative._wd_applySpreadsheetActions_({ getSheetByName: () => null }, conservativeActions, t0 + 30 * 60000, 5);
  assert.equal(rollbackFailure.stateErrors, 2, 'rollback failures are explicit and do not throw');
  assert.equal(JSON.parse(conservativeProps['WD_WEB_BACKOFF:v1'])['Ledger - Conservative Web'].attempts, 1, 'failed Web rollback retains conservative reservation');
  assert.equal(JSON.parse(conservativeProps.WD_PARTIAL_LAST)['Ledger - Conservative Partial'], t0 + 30 * 60000, 'failed partial rollback retains conservative reservation');
}

{
  const reservationProps = {};
  const reservationFailure = loadWatchdogHelpers({ scriptProperties: reservationProps, failSave: true });
  const reservationStats = { b1Set: 0, b1Blocked: 0, b1Stale: 0, b1Empty: 0, b1Error: 0, toSync: 0 };
  const reservationActions = reservationFailure._wd_collectGlobalRefreshActions_([{
    sheetName: 'Ledger - Unreserved Web', vA2: '1,00 €', vB1: '', vI1: '[WEB_SCAN_ERROR] 2026-07-18 00:00:00', vJ1: ''
  }], t0 + 30 * 60000, 5 * 3600000, '2026-07-18 00:30:00', reservationStats, [{
    sheetName: 'Ledger - Unreserved Partial', range: 'B1', value: '2026-07-18 00:30:00',
    type: 'pulse', reason: 'partial', priority: 250, staleAgeMs: 0
  }]);
  let writes = 0;
  const execution = reservationFailure._wd_applySpreadsheetActions_({ getSheetByName: () => ({ getRange: (a1) => ({ setValue: () => { if (a1 === 'B1') writes++; }, setNumberFormat() {} }) }) }, reservationActions, t0 + 30 * 60000, 5);
  assert.equal(execution.pulses, 0, 'reservation failure suppresses all affected B1 actions');
  assert.equal(writes, 0, 'reservation failure causes zero B1 writes');
  assert.ok(reservationStats.stateErrors >= 1, 'reservation failures are reported explicitly');
}

{
  const apiProps = {};
  const failingApi = loadWatchdogHelpers({ scriptProperties: apiProps, failApiWrite: true });
  const apiStats = { b1Set: 0, b1Blocked: 0, b1Stale: 0, b1Empty: 0, b1Error: 0, toSync: 0 };
  const apiActions = failingApi._wd_collectGlobalRefreshActions_([{
    sheetName: 'Ledger - API Web', vA2: '1,00 €', vB1: '', vI1: '[WEB_SCAN_ERROR] 2026-07-18 00:00:00', vJ1: ''
  }], t0 + 30 * 60000, 5 * 3600000, '2026-07-18 00:30:00', apiStats, [{
    sheetName: 'Ledger - API Partial', range: 'B1', value: '2026-07-18 00:30:00',
    type: 'pulse', reason: 'partial', priority: 250, staleAgeMs: 0
  }]);
  assert.throws(() => failingApi._wd_executeApiActions_(apiActions, t0 + 30 * 60000), /api write failed/);
  assert.equal(JSON.parse(apiProps['WD_WEB_BACKOFF:v1'])['Ledger - API Web'].attempts, 0, 'failed API batch rolls back Web reservation');
  assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(apiProps.WD_PARTIAL_LAST), 'Ledger - API Partial'), false, 'failed API batch rolls back partial reservation');

  const successfulApi = loadWatchdogHelpers({ scriptProperties: apiProps });
  const reservedApiActions = successfulApi._wd_collectGlobalRefreshActions_([{
    sheetName: 'Ledger - API Web', vA2: '1,00 €', vB1: '', vI1: '[WEB_SCAN_ERROR] 2026-07-18 00:00:00', vJ1: ''
  }], t0 + 30 * 60000, 5 * 3600000, '2026-07-18 00:30:00', apiStats, [{
    sheetName: 'Ledger - API Partial', range: 'B1', value: '2026-07-18 00:30:00',
    type: 'pulse', reason: 'partial', priority: 250, staleAgeMs: 0
  }]);
  const apiSavesBeforeWrite = successfulApi.__propertyCalls().set;
  const apiSuccess = successfulApi._wd_executeApiActions_(reservedApiActions, t0 + 30 * 60000);
  assert.equal(apiSuccess.writes, reservedApiActions.length, 'successful API batch returns its write count');
  assert.equal(apiSuccess.stateErrors, 0);
  assert.equal(successfulApi.__propertyCalls().set, apiSavesBeforeWrite, 'successful API B1 performs no post-write state save');
  assert.equal(JSON.parse(apiProps['WD_WEB_BACKOFF:v1'])['Ledger - API Web'].attempts, 1, 'successful API B1 advances Web backoff');
  assert.equal(JSON.parse(apiProps.WD_PARTIAL_LAST)['Ledger - API Partial'], t0 + 30 * 60000, 'successful API B1 persists partial cooldown');
  const missingApiAction = { range: 'B1', value: 'x', type: 'pulse', reason: 'partial' };
  assert.equal(successfulApi._wd_executeApiActions_([missingApiAction], t0 + 31 * 60000).writes, 0, 'API actions without a sheet target are not written');
  assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(apiProps.WD_PARTIAL_LAST), 'undefined'), false, 'missing API targets do not persist pulse state');
}

{
  const refresh = helpers._wd_needsRefresh_('0,00 €', '[CACHE_ONLY] [FRESH] N/A', helpers._wd_parseLocalDateTimeToMs_('2026-07-08 19:45:00'), 5 * 3600000);
  assert.equal(refresh.needsPulse, true, '[CACHE_ONLY] [FRESH] N/A must pulse B1 because it has no usable cache timestamp');
  assert.equal(refresh.reason, 'empty');
}

{
  const statsA2 = { b1Set: 0, b1Blocked: 0, b1Stale: 0, b1Empty: 0, b1Error: 0, toSync: 0 };
  const actionsA2 = helpers._wd_collectGlobalRefreshActions_([
    {
      sheetName: 'Ledger - Aurora',
      vA2: '#ERROR!',
      vB1: '2026-07-08 20:16:06',
      vI1: 'WEB_SCAN_OK 2026-07-08 20:16:28',
      vJ1: '2026-07-08 20:16:28'
    }
  ], helpers._wd_parseLocalDateTimeToMs_('2026-07-08 21:10:00'), 5 * 3600000, '2026-07-08 21:10:00', statsA2);
  assert.deepEqual(actionsA2, [{
    sheet: null,
    sheetName: 'Ledger - Aurora',
    range: 'J1',
    value: '2026-07-08 20:16:29',
    type: 'sync',
    reason: 'a2_error_recalc'
  }], 'A2 custom-function errors should bump J1 by one second without pulsing B1');
}

{
  const statsBlankTotal = { b1Set: 0, b1Blocked: 0, b1Stale: 0, b1Empty: 0, b1Error: 0, toSync: 0 };
  const actionsBlankTotal = helpers._wd_collectGlobalRefreshActions_([
    {
      sheetName: 'Ledger - Mezo',
      vA2: '',
      vB1: '2026-07-08 20:20:05',
      vI1: 'WEB_SCAN_OK 2026-07-08 20:21:35',
      vJ1: '2026-07-08 20:21:35'
    }
  ], helpers._wd_parseLocalDateTimeToMs_('2026-07-08 21:10:00'), 5 * 3600000, '2026-07-08 21:10:00', statsBlankTotal);
  assert.deepEqual(actionsBlankTotal, [{
    sheet: null,
    sheetName: 'Ledger - Mezo',
    range: 'J1',
    value: '2026-07-08 20:21:36',
    type: 'sync',
    reason: 'a2_error_recalc'
  }], 'Blank Recap total with fresh I1/J1 should bump J1 by one second, not B1');
}

console.log('watchdog quota guard OK');
