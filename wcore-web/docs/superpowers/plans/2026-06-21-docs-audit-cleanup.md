# Documentation Audit Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make WCORE documentation reliable by separating current operational docs from historical snapshots and fixing stale cross-runtime instructions.

**Architecture:** Keep live docs short and authoritative. Archive or banner historical material instead of deleting it. Update source-of-truth links so root, web, gsheet, CEX, and deploy docs do not contradict each other.

**Tech Stack:** Markdown documentation, git, existing WCORE monorepo structure.

---

### Task 1: Root Documentation

**Files:**
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `package.json`

- [x] Replace duplicate volatile status in root roadmap with a cross-runtime index.
- [x] Add root README warnings for generated `@wcore/chains` and Railway deploy script usage.
- [x] Align root package metadata with private repository status.

### Task 2: GSheet Documentation

**Files:**
- Modify: `wcore-gsheet/README.md`
- Modify: `wcore-gsheet/AUDIT.md`
- Modify: `wcore-gsheet/docs/cex-sync.md`
- Modify: `wcore-gsheet/docs/*-sync.md`
- Modify: `wcore-gsheet/railway-relay/README.md`

- [x] Remove stale manual `wcore-web/src/*.gs` sync guidance.
- [x] Mark old audit as historical.
- [x] Canonicalize CEX sheet names, AC2 scope, and central hourly refresh.
- [x] Update relay endpoint list for current web multi-user and stock pricing endpoints.

### Task 3: Web Documentation

**Files:**
- Modify: `wcore-web/README.md`
- Modify: `wcore-web/DEPLOY.md`
- Modify: `wcore-web/CHANGELOG.md`
- Modify: `wcore-web/ROADMAP.md`
- Modify: `wcore-web/docs/AUDIT.md`
- Modify: `wcore-web/docs/TROUBLESHOOTING.md`
- Modify: dated snapshot docs under `wcore-web/docs/`

- [x] Refresh audit status and close already-fixed findings.
- [x] Update troubleshooting stale RealT/EVM cache guidance and broken CM link.
- [x] Move deploy history/legacy Docker guidance behind clear historical banners.
- [x] Mark dated reconciliation/RPC docs as historical snapshots.

### Task 4: Historical Plans and Specs

**Files:**
- Modify: `wcore-web/docs/superpowers/plans/*.md`
- Modify: `wcore-web/docs/superpowers/specs/CM-STRATEGY.md`
- Modify: `wcore-gsheet/docs/superpowers/plans/*.md`
- Modify: `wcore-gsheet/docs/superpowers/specs/*.md`

- [x] Add clear historical/completed banners to stale plans/specs.
- [x] Do not delete historical docs in this cleanup pass.

### Task 5: Verification and Commit

- [ ] Grep for known stale phrases and verify they are gone or marked historical.
- [ ] Review `git diff` for accidental product-code edits.
- [ ] Commit and push the documentation cleanup.
