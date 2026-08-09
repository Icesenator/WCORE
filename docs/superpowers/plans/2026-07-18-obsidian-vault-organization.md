---
type: plan
status: done
project: wcore
date: 2026-07-18
---

# Obsidian Vault Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Physically organize the repository-root Obsidian vault by project without breaking Git, agent, Superpowers, Markdown, or wikilink paths.

**Architecture:** Keep repository contract files and all `docs/superpowers/` paths stable. Organize movable documentation inside each project's existing `docs/` directory, add one local MOC per project, retain `HOME.md` as the global dashboard, and suppress generated/internal directories from Obsidian search and graph indexing.

**Tech Stack:** Markdown, YAML frontmatter, Obsidian core configuration, Obsidian MCP move/link/query operations, Git and repository text search.

---

## File Map

**Create:**
- `docs/README.md`: WCORE documentation MOC.
- `wcore-web/docs/README.md`: Web documentation MOC.
- `wcore-gsheet/docs/README.md`: GSheet documentation MOC.

**Move:**
- `docs/AUDIT.md` -> `docs/audits/AUDIT.md`
- `docs/obsidian-vault.md` -> `docs/guides/obsidian-vault.md`
- `wcore-web/docs/AUDIT.md` -> `wcore-web/docs/audits/AUDIT.md`
- `wcore-web/docs/TROUBLESHOOTING.md` -> `wcore-web/docs/guides/TROUBLESHOOTING.md`
- `wcore-web/docs/defi-position-engine.md` -> `wcore-web/docs/reference/defi-position-engine.md`
- `wcore-web/docs/fx-cascade.md` -> `wcore-web/docs/reference/fx-cascade.md`
- `wcore-web/docs/rpc-harmonization-2026-06-03.md` -> `wcore-web/docs/reference/rpc-harmonization-2026-06-03.md`
- `wcore-web/docs/wcore-gsheet-to-web-reconciliation-2026-06-03.md` -> `wcore-web/docs/reference/wcore-gsheet-to-web-reconciliation-2026-06-03.md`
- `wcore-gsheet/docs/cex-sync.md` -> `wcore-gsheet/docs/integrations/cex/cex-sync.md`
- `wcore-gsheet/docs/binance-sync.md` -> `wcore-gsheet/docs/integrations/cex/binance-sync.md`
- `wcore-gsheet/docs/bitfinex-sync.md` -> `wcore-gsheet/docs/integrations/cex/bitfinex-sync.md`
- `wcore-gsheet/docs/bitpanda-sync.md` -> `wcore-gsheet/docs/integrations/cex/bitpanda-sync.md`
- `wcore-gsheet/docs/bybit-eu-sync.md` -> `wcore-gsheet/docs/integrations/cex/bybit-eu-sync.md`
- `wcore-gsheet/docs/coinbase-sync.md` -> `wcore-gsheet/docs/integrations/cex/coinbase-sync.md`
- `wcore-gsheet/docs/okx-sync.md` -> `wcore-gsheet/docs/integrations/cex/okx-sync.md`
- `wcore-gsheet/docs/rpc-batch-limits.md` -> `wcore-gsheet/docs/reference/rpc-batch-limits.md`
- `wcore-gsheet/docs/top-marketcap-google-finance.md` -> `wcore-gsheet/docs/reference/top-marketcap-google-finance.md`

**Modify:**
- `.obsidian/app.json`: add Obsidian ignore filters.
- `HOME.md`: replace ambiguous/broken wikilinks and link the three local MOCs.
- Any repository file that contains a concrete old path listed above.
- Frontmatter in managed plans/specs whose current status was inferred without evidence.
- `journal/2026-07-18.md`: record the completed migration.

**Must not move:**
- Root/project `README.md`, `AGENTS.md`, `CHANGELOG.md`, `ROADMAP.md`, `CONTRIBUTING.md`, `DEPLOY.md`, `TESTING.md`, and `wcore-gsheet/AUDIT.md`.
- Any path below `docs/superpowers/`, `wcore-web/docs/superpowers/`, or `wcore-gsheet/docs/superpowers/`.

### Task 1: Capture the Baseline and Configure Obsidian Scope

**Files:**
- Modify: `.obsidian/app.json`

- [ ] **Step 1: Capture the pre-migration worktree**

Run:

```powershell
rtk git status
rtk git diff --stat
```

Expected: the existing Obsidian/frontmatter work remains visible; no files are staged or reverted.

- [ ] **Step 2: Capture baseline link and metadata behavior**

Use `obsidian_get_links` for `HOME.md`, then use `obsidian_query_notes` with:

```json
{
  "where": [
    {"key": "status", "op": "eq", "value": "active"},
    {"key": "type", "op": "eq", "value": "plan"}
  ],
  "select": ["project", "date"],
  "sort": "path",
  "limit": 100
}
```

Expected: baseline output includes the currently broken/ambiguous HOME links and all plans currently marked active.

- [ ] **Step 3: Add ignore filters to Obsidian configuration**

Change `.obsidian/app.json` to:

```json
{
  "promptDelete": false,
  "userIgnoreFilters": [
    ".git/",
    ".claude/",
    ".omc/",
    ".playwright-mcp/",
    "node_modules/",
    ".next/",
    "coverage/",
    ".tmp/",
    ".backups/",
    "backups/"
  ]
}
```

- [ ] **Step 4: Verify the JSON configuration**

Run:

```powershell
rtk node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('.obsidian/app.json','utf8')); console.log('valid')"
```

Expected: `valid`.

### Task 2: Organize WCORE Documentation

**Files:**
- Move: `docs/AUDIT.md` -> `docs/audits/AUDIT.md`
- Move: `docs/obsidian-vault.md` -> `docs/guides/obsidian-vault.md`
- Create: `docs/README.md`

- [ ] **Step 1: Record backlinks before moving WCORE notes**

Use `obsidian_get_backlinks` for both source paths with `includeContext: true` and `limit: 500`.

Expected: all sources that need automatic or manual path repair are recorded.

- [ ] **Step 2: Move both WCORE notes with Obsidian-aware operations**

Use `obsidian_move_note` exactly as follows:

```text
docs/AUDIT.md -> docs/audits/AUDIT.md
docs/obsidian-vault.md -> docs/guides/obsidian-vault.md
```

Expected: destination parent directories are created and existing wikilinks are updated.

- [ ] **Step 3: Create the WCORE documentation MOC**

Create `docs/README.md` with this content:

```markdown
---
type: moc
status: active
project: wcore
---

# WCORE Documentation

## Guides

- [[docs/guides/obsidian-vault|Obsidian vault guide]]

## Reference

- [[README|Repository overview]]
- [[ROADMAP|WCORE roadmap]]

## Active Work

- Plans: `docs/superpowers/plans/`
- Specifications: `docs/superpowers/specs/`

## Audits

- [[docs/audits/AUDIT|WCORE audit]]

## Archives

- [[docs/superpowers/archive/README|Superpowers archive]]
```

- [ ] **Step 4: Search for stale WCORE paths**

Use repository content search for both patterns:

```text
docs/AUDIT.md
docs/obsidian-vault.md
```

Expected: no stale path remains after repairing concrete consumers. Do not alter historical prose that merely names a document without using its path.

### Task 3: Organize Web Documentation

**Files:**
- Move six notes listed in the File Map into `guides/`, `reference/`, and `audits/`.
- Create: `wcore-web/docs/README.md`

- [ ] **Step 1: Record backlinks for all six Web notes**

Use `obsidian_get_backlinks` on each old Web path with `includeContext: true` and `limit: 500`.

Expected: each source reference is known before migration.

- [ ] **Step 2: Move the Web notes**

Use one `obsidian_move_note` call per mapping:

```text
wcore-web/docs/AUDIT.md -> wcore-web/docs/audits/AUDIT.md
wcore-web/docs/TROUBLESHOOTING.md -> wcore-web/docs/guides/TROUBLESHOOTING.md
wcore-web/docs/defi-position-engine.md -> wcore-web/docs/reference/defi-position-engine.md
wcore-web/docs/fx-cascade.md -> wcore-web/docs/reference/fx-cascade.md
wcore-web/docs/rpc-harmonization-2026-06-03.md -> wcore-web/docs/reference/rpc-harmonization-2026-06-03.md
wcore-web/docs/wcore-gsheet-to-web-reconciliation-2026-06-03.md -> wcore-web/docs/reference/wcore-gsheet-to-web-reconciliation-2026-06-03.md
```

- [ ] **Step 3: Create the Web documentation MOC**

Create `wcore-web/docs/README.md` with:

```markdown
---
type: moc
status: active
project: web
---

# WCORE Web Documentation

## Guides

- [[wcore-web/README|Application overview]]
- [[wcore-web/CONTRIBUTING|Contributing]]
- [[wcore-web/DEPLOY|Deployment]]
- [[wcore-web/TESTING|Testing]]
- [[wcore-web/docs/guides/TROUBLESHOOTING|Troubleshooting]]

## Reference

- [[wcore-web/docs/reference/defi-position-engine|DeFi position engine]]
- [[wcore-web/docs/reference/fx-cascade|FX cascade]]
- [[wcore-web/docs/reference/rpc-harmonization-2026-06-03|RPC harmonization]]
- [[wcore-web/docs/reference/wcore-gsheet-to-web-reconciliation-2026-06-03|GSheet/Web reconciliation]]

## Active Work

- [[wcore-web/ROADMAP|Roadmap]]
- Plans: `wcore-web/docs/superpowers/plans/`
- Specifications: `wcore-web/docs/superpowers/specs/`

## Audits

- [[wcore-web/docs/audits/AUDIT|Web audit]]
- [[wcore-web/security-reports/WCORE-SECURITY-REPORT|Security report]]

## Archives

- [[wcore-web/docs/archive/README|Documentation archive]]
```

- [ ] **Step 4: Repair stale Web paths**

Search the whole repository for each old Web path from the File Map. Update Markdown links, wikilinks, and concrete path references to the new paths.

Expected: no old path remains in a concrete consumer.

### Task 4: Organize GSheet Documentation

**Files:**
- Move nine notes listed in the File Map into `integrations/cex/` and `reference/`.
- Create: `wcore-gsheet/docs/README.md`

- [ ] **Step 1: Record backlinks for all nine GSheet notes**

Use `obsidian_get_backlinks` for each source path with `includeContext: true` and `limit: 500`.

- [ ] **Step 2: Move the GSheet notes**

Use one `obsidian_move_note` call for each GSheet mapping in the File Map.

Expected: destination directories are created automatically and wikilinks are updated.

- [ ] **Step 3: Create the GSheet documentation MOC**

Create `wcore-gsheet/docs/README.md` with:

```markdown
---
type: moc
status: active
project: gsheet
---

# WCORE GSheet Documentation

## Guides

- [[wcore-gsheet/README|Project overview]]
- [[wcore-gsheet/ROADMAP|Roadmap]]

## CEX Integrations

- [[wcore-gsheet/docs/integrations/cex/cex-sync|CEX sync overview]]
- [[wcore-gsheet/docs/integrations/cex/binance-sync|Binance]]
- [[wcore-gsheet/docs/integrations/cex/bitfinex-sync|Bitfinex]]
- [[wcore-gsheet/docs/integrations/cex/bitpanda-sync|Bitpanda]]
- [[wcore-gsheet/docs/integrations/cex/bybit-eu-sync|Bybit EU]]
- [[wcore-gsheet/docs/integrations/cex/coinbase-sync|Coinbase]]
- [[wcore-gsheet/docs/integrations/cex/okx-sync|OKX]]

## Reference

- [[wcore-gsheet/docs/reference/rpc-batch-limits|RPC batch limits]]
- [[wcore-gsheet/docs/reference/top-marketcap-google-finance|Top market cap with Google Finance]]

## Active Work

- Plans: `wcore-gsheet/docs/superpowers/plans/`
- Specifications: `wcore-gsheet/docs/superpowers/specs/`

## Audits

- [[wcore-gsheet/AUDIT|GSheet audit]]
- [[wcore-gsheet/security-reports/WCORE-SECURITY-REPORT|Security report]]

## Archives

- [[wcore-gsheet/docs/superpowers/archive/README|Superpowers archive]]
```

- [ ] **Step 4: Repair stale GSheet paths**

Search the whole repository for every old GSheet path in the File Map. Update concrete path references.

Expected: no stale source path remains.

### Task 5: Normalize Metadata Conservatively

**Files:**
- Modify: managed plans and specifications under the three non-archive `docs/superpowers/` trees.

- [ ] **Step 1: Inventory plans currently marked active**

Use `obsidian_query_notes` for `status=active` and `type=plan`, selecting `project`, `date`, and `mtime`.

Expected: produce a review list, not an automatic status change.

- [ ] **Step 2: Confirm recent WCORE work from repository evidence**

For each WCORE plan currently marked active, search `ROADMAP.md`, recent commit messages, and related specifications for evidence that work is current.

Set status using `obsidian_patch_frontmatter`:

```text
active  = clear evidence of current implementation
planned = validated but not started
done    = delivered and still current
review  = insufficient evidence
```

- [ ] **Step 3: Review Web and GSheet plans with the same rule**

Apply the same evidence test using each project's `ROADMAP.md`, `CHANGELOG.md`, and recent commits. Never infer `active` solely because a note is outside an archive directory.

- [ ] **Step 4: Normalize moved document metadata**

Patch moved notes as follows while preserving existing `date` values:

```text
docs/guides/*                         type=guide, project=wcore, status=active
docs/audits/*                         type=audit, project=wcore, status=active
wcore-web/docs/guides/*               type=guide, project=web, status=active
wcore-web/docs/reference/*            type=reference, project=web, status=active
wcore-web/docs/audits/*               type=audit, project=web, status=active
wcore-gsheet/docs/integrations/cex/*  type=reference, project=gsheet, status=active
wcore-gsheet/docs/reference/*         type=reference, project=gsheet, status=active
```

### Task 6: Rebuild the Global Dashboard

**Files:**
- Modify: `HOME.md`

- [ ] **Step 1: Replace ambiguous links with exact full paths**

Use unescaped Obsidian aliases, for example:

```markdown
[[wcore-web/README|README]]
[[wcore-gsheet/ROADMAP|ROADMAP]]
```

Do not use `\|` inside wikilinks. Replace audit and technical-document links with their migrated full paths.

- [ ] **Step 2: Add the three documentation MOCs near the top**

Add:

```markdown
## Documentation par projet

- [[docs/README|WCORE]]
- [[wcore-web/docs/README|WCORE Web]]
- [[wcore-gsheet/docs/README|WCORE GSheet]]
```

- [ ] **Step 3: Make plan sections status-accurate**

List only plans confirmed as `active`. Add a separate `À revoir` section for plans with `status: review`, grouped by project.

- [ ] **Step 4: Verify every HOME link**

Use `obsidian_get_links` on `HOME.md`.

Expected: every intended note link reports `resolved: true`. Plain code paths may remain non-links.

### Task 7: End-to-End Verification

**Files:**
- Modify: `journal/2026-07-18.md`

- [ ] **Step 1: Check obsolete paths globally**

Run one repository content search covering every source path in the File Map.

Expected: zero concrete references to old paths.

- [ ] **Step 2: Verify moved-note links and backlinks**

Use `obsidian_get_links` on all three MOCs and each moved note. Use `obsidian_get_backlinks` on each MOC.

Expected: all MOC wikilinks resolve; moved notes remain connected where references exist.

- [ ] **Step 3: Verify metadata queries**

Run `obsidian_query_notes` for each project and each managed type. Also query `status=review` and `status=active` plans separately.

Expected: no managed note is missing `type`, `project`, or `status`; active and review lists are distinct.

- [ ] **Step 4: Verify daily notes**

Use `obsidian_get_periodic_note` for `2026-07-18` without creating a new note.

Expected: `journal/2026-07-18.md` exists and the configured template remains `templates/daily-log.md`.

- [ ] **Step 5: Log the migration**

Append under the daily note's `Sessions` heading:

```markdown
### Rangement du vault Obsidian
- Documentation organisée par projet avec MOC WCORE, Web et GSheet
- Guides, références, audits et intégrations déplacés avec correction des liens
- Métadonnées de cycle de vie revues sans supposer que tous les plans sont actifs
- Recherche et graphe nettoyés des dossiers générés/internes
```

- [ ] **Step 6: Inspect the final worktree**

Run:

```powershell
rtk git status
rtk git diff --stat
rtk git diff
```

Expected: only intended documentation, Obsidian configuration, metadata, and repaired path references changed. No source file content changed except a necessary old documentation path reference.

- [ ] **Step 7: Report without committing**

Summarize moved files, created MOCs, metadata decisions, resolved-link checks, and residual risks. Do not stage or commit unless the user explicitly requests it.
