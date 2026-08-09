// Guards that Bitpanda euro stablecoins land on a single EURC line.
//
// Bitpanda reports EUR CoinVertible under its own ticker, EURCV. The workbook already
// tracks an EURC position for "CEX - Bitpanda Crypto", so an EURCV row matched nothing:
// the Verif column showed X and the balance fed no portfolio line.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const source = fs.readFileSync(path.join(SRC, '35_BITPANDA_SYNC.gs'), 'utf8');

function loadSync() {
  const context = {
    console, Date, JSON, Math, Number, String, Array, Object, RegExp,
    isFinite, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
    Logger: { log: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }) },
    SpreadsheetApp: {}, UrlFetchApp: {}, Utilities: {}, ScriptApp: {}, CacheService: {}, LockService: {}, Session: {},
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

const ctx = loadSync();

test('EURCV is treated as EURC', () => {
  assert.strictEqual(ctx._bpCanonicalSymbol_('EURCV'), 'EURC');
  assert.strictEqual(ctx._bpCanonicalSymbol_('eurcv'), 'EURC', 'the ticker casing must not matter');
});

test('an untouched ticker keeps its symbol', () => {
  assert.strictEqual(ctx._bpCanonicalSymbol_('HYPE'), 'HYPE');
  assert.strictEqual(ctx._bpCanonicalSymbol_('EURC'), 'EURC');
});

test('EURCV and EURC balances are summed onto one EURC line', () => {
  const rows = [];
  const seen = {};
  // Two wallets as the Bitpanda API returns them.
  ctx._bpPushUniqueRow_(rows, seen, ctx._bpWalletRow_({ attributes: { cryptocoin_symbol: 'EURCV', balance: '0.22' } }, 'cryptocoin_symbol'));
  ctx._bpPushUniqueRow_(rows, seen, ctx._bpWalletRow_({ attributes: { cryptocoin_symbol: 'EURC', balance: '1.50' } }, 'cryptocoin_symbol'));

  assert.strictEqual(rows.length, 1, 'the two euro stablecoins must collapse into a single line');
  assert.strictEqual(rows[0][0], 'EURC', 'the surviving line carries the tracked ticker');
  assert.ok(Math.abs(rows[0][1] - 1.72) < 1e-9, `expected 0.22 + 1.50, got ${rows[0][1]}`);
});

test('the merge holds whichever order the wallets arrive in', () => {
  const rows = [];
  const seen = {};
  ctx._bpPushUniqueRow_(rows, seen, ctx._bpWalletRow_({ attributes: { cryptocoin_symbol: 'EURC', balance: '1.50' } }, 'cryptocoin_symbol'));
  ctx._bpPushUniqueRow_(rows, seen, ctx._bpWalletRow_({ attributes: { cryptocoin_symbol: 'EURCV', balance: '0.22' } }, 'cryptocoin_symbol'));

  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0][0], 'EURC');
  assert.ok(Math.abs(rows[0][1] - 1.72) < 1e-9);
});

test('EURCV alone still reports as EURC', () => {
  const rows = [];
  const seen = {};
  ctx._bpPushUniqueRow_(rows, seen, ctx._bpWalletRow_({ attributes: { cryptocoin_symbol: 'EURCV', balance: '0.22' } }, 'cryptocoin_symbol'));

  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0][0], 'EURC', 'a lone EURCV must still match the tracked EURC line');
  assert.ok(Math.abs(rows[0][1] - 0.22) < 1e-9);
});

// Minimal harness so this file stays a plain node script like its neighbours.
function test(name, fn) {
  try {
    fn();
    console.log('OK - ' + name);
  } catch (e) {
    console.error('FAIL - ' + name);
    throw e;
  }
}
