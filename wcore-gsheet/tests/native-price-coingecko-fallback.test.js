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

function harness(responder, opts = {}) {
  const cache = new Map();
  const calls = [];
  const clock = { t: NOW };
  const ctx = {
    Date: { now: () => clock.t },
    Math, JSON, Object, Number, String, isFinite, encodeURIComponent,
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) || null, put: (k, v) => cache.set(k, v) }) },
    GlobalFxCache: { load: () => ({ rates: { USD_EUR: { rate: 0.9, ts: NOW - 1000 } } }) },
    GLOBAL_CACHE_CONFIG: { FX_TTL_MS: 21600000 },
    HTTP: { getJson: (url) => { calls.push(url); clock.t += opts.callMs || 0; return responder(url); } },
  };
  vm.createContext(ctx);
  vm.runInContext(BLOCK + '\nthis.NativePriceStore = NativePriceStore;', ctx);
  return { store: ctx.NativePriceStore, calls, clock };
}

const IDS = ['coingecko:ethereum', 'coingecko:pulsechain'];
const isLlama = (url) => url.includes('coins.llama.fi');

test('a native id missing from the DefiLlama answer is priced from CoinGecko', () => {
  const h = harness((url) => isLlama(url)
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
  const h = harness((url) => isLlama(url) ? null
    : { ethereum: { usd: 3000, last_updated_at: SEC }, pulsechain: { usd: 0.00002, last_updated_at: SEC } });
  const out = h.store.refreshIfDue({ ids: IDS, force: true, nowMs: NOW });
  assert.equal(out.reason, 'HTTP_FAILED');
  assert.equal(out.cgWritten, 2);
  assert.ok(h.store.get('coingecko:pulsechain', 3600000, NOW));
});

test('no CoinGecko call when DefiLlama priced everything, even with an unchanged date', () => {
  const h = harness(() => ({ coins: {
    'coingecko:ethereum': { price: 3000, timestamp: SEC },
    'coingecko:pulsechain': { price: 0.00002, timestamp: SEC },
  } }));
  h.store.refreshIfDue({ ids: IDS, force: true, nowMs: NOW });
  h.store.refreshIfDue({ ids: IDS, force: true, nowMs: NOW + 30 * 60000 }); // same dates: nothing written
  assert.equal(h.calls.length, 2);
  assert.ok(h.calls.every(isLlama));
});

test('invalid, future or older CoinGecko prices are not written', () => {
  const h = harness(() => null);
  const store = { entries: { 'coingecko:ethereum': { observedAt: (SEC + 10) * 1000, eur: 2700 } } };
  const n = h.store.ingestCoingecko(store, {
    ethereum: { usd: 3100, last_updated_at: SEC },        // older than the entry
    pulsechain: { usd: 0, last_updated_at: SEC },         // zero price
    bitcoin: { usd: 90000, last_updated_at: SEC + 3600 }, // future date
    celo: { usd: 0.5 },                                   // no date
  }, 0.9, NOW, NOW);
  assert.equal(n, 0);
  assert.equal(store.entries['coingecko:ethereum'].eur, 2700);
});

test('no CoinGecko call when the DefiLlama call used up the time budget', () => {
  const answer = (url) => isLlama(url) ? { coins: {} } : { pulsechain: { usd: 1, last_updated_at: SEC } };
  // DefiLlama takes 3 s of a 12 s budget: 9 s left, a full call needs 9 s, so CoinGecko runs.
  const ok = harness(answer, { callMs: 3000 });
  ok.store.refreshIfDue({ ids: IDS, force: true, nowMs: NOW, budgetMs: 12000 });
  assert.equal(ok.calls.length, 2);
  // DefiLlama takes 4 s: 8 s left, so no CoinGecko call.
  const late = harness(answer, { callMs: 4000 });
  late.store.refreshIfDue({ ids: IDS, force: true, nowMs: NOW, budgetMs: 12000 });
  assert.equal(late.calls.length, 1);
  assert.ok(late.calls.every(isLlama));
});

test('more than 50 missing ids rotate from one pass to the next, one CoinGecko call each', () => {
  const ids = Array.from({ length: 70 }, (_, i) => 'coingecko:coin-' + String(i).padStart(2, '0'));
  const asked = [];
  const h = harness((url) => {
    if (isLlama(url)) return { coins: {} };
    asked.push(decodeURIComponent(url.split('ids=')[1].split('&')[0]).split(','));
    return {}; // CoinGecko has none of them either
  });
  h.store.refreshIfDue({ ids, force: true, nowMs: NOW });
  h.store.refreshIfDue({ ids, force: true, nowMs: NOW + 30 * 60000 });
  assert.equal(asked.length, 2);
  assert.equal(asked[0].length, 50);
  const second = new Set(asked[1]);
  for (let i = 50; i < 70; i++) assert.ok(second.has('coin-' + i), 'coin-' + i + ' asked on the second pass');
});

test('without force a second pass within 25 minutes makes no call, after 25 minutes it does', () => {
  const h = harness((url) => isLlama(url) ? { coins: {} } : { pulsechain: { usd: 1, last_updated_at: SEC } });
  h.store.refreshIfDue({ ids: IDS, nowMs: NOW });
  const n = h.calls.length;
  assert.equal(h.store.refreshIfDue({ ids: IDS, nowMs: NOW + 10 * 60000 }).reason, 'NOT_DUE');
  assert.equal(h.calls.length, n);
  h.store.refreshIfDue({ ids: IDS, nowMs: NOW + 26 * 60000 });
  assert.ok(h.calls.length > n);
});
