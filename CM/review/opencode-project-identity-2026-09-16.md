# OpenCode — identité projet ROOT vs CM (diagnostic 2026-09-16)

`owner=WCORE_CM_CONFORMITY_AGENT` · DB OpenCode **lecture seule** · aucune session créée/supprimée,
aucun `git init`, aucun worktree/clone, aucun changement remote.

## Constat (symptôme)

Ouvrir `K:\ProjetIA\WCORE` et `K:\ProjetIA\WCORE\CM` affiche « WCORE CM » dans les deux cas.

## Preuves primaires

```
OPENCODE_VERSION=1.18.18
OPENCODE_DB=C:\Users\strau\.local\share\opencode\opencode.db

WCORE_GIT_TOPLEVEL=K:/ProjetIA/WCORE
WCORE_CM_GIT_TOPLEVEL=K:/ProjetIA/WCORE
SAME_GIT_ROOT=TRUE

# project table (id tronque, non sensible)
WCORE_PROJECT_ID=ea8d9f96…
WCORE_PROJECT_WORKTREE=C:/Users/strau/wcore-web      (main legacy, deplace)
WCORE_PROJECT_NAME=WCORE CM
WCORE_PROJECT_SANDBOXES=["K:/ProjetIA/WCORE"]
WCORE_CM_PROJECT_ID=ea8d9f96…  (memе project ; aucune ligne CM)
PROJECT_IDS_DISTINCT=FALSE
OPENCODE_PROJECT_IDENTITY_COLLISION=PROVEN
CM_LISTED_AS_SANDBOX_OF_WCORE=FALSE (l'entree sandbox est K:/ProjetIA/WCORE ; CM en est un sous-repertoire)
```

- `opencode debug scrap` → **11 projets**, aucun projet dont le worktree est `…\WCORE\CM`.
- `project_directory` : `ea8d9f96…` possède `C:\Users\strau\wcore-web` (type=main), `K:/ProjetIA/WCORE`,
  et 6 worktrees `K:/ProjetIA/WCORE/.worktrees/*` (strategy=git_worktree).
- Sessions : `directory=K:/ProjetIA/WCORE` → `ea8d9f96…` (188) ; `directory=K:/ProjetIA/WCORE/wcore-gsheet`
  → **même** `ea8d9f96…` (8) ; `directory=K:/ProjetIA/WCORE/CM` → **aucune**.
- **Worktrees ne créent pas de projet distinct** : les 6 worktrees WCORE + ceux de BotTrading /
  AutoCascade / CodexReviewSupervisor partagent tous le `project_id` de leur dépôt.

## Héritage d'instructions / config (cwd CM)

`opencode debug config` depuis `K:\ProjetIA\WCORE\CM` et depuis `K:\ProjetIA\WCORE` : **byte-identique**
(SHA-256 `A1A01F54B17CA80A…`, 12583 o). Les deux chargent les plugins WCORE
(`K:/ProjetIA/WCORE/.opencode/plugins/graphify*.js`), le MCP `obsidian_wcore`, et les agents au prompt
`project: WCORE`. Depuis `K:\ProjetIA` : config **différente** (`obsidian_projetia`, prompt `project: ProjetIA`).

```
CM_AGENTS_LOADED=TRUE                       (CM/AGENTS.md present, charge en contexte CM)
ROOT_AGENTS_LOADED_IN_CM_CONTEXT=TRUE       (config resolue identique a WCORE ; scope WCORE applique)
ISOLATION_BY_SUBDIRECTORY=WEAK
```

## Analyse des options (mesurée, non supposée)

| Option | Effet réel | Verdict |
|---|---|---|
| **1** — même projet + sessions `directory` distincts + politiques | Sessions distinguables par `directory`, mais `project_id`, config, plugins, MCP et nom UI restent partagés (prouvé : config identique). | **Isolation INSUFFISANTE** |
| **2** — dépôt Git CM réellement distinct (toplevel = CM) | Seul mécanisme prouvé donnant un `project_id` distinct (l'identité dérive du toplevel VCS). | **Retenue** (voir recommandation) |
| **3** — autre mécanisme officiel 2 identités | Aucun trouvé : pas de flag/config d'override d'identité ; `project.name` (renommage UI) est cosmétique. | Non disponible |
| **4** — worktree | **Prouvé** : même `project_id` (strategy=git_worktree → sandbox du même projet). | **Ne marche pas** |
| **5** — instances/serveurs OpenCode séparés | La DB/les projets sont globaux et dérivés du cwd+VCS ; un second serveur change le transport, pas la résolution de project root. | Ne change pas l'identité |

## Verdict

```
OPENCODE_ROOT_CM_PROJECT_SEPARATION=FAIL
WCORE_CM_READY_FOR_COLD_START=FALSE
```

Le dossier CM est conforme (docs/tooling/boundary) mais **ne peut pas** démarrer comme projet OpenCode
distinct de ROOT en l'état.

## Recommandation (une seule) + condition d'implémentation

**RECOMMENDED_ARCHITECTURE** : donner à CM son **propre toplevel Git** = faire de
`K:\ProjetIA\WCORE\CM` un **dépôt Git indépendant imbriqué** (pas un submodule), sans déplacer les
fichiers. OpenCode résout alors un `project_id` distinct (mécanisme prouvé). Étapes, à n'exécuter
qu'après GO opérateur (le diagnostic interdit toute restructuration git) :

1. `git init` dans `K:\ProjetIA\WCORE\CM` (+ commit initial des fichiers CM-owned).
2. Côté WCORE : `git rm -r --cached CM` puis `CM/` dans `.gitignore` (WCORE cesse de pister CM).
3. Ajouter `CM/opencode.json` (nom projet `WCORE-CM`) + `CM/.opencode/` si besoin (agents/plugins CM-only).
4. Trancher explicitement le tooling CM-owned actuellement sous `WCORE\scripts\cm-*` : soit le déplacer
   dans `CM/scripts/` (migration bornée, chemin stable via le launcher), soit l'assumer hors dépôt CM
   (à documenter dans `OWNERSHIP-MANIFEST`).

**EXACT_UNBLOCK_CONDITION** : GO opérateur pour (a) créer le dépôt Git à `K:\ProjetIA\WCORE\CM`,
(b) `git rm --cached CM` + `.gitignore` côté WCORE, puis vérifier `opencode debug scrap` →
nouveau `project_id` distinct pour `K:\ProjetIA\WCORE\CM` (sinon rollback : suppression du `.git` CM,
restauration du tracking WCORE).

`PUBLICATION=NONE` · `HANDOFF_ACCEPTED=FALSE` · `NEW_WCORE_CM_CONVERSATION_EXISTS=FALSE`.
