'use strict';
// Correctifs issus des revues QA/sécurité de l'incrément 3 (P1-DATA-KRAKEN-STOCKS-OPEN-ORDERS).
// Fixtures synthétiques, aucun réseau, aucun secret.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/41_KRAKEN_SYNC.gs'), 'utf8');
const cex = fs.readFileSync(path.join(__dirname, '../src/35_BITPANDA_SYNC.gs'), 'utf8');

function harness(route) {
  const props = new Map(), cache = new Map(), calls = [], publicCalls = [];
  const store = { getProperty: k => props.has(k) ? props.get(k) : null, setProperty: (k, v) => props.set(k, String(v)), deleteProperty: k => props.delete(k) };
  const ctx = {
    Logger: { log() {} },
    PropertiesService: { getScriptProperties: () => store, getUserProperties: () => store, getDocumentProperties: () => store },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) || null, put: (k, v) => cache.set(k, v) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { getUuid: () => 'synthetic-owner', sleep() {}, formatDate: d => new Date(d).toISOString() },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => null }) },
    HttpCallCounter: { setTrigger() {}, clearTrigger() {} },
    UrlFetchApp: { fetch(url, options) {
      if (url.indexOf('/0/public/AssetPairs') >= 0) { publicCalls.push(url); return route.pub(url); }
      calls.push(url);
      return route.priv(url, options);
    } }
  };
  vm.createContext(ctx);
  // Vrais locks/leases et vrai wrapper retry du module 35.
  vm.runInContext(cex.slice(cex.indexOf('var _CEX_LOCK_TTL_MS'), cex.indexOf('function CEX_RELEASE_LOCK')) +
    cex.slice(cex.indexOf('function CEX_RELEASE_LOCK'), cex.indexOf('\nfunction ', cex.indexOf('function CEX_RELEASE_LOCK') + 10)) +
    cex.slice(cex.indexOf('var CEX_RELAY_MAX_RETRIES')), ctx);
  vm.runInContext(source, ctx);
  ctx._krakenSign_ = () => 'synthetic-signature';
  ctx._krakenGetCreds_ = () => ({ key: 'synthetic-api-key', secret: 'synthetic-private-key' });
  ctx._krakenWriteSheet_ = (ss, name, rows) => rows.length;
  return { ctx, props, calls, publicCalls, cache };
}
const json = body => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(body) });
const balanceOk = json({ error: [], result: { ZEUR: { balance: '5', hold_trade: '1', credit: '0', credit_used: '0' } } });
const pairsOk = () => json({ error: [], result: {} });

test('P1 relance : Balance null = 1 appel privé au plus, jamais de rejeu du cycle', () => {
  const h = harness({ pub: pairsOk, priv: () => null });
  const out = JSON.parse(h.ctx.UPDATE_KRAKEN_SPOT());
  assert.equal(out.ok, false);
  assert.deepEqual(h.calls, ['https://api.kraken.com/0/private/Balance']);
  assert.ok(!/blocked\/null|Address unavailable/.test(out.error), 'message non transitoire pour le wrapper partagé');
});

test('P1 relance : transport « Address unavailable » non rejoué', () => {
  const h = harness({ pub: pairsOk, priv: () => { throw new Error('Address unavailable: synthetic-host'); } });
  const out = JSON.parse(h.ctx.UPDATE_KRAKEN_STOCKS_FIAT());
  assert.equal(h.calls.length, 1);
  assert.doesNotMatch(out.error, /synthetic-host|Address unavailable/);
});

for (const [label, reply] of [
  ['erreur API', () => json({ error: ['EGeneral:Invalid arguments synthetic-raw-detail'] })],
  ['HTTP 500', () => ({ getResponseCode: () => 500, getContentText: () => 'synthetic-raw-body' })]
]) test('P1 allowlist : ' + label + ' sans texte distant brut dans statut/retour', () => {
  const h = harness({ pub: pairsOk, priv: reply });
  const out = h.ctx.UPDATE_KRAKEN_SPOT();
  assert.doesNotMatch(out, /synthetic-raw/);
  assert.doesNotMatch(String(h.props.get('KRAKEN_SYNC_STATUS') || ''), /synthetic-raw/);
  if (label === 'HTTP 500') assert.match(out, /HTTP 500/);
});

test('P1 lockout : message fixe conservé, pause armée', () => {
  const h = harness({ pub: pairsOk, priv: () => json({ error: ['EGeneral:Temporary lockout synthetic-raw'] }) });
  const out = h.ctx.UPDATE_KRAKEN_SPOT();
  assert.match(out, /Temporary lockout/);
  assert.doesNotMatch(out, /synthetic-raw/);
  assert.ok(Number(h.props.get('KRAKEN_LOCKOUT_UNTIL_MS')) > Date.now());
});

test('P1 diagnostics : lock KRAKEN requis, aucun appel si occupé, cache sans snapshot', () => {
  const h = harness({ pub: pairsOk, priv: url => url.endsWith('/BalanceEx') ? balanceOk : json({ error: [], result: { open: {} } }) });
  assert.equal(h.ctx.CEX_ACQUIRE_LOCK('KRAKEN'), true);
  assert.match(h.ctx.DIAG_KRAKEN_API(), /BUSY/);
  assert.match(h.ctx.DIAG_KRAKEN_LOOP(), /BUSY/);
  assert.equal(h.calls.length, 0);
  h.ctx.CEX_RELEASE_LOCK('KRAKEN');
  h.ctx.DIAG_KRAKEN_API();
  assert.equal(h.calls.length, 1);
  const cached = String(h.props.get('KRAKEN_DIAG_BUCKETS_CACHE') || [...h.props.entries()].find(([k]) => /DIAG/.test(k))?.[1] || '');
  assert.ok(cached.length > 0);
  assert.doesNotMatch(cached, /snapshot|hold_trade|orders/);
});

test('P2 injection : id ou paire commençant par =,+,-,@ => UNKNOWN', () => {
  const h = harness({ pub: pairsOk, priv: () => null });
  const index = h.ctx._krakenBuildAssetPairIndex_({ p: { base: 'AAPLx', quote: 'ZUSD', wsname: 'AAPLx/USD', altname: 'AAPLxUSD' } });
  const order = { status: 'open', vol: '1', vol_exec: '0', descr: { pair: 'AAPLx/USD', type: 'buy', price: '1' } };
  assert.equal(h.ctx._krakenParseOpenOrders_({ open: { '=HYPERLINK("x")': order } }, index).status, 'UNKNOWN');
  const evil = h.ctx._krakenBuildAssetPairIndex_({ p: { base: 'AAPLx', quote: 'ZUSD', wsname: '=AAPLx/USD' } });
  assert.equal(h.ctx._krakenParseOpenOrders_({ open: { 'OAAAAA-BBBBB-CCCCCC': { ...order, descr: { ...order.descr, pair: '=AAPLx/USD' } } } }, evil).status, 'UNKNOWN');
  assert.equal(h.ctx._krakenParseOpenOrders_({ open: { 'OAAAAA-BBBBB-CCCCCC': order } }, index).status, 'OK');
});

test('P2 paires : index crypto + tokenized, ordre crypto ignoré sans rendre UNKNOWN', () => {
  const h = harness({ priv: () => null, pub: url => json({ error: [], result: url.indexOf('tokenized_asset') >= 0
    ? { AAPLxUSD: { base: 'AAPLx', quote: 'ZUSD', wsname: 'AAPLx/USD', altname: 'AAPLxUSD' } }
    : { XXBTZEUR: { base: 'XXBT', quote: 'ZEUR', wsname: 'XBT/EUR', altname: 'XBTEUR' } } }) });
  const index = h.ctx._krakenAssetPairIndex_();
  assert.equal(h.publicCalls.length, 2);
  const o = (pair, type) => ({ status: 'open', vol: '2', vol_exec: '0', descr: { pair, type, price: '1' } });
  const r = h.ctx._krakenParseOpenOrders_({ open: { 'OAAAAA-AAAAA-AAAAAA': o('XBTEUR', 'buy'), 'OBBBBB-BBBBB-BBBBBB': o('AAPLxUSD', 'sell') } }, index);
  assert.equal(r.status, 'OK');
  assert.equal(r._xstockCount, 1);
  assert.equal(r.AAPLx.sell, 2);
  // Cache réduit : un second appel n'émet aucun fetch public.
  h.ctx._krakenAssetPairIndex_();
  assert.equal(h.publicCalls.length, 2);
  assert.ok([...h.cache.values()][0].length < 2000);
});

test('P3 BalanceEx : collision/crédit inconnu crypto non bloquants, fiat/xStock bloquants', () => {
  const h = harness({ pub: pairsOk, priv: () => null });
  const ok = h.ctx._krakenParseBalanceEx_({ result: { USDC: { balance: '1', hold_trade: '0', credit: '0', credit_used: '0' }, USDT: { balance: '2', hold_trade: '0', credit: '0', credit_used: '0' }, XXBT: { balance: '1', hold_trade: '0' }, ZEUR: { balance: '5', hold_trade: '1', credit: '0', credit_used: '0' } } });
  assert.equal(ok.status, 'OK');
  assert.equal(ok.EUR.available, 4);
  const bad = h.ctx._krakenParseBalanceEx_({ result: { ZEUR: { balance: '5', hold_trade: '1' } } });
  assert.equal(bad.status, 'UNKNOWN');
});

test('P2 projection : ligne fiat sans hold fiable => I1 UNKNOWN (jamais lock 0 implicite)', () => {
  const h = harness({ pub: pairsOk, priv: () => null });
  const cells = [['', '', '', '', '', '', '', '', 'UNKNOWN'], ['h', 'b'], ['EUR', 9], ['AAPLx', 3]];
  const sheet = { getLastRow: () => cells.length, getRange: (r, c, n = 1, m = 1) => ({
    getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => (cells[r + i - 1] || [])[c + j - 1] ?? '')),
    setValues: v => v.forEach((row, i) => row.forEach((x, j) => { cells[r + i - 1] ??= []; cells[r + i - 1][c + j - 1] = x; })) }) };
  const snap = { collectedAt: Date.now(), balance: { status: 'OK', EUR: { balance: 5, hold_trade: 1 }, AAPLx: { balance: 3, hold_trade: 0 } }, orders: { status: 'OK', _xstockCount: 0 } };
  assert.equal(h.ctx._krakenWriteStocksProjection_(sheet, snap), 'UNKNOWN');
  assert.equal(cells[0][8], 'UNKNOWN');
  assert.match(String(cells[0][12]), /historique/i);
});

test('P2 budget : échec d\'écriture du compteur => aucun fetch', () => {
  const h = harness({ pub: pairsOk, priv: () => balanceOk });
  const store = h.ctx.PropertiesService.getScriptProperties();
  const set = store.setProperty;
  store.setProperty = (k, v) => { if (k === 'KRAKEN_PRIVATE_CALLS_24H') throw new Error('storage'); return set(k, v); };
  assert.throws(() => h.ctx._krakenPrivatePost_('/0/private/BalanceEx', {}, h.ctx._krakenGetCreds_()));
  assert.equal(h.calls.length, 0);
});

test('formules Details : numéro de ligne entier >= 2 exigé', () => {
  const h = harness({ pub: pairsOk, priv: () => null });
  assert.throws(() => h.ctx._krakenStocksDetailsFormulas_('2;=1'));
  assert.throws(() => h.ctx._krakenStocksDetailsFormulas_(1));
  assert.ok(h.ctx._krakenStocksDetailsFormulas_(5).K.includes('$F5'));
});
