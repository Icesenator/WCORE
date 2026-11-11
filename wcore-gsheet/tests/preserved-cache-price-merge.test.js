// v4.16.96 - In the price merge of a preserved wallet cache, a price and its date travel together.
//
// When a partial scan must not overwrite the wallet cache, its positive prices are still merged
// into the cache that is kept. Since the web scan adapter keeps the observation time of a stale
// price (or 0 when the API gave none), an incoming price can be older than the one already held,
// or of unattested age. It used to replace the held price while the held, recent date stayed:
// an outdated price then carried a fresh date (Codex review of 2026-11-11).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', '04C_CACHE_GLOBAL.gs'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing function ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

const context = { Object, parseFloat, parseInt, isFinite, String, NaN };
vm.createContext(context);
vm.runInContext(extractFunction(SOURCE, '_mergePositivePricesIntoPreservedCache'), context);
const merge = (held, incoming) => {
  const cache = JSON.parse(JSON.stringify(held));
  const merged = context._mergePositivePricesIntoPreservedCache(cache, incoming);
  return { merged, pm: cache.priceMap, pt: cache.priceTsMap };
};

const T_OLD = 1798000000000;
const T_HELD = 1798070000000;
const T_NEW = 1798080000000;
const HELD = { priceMap: { native: 2000 }, priceTsMap: { native: T_HELD } };

test('a newer dated price replaces the held price and its date', () => {
  const out = merge(HELD, { priceMap: { native: 2100 }, priceTsMap: { native: T_NEW } });
  assert.deepEqual([out.pm.native, out.pt.native, out.merged], [2100, T_NEW, 1]);
});

test('a stale price without a date never replaces a dated price, nor borrows its date', () => {
  const out = merge(HELD, { priceMap: { native: 1500 }, priceTsMap: { native: 0 } });
  assert.deepEqual([out.pm.native, out.pt.native, out.merged], [2000, T_HELD, 0]);
});

test('a price observed before the held one does not replace it', () => {
  const out = merge(HELD, { priceMap: { native: 1500 }, priceTsMap: { native: T_OLD } });
  assert.deepEqual([out.pm.native, out.pt.native, out.merged], [2000, T_HELD, 0]);
});

test('with nothing dated to protect, an undated price is taken with an unattested age', () => {
  const empty = merge({ priceMap: {}, priceTsMap: {} }, { priceMap: { native: 1500 }, priceTsMap: { native: 0 } });
  assert.deepEqual([empty.pm.native, empty.pt.native, empty.merged], [1500, 0, 1]);
  const heldUndated = merge({ priceMap: { native: 2000 }, priceTsMap: {} }, { priceMap: { native: 1500 }, priceTsMap: { native: 0 } });
  assert.deepEqual([heldUndated.pm.native, heldUndated.pt.native], [1500, 0]);
});

test('a caller that passes no date at all keeps the previous behaviour', () => {
  const out = merge(HELD, { priceMap: { native: 2100 }, priceTsMap: {} });
  assert.deepEqual([out.pm.native, out.pt.native, out.merged], [2100, T_HELD, 1]);
});

test('zero, negative and unreadable prices are still ignored', () => {
  const out = merge(HELD, { priceMap: { native: 0, a: -1, b: 'x' }, priceTsMap: { native: T_NEW, a: T_NEW, b: T_NEW } });
  assert.deepEqual([out.pm.native, out.pt.native, out.merged], [2000, T_HELD, 0]);
  assert.equal('a' in out.pm || 'b' in out.pm, false);
});
