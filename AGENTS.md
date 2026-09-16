## graphify

Graphify's project-scoped graph path is `K:\ProjetIA\WCORE\graphify-out\graph.json`. `K:\ProjetIA\WCORE\.tmp\graphify-input` is the only extraction corpus.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Use WCORE memory in this order:
1. **Graphify structure first.** For codebase structure, run a targeted `rtk graphify query "<question>" --graph "K:\ProjetIA\WCORE\graphify-out\graph.json"`, `rtk graphify path "<A>" "<B>" --graph "K:\ProjetIA\WCORE\graphify-out\graph.json"`, or `rtk graphify explain "<concept>" --graph "K:\ProjetIA\WCORE\graphify-out\graph.json"`.
2. **Obsidian decisions/history second.** Use the project MCP `obsidian_wcore` by default for WCORE rationale, decisions, plans, or history, then read only the matching note section or line range. Use the inherited global MCP `obsidian` only when the user explicitly requests a cross-project search.
3. **Raw source last.** Use targeted file search and narrow source reads only when the first two layers do not answer the question or source verification is required.

Rules:
- For narrow questions, never read all of `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md`, `ROADMAP.md`, `AGENTS.md`, or `CHANGELOG.md`. Do not broadly crawl Graphify or Obsidian output.
- Keep Graphify operations project-local. Do not use global graphs, install Git hooks, start watchers, or configure an LLM/backend.
- Code-only AST extraction needs no provider extras or API keys. Never request or expose provider keys for it.
- Never run `graphify extract` or `graphify update` directly from the repository root, and never extract `K:\ProjetIA\WCORE` or `.`. `K:\ProjetIA\WCORE\.tmp\graphify-input` is the only extraction corpus.
- Rebuild or refresh only with `npm run graphify:sync`, which becomes available after repository setup in Task 2.
- Never call the shared stager (`K:\ProjetIA\scripts\graphify-project.ps1`) directly for WCORE. It does not read this project's `.gitignore`, so local trees (`data/chrome-profile`, `.generated`, `graft`, `_vault`, `invest-gas`, `.worktrees`, `.claude`) leak into `.tmp/graphify-input`. Two WCORE-owned guards keep the published artifact clean: `scripts/graphify-prune-local-nodes.cjs` (chained after `graphify:sync`, keeps only nodes whose source is tracked by git) and `scripts/graph-artifact-guard.test.cjs` (run by `npm run test:scripts` and by the `graph-artifact-guard` CI job). The source is excluded too, via `.graphify-exclude` (read by the shared stager when present).
- A manual Obsidian export must use `rtk graphify export obsidian --graph "K:\ProjetIA\WCORE\graphify-out\graph.json" --dir "K:\ProjetIA\WCORE\.generated\graphify"`.

## Session journaling (reflex, not optional)

Every opencode session must be journaled continuously, not just at the end:
- Log at each milestone (task done, bug found/fixed, decision, config/file change).
- Target: a vault journal note (`journal/YYYY-MM-DD-*.md`), created if missing, then **append** at each milestone. Never rewrite the whole note.
- Minimal content: context, actions (files modified), results/verifications, lessons, status.
- If a session runs over ~30 min, journal at least once mid-session, even partially.

## Cross-project rules

See ../AGENTS.md:
1. **Data property** — collect proprietary data first, store locally
2. **Terminal + Obsidian** — CLI scripts connected to Obsidian MCPs
3. **Wiki & Raw (Karpathy)** — write Raw first, distill to Wiki after
4. **Monthly audit** — 1st of every month, full system audit
5. **No learning loops** — every output verifiable against ground truth
6. **Session journaling** — continuous session logs (see above)
7. **Principle** — never build SEO projects with LLMs without rules 1-5
## Mem0

- Mémoires via MCP `mem0` ou CLI `tools\mem0\cli.mjs` (user_id `projet:WCORE`).
- Source de vérité inchangée : Graphify + Obsidian + data locale.
- Jamais de positions/montants exacts ni de secrets dans les mémoires.

### Usage optimal (workflow décision → mémoire)

1. **Début de session** : lancer `/session-start` (injecte contexte Mem0 projet +
   global:preferences + état Graphify).
2. **Après chaque décision validée** (test OK, donnée vérifiée, note Wiki écrite) :
   - `/memorize "<fait>" --source <note Obsidian>` (ou le skill `mem0-memorize`).
   - Ordre : note Wiki/Obsidian d'abord (source de vérité), puis mémoire, puis journal.
3. **Structure du code** : préférer `rtk graphify query/path/explain` sur
   `K:\ProjetIA\WCORE\graphify-out\graph.json` avant de grepper.
4. **Rappel** : une mémoire sans `source` est ignorée au retrieval. Un retour
   `[]` au `mem0_add` = déjà mémorisé (déduplication), pas une erreur.

### Adoption récurrente (engagement de chaque session)

- **Chaque session doit produire au moins une mémoire Mem0 sourcée** quand une
  décision a été prise (le dashboard mesure `Mem0 adoption`, CRITICAL = 0).
- Vérifier `mem0_search` avant de répondre à une question de contexte ; mémoriser
  après une décision, sans attendre qu'on le demande.


## Nettoyage filigranes IA

- Avant export/publication d'un fichier généré : skill `remove-ai-marks`
  (inspect puis clean, Layer A). Layer B jamais automatique. Contenu propriétaire.

## Autonomie opérationnelle complète — FULL_OPERATIONAL_AUTONOMY=ENABLED (R-022, 2026-09-13)

Les règles transversales de `K:\ProjetIA\AGENTS.md` s'appliquent ; cette section rend l'autonomie
explicite pour ce niveau. Ordre opérateur explicite et prioritaire (R-022) : posture DEFAULT = ACT,
jamais DEFAULT = ASK. Une tâche va jusqu'à DONE ou un véritable hard blocker.

- FULL_OPERATIONAL_AUTONOMY=ENABLED ; AUTONOMY_DEFAULT=CONTINUE ; UNKNOWN_IS_NOT_A_BLOCKER ;
  SAFE_BEST_EFFORT_REQUIRED ; ACTION_AFTER_CHECKPOINT_REQUIRED ; DO_NOT_END_ON_PLAN.
- Autonomie de méthode : l'agent choisit commandes/outils/ordre/découpage sans en tirer un droit
  nouveau sur les domaines gated ; elle n'emporte aucune autorité supplémentaire.
- Décision autonome : ne pas solliciter l'opérateur pour un choix normal dès qu'existe une option sûre,
  raisonnable, autorisée, réversible ou sauvegardée, cohérente avec la roadmap. Arbitrage : sécurité,
  conservation des données/preuves, réversibilité, fiabilité, minimalité, simplicité, performance/coût.
- Exécution autonome dans le projet et le périmètre autorisé : créer/modifier/déplacer/supprimer les
  fichiers ; corriger et refactorer (justification technique) ; créer/modifier les tests ; lancer
  tests/build/lint/typecheck ; scripts temporaires ; outils locaux ; dépendance de projet justifiée ;
  docs/roadmap/contexte ; réparation d'incohérence évidente ; migrations réversibles ; reprendre un
  travail interrompu ; abandonner une méthode qui échoue et en essayer une autre.
- Runtime project-owned : gérer seul le runtime qui appartient clairement à SON projet quand c'est
  nécessaire et sûr (lancer, arrêter, reload, restart, test runtime, port/service local, relancer son
  propre navigateur/profil si exclusif au projet) ; identifier l'owner et préserver l'état avant toute
  action destructive ; jamais le runtime d'un autre projet sans ownership démontré.
- Un modèle, un provider ou un backend inconnu ne constitue pas un gate ; `auto` est valide ; GLM,
  Qwen, Gemini, DeepSeek ou autres utilisables ; une restriction exige une preuve technique ou un ordre
  opérateur explicite.
- Après un crash, un reboot ou une interruption : lire roadmap + review-context + preuves durables ;
  reconstruire l'état réel depuis le disque ; identifier le dernier jalon durable ; reprendre le premier
  travail incomplet sans redemander la permission et sans recommencer une investigation déjà prouvée.
- Erreurs d'outil/commande/test/build/parsing/chemin/dépendance récupérables : observer, comprendre,
  corriger ou changer de méthode, réessayer ; limiter les retries identiques ; pas un motif d'escalade.
- Recherche : THINK_ENOUGH_THEN_ACT ; preuve suffisante -> arrêter la recherche et agir ; ne pas viser
  la certitude absolue. Après un checkpoint durable, l'action suivante est concrète, jamais un plan.
- Microgestion : elle n'est justifiée que par sécurité, intégrité de preuve, invariant runtime,
  régression connue ou ordre opérateur explicite ; sinon le prompt donne objectif, contexte, invariants,
  vraies limites de sécurité, preuve de succès et condition de fin.
- Hard blockers légitimes (seuls motifs d'arrêt) : secret requis sans autorisation d'accès ; permission
  système/ACL réellement absente ; owner externe indispensable ; action externe irréversible non
  autorisée ; risque sérieux de corruption/perte de données ou de preuve ; conflit d'ordres explicites
  irréconciliables ; impossibilité de préserver un invariant critique ; frontière de propriété runtime
  impossible à établir avant une action destructive. Avant de bloquer : tout le travail sûr possible,
  puis HARD_BLOCKER= / WORK_COMPLETED= / WHY_NO_SAFE_CONTINUATION= / EXACT_UNBLOCK_CONDITION= /
  NEXT_ACTION_AFTER_UNBLOCK=. Jamais bloquer pour hésitation, choix d'implémentation, UNKNOWN
  secondaire, backend inconnu, test rouge récupérable, erreur de commande, pluralité de solutions,
  absence de certitude parfaite, interruption précédente ou reboot.
- Sécurité : l'autonomie sur la méthode ne justifie jamais exposition de secrets, publication de
  credentials, contournement d'ACL/OS, destruction aveugle, manipulation du runtime d'un autre projet
  sans preuve d'owner, faux succès ou fabrication de preuve. Les gates existants (kill/restart, Chrome,
  dépause, cycle, POST, Corr-id, ACK, secrets/credentials, actions destructives, permissions externes)
  ne sont pas levés par cette politique.

### Boucle NON-STOP (R-023, 2026-09-13)

PERMANENT_AGENT_MODE / CONTINUOUS_EXECUTION / NON_STOP_ROADMAP_LOOP=ENABLED ;
AUTONOMY_DEFAULT=CONTINUE ; DEFAULT=ACT ; MILESTONE_IS_CHECKPOINT_NOT_STOP ;
DO_NOT_END_ON_PLAN ; DO_NOT_END_ON_MILESTONE ; DONE_IMPLIES_NEXT_ACTION.

- Boucle : OBSERVE -> QUALIFY -> PRIORITIZE -> ACT -> VERIFY -> PROOF -> CHECKPOINT
  -> REVIEW_CONTEXT -> ROADMAP -> SELECT_NEXT_ACTIONABLE_WORK -> ACT AGAIN. Un milestone atteint
  n'est pas un arret : IF NEXT_SAFE_ACTION EXISTS && BLOCKERS=NONE => STOP/HANDOFF IS FORBIDDEN.
- Regles absolues (aucun jalon n'est un handoff) : MILESTONE_DONE_IS_NOT_HANDOFF=TRUE ;
  TASK_DONE_IS_NOT_HANDOFF=TRUE ; CHECKPOINT_IS_NOT_HANDOFF=TRUE ; TESTS_GREEN_IS_NOT_HANDOFF=TRUE ;
  RUNTIME_HEALTHY_IS_NOT_HANDOFF=TRUE ; RECOVERY_SUCCESS_IS_NOT_HANDOFF=TRUE ;
  TIME_GATE_IS_NOT_HANDOFF=TRUE ; REPORTING_DOES_NOT_IMPLY_STOP=TRUE ; NEXT_SAFE_ACTION_MUST_EXECUTE=TRUE ;
  NO_IDLE_WHEN_EXECUTABLE_WORK_EXISTS=TRUE ; SAFE_WORK_EXISTS_REQUIRES_CONTINUE=TRUE ;
  SUPERVISOR_APPROVAL_NOT_REQUIRED_BETWEEN_NORMAL_TASKS=TRUE ; RETURN_TO_OPERATOR_ONLY_ON_EXCEPTION=TRUE ;
  CHECKPOINT_IS_EXECUTION_CONTINUITY_NOT_HANDOFF=TRUE ; DISK_STATE_GREATER_THAN_CONVERSATION_MEMORY=TRUE.
  Le succes d'une tache = capacite de passer immediatement au travail suivant.
- Un gate temporel (ex. checkpoint CM 72h) ne bloque pas le reste : TIME_GATED_TASK_DOES_NOT_BLOCK_OTHER_WORK=true.
  Une revue de cycle n'est pas requise entre deux taches normales ; un rapport n'implique pas un arret.
  TASK_A_TIME_GATED -> CHECKPOINT TASK_A -> chercher autre travail -> executer TASK_B ; a T0 :
  finir le micro-pas sur en cours -> CHECKPOINT -> AUTO_PREEMPT -> EXECUTE TASK_A -> VERIFY -> resume.
- Apres un checkpoint : NEXT_SAFE_ACTION_MUST_BE_EXECUTED_NOT_ONLY_DOCUMENTED (calculer la prochaine
  action ET l'executer, jamais la seule documenter). ROADMAP_UPDATED != HANDOFF ; REVIEW_CONTEXT_UPDATED != HANDOFF ;
  TESTS_GREEN != HANDOFF ; DONE != HANDOFF.
- Priorisation (ROADMAP_SELF_DRIVEN=ENABLED) : (1) gate/evenement devenu exigible ; (2) tache active
  reprenable ; (3) plus haute priorite TODO actionnable ; (4) BLOCKED dont la condition de reprise a
  disparu ; (5) anomalie de monitoring qualifiee ; (6) maintenance/amelioration bornee justifiee.
  Ne pas choisir une P2 si une P1 executable existe (sauf raison tracee) ; ne pas inventer de travail.
- **Enregistrement obligatoire** : toute nouvelle tache/anomalie qualifiee => `PRIORITY_ID` stable
  `P<0-3>-<DOMAINE>-<NOM>` (`P0-SEC/PROD/DATA-*`, `P1-GOV/REL/OBS/DATA-*`, `P2-CHAIN/CM/MAINT-*`,
  `P3-DOC/OPT-*`) enregistre dans `ROADMAP.md` (priorites transversales), jamais recycle/renomme
  (`-RETRY`/`-FINAL`/`-2`/nouvel ID apres reboot interdits) : meme tache = meme ID jusqu'a `DONE`.
- **Checkpoint enrichi (obligatoire)** : `CURRENT_TASK=`, `CURRENT_PRIORITY_ID=`, `CURRENT_PHASE=`,
  `LAST_COMPLETED_MILESTONE=`, `CURRENT_FACTS=`, `CURRENT_ASSUMPTIONS=`, `OPEN_UNKNOWNS=`,
  `NEXT_SAFE_ACTION=`, `BLOCKERS=` (+ `WATCHERS=`, `TIME_GATES=`, `ACTIVE_EXECUTION_TASK=` si utile).
  Le checkpoint distingue : travail durable suivi / tache d'execution courante / evenements armes.
- Seuls motifs d'arret (rendu de main exceptionnel) : hard blocker R-022 **ET** `ALL_SAFE_WORK_EXHAUSTED=YES`
  **ET** `NO_OTHER_ACTIONABLE_ROADMAP_WORK=YES` ; ou instruction explicite de l'operateur. Dans ce cas
  produire TRUE_HARD_BLOCKER_GATED= / ALL_SAFE_WORK_EXHAUSTED= / NO_OTHER_ACTIONABLE_ROADMAP_WORK= /
  WORK_COMPLETED= / WHY_NO_SAFE_CONTINUATION= / EXACT_UNBLOCK_CONDITION= / NEXT_ACTION_AFTER_UNBLOCK=.
  Une tache bloquee != agent bloque (enregistrer le blocker + condition de reprise, puis TASK_B -> CONTINUE).
- Cette boucle ne leve aucun gate existant et n'ajoute aucune autorite : elle supprime uniquement
  l'arret par hesitation, milestone, plan, tests verts, runtime sain, recovery, time-gate ou attente
  de choix de la prochaine tache.

<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->

---
## 9ter. Mission CM primaire — X @WCORExyz (R-024, 2026-09-14)

Pour cet agent, la mission principale est le Community Management de la page X @WCORExyz.
WC-01 est le workstream principal permanent (monitoring, interactions, editorial, research,
publication QA, checkpoint, discovery) — pas un simple watcher.

- CM_PRIMARY_MISSION_X=TRUE ; PRIMARY_ACCOUNT=@WCORExyz ; PRIMARY_SURFACE=X ;
  PRIMARY_WORKSTREAM=WC-01 ; CM_IS_NOT_A_WATCHER_ONLY=TRUE ;
  X_PAGE_MUST_BE_OPERATIONALLY_AVAILABLE=TRUE.
- Navigateur CM project-owned : `wcore-web/scripts/chrome-cdp.js start https://x.com/WCORExyz`
  (profil `C:\Users\strau\chrome-debug-profile`, CDP 127.0.0.1:9222). Doit rester VISIBLE et actif.
  Le MCP Playwright integre n'utilise PAS ce profil (navigateur distinct, non authentifie) : les
  actions X authentifiees passent par `connectOverCDP(9222)`.
- CM_WORK_DOES_NOT_EQUAL_PRODUCT_ROADMAP_AUTOPILOT=TRUE :
  NO_QUALIFIED_REPLY_MEANS_DISCOVERY_NOT_PRODUCT_SWITCH=TRUE ;
  CM_PRODUCT_WORK_REQUIRES_CM_SIGNAL_OR_OPERATOR_ORDER=TRUE.
- R-022/R-023 s'appliquent PLEINEMENT : la boucle NON-STOP couvre la mission CM ET, quand aucune
  action CM n'est due, le travail roadmap sur et actionnable (dual-lane mono-agent, voir ci-dessous).
- Replies publiques uniquement si gate net (pertinent WCORE, utile, exact, non redondant,
  non-paraphrase, aucune claim non sourcee). Sinon discovery/research/editorial.
- Aucun secret, aucun wallet connect, aucune signature, aucune metrique inventee (UNKNOWN=UNKNOWN).

### CM bounded pause (R-024 suite, 2026-09-14)

CM_IDLE_IS_NOT_HANDOFF=TRUE ; PAUSE_IS_NOT_HANDOFF=TRUE ; BOUNDED_PAUSE_ALLOWED=TRUE ;
NO_BUSYWORK_FOR_CONTINUITY=TRUE ; NO_FINAL_REPORT_DURING_BOUNDED_PAUSE=TRUE ;
WAKE_AND_RECHECK_AFTER_PAUSE=TRUE ; IDLE_CM_IS_NOT_BLOCKED=TRUE.

Une PAUSE interne bornee (ex. `Start-Sleep`) est un etat operationnel, PAS un handoff. Si, apres
verification des notifications/mentions/replies et une discovery recente, aucun gate net ni travail
CM immediatement utile n'existe : entrer en pause bornee, puis `WAKE -> RECHECK X -> CONTINUE`.
Pendant l'idle CM, ne basculer vers le produit QUE sous la semantique dual-lane gardee (voir
"### Dual-lane mono-agent" ci-dessous) : jamais si une action CM est due, et jamais si la micro-etape
peut faire depasser la borne de fraicheur X (`<=15 min`). Ne jamais depasser T0 : des que
`now >= 2026-09-14 10:50:29 Europe/Paris`, executer le checkpoint officiel C2.

### Dual-lane mono-agent - R-024 revise (2026-09-16, `P1-GOV-SINGLE-AGENT-DUAL-LANE`)

OPERATOR_EXPLICIT_VALIDATION=TRUE ;
VALIDATION_REASON=OPERATOR_REQUIRES_NO_UNNECESSARY_STOP_WHILE_ACTIONABLE_ROADMAP_WORK_EXISTS.

La semantique absolue historique `NO_PRODUCT_DURING_IDLE=TRUE` est **remplacee** par la semantique
gardee suivante (le token historique reste cite pour audit ; sa force absolue est retiree) :
WC01_CM_ALWAYS_PREEMPTIVE=TRUE ; NO_NON_CM_WORK_WHEN_CM_ACTION_DUE=TRUE ;
NON_CM_MICROSTEP_ALLOWED_WHEN_CM_SAFE=TRUE ; CM_PREEMPTS_NON_CM_AT_SAFE_CHECKPOINT=TRUE ;
X_FRESHNESS_BOUND_MUST_BE_PRESERVED=TRUE ; NO_IDLE_WHEN_SAFE_ACTIONABLE_ROADMAP_WORK_EXISTS=TRUE.

Portee (sans dupliquer R-023) : WC-01 reste prioritaire et preemptif ; le travail non-CM n'est
autorise que si aucune action CM n'est due et que la borne de fraicheur X (`<=15 min`) est preservee ;
le non-CM avance par micro-etapes checkpointables/reversibles ; le single-flight WC-01 est preserve ;
aucun second agent, aucune PARTIE 3 pour du travail local.

## 9bis. Contexte de revue GPT (obligatoire)

AVANT CHAQUE ARRÊT de l'agent (fin d'action, fin de tâche, fin de tour, idle, blocage,
erreur ou retour sans autre outil/action), mettre à jour `review-context.md` à la
racine du projet — c'est LA source que le superviseur envoie à GPT pour la revue de
cycle. Le fichier doit être exhaustif et factuel (toutes les données runtime
mesurables et vérifiables), pas un simple résumé, sans plafond arbitraire de lignes
ou de taille pouvant tronquer l'état nécessaire à la revue. Aucun arrêt avec un
`review-context.md` obsolète ou incomplet. Exclure les secrets (clés, tokens,
credentials, .env) et les identifiants runtime réels ; utiliser uniquement des alias
anonymisés. Signaler les sources indisponibles sans inventer de données.

Les sections suivantes sont un minimum de structure ; ajouter toute section ou tout
détail nécessaire à un état exhaustif :

- `## État actuel` : objectif courant, mode actif, invariants
- `## Terminé depuis la dernière revue` : commits, tests verts, décisions
- `## En cours / bloqué` : tâche active, blocages
- `## Questions pour la revue` : ce que GPT doit vérifier/arbitrer
- `## Invariants à préserver` : ce qui ne doit jamais être cassé

## Pause, recheck et non-handoff (R-032 - P1-GOV-PAUSE-RECHECK-COMMON)
PAUSE_IS_NOT_HANDOFF=TRUE ; NO_USEFUL_ACTION_NOW_IS_NOT_HANDOFF=TRUE ; NO_USEFUL_ACTION_NOW_IS_NOT_SESSION_DONE=TRUE ; REPORT_IS_TELEMETRY_NOT_HANDOFF=TRUE ; NO_FAKE_WORK_FOR_ACTIVITY=TRUE ; AGGRESSIVE_POLLING_FORBIDDEN=TRUE ; PERSISTENT_OWNER_REQUIRED_FOR_AUTOMATIC_RECHECK=TRUE ; MODEL_TURN_END_IS_NOT_HANDOFF=TRUE ; SUPERVISOR_POLICY_GENERATION=R-029 ; SUPERVISOR_PROMPT_REVISION=R-046.
WORK_AVAILABLE_NOW => ACT ; NO_USEFUL_ACTION_NOW + RESPONSABILITE_ACTIVE => BOUNDED_PAUSE_OR_BACKOFF -> AUTOMATIC_RECHECK (JAMAIS HANDOFF ni SESSION_DONE). Aucun etat normal STOPPED_WAITING_FOR_SUPERVISOR. Cadence deduite du projet (EVENT_DRIVEN sinon BOUNDED_BACKOFF) ; TIGHT_POLLING_LOOP interdit ; aucun travail artificiel. AUTOMATIC_RECHECK revendique seulement si un PERSISTENT_CONTINUITY_OWNER project-owned est prouve, sinon AUTOMATIC_RECHECK=NOT_YET_PROVEN.

## Routing inter-AGENT OpenCode — PARTIE 3 = PROMPT EXÉCUTEUR (P1-GOV-INTERAGENT-ROUTING)
Architecture canonique : `PART1_TARGET=HUMAN_OPERATOR` ; `PART2_TARGET=LOCAL_OPENCODE_AGENT` ; `PART3_TARGET=OTHER_OPENCODE_AGENT_ONLY`. `PART3_TO_GPT_SUPERVISOR=FORBIDDEN` — aucun bus GPT→GPT ; le destinataire opérationnel d'une PARTIE 3 est **toujours un AUTRE agent OpenCode**, jamais un GPT Supervisor. Règle de revue **Supervisor** (pas de l'agent CM) : `INTERAGENT_ROUTING_REVIEW=MANDATORY_EVERY_TURN` — à chaque revue, évaluer « une information ou action MATÉRIELLE issue de cette revue doit-elle devenir un PROMPT EXÉCUTEUR pour un AUTRE agent OpenCode ? » → OUI = `## PARTIE 3 — PROMPT POUR UN AUTRE AGENT OPENCODE` (après PARTIE 2) ; NON = PARTIE 3 omise. **PARTIE 3 = prompt exécutable, pas un memo** : `PART3_MUST_BE_EXECUTOR_PROMPT=TRUE` ; `PART3_ROUTING_MEMO_ONLY=FORBIDDEN` ; `PART3_MUST_BE_DIRECTLY_PASTEABLE_IN_TARGET_OPENCODE_CONVERSATION=TRUE` ; `PART3_MUST_NOT_REQUIRE_GPT_SUPERVISOR_INTERPRETATION=TRUE` ; `PART3_REQUIRED_STRUCTURE=9_SECTIONS` — en-tête `DESTINATAIRE: Agent OpenCode <projet>` + `ROUTING_TOPIC:` + `PRIORITÉ SUGGÉRÉE:` puis les 9 sections exactes (1 Contexte / 2 Objectif / 3 Étapes exactes / 4 Contraintes et interdits / 5 Preuve attendue / 6 Autonomie & contexte / 7 Invariants à préserver / 8 Assumptions / 9 Continuité, escalade et rendu de main exceptionnel). Le travail de l'agent OpenCode WCORE local reste en PARTIE 2 (`LOCAL_AGENT_WORK_STAYS_IN_PART2=TRUE` ; `PART3_TARGET_IS_LOCAL_AGENT_FORBIDDEN=TRUE`). `PART3_IS_NOT_HANDOFF=TRUE` ; `PART3_IS_NOT_PERMISSION_GATE=TRUE` ; `PART3_DOES_NOT_STOP_SOURCE_AGENT=TRUE` ; `PART3_DOES_NOT_REQUIRE_TARGET_ACK=TRUE` ; `RECEIVED_PART3_IS_NOT_SOURCE_OF_TRUTH=TRUE` ; `VERIFY_MATERIAL_CLAIMS_BEFORE_ACTION=TRUE` ; `UNVERIFIED_SIGNAL_REQUIRES_PRIMARY_EVIDENCE=TRUE` ; `UNVERIFIED_SIGNAL_CANNOT_TRIGGER_DESTRUCTIVE_ACTION=TRUE` ; `INTERAGENT_MESSAGE_DEDUP=ENABLED`. Politique normative unique CURRENT : `docs/prompts/supervisor-wcore-cm.md` L602 (R-046 ; **supersede** `P1-GOV-SUPERVISOR-PART3-EXECUTOR-PROMPT`, R-039/`P1-GOV-SUPERVISOR-INTERSUPERVISOR-PART3-ROUTING` et `P1-GOV-INTERSUPERVISOR-ROUTING`, historique préservé pour audit, force normative retirée) — aucun doublon. Ne bloque jamais la boucle CM.

<!-- P1-GOV-SUPERVISOR-CONTEXT-FILTERS -->
## Filtres Windows Search — corpus GPT Supervisor (P1-GOV-SUPERVISOR-CONTEXT-FILTERS)

GPT_SUPERVISOR_CONTEXT_FILTERS=ENABLED
SUPERVISOR_CONTEXT_PROFILE_DEFAULT=HOT
FORENSIC_PROFILE_AVAILABLE=TRUE
WINDOWS_SEARCH_PROFILE_AUTOSELECT=ENABLED
WINDOWS_SEARCH_EXACTLY_ONE_QUERY_PER_FINAL_RESPONSE=TRUE
WINDOWS_SEARCH_DEFAULT_PROFILE=HOT
WINDOWS_SEARCH_UNCERTAIN_PROFILE_FALLBACK=HOT
WINDOWS_SEARCH_FORENSIC_ONLY_WHEN_MATERIALLY_REQUIRED=TRUE
WINDOWS_SEARCH_SECOND_QUERY_FORBIDDEN=TRUE
WINDOWS_SEARCH_HOT_AND_FORENSIC_TOGETHER_FORBIDDEN=TRUE
WINDOWS_SEARCH_QUERY_SINGLE_LINE=TRUE
WINDOWS_SEARCH_QUERY_RAW_COPY_PASTE_READY=TRUE
WINDOWS_SEARCH_CODE_BLOCK_CONTAINS_QUERY_ONLY=TRUE
WINDOWS_SEARCH_NO_MANUAL_EDIT_REQUIRED=TRUE
FILTER_FOOTER_REQUIRED_ON_EVERY_OPENCODE_FINAL_RESPONSE=TRUE
FILTER_FOOTER_POSITION=LAST_VISIBLE_BLOCK_BEFORE_MODEL_TURN_END
FILTER_ROOT_MUST_MATCH_CURRENT_PROJECT=TRUE
FILTER_QUERY_MUST_BE_SINGLE_LINE=TRUE
FILTER_FOOTER_IS_NOT_HANDOFF=TRUE
FILTER_FOOTER_IS_NOT_OPERATIONAL_STOP=TRUE
NO_TEXT_AFTER_FILTER_FOOTER=TRUE
HOT_EXCLUSION_DOES_NOT_REVOKE_SOURCE_AUTHORITY=TRUE
FILTER_ROOT=K:\ProjetIA\WCORE
MODEL_TURN_END != OPERATIONAL_AGENT_STOP

Politique canonique : `K:\ProjetIA\docs\SUPERVISOR-CONTEXT-FILTERS.md`.
HOT = contexte CURRENT normal (exclut tickets/journal/RAW) ; FORENSIC = preuve/chronologie/audit (les reinclut). Les DEUX profils restent disponibles (semantique R-042 inchangee), mais UNE SEULE requete est rendue par reponse.
Les deux excluent toujours generated/graphify, .generated, graphify-out, .obsidian-vault, tmp, .tmp, node_modules.

SELECTION (deterministe, avant la reponse finale) : NORMAL_CURRENT_WORK => HOT ; COLD_EVIDENCE_MATERIALLY_REQUIRED (tickets/journal/RAW, chronologie, audit, provenance, reconstruction historique, demande explicite) => FORENSIC ; AMBIGUOUS => HOT (defaut). FORENSIC jamais « au cas où ». Ne jamais rendre HOT et FORENSIC ensemble, ne jamais rendre une seconde requete, ne plus jamais afficher une ligne de recommandation de profil.

A la fin de CHAQUE reponse finale user-visible, selectionner le profil adapte et produire UN SEUL bloc comme DERNIER bloc visible :

GPT SUPERVISOR — WINDOWS SEARCH — <HOT|FORENSIC>

Le bloc texte qui suit contient UNIQUEMENT la requete AQS selectionnee (une seule ligne, root = K:\ProjetIA\WCORE, copiable-collable sans nettoyage). Aucun texte apres ce bloc.

Requetes selectionnables pour WCORE (en choisir UNE selon le profil) :

Profil HOT (defaut) :
System.FileExtension:=.md NOT System.ItemFolderPathDisplay:~<"K:\ProjetIA\WCORE\generated\graphify" NOT System.ItemFolderPathDisplay:~<"K:\ProjetIA\WCORE\.generated\graphify" NOT System.ItemFolderPathDisplay:~<"K:\ProjetIA\WCORE\graphify-out" NOT System.ItemFolderPathDisplay:~<"K:\ProjetIA\WCORE\.obsidian-vault" NOT System.ItemFolderPathDisplay:~<"K:\ProjetIA\WCORE\tmp" NOT System.ItemFolderPathDisplay:~<"K:\ProjetIA\WCORE\.tmp" NOT System.ItemFolderPathDisplay:~<"K:\ProjetIA\WCORE\node_modules" NOT System.ItemFolderPathDisplay:~<"K:\ProjetIA\WCORE\tickets" NOT System.ItemFolderPathDisplay:~<"K:\ProjetIA\WCORE\journal" NOT System.ItemFolderPathDisplay:~<"K:\ProjetIA\WCORE\RAW"

Profil FORENSIC (si materielllement requis) :
System.FileExtension:=.md NOT System.ItemFolderPathDisplay:~<"K:\ProjetIA\WCORE\generated\graphify" NOT System.ItemFolderPathDisplay:~<"K:\ProjetIA\WCORE\.generated\graphify" NOT System.ItemFolderPathDisplay:~<"K:\ProjetIA\WCORE\graphify-out" NOT System.ItemFolderPathDisplay:~<"K:\ProjetIA\WCORE\.obsidian-vault" NOT System.ItemFolderPathDisplay:~<"K:\ProjetIA\WCORE\tmp" NOT System.ItemFolderPathDisplay:~<"K:\ProjetIA\WCORE\.tmp" NOT System.ItemFolderPathDisplay:~<"K:\ProjetIA\WCORE\node_modules"

Le bloc annonce uniquement END_OF_USER_VISIBLE_RESPONSE, jamais END_OF_OPERATIONAL_OWNERSHIP,
et n'est ni un HANDOFF ni un OPERATIONAL_AGENT_STOP.

<!-- P1-GOV-INTERAGENT-ROUTING — marqueurs DURABLES WCORE-owned -->
INTERAGENT_ROUTING_SOURCE_OF_TRUTH=DURABLE_WCORE_OWNED (AGENTS.md)
ROUTING_MARKERS_DURABILITY_NOTE: le fichier `docs/prompts/supervisor-wcore-cm.md` est un MIROIR
regenerable par un amont externe (constate 2026-09-16 : re-publie 4x, mtime/SHA changes) ; les
marqueurs normatifs de routage inter-agent sont donc aussi portes ICI, dans un fichier WCORE-owned
suivi par git, pour que `scripts/gov-interagent-routing.test.cjs` ne depende plus du miroir.
MERGE_INTO_PART2=TRUE
INTERAGENT_ROUTING_PRIORITY_ID=P1-GOV-INTERAGENT-ROUTING
SUPERSEDED_PRIORITY_IDS=P1-GOV-SUPERVISOR-PART3-EXECUTOR-PROMPT

<!-- CHILD_SIDE_FRESHNESS_GUARD (WCORE-owned, durable) -->
IN_TURN_CONTINUITY_REQUIRED=TRUE
CHILD_SIDE_FRESHNESS_GUARD=TRUE
GARDE: avant CHAQUE micro-etape potentiellement longue, executer
`node scripts/cm-continuity-runner.cjs --guard-check --budget-ms=<duree estimee ms>`.
Si `action_required=REFRESH_X_NOW` (age >= 12 min, ou age+budget > 15 min) : suspendre le non-CM,
faire une VRAIE lecture X (CDP 9222), qualifier, puis `--x-observed` (JAMAIS sans lecture reelle), puis reprendre.
Le resident est un CAPTEUR (SENSOR_ONLY) : il n injecte aucun message et ne peut PAS reveiller le modele.
Historique des gaps X : `node scripts/cm-continuity-runner.cjs --coverage-ledger`.
SENSOR_CAN_WAKE_MODEL=FALSE ; POST_TURN_AUTO_REINVOKE_PROVEN=FALSE ; AUTOMATIC_RECHECK_PROVEN=FALSE.
