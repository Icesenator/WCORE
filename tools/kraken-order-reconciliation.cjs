'use strict';

// LOCAL ONLY : fonctions pures, sans I/O, GAS, réseau ni raccordement LIVE.
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const timestamp = value => Number.isSafeInteger(value) && value >= 0;

/** UI = transcription d'une observation, jamais une réponse OpenOrders supposée.
 * rest = compteur déjà validé par l'appelant ; complete inclut pagination/filtres,
 * scopeAttested porte sur le périmètre de collecte, pas sur la correspondance UI.
 * L'égalité d'horodatage n'atteste ni identité d'ordre, ni fonds, ni exécution.
 */
function reconcileOrderEvidence({ ui, rest } = {}) {
  const uiOrders = Array.isArray(ui?.orders) ? ui.orders.map(order => ({
    ticker: typeof order?.ticker === 'string' ? order.ticker : null,
    side: ['buy', 'sell'].includes(order?.side) ? order.side : null,
    method: typeof order?.method === 'string' ? order.method : null,
    // Montant EUR et libellé « Solde de » ne sont pas une quantité attestée.
    quantity: null
  })) : [];
  const restValid = rest?.status === 'OK' && rest.complete === true && rest.scopeAttested === true &&
    timestamp(rest.collectedAt) && Number.isSafeInteger(rest.count) && rest.count >= 0;
  return {
    uiOrders,
    restCount: restValid ? rest.count : null,
    contemporaneous: restValid && timestamp(ui?.observedAt) && ui.observedAt === rest.collectedAt ? 'YES' : 'UNKNOWN',
    uiAbsence: 'UNKNOWN',
    uiRestMapping: 'UNKNOWN',
    discrepancy: 'UNKNOWN',
    holdTrade: 'UNKNOWN',
    balanceEvolution: 'UNKNOWN',
    fundsReconciliation: 'UNKNOWN'
  };
}

/** Quantités numériques synthétiques ; aucune conversion/default/alias implicite.
 * unit.evidence est une référence d'attestation fournie par l'appelant, pas une
 * validation automatique. basis suit la documentation Kraken : rebased=equity,
 * base=SPV. Même basis sans preuve de collecte ne suffit pas.
 * Époque strictement identique exigée ; aucun epsilon temporel arbitraire.
 */
function compareQuantities(left, right) {
  for (const item of [left, right]) {
    if (!item || typeof item.ticker !== 'string' || !item.ticker || !nonnegative(item.value) ||
        !timestamp(item.observedAt) || !['rebased', 'base'].includes(item.unit?.basis) ||
        typeof item.unit.evidence !== 'string' || !item.unit.evidence.trim()) return { status: 'UNKNOWN' };
  }
  if (left.ticker !== right.ticker || left.observedAt !== right.observedAt || left.unit.basis !== right.unit.basis) {
    return { status: 'UNKNOWN' };
  }
  return { status: 'COMPARABLE', relation: left.value === right.value ? 'EQUAL' : left.value < right.value ? 'LESS' : 'GREATER' };
}

module.exports = { reconcileOrderEvidence, compareQuantities };
