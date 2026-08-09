---
type: spec
status: done
project: wcore
date: 2026-07-18
---

# Obsidian Vault Organization Design

## Goal

Organize the repository-root Obsidian vault by project while preserving the paths required by GitHub, development tooling, and Superpowers workflows.

## Constraints

- `K:\WCORE` remains the Obsidian vault root.
- Documentation is organized first by project: WCORE, Web, and GSheet.
- Contract files such as `README.md`, `AGENTS.md`, `CHANGELOG.md`, `ROADMAP.md`, `CONTRIBUTING.md`, `DEPLOY.md`, and `TESTING.md` remain at their current project roots.
- `docs/superpowers/{plans,specs}` paths remain stable because skills create and consume files there.
- Code, generated files, and agent-internal material are not moved as part of this work.
- Existing unrelated working-tree changes must not be reverted or overwritten.

## Target Structure

```text
WCORE/
|-- HOME.md
|-- journal/
|-- templates/
|-- docs/
|   |-- README.md
|   |-- guides/
|   |-- reference/
|   |-- audits/
|   |-- superpowers/
|   |   |-- plans/
|   |   |-- specs/
|   |   `-- archive/
|   `-- archive/
|-- wcore-web/
|   |-- README.md, AGENTS.md, CHANGELOG.md, ROADMAP.md, ...
|   `-- docs/
|       |-- README.md
|       |-- guides/
|       |-- reference/
|       |-- audits/
|       |-- superpowers/
|       `-- archive/
`-- wcore-gsheet/
    |-- README.md, AGENTS.md, CHANGELOG.md, ROADMAP.md, ...
    `-- docs/
        |-- README.md
        |-- integrations/cex/
        |-- reference/
        |-- audits/
        |-- superpowers/
        `-- archive/
```

Folder names remain semantic rather than numerically prefixed. MOCs and Obsidian favorites provide navigation order without adding artificial prefixes to repository paths.

## Document Migration

### WCORE

- Move `docs/AUDIT.md` to `docs/audits/AUDIT.md`.
- Move `docs/obsidian-vault.md` to `docs/guides/obsidian-vault.md`.
- Create `docs/README.md` as the WCORE documentation MOC.
- Keep `docs/superpowers/` unchanged.

### Web

- Move `wcore-web/docs/AUDIT.md` to `wcore-web/docs/audits/AUDIT.md`.
- Move `wcore-web/docs/TROUBLESHOOTING.md` to `wcore-web/docs/guides/TROUBLESHOOTING.md`.
- Move the following documents to `wcore-web/docs/reference/`:
  - `defi-position-engine.md`
  - `fx-cascade.md`
  - `rpc-harmonization-2026-06-03.md`
  - `wcore-gsheet-to-web-reconciliation-2026-06-03.md`
- Create `wcore-web/docs/README.md` as the Web documentation MOC.
- Keep `wcore-web/docs/superpowers/` and `wcore-web/docs/archive/` structurally unchanged.

### GSheet

- Move CEX integration documents to `wcore-gsheet/docs/integrations/cex/`:
  - `cex-sync.md`
  - `binance-sync.md`
  - `bitfinex-sync.md`
  - `bitpanda-sync.md`
  - `bybit-eu-sync.md`
  - `coinbase-sync.md`
  - `okx-sync.md`
- Move `rpc-batch-limits.md` and `top-marketcap-google-finance.md` to `wcore-gsheet/docs/reference/`.
- Create `wcore-gsheet/docs/README.md` as the GSheet documentation MOC.
- Keep `wcore-gsheet/docs/superpowers/` structurally unchanged.
- Keep `wcore-gsheet/AUDIT.md` at the project root because it is an established contract file referenced alongside the project roadmap and changelog.

## Navigation Model

`HOME.md` is the global dashboard. It links to:

- the root project files;
- the WCORE, Web, and GSheet documentation MOCs;
- current roadmaps and audits;
- active and review-required plans;
- the current daily note and vault guide.

Each `docs/README.md` provides a local project view with these sections:

1. Getting started and operational guides
2. Technical reference
3. Active plans and specifications
4. Audits
5. Archives

Recommended Obsidian favorites are `HOME.md`, the current daily note, the three roadmaps, and the three documentation MOCs.

## Search and Graph Scope

Obsidian ignore filters exclude content that is useful to tools but noisy as knowledge:

- `.git/`
- `.claude/`
- `.omc/`
- `.playwright-mcp/`
- `node_modules/`
- `.next/`
- build, coverage, temporary, and backup output

Archives remain searchable unless they are generated internals. The global graph is supplementary; project MOCs, backlinks, properties, and local graphs are the primary navigation mechanisms.

## Metadata Model

Managed notes use:

```yaml
type: plan | spec | guide | reference | audit | moc | daily-log
project: wcore | web | gsheet
status: draft | planned | active | done | archived | superseded | review
date: YYYY-MM-DD
```

Status meanings:

- `draft`: not yet validated.
- `planned`: validated but not started.
- `active`: confirmed current work.
- `done`: delivered but retained in the current documentation area.
- `archived`: physically stored under an archive directory.
- `superseded`: replaced by a newer note.
- `review`: state cannot be established safely during migration.

Migration must not infer that every non-archived plan is active. Recent evidence in roadmaps, commits, or linked plans is required to retain `active`; uncertain older plans become `review`.

## Migration Safety

- Use Obsidian-aware move operations for Markdown notes so wikilinks are updated.
- Search the whole repository for each old path because Markdown links, scripts, and tool instructions may not be tracked by Obsidian.
- Repair all old-path references after moves.
- Do not introduce compatibility copies or duplicate documents. Update concrete consumers instead.
- Do not modify source files except where a documentation path reference must be corrected.
- Preserve frontmatter and note bodies during moves.

## Validation

The migration is complete when:

- no repository search result references an obsolete moved path;
- no newly unresolved wikilink exists in moved notes or MOCs;
- `query_notes` returns expected results by `project`, `type`, and `status`;
- `HOME.md` and all three project MOCs resolve their principal links;
- daily-note creation still uses `journal/` and `templates/daily-log.md`;
- ignored generated folders no longer pollute Obsidian search and graph results;
- the Git diff contains only intended documentation, Obsidian configuration, and repaired path references;
- no contract file or `docs/superpowers/` path moved.

## Out of Scope

- Splitting large contract files such as `ROADMAP.md`, `AGENTS.md`, or `CHANGELOG.md`.
- Reorganizing `.omc` research artifacts.
- Installing community plugins.
- Moving the vault root or creating a separate knowledge repository.
- Rewriting document content beyond metadata, navigation, and path corrections required by the migration.
