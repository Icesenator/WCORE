# WCORE / CM — INDEX DE CUTOVER (passation vers l'agent dédié)

```
HANDOFF_DOCUMENT_IS_SOURCE_OF_TRUTH=FALSE
CANONICAL_ROADMAP=ROADMAP.md
CANONICAL_REVIEW_CONTEXT=review-context.md
CANONICAL_AGENT_RULES=AGENTS.md
```

> Ce fichier est un **index de cutover**, pas une source de vérité et **pas une roadmap bis**.
> Pour tout état, lire les sources canoniques ci-dessus (`voir ROADMAP.md <ID>`).
> Chemins relatifs au project root `K:\ProjetIA\WCORE\CM`.

## 1. Mission du nouvel agent

`CM_ROLE=COMMUNITY_MANAGEMENT_X_AT_WCOREXYZ` — Community Manager dédié de la page X `@WCORExyz`.
Domaine : monitoring X, qualification, replies/posts, research, discovery, éditorial, visuels,
feedback produit documenté, tooling/gouvernance CM-owned.

`ROOT_ROLE=PRODUIT_RUNTIME_OPERATIONS` (autre agent). ROOT n'est **jamais** la file de secours du CM :
ROOT transmet des faits via l'interface, il ne pilote pas la queue CM.

## 2. Sources canoniques à lire dans cet ordre

1. `AGENTS.md` — règles de l'agent CM.
2. `ROADMAP.md` — **file de travail CM canonique** (`CM_CANONICAL_ROADMAP`).
3. `review-context.md` — état CURRENT CM (`CM_CANONICAL_REVIEW_CONTEXT`).
4. `HANDOFF.md` — ce fichier (index de cutover).
5. `INTERFACE.md` — contrat de frontière avec ROOT.
6. `OWNERSHIP-MANIFEST.md` — inventaire et classification des artefacts.

## 3. Ownership

- `WC01_CANONICAL_OWNER=WCORE_CM` ; `ONE_ACTIVE_CM_EXECUTION_OWNER=TRUE`.
- `ONE_WORK_ITEM_ONE_CANONICAL_STATE=TRUE` — un item = un seul état canonique.
- `ROOT_ROADMAP_IS_WORK_QUEUE=FALSE` ; `ROOT_PRODUCT_TASK_SELECTION_ALLOWED=FALSE`.
- `NO_CROSS_AGENT_IMPERSONATION=TRUE` — le CM ne modifie aucun artefact produit.

## 4. Chemins tooling

Le tooling CM reste physiquement sous `..\scripts` (aucun déplacement de masse).
Point d'entrée stable, **indépendant du cwd** :

```
node scripts/cm-run.cjs --list          # launcher + liste blanche des outils CM-owned
node scripts/cm-run.cjs --self-check    # verifie que chaque outil se resout
node scripts/cm-run.cjs <outil.cjs> [args...]
```

Outils clés : `cm-boundary.cjs` (frontière/file), `cm-turn-end-check.cjs` (gate de fin de tour),
`cm-discovery-validate.cjs` + `cm-discovery-qualify.cjs` (discovery fail-closed),
`cm-continuity-runner.cjs` (`--guard-check`, `--x-observed`, `--patrol-complete`, `--coverage-ledger`,
`--admit`, `--admit-release`, `--admit-status`), `cm-resident-supervisor.cjs` (capteur `SENSOR_ONLY`),
`cm-x-read.cjs` / `cm-x-open.cjs` / `cm-x-search.cjs` (lecture X read-only via CDP `127.0.0.1:9222`).
Canari : `node scripts/cold-start-canary.cjs`.

## 5. État de cutover

`HANDOFF_PREPARED` signifie **dossier prêt** (prérequis de cold-start satisfaits), **pas** handoff déjà
commencé. Aucune conversation WCORE/CM n'existe à ce stade.

```
HANDOFF_PREPARED=TRUE_FOR_OPERATOR_COLD_START
HANDOFF_ACCEPTED=FALSE
NEW_WCORE_CM_CONVERSATION_EXISTS=FALSE
LEGACY_CM_EXECUTION_RETIRED=FALSE
```

## 6. Inventaire

### OPEN
- `WC-01` — voir `ROADMAP.md WC-01` (workstream principal permanent).
- `P1-GOV-CM-PERSISTENT-OWNER` — voir `ROADMAP.md P1-GOV-CM-PERSISTENT-OWNER` (time-gated).

### DONE
- `P2-CM-DISCOVERY-RESULT-VALIDATION` — voir `ROADMAP.md` + `review/p2-cm-acceptance-2026-09-16.md`.
- `P1-CM-TURNEND-CHECKPOINT-SEMANTICS` — voir `ROADMAP.md`.

### LOCAL_BLOCKED
- Arc asset tooling — voir `editorial/arc-candidate-2026-09-16.md` §3 (`BLOCKED_BY_ASSET_TOOLING`).
  Blocage **local à l'éditorial**, sans impact sur la reprise de responsabilité.

### CURRENT_PROOF_TO_RESTART
- Fraîcheur X : `CM freshness 0/3` — l'ancien contexte transmet `0/3` **tel quel** (aucun gap fabriqué).

### EXTERNAL_ROOT_OWNED (hors queue CM, ne pas importer)
- `P1-ARCH-WCORE-CM-DEDICATED-AGENT` (workstream d'architecture ROOT — texte ROOT encore en cours de
  traitement par son propriétaire ; **ne pas modifier**).
- Toutes les priorités produit ROOT (`WC-11`, `WC-12`, `P2-OBS-*`, `P1-OBS-*`, `P1-REL-KRAKEN-*`,
  `P2-CHAIN-*`, deploy produit, etc.).

## 7. Blockers locaux connus

- `SENSOR_ONLY` ne réveille pas le modèle : `SENSOR_CAN_WAKE_MODEL=FALSE`,
  `POST_TURN_AUTO_REINVOKE_PROVEN=FALSE`. Une **nouvelle invocation humaine** est requise pour reprendre.
- Aucun pipeline graphique CM-owned ⇒ asset Arc bloqué (voir §6 LOCAL_BLOCKED).

## 8. Séquence exacte de première invocation

1. Ouvrir l'agent OpenCode avec project root `K:\ProjetIA\WCORE\CM`.
2. Lire `AGENTS.md`, `ROADMAP.md`, `review-context.md`, `HANDOFF.md` (dans cet ordre).
3. `node scripts/cm-run.cjs --self-check` → attendu `CM_COLD_START_PATHS_RESOLVE=PASS`.
4. `node scripts/cold-start-canary.cjs` → attendu `CM_COLD_START_CANARY=PASS`.
5. `node scripts/cm-run.cjs cm-boundary.cjs` (inspection queue) → confirmer `WC-01` et
   `P1-GOV-CM-PERSISTENT-OWNER` visibles, aucune tâche produit ROOT.
6. `node scripts/cm-run.cjs cm-continuity-runner.cjs --guard-check --budget-ms=<ms>` → si
   `REFRESH_X_NOW` : **vraie** lecture X (CDP `127.0.0.1:9222`), qualifier, puis `--x-observed`
   (jamais sans lecture réelle), puis `--patrol-complete` et `--coverage-ledger`.
7. Sélectionner **UNE** action CM (voir §9) et l'exécuter jusqu'à son checkpoint.
8. `node scripts/cm-run.cjs cm-turn-end-check.cjs` avant toute réponse finale.

## 9. Procédure d'acceptation

L'agent accepte la passation quand, **et seulement quand**, il a réalisé :

1. le cold-start canari (`CM_COLD_START_CANARY=PASS`) ;
2. un **patrol X read-only réel** avec `--x-observed` **après** lecture authentifiée ;
3. écrit `HANDOFF_ACCEPTED=TRUE` dans son rapport **et** dans `review-context.md`.

Tant que 1–3 ne sont pas faits : `HANDOFF_ACCEPTED=FALSE` et `LEGACY_CM_EXECUTION_RETIRED=FALSE`.

`NO_DOUBLE_OWNER` : ne pas avoir deux agents effectuant simultanément des actions X. L'ancien contexte
**cesse toute mutation métier CM** dès `HANDOFF_PREPARED=TRUE` ; il ne reprend que sur ordre explicite.

## 10. Procédure de rollback

1. `HANDOFF_ACCEPTED` reste `FALSE` ⇒ l'ancien contexte reste propriétaire de fait (`WC-01` non cédé).
2. `LEGACY_CM_EXECUTION_RETIRED` reste `FALSE` jusqu'à la preuve d'acceptation ; les capteurs et
   protections existants ne sont **pas** désactivés pendant la préparation.
3. Rollback = arrêter le nouvel agent, remettre `HANDOFF_PREPARED=FALSE`, et poursuivre dans l'ancien
   contexte. Aucun fichier canonique CM n'a été dupliqué ⇒ rollback sans perte d'état.
4. La queue CM (`ROADMAP.md`) n'a **qu'un seul état canonique** : aucun risque de divergence par
   duplication.

## 11. Interdits (rappel de cutover)

Aucun secret, aucune donnée wallet privée, aucun montant/adresse, aucun faux partenariat, aucune
publication sans gate réel, aucun travail produit ROOT, aucune session OpenCode créée automatiquement,
aucune Scheduled Task de réveil, aucun faux `UserMessage`, aucune roadmap bis.

## 12. Observation ROOT-side (hors perimetre CM - NE PAS MODIFIER)

`..\scripts\gov-interagent-routing.test.cjs` (garde PARTAGEE) est actuellement ROUGE pour une raison de
CONTENU ROOT : `..\ROADMAP.md` (ROOT) ne contient plus le litteral `superseded_by` attendu par la garde
(0 occurrence, recherche case-sensitive), alors qu'il contient encore `SUPERSEDED` en majuscules.

Preuves :
- ce n'est PAS une dependance au cwd : le test echoue a l'identique depuis `K:\ProjetIA\WCORE` ET depuis `K:\ProjetIA\WCORE\CM` ;
- concurrence : `mtime` de `..\ROADMAP.md` = 2026-09-16 11:57:54 (Paris), posterieur aux editions CM de la journee ;
- la garde elle-meme est cwd-independante (`const ROOT = path.resolve(__dirname, "..")`).

Consequence pour le cutover : AUCUNE. Le canari de cold-start n'utilise que des tests CM-owned
(`cm-boundary`, `cm-turn-end-guard`, `cm-discovery-validate`, `cm-discovery-qualify`, `cm-continuity-child-guard`)
et rend `CM_COLD_START_CANARY=PASS`. Ne pas corriger cette garde depuis le CM (fichier ROOT).

## 14. Écriture CM concurrente (périmètre planning — NON bloquant)

Voir `review/concurrent-writer-alert-2026-09-16.md` (détermination mesurée, non supposée).

Un second écrivain a modifié des fichiers de **planning** CM (`OWNERSHIP-MANIFEST.md` 12:23:43,
`ROADMAP.md` 12:27:05 → ajout `P1-GOV-CM-SHELL-HARMONIZATION`, `AGENTS.md`, `README.md`,
`INTERFACE.md`, `RAW/`, `tickets/`). Travail **préservé** (aucun revert).

```
CM_DOUBLE_OWNER_DETECTED=FALSE      (ownership d EXECUTION : single-flight respecte)
CM_CONCURRENT_PLANNING_WRITER_DETECTED=TRUE
ONE_ACTIVE_CM_EXECUTION_OWNER=TRUE
```

Le canari de cold-start reste `PASS` avec ces fichiers. Avant sa première **action X**, le nouvel agent
fait confirmer par l'opérateur qui porte `P1-GOV-CM-SHELL-HARMONIZATION` (éviter deux exécuteurs X).

