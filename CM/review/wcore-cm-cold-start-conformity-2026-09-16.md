# WCORE/CM — rapport de conformité cold-start (2026-09-16)

`owner=WCORE_CM_CONFORMITY_AGENT` · `project root=K:\ProjetIA\WCORE\CM` · aucun effet de bord :
aucune conversation créée, aucune action X, aucune publication, aucun travail produit.

## Verdict

```
WCORE_CM_FOLDER_CONFORMITY=PASS
WCORE_CM_READY_FOR_COLD_START=TRUE
CM_CANONICAL_FILES_COMPLETE=PASS
CM_COLD_START_PATHS_RESOLVE=PASS
CM_COLD_START_TOOLING=PASS
CM_ROOT_DEPENDENCY_BOUNDARY=PASS
CM_DUPLICATE_STATE_COUNT=0
CM_ROOT_PRODUCT_QUEUE_LEAK_COUNT=0
P1_GOV_CM_SHELL_HARMONIZATION_STATUS=DONE
P1_ARCH_HANDOFF_PREREQUISITES=PASS
NEW_WCORE_CM_CONVERSATION_EXISTS=FALSE
HANDOFF_ACCEPTED=FALSE
HANDOFF_DOCUMENT_CURRENT_STATE_UNAMBIGUOUS=TRUE
HANDOFF_PREPARED_MEANS_FOLDER_READY_ONLY=TRUE
NEXT_EXTERNAL_ACTION=OPERATOR_CREATE_WCORE_CM_CONVERSATION
```

## A. P1-GOV-CM-SHELL-HARMONIZATION — acceptance criteria (DONE)

| AC | Critère | Preuve |
|---|---|---|
| AC1 | Entrée dashboard `WCORE-CM` visible | `K:\ProjetIA\status.md` → `| **WCORE-CM** | OK |` |
| AC2 | Champ `Vault` supporté + exécuté | `monthly-audit.ps1` → `WCORE-CM OK - vault: yes, raw notes: 1, tickets: 1, mem0: 5` |
| AC3 | Aucune tâche planifiée CM | `Get-ScheduledTask` : aucune (seuls WCORE Graphify/DB Backup, hors CM) |
| AC4 | Namespaces CM | `CM/tickets/` (`type: ticket`, `project: WCORE-CM`), `CM/RAW/` (RAW avant Wiki) |
| AC5 | Mem0 dédié | `user_id=projet:WCORE-CM` → 5 mémoires sourcées `Wiki/CM/2026-09-16-cm-shell-harmonization.md` |
| AC6 | Dérive corrigée | `CM/OWNERSHIP-MANIFEST.md` : `DUPLICATE_ROADMAP_STATE_COUNT=0`, `RECONCILIATION_DONE=TRUE` |

Scripts : `K:\ProjetIA\scripts\{dashboard.config.psd1, mem0-usage.ps1, scan-tickets.ps1, monthly-audit.ps1}`.

## B. HANDOFF — état non ambigu

`CM/HANDOFF.md` : `HANDOFF_PREPARED=TRUE_FOR_OPERATOR_COLD_START` (= dossier prêt, handoff NON commencé),
`HANDOFF_ACCEPTED=FALSE`, `NEW_WCORE_CM_CONVERSATION_EXISTS=FALSE`, `LEGACY_CM_EXECUTION_RETIRED=FALSE`.
Toute revendication `HANDOFF_PREPARED=TRUE` antérieure est remplacée ; plus aucune formulation ne
laisse croire qu'une conversation existe. Contradiction `WITHDRAWN_PENDING_CONFORMITY` ↔ `TRUE` résolue.

## C/D. Sources canoniques & ownership

7 fichiers canoniques présents : `README.md`, `AGENTS.md`, `ROADMAP.md`, `review-context.md`,
`OWNERSHIP-MANIFEST.md`, `INTERFACE.md`, `HANDOFF.md`. Aucune source CURRENT CM ne requiert
`ROOT/ROADMAP.md` pour déterminer le travail CM.

ROOT `ROADMAP.md` : `WC-01`, `P1-GOV-CM-PERSISTENT-OWNER`, `P2-CM-DISCOVERY-RESULT-VALIDATION` sont des
`POINTER_TO_CM` ; `P1-CM-TURNEND-CHECKPOINT-SEMANTICS` n'a pas de ligne ROOT. ⇒ `CM_DUPLICATE_STATE_COUNT=0`.
Une note de pointeur (ASCII) a été ajoutée en fin de `ROOT/review-context.md` ; aucune réécriture massive
(changements concurrents préservés).

## E. Frontière produit (cwd `CM\`)

`ROOT_ROADMAP_IS_WORK_QUEUE=FALSE`, `ROOT_PRODUCT_TASK_SELECTION_ALLOWED=FALSE`,
`CM_ROOT_PRODUCT_QUEUE_LEAK_COUNT=0`. Rejets prouvés : `WC-11`, `WC-12`, `P1-OBS-GSHEET-HTTP-ATTRIBUTION`,
`P1-REL-KRAKEN-NONCE-LOCKOUT`, `P2-OBS-FX-PARITY-WEB-SIDE`, `P2-CHAIN-ARC-NATIVE-USDC` ;
`UNKNOWN_IS_FAIL_CLOSED=PASS`.

## F. Tooling depuis `CM\` (launcher cwd-indépendant)

`node scripts/cm-run.cjs --self-check` → `CM_COLD_START_PATHS_RESOLVE=PASS` (28 outils, 0 manquant).
Gardes : boundary 11/11, turn-end 21/21, discovery-validate 8/8, discovery-qualify 8/8,
child-guard 21/21, window 13/13 ; freshness/admission/gate/session/owner/checkpoint exit=0.
`cm-continuity-runner.cjs --admit-status` → `held=false, publication=NONE`.
`cm-x-read.cjs` : `read_only: true`, `publication: 'NONE'`, aucun marqueur d'écriture — **aucune lecture X
live effectuée** (hors périmètre conformité).

## G. Gouvernance (CM/AGENTS.md)

`DUAL_LANE_MONO_AGENT_POLICY=HISTORICAL_SUPERSEDED_FOR_CM`, `CM_NON_CM_PRODUCT_EXECUTION_ALLOWED=FALSE`,
`NO_ROOT_PRODUCT_WORK_FROM_CM=TRUE`, `NO_CROSS_AGENT_IMPERSONATION=TRUE`, `NO_AUTOCREATED_CONVERSATION=TRUE`,
`NO_SCHEDULED_TASK_WAKE=TRUE`, `SENSOR_ONLY_DOES_NOT_PROVE_POST_TURN_CONTINUITY=TRUE`.

## H. Canari cold-start (reproductible)

`node scripts/cold-start-canary.cjs` → `CM_COLD_START_CANARY=PASS` (`sources OK`, `paths PASS`,
`boundary PASS`, `tooling PASS`, `blocking=[]`, `session créée=false`). Reproductible sur relance.

## Résidus non bloquants (honnêtes)

1. `ROOT/review-context.md` (ROOT-owned, ~415 KB, cp1252, édité en concurrence) conserve un récit de
   coordination CM — annoté par une note de pointeur ; non réécrit pour préserver les changements concurrents.
   Action ROOT-owner : convertir sa section CM en pointeur unique.
2. Garde partagée `scripts/gov-interagent-routing.test.cjs` ROUGE pour une cause de CONTENU ROOT
   (`ROOT ROADMAP.md` : littéral `superseded_by` absent) — documentée `CM/HANDOFF.md` §12 ; hors périmètre CM,
   non utilisée par le canari.
3. `LEGACY_CM_EXECUTION_RETIRED=FALSE` volontaire jusqu'à `HANDOFF_ACCEPTED=TRUE` du nouvel agent.

`PUBLICATION=NONE` · `NEW_WCORE_CM_CONVERSATION_EXISTS=FALSE` · `HANDOFF_ACCEPTED=FALSE`.
