const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', '16_REFRESH.gs'), 'utf8');
assert.match(source, /Version:\s*v4\.16\.47[\s\S]*var\s+REFRESH_VERSION\s*=\s*["']4\.16\.47["']/, 'watchdog version must advance to 4.16.47');
assert.match(source, /WCORE_WATCHDOG_LEASE_TTL_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/, 'watchdog lease TTL must exceed the six-minute GAS runtime ceiling');

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
assert.strictEqual(Number(maxPulsesMatch[1]), 10, 'WATCHDOG should allow at most 10 B1 pulses per run');
const maxJ1Match = source.match(/var\s+SYNC_J1_MAX_SYNCS_PER_RUN\s*=\s*(\d+)\s*;/);
assert(maxJ1Match, 'SYNC_J1_MAX_SYNCS_PER_RUN must be defined');
assert.strictEqual(Number(maxJ1Match[1]), 20, 'J1 writes must be capped at 20 per run');

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
    '_wd_selectFairJ1Actions_',
    '_wd_applyJ1Actions_',
    '_wd_shouldSyncJ1_',
    '_wd_needsRefresh_',
    '_wd_isSystemBlocked_',
    '_wd_tryUnblock_'
  ];
  const code = names.map(extractFunction).join('\n');
  let getPropertyCalls = 0;
  let setPropertyCalls = 0;
  let j1ClaimHeld = false;
  const context = {
    WD_MAX_PULSES_PER_RUN: 5,
    WD_CYCLE_SLOTS_PER_RUN: 4,
    WD_PULSE_MIN: 10,
    WD_PULSE_MIN_BLOCKED: 30,
    WD_WEB_ERROR_BACKOFF_MS: [30 * 60000, 2 * 3600000, 6 * 3600000, 24 * 3600000],
    WD_WEB_BACKOFF_MAX_ENTRIES: 200,
    WD_WEB_BACKOFF_RETENTION_MS: 48 * 3600000,
    P_WD_PARTIAL_LAST: 'WD_PARTIAL_LAST',
    P_WD_J1_CURSOR: 'WD_J1_CURSOR',
    P_SYNC_J1_CURSOR: 'SYNC_J1_CURSOR',
    SYNC_J1_MAX_SYNCS_PER_RUN: 20,
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
    LockService: { getScriptLock: () => ({
      tryLock: () => {
        if (options.j1ClaimBusy || j1ClaimHeld) return false;
        j1ClaimHeld = true;
        return true;
      },
      releaseLock: () => { j1ClaimHeld = false; },
    }) },
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
for (const [name, entryPoint] of [['main watchdog', watchdog], ['API diagnostic', watchdogApiDiag], ['forced partial check', forcePartial]]) {
  assert.match(entryPoint, /_wcoreAcquireLease_\(WCORE_WATCHDOG_LEASE_KEY/, `${name} must acquire the dedicated watchdog lease`);
  assert.match(entryPoint, /finally[\s\S]*_wcoreReleaseLease_\(WCORE_WATCHDOG_LEASE_KEY/, `${name} must owner-safely release the watchdog lease in finally`);
  assert.doesNotMatch(entryPoint, /LockService\.getScriptLock\(\)/, `${name} must not hold ScriptLock around watchdog work`);
}
assert.doesNotMatch(watchdogApi, /LockService|getScriptLock|tryLock/, 'internal API fallback must not acquire a nested ScriptLock');
assert.doesNotMatch(partialCheck, /LockService|getScriptLock|tryLock/, 'internal partial collector must not acquire a nested ScriptLock');
assert.doesNotMatch(watchdog, /WCORE_AUTO_HEAL\s*\(/, 'WATCHDOG_FROM_RECAP must not run auto-heal inline');
assert.doesNotMatch(watchdog, /_ensureLedgerCache_\s*\(/, 'WATCHDOG_FROM_RECAP must not rebuild ledger cache inline');
assert.doesNotMatch(watchdog, /_wd_maybeSheetCacheCleanup_\s*\(|_emergencyPurge_\s*\(/, 'WATCHDOG_FROM_RECAP must not run maintenance inline');

const leaseAcquireStart = source.indexOf('function _wcoreAcquireLease_(');
const leaseReleaseStart = source.indexOf('function _wcoreReleaseLease_(');
assert.notEqual(leaseAcquireStart, -1, '_wcoreAcquireLease_ must implement atomic owner leases');
assert.notEqual(leaseReleaseStart, -1, '_wcoreReleaseLease_ must implement owner-safe release');
const leaseAcquire = extractFunction('_wcoreAcquireLease_');
const leaseRelease = extractFunction('_wcoreReleaseLease_');

function loadLeaseHelpers(initial = {}, now = 1000) {
  const props = { ...initial };
  const calls = { acquired: 0, released: 0, deleted: 0 };
  const context = {
    Date: { now: () => now },
    JSON,
    Number,
    String,
    isFinite,
    Utilities: { getUuid: () => `owner-${calls.acquired + 1}` },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => Object.prototype.hasOwnProperty.call(props, key) ? props[key] : null,
      setProperty: (key, value) => { props[key] = String(value); },
      deleteProperty: (key) => { delete props[key]; calls.deleted++; },
    }) },
    LockService: { getScriptLock: () => ({
      tryLock: () => { calls.acquired++; return true; },
      releaseLock: () => { calls.released++; },
    }) },
  };
  vm.createContext(context);
  vm.runInContext(`${leaseAcquire}\n${leaseRelease}`, context);
  context.__props = props;
  context.__calls = calls;
  return context;
}

{
  const leases = loadLeaseHelpers({}, 1000);
  const autoOwner = leases._wcoreAcquireLease_('WCORE_AUTO_HEAL_LEASE', 600000, 'slow-autoheal');
  const watchdogOwner = leases._wcoreAcquireLease_('WCORE_WATCHDOG_LEASE', 360000, 'watchdog');
  assert.equal(autoOwner, 'slow-autoheal');
  assert.equal(watchdogOwner, 'watchdog', 'a slow auto-heal lease must not block the watchdog lease');
  assert.equal(leases._wcoreReleaseLease_('WCORE_AUTO_HEAL_LEASE', 'wrong-owner'), false, 'lease release must reject a different owner');
  assert.equal(leases._wcoreReleaseLease_('WCORE_AUTO_HEAL_LEASE', 'slow-autoheal'), true, 'lease owner must release its lease');
  assert.equal(leases.__calls.acquired, leases.__calls.released, 'ScriptLock is released after every atomic lease mutation');
}

{
  const stale = loadLeaseHelpers({ WCORE_WATCHDOG_LEASE: JSON.stringify({ owner: 'dead', until: 999 }) }, 1000);
  assert.equal(stale._wcoreAcquireLease_('WCORE_WATCHDOG_LEASE', 360000, 'recovery'), 'recovery', 'expired watchdog leases must be recoverable');
  assert.equal(JSON.parse(stale.__props.WCORE_WATCHDOG_LEASE).owner, 'recovery');
}

assert(
  !/blockedReason\s*===\s*["']QUOTA["'][\s\S]*QuotaCircuitBreaker\.reset\s*\(/.test(tryUnblock),
  '_wd_tryUnblock_(QUOTA) must not reset quota breaker before pulsing B1'
);

function loadPublicEntryPoints(options = {}) {
  const calls = { internal: 0, release: 0, writes: 0 };
  const ss = { getSpreadsheetTimeZone: () => 'Europe/Paris' };
  const context = {
    Date,
    WCORE_WATCHDOG_LEASE_KEY: 'WCORE_WATCHDOG_LEASE',
    WCORE_WATCHDOG_LEASE_TTL_MS: 360000,
    _wcoreAcquireLease_: () => options.lockBusy ? null : 'watchdog-owner',
    _wcoreReleaseLease_: () => { calls.release++; return true; },
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
const t0 = helpers._wd_parseLocalDateTimeToMs_('2026-07-18 00:00:00');

{
  const invalidTimestamps = [
    '2026-07-17 23:59:00 trailing',
    '2026-07-17 23:59:00  ',
    '2026-07-17  23:59:00',
    '2026-02-30 12:00:00',
    '2026-07-17 25:00:00',
    '2026-07-17 23:61:00',
    '2026-07-17 23:59:61',
    '2026-02-30T12:00:00.000Z',
    '2026-07-17T23:59:00.000Z trailing'
  ];
  for (const timestamp of invalidTimestamps) {
    assert.equal(Number.isNaN(helpers._wd_parseLocalDateTimeToMs_(timestamp)), true, `${timestamp} is rejected instead of normalized`);
    assert.equal(helpers._wd_isLastUpdateFormat_(timestamp), false, `${timestamp} is not a valid last-update value`);
  }

  for (const timestamp of [
    '2024-02-29 12:34',
    '2024-02-29 12:34:56',
    '2026-07-19T08:00:00',
    '2026-06-26T17:00:00Z',
    '2026-06-26T17:00:00.000Z',
    '2026-06-26T19:00:00+02:00'
  ]) {
    assert.equal(Number.isFinite(helpers._wd_parseLocalDateTimeToMs_(timestamp)), true, `${timestamp} remains supported`);
    assert.equal(helpers._wd_isLastUpdateFormat_(timestamp), true, `${timestamp} remains a valid last-update value`);
  }

  if (process.env.TZ === 'Europe/Paris') {
    assert.equal(Number.isNaN(helpers._wd_parseLocalDateTimeToMs_('2026-03-29 02:30:00')), true, 'Paris spring-forward gap is rejected by local roundtrip');
    assert.equal(Number.isNaN(helpers._wd_parseLocalDateTimeToMs_('2026-03-29T02:30:00')), true, 'Paris spring-forward gap is rejected for zone-less local ISO');
    assert.equal(helpers._wd_isLastUpdateFormat_('2026-03-29T02:30:00'), false, 'Paris gap ISO is not a valid last-update value');
    assert.equal(Number.isFinite(helpers._wd_parseLocalDateTimeToMs_('2026-03-29 03:30:00')), true, 'generated Paris post-transition time remains valid');
    assert.equal(Number.isFinite(helpers._wd_parseLocalDateTimeToMs_('2026-03-29T03:30:00')), true, 'post-transition local ISO remains valid');

    const parisSecondOccurrence = Date.parse('2026-10-25T01:30:00Z');
    assert.equal(helpers._wd_parseLocalDateTimeToMs_('2026-10-25 02:30:00'), parisSecondOccurrence, 'Paris fall-back local timestamp resolves to the latest matching occurrence');
    assert.equal(helpers._wd_parseLocalDateTimeToMs_('2026-10-25T02:30:00'), parisSecondOccurrence, 'Paris fall-back zone-less ISO resolves to the latest matching occurrence');
    assert.equal(helpers._wd_shouldPulseB1_('2026-10-25 02:30:00', parisSecondOccurrence + 9 * 60000, 10), false, 'fall-back cooldown does not pulse before ten minutes from the second occurrence');
    assert.equal(helpers._wd_shouldPulseB1_('2026-10-25 02:30:00', parisSecondOccurrence + 10 * 60000, 10), true, 'fall-back cooldown pulses at ten minutes from the second occurrence');
  }
}

{
  const tonStatus = 'TON_SCAN_OK 2026-07-17 18:00:00';
  assert.equal(helpers._wd_extractTimestamp_(tonStatus), '2026-07-17 18:00:00', 'watchdog extracts TON success timestamps');
  assert.equal(helpers._wd_extractSuccessTimestamp_(tonStatus), '2026-07-17 18:00:00', 'legacy latch repair extracts TON success timestamps');
  assert.equal(helpers._wd_shouldSyncJ1_(tonStatus, '2026-07-17 17:00:00'), true, 'TON success status is accepted for J1 sync');
  assert.equal(helpers._wd_staleAgeMs_(tonStatus, t0), 6 * 3600000, 'TON success status contributes parseable stale age');

  const tonProps = {
    'WD_WEB_BACKOFF:v1': JSON.stringify({
      'Ledger - TON Explicit': { attempts: 2, lastPulseMs: t0 - 3 * 3600000, lastErrorMs: t0 - 3 * 3600000 }
    })
  };
  const tonHelpers = loadWatchdogHelpers({ scriptProperties: tonProps });
  const tonActions = tonHelpers._wd_collectGlobalRefreshActions_([{
    sheetName: 'Ledger - TON Explicit',
    vA2: '1,00 €',
    vB1: '2026-07-17 17:00:00',
    vI1: tonStatus,
    vJ1: '2026-07-17 17:00:00'
  }], t0, 5 * 3600000, '2026-07-18 00:00:00', makeStats());
  assert.ok(tonActions.some((action) => action.type === 'pulse' && action.reason === 'stale'), 'scheduler treats old TON success as ordinary stale work');
  assert.ok(tonActions.some((action) => action.type === 'sync' && action.range === 'J1' && action.value === '2026-07-17 18:00:00'), 'SYNC_J1 receives the extracted TON timestamp');
  assert.equal(JSON.parse(tonProps['WD_WEB_BACKOFF:v1'])['Ledger - TON Explicit'], undefined, 'healthy TON success clears Web-error backoff state');
}

function makeStats() {
  return { b1Set: 0, b1Blocked: 0, b1Stale: 0, b1Empty: 0, b1Error: 0, toSync: 0 };
}

function cycleAge(item, nowMs) {
  const i1Ms = helpers._wd_parseLocalDateTimeToMs_(helpers._wd_extractTimestamp_(item.vI1 || ''));
  const b1Ms = helpers._wd_parseLocalDateTimeToMs_(item.vB1 || '');
  const valid = [i1Ms, b1Ms].filter(Number.isFinite);
  return valid.length ? Math.max(0, nowMs - Math.max(...valid)) : Number.MAX_SAFE_INTEGER;
}

function expectedOldestCycleNames(items, nowMs, count = 4) {
  return items
    .filter((item) => !helpers._wd_isCexSheet_(item.sheetName))
    .filter((item) => !String(item.vI1 || '').startsWith('[BLOCKED:QUOTA]'))
    .filter((item) => !String(item.vI1 || '').startsWith('[WEB_SCAN_ERROR]'))
    .filter((item) => {
      const refresh = helpers._wd_needsRefresh_(item.vA2 || '', item.vI1 || '', nowMs, 5 * 3600000);
      return !refresh.needsPulse || refresh.reason === 'stale';
    })
    .filter((item) => helpers._wd_shouldPulseB1_(item.vB1 || '', nowMs, 10))
    .sort((a, b) => cycleAge(b, nowMs) - cycleAge(a, nowMs) || a.sheetName.localeCompare(b.sheetName))
    .slice(0, count)
    .map((item) => item.sheetName);
}

function runFairnessSimulation(items, maxRuns = 31, advanceI1 = true) {
  const firstSelectedRun = new Map();
  const runDetails = [];
  for (let run = 0; run < maxRuns && firstSelectedRun.size < items.length; run++) {
    const nowMs = t0 + run * 10 * 60000;
    const nowStr = helpers._wd_fmtDate_(new Date(nowMs));
    const expectedCycle = expectedOldestCycleNames(items, nowMs);
    const actions = helpers._wd_collectGlobalRefreshActions_(items, nowMs, 5 * 3600000, nowStr, makeStats());
    const pulses = actions.filter((action) => action.type === 'pulse');
    const selectedNames = new Set(pulses.map((action) => action.sheetName));
    const ordinaryPulses = pulses.filter((action) => action.reason === 'cycle' || action.reason === 'stale');
    const ordinaryNames = new Set(ordinaryPulses.map((action) => action.sheetName));
    const cycleSelections = expectedCycle.filter((name) => ordinaryNames.has(name));
    runDetails.push({ pulses, expectedCycle, cycleSelections });

    assert.ok(pulses.length <= 5, `run ${run + 1} stays within the five-pulse cap`);
    assert.equal(selectedNames.size, pulses.length, `run ${run + 1} contains distinct pulse targets`);
    if (expectedCycle.length >= 4) {
      assert.equal(cycleSelections.length, 4, `run ${run + 1} reserves four oldest cycle targets`);
      assert.ok(ordinaryPulses.length >= 4, `run ${run + 1} returns at least four actual ordinary actions`);
      assert.ok(pulses.length - ordinaryPulses.length <= 1, `run ${run + 1} reserves at most one distinct urgent slot`);
    }

    for (const pulse of pulses) {
      if (!firstSelectedRun.has(pulse.sheetName)) firstSelectedRun.set(pulse.sheetName, run + 1);
      const item = items.find((candidate) => candidate.sheetName === pulse.sheetName);
      item.vA2 = '1,00 €';
      item.vB1 = nowStr;
      if (advanceI1) {
        item.vI1 = nowStr;
        item.vJ1 = nowStr;
      }
    }
  }
  return { firstSelectedRun, runDetails };
}

{
  const j1Props = {};
  const j1Helpers = loadWatchdogHelpers({ scriptProperties: j1Props });
  const staleJ1 = Array.from({ length: 105 }, (_, i) => ({
    sheetName: `Ledger - Watchdog J1 ${String(i).padStart(3, '0')}`,
    vA2: '1,00 €',
    vB1: '2026-07-18 00:00:00',
    vI1: '2026-07-18 01:00:00',
    vJ1: '2026-07-17 00:00:00'
  }));
  const covered = new Set();
  for (let run = 0; run < 6; run++) {
    const actions = j1Helpers._wd_collectGlobalRefreshActions_(staleJ1, t0 + run * 600000, 5 * 3600000, '2026-07-18 02:00:00', makeStats());
    const syncs = actions.filter((action) => action.type === 'sync');
    assert.ok(syncs.length <= 20, `watchdog J1 run ${run + 1} writes at most 20 latches`);
    syncs.forEach((action) => covered.add(action.sheetName));
  }
  assert.equal(covered.size, 105, 'watchdog J1 cursor must fairly serve all 105 stale latches');
  assert.ok(Number(j1Props.WD_J1_CURSOR) >= 0, 'watchdog J1 fairness cursor must be persisted');
}

function loadDedicatedJ1Sync() {
  const props = {};
  const names = Array.from({ length: 105 }, (_, i) => `Ledger - Dedicated J1 ${String(i).padStart(3, '0')}`);
  const selectedRuns = [];
  let batchCalls = 0;
  const ss = {
    getSheetByName: (name) => name === 'Recap Portfolio' ? {
      getLastRow: () => names.length + 1,
      getRange: (row, col) => ({ getValues: () => {
        if (col === 1) return names.map((name) => [name]);
        if (col === 6) return names.map(() => ['2026-07-18 01:00:00']);
        return names.map(() => ['2026-07-17 00:00:00']);
      } })
    } : { getRange: () => ({ setValue() {}, setNumberFormat() {} }) }
  };
  const context = {
    Date,
    JSON,
    Number,
    String,
    Math,
    isFinite,
    P_SYNC_J1_CURSOR: 'SYNC_J1_CURSOR',
    SYNC_J1_MAX_SYNCS_PER_RUN: 20,
    WCORE_SPREADSHEET_ID: 'spreadsheet-id',
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => Object.prototype.hasOwnProperty.call(props, key) ? props[key] : null,
      setProperty: (key, value) => { props[key] = String(value); },
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Sheets: { Spreadsheets: { Values: { batchUpdate: (request, spreadsheetId) => {
      batchCalls++;
      assert.equal(spreadsheetId, 'spreadsheet-id', 'J1 batch must target the configured spreadsheet id');
      assert.equal(request.valueInputOption, 'RAW', 'J1 batch must preserve raw timestamp values');
      assert.ok(request.data.length > 0 && request.data.length <= 20, 'J1 batch body must contain a bounded non-empty data set');
      assert.ok(request.data.every((entry) => /!J1$/.test(entry.range) && Array.isArray(entry.values) && entry.values.length === 1), 'J1 batch body must contain complete per-sheet J1 values');
      selectedRuns.push(request.data.map((entry) => entry.range));
    } } } },
    _wcoreGetSpreadsheet_: () => ss,
  };
  vm.createContext(context);
  const code = [
    '_wd_norm_', '_wd_fmtDate_', '_wd_extractTimestamp_', '_wd_isUnsafeLatchSource_',
    '_wd_parseLocalDateTimeToMs_', '_wd_isLastUpdateFormat_', '_wd_isCexSheet_',
    '_wd_quoteA1Sheet_', '_wd_addApiWrite_', '_wd_flushApiWrites_',
    '_wd_selectFairJ1Actions_', '_wd_applyJ1Actions_', 'SYNC_J1_ALL_SHEETS'
  ].map(extractFunction).join('\n');
  vm.runInContext(code, context);
  context.__props = props;
  context.__selectedRuns = selectedRuns;
  context.__batchCalls = () => batchCalls;
  return context;
}

function loadJ1ClaimHelpers() {
  const props = {};
  let held = false;
  let forceBusy = false;
  let nestedSelection = null;
  let context;
  const calls = { writes: 0, releases: 0 };
  context = {
    Math,
    Number,
    String,
    isFinite,
    parseInt,
    SYNC_J1_MAX_SYNCS_PER_RUN: 20,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => Object.prototype.hasOwnProperty.call(props, key) ? props[key] : null,
      setProperty: (key, value) => {
        props[key] = String(value);
        calls.writes++;
        if (nestedSelection === null) {
          nestedSelection = context._wd_selectFairJ1Actions_(makeActions(), 40, 'CURSOR', {});
        }
      },
    }) },
    LockService: { getScriptLock: () => ({
      tryLock: () => {
        if (forceBusy || held) return false;
        held = true;
        return true;
      },
      releaseLock: () => { held = false; calls.releases++; },
    }) },
  };
  function makeActions() {
    return Array.from({ length: 40 }, (_, i) => ({ fairnessIndex: i, sheetName: `Ledger - Claim ${i}`, type: 'sync' }));
  }
  vm.createContext(context);
  vm.runInContext(extractFunction('_wd_selectFairJ1Actions_'), context);
  context.__props = props;
  context.__calls = calls;
  context.__nested = () => nestedSelection;
  context.__makeActions = makeActions;
  context.__forceBusy = (value) => { forceBusy = value; };
  return context;
}

{
  const claims = loadJ1ClaimHelpers();
  const first = claims._wd_selectFairJ1Actions_(claims.__makeActions(), 40, 'CURSOR', {});
  assert.equal(first.length, 20, 'first J1 claimant reserves one bounded slice');
  assert.deepEqual(claims.__nested(), [], 'an interleaved claimant performs no writes when the cursor claim lock is busy');
  const second = claims._wd_selectFairJ1Actions_(claims.__makeActions(), 40, 'CURSOR', {});
  assert.equal(second.length, 20, 'serialized concurrent claimant reserves the next slice');
  assert.equal(new Set(first.concat(second).map((action) => action.sheetName)).size, 40, 'serialized J1 claims reserve disjoint slices');
  claims.__forceBusy(true);
  const writesBeforeBusy = claims.__calls.writes;
  assert.deepEqual(claims._wd_selectFairJ1Actions_(claims.__makeActions(), 40, 'CURSOR', {}), [], 'failed J1 cursor claim returns no actions');
  assert.equal(claims.__calls.writes, writesBeforeBusy, 'failed J1 cursor claim performs no cursor write');
}

{
  const dedicated = loadDedicatedJ1Sync();
  const covered = new Set();
  for (let run = 0; run < 6; run++) {
    const result = dedicated.SYNC_J1_ALL_SHEETS();
    assert.ok(result.synced <= 20, `dedicated J1 run ${run + 1} writes at most 20 latches`);
    dedicated.__selectedRuns[run].forEach((range) => covered.add(range));
  }
  assert.equal(dedicated.__batchCalls(), 6, 'dedicated J1 sync uses one batch write per run');
  assert.equal(covered.size, 105, 'dedicated J1 cursor must fairly serve all 105 stale latches');
  assert.ok(Number(dedicated.__props.SYNC_J1_CURSOR) >= 0, 'dedicated J1 fairness cursor must be persisted');
}

{
  const stale105 = Array.from({ length: 105 }, (_, i) => ({
    sheetName: `Ledger - Required Bound ${String(i).padStart(3, '0')}`,
    vA2: '1,00 €',
    vB1: '2026-07-17 12:00:00',
    vI1: '2026-07-17 18:00:00',
    vJ1: '2026-07-17 18:00:00'
  }));
  const simulation = runFairnessSimulation(stale105, 27, false);
  assert.equal(simulation.firstSelectedRun.size, 105, 'all 105 stale wallets must receive a pulse without manual intervention');
  assert.ok(Math.max(...simulation.firstSelectedRun.values()) <= 27, '105 stale wallets must all be served within 27 watchdog runs');
}

{
  const laneMix = Array.from({ length: 16 }, (_, i) => ({
    sheetName: `Ledger - Lane ${String(i).padStart(2, '0')}`,
    vA2: i < 8 ? '1,00 €' : '#ERROR!',
    vB1: '2026-07-17 12:00:00',
    vI1: '2026-07-17 23:50:00',
    vJ1: ''
  }));
  const laneActions = helpers._wd_collectGlobalRefreshActions_(laneMix, t0, 5 * 3600000, '2026-07-18 00:00:00', makeStats());
  const lanePulses = laneActions.filter((action) => action.type === 'pulse');
  assert.equal(lanePulses.filter((action) => action.reason === 'cycle' || action.reason === 'stale').length, 4, 'four returned actions come from the ordinary lane');
  assert.equal(lanePulses.filter((action) => action.reason === 'error' || action.reason === 'empty' || action.reason === 'partial').length, 1, 'only one returned action is urgent while ordinary backlog exists');
}

{
  const synchronized = Array.from({ length: 123 }, (_, i) => ({
    sheetName: `Ledger - Wave ${String(i).padStart(3, '0')}`,
    vA2: '1,00 €',
    vB1: '2026-07-17 23:00:00',
    vI1: '2026-07-17 23:50:00',
    vJ1: '2026-07-17 23:50:00'
  }));
  const simulation = runFairnessSimulation(synchronized, 31, false);
  assert.equal(simulation.firstSelectedRun.size, 123, 'a synchronized healthy I1 wave completes without waiting for five-hour staleness');
  assert.ok(Math.max(...simulation.firstSelectedRun.values()) <= 31, 'the synchronized wave completes within 31 runs');
}

{
  const ordinary = Array.from({ length: 123 }, (_, i) => ({
    sheetName: `Ledger - Persistent Wave ${String(i).padStart(3, '0')}`,
    vA2: '1,00 €',
    vB1: '2026-07-17 23:00:00',
    vI1: '2026-07-17 23:50:00',
    vJ1: '2026-07-17 23:50:00'
  }));
  const urgent = {
    sheetName: 'Ledger - Persistent Urgent',
    vA2: '#ERROR!',
    vB1: '2026-07-17 23:00:00',
    vI1: '[ERROR] persistent test failure',
    vJ1: ''
  };
  const firstSelectedRun = new Map();
  for (let run = 0; run < 31 && firstSelectedRun.size < ordinary.length; run++) {
    const nowMs = t0 + run * 10 * 60000;
    const nowStr = helpers._wd_fmtDate_(new Date(nowMs));
    const actions = helpers._wd_collectGlobalRefreshActions_(ordinary.concat(urgent), nowMs, 5 * 3600000, nowStr, makeStats());
    const pulses = actions.filter((action) => action.type === 'pulse');
    const urgentPulses = pulses.filter((action) => action.reason === 'error' || action.reason === 'empty' || action.reason === 'partial');
    assert.equal(urgentPulses.length, 1, `persistent urgent run ${run + 1} uses exactly one urgent slot`);
    assert.equal(urgentPulses[0].sheetName, urgent.sheetName, `persistent urgent run ${run + 1} keeps the deliberate urgent target`);
    urgent.vB1 = nowStr;
    assert.equal(urgent.vI1, '[ERROR] persistent test failure', 'the simulation intentionally preserves urgent state');
    for (const pulse of pulses.filter((action) => action.reason === 'cycle' || action.reason === 'stale')) {
      if (!firstSelectedRun.has(pulse.sheetName)) firstSelectedRun.set(pulse.sheetName, run + 1);
      ordinary.find((item) => item.sheetName === pulse.sheetName).vB1 = nowStr;
    }
  }
  assert.equal(firstSelectedRun.size, 123, 'all 123 ordinary wallets are selected despite a persistent distinct urgent every run');
  assert.ok(Math.max(...firstSelectedRun.values()) <= 31, 'persistent urgent pressure preserves the 31-run ordinary bound');
}

{
  const ordinaryOnly = Array.from({ length: 6 }, (_, i) => ({
    sheetName: `Ledger - Only Ordinary ${i}`,
    vA2: '1,00 €',
    vB1: '2026-07-17 12:00:00',
    vI1: `2026-07-17 ${String(18 + i).padStart(2, '0')}:00:00`,
    vJ1: ''
  }));
  const ordinaryActions = helpers._wd_collectGlobalRefreshActions_(ordinaryOnly, t0, 5 * 3600000, '2026-07-18 00:00:00', makeStats());
  assert.deepEqual(
    ordinaryActions.filter((action) => action.type === 'pulse').map((action) => action.sheetName),
    ordinaryOnly.slice(0, 5).map((item) => item.sheetName),
    'when no distinct urgent exists, the fifth slot uses the next oldest ordinary target'
  );
}

{
  const emptyBacklog = Array.from({ length: 20 }, (_, i) => ({
    sheetName: `Ledger - Empty ${String(i).padStart(2, '0')}`,
    vA2: '',
    vB1: '',
    vI1: '',
    vJ1: ''
  }));
  const emptyActions = helpers._wd_collectGlobalRefreshActions_(emptyBacklog, t0, 5 * 3600000, '2026-07-18 00:00:00', makeStats());
  assert.equal(emptyActions.filter((action) => action.type === 'pulse').length, 5, 'a large empty backlog fills all five slots when no healthy cycle capacity exists');
}

{
  const noCacheWave = Array.from({ length: 30 }, (_, i) => ({
    sheetName: `Ledger - No Cache Wave ${String(i).padStart(2, '0')}`,
    vA2: '',
    vB1: '2026-07-17 12:00:00',
    vI1: i % 2 === 0 ? '[CACHE_ONLY] [FRESH] N/A' : '[NO_CACHE] 2026-07-17 23:50:00',
    vJ1: ''
  }));
  const covered = new Set();
  for (let run = 0; run < 6; run++) {
    const nowMs = t0 + run * 10 * 60000;
    const nowStr = helpers._wd_fmtDate_(new Date(nowMs));
    const expected = noCacheWave.slice()
      .sort((a, b) => cycleAge(b, nowMs) - cycleAge(a, nowMs) || a.sheetName.localeCompare(b.sheetName))
      .slice(0, 5)
      .map((item) => item.sheetName);
    const actions = helpers._wd_collectGlobalRefreshActions_(noCacheWave, nowMs, 5 * 3600000, nowStr, makeStats());
    const pulses = actions.filter((action) => action.type === 'pulse');
    assert.deepEqual(pulses.map((action) => action.sheetName), expected, `no-cache run ${run + 1} selects the five oldest distinct targets`);
    assert.equal(new Set(pulses.map((action) => action.sheetName)).size, 5, `no-cache run ${run + 1} has no duplicate target`);
    for (const pulse of pulses) {
      covered.add(pulse.sheetName);
      noCacheWave.find((item) => item.sheetName === pulse.sheetName).vB1 = nowStr;
    }
  }
  assert.equal(covered.size, 30, 'all synchronized no-cache targets are covered within six ten-minute runs while I1 stays unchanged');
}

{
  const healthyCycle = Array.from({ length: 4 }, (_, i) => ({
    sheetName: `Ledger - Healthy Mixed ${i}`,
    vA2: '1,00 €',
    vB1: '2026-07-17 23:40:00',
    vI1: '2026-07-17 23:50:00',
    vJ1: '2026-07-17 23:50:00'
  }));
  const oldestNoCache = Array.from({ length: 6 }, (_, i) => ({
    sheetName: `Ledger - Old No Cache ${i}`,
    vA2: '',
    vB1: `2026-07-17 ${String(12 + i).padStart(2, '0')}:00:00`,
    vI1: i % 2 === 0 ? '' : '[CACHE_ONLY] [FRESH] N/A',
    vJ1: ''
  }));
  const mixedActions = helpers._wd_collectGlobalRefreshActions_(healthyCycle.concat(oldestNoCache), t0, 5 * 3600000, '2026-07-18 00:00:00', makeStats());
  const mixedPulses = mixedActions.filter((action) => action.type === 'pulse');
  assert.deepEqual(mixedPulses.map((action) => action.sheetName), oldestNoCache.slice(0, 5).map((item) => item.sheetName), 'oldest no-cache targets can occupy four cycle slots and one distinct urgent slot');
  assert.equal(new Set(mixedPulses.map((action) => action.sheetName)).size, 5, 'mixed dual-lane selection remains distinct and capped at five');
}

{
  const healthy = Array.from({ length: 5 }, (_, i) => ({
    sheetName: `Ledger - Strict Healthy ${i}`,
    vA2: '1,00 €',
    vB1: '2026-07-17 22:50:00',
    vI1: '2026-07-17 23:00:00',
    vJ1: '2026-07-17 23:00:00'
  }));
  const malformedCache = {
    sheetName: 'Ledger - Malformed Cache Timestamp',
    vA2: '',
    vB1: '2026-07-17 23:40:00',
    vI1: '[CACHE_ONLY] 2026-07-17 23:59:00 trailing',
    vJ1: ''
  };
  const strictActions = helpers._wd_collectGlobalRefreshActions_(healthy.concat(malformedCache), t0, 5 * 3600000, '2026-07-18 00:00:00', makeStats());
  const strictNames = strictActions.filter((action) => action.type === 'pulse').map((action) => action.sheetName);
  assert.deepEqual(strictNames, healthy.slice(0, 4).map((item) => item.sheetName).concat(malformedCache.sheetName), 'malformed CACHE_ONLY payload enters the urgent lane instead of consuming the fifth ordinary slot');
}

{
  const backoffProps = {
    'WD_WEB_BACKOFF:v1': JSON.stringify({
      'Ledger - Suppressed Web Cycle': { attempts: 1, lastPulseMs: t0, lastErrorMs: t0 }
    })
  };
  const backoffHelpers = loadWatchdogHelpers({ scriptProperties: backoffProps });
  const suppressedActions = backoffHelpers._wd_collectGlobalRefreshActions_([{
    sheetName: 'Ledger - Suppressed Web Cycle',
    vA2: '#ERROR!',
    vB1: '2026-07-17 12:00:00',
    vI1: '[WEB_SCAN_ERROR] 2026-07-18 00:30:00',
    vJ1: ''
  }, {
    sheetName: 'Ledger - Eligible No Cache',
    vA2: '',
    vB1: '2026-07-17 13:00:00',
    vI1: '[NO_CACHE] 2026-07-17 23:50:00',
    vJ1: ''
  }], t0 + 60 * 60000, 5 * 3600000, '2026-07-18 01:00:00', makeStats());
  assert.equal(suppressedActions.some((action) => action.type === 'pulse' && action.sheetName === 'Ledger - Suppressed Web Cycle'), false, 'suppressed WEB_SCAN_ERROR cannot leak into the no-cache cycle lane');
}

{
  const ordinary = Array.from({ length: 4 }, (_, i) => ({
    sheetName: `Ledger - Ordinary ${i}`,
    vA2: '1,00 €',
    vB1: '2026-07-17 12:00:00',
    vI1: `2026-07-17 2${i}:00:00`,
    vJ1: ''
  }));
  const overlappingPartial = ordinary.map((item, i) => ({
    sheetName: item.sheetName,
    range: 'B1',
    value: '2026-07-18 00:00:00',
    type: 'pulse',
    reason: 'partial',
    priority: 250,
    staleAgeMs: (24 - i) * 3600000
  })).concat([{
    sheetName: 'Ledger - Distinct Partial',
    range: 'B1',
    value: '2026-07-18 00:00:00',
    type: 'pulse',
    reason: 'partial',
    priority: 250,
    staleAgeMs: 19 * 3600000
  }]);
  const overlapActions = helpers._wd_collectGlobalRefreshActions_(ordinary, t0, 5 * 3600000, '2026-07-18 00:00:00', makeStats(), overlappingPartial);
  const overlapPulses = overlapActions.filter((action) => action.type === 'pulse');
  assert.equal(overlapPulses.filter((action) => action.reason === 'cycle' || action.reason === 'stale').length, 4, 'overlap replacement preserves all four initial ordinary actions');
  assert.ok(overlapPulses.some((action) => action.sheetName === 'Ledger - Distinct Partial' && action.reason === 'partial'), 'urgent selection advances to the next distinct target');
}

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
  assert.deepEqual(deferred, { needsPulse: true, reason: 'empty', blockedReason: null, useBlockedCooldown: false }, 'deferred N/A must re-enter as no usable cache');

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
    vB1: '2026-07-18 00:00:00',
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
    staleAgeMs: 48 * 3600000
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
  const deferredItem = { sheetName: 'Ledger - Deferred', vA2: '', vB1: '', vI1: '[WEB_SCAN_DEFERRED] N/A', vJ1: '2026-07-17 00:00:00' };
  const deferredActions = helpers._wd_collectGlobalRefreshActions_([deferredItem], t0, 5 * 3600000, '2026-07-18 00:00:00', deferredStats);
  assert.equal(deferredActions.filter((action) => action.type === 'pulse').length, 1, 'deferred N/A is admitted after B1 cooldown');
  deferredItem.vB1 = '2026-07-18 00:00:00';
  const cooldownActions = helpers._wd_collectGlobalRefreshActions_([deferredItem], t0 + 9 * 60000, 5 * 3600000, '2026-07-18 00:09:00', deferredStats);
  assert.equal(cooldownActions.some((action) => action.type === 'pulse'), false, 'deferred N/A is not immediately repulsed before cooldown');
  assert.equal(cooldownActions.some((action) => action.type === 'sync'), false, 'deferred N/A never overwrites the J1 latch');
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
  const rollbackSaveFailures = [];
  const conservative = loadWatchdogHelpers({ scriptProperties: conservativeProps, failSetPropertyCalls: rollbackSaveFailures });
  const conservativeStats = { b1Set: 0, b1Blocked: 0, b1Stale: 0, b1Empty: 0, b1Error: 0, toSync: 0 };
  const conservativeActions = conservative._wd_collectGlobalRefreshActions_([{
    sheetName: 'Ledger - Conservative Web', vA2: '1,00 €', vB1: '', vI1: '[WEB_SCAN_ERROR] 2026-07-18 00:00:00', vJ1: ''
  }], t0 + 30 * 60000, 5 * 3600000, '2026-07-18 00:30:00', conservativeStats, [{
    sheetName: 'Ledger - Conservative Partial', range: 'B1', value: '2026-07-18 00:30:00',
    type: 'pulse', reason: 'partial', priority: 250, staleAgeMs: 0
  }]);
  const savesBeforeRollback = conservative.__propertyCalls().set;
  rollbackSaveFailures.push(savesBeforeRollback + 1, savesBeforeRollback + 2);
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
  assert.ok(actionsA2.some((action) => action.type === 'sync' && action.range === 'J1' && action.value === '2026-07-08 20:16:29'), 'A2 custom-function errors still bump J1 by one second');
  assert.ok(actionsA2.some((action) => action.type === 'pulse' && action.range === 'B1'), 'A2 custom-function errors also participate in bounded B1 scheduling');
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
  assert.ok(actionsBlankTotal.some((action) => action.type === 'sync' && action.range === 'J1' && action.value === '2026-07-08 20:21:36'), 'Blank Recap totals still bump J1 by one second');
  assert.ok(actionsBlankTotal.some((action) => action.type === 'pulse' && action.range === 'B1'), 'Blank Recap totals also participate in bounded B1 scheduling');
}

{
  // v4.16.46: CACHE_ONLY with B1 significantly newer than I1 → stale re-pulse
  const nowMs = helpers._wd_parseLocalDateTimeToMs_('2026-07-20 06:00:00');
  const staleMs = 5 * 3600000;
  // B1 pulsed at 03:01, I1 cache from yesterday 22:32 → gap ~4.5h
  const mismatch = helpers._wd_needsRefresh_('0,00 €', '[CACHE_ONLY] 2026-07-19 22:32:03', nowMs, staleMs, '2026-07-20 03:01:23');
  assert.equal(mismatch.needsPulse, true, '[CACHE_ONLY] with B1 > I1 by >20min must re-pulse');
  assert.equal(mismatch.reason, 'stale');

  // B1 only 10 min newer than I1 → falls through to normal staleness (not triggered by mismatch)
  const recent = helpers._wd_needsRefresh_('0,00 €', '[CACHE_ONLY] 2026-07-20 05:50:00', nowMs, staleMs, '2026-07-20 06:00:00');
  assert.equal(recent.needsPulse, false, '[CACHE_ONLY] with B1 10min ahead must not trigger mismatch');
  assert.equal(recent.reason, 'ok');

  // CACHE_ONLY without B1 arg → backward compat, normal staleness
  const noB1 = helpers._wd_needsRefresh_('0,00 €', '[CACHE_ONLY] 2026-07-19 22:32:03', nowMs, staleMs);
  assert.equal(noB1.needsPulse, true, '[CACHE_ONLY] without vB1 uses normal staleness check');
  assert.equal(noB1.reason, 'stale');
}

{
  // v4.16.46: cycleAgeMs uses I1 as age anchor when CACHE_ONLY I1 is older than B1
  const nowMs = helpers._wd_parseLocalDateTimeToMs_('2026-07-20 06:48:00');
  const staleMs = 5 * 3600000;
  const actions = helpers._wd_collectGlobalRefreshActions_([
    {
      sheetName: 'Ledger - Hemi',
      vA2: '6,89 €',
      vB1: '2026-07-20 03:01:23',
      vI1: '[CACHE_ONLY] 2026-07-19 22:32:03',
      vJ1: '2026-07-19 22:32:03',
      vC1: 'FALSE'
    }
  ], nowMs, staleMs, '2026-07-20 06:48:00');
  const hemi = actions.find(a => a.sheetName === 'Ledger - Hemi');
  assert.ok(hemi, 'Hemi must produce a candidate');
  // I1 is from yesterday 22:32 → age should be ~8h, not ~3h47m (B1 age)
  assert.ok(hemi.cycleAgeMs >= 7 * 3600000, 'cycleAge must reflect stale I1 (~8h), not recent B1 (~3h)');
  assert.ok(hemi.type === 'pulse' || hemi.type === 'sync', 'Hemi must produce a refresh action');
}

{
  // v4.16.46: _wd_extractTimestamp_ strips nested [FRESH] prefix
  // [CACHE_ONLY] [FRESH] 2026-07-20 01:21:57 → "2026-07-20 01:21:57"
  assert.strictEqual(
    helpers._wd_extractTimestamp_('[CACHE_ONLY] [FRESH] 2026-07-20 01:21:57'),
    '2026-07-20 01:21:57',
    'extractTimestamp must strip both [CACHE_ONLY] and nested [FRESH]'
  );
  // Without [CACHE_ONLY] wrapper
  assert.strictEqual(
    helpers._wd_extractTimestamp_('[FRESH] 2026-07-20 01:21:57'),
    '2026-07-20 01:21:57',
    'extractTimestamp must strip [FRESH] alone'
  );
  // [CACHE_ONLY] [FRESH] N/A → "N/A" (not a valid timestamp → empty detection)
  assert.strictEqual(
    helpers._wd_extractTimestamp_('[CACHE_ONLY] [FRESH] N/A'),
    'N/A',
    'extractTimestamp with nested [FRESH] N/A yields N/A → empty'
  );
}

if (!process.env.WCORE_WD_TZ_CHILD) {
  for (const timezone of ['UTC', 'Europe/Paris']) {
    execFileSync(process.execPath, [__filename], {
      env: { ...process.env, TZ: timezone, WCORE_WD_TZ_CHILD: '1' },
      stdio: 'inherit'
    });
  }
}

console.log('watchdog quota guard OK');
