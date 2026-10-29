// Fixtures synthétiques Kraken REST, aucun service ni appel réseau.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/41_KRAKEN_SYNC.gs'), 'utf8'), ctx);
const fixture = (type, symbol = 'AAPLx', vol = '2', executed = '0') => ({ status: 'open', vol, vol_exec: executed, descr: { pair: symbol + '/USD', type, ordertype: 'limit', price: '100' } });
test('snapshot valide sans ordre', () => {
  const result = ctx._krakenParseOpenOrders_({ error: [], result: { open: {} } });
  assert.equal(result.status, 'OK');
  assert.equal(result._xstockCount, 0);
});
test('achat non exécuté ne crée aucune position détenue', () => {
  const result = ctx._krakenParseOpenOrders_({ open: { synthetic: fixture('buy') } });
  assert.equal(result.AAPLx.buy, 2);
  assert.equal(result.AAPLx.balance, undefined);
});
test('vente et partiel : agrégation de quantités restantes uniquement', () => {
  const result = ctx._krakenParseOpenOrders_({ open: { a: fixture('sell', 'MUx', '2', '1'), b: fixture('sell', 'MUx', '3', '0.5') } });
  assert.equal(result.MUx.sell, 3.5);
  assert.equal(result.MUx.orders.length, 2);
});
test('refus API : aucune absence ordres prétendue ni message distant exposé', () => {
  const result = ctx._krakenParseOpenOrders_({ error: ['EGeneral:Permission denied'], result: null });
  assert.equal(result.status, 'UNKNOWN');
  assert.equal(result._xstockCount, undefined);
  assert.equal(result._error, 'INVALID_OPEN_ORDERS');
});
test('BalanceEx total réservé disponible, zéro explicite et inconnu distincts', () => {
  const result = ctx._krakenParseBalanceEx_({ result: { ZEUR: { balance: '1000', hold_trade: '100' }, 'BRK.Bx.T': { balance: '2', hold_trade: '0' }, 'SKHYx.T': { balance: '1' } } });
  assert.equal(result.EUR.balance, 1000);
  assert.equal(result.EUR.available, null); // Crédit absent : disponibilité non attestée.
  assert.equal(result['BRK.Bx'].hold_trade, 0);
  assert.equal(result.SKHYx.available, null);
});
test('normalisations crypto existantes et titres exacts préservés séparément', () => {
  assert.equal(ctx._krakenCanonicalSymbol_('XXBT'), 'BTC');
  assert.equal(ctx._krakenCanonicalStockSymbol_('BRK.Bx.T'), 'BRKB');
  const result = ctx._krakenParseBalanceEx_({ 'BRK.Bx.T': { balance: '2', hold_trade: '1' } });
  assert.equal(result['BRK.Bx'].balance, 2);
  assert.equal(result.BRK, undefined);
});
