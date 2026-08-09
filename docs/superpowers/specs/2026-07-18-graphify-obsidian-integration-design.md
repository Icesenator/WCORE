---
type: spec
status: active
project: wcore
date: 2026-07-18
---

# Graphify and Obsidian Integration Design

## Goal

Install Graphify as a local AST-only code map, export every generated node into the WCORE Obsidian vault, and remove avoidable native-note orphans without mixing generated knowledge with human-maintained documentation.

## Current State

The canonical vault contains 117 visible Markdown notes after Obsidian ignore filters are applied. Seventy-one are true orphans with no incoming or outgoing internal note link:

- 36 current Superpowers plans/specifications;
- 32 archived plans/specifications;
- 2 root/project contract files;
- 1 technical document.

The main cause is sparse authoring: 100 visible notes contain no effective outgoing link syntax. The stale slash/backslash identities in the Obsidian MCP index are a separate cache defect and do not explain most orphans.

Graphify is not currently installed. The approved version is the official `graphifyy` PyPI package at `0.9.18`.

## Constraints

- Use Graphify code AST extraction only. Do not configure or invoke any LLM backend.
- Do not send code, documentation, symbols, queries, or graph output to an external provider.
- Produce one WCORE code graph containing Web API and GSheet sources.
- Export every Graphify node into the vault under a generated namespace.
- Keep generated notes visible to Obsidian but untracked by Git.
- Version only `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md`, wrapper/configuration files, and human documentation.
- Do not install a Git hook.
- Do not scan dependencies, build output, logs, secrets, environment files, databases, or generated chain output.
- Preserve all unrelated dirty-worktree changes.
- Preserve the global OpenCode MCP named `obsidian`, backed by `seekstone@0.9.1` with `SEEKSTONE_VAULT=K:\`.
- Add a distinct project MCP named `obsidian_wcore`, backed by the same pinned Seekstone version with `SEEKSTONE_VAULT=K:\WCORE`. WCORE memory retrieval uses `obsidian_wcore`; the global server is reserved for explicit cross-project searches.

## Installation

Install the audited package in an isolated uv tool environment:

```powershell
uv tool install graphifyy==0.9.18
```

After installation, verify `graphify --version` and inspect actual command help before executing extraction. Install the OpenCode integration in project scope only:

```powershell
graphify install --platform opencode --project
```

All generated OpenCode files must be reviewed before retention. The integration must point query-first instructions at the WCORE graph and must not install or invoke an LLM backend.

Project `.opencode/opencode.json` must add this local MCP without overriding the inherited global `obsidian` server:

```json
"obsidian_wcore": {
  "type": "local",
  "command": ["npx", "-y", "seekstone@0.9.1"],
  "environment": {
    "SEEKSTONE_VAULT": "K:\\WCORE",
    "SEEKSTONE_LOG_LEVEL": "warn"
  },
  "enabled": true
}
```

## Repository Structure

```text
K:/WCORE/
|-- .tmp/                           # ignored by Git and Obsidian
|   `-- graphify-input/             # generated staging
|       |-- web-api/                # tracked API TS/JS/JSON only
|       `-- gsheet/                 # Apps Script .gs mirrored as .js
|-- graphify-out/
|   |-- graph.json                  # versioned
|   |-- GRAPH_REPORT.md             # versioned
|   |-- graph.html                  # ignored
|   |-- cache/                      # ignored
|   `-- local manifests/cost files  # ignored
|-- generated/graphify/             # full Obsidian export; ignored by Git
|-- scripts/
|   |-- graphify-sync.ps1           # sync/watch/status entry point
|   `-- graphify-opencode.js        # project lifecycle launcher if required
`-- docs/reference/code-graph.md    # human bridge into generated graph
```

`.tmp/graphify-input/`, `generated/graphify/`, Graphify cache, HTML, cost, and local state are ignored by Git. `.tmp/` is also ignored by Obsidian so its indexer cannot lock the atomic staging tree. The legacy root `/graphify-input/` Git ignore remains only as defense-in-depth and is not a pipeline input. `generated/graphify/` must not be added to Obsidian's ignore filters because the user explicitly wants all generated notes visible in the graph.

## Corpus Construction

### Web API

Copy only tracked, supported source inputs from `wcore-web/apps/api` while preserving paths under `.tmp/graphify-input/web-api/`:

- TypeScript and JavaScript sources and tests;
- package/manifests useful to AST dependency extraction;
- no `node_modules`, `dist`, logs, environment files, databases, caches, Docker files, or generated output.

Repository discovery runs `git ls-files -z -- <pathspec>` with redirected output bytes, strict UTF-8 decoding, and NUL splitting. Any process failure, malformed/empty output, missing tracked file, or path outside this source root aborts staging. Recursive filesystem discovery is available only through the explicit non-Git fixture test mode and traverses one directory level at a time so every directory and file is checked before use.

Repository, source, staging, and traversed source paths reject reparse points in every existing component from repository root to leaf. Lexical containment is insufficient: staging aborts whenever physical ancestry inside the repository cannot be proven.

The expected initial corpus is approximately 90 files. The exact count is recorded on each sync and treated as a diagnostic, not a hard-coded invariant.

### GSheet

Graphify 0.9.18 does not recognize `.gs`. Mirror tracked `wcore-gsheet/src/**/*.gs` files under `.tmp/graphify-input/gsheet/`, changing only the extension to `.js` and preserving relative paths and bytes. Include `appsscript.json` when present.

Do not include same-stem `.js` compatibility files when the canonical `.gs` source is already mirrored. Do not use `wcore-gsheet/dist` as the corpus.

The expected initial corpus is approximately 251 files. The exact count is recorded and checked for abnormal shrinkage.

## Graph Build and Export

Use one staging root so Graphify produces one graph. The `web-api/` and `gsheet/` prefixes prevent same-name source files from collapsing into one path identity.

Headless extraction and Obsidian export are separate commands in 0.9.18:

```powershell
graphify extract K:\WCORE\.tmp\graphify-input --out K:\WCORE
graphify export obsidian --graph K:\WCORE\graphify-out\graph.json --dir K:\WCORE\generated\graphify
```

The implementation must verify these commands against installed help. Terminal shorthand flags such as `--obsidian` must not be used because those flags belong to the agent skill and are silently ignored by the headless extractor.

The wrapper sets `GRAPHIFY_OUT=K:\WCORE\graphify-out` for every extract, update, query, and watch-related process. Graphify's native `watch` has no `--out` option and is not used as the synchronization owner.

The export ownership file `.graphify_obsidian_manifest.json` must remain intact. It controls safe replacement and deletion of stale generated notes. Human notes must never be created inside `generated/graphify/`.

Graphify 0.9.18 also emits `graph.canvas`, which references every generated note and therefore becomes a misleading super-node in Obsidian's global graph. The synchronization wrapper must delete that generated Canvas before publishing the export and must remove any legacy Graphify Canvas from the vault. The Markdown notes, their wikilinks, and the ownership manifest are the complete Obsidian integration; no monolithic Canvas is retained.

## Synchronization Wrapper

`scripts/graphify-sync.ps1` owns all synchronization. Supported modes:

- `sync`: one staging, graph update/build, validation, and Obsidian export cycle;
- `watch`: monitor both source roots, debounce changes, and invoke `sync`;
- `status`: report installed version, watcher state, task state, corpus counts, graph age, and last result;
- `install-task`: create the per-user Windows fallback task;
- `uninstall-task`: remove only the WCORE Graphify task.

Every final, sibling `.next`, and sibling `.previous` tree carries the exact `.wcore-graphify-staging` ownership marker. Before building, the wrapper restores owned `.previous` when final is missing, or deletes owned `.previous` when an owned final exists. Replacement validates completed `.next`, runs the pre-swap seam, revalidates before final can move, renames final to `.previous`, validates `.next` again immediately before moving it, renames `.next` to final, and only then deletes `.previous`; a failed validation or second rename triggers immediate restoration and preserves `.previous` if restoration fails. The wrapper validates normalized expected paths, physical ancestry, reparse state, and markers before moving or recursively deleting staging trees; validation failure preserves an invalid `.next` and the prior corpus.

The aggregate `npm run test:graphify` intentionally depends on the Obsidian analyzer test delivered in Task 7. Before that task exists, Task 3 verification runs `scripts/graphify-sync.test.ps1` directly and does not add placeholder analyzer files.

Every wrapper mode sets `GRAPHIFY_QUERY_LOG_DISABLE=1`. Agents query the graph explicitly with `graphify query --graph K:\WCORE\graphify-out\graph.json` (and corresponding `path`/`explain` commands) rather than relying on Graphify's default working-directory lookup.

The wrapper uses one named Windows mutex for all modes. A scheduled sync exits successfully with a clear `already running` status when the watcher owns the mutex. This compensates for Graphify's unavailable `fcntl` lock on Windows.

Each sync:

1. Builds a fresh staging tree and atomically replaces the prior staging tree.
2. Records Web and GSheet input counts.
3. Runs initial extraction or incremental update against the staging root.
4. Validates `graph.json` before export.
5. Exports Obsidian notes.
6. Records success, duration, counts, graph node/edge totals, and errors in ignored local logs.

Validation rejects:

- missing or invalid `graph.json`;
- zero nodes or edges;
- absence of either `web-api/` or `gsheet/` source prefixes;
- an unexplained major input or graph shrink;
- incomplete Graphify extraction.

On failure, the last valid graph and generated-note export remain available. The wrapper returns non-zero except for the deliberate `already running` case.

## Automation

### OpenCode Watcher

Project-scoped OpenCode lifecycle integration starts `graphify-sync.ps1 watch` when WCORE opens and stops the owned process when the project session ends. It must not start a duplicate watcher and must not affect other projects.

### Windows Fallback Task

Create a non-elevated per-user scheduled task named `WCORE Graphify Sync`:

- trigger once at user logon;
- repeat every 60 minutes;
- run `graphify-sync.ps1 sync` from `K:\WCORE`;
- never start a second concurrent instance;
- write output to ignored local logs.

The watcher and scheduled task share the named mutex and the same pipeline.

## Native Obsidian Graph Repair

Graphify does not replace intentional documentation links.

### Current Work

For each non-archived plan/spec pair:

- add a reciprocal plan-to-spec/spec-to-plan link;
- add a project MOC link;
- list every current plan and specification in the corresponding project MOC, grouped by lifecycle status.

### Archives

Update each archive `README.md` to list every archived plan and specification as a pair. Individual archives remain under their existing directories and keep `status: archived`.

### Contracts and Bridge

- Connect remaining orphan contract/technical notes to the appropriate project MOC.
- Create `docs/reference/code-graph.md` with links to WCORE, Web, and GSheet MOCs; `graphify-out/GRAPH_REPORT.md`; and usage/status commands.
- Link the code-graph bridge from `HOME.md` and all relevant project MOCs.

No relationship is added solely to make the graph visually dense. Every native edge must represent membership, lifecycle pairing, or a real navigation relationship.

## Graph Presentation

Configure Obsidian graph groups for:

- `path:generated/graphify`;
- `path:docs/superpowers/archive OR path:wcore-gsheet/docs/superpowers/archive OR path:wcore-web/docs/archive`;
- `path:wcore-web`;
- `path:wcore-gsheet`;
- root WCORE documentation.

Generated nodes remain visible and visually distinct. Existing generated/internal ignore filters remain active for dependencies and build artifacts.

## Git Policy

Version:

- `graphify-out/graph.json`;
- `graphify-out/GRAPH_REPORT.md`;
- synchronization scripts and project OpenCode integration;
- MOC, archive-index, bridge, guide, and configuration changes.

Ignore:

- `.tmp/graphify-input/`;
- `/graphify-input/` as a legacy defense-in-depth ignore only;
- `generated/graphify/`;
- `graphify-out/cache/`;
- `graphify-out/graph.html`;
- Graphify cost, local manifest, interpreter, lock, PID, and log files.

The live watcher will regularly modify the two versioned graph artifacts. No automatic commit or staging is permitted.

## Verification

Installation and privacy:

- `graphify --version` reports `0.9.18`;
- uv owns the isolated tool installation;
- no LLM provider extra or API key is required;
- no semantic document/media corpus enters staging;
- query logging is explicitly disabled.

Corpus and graph:

- staged Web and GSheet counts are within documented expectations;
- `graph.json` parses and contains both source prefixes;
- graph has non-zero nodes and edges;
- report is generated;
- all Graphify-owned notes and the ownership manifest are exported under `generated/graphify/`;
- no `graph.canvas` remains anywhere in the Obsidian vault after synchronization.

Freshness and automation:

- a controlled source fixture change reaches staging, graph, and Obsidian export;
- restoring the source removes the test change on the next sync;
- watcher debounce produces one rebuild wave;
- hourly sync skips safely while the watcher holds the mutex;
- scheduled task registration, next-run time, and last result are visible in `status`;
- OpenCode starts only one project watcher.

Obsidian:

- native true orphans fall from 71 to no more than 2 documented exceptions;
- current and archive MOC links resolve;
- plan/spec reciprocal links resolve;
- generated graph nodes are visible and grouped separately;
- code-graph bridge links resolve.

Repository:

- no application source is changed by staging or extraction;
- ignored generated files do not appear as untracked Git files;
- only approved Graphify artifacts are versionable;
- `git diff --check` passes;
- no commit or push occurs without explicit user instruction.

## Recovery and Uninstall

Recovery commands must be documented in `docs/reference/code-graph.md`:

1. Stop the watcher.
2. Remove the scheduled task with wrapper `uninstall-task`.
3. Remove project-scoped OpenCode integration generated by Graphify.
4. Run `uv tool uninstall graphifyy`.
5. Delete ignored staging, cache, generated notes, and local logs.
6. Keep or remove versioned `graph.json` and `GRAPH_REPORT.md` by explicit user choice.

Never delete human notes through the Graphify ownership manifest or cleanup routine.

## Out of Scope

- Semantic extraction of Markdown, PDFs, images, or media.
- LLM-backed community labels or deduplication.
- Graphify MCP server deployment.
- Git hooks or automatic commits.
- Scanning the entire monorepo, dependencies, build outputs, or generated chain modules.
- Editing Graphify-generated notes manually.
