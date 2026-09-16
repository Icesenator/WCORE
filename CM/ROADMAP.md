---
date: 2026-09-16
tags: [moc, roadmap, wcore, cm]
---

# WCORE CM — Roadmap canonique (domaine Community Management)

> File de travail **CM uniquement**. `ROADMAP.md` (ROOT) n'est **jamais** une file de travail CM
> (`ROOT_ROADMAP_IS_WORK_QUEUE=FALSE`), seulement une interface/pointeur. Frontiere executable :
> `scripts/cm-boundary.cjs` (+ `cm-boundary.test.cjs`, 11/11 ALL PASS).

| ID | Tâche (objectif) | P | Statut | Preuve / note |
|---|---|---|---|---|
| WC-01 | Boucle CM autonome X @WCORExyz (workstream principal permanent) | P2 | IN_PROGRESS | D publiée https://x.com/WCORExyz/status/2099423096474071386 ; 5 replies vérifiées ; posts=351 ; `D_REPUBLISH=FORBIDDEN` ; `WAKE_MODE=SENSOR_ONLY`. Patrols réels tracés dans `.generated/cm-continuity/x-observation-ledger.jsonl`. |
| P1-GOV-CM-PERSISTENT-OWNER | Owner CM persistant (santé technique, sans message agent) | P1 | IN_PROGRESS | 3 causes racines corrigées (dedup borné 90 s, invocation sans shell, admission `--token=`/`--pid=`) ; garde child-side `--guard-check` (soft 12 / hard 15 min) ; ledger `--coverage-ledger` ; `SPAWNSYNC_OWNER_BLOCKING_FIXED=TRUE` ; streak recalculé depuis `FRESHNESS_PROOF_EPOCH=POST_CM_BOUNDARY_STABILIZATION`. |
| P2-CM-DISCOVERY-RESULT-VALIDATION | Validation fail-closed des resultats de discovery (INC5) | P2 | DONE | **DONE 2026-09-16** - `CM/review/p2-cm-acceptance-2026-09-16.md` : 7/7 criteres PASS. Validateur pur (`cm-discovery-validate.cjs`, 8/8) + **consommateur reel** `cm-discovery-qualify.cjs` (`qualifyDiscovery`, 8/8) cable dans `cm-x-search.cjs` (`out.decision`). Preuves d integration REELLES : VALID (`count=6` -> `QUALIFY_RESULTS`, `public_gate_allowed=true`) ; INVALIDE sans ancre (`count=5` -> `NON_CONCLUANT`, `family_exhausted_allowed=false`, `public_gate_allowed=false`). |
| P1-CM-TURNEND-CHECKPOINT-SEMANTICS | Semantique de fin de tour CM (checkpoint exige, pas seulement STARTED) | P1 | DONE | **DONE 2026-09-16 (V2)** - `NEXT_ACTION_START_IS_NOT_TURN_CONTINUITY=TRUE` ; `START_THEN_FINAL_IS_FORBIDDEN=TRUE` ; `COMPLETED_NEXT_ACTION_BECOMES_PREVIOUS_ACTION=TRUE` ; `QUEUE_MUST_BE_RECOMPUTED_AFTER_EACH_CHECKPOINT=TRUE`. Demarrer la NEXT la promeut en CURRENT avec `checkpoint=false` et interdit la fin de tour. Regle : `IMMEDIATELY_EXECUTABLE_CM_WORK_EXISTS && CURRENT_TURN_CAN_EXECUTE` => `FINAL_RESPONSE_ALLOWED=false`. Gardes `cm-turn-end-guard.test.cjs` 21/21 ALL PASS (`START_NEXT_THEN_FINAL_FORBIDDEN`, `STARTED_NEXT_BECOMES_CURRENT`, `CURRENT_WITHOUT_CHECKPOINT_FORBIDS_FINAL`, `CHECKPOINT_WITH_EXECUTABLE_CM_WORK_FORBIDS_FINAL`, `COMPLETED_PATROL_CANNOT_BE_REUSED_AS_NEXT_STARTED`, `SENSOR_ONLY_DOES_NOT_PROVE_POST_TURN_CONTINUITY`, `TURN_END_RECOMPUTE_AFTER_CHECKPOINT`). |
| P1-GOV-CM-SHELL-HARMONIZATION | Harmoniser le shell CM avec les autres projets (dashboard/status, tickets, RAW→Wiki, Mem0) | P1 | IN_PROGRESS | Entrée dashboard `WCORE-CM` (`K:\ProjetIA\scripts\dashboard.config.psd1`) + support `Vault` dans `scan-tickets.ps1`/`monthly-audit.ps1`, sans tâche planifiée CM ; `CM/tickets/` + `CM/RAW/` ; `user_id=projet:WCORE-CM` (`mem0-usage.ps1`) ; dérive `OWNERSHIP-MANIFEST` corrigée (`DUPLICATE_ROADMAP_STATE_COUNT=0`, `RECONCILIATION_DONE=TRUE`) ; ticket `CM/tickets/cm-shell-harmonization-2026-09-16.md`. |

## Frontières

- **CM-owned** : `WC-01`, monitoring communauté, editorial/research/publication X, tooling `cm-*`, discovery.
- **Root-owned (interdit au CM)** : `WC-11`, `WC-12`, `P2-OBS-*`, `P1-OBS-*`, `P1-REL-*`, `P2-CHAIN-*`, `P1-ARCH-WCORE-CM-DEDICATED-AGENT` (workstream concurrent).
- `SHARED_INTERFACE` : `CM/INTERFACE.md`.
