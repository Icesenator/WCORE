// cm-discovery-validate.cjs — Validation PURE des resultats de discovery CM (P2-CM-DISCOVERY-RESULT-VALIDATION).
// REGLES (INC5, incidents n°56/n°57) :
//   - `count > 0` seul NE VAUT JAMAIS un succes ;
//   - une sortie manifestement incoherente avec les ancres de la requete => NON_CONCLUANT (fail-closed) ;
//   - la FRAICHEUR est evaluee INDEPENDAMMENT de la coherence semantique ;
//   - un run INVALIDE ne marque JAMAIS une famille comme epuisee ;
//   - ce module ne cree JAMAIS d'action publique (gate R-024 reste ailleurs).
// Aucune dependance reseau. Aucun effet de bord.
'use strict';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'were', 'you', 'your',
  'les', 'des', 'une', 'und', 'der', 'die', 'das', 'pour', 'avec', 'dans', 'sur', 'par', 'est',
  'que', 'qui', 'pas', 'plus', 'sont', 'from:', 'filter:', 'since:', 'until:', 'min_faves:',
]);

function normalize(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/https?:\/\/\S+/g, ' ');
}

// Ancres = tokens significatifs de la requete (les operateurs X sont retires).
function anchorsFromQuery(query) {
  const toks = normalize(query)
    .replace(/[^a-z0-9_:\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t) && !t.startsWith('filter') && !t.includes('://'));
  return Array.from(new Set(toks));
}

// Coherence : au moins `minAnchorHits` ancres doivent apparaitre dans le corpus des items.
function coherenceOf(run, minAnchorHits) {
  const anchors = anchorsFromQuery(run && run.query);
  const items = (run && Array.isArray(run.items)) ? run.items : [];
  const corpus = normalize(items.map((it) => (it && (it.text || it.link)) || '').join(' \n '));
  const matched = anchors.filter((a) => corpus.includes(a));
  const need = Math.max(1, minAnchorHits || 1);
  return {
    anchors,
    matched,
    hits: matched.length,
    need,
    // Aucune ancre identifiable => on ne peut PAS conclure (fail-closed).
    ok: anchors.length > 0 && matched.length >= need,
    unanchored_query: anchors.length === 0,
  };
}

function freshnessOf(tsIso, nowMs, maxAgeMs) {
  const t = Date.parse(tsIso);
  const maxAge = maxAgeMs || (24 * 60 * 60 * 1000);
  if (!Number.isFinite(t)) return { ok: false, age_ms: null, age_h: null, max_age_ms: maxAge, unknown: true };
  const age = nowMs - t;
  return { ok: age <= maxAge, age_ms: age, age_h: Number((age / 3600000).toFixed(2)), max_age_ms: maxAge, unknown: false };
}

/**
 * @param {{query?:string, ts?:string, count?:number, items?:Array, error?:string}} run
 * @param {{now?:number, maxAgeMs?:number, minAnchorHits?:number}} [opts]
 */
function classifyDiscoveryRun(run, opts) {
  const o = opts || {};
  const now = o.now || Date.now();
  const reasons = [];

  // 1) run INVALIDE (erreur runtime, sortie absente/malformee) => NON_CONCLUANT, jamais "famille epuisee".
  const invalid = !run || !!run.error || typeof run.count !== 'number' || !Array.isArray(run.items);
  if (invalid) {
    if (run && run.error) reasons.push('RUN_ERROR:' + String(run.error).slice(0, 80));
    if (!run || typeof run.count !== 'number') reasons.push('MISSING_COUNT');
    if (run && !Array.isArray(run.items)) reasons.push('MISSING_ITEMS');
    return {
      verdict: 'NON_CONCLUANT',
      conclusive: false,
      run_valid: false,
      retryable: true,
      count: run && typeof run.count === 'number' ? run.count : null,
      coherence: { ok: false, anchors: [], matched: [], hits: 0, need: 1, unanchored_query: null },
      freshness: freshnessOf(run && run.ts, now, o.maxAgeMs),
      family_exhausted: false,      // REGLE : un run invalide NE marque JAMAIS une famille epuisee
      public_action_allowed: false, // REGLE : aucune action publique creee ici
      reasons,
    };
  }

  // 2) count > 0 seul != succes : la coherence est exigee independamment.
  const coh = coherenceOf(run, o.minAnchorHits);
  const fresh = freshnessOf(run.ts, now, o.maxAgeMs);

  if (coh.unanchored_query) reasons.push('UNANCHORED_QUERY_FAIL_CLOSED');
  if (!coh.ok && !coh.unanchored_query) reasons.push('INCOHERENT_WITH_QUERY_ANCHORS');
  if (!fresh.ok) reasons.push(fresh.unknown ? 'FRESHNESS_UNKNOWN' : 'STALE');

  const conclusive = coh.ok;
  return {
    verdict: conclusive ? 'VALID' : 'NON_CONCLUANT',
    conclusive,
    run_valid: true,
    retryable: !conclusive,
    count: run.count,
    // count = 0 seule ne suffit pas non plus : la conclusion n'est tiree que si la coherence est etablie.
    coherence: coh,
    freshness: fresh,
    // Famille epuisee : uniquement un run VALIDE (aucune erreur runtime) ET reellement vide.
    // Un run invalide ne peut jamais epuiser une famille (cf. branche `invalid` ci-dessus).
    family_exhausted: run.count === 0,
    public_action_allowed: false,
    reasons,
  };
}

module.exports = { classifyDiscoveryRun, anchorsFromQuery, coherenceOf, freshnessOf };
