'use strict';
// Fixtures exclusivement locales : corruption persistée, injection Sheets et bornes de travail.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/41_KRAKEN_SYNC.gs'), 'utf8');
const NOW = 1792950000000;
function harness(initial = {}) {
  const props = new Map(Object.entries(initial)), writes = [], logs = [], fetches = [];
  class Clock extends Date { static now() { return NOW; } }
  const store = { getProperty: k => props.get(k) ?? null, setProperty: (k, v) => { writes.push([k, v]); props.set(k, v); }, deleteProperty: k => props.delete(k) };
  const ctx = { Date: Clock, Logger: { log: x => logs.push(String(x)) },
    PropertiesService: { getScriptProperties: () => store, getUserProperties: () => store, getDocumentProperties: () => store },
    Utilities: { formatDate: () => 'stamp' }, UrlFetchApp: { fetch: (...args) => { fetches.push(args); throw new Error('REMOTE_SENTINEL'); } },
    HttpCallCounter: { setTrigger() {}, clearTrigger() {} }, SpreadsheetApp: { openById: () => ({ getSheetByName: () => null }) } };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  ctx._krakenSign_ = () => 'synthetic';
  return { ctx, props, writes, logs, fetches };
}
const pair = (base = 'AAPLx.T') => ({ base, quote: 'USD', wsname: 'AAPLx/USD', altname: 'AAPLxUSD' });
const order = () => ({ status: 'open', descr: { pair: 'AAPLxUSD', type: 'buy', price: '12' }, vol: '3', vol_exec: '1' });
const many = (n, value) => Object.fromEntries(Array.from({ length: n }, (_, i) => ['K' + i, value()]));
function sheet(lastRow = 3) {
  const writes = [], reads = [];
  return { writes, reads, getLastRow: () => lastRow, getMaxColumns: () => 17,
    getRange: (r, c, n, m) => ({ getValues: () => { reads.push([r, c, n, m]); return [['', ''], ['header', ''], ['AAPLx', 3]]; }, setValues: v => writes.push({ r, c, v }), clearContent: () => writes.push({ r, c, clear: true }) }) };
}
function snapshot(orders = { status: 'OK' }) { return { collectedAt: NOW, balance: { status: 'OK', AAPLx: { balance: 3, hold_trade: 1 } }, orders }; }
for (const raw of ['NOT_A_TIMESTAMP', '123junk', '1,,2', 'NaN', 'Infinity', '9007199254740992', String(NOW + 1), '1.2', '-1', ' 1']) {
  test('compteur corrompu refuse sans réécriture : ' + raw, () => {
    const h = harness({ KRAKEN_PRIVATE_CALLS_24H: raw });
    assert.throws(() => h.ctx._krakenAssertPrivateBudget_(), /compteur prive/);
    assert.throws(() => h.ctx._krakenCountPrivateCall_(), /compteur prive/);
    assert.equal(h.props.get('KRAKEN_PRIVATE_CALLS_24H'), raw);
    assert.equal(h.writes.length, 0);
    assert.equal(JSON.parse(h.ctx.KRAKEN_BUDGET_STATUS()).private_calls_24h, null);
    assert.equal(h.fetches.length, 0);
  });
}
for (const raw of [undefined, '', String(NOW - 86400001)]) test('compteur zéro connu : ' + raw, () => {
  const h = harness(raw === undefined ? {} : { KRAKEN_PRIVATE_CALLS_24H: raw });
  assert.equal(h.ctx._krakenPrivateCalls24h_().length, 0);
  h.ctx._krakenCountPrivateCall_(); assert.equal(h.props.get('KRAKEN_PRIVATE_CALLS_24H'), String(NOW));
});
for (const raw of ['NOT_A_NONCE', '123junk', '9007199254740992', '9007199254740991', '1e15', '-1', '1.5', ' 123']) test('nonce corrompu/épuisé fail-closed : ' + raw, () => {
  const h = harness({ KRAKEN_LAST_NONCE: raw });
  assert.throws(() => h.ctx._krakenNextNonce_(), /nonce/i);
  assert.equal(h.props.get('KRAKEN_LAST_NONCE'), raw);
  assert.equal(h.writes.length, 0);
  assert.throws(() => h.ctx._krakenPrivatePost_('/0/private/BalanceEx', {}, { key: 'k', secret: 's' }), /nonce/);
  assert.equal(h.fetches.length, 0);
});
for (const raw of [undefined, '', String(NOW * 1000 + 20)]) test('nonce absent ou entier sûr : ' + raw, () => {
  const h = harness(raw === undefined ? {} : { KRAKEN_LAST_NONCE: raw });
  const a = h.ctx._krakenNextNonce_(), b = h.ctx._krakenNextNonce_();
  assert.match(a, /^\d+$/); assert.match(b, /^\d+$/);
  assert.ok(Number.isSafeInteger(Number(b)) && Number(b) > Number(a));
  if (raw) assert.ok(Number(a) > Number(raw));
});
for (const row of [Infinity, NaN, 1e30, 10000001, Number.MAX_SAFE_INTEGER, 2.5]) test('ligne Details invalide : ' + row, () => {
  assert.throws(() => harness().ctx._krakenStocksDetailsFormulas_(row), /Ligne Details invalide/);
});
test('ligne Sheets maximale acceptée', () => assert.match(harness().ctx._krakenStocksDetailsFormulas_(10000000).H, /10000000/));
test('ticker issu de metadata malveillante jamais projeté', () => {
  const h = harness();
  const index = h.ctx._krakenBuildAssetPairIndex_({ AAPLxUSD: pair('=1+1x.T') });
  const parsed = h.ctx._krakenParseOpenOrders_({ open: { ID1: order() } }, index);
  assert.equal(parsed.status, 'UNKNOWN');
  assert.equal(parsed['=1+1x'], undefined);
});
for (const ticker of ['AAPLx', 'BRK.Bx', 'MUx', 'SKHYx']) test('ticker légitime conservé : ' + ticker, () => {
  const h = harness(); const o = order(); o.descr.pair = ticker + '/USD';
  const parsed = h.ctx._krakenParseOpenOrders_({ open: { ID1: o } });
  assert.equal(parsed.status, 'OK'); assert.equal(parsed[ticker].buy, 2);
});
test('défense ultime projection rejette un ticker injecté avant tout hold/ordre', () => {
  const h = harness(), sh = sheet();
  const orders = { status: 'OK', '=1+1x': { orders: [{ id: 'ID1', side: 'buy', pair: 'AAPLx/USD' }] } };
  assert.equal(h.ctx._krakenWriteStocksProjection_(sh, snapshot(orders)), 'UNKNOWN');
  assert.ok(sh.writes.every(w => w.r === 1 && w.c >= 9));
  assert.doesNotMatch(JSON.stringify(sh.writes), /=1\+1/);
});
test('AssetPairs trop nombreux refusés avant parcours des valeurs', () => {
  const h = harness(), meta = many(10001, () => pair());
  Object.defineProperty(meta, 'K0', { enumerable: true, get() { throw new Error('VALUE_VISITED'); } });
  assert.throws(() => h.ctx._krakenBuildAssetPairIndex_(meta), /UNKNOWN.*limite/);
  assert.throws(() => h.ctx._krakenReduceAssetPairs_(meta, {}), /UNKNOWN.*limite/);
});
test('OpenOrders trop nombreux = UNKNOWN, jamais zéro connu', () => {
  const h = harness(), open = Object.fromEntries(Array.from({ length: 2001 }, (_, i) => { const o = order(); o.descr.pair = 'AAPLx/USD'; return ['ID' + i, o]; }));
  assert.equal(h.ctx._krakenParseOpenOrders_({ open }).status, 'UNKNOWN');
});
test('projection feuille trop grande : aucune lecture massive ni écriture A:G/H', () => {
  const h = harness(), sh = sheet(5001);
  assert.equal(h.ctx._krakenWriteStocksProjection_(sh, snapshot()), 'UNKNOWN');
  assert.equal(sh.reads.length, 0);
  assert.ok(sh.writes.every(w => w.r === 1 && w.c >= 9));
});
test('projection ordres trop nombreux : pas de hold écrit avant validation', () => {
  const h = harness(), sh = sheet();
  const orders = { status: 'OK', AAPLx: { orders: Array.from({ length: 2001 }, () => ({ id: 'ID1', side: 'buy', pair: 'AAPLx/USD' })) } };
  assert.equal(h.ctx._krakenWriteStocksProjection_(sh, snapshot(orders)), 'UNKNOWN');
  assert.ok(sh.writes.every(w => w.r === 1 && w.c >= 9));
});
test('cache public >95KB refusé sans parsing/fetch/remplacement silencieux', () => {
  const h = harness(); let puts = 0;
  h.ctx.CacheService = { getScriptCache: () => ({ get: () => ' '.repeat(95001), put: () => puts++ }) };
  assert.throws(() => h.ctx._krakenAssetPairIndex_(), /UNKNOWN.*limite/);
  assert.equal(h.fetches.length, 0); assert.equal(puts, 0);
});
test('cache réduit sérialisé borné en octets UTF-8, non tronqué', () => {
  const h = harness(); let puts = 0;
  h.ctx.CacheService = { getScriptCache: () => ({ get: () => null, put: () => puts++ }) };
  h.ctx._krakenFetchPublicPairs_ = () => many(2000, () => pair('A'.repeat(100) + 'x.T'));
  assert.throws(() => h.ctx._krakenAssetPairIndex_(), /UNKNOWN.*limite/);
  assert.equal(puts, 0);
});
test('cache réduit avec aliases trop nombreux refusé avant construction index', () => {
  const h = harness();
  assert.throws(() => h.ctx._krakenIndexFromReduced_({ t: [], c: Array(30001).fill('XXBTZUSD') }), /UNKNOWN.*limite/);
});
test('cache réduit avec chaîne démesurée refusé', () => {
  const h = harness();
  assert.throws(() => h.ctx._krakenIndexFromReduced_({ t: [['ID', 'A'.repeat(100000), 'USD']], c: [] }), /UNKNOWN.*limite/);
});
test('Ticker trop de résultats = erreur fixe UNKNOWN', () => {
  const h = harness(); h.ctx.UrlFetchApp.fetch = () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ result: many(5001, () => ({ c: ['1'] })) }) });
  assert.throws(() => h.ctx._krakenFetchXStockPricesUsd_([['AAPLx', 1]]), /prix xStocks UNKNOWN/);
});
test('balance trop grande fail-closed avant parcours et émission OpenOrders', () => {
  const h = harness(); let posts = 0;
  h.ctx._krakenPrivatePost_ = () => { posts++; return many(5001, () => ({ balance: '1' })); };
  assert.throws(() => h.ctx._krakenFetchBuckets_({}), /UNKNOWN.*limite/);
  assert.equal(posts, 1);
});
test('cache diagnostic trop grand fail-closed sans parse/fetch/réécriture', () => {
  const h = harness({ KRAKEN_DIAG_BUCKETS_JSON: ' '.repeat(95001) });
  assert.throws(() => h.ctx._krakenDiagBuckets_(), /UNKNOWN.*limite/);
  assert.equal(h.writes.length, 0); assert.equal(h.fetches.length, 0);
});
test('cache diagnostic produit trop grand refusé avant persistance', () => {
  const h = harness();
  h.ctx._krakenWithDiagLock_ = fn => fn(); h.ctx._krakenGetCreds_ = () => ({});
  h.ctx._krakenFetchBuckets_ = () => ({ crypto: Array(5000).fill(['LONGSYMBOL1234567890', 1]), fiat: [], xstocks: [] });
  assert.throws(() => h.ctx._krakenDiagBuckets_(), /UNKNOWN.*limite/);
  assert.equal(h.props.has('KRAKEN_DIAG_BUCKETS_JSON'), false);
});
test('compteur historique surdimensionné fail-closed avant split', () => {
  const raw = Array(1000).fill(String(NOW)).join(',');
  const h = harness({ KRAKEN_PRIVATE_CALLS_24H: raw });
  assert.throws(() => h.ctx._krakenCountPrivateCall_(), /compteur prive/);
  assert.equal(h.props.get('KRAKEN_PRIVATE_CALLS_24H'), raw); assert.equal(h.writes.length, 0);
});
test('writer refuse lignes excessives avant toute écriture et tout prix', () => {
  const h = harness(), sh = sheet(); let totals = 0;
  h.ctx._cexComputeAndAppendTotal_ = () => totals++;
  assert.throws(() => h.ctx._krakenWriteSheet_({ getSheetByName: () => sh }, 'CEX - Kraken Stocks', Array(5001).fill(['AAPLx', 1])), /UNKNOWN.*limite/);
  assert.equal(sh.writes.length, 0); assert.equal(totals, 0); assert.equal(h.fetches.length, 0);
});
test('balance stock injectée : parse UNKNOWN, writer refuse avant A:G', () => {
  const h = harness(), sh = sheet(); let totals = 0;
  const parsed = h.ctx._krakenParseBalanceEx_({ result: { '=1+1x.T': { balance: '3', hold_trade: '1', credit: '0', credit_used: '0' } } });
  assert.equal(parsed.status, 'UNKNOWN');
  h.ctx._cexComputeAndAppendTotal_ = () => totals++;
  assert.throws(() => h.ctx._krakenWriteSheet_({ getSheetByName: () => sh }, 'CEX - Kraken Stocks', [['=1+1x', 3]]), /UNKNOWN/);
  assert.equal(sh.writes.length, 0); assert.equal(totals, 0); assert.equal(h.fetches.length, 0);
});
test('OpenOrders plafond effectif avec paires valides', () => {
  const h = harness(), open = Object.fromEntries(Array.from({ length: 2001 }, (_, i) => { const o = order(); o.descr.pair = 'AAPLx/USD'; return ['ID' + i, o]; }));
  assert.equal(h.ctx._krakenParseOpenOrders_({ open }).status, 'UNKNOWN');
});
test('cache UTF-8 multioctets : 95k caractères ne signifient pas 95k octets', () => {
  const h = harness(); let puts = 0;
  h.ctx.CacheService = { getScriptCache: () => ({ get: () => 'é'.repeat(48000), put: () => puts++ }) };
  assert.throws(() => h.ctx._krakenAssetPairIndex_(), /UNKNOWN.*limite/);
  assert.equal(puts, 0); assert.equal(h.fetches.length, 0);
});
for (const failure of ['transport', 'json', 'api']) for (const handler of ['UPDATE_KRAKEN_SPOT', 'UPDATE_KRAKEN_STOCKS_FIAT']) test('Logger handler sans erreur publique brute : ' + handler + '/' + failure, () => {
  const h = harness(); h.ctx._krakenFetchBuckets_ = () => ({ crypto: [], fiat: [], xstocks: [['AAPLx', 1]] });
  h.ctx._krakenGetCreds_ = () => ({}); h.ctx._cexRelayFetchWithRetry_ = fn => fn();
  h.ctx._krakenWriteSheet_ = () => h.ctx._krakenFetchXStockPricesUsd_([['AAPLx', 1]]);
  h.ctx.UrlFetchApp.fetch = () => { if (failure === 'transport') throw new Error('REMOTE_SENTINEL'); return { getResponseCode: () => 200, getContentText: () => failure === 'json' ? 'REMOTE_SENTINEL' : JSON.stringify({ error: ['REMOTE_SENTINEL'] }) }; };
  const result = h.ctx[handler]();
  assert.match(result, /prix xStocks UNKNOWN/);
  assert.doesNotMatch(result + h.logs.join('') + JSON.stringify([...h.props]), /REMOTE_SENTINEL/);
});

test('télémétrie nominale : 1 privé par cycle, 24 par jour, aucun fetch de diagnostic readonly', () => {
  const h = harness();
  const st = JSON.parse(h.ctx.KRAKEN_BUDGET_STATUS());
  assert.equal(st.projected_calls_per_day, 24);
  assert.match(st.cadence, /1 appel/);
  assert.equal(h.fetches.length, 0);
});
