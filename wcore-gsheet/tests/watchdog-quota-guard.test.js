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
const tryUnblock = extractFunction('_wd_tryUnblock_');
const maxPulsesMatch = source.match(/var\s+WD_MAX_PULSES_PER_RUN\s*=\s*(\d+)\s*;/);
assert(maxPulsesMatch, 'WD_MAX_PULSES_PER_RUN must be defined');
assert.strictEqual(Number(maxPulsesMatch[1]), 10, 'WATCHDOG should cap B1 pulses at 10 per run');

function loadWatchdogHelpers() {
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
    '_wd_collectGlobalRefreshActions_',
    '_wd_shouldSyncJ1_',
    '_wd_j1LatchValue_',
    '_wd_readDirectB1_',
    '_wd_needsRefresh_',
    '_wd_isSystemBlocked_',
    '_wd_tryUnblock_'
  ];
  const code = names.map(extractFunction).join('\n');
  const context = {
    WD_MAX_PULSES_PER_RUN: 5,
    WD_CYCLE_SLOTS_PER_RUN: 3,
    WD_PULSE_MIN: 10,
    WD_PULSE_MIN_BLOCKED: 30,
    P_WD_J1_CURSOR: 'WD_J1_CURSOR',
    _wd_loadWebBackoff_: () => ({}),
    _wd_webErrorDecision_: (state, sheetName, _nowMs, errorTimestampMs) => {
      if (errorTimestampMs == null) delete state[sheetName];
      return { allowed: errorTimestampMs != null, nextDelayMs: 0 };
    },
    _wd_reservePulseStates_: (actions) => ({ actions, errors: 0 }),
    _wd_selectFairJ1Actions_: (actions) => actions,
    QuotaCircuitBreaker: { isTripped: () => false },
    HttpErrorGuard: { isQuotaExhausted: () => false },
    CacheGuard: { isBlocked: () => false },
    Logger: { log() {} }
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

assert(
  !/day-start[\s\S]*QuotaCircuitBreaker\.reset\s*\(/.test(watchdog),
  'WATCHDOG_FROM_RECAP must not reset quota breaker on day-start without a live quota probe'
);

assert(
  !/blockedReason\s*===\s*["']QUOTA["'][\s\S]*QuotaCircuitBreaker\.reset\s*\(/.test(tryUnblock),
  '_wd_tryUnblock_(QUOTA) must not reset quota breaker before pulsing B1'
);

const vm = require('vm');
const helpers = loadWatchdogHelpers();
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
    reason: 'a2_error_recalc',
    fairnessIndex: 0
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
    reason: 'a2_error_recalc',
    fairnessIndex: 0
  }], 'Blank Recap total with fresh I1/J1 should bump J1 by one second, not B1');
}

{
  const statsJ1 = { b1Set: 0, b1Blocked: 0, b1Stale: 0, b1Empty: 0, b1Error: 0, toSync: 0 };
  // v4.16.67: une ligne [CACHE_ONLY] datant la DONNEE (cache), pas la TENTATIVE,
  // doit synchroniser J1 sur B1 (l'horodatage du pulse = la tentative) pour
  // respecter la sémantique I1/J1 = tentative, ERROR = age reel de la donnee.
  const actionsJ1 = helpers._wd_collectGlobalRefreshActions_([
    {
      sheetName: 'Ledger - Frozen',
      vA2: '1,00 €',
      vB1: '2026-08-21 14:00:00',
      vI1: '[CACHE_ONLY] [FRESH] 2026-06-27 12:38:03',
      vJ1: '2026-06-27 12:38:03'
    }
  ], helpers._wd_parseLocalDateTimeToMs_('2026-08-21 14:05:00'), 5 * 3600000, '2026-08-21 14:05:00', statsJ1);
  assert.deepEqual(actionsJ1, [{
    sheet: null,
    sheetName: 'Ledger - Frozen',
    range: 'J1',
    value: '2026-08-21 14:00:00',
    type: 'sync',
    reason: 'cache_only_attempt',
    fairnessIndex: 0
  }], 'a [CACHE_ONLY] row must sync J1 to B1 (the attempt), not the cached data date');
}

{
  // v4.16.68: _wd_j1LatchValue_ — helper partagé par les DEUX écrivains de J1
  // (watchdog 10 min + SYNC_J1_ALL_SHEETS toutes les 2 min). Le pass rapide
  // faisait reculer J1 à la date de la donnée dès qu'une réévaluation I1
  // produisait un [CACHE_ONLY] <cache> (constaté sur Botanix : J1 revenu au
  // 2026-08-17 alors que I1 affichait PRESERVED du jour).
  assert.equal(
    helpers._wd_j1LatchValue_('[CACHE_ONLY] [FRESH] 2026-06-27 12:38:03', '2026-08-21 14:00:00'),
    '2026-08-21 14:00:00',
    '[CACHE_ONLY] latch must be B1 (the attempt), not the cached data date',
  );
  assert.equal(
    helpers._wd_j1LatchValue_('[WEB_SCAN_PRESERVED] 2026-08-21 15:31:58', '2026-08-21 15:30:35'),
    '2026-08-21 15:31:58',
    'PRESERVED already dates the attempt — extraction must keep it',
  );
  assert.equal(
    helpers._wd_j1LatchValue_('WEB_SCAN_OK 2026-08-21 14:23:23', ''),
    '2026-08-21 14:23:23',
    'plain success timestamps must pass through untouched',
  );
}

console.log('watchdog quota guard OK');
