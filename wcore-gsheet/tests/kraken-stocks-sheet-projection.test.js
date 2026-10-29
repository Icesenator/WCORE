'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modulePath = '../tools/kraken-stocks-sheet-projection.cjs';
// Chargement conditionnel pour que RED signale la capacité absente, pas un import cassé.
const api = fs.existsSync(path.join(__dirname, modulePath)) ? require(modulePath) : {};
const SHEET = 'CEX - Kraken Stocks';
const rows = [
  [false, 'stamp', '', '', '', '', ''],
  ['ticker', 'balance', 'price', 'name', 'value_eur', 'Vérif', ''],
  ['AAPLx', 10, 5, 'Apple', 50, '=EXACT()', ''],
  ['BRK.Bx', 2, 20, 'Berkshire', 40, '', ''],
  ['EUR', 100, 1, 'Euro', 100, '', ''],
  ['.', 'INFO_TOTAL', 'kraken', 'stamp', '', '', 190]
];
const balance = (hold = 3) => ({ status: 'OK', AAPLx: { balance: 10, hold_trade: hold, credit: 50, credit_used: 0, available: 57 }, 'BRK.Bx': { balance: 2, hold_trade: 0, credit: 0, credit_used: 0, available: 2 }, EUR: { balance: 100, hold_trade: 80, credit: 900, credit_used: 0, available: 920 }, BTC: { balance: 4, hold_trade: 1, available: 3 } });
const order = (id, side = 'buy') => ({ id, side, price: 5, qty: 4, executed: 1, remaining: 3, status: 'open', pair: 'AAPLx/EUR' });
const orders = { status: 'OK', AAPLx: { orders: [order('buy'), order('sell', 'sell')] }, _xstockCount: 2 };
const input = (extra = {}) => ({ sourceRows: rows, snapshotBalance: balance(), orders, now: 1000, collectedAt: 900, maxAgeMs: 200, maxOrders: 8, ...extra });
const project = (extra) => {
  assert.equal(typeof api.projectKrakenStocksSheet, 'function', 'projection pure disponible');
  return api.projectKrakenStocksSheet(input(extra));
};
const details = () => [
  ['Apple', '', '', '', SHEET, 'AAPLx', '', 10, 'keep', 0, 10, '=K1*G1'],
  ['Other', '', '', '', 'CEX - Bitpanda Stocks', 'AAPLx', '', 8, '', 0, 8, 88],
  ['Alias', '', '', '', SHEET, 'AAPLX', '', 6, '', 0, 6, 66],
  ['Crypto', '', '', '', 'CEX - Kraken Crypto', 'BTC', '', 4, '', 0, 4, 44]
];

test('achat et vente partiels : hold BalanceEx seul, crédit exclu, EUR global non distribué', () => {
  const p = project();
  assert.equal(p.status, 'OK');
  assert.deepEqual(p.assets.map(a => [a.ticker, a.total, a.hold, a.available]), [['AAPLx', 10, 3, 7], ['BRK.Bx', 2, 0, 2], ['EUR', 100, 80, 20]]);
  assert.equal(p.orderRows.length, 2);
  assert.equal(p.orderRows[0][6], 3);
  assert.equal(p.holds[4], 80);
});

test('application mock : A:G byteequal, Details exact E/F, L inchangé, autres feuilles identiques', () => {
  const p = project();
  const sourceRows = structuredClone(rows);
  const detailsRows = details();
  const before = JSON.stringify({ sourceRows, detailsRows });
  const result = api.applyMockProjection({ sourceRows, detailsRows }, p);
  assert.equal(JSON.stringify(result.sourceRows.map(r => r.slice(0, 7))), JSON.stringify(rows));
  assert.equal(result.sourceRows[2][7], 3);
  assert.deepEqual([result.detailsRows[0][7], result.detailsRows[0][9], result.detailsRows[0][10], result.detailsRows[0][11]], [7, 3, 10, '=K1*G1']);
  assert.deepEqual(result.detailsRows.slice(1), detailsRows.slice(1));
  assert.equal(JSON.stringify({ sourceRows, detailsRows }), before);
  assert.equal(result.sourceRows[0][8], 'OK');
  assert.equal(result.sourceRows[0][9], 900);
});

test('cash EUR et USD réservé globalement : détenu conservé, disponibilité réduite sans attribution actions', () => {
  const cashRows = [...structuredClone(rows).slice(0, -1), ['USD', 50, '', '', '', '', ''], rows.at(-1)];
  const b = balance();
  b.USD = { balance: 50, hold_trade: 10, credit: 0, credit_used: 0, available: 40 };
  const p = project({ sourceRows: cashRows, snapshotBalance: b });
  const result = api.applyMockProjection({ sourceRows: cashRows, detailsRows: [[0, '', '', '', SHEET, 'EUR', '', 100, 0, 0, 100, 100], [0, '', '', '', SHEET, 'USD', '', 50, 0, 0, 50, 45]] }, p);
  assert.deepEqual(result.detailsRows.map(r => [r[7], r[9], r[10], r[11]]), [[20, 80, 100, 100], [40, 10, 50, 45]]);
});

test('zéro courant valide efface anciens ordres et holds ; aucune donnée ancienne restante en I+', () => {
  const previous = project();
  const p = project({ snapshotBalance: balance(0), orders: { status: 'OK', _xstockCount: 0 }, previous });
  assert.equal(p.assets[0].available, 10);
  assert.equal(p.holds[2], 0);
  assert.deepEqual(p.orderRows, []);
  const oldSheet = api.applyMockProjection({ sourceRows: rows, detailsRows: [] }, previous);
  const next = api.applyMockProjection(oldSheet, p);
  assert.equal(next.sourceRows[2].length, 8);
  assert.equal(next.sourceRows[3].length, 8);
});

for (const [name, extra, status] of [
  ['erreur balance', { snapshotBalance: { status: 'UNKNOWN' } }, 'UNKNOWN'],
  ['erreur ordres', { orders: { status: 'UNKNOWN' } }, 'UNKNOWN'],
  ['stale', { now: 1201 }, 'STALE'],
  ['futur', { collectedAt: 1001 }, 'UNKNOWN'],
  ['horloge absente', { now: undefined }, 'UNKNOWN'],
  ['hold null', { snapshotBalance: { ...balance(), AAPLx: { balance: 10, hold_trade: null } } }, 'UNKNOWN'],
  ['mismatch B', { snapshotBalance: { ...balance(), AAPLx: { balance: 11, hold_trade: 3 } } }, 'UNKNOWN'],
  ['ticker non exact', { snapshotBalance: { ...balance(), AAPLx: undefined, AAPLX: balance().AAPLx } }, 'UNKNOWN'],
  ['ordre malformé', { orders: { status: 'OK', AAPLx: { orders: [{ ...order('bad'), remaining: -1 }] }, _xstockCount: 1 } }, 'UNKNOWN'],
  ['compteur incohérent', { orders: { ...orders, _xstockCount: 0 } }, 'UNKNOWN']
]) test(name + ' : conservation historique marquée, disponibilité inconnue, total préservé', () => {
  const previous = project();
  const p = project({ ...extra, previous });
  assert.equal(p.status, status);
  assert.equal(p.collectedAt, 900);
  assert.equal(p.holds[2], 3);
  assert.deepEqual(p.orderRows, previous.orderRows);
  assert.equal(p.assets[0].available, null);
  assert.equal(p.assets[0].total, 10);
  const applied = api.applyMockProjection({ sourceRows: rows, detailsRows: details() }, p);
  assert.equal(applied.detailsRows[0][7], null);
  assert.equal(applied.detailsRows[0][9], null);
  assert.equal(applied.detailsRows[0][10], 10);
  assert.equal(applied.sourceRows[0][8], status);
});

test('échec initial ne fabrique aucun zéro', () => {
  const p = project({ snapshotBalance: null });
  assert.equal(p.holds[2], null);
  assert.equal(p.assets[0].available, null);
  assert.deepEqual(p.orderRows, []);
  assert.equal(p.collectedAt, null);
});

test('hold supérieur au patrimoine borné, table multiordres bornée sans faux statut complet', () => {
  assert.equal(project({ snapshotBalance: balance(12) }).assets[0].available, 0);
  const p = project({ maxOrders: 1 });
  assert.equal(p.orderRows.length, 1);
  assert.equal(p.truncated, true);
  assert.equal(p.orderCount, 2);
  assert.equal(p.assets[0].hold, 3);
});

test('paire brute .T du parseur acceptée sans renormaliser les clés source', () => {
  const p = project({ orders: { status: 'OK', AAPLx: { orders: [{ ...order('raw'), pair: 'AAPLx.T/EUR' }] }, _xstockCount: 1 } });
  assert.equal(p.status, 'OK');
  assert.equal(p.orderRows[0][8], 'AAPLx.T/EUR');
});

test('symboles déjà normalisés BRK.Bx exacts et entrées immuables', () => {
  const data = input();
  const before = JSON.stringify(data);
  project(data);
  assert.equal(JSON.stringify(data), before);
  const result = api.applyMockProjection({ sourceRows: rows, detailsRows: [['', '', '', '', SHEET, 'BRK.Bx', '', 99, '', 99, 99, 42]] }, project());
  assert.deepEqual(result.detailsRows[0].slice(7), [2, '', 0, 2, 42]);
});
