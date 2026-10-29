const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/41_KRAKEN_SYNC.gs'), 'utf8'), ctx);
const plain = value => JSON.parse(JSON.stringify(value));
const order = (status = 'open', extra = {}) => ({ status, vol: '2', vol_exec: '0.5', descr: { pair: 'AAPLx/USD', type: 'sell', ordertype: 'limit', price: '100' }, ...extra });
test('closed/canceled/expired ne contribuent jamais aux ordres actifs', () => {
  for (const status of ['closed', 'canceled', 'expired']) {
    assert.equal(ctx._krakenParseOpenOrders_({ open: { synthetic: order(status) } })._xstockCount, 0);
  }
});
test('partiel : quantité restante, côté et prix depuis descr Kraken', () => {
  const r = ctx._krakenParseOpenOrders_({ open: { synthetic: order() } });
  assert.equal(r.AAPLx.sell, 1.5);
  assert.equal(r.AAPLx.orders[0].qty, 2);
  assert.equal(r.AAPLx.orders[0].executed, 0.5);
  assert.equal(r.AAPLx.orders[0].remaining, 1.5);
});
test('absent/malformé/refusé reste UNKNOWN, zéro seulement snapshot valide', () => {
  for (const input of [null, {}, { open: null }, { open: [] }, { error: ['EGeneral:Permission denied'] }]) {
    assert.equal(ctx._krakenParseOpenOrders_(input).status, 'UNKNOWN');
  }
  assert.equal(ctx._krakenParseOpenOrders_({ open: {} }).status, 'OK');
});
test('BalanceEx credit et credit_used ne changent pas le patrimoine détenu', () => {
  const r = ctx._krakenParseBalanceEx_({ ZEUR: { balance: '100', hold_trade: '20', credit: '30', credit_used: '10' } });
  assert.equal(r.EUR.balance, 100);
  assert.equal(r.EUR.available, 100);
  assert.equal(r.EUR.credit, 30);
  assert.equal(r.EUR.credit_used, 10);
});
test('BalanceEx inconnus et nombres malformés ne deviennent pas zéro', () => {
  for (const hold of [null, undefined, '', 'broken', -1]) {
    const r = ctx._krakenParseBalanceEx_({ ZEUR: { balance: '100', hold_trade: hold } });
    assert.equal(r.EUR.hold_trade, null);
    assert.equal(r.EUR.available, null);
  }
  for (const input of [null, {}, { error: [] }, { result: null }, { result: [] }]) {
    assert.equal(ctx._krakenParseBalanceEx_(input).status, 'UNKNOWN');
  }
  assert.equal(ctx._krakenParseBalanceEx_({ error: [], result: {} }).status, 'OK');
});
test('BalanceEx conserve les identités xStocks sans changer canonical crypto', () => {
  const r = ctx._krakenParseBalanceEx_(Object.fromEntries(['AAPLx', 'BRK.Bx.T', 'MUx', 'SKHYx'].map(k => [k, { balance: '2', hold_trade: '1' }])));
  assert.deepEqual(Object.keys(r).filter(k => k !== 'status'), ['AAPLx', 'BRK.Bx', 'MUx', 'SKHYx']);
  assert.equal(ctx._krakenCanonicalSymbol_('XXBT'), 'BTC');
});
test('entrées invalides ne sont jamais ignorées comme zéro ordre', () => {
  const r = ctx._krakenParseOpenOrders_({ open: { synthetic: order('open', { vol_exec: '3' }) } });
  assert.equal(r.status, 'UNKNOWN');
});
test('fonctions pures : aucun service disponible, entrée inchangée', () => {
  const input = { open: { synthetic: order() } };
  const before = JSON.stringify(input);
  ctx._krakenParseOpenOrders_(input);
  assert.equal(JSON.stringify(input), before);
});
