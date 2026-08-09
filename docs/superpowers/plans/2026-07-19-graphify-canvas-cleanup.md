# Graphify Canvas Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Graphify Markdown notes searchable in Obsidian without retaining a monolithic `graph.canvas` super-node.

**Architecture:** Let Graphify export its normal Obsidian payload, then remove the generated Canvas before validating and publishing the export. The ownership manifest remains mandatory. Production cleanup is restricted to the generated export directory; the known `--no-label` artifact is test pollution handled by fixing fixture isolation and one-time verified cleanup.

**Tech Stack:** PowerShell 5.1, Graphify 0.9.18, Obsidian Canvas JSON, fixture-based PowerShell tests.

---

### Task 1: Remove Canvas From Published Exports

**Files:**
- Modify: `scripts/graphify-sync.test.ps1`
- Modify: `scripts/graphify-sync.ps1:1353-1368`
- Modify: `docs/superpowers/plans/2026-07-18-graphify-obsidian-integration.md`

- [x] **Step 1: Write failing orchestration tests**

Make the fake export write both required manifest and `graph.canvas`, then assert that a successful sync retains the manifest but removes the Canvas. Add a pre-existing legacy Canvas fixture and assert cleanup removes it without touching unrelated files.

```powershell
Assert-True (Test-Path -LiteralPath (Join-Path $syncGeneratedPath '.graphify_obsidian_manifest.json')) 'successful export retains ownership manifest'
Assert-True (-not (Test-Path -LiteralPath (Join-Path $syncGeneratedPath 'graph.canvas'))) 'successful export removes monolithic canvas'
```

- [x] **Step 2: Run the fixture test and confirm RED**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/graphify-sync.test.ps1`

Expected: failure because `Invoke-GraphifySync` currently requires and retains `graph.canvas`.

- [x] **Step 3: Implement minimal cleanup**

After successful export, validate `.graphify_obsidian_manifest.json`, safely remove `generated/graphify/graph.canvas` when present, and stop requiring Canvas as an export artifact. Make fake export writes reject relative output paths and accept only the exact export command shape so `--no-label` can never become a fixture output directory. Do not add root-artifact cleanup to the production wrapper.

- [x] **Step 4: Run Graphify wrapper tests** — 604 assertions PASS

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/graphify-sync.test.ps1`

Expected: all fixture and RealCorpus assertions pass; no `--no-label/` directory is recreated.

- [x] **Step 5: Remove the current unwanted artifact** — `K:\WCORE\--no-label` n'existe plus (migre)

Delete `K:\WCORE\--no-label\graph.canvas`, its empty fixture manifest, and the now-empty `K:\WCORE\--no-label` directory after ownership checks.

- [x] **Step 6: Verify Obsidian state** — aucun `graph.canvas` dans `generated/graphify`

Run a workspace Canvas glob and `obsidian_wcore_search(query="graph.canvas")`. Expected: no Canvas file exists; documentation mentions may remain.
