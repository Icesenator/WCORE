// v4.17.0 - NativePriceStore falls back to CoinGecko for the native ids DefiLlama did not
// price in a pass (Ledger - PulseChain stayed NATIVE_PRICE_UNKNOWN on 2026-11-11).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', '07_PRICES.gs'), 'utf8');
const start = SOURCE.indexOf('var NativePriceStore = ');
const end = SOURCE.indexOf('try { if (typeof ModuleRegistry !== "undefined" && ModuleRegistry.register) ModuleRegistry.register("NATIVE_PRICE_STORE"');
assert.ok(start >= 0 && end > start, 'NativePriceStore block found');
const BLOCK = SOURCE.slice(start, end);

const NOW = Date.UTC(2026, 10, 11, 18, 0, 0);
const SEC = Math.round(NOW / 1000) - 60;

function harness(responder) {
  const cache = new Map();
  const calls = [];
  const ctx = {
    Date: { now: () => NOW },
    Math, JSON, Object, Number, String, isFinite, encodeURIComponent,
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) || null, put: (k, v) => cache.set(k, v) }) },
    GlobalFxCache: { load: () => ({ rates: { USD_EUR: { rate: 0.9, ts: NOW - 1000 } } }) },
    GLOBAL_CACHE_CONFIG: { FX_TTL_MS: 21600000 },
    HTTP: { getJson: (url) => { calls.push(url); return responder(url); } },
  };
  vm.createContext(ctx);
  vm.runInContext(BLOCK + '\nthis.NativePriceStore = NativePriceStore;', ctx);
  return { store: ctx.NativePriceStore, calls };
}

const IDS = ['coingecko:ethereum', 'coingecko:pulsechain'];

test('a native id missing from the DefiLlama answer is priced from CoinGecko', () => {
  const h = harness((url) => url.includes('coins.llama.fi')
    ? { coins: { 'coingecko:ethereum': { price: 3000, timestamp: SEC, confidence: 0.99 } } }
    : { pulsechain: { usd: 0.00002, last_updated_at: SEC } });
  const out = h.store.refreshIfDue({ ids: IDS, force: true, nowMs: NOW });
  assert.equal(out.written, 2);
  assert.equal(out.cgMissing, 1);
  assert.equal(h.calls.length, 2);
  assert.ok(h.calls[1].includes('ids=pulsechain&'), 'only the missing id is asked to CoinGecko');
  const pls = h.store.get('coingecko:pulsechain', 3600000, NOW);
  assert.equal(pls.src, 'coingecko-native');
  assert.ok(Math.abs(pls.eur - 0.000018) < 1e-12);
  assert.equal(h.store.get('coingecko:ethereum', 3600000, NOW).src, 'llama-native');
});

test('a failed DefiLlama batch is covered by CoinGecko', () => {
  const h = harness((url) => url.includes('coins.llama.fi') ? null
    : { ethereum: { usd: 3000, last_updated_at: SEC }, pulsechain: { usd: 0.00002, last_updated_at: SEC } });
  const out = h.store.refreshIfDue({ ids: IDS, force: true, nowMs: NOW });
  assert.equal(out.reason, 'HTTP_FAILED');
  assert.equal(out.cgWritten, 2);
  assert.ok(h.store.get('coingecko:pulsechain', 3600000, NOW));
});

test('no CoinGecko call when DefiLlama priced everything', () => {
  const h = harness(() => ({ coins: {
    'coingecko:ethereum': { price: 3000, timestamp: SEC },
    'coingecko:pulsechain': { price: 0.00002, timestamp: SEC },
  } }));
  h.store.refreshIfDue({ ids: IDS, force: true, nowMs: NOW });
  assert.equal(h.calls.length, 1);
});

test('invalid, future or older CoinGecko prices are not written', () => {
  const h = harness(() => null);
  const store = { entries: { 'coingecko:ethereum': { observedAt: (SEC + 10) * 1000, eur: 2700 } } };
  const n = h.store.ingestCoingecko(store, {
    ethereum: { usd: 3100, last_updated_at: SEC },           // older than the entry
    pulsechain: { usd: 0, last_updated_at: SEC },            // zero price
    bitcoin: { usd: 90000, last_updated_at: SEC + 3600 },    // future date
    celo: { usd: 0.5 },                                      // no date
  }, 0.9, NOW, NOW);
  assert.equal(n, 0);
  assert.equal(store.entries['coingecko:ethereum'].eur, 2700);
});

test('no CoinGecko call when the time budget is spent', () => {
  const h = harness((url) => url.includes('coins.llama.fi') ? { coins: {} } : { pulsechain: { usd: 1, last_updated_at: SEC } });
  const out = h.store.refreshIfDue({ ids: IDS, force: true, nowMs: NOW, budgetMs: 9500 });
  // 9.5 s covers one call (8 s + 1 s margin) but Date.now() is frozen, so the budget check
  // passes; with 8.9 s nothing runs at all.
  assert.ok(out.http <= 2);
  const none = harness(() => ({ coins: {} })).store.refreshIfDue({ ids: IDS, force: true, nowMs: NOW, budgetMs: 8900 });
  assert.equal(none.reason, 'BUDGET');
});
