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
assert.strictEqual(Number(maxPulsesMatch[1]), 15, 'WATCHDOG should allow 15 B1 pulses per run');

function loadWatchdogHelpers() {
  const names = [
    '_wd_norm_',
    '_wd_isLastUpdateFormat_',
    '_wd_extractTimestamp_',
    '_wd_extractSuccessTimestamp_',
    '_wd_isUnsafeLatchSource_',
    '_wd_isBlocked_',
    '_wd_parseLocalDateTimeToMs_',
    '_wd_shouldPulseB1_',
    '_wd_staleAgeMs_',
    '_wd_refreshReasonPriority_',
    '_wd_isCexSheet_',
    '_wd_collectGlobalRefreshActions_',
    '_wd_shouldSyncJ1_',
    '_wd_needsRefresh_',
    '_wd_isSystemBlocked_',
    '_wd_tryUnblock_'
  ];
  const code = names.map(extractFunction).join('\n');
  const context = {
    WD_MAX_PULSES_PER_RUN: 5,
    WD_PULSE_MIN: 10,
    WD_PULSE_MIN_BLOCKED: 30,
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

console.log('watchdog quota guard OK');
