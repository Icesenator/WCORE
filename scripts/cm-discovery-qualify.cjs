// cm-discovery-qualify.cjs — CHEMIN DE DECISION CM d'un resultat de discovery (P2-CM-DISCOVERY-RESULT-VALIDATION).
// Ce module est le CONSOMMATEUR reel de `out.validation` : il transforme une validation en decisions
// envoyables a la qualification, a l'exhaustion de famille et au gate public.
// REGLES FAIL-CLOSED :
//   - un run INVALIDE ne peut JAMAIS marquer une famille epuisee ;
//   - un run INVALIDE ne peut JAMAIS atteindre le gate public ;
//   - une requete SANS ANCRE ne peut pas conclure une exhaustion (on ne saurait pas quoi conclure) ;
//   - `public_gate_allowed` est une condition NECESSAIRE, jamais suffisante : le gate R-024 reste ailleurs.
// Aucun effet de bord, aucun reseau.
'use strict';
const path = require('path');

function validate(run, opts) {
  const V = require(path.join(__dirname, 'cm-discovery-validate.cjs'));
  if (run && run.validation && typeof run.validation.verdict === 'string') return run.validation;
  return V.classifyDiscoveryRun(run || {}, opts);
}

/**
 * @param {object} run resultat brut de cm-x-search (ou objet portant deja `.validation`)
 * @param {{now?:number, maxAgeMs?:number, minAnchorHits?:number}} [opts]
 */
function qualifyDiscovery(run, opts) {
  const v = validate(run, opts);
  const reasons = [];
  const runValid = v.run_valid === true;
  const verdict = v.verdict;
  const count = typeof v.count === 'number' ? v.count : null;
  const anchored = !!(v.coherence && v.coherence.anchors && v.coherence.anchors.length > 0);

  // 1) gate famille epuisee : fail-closed.
  let familyExhaustedAllowed = false;
  if (!runValid) reasons.push('INVALID_RUN_CANNOT_EXHAUST_FAMILY');
  else if (v.family_exhausted === true && !anchored) reasons.push('UNANCHORED_EMPTY_RUN_NOT_EXHAUSTIVE');
  else if (v.family_exhausted === true && anchored) familyExhaustedAllowed = true;

  // 2) gate public : fail-closed (necessaire, pas suffisant).
  let publicGateAllowed = false;
  if (!runValid) reasons.push('INVALID_RUN_CANNOT_REACH_PUBLIC_GATE');
  else if (verdict !== 'VALID') reasons.push('NON_CONCLUANT_RUN_CANNOT_REACH_PUBLIC_GATE');
  else if (!(v.coherence && v.coherence.ok)) reasons.push('INCOHERENT_RUN_CANNOT_REACH_PUBLIC_GATE');
  else publicGateAllowed = true;

  // 3) decision de qualification (ce que le CM peut faire de ce resultat).
  let decision;
  if (!runValid) decision = 'RETRY_DISCOVERY';
  else if (familyExhaustedAllowed) decision = 'FAMILY_EXHAUSTED';
  else if (verdict === 'VALID') decision = 'QUALIFY_RESULTS';
  else decision = 'NON_CONCLUANT';

  return {
    decision,
    run_valid: runValid,
    count,
    verdict,
    anchored,
    family_exhausted_allowed: familyExhaustedAllowed,
    public_gate_allowed: publicGateAllowed,
    retryable: runValid ? verdict !== 'VALID' : true,
    reasons,
    source: 'cm-discovery-qualify.cjs',
    note: 'public_gate_allowed=true reste NECESSAIRE et non suffisant : le gate R-024 (pertinence, utilite, exactitude, non-redondance, non-paraphrase) demeure la decision humaine/CM.',
  };
}

module.exports = { qualifyDiscovery, validate };
