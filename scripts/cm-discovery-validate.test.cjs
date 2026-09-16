// Tests reproductibles — P2-CM-DISCOVERY-RESULT-VALIDATION (INC5).
// Aucun acces reseau, aucune dependance au live X : fixtures minimales.
'use strict';
const path = require('path');
const V = require(path.join(__dirname, 'cm-discovery-validate.cjs'));
let failed = 0;
function check(id, desc, ok, detail) {
  if (!ok) failed++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + id + '  ' + desc + (ok ? '' : '  -> ' + detail));
}
const NOW = Date.parse('2026-09-16T08:00:00.000Z');
const recent = '2026-09-16T07:30:00.000Z';   // 30 min
const old = '2026-09-10T07:30:00.000Z';      // 6 j

// INC5 n°56 : la requete etait ancree mais la sortie ne portait AUCUN terme de la requete.
const Q = 'delegated execution session keys read-only verification';
const COHERENT = { text: 'On delegated execution, session keys must stay read-only for verification purposes. #wallet' };
const OFF_TOPIC = { text: 'Big win tonight ! score final 3-1, allez les bleus' };

// 1) requete ancree + resultats coherents => VALIDE
{
  const r = V.classifyDiscoveryRun({ query: Q, ts: recent, count: 3, items: [COHERENT, COHERENT] }, { now: NOW });
  check('V1_ANCHORED_COHERENT_VALID', 'ancre + coherent => VALID + conclusif',
    r.verdict === 'VALID' && r.conclusive === true && r.coherence.ok === true, JSON.stringify({ v: r.verdict, coh: r.coherence.hits }));
}
// 2) requete non ancree / resultats manifestement hors sujet => NON_CONCLUANT
{
  const r = V.classifyDiscoveryRun({ query: Q, ts: recent, count: 2, items: [OFF_TOPIC, OFF_TOPIC] }, { now: NOW });
  check('V2_OFF_TOPIC_NON_CONCLUANT', 'hors sujet => NON_CONCLUANT (fail-closed)',
    r.verdict === 'NON_CONCLUANT' && r.conclusive === false && r.reasons.includes('INCOHERENT_WITH_QUERY_ANCHORS'),
    JSON.stringify(r.reasons));
}
// 3) count>0 mais incoherent => NON_CONCLUANT (count seul ne vaut pas succes)
{
  const r = V.classifyDiscoveryRun({ query: Q, ts: recent, count: 7, items: [OFF_TOPIC] }, { now: NOW });
  check('V3_COUNT_POSITIVE_BUT_INCOHERENT', 'count=7 incoherent => NON_CONCLUANT',
    r.count === 7 && r.verdict === 'NON_CONCLUANT' && r.conclusive === false, JSON.stringify({ c: r.count, v: r.verdict }));
}
// 4) resultat coherent mais trop ancien => coherence OK, fraicheur ECHOUEE SEPAREMENT
{
  const r = V.classifyDiscoveryRun({ query: Q, ts: old, count: 3, items: [COHERENT] }, { now: NOW });
  check('V4_COHERENT_BUT_STALE_SEPARATE', 'coherence ok MAIS freshness.ok=false (deux axes independants)',
    r.coherence.ok === true && r.freshness.ok === false && r.reasons.includes('STALE'),
    JSON.stringify({ coh: r.coherence.ok, fresh: r.freshness.ok, h: r.freshness.age_h }));
}
// 5) run invalide => famille NON marquee epuisee
{
  const a = V.classifyDiscoveryRun({ query: Q, ts: recent, error: 'TIMEOUT:Runtime.evaluate' }, { now: NOW });
  const b = V.classifyDiscoveryRun({ query: Q, ts: recent, count: 0, items: [] }, { now: NOW });
  check('V5_INVALID_RUN_NEVER_EXHAUSTS_FAMILY', 'erreur runtime => NON_CONCLUANT + family_exhausted=false ; vide+coherent => epuisee',
    a.family_exhausted === false && a.run_valid === false && a.retryable === true && b.family_exhausted === true,
    JSON.stringify({ a_fx: a.family_exhausted, a_valid: a.run_valid, b_fx: b.family_exhausted }));
}
// 6) la validation ne cree AUCUNE action publique
{
  const r = V.classifyDiscoveryRun({ query: Q, ts: recent, count: 3, items: [COHERENT] }, { now: NOW });
  check('V6_NO_PUBLIC_ACTION_CREATED', 'public_action_allowed=false quel que soit le verdict',
    r.public_action_allowed === false && V.classifyDiscoveryRun(null, { now: NOW }).public_action_allowed === false,
    JSON.stringify({ r: r.public_action_allowed }));
}
// 7) requete non ancrable => fail-closed (NON_CONCLUANT), jamais VALID
{
  const r = V.classifyDiscoveryRun({ query: 'a b c', ts: recent, count: 5, items: [COHERENT] }, { now: NOW });
  check('V7_UNANCHORED_QUERY_FAIL_CLOSED', 'aucune ancre => NON_CONCLUANT + UNANCHORED_QUERY_FAIL_CLOSED',
    r.verdict === 'NON_CONCLUANT' && r.reasons.includes('UNANCHORED_QUERY_FAIL_CLOSED'), JSON.stringify(r.reasons));
}
// 8) determinisme : meme entree => meme sortie
{
  const mk = () => V.classifyDiscoveryRun({ query: Q, ts: recent, count: 3, items: [COHERENT] }, { now: NOW });
  check('V8_DETERMINISTIC', 'deux appels identiques => resultats identiques',
    JSON.stringify(mk()) === JSON.stringify(mk()), 'non deterministe');
}
console.log('\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAIL'));
process.exit(failed === 0 ? 0 : 1);
