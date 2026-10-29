'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const location = path.join(__dirname, '../../tools/kraken-order-reconciliation.cjs');
const api = fs.existsSync(location) ? require(location) : {};
const reconcile = input => {
  assert.equal(typeof api.reconcileOrderEvidence, 'function', 'réconciliation pure manquante');
  return api.reconcileOrderEvidence(input);
};
const compare = (a, b) => {
  assert.equal(typeof api.compareQuantities, 'function', 'contrat unités manquant');
  return api.compareQuantities(a, b);
};
const ui = () => ({ observedAt: null, orders: [{ ticker: 'BRK.Bx', side: 'sell', method: 'market_on_open', amountEur: 99, balanceLabel: 'Solde de' }] });
const rest = () => ({ status: 'OK', count: 0, complete: true, scopeAttested: true, collectedAt: 200 });
const quantity = (extra = {}) => ({ ticker: 'BRK.Bx', value: 2, observedAt: 200, unit: { basis: 'rebased', evidence: 'fixture explicite' }, ...extra });

test('snapshot REST valide zéro et observation UI coexistent sans conclure absence UI', () => {
  const result = reconcile({ ui: ui(), rest: rest() });
  assert.equal(result.restCount, 0);
  assert.equal(result.uiOrders.length, 1);
  assert.equal(result.uiAbsence, 'UNKNOWN');
  assert.equal(result.discrepancy, 'UNKNOWN');
});

test('EUR et Solde de ne produisent ni quantité, ni 100%, ni hold déduit ; ticker exact conservé', () => {
  const result = reconcile({ ui: ui(), rest: rest() });
  assert.deepEqual(result.uiOrders, [{ ticker: 'BRK.Bx', side: 'sell', method: 'market_on_open', quantity: null }]);
  assert.equal(result.holdTrade, 'UNKNOWN');
  assert.equal(result.balanceEvolution, 'UNKNOWN');
  assert.equal(result.fundsReconciliation, 'UNKNOWN');
});

test('timestamps absents ou distincts restent non contemporains UNKNOWN', () => {
  assert.equal(reconcile({ ui: ui(), rest: rest() }).contemporaneous, 'UNKNOWN');
  const observation = { ...ui(), observedAt: 100 };
  assert.equal(reconcile({ ui: observation, rest: rest() }).contemporaneous, 'UNKNOWN');
});

test('même timestamp ne prouve pas le mapping UI REST ni une anomalie après exécution', () => {
  const result = reconcile({ ui: { ...ui(), observedAt: 200 }, rest: rest() });
  assert.equal(result.contemporaneous, 'YES');
  assert.equal(result.uiRestMapping, 'UNKNOWN');
  assert.equal(result.discrepancy, 'UNKNOWN');
});

test('refus, snapshot partiel, scope absent ou horodatage invalide ne deviennent pas zéro REST', () => {
  for (const change of [{ status: 'ERROR' }, { complete: false }, { scopeAttested: false }, { collectedAt: null }, { count: -1 }]) {
    assert.equal(reconcile({ ui: ui(), rest: { ...rest(), ...change } }).restCount, null);
  }
});

test('fixture pending acceptée par parseur ne prouve jamais un mapping API réel ; entrées préservées', () => {
  const input = { ui: ui(), rest: { ...rest(), count: 1, pendingFixtureParsed: true } };
  const before = structuredClone(input);
  const result = reconcile(input);
  assert.equal(result.uiRestMapping, 'UNKNOWN');
  assert.equal(result.restCount, 1);
  assert.deepEqual(input, before);
});

test('comparaison possible seulement pour ticker, époque et unité explicitement attestés identiques', () => {
  assert.deepEqual(compare(quantity(), quantity()), { status: 'COMPARABLE', relation: 'EQUAL' });
  assert.deepEqual(compare(quantity(), quantity({ value: 3 })), { status: 'COMPARABLE', relation: 'LESS' });
  assert.deepEqual(compare(quantity({ value: 3 }), quantity()), { status: 'COMPARABLE', relation: 'GREATER' });
});

test('base SPV et rebased equity incompatibles même si chiffres égaux, sans conversion inventée', () => {
  assert.equal(compare(quantity(), quantity({ unit: { basis: 'base', evidence: 'fixture' } })).status, 'UNKNOWN');
});

test('métadonnées absentes, default supposé ou monnaie ne sont pas une unité xStocks attestée', () => {
  for (const unit of [null, { basis: 'rebased' }, { basis: 'rebased', evidence: '' }, { basis: 'EUR', evidence: 'UI' }]) {
    assert.equal(compare(quantity(), quantity({ unit })).status, 'UNKNOWN');
  }
});

test('quantités invalides, identités aliases et époques différentes ne sont jamais comparées', () => {
  for (const change of [{ value: NaN }, { value: -1 }, { value: '2' }, { ticker: 'BRKB' }, { observedAt: 201 }, { observedAt: null }]) {
    assert.equal(compare(quantity(), quantity(change)).status, 'UNKNOWN');
  }
  assert.equal(compare(quantity({ value: 0 }), quantity({ value: 0 })).relation, 'EQUAL');
});
