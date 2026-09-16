# P2-CM-DISCOVERY-RESULT-VALIDATION — réconciliation d'acceptance (2026-09-16)

Source canonique : `CM/ROADMAP.md` (frontière CM). Aucune lecture du snapshot ROOT comme autorité.

| Critère | Statut | Preuve |
|---|---|---|
| `count > 0` seul ne vaut pas un succès | PASS | run réel `"a b c"` → `count=5`, `verdict=NON_CONCLUANT` (requête sans ancre) |
| Incohérent ⇒ `NON_CONCLUANT` fail-closed | PASS | gardes V2/V3 + `INCOHERENT_WITH_QUERY_ANCHORS` |
| Fraîcheur évaluée indépendamment | PASS | `freshnessOf` + garde `STALE_RUN_IS_FLAGGED` (`reasons=['STALE']`) |
| Run invalide ⇒ **jamais** family exhausted | PASS | `INVALID_DISCOVERY_CANNOT_MARK_FAMILY_EXHAUSTED` (erreur runtime) |
| Contraste INC5 reproductible | PASS | `cm-discovery-validate.test.cjs` 8/8 (V1..V8) |
| Aucun faux public gate | PASS | `INVALID_DISCOVERY_CANNOT_REACH_PUBLIC_GATE` + run réel sans ancre ⇒ `public_gate_allowed=false` |
| Consommateur réel du verdict présent | PASS | `cm-discovery-qualify.cjs` câblé dans `cm-x-search.cjs` (`out.decision`), vérifié end-to-end |

## Preuves d'intégration RÉELLES (CDP 9222, read-only)

**Cas VALID** — `node scripts/cm-x-search.cjs "delegated execution session keys" top 6` :

- `count=6`, `verdict=VALID`, `run_valid=true`, `coherence.ok=true` (4/4 ancres)
- `decision=QUALIFY_RESULTS`, `family_exhausted_allowed=false`, `public_gate_allowed=true`, `retryable=false`

**Cas INVALIDE / sans ancre** — `node scripts/cm-x-search.cjs "a b c" top 5` :

- `count=5` (donc `count>0`), `verdict=NON_CONCLUANT`, `unanchored_query=true`
- `decision=NON_CONCLUANT`, `family_exhausted_allowed=false`, `public_gate_allowed=false`
- `reasons=[NON_CONCLUANT_RUN_CANNOT_REACH_PUBLIC_GATE]`

## Suites

`cm-discovery-validate.test.cjs` ALL PASS (V1..V8) · `cm-discovery-qualify.test.cjs` ALL PASS (8 gardes).

`PUBLICATION=NONE` · aucune écriture produit · frontière `cm-boundary.cjs` inchangée.
