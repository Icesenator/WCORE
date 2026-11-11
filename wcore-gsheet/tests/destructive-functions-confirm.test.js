// v4.16.95 - Functions that erase or rewrite everything need an explicit confirmation.
//
// RESET_ALL_PROPERTIES erased every script property (caches, settings, tokens) on a bare call,
// and REHYDRATE_WALLET_CACHE_FROM_LEDGER_SHEETS rewrote every wallet cache from the displayed
// tabs, dated now. Both now require confirm === true, like COMPACT_PACKED_WALLET_CACHE
// (audit of 2026-11-11).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', '18_CLEANUP.gs'), 'utf8');

function load() {
  const calls = { deleteAll: 0, spreadsheet: 0 };
  const context = {
    console, Date, JSON, Math, Number, String, Array, Object, RegExp,
    Logger: { log: () => {} },
    PropertiesService: { getScriptProperties: () => ({ deleteAllProperties: () => { calls.deleteAll++; } }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => { calls.spreadsheet++; throw new Error('the spreadsheet must not be read without confirmation'); } },
  };
  vm.createContext(context);
  vm.runInContext(SOURCE, context);
  return { context, calls };
}

test('RESET_ALL_PROPERTIES erases nothing without confirm === true', () => {
  const { context, calls } = load();
  for (const arg of [undefined, false, 'TRUE', 1, null]) {
    const out = context.RESET_ALL_PROPERTIES(arg);
    assert.match(String(out), /^Usage: RESET_ALL_PROPERTIES\(TRUE\)/);
  }
  assert.equal(calls.deleteAll, 0);
  assert.equal(context.RESET_ALL_PROPERTIES(true), 'OK - All properties deleted');
  assert.equal(calls.deleteAll, 1);
});

test('REHYDRATE_WALLET_CACHE_FROM_LEDGER_SHEETS touches nothing without confirm === true', () => {
  const { context, calls } = load();
  for (const arg of [undefined, false, 'TRUE', 1]) {
    const out = context.REHYDRATE_WALLET_CACHE_FROM_LEDGER_SHEETS(arg);
    assert.equal(out[0][0], 'USAGE');
    assert.equal(out[0].length, 4, 'same four-column shape as its other answers');
  }
  assert.equal(calls.spreadsheet, 0, 'no tab is read, no cache is rewritten');
});

test('no caller inside the script invokes them without the confirmation', () => {
  const dir = path.join(__dirname, '..', 'src');
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.gs'))) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const name of ['RESET_ALL_PROPERTIES', 'REHYDRATE_WALLET_CACHE_FROM_LEDGER_SHEETS']) {
      const bare = new RegExp(`(?<!function\\s)\\b${name}\\(\\s*\\)`);
      assert.equal(bare.test(text), false, `${file} calls ${name}() without confirmation`);
    }
  }
});
