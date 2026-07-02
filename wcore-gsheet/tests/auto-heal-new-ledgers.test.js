const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const listingSource = fs.readFileSync(path.join(__dirname, '..', 'src', '17_LISTING.gs'), 'utf8');
const autoHealSource = fs.readFileSync(path.join(__dirname, '..', 'src', '16B_AUTO_HEAL.gs'), 'utf8');

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

console.log('auto-heal new ledgers OK');
