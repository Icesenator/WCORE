const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const listingSource = fs.readFileSync(path.join(__dirname, '..', 'src', '17_LISTING.gs'), 'utf8');
const autoHealSource = fs.readFileSync(path.join(__dirname, '..', 'src', '16B_AUTO_HEAL.gs'), 'utf8');
const activityRefreshSource = fs.readFileSync(path.join(__dirname, '..', 'src', '27_ACTIVITY_REFRESH.gs'), 'utf8');
const diagRpcSource = fs.readFileSync(path.join(__dirname, '..', 'src', '13B_DIAG_RPC.gs'), 'utf8');
const diagnosticSource = fs.readFileSync(path.join(__dirname, '..', 'src', '13_DIAGNOSTIC.gs'), 'utf8');
const initSource = fs.readFileSync(path.join(__dirname, '..', 'src', '01_INIT.gs'), 'utf8');
const refreshSource = fs.readFileSync(path.join(__dirname, '..', 'src', '16_REFRESH.gs'), 'utf8');
const cacheCoreSource = fs.readFileSync(path.join(__dirname, '..', 'src', '04A_CACHE_CORE.gs'), 'utf8');
assert.match(autoHealSource, /WCORE_AUTO_HEAL_VERSION\s*=\s*["']4\.16\.36["']/, 'auto-heal version must advance to 4.16.36');
assert.match(autoHealSource, /WCORE_AUTO_HEAL_TRIGGER_SPEC\s*=\s*["']v4\.16\.35:/, 'auto-heal trigger spec must advance with lease architecture');
assert.match(initSource, /MINOR:\s*16,\s*\n\s*PATCH:\s*66,/, 'global WCORE version must advance to 4.16.66');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} body not closed`);
}

function extractAssignedFunction(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${marker} must exist`);
  const fnStart = source.indexOf('function', start);
  const bodyStart = source.indexOf('{', fnStart);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return source.slice(fnStart, i + 1);
  }
  throw new Error(`${marker} body not closed`);
}

function makeContext(props) {
  const pulses = [];
  const sheets = ['UniSwap - Base', 'Ledger - Base', 'Other'];
  const context = {
    console,
    Date,
    JSON,
    Math,
    String,
    Number,
    Array,
    Object,
    RegExp,
    isFinite,
    Logger: { log: () => {} },
    Utilities: { formatDate: () => '2026-06-29 20:00:00' },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => Object.prototype.hasOwnProperty.call(props, key) ? props[key] : null,
        setProperty: (key, value) => { props[key] = String(value); },
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheets: () => sheets.map((name) => ({ getName: () => name, getSheetId: () => name.length })),
        getSheetByName: (name) => sheets.includes(name) ? {
          getRange: (a1) => ({ setValue: (value) => pulses.push({ name, a1, value }) }),
        } : null,
        getSpreadsheetTimeZone: () => 'Europe/Paris',
      }),
    },
    _ensureLedgerCache_: () => { props.refreshed = 'true'; },
    __pulses: pulses,
  };
  vm.createContext(context);
  vm.runInContext(listingSource, context);
  vm.runInContext(autoHealSource, context);
  return context;
}

function makeJ1Context() {
  const calls = { sync: 0, createTrigger: 0, deleteTrigger: 0 };
  const context = {
    console,
    Date,
    JSON,
    Math,
    String,
    Number,
    Array,
    Object,
    RegExp,
    isFinite,
    Logger: { log: () => {} },
    _wd_fmtDate_: (d) => d,
    _wd_extractTimestamp_: (s) => String(s || ''),
    _wd_isLastUpdateFormat_: (s) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(s || '')),
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (name) => name === 'Recap Portfolio' ? {
          getLastRow: () => 3,
          getRange: (row, col, numRows, numCols) => ({
            getValues: () => col === 6
              ? [['2026-07-02 07:00:00'], ['2026-07-02 07:01:00']]
              : [['2026-07-02 07:00:00'], ['2026-07-02 07:01:00']],
          }),
        } : null,
      }),
    },
    ScriptApp: {
      getProjectTriggers: () => [],
      deleteTrigger: () => { calls.deleteTrigger++; },
      newTrigger: () => {
        calls.createTrigger++;
        return { timeBased: () => ({ everyMinutes: () => ({ create: () => {} }) }) };
      },
    },
    SYNC_J1_ALL_SHEETS: () => { calls.sync++; return { synced: 0 }; },
    __calls: calls,
  };
  vm.createContext(context);
  vm.runInContext(autoHealSource, context);
  return context;
}

function makeBootstrapContext(props) {
  const calls = { repairJ1: 0, repairLimit: null };
  const context = {
    console,
    Date,
    JSON,
    Math,
    String,
    Number,
    Array,
    Object,
    RegExp,
    isFinite,
    Logger: { log: () => {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => Object.prototype.hasOwnProperty.call(props, key) ? props[key] : null,
        setProperty: (key, value) => { props[key] = String(value); },
      }),
    },
    _wcoreAutoHealNewLedgers_: () => {},
    REPAIR_RPC_LOOKUP_FROM_REGISTRY: () => {},
    _RpcLookup: { count: () => 1 },
    REPAIR_J1_LATCH_FORMULAS: (limit) => {
      calls.repairJ1++;
      calls.repairLimit = limit;
      return { repaired: 0, cleared: 0 };
    },
    ActivityTracker: { count: () => 1 },
    _wcoreAutoHealJ1Staleness_: () => {},
    __calls: calls,
  };
  vm.createContext(context);
  vm.runInContext(autoHealSource, context);
  return context;
}

{
  const props = {
    LEDGER_SHEET_MAP: JSON.stringify({ 'UniSwap - Base': 123, 'Ledger - Base': 456 }),
  };
  const ctx = makeContext(props);
  const out = [];
  ctx._wcoreAutoHealNewLedgers_(out, false);
  assert.deepEqual(ctx.__pulses, [], 'auto-heal must not pulse B1 when ledger cache already knows the sheets');
  assert.equal(props.refreshed, undefined, 'auto-heal must not rebuild ledger cache when there are no new sheets');
}

{
  const props = {
    LEDGER_SHEET_MAP: JSON.stringify({ 'UniSwap - Base': 123, 'Ledger - Base': 456 }),
  };
  const ctx = makeContext(props);
  const out = [];
  ctx._wcoreAutoHealNewLedgers_(out, true);
  assert.deepEqual(ctx.__pulses, [], 'forced auto-heal must not pulse known ledger sheets');
  assert.equal(props.refreshed, undefined, 'forced auto-heal must not rebuild ledger links when there are no new sheets');
  assert.equal(props.LEDGER_LAST_REFRESH, undefined, 'forced auto-heal must not rewrite ledger cache timestamp when there are no new sheets');
}

{
  assert.equal(autoHealSource.includes('SET_WEB_SCAN_DENYLIST'), false, 'auto-heal must not resurrect the removed web-scan denylist path');
}

{
  assert.match(autoHealSource, /function\s+WCORE_AUTO_HEAL_TIMER\s*\(/, 'auto-heal must expose an independent timer handler');
  assert.match(autoHealSource, /newTrigger\("WCORE_AUTO_HEAL_TIMER"\)\.timeBased\(\)\.everyMinutes\(10\)\.create\(\)/, 'auto-heal must install its own 10-minute timer');
  assert.match(autoHealSource, /var required = \["WCORE_AUTO_HEAL_TIMER"/, 'auto-heal timer must be a required managed trigger');
  assert.match(autoHealSource, /autoHealTimer10/, 'trigger spec must bump when adding the auto-heal timer');
  assert.match(autoHealSource, /skipProbesOnInstall/, 'trigger spec must bump when skipping liveness probes before forced reinstall');
  assert.match(autoHealSource, /forceNoBootstrap/, 'trigger spec must bump when force mode skips heavy bootstrap');
  assert.match(autoHealSource, /if \(needsInstall\) \{\s*_wcoreAutoHealRow_\(out, "Liveness probes", "SKIP"/, 'auto-heal must skip liveness probes when reinstall is already required');
  assert.match(autoHealSource, /if \(force === true\) \{\s*_wcoreAutoHealRow_\(out, "Bootstrap", "SKIP"/, 'forced auto-heal must skip heavy bootstrap work');
  assert.match(autoHealSource, /function\s+WCORE_TRIGGER_REINSTALL_FORCE_ONLY\s*\(/, 'admin trigger reinstall-only function must exist');
  assert.match(autoHealSource, /newTrigger\("WATCHDOG_FROM_RECAP"\)\.timeBased\(\)\.everyMinutes\(10\)\.create\(\)/);
  assert.match(autoHealSource, /watchdog10/);
  assert.doesNotMatch(autoHealSource, /newTrigger\("WATCHDOG_FROM_RECAP"\)\.timeBased\(\)\.everyMinutes\(5\)/);
}

{
  const start = autoHealSource.indexOf('function WCORE_AUTO_HEAL(reason, force)');
  const body = extractFunction(autoHealSource, 'WCORE_AUTO_HEAL');
  assert.match(body, /_wcoreAcquireLease_\(WCORE_AUTO_HEAL_LEASE_KEY/, 'auto-heal must acquire its dedicated lease');
  assert.match(body, /finally[\s\S]*_wcoreReleaseLease_\(WCORE_AUTO_HEAL_LEASE_KEY/, 'auto-heal must owner-safely release its dedicated lease');
  assert.doesNotMatch(body, /LockService\.getScriptLock\(\)/, 'auto-heal must not hold ScriptLock during maintenance');
  assert.match(autoHealSource, /var\s+WCORE_AUTO_HEAL_LEASE_KEY\s*=\s*["']WCORE_AUTO_HEAL_LEASE["']/, 'auto-heal lease key must differ from watchdog lease');
  assert.match(body, /_wcoreAutoHealBackgroundMaintenance_\(out, props\)/, 'auto-heal timer must own background cache maintenance removed from watchdog');
  const firstLease = body.indexOf('_wcoreAcquireLease_(WCORE_AUTO_HEAL_LEASE_KEY');
  const pressureRecovery = body.indexOf('_wcoreAutoHealStoragePressureRecovery_(out, props)', firstLease);
  const retryLease = body.indexOf('_wcoreAcquireLease_(WCORE_AUTO_HEAL_LEASE_KEY', firstLease + 1);
  assert.ok(firstLease >= 0 && pressureRecovery > firstLease && retryLease > pressureRecovery, 'auto-heal must retry lease acquisition once after storage-pressure recovery');
  const pressureHelper = extractFunction(autoHealSource, '_wcoreAutoHealStoragePressureRecovery_');
  assert.doesNotMatch(pressureHelper, /SHEETCACHE_CLEANUP/, 'pre-lease storage recovery must not run global SheetCache cleanup');
  const maintenance = extractFunction(autoHealSource, '_wcoreAutoHealBackgroundMaintenance_');
  assert.match(maintenance, /SHEETCACHE_CLEANUP\s*\(/, 'auto-heal maintenance must retain periodic SheetCache cleanup');
  assert.match(maintenance, /_wcoreAutoHealStoragePressureRecovery_\(out, props\)/, 'auto-heal maintenance must retain proactive storage pressure recovery');
  const ensureIdx = autoHealSource.indexOf('_wcoreAutoHealEnsureTriggers_(out, props, force === true);', start);
  const bootstrapIdx = autoHealSource.indexOf('_wcoreAutoHealBootstrapState_(out, false);', start);
  assert.ok(ensureIdx > start && bootstrapIdx > start && ensureIdx < bootstrapIdx, 'auto-heal must repair triggers before heavier bootstrap work');
}

{
  const props = { FILLER: 'x'.repeat(426 * 1024) };
  const calls = { leaseWrites: 0, purges: 0, continued: 0 };
  const propertyApi = {
    getProperty: (key) => Object.prototype.hasOwnProperty.call(props, key) ? props[key] : null,
    getProperties: () => ({ ...props }),
    setProperty: (key, value) => {
      if (key === 'WCORE_AUTO_HEAL_LEASE') {
        calls.leaseWrites++;
        if (Object.prototype.hasOwnProperty.call(props, 'FILLER')) throw new Error('storage quota exceeded');
      }
      props[key] = String(value);
    },
    deleteProperty: (key) => { delete props[key]; },
  };
  const context = {
    Date,
    JSON,
    Math,
    Number,
    String,
    Object,
    isFinite,
    parseInt,
    WCORE_AUTO_HEAL_COOLDOWN_MS: 600000,
    WCORE_AUTO_HEAL_LEASE_KEY: 'WCORE_AUTO_HEAL_LEASE',
    WCORE_AUTO_HEAL_LEASE_TTL_MS: 600000,
    Utilities: { getUuid: () => 'autoheal-owner' },
    PropertiesService: { getScriptProperties: () => propertyApi },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    CacheManager: { _emergencyPurge_: () => { calls.purges++; delete props.FILLER; return 426 * 1024; } },
    _wcoreAutoHealRow_: (out, step, status, details) => out.push([step, status, details || '']),
    _wcoreAutoHealEnsureTriggers_: () => { calls.continued++; },
    _wcoreAutoHealBootstrapState_: () => {},
    _wcoreAutoHealBackgroundMaintenance_: () => {},
    _wcoreAutoHealEnsurePricingWorker_: () => {},
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction(refreshSource, '_wcoreAcquireLease_'),
    extractFunction(refreshSource, '_wcoreReleaseLease_'),
    extractFunction(autoHealSource, '_wcoreAutoHealStoragePressureRecovery_'),
    extractFunction(autoHealSource, 'WCORE_AUTO_HEAL'),
  ].join('\n'), context);
  const result = context.WCORE_AUTO_HEAL('saturation-test', false);
  assert.equal(calls.leaseWrites, 2, 'auto-heal retries exactly once after the first saturated lease write');
  assert.equal(calls.purges, 1, 'auto-heal performs one pressure purge before retrying the lease');
  assert.equal(calls.continued, 1, 'auto-heal continues after pressure recovery acquires the lease');
  assert.ok(result.some((row) => row[0] === 'Start' && row[1] === 'OK'), 'recovered auto-heal reaches normal work');
}

{
  const watchdogLease = JSON.stringify({ owner: 'watchdog-owner', until: Date.now() + 600000 });
  const autoHealLease = JSON.stringify({ owner: 'autoheal-owner', until: Date.now() + 600000 });
  const purgeableKey = 'WCORE_HTTP_OLD_BUCKET';
  const purgeableValue = 'x'.repeat(256);
  const props = {
    WCORE_WATCHDOG_LEASE: watchdogLease,
    WCORE_AUTO_HEAL_LEASE: autoHealLease,
    [purgeableKey]: purgeableValue,
  };
  const removedFromCache = [];
  const context = {
    Date,
    JSON,
    Math,
    Number,
    String,
    Object,
    CacheManager: {
      _inited: true,
      init() {},
      _props: {
        getProperties: () => ({ ...props }),
        deleteProperty: (key) => { delete props[key]; },
      },
    },
    GLOBAL_CACHE_KEYS: {
      GLOBAL_WALLET: 'GLOBAL_WALLET_CACHE_V1',
      GLOBAL_PRICES: 'GLOBAL_PRICE_CACHE_V2',
    },
    CacheService: { getScriptCache: () => ({ removeAll: (keys) => removedFromCache.push(...keys) }) },
  };
  vm.createContext(context);
  const purgeFn = extractAssignedFunction(cacheCoreSource, 'CacheManager._emergencyPurge_ =');
  vm.runInContext(`CacheManager._emergencyPurge_ = ${purgeFn};`, context);
  const purgeableBytes = purgeableKey.length + purgeableValue.length;
  assert.equal(context.CacheManager._emergencyPurge_(purgeableBytes + 1), true, 'pressure purge must free a reconstructible property');
  assert.equal(props.WCORE_WATCHDOG_LEASE, watchdogLease, 'pressure purge must preserve the active watchdog owner/until lease');
  assert.equal(props.WCORE_AUTO_HEAL_LEASE, autoHealLease, 'pressure purge must preserve the active auto-heal owner/until lease');
  assert.equal(Object.prototype.hasOwnProperty.call(props, purgeableKey), false, 'pressure purge must delete the purgeable property');
  assert.ok(removedFromCache.includes(purgeableKey), 'pressure purge must evict the deleted property from CacheService');
}

{
  const ctx = makeJ1Context();
  const out = [];
  ctx._wcoreAutoHealJ1Staleness_(out, true);
  assert.equal(ctx.__calls.sync, 0, 'forced auto-heal must not sync all J1 cells when no stale gap is detected');
  assert.equal(ctx.__calls.createTrigger, 0, 'forced auto-heal must not recreate J1 trigger when no stale gap is detected');
}

{
  const props = { WCORE_J1_LATCH_REPAIR_LAST_MS: String(Date.now()) };
  const ctx = makeBootstrapContext(props);
  const out = [];
  ctx._wcoreAutoHealBootstrapState_(out, true);
  assert.equal(ctx.__calls.repairJ1, 0, 'auto-heal must not rescan J1 latch formulas when repair ran recently');
}

{
  const minutes = [];
  const context = {
    Date,
    isFinite,
    Logger: { log: () => {} },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => '0', setProperty: () => {} }),
    },
    ScriptApp: {
      getProjectTriggers: () => [],
      newTrigger: () => ({
        timeBased: () => ({
          everyMinutes: (value) => {
            minutes.push(value);
            return { create: () => {} };
          },
        }),
      }),
    },
  };
  vm.createContext(context);
  vm.runInContext(extractFunction(activityRefreshSource, '_ensureLegacyWatchdogInstalled_'), context);
  context._ensureLegacyWatchdogInstalled_();
  assert.deepEqual(minutes, [10], 'legacy watchdog repair must install WATCHDOG_FROM_RECAP every 10 minutes');

  context.ScriptApp.getProjectTriggers = () => [{ getHandlerFunction: () => 'WATCHDOG_FROM_RECAP' }];
  context._ensureLegacyWatchdogInstalled_();
  assert.deepEqual(minutes, [10], 'legacy watchdog repair must not add a duplicate trigger');
}

{
  const calls = { deleted: 0, minutes: [], watchdog: 0 };
  const context = {
    Date,
    PropertiesService: {
      getScriptProperties: () => ({ setProperty: () => {} }),
    },
    ScriptApp: {
      getProjectTriggers: () => [{ getHandlerFunction: () => 'WATCHDOG_FROM_RECAP' }],
      deleteTrigger: () => { calls.deleted++; },
      newTrigger: () => ({
        timeBased: () => ({
          everyMinutes: (value) => {
            calls.minutes.push(value);
            return { create: () => {} };
          },
        }),
      }),
    },
    WATCHDOG_FROM_RECAP: () => { calls.watchdog++; },
  };
  vm.createContext(context);
  vm.runInContext(extractFunction(diagRpcSource, 'DIAG_WATCHDOG_FIX'), context);
  const out = context.DIAG_WATCHDOG_FIX();
  assert.deepEqual(calls.minutes, [10], 'DIAG_WATCHDOG_FIX must install WATCHDOG_FROM_RECAP every 10 minutes');
  assert.equal(calls.deleted, 1, 'DIAG_WATCHDOG_FIX must replace the existing watchdog trigger exactly once');
  assert.equal(calls.watchdog, 1, 'DIAG_WATCHDOG_FIX must retain its single verification run');
  assert.match(JSON.stringify(out), /every 10 min/, 'DIAG_WATCHDOG_FIX must report the 10-minute cadence');
}

{
  const logs = [];
  const props = {
    getProperty: (key) => key.startsWith('WCORE_HTTP_T0_') ? String(Date.now()) : null,
  };
  const context = {
    Date,
    JSON,
    Math,
    Number,
    Object,
    String,
    UrlFetchApp: {},
    _originalUrlFetch: () => ({ getResponseCode: () => 200 }),
    PropertiesService: { getScriptProperties: () => props },
    HttpCallCounter: { flush: () => {}, getToday: () => 0, getQuota: () => 20000 },
    ScriptApp: {
      getProjectTriggers: () => [{
        getHandlerFunction: () => 'WATCHDOG_FROM_RECAP',
        getEventType: () => 'CLOCK',
      }],
    },
    console: { log: (message) => logs.push(String(message)) },
  };
  vm.createContext(context);
  vm.runInContext(extractFunction(diagnosticSource, 'QUOTA_RESET_READINESS_CHECK'), context);
  context.QUOTA_RESET_READINESS_CHECK();
  assert.match(logs.join('\n'), /WATCHDOG_FROM_RECAP \| event=CLOCK \| intervalMin=10/, 'knownInterval_ must report WATCHDOG_FROM_RECAP as 10 minutes at runtime');
}

{
  const productionSource = fs.readdirSync(path.join(__dirname, '..', 'src'))
    .filter((name) => name.endsWith('.gs'))
    .map((name) => fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8'))
    .join('\n');
  assert.doesNotMatch(productionSource, /newTrigger\(["']WATCHDOG_FROM_RECAP["']\)[\s\S]{0,120}?everyMinutes\(5\)/, 'production source must not install WATCHDOG_FROM_RECAP every 5 minutes');
  assert.doesNotMatch(productionSource, /handler\s*===\s*["']WATCHDOG_FROM_RECAP["'][\s\S]{0,40}?return\s*["']5["']/, 'production diagnostics must not report a known 5-minute watchdog interval');
  assert.doesNotMatch(activityRefreshSource, /WATCHDOG[\s\S]{0,120}?Running every 5 min/, 'activity diagnostics must not report a 5-minute watchdog cadence');
}

console.log('auto-heal new ledgers OK');
