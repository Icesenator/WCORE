// Guards that Bitpanda stocks reporting under both legacy "security.stock" and the
// newer "equity_security" product land on TWO distinct lines instead of being merged.
//
// Bitpanda /asset-wallets returns two wallet entries for the same canonical symbol
// (e.g. GOOGL) when the user holds both products. Without splitting, the merge
// aggregator collapses them onto a single line and the workbook loses the
// per-product visibility. The legacy line keeps the bare ticker (GOOGL) and the
// new product line receives the "-LEG" suffix (GOOGL-LEG), matching the user's
// decision that the suffix designates the non-legacy product so the legacy line
// is still easy to identify at a glance.
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

test('push dedup treats empty and -LEG suffixes as distinct slots', () => {
  const rows = [];
  const seen = {};
  ctx._bpPushUniqueRow_(rows, seen, ['GOOGL', 0.18831583], '');
  ctx._bpPushUniqueRow_(rows, seen, ['GOOGL', 0.12947624], '-LEG');
  assert.strictEqual(rows.length, 2, 'different product suffixes must not collapse');
  assert.strictEqual(rows[0][0], 'GOOGL');
  assert.strictEqual(rows[1][0], 'GOOGL');
  assert.ok(Math.abs(rows[0][1] - 0.18831583) < 1e-9);
  assert.ok(Math.abs(rows[1][1] - 0.12947624) < 1e-9);
});

test('two legacy wallets for the same ticker still merge', () => {
  const rows = [];
  const seen = {};
  ctx._bpPushUniqueRow_(rows, seen, ['GOOGL', 0.10], '');
  ctx._bpPushUniqueRow_(rows, seen, ['GOOGL', 0.20], '');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0][0], 'GOOGL');
  assert.ok(Math.abs(rows[0][1] - 0.30) < 1e-9);
});

test('strip helper removes only a trailing -LEG', () => {
  assert.strictEqual(ctx._bpStripNewStockSuffix_('GOOGL-LEG'), 'GOOGL');
  assert.strictEqual(ctx._bpStripNewStockSuffix_('googl-leg'), 'GOOGL');
  assert.strictEqual(ctx._bpStripNewStockSuffix_('GOOGL'), 'GOOGL');
  assert.strictEqual(ctx._bpStripNewStockSuffix_('LEG-LEG'), 'LEG');
});

test('merge keeps bare ticker for equity-only holdings, suffix only for doubled', () => {
  const legacy = [['GOOGL', 0.18831583], ['AAPL', 0.16857511]];
  const equity = [['GOOGL', 0.12947624], ['BRKB', 0.04997182]];
  const merged = ctx._bpMergeStocksWithEquities_(legacy, equity);
  assert.strictEqual(merged.length, 4, 'GOOGL + GOOGL-LEG + AAPL + BRKB');
  const byKey = Object.fromEntries(merged.map(r => [r[0], r[1]]));
  assert.ok(Math.abs(byKey['GOOGL'] - 0.18831583) < 1e-9, 'legacy keeps the bare ticker');
  assert.ok(Math.abs(byKey['GOOGL-LEG'] - 0.12947624) < 1e-9, 'doubled ticker gets the -LEG suffix');
  assert.ok(Math.abs(byKey['AAPL'] - 0.16857511) < 1e-9);
  assert.strictEqual(byKey['BRKB-LEG'], undefined, 'no BRKB-LEG expected');
  assert.ok(Math.abs(byKey['BRKB'] - 0.04997182) < 1e-9, 'equity-only BRKB stays under its bare ticker');
});

test('zero legacy balance folds the equity amount back into the bare ticker', () => {
  const legacy = [['GOOGL', 0]];
  const equity = [['GOOGL', 0.12947624]];
  const merged = ctx._bpMergeStocksWithEquities_(legacy, equity);
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0][0], 'GOOGL');
  assert.ok(Math.abs(merged[0][1] - 0.12947624) < 1e-9);
});

test('fiat consolidation keeps -LEG rows and does not merge them with EUR', () => {
  const buckets = {
    crypto: [],
    fiat: [['EUR', 42]],
    stocks: [['GOOGL', 0.18831583]],
    equities: [['GOOGL', 0.12947624]],
    action: [],
    commodity: [['GOLD', 1]],
  };
  const outputs = ctx._bpBuildOutputBuckets_(buckets);
  const byKey = Object.fromEntries(outputs.stocks.map(r => [r[0], r[1]]));
  assert.ok(Math.abs(byKey['GOOGL'] - 0.18831583) < 1e-9);
  assert.ok(Math.abs(byKey['GOOGL-LEG'] - 0.12947624) < 1e-9);
  assert.strictEqual(byKey['EUR'], 42);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(outputs, 'commodity'), false);
});

test('Action Details builder keeps -LEG tickers distinct in the ticker column', () => {
  const detailsSource = fs.readFileSync(path.join(SRC, '44_XSTOCKS_SOLANA.gs'), 'utf8');
  assert.match(detailsSource, /_xstocksResolveCanonicalSymbol_[\s\S]*-LEG[\s\S]*raw\.slice\(0, -4\)/,
    '_xstocksResolveCanonicalSymbol_ must strip -LEG to resolve the canonical alias');
  assert.match(detailsSource, /items\.push\(\{ symbol: _xstocksResolveCanonicalSymbol_\(symbol, portfolioSymbols\), source: STOCK_PORTFOLIO_DETAILS_CONFIG\.BITPANDA_SHEET_NAME, ticker: symbol/,
    'Bitpanda row in Action Details must keep the raw ticker (incl. -LEG) in column F');
});

function test(name, fn) {
  try {
    fn();
    console.log('OK - ' + name);
  } catch (e) {
    console.error('FAIL - ' + name);
    throw e;
  }
}
