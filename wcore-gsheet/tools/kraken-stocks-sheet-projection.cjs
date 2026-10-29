'use strict';

// Prototype LOCAL : aucun service GAS, réseau, trigger ou câblage de production.
// Contrats lus dans 41_KRAKEN_SYNC.gs (_krakenParseBalanceEx_/OpenOrders_).
// A:G appartient exclusivement au writer partagé ; H et I+ sont séparés.
const SHEET_NAME = 'CEX - Kraken Stocks';
const ORDER_HEADERS = ['ticker', 'id', 'side', 'price', 'qty', 'executed', 'remaining', 'status', 'pair'];
const clone = value => structuredClone(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const quantity = value => number(value) ? value : (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) ? Number(value) : null);

/** Projection pure. Horodatages en millisecondes epoch fournis par l'appelant.
 * previous est exclusivement une projection antérieure de cette fonction.
 * Toute incertitude invalide le snapshot entier (pas de mélange frais/ancien).
 * Les clés des parseurs sont déjà normalisées : aucun alias/case folding ici.
 */
function projectKrakenStocksSheet({ sourceRows, snapshotBalance, orders, now, collectedAt, maxAgeMs, maxOrders = 100, previous = null }) {
  if (!Array.isArray(sourceRows) || sourceRows.some(row => !Array.isArray(row))) throw new TypeError('sourceRows doit être une matrice');
  if (!Number.isSafeInteger(maxOrders) || maxOrders < 0) throw new TypeError('maxOrders doit être un entier positif ou nul');
  const assets = [];
  for (let index = 2; index < sourceRows.length; index++) {
    const row = sourceRows[index];
    if (typeof row[0] !== 'string' || !row[0] || row[0] === '.' || row[1] === 'INFO_TOTAL') continue;
    assets.push({ rowIndex: index, ticker: row[0], total: quantity(row[1]), hold: null, available: null });
  }
  const clockValid = number(now) && number(collectedAt) && number(maxAgeMs) && collectedAt <= now;
  let status = clockValid && now - collectedAt > maxAgeMs ? 'STALE' : 'OK';
  if (!clockValid || !object(snapshotBalance) || snapshotBalance.status !== 'OK' || !object(orders) || orders.status !== 'OK') status = 'UNKNOWN';
  const seen = new Set();
  for (const asset of assets) {
    const balance = snapshotBalance && snapshotBalance[asset.ticker];
    if (seen.has(asset.ticker) || asset.total === null || !object(balance) || !number(balance.balance) || balance.balance !== asset.total || !number(balance.hold_trade)) {
      status = 'UNKNOWN';
    } else {
      asset.hold = balance.hold_trade;
      // Le crédit de trading n'est pas du patrimoine ; available du parseur
      // inclut potentiellement ce crédit et n'est donc PAS utilisé ici.
      asset.available = Math.min(asset.total, Math.max(0, asset.total - asset.hold));
    }
    seen.add(asset.ticker);
  }
  const orderRows = [];
  const ids = new Set();
  if (object(orders) && orders.status === 'OK') {
    for (const ticker of Object.keys(orders)) {
      if (ticker === 'status' || ticker.startsWith('_')) continue;
      const entry = orders[ticker];
      if (!object(entry) || !Array.isArray(entry.orders) || !/^[A-Z0-9.]+x$/.test(ticker)) { status = 'UNKNOWN'; continue; }
      for (const order of entry.orders) {
        if (!object(order) || typeof order.id !== 'string' || !order.id || ids.has(order.id) || !['buy', 'sell'].includes(order.side) || !(order.price === null || number(order.price)) || !number(order.qty) || !number(order.executed) || order.executed > order.qty || !number(order.remaining) || order.remaining <= 0 || order.remaining !== order.qty - order.executed || !['open', 'pending'].includes(order.status) || typeof order.pair !== 'string' || order.pair.split('/').length !== 2 || ![ticker, ticker + '.T'].includes(order.pair.split('/')[0]) || !order.pair.split('/')[1]) {
          status = 'UNKNOWN'; continue;
        }
        ids.add(order.id);
        orderRows.push([ticker, order.id, order.side, order.price, order.qty, order.executed, order.remaining, order.status, order.pair]);
      }
    }
    if (!Number.isSafeInteger(orders._xstockCount) || orders._xstockCount !== orderRows.length) status = 'UNKNOWN';
  }
  const holds = sourceRows.map(() => null);
  if (status === 'OK') {
    for (const asset of assets) holds[asset.rowIndex] = asset.hold;
    return { sheetName: SHEET_NAME, status, collectedAt, assets, holds, orderRows: orderRows.slice(0, maxOrders), orderCount: orderRows.length, truncated: orderRows.length > maxOrders };
  }
  // L'ancien hold et les ordres restent visibles uniquement sous UNKNOWN/STALE.
  // Ne jamais exposer leur disponibilité comme une mesure actuelle.
  const historical = previous && previous.sheetName === SHEET_NAME ? previous : null;
  for (const asset of assets) {
    const old = historical && historical.assets.find(item => item.ticker === asset.ticker);
    asset.hold = old && number(old.hold) ? old.hold : null;
    asset.available = null;
    holds[asset.rowIndex] = asset.hold;
  }
  const oldOrders = historical ? clone(historical.orderRows).slice(0, maxOrders) : [];
  return { sheetName: SHEET_NAME, status, collectedAt: historical ? historical.collectedAt : null, assets, holds, orderRows: oldOrders, orderCount: historical ? historical.orderCount : 0, truncated: historical ? historical.truncated || historical.orderRows.length > maxOrders : false };
}

/** Simulation en mémoire, jamais une écriture Sheets. I1:M1 = état/date/compte/
 * troncature/libellé ; I2:Q2 = en-têtes ; I3:Q... = ordres bornés.
 * Ce prototype possède H:Q ; A:G, dont INFO_TOTAL/Vérif, est recopié tel quel.
 * Details : E feuille exacte, F ticker exact ; H Libre, J Lock, K Total.
 */
function applyMockProjection({ sourceRows, detailsRows }, projection) {
  if (projection.sheetName !== SHEET_NAME) throw new TypeError('projection Kraken Stocks requise');
  const projectedRows = sourceRows.map(row => row.slice(0, 7));
  const count = Math.max(projectedRows.length, projection.orderRows.length + 2, 2);
  while (projectedRows.length < count) projectedRows.push(Array(7).fill(''));
  for (let index = 0; index < count; index++) projectedRows[index][7] = projection.holds[index] ?? null;
  projectedRows[0].push(projection.status, projection.collectedAt, projection.orderCount, projection.truncated, 'hold_trade / open orders');
  projectedRows[1].push(...ORDER_HEADERS);
  projection.orderRows.forEach((row, index) => projectedRows[index + 2].push(...row));
  const projectedDetails = clone(detailsRows);
  for (const row of projectedDetails) {
    if (row[4] !== SHEET_NAME) continue;
    const asset = projection.assets.find(item => item.ticker === row[5]);
    if (!asset) continue;
    row[7] = asset.available;
    row[9] = projection.status === 'OK' ? asset.hold : null;
    row[10] = asset.total;
  }
  return { sourceRows: projectedRows, detailsRows: projectedDetails };
}

module.exports = { projectKrakenStocksSheet, applyMockProjection };
