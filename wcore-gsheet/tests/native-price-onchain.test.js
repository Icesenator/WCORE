// v4.17.2 - Troisieme source de prix natif : paire V2 lue on-chain quand ni DefiLlama ni CoinGecko
// n'ont d'observation de moins d'une heure (Ledger - PulseChain, 16/11/2026 : PLS a 4,6 h aux deux).
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

const NOW = Date.UTC(2026, 10, 16, 19, 0, 0);
const SEC = Math.round(NOW / 1000) - 30;
const ID = 'coingecko:pulsechain';
const CFG_RPCS = ['https://rpc.pulsechain.com', 'https://pulsechain-rpc.publicnode.com'];
const WPLS = '0xa1077a294dde1b09bb078844df40758a5d0f9a27';
const DAI = '0xefd766ccb38eaf1dfd701853bfce31359239f305';

const hex32 = (units) => '0x' + (BigInt(Math.round(units * 1e6)) * 10n ** 12n).toString(16).padStart(64, '0');
const word = (addr) => '0x' + '0'.repeat(24) + addr.replace(/^0x/, '');

// Reponse JSON-RPC groupee d'une paire WPLS/DAI : 62 Md WPLS / 309 183 DAI => ~4,98e-6 USD.
function pairAnswer(over = {}) {
  const r0 = over.r0 != null ? over.r0 : 62030082587.21;
  const r1 = over.r1 != null ? over.r1 : 309183.32;
  return [
    { id: 1, result: hex32(r0) + hex32(r1).slice(2) + '0'.repeat(64) },
    { id: 2, result: word(over.token0 || WPLS) },
    { id: 3, result: word(over.token1 || DAI) },
    { id: 4, result: { timestamp: '0x' + (over.blockTs != null ? over.blockTs : SEC).toString(16) } },
  ];
}

function harness(responders, opts = {}) {
  const cache = new Map();
  const posts = [];
  const gets = [];
  const clock = { t: NOW };
  const ctx = {
    Date: { now: () => clock.t },
    Math, JSON, Object, Number, String, isFinite, encodeURIComponent, parseInt, BigInt,
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) || null, put: (k, v) => cache.set(k, v) }) },
    GlobalFxCache: { load: () => ({ rates: { USD_EUR: { rate: 0.9, ts: NOW - 1000 } } }) },
    GLOBAL_CACHE_CONFIG: { FX_TTL_MS: 21600000 },
    HTTP: {
      getJson: (url) => { gets.push(url); clock.t += opts.callMs || 0; return opts.get ? opts.get(url) : (url.includes('coins.llama.fi') ? { coins: {} } : {}); },
      post: (url) => { posts.push(url); clock.t += opts.callMs || 0; const r = responders.shift(); return r === undefined ? null : { body: r }; },
      parseJson: (resp) => (resp && resp.body) || null,
    },
  };
  vm.createContext(ctx);
  vm.runInContext(BLOCK + '\nthis.NativePriceStore = NativePriceStore;', ctx);
  return { store: ctx.NativePriceStore, posts, gets, clock };
}

test('a stale id priced by neither DefiLlama nor CoinGecko is read on-chain, dated by the block', () => {
  const h = harness([pairAnswer()]);
  const out = h.store.refreshIfDue({ ids: [ID], force: true, nowMs: NOW });
  assert.equal(out.ocWritten, 1);
  assert.equal(h.posts.length, 1);
  assert.equal(h.posts[0], CFG_RPCS[0]);
  const e = h.store.load().entries[ID];
  assert.equal(e.src, 'dex-onchain');
  assert.equal(e.observedAt, SEC * 1000, 'date = timestamp of the latest block, never local time');
  assert.ok(Math.abs(e.usd - 309183.32 / 62030082587.21) < 1e-12);
  assert.ok(Math.abs(e.eur - e.usd * 0.9) < 1e-15);
  const got = h.store.get(ID, 5400000, NOW);
  assert.equal(got.src, 'dex-onchain');
});

test('no on-chain read when an observation younger than one hour already exists', () => {
  const h = harness([pairAnswer()], { get: (url) => url.includes('coins.llama.fi') ? { coins: { [ID]: { price: 0.000005, timestamp: SEC - 600, confidence: 0.99 } } } : {} });
  const out = h.store.refreshIfDue({ ids: [ID], force: true, nowMs: NOW });
  assert.equal(h.posts.length, 0);
  assert.equal(out.ocMissing, 0);
});

test('a configured id with a 2 h old observation is read on-chain and the fresher block wins', () => {
  const h = harness([pairAnswer()], { get: (url) => url.includes('coins.llama.fi') ? { coins: { [ID]: { price: 0.000004, timestamp: SEC - 2 * 3600, confidence: 0.99 } } } : { pulsechain: { usd: 0.000004, last_updated_at: SEC - 2 * 3600 } } });
  const out = h.store.refreshIfDue({ ids: [ID], force: true, nowMs: NOW });
  assert.equal(out.ocWritten, 1);
  assert.equal(h.store.load().entries[ID].src, 'dex-onchain');
});

test('an id without on-chain configuration never triggers an RPC call', () => {
  const h = harness([pairAnswer()]);
  const out = h.store.refreshIfDue({ ids: ['coingecko:ethereum'], force: true, nowMs: NOW });
  assert.equal(h.posts.length, 0);
  assert.equal(out.ocMissing, 0);
});

test('wrong token order, thin liquidity, zero reserves or a future block write nothing', () => {
  for (const over of [
    { token0: DAI, token1: WPLS },
    { r1: 1000 },                 // 1 000 DAI of liquidity, below the 50 000 minimum
    { r0: 0 },
    { blockTs: SEC + 3600 },
  ]) {
    const h = harness([pairAnswer(over)]);
    const out = h.store.refreshIfDue({ ids: [ID], force: true, nowMs: NOW });
    assert.equal(out.ocWritten, 0, JSON.stringify(over));
    assert.equal(h.store.get(ID, 5400000, NOW), null);
  }
});

test('a price more than 2x away from the known observation is refused, one within 2x is accepted', () => {
  const known = { entries: { [ID]: { usd: 0.0000049, eur: 0.0000044, observedAt: (SEC - 3 * 3600) * 1000, fetchedAt: NOW, src: 'llama-native' } } };
  const h = harness([]);
  assert.equal(h.store.ingestOnchain(JSON.parse(JSON.stringify(known)), ID, h.store.CONFIG.ONCHAIN_SOURCES[ID], { r0: hex32(1000), r1: hex32(60000), token0: WPLS, token1: DAI, blockTs: SEC }, 0.9, NOW, NOW), 0, '60 USD per WPLS');
  assert.equal(h.store.ingestOnchain(JSON.parse(JSON.stringify(known)), ID, h.store.CONFIG.ONCHAIN_SOURCES[ID], { r0: hex32(62030082587.21), r1: hex32(309183.32), token0: WPLS, token1: DAI, blockTs: SEC }, 0.9, NOW, NOW), 1);
});

test('an existing observation at least as recent as the block is kept', () => {
  const h = harness([]);
  const store = { entries: { [ID]: { usd: 0.000005, eur: 0.0000045, observedAt: (SEC + 5) * 1000, fetchedAt: NOW, src: 'llama-native' } } };
  const n = h.store.ingestOnchain(store, ID, h.store.CONFIG.ONCHAIN_SOURCES[ID], { r0: hex32(62030082587.21), r1: hex32(309183.32), token0: WPLS, token1: DAI, blockTs: SEC }, 0.9, NOW, NOW);
  assert.equal(n, 0);
  assert.equal(store.entries[ID].src, 'llama-native');
});

test('the second RPC is tried when the first one fails', () => {
  const h = harness([null, pairAnswer()]);
  const out = h.store.refreshIfDue({ ids: [ID], force: true, nowMs: NOW });
  assert.equal(h.posts.length, 2);
  assert.deepEqual(h.posts, CFG_RPCS);
  assert.equal(out.ocWritten, 1);
});

test('all RPCs failing leaves the id unknown (never zero)', () => {
  const h = harness([null, null]);
  const out = h.store.refreshIfDue({ ids: [ID], force: true, nowMs: NOW });
  assert.equal(out.ocWritten, 0);
  assert.equal(h.store.get(ID, 5400000, NOW), null);
});

test('a block older than 90 min is stored but still refused by get(): no validity extension', () => {
  const h = harness([pairAnswer({ blockTs: SEC - 2 * 3600 })]);
  h.store.refreshIfDue({ ids: [ID], force: true, nowMs: NOW });
  assert.equal(h.store.get(ID, 5400000, NOW), null);
});

test('no on-chain read when the time budget cannot cover a full HTTP delay', () => {
  // DefiLlama and CoinGecko take 3 s each of a 12 s budget: 6 s left, a full call needs 9 s.
  const h = harness([pairAnswer()], { callMs: 3000 });
  const out = h.store.refreshIfDue({ ids: [ID], force: true, nowMs: NOW, budgetMs: 12000 });
  assert.equal(h.posts.length, 0);
  assert.equal(out.ocWritten, 0);
});

test('the real PulseX pair figures give the expected price (4.98e-6 USD per PLS)', () => {
  const h = harness([]);
  const store = { entries: {} };
  h.store.ingestOnchain(store, ID, h.store.CONFIG.ONCHAIN_SOURCES[ID], { r0: hex32(62030082587.21276), r1: hex32(309183.3228570392), token0: WPLS, token1: DAI, blockTs: SEC }, 0.9082, NOW, NOW);
  assert.ok(Math.abs(store.entries[ID].usd - 4.984409e-6) < 1e-11);
});
