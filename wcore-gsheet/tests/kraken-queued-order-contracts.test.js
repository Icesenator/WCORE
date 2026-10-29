'use strict';
// Contrat offline pour les ordres xStocks en attente d'ouverture du marché (preuve UI du 25/10/2026).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/41_KRAKEN_SYNC.gs'), 'utf8');

function harness() {
  const ctx = {
    Logger: { log() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {} }) },
    Utilities: { formatDate: d => new Date(d).toISOString() }
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return ctx;
}

test('normalisation des tickers de la capture : AMDx, BRK.Bx, LLYx', () => {
  const ctx = harness();
  assert.equal(ctx._krakenDisplayStockSymbol_('AMDx.T'), 'AMDx');
  assert.equal(ctx._krakenDisplayStockSymbol_('BRK.Bx.T'), 'BRK.Bx');
  assert.equal(ctx._krakenDisplayStockSymbol_('LLYx.T'), 'LLYx');
  assert.equal(ctx._krakenCanonicalStockSymbol_('AMDx.T'), 'AMD');
  assert.equal(ctx._krakenCanonicalStockSymbol_('BRK.Bx.T'), 'BRKB');
  assert.equal(ctx._krakenCanonicalStockSymbol_('LLYx.T'), 'LLY');
});

test('contrat d ambiguité : un ordre en attente d ouverture ("Lors de l\'ouverture du marché") n est pas un hold_trade direct', () => {
  const ctx = harness();
  // Fixture OpenOrders représentant un ordre en attente d'ouverture avec statut 'pending' ou 'open'
  const queuedOrder = {
    status: 'pending',
    vol: '10',
    vol_exec: '0',
    descr: { pair: 'AMDx/USD', type: 'sell', price: '0', ordertype: 'market' }
  };
  const index = ctx._krakenBuildAssetPairIndex_({
    amd: { base: 'AMDx', quote: 'ZUSD', wsname: 'AMDx/USD', altname: 'AMDxUSD', asset_class: 'tokenized_asset' }
  });
  const parsed = ctx._krakenParseOpenOrders_({ open: { 'ORDER-QUEUED-1': queuedOrder } }, index);
  assert.equal(parsed.status, 'OK');
  // L'ordre est compté dans les quantités en vente (sell), mais BALANCEEX hold_trade reste indépendant
  assert.equal(parsed.AMDx.sell, 10);
  // Vérification de la distinction : l'existence d'un ordre en attente ne force pas hold_trade à valoir le volume dans BalanceEx
  const balanceEx = ctx._krakenParseBalanceEx_({ result: { 'AMDx.T': { balance: '10', hold_trade: null } } });
  assert.equal(balanceEx.AMDx.hold_trade, null, 'hold_trade inconnu reste null, pas déduit des ordres');
});

test('ambiguités UI : zéro ordre ne signifie pas absence d erreur, et inversement', () => {
  const ctx = harness();
  const empty = ctx._krakenParseOpenOrders_({ open: {} });
  assert.equal(empty.status, 'OK');
  assert.equal(empty._xstockCount, 0);
});
