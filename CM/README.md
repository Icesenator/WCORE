# WCORE / CM — sous-projet Community Management

`WCORE_CM_IS_SUBPROJECT_OF_WCORE=TRUE` · `WCORE_ROOT != WCORE_CM` · `ONE_WORK_ITEM_ONE_OWNER=TRUE`

## Role

**CM** = Community Management de X `@WCORExyz` : lecture X, qualification, editorial, discovery,
publication QA, monitoring de couverture, continuité CM.

**ROOT** = produit / runtime / opérations WCORE : `wcore-web/`, `wcore-gsheet/`, `src/`, API, registre
de chaînes, données produit, builds, déploiements.

Le CM reste **à l'intérieur** du projet WCORE : ce n'est **pas** une copie indépendante.

## Frontiere (regle courte)

| Domaine | Proprietaire |
|---|---|
| `ROADMAP.md` (ROOT) — le **fichier** ; la ligne `WC-01` n'y est qu'un **POINTEUR** | **ROOT** (fichier) / **CM** (`WC-01` canonique dans `CM/ROADMAP.md`) |
| `AGENTS.md` (racine) | **ROOT** |
| `review-context.md` (CURRENT global) | **ROOT** ; le CM publie son etat dans `CM/review-context.md` |
| `scripts/cm-*.cjs` / `cm-*.test.cjs` (runtime + continuite CM) | **CM** |
| `.generated/cm-continuity/` (etat runtime CM) | **CM** (gitignored, chemin stable) |
| `Wiki/CM/*` (backlog editorial, decisions CM) | **CM** |
| `CM/RAW/` (preuves brutes durables ; RAW avant Wiki) | **CM** |
| `CM/tickets/` (`type: ticket`, `project: WCORE-CM`) | **CM** |
| `CM/editorial/` (candidats éditoriaux) | **CM** |
| `CM/ROADMAP.md` / `CM/review-context.md` (CURRENT CM) | **CM** |
| Dashboard `status.md` (entrée `WCORE-CM`) | **PARTAGÉ** (config dans `K:\ProjetIA\scripts\dashboard.config.psd1`) |
| `docs/prompts/supervisor-wcore-cm.md` | **MIROIR** regenerable par un amont externe (voir `AGENTS.md`, marqueurs durables) |
| `gov-interagent-routing.test.cjs` | **SHARED** (gouvernance ; lit `AGENTS.md` + miroir) |
| `wcore-web/`, `wcore-gsheet/`, `src/` | **ROOT** (jamais modifie par le CM) |

## Interdits (invariants)

- `NO_CROSS_AGENT_IMPERSONATION=TRUE` — le CM ne modifie pas le produit ; ROOT ne publie pas sur X.
- `NO_AUTOCREATED_CONVERSATION=TRUE` — aucun agent ne cree de conversation automatiquement.
- `NO_SYNTHETIC_USER_TURN=TRUE` — aucun faux message utilisateur (le capteur `SENSOR_ONLY` est un capteur).
- `NO_SCHEDULED_TASK_WAKE=TRUE` — aucune tache planifiee de reveil d'agent.
- `NO_DUPLICATE_SOURCE_OF_TRUTH=TRUE` — `ROADMAP.md` n'est **jamais** copie dans `CM/`.
- `NO_DESTRUCTIVE_MIGRATION=TRUE` — pendant la separation initiale, on declare la propriete ; on ne deplace pas en masse.

## Etat

- `WC01_CANONICAL_OWNER=WCORE_CM` (contenu/publication X `@WCORExyz`) ; la ligne `WC-01` reste **dans**
  `ROADMAP.md` (ROOT-owned), pointant vers ce sous-projet pour l'execution editoriale.
- `CM_SYNTHETIC_WAKE_COUNT=0` · `CM_SCHEDULED_WAKE_COUNT=0`.
- `CM_SHELL_HARMONIZED=TRUE` — aligné sur `K:\ProjetIA\docs\PROJECT-FILESYSTEM-CONTRACT.md` :
  entrée dashboard dédiée `WCORE-CM` (sans tâche planifiée), tickets/RAW/Wiki CM, `user_id Mem0=projet:WCORE-CM`.
- Interface detaillee : `CM/INTERFACE.md` · Inventaire et classification : `CM/OWNERSHIP-MANIFEST.md`.
