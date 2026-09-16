# CM — inventaire & classification (audit 2026-09-16)

`CM_BOUNDARY_AUDIT=AUDIT_2026-09-16` · `ONE_WORK_ITEM_ONE_OWNER=TRUE`
Regle de decision : un artefact est **CM_EXCLUSIVE** s'il ne sert QUE le Community Management
(lecture/qualification/editorial/publication/couverture X). Il est **ROOT_EXCLUSIVE** s'il sert le
produit/runtime. **SHARED** s'il est lu par les deux. **AMBIGUOUS** si la preuve ne tranche pas.

## 1. CM_EXCLUSIVE (runtime + continuite CM)

| Artefact | Role | Note |
|---|---|---|
| `scripts/cm-continuity-runner.cjs` | CLI d'etat : admission, `--x-observed`, `--patrol-complete`, `--guard-check`, `--coverage-ledger` | seul writer de `last_x_observation_at` |
| `scripts/cm-resident-supervisor.cjs` | capteur resident `WAKE_MODE=SENSOR_ONLY` (aucun spawn, aucun message) | + `cm-resident-start.vbs`, `cm-resident.test.cjs` |
| `scripts/cm-x-read.cjs`, `cm-x-open.cjs`, `cm-x-search.cjs`, `cm-verify-by-phrase.cjs` | lecture X read-only via CDP 9222 | aucune publication |
| `scripts/cm-discovery-validate.cjs` (+ `.test.cjs`) | validation INC5 des resultats de discovery | P2-CM-DISCOVERY-RESULT-VALIDATION |
| `scripts/cm-signals.cjs`, `cm-probe.cjs` | capteurs/probes CM | |
| `scripts/cm-turn-end-check.cjs` (+ `cm-turn-end-guard.test.cjs`) | gate de fin de tour | anti-faux `NEXT_STARTED` |
| `scripts/cm-checkpoint-c2.cjs` (+ `.test.cjs`) | checkpoint CM C2 | |
| `scripts/cm-continuity-*.test.cjs` (admission/freshness/gate/owner/session/window/child-guard) | gardes CM | 9 fichiers |
| `.generated/cm-continuity/**` | etat runtime CM (heartbeat, admission, ledger X, wake-request) | gitignored, chemin stable |
| `Wiki/CM/*` (backlog editorial, decisions CM) | contenu editorial | vault Obsidian |

## 2. ROOT_EXCLUSIVE

`wcore-web/**`, `wcore-gsheet/**`, `src/**`, `ROADMAP.md` (fichier ROOT ; la ligne `WC-01` y est un
**pointeur**, l'etat canonique CM vit dans `CM/ROADMAP.md`),
`AGENTS.md` (racine), `review-context.md` (CURRENT global), `graphify-out/**`, registre de chaines,
docs produit, tests produit.

## 3. SHARED (interface explicite)

| Artefact | Lecteur ROOT | Lecteur CM | Regle |
|---|---|---|---|
| `ROADMAP.md` | oui (fichier canonique ROOT) | oui (lecture seule ; `WC-01` = **pointeur** vers `CM/ROADMAP.md`) | ROOT ecrit le fichier, CM **lit** ; un pointeur n'est pas une tache CM |
| `AGENTS.md` | oui | oui (regles + marqueurs durables) | ROOT ecrit, CM lit |
| `docs/prompts/supervisor-wcore-cm.md` | oui | oui | **miroir** regenerable ; marqueurs durables dans `AGENTS.md` |
| `scripts/gov-interagent-routing.test.cjs` | oui | oui | SHARED governance |
| `.generated/cm-continuity/heartbeat.json` | lecture (etat) | ecriture | interface d'etat |

## 4. AMBIGUOUS (a trancher plus tard, aucune migration en masse)

| Artefact | Ambiguite | Recommandation |
|---|---|---|
| `scripts/cm-continuity-owner.cjs`, `cm-continuity-owner-task.cmd`, `cm-continuity-owner-invisible.vbs`, `install-cm-continuity-owner.ps1`, `uninstall-cm-continuity-owner.ps1` | vestiges de l'architecture **Scheduled Task**, remplacee par le resident | conserver a la racine, marques `LEGACY_SCHEDULER_SUPERSEDED` ; ne PAS regenerer de tache |
| `review-context.md` | contient du CURRENT ROOT **et** des sections CM | ROOT garde le CURRENT global ; le CM publie dans `CM/review-context.md` (additif) |

## 5. Contraintes verifiees

`CM/ROADMAP.md` est canonique pour le domaine CM ; la ligne `WC-01` de `ROADMAP.md` (ROOT) a ete convertie en pointeur `POINTER_TO_CM (non canonique ici)` (reconciliation 2026-09-16) => `DUPLICATE_ROADMAP_STATE_COUNT=0` ; `RECONCILIATION_REQUIRED=FALSE` ; `RECONCILIATION_DONE=TRUE`. Historique : la note d'audit initiale (2026-09-16 10:48) constatait un double etat (`DUPLICATE_ROADMAP_STATE_COUNT=1`) ; elle est **close** par la conversion ROOT en pointeur.
`CM_SYNTHETIC_WAKE_COUNT=0` — aucun script CM ne construit de message injecte (`injected_message:false`).
`CM_SCHEDULED_WAKE_COUNT=0` — aucune tache planifiee de reveil d'agent CM.

## 6. Harmonisation cross-projet (2026-09-16)

`WCORE_CM_IS_HARMONIZED_SUBPROJECT=TRUE` — CM respecte le contrat filesystem des projets
(`K:\ProjetIA\docs\PROJECT-FILESYSTEM-CONTRACT.md`) et est enregistre dans l'outillage transverse :

| Mecanisme | Etat CM |
|---|---|
| Dashboard / `status.md` horaire (`scripts/dashboard.config.psd1`, entree `WCORE-CM`) | enregistre (Tickets/Activity/Git/Mem0 Required ; Graphify/Density/Backup/Task Disabled, sans tache planifiee CM) |
| Tickets (`CM/tickets/`, frontmatter `type: ticket`) | actif |
| RAW→Wiki (`CM/RAW/` -> `Wiki/CM/`) | actif |
| Mem0 (`user_id=projet:WCORE-CM`) | actif (precedent sous-agent : `projet:GoodByeAresia-Chloe`) |
| Journal | interface WCORE (`WCORE/journal` -> `WCORE/_vault/journal`) |

`CM_IS_NOT_ROOT_OPERATIONAL_AGENT=TRUE` : CM = agent Community Manager du projet WCORE ;
WCORE ROOT = agent opérationnel produit. Un seul sous-agent CM, aucun second agent.
