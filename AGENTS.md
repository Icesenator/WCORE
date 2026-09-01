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

## 9bis. Contexte de revue GPT (obligatoire)

Avant chaque fin de tâche (ou au minimum à chaque passage en idle), mettre à jour eview-context.md à la racine du projet — c'est LA source que le superviseur envoie à GPT pour la revue de cycle :

- ## État actuel : objectif courant, mode actif, invariants (5-10 lignes)
- ## Terminé depuis la dernière revue : commits, tests verts, décisions
- ## En cours / bloqué : tâche active, blocages
- ## Questions pour la revue : ce que GPT doit vérifier/arbitrer
- ## Invariants à préserver : ce qui ne doit jamais être cassé

Synthétique (≤ 60 lignes), factuel, sans secrets ni credentials. Si le fichier est obsolète, la revue GPT travaille sur de mauvaises bases.
