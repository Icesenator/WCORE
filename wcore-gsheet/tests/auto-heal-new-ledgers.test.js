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

console.log('auto-heal new ledgers OK');
