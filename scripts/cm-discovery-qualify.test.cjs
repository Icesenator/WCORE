// Gardes du CHEMIN DE DECISION discovery CM (P2-CM-DISCOVERY-RESULT-VALIDATION).
// Le point : `out.validation` n'est pas un rapport — c'est une entree de decision, fail-closed.
'use strict';
const path = require('path');
const Q = require(path.join(__dirname, 'cm-discovery-qualify.cjs'));
let failed = 0;
function check(id, desc, ok, detail) {
  if (!ok) failed++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + id + '  ' + desc + (ok ? '' : '  -> ' + detail));
}

const NOW = Date.parse('2026-09-16T09:00:00.000Z');
const recent = '2026-09-16T08:59:00.000Z';
const QUERY = 'delegated execution session keys';
const COHERENT = { link: '/x/status/1', text: 'delegated execution with session keys explained' };
const OFF_TOPIC = { link: '/x/status/2', text: 'weather forecast for tomorrow in paris' };

// 1) un run INVALIDE (erreur runtime) ne peut pas marquer une famille epuisee
{
  const bad = { query: QUERY, ts: recent, error: 'TIMEOUT:Runtime.evaluate', count: 0, items: [] };
  const d = Q.qualifyDiscovery(bad, { now: NOW });
  check('INVALID_DISCOVERY_CANNOT_MARK_FAMILY_EXHAUSTED', 'erreur runtime => family_exhausted_allowed=false + retry',
    d.family_exhausted_allowed === false && d.run_valid === false && d.retryable === true
    && d.reasons.includes('INVALID_RUN_CANNOT_EXHAUST_FAMILY'),
    JSON.stringify(d));
}

// 2) un run INVALIDE ne peut pas atteindre le gate public
{
  const bad2 = { query: QUERY, ts: recent, count: 'abc', items: null };
  const d = Q.qualifyDiscovery(bad2, { now: NOW });
  check('INVALID_DISCOVERY_CANNOT_REACH_PUBLIC_GATE', 'sortie malformee => public_gate_allowed=false',
    d.public_gate_allowed === false && d.decision !== 'QUALIFY_RESULTS'
    && d.reasons.includes('INVALID_RUN_CANNOT_REACH_PUBLIC_GATE'),
    JSON.stringify(d));
}

// 3) NON_CONCLUANT (count>0 mais incoherent) => pas de gate public, pas d'exhaustion, retry
{
  const dice = { query: QUERY, ts: recent, count: 5, items: [OFF_TOPIC, OFF_TOPIC] };
  const d = Q.qualifyDiscovery(dice, { now: NOW });
  check('INCOHERENT_RUN_IS_NON_CONCLUANT_AND_RETRYABLE', 'count>0 incoherent => NON_CONCLUANT + retry + pas de gate',
    d.verdict === 'NON_CONCLUANT' && d.decision === 'NON_CONCLUANT'
    && d.public_gate_allowed === false && d.family_exhausted_allowed === false && d.retryable === true,
    JSON.stringify(d));
}

// 4) VIDE + requete ANCRABLE mais coherence impossible (corpus vide) => exhaustion autorisee (comportement historique)
{
  const empty = { query: QUERY, ts: recent, count: 0, items: [] };
  const d = Q.qualifyDiscovery(empty, { now: NOW });
  check('EMPTY_ANCHORED_RUN_MAY_EXHAUST_FAMILY', 'run valide, vide, requete ancree => FAMILY_EXHAUSTED',
    d.family_exhausted_allowed === true && d.decision === 'FAMILY_EXHAUSTED' && d.run_valid === true,
    JSON.stringify(d));
}

// 5) VIDE + requete SANS ANCRE => impossible de conclure l'exhaustion (fail-closed)
{
  const emptyUnanchored = { query: 'a b c', ts: recent, count: 0, items: [] };
  const d = Q.qualifyDiscovery(emptyUnanchored, { now: NOW });
  check('UNANCHORED_EMPTY_RUN_CANNOT_EXHAUST', 'requete sans ancre => exhaustion refusee',
    d.family_exhausted_allowed === false && d.anchored === false
    && d.reasons.includes('UNANCHORED_EMPTY_RUN_NOT_EXHAUSTIVE'),
    JSON.stringify(d));
}

// 6) COMPORTEMENT EXISTANT PRESERVE : run valide + coherent => QUalify + gate necessaire ouvert
{
  const good = { query: QUERY, ts: recent, count: 3, items: [COHERENT, COHERENT] };
  const d = Q.qualifyDiscovery(good, { now: NOW });
  check('VALID_DISCOVERY_EXISTING_BEHAVIOR_PRESERVED', 'run valide coherent => QUALIFY_RESULTS + public_gate_allowed (necessaire)',
    d.decision === 'QUALIFY_RESULTS' && d.run_valid === true && d.verdict === 'VALID'
    && d.public_gate_allowed === true && d.family_exhausted_allowed === false,
    JSON.stringify(d));
}

// 7) la sortie deja validee est acceptee telle quelle (consommateur reel de out.validation)
{
  const wrapped = { query: QUERY, ts: recent, count: 3, items: [COHERENT], validation: { verdict: 'VALID', run_valid: true, coherence: { ok: true, anchors: ['delegated'], matched: ['delegated'], hits: 1, need: 1 } } };
  const d = Q.qualifyDiscovery(wrapped, { now: NOW });
  check('CONSUMES_EXISTING_VALIDATION_OBJECT', 'un `.validation` deja present est consomme, pas recalcule',
    d.verdict === 'VALID' && d.decision === 'QUALIFY_RESULTS', JSON.stringify(d));
}

// 8) stale : la fraicheur degrade le run (NON_CONCLUANT) et ferme le gate public
{
  const old = { query: QUERY, ts: '2026-09-10T00:00:00.000Z', count: 3, items: [COHERENT] };
  const v = Q.validate(old, { now: NOW, maxAgeMs: 24 * 60 * 60 * 1000 });
  check('STALE_RUN_IS_FLAGGED', 'freshness evaluee separement (stale visible)',
    v.freshness.ok === false && v.reasons.includes('STALE'),
    JSON.stringify({ fresh: v.freshness, reasons: v.reasons }));
}

console.log('\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAIL'));
process.exit(failed === 0 ? 0 : 1);
