# HTTP Orchestration Control Implementation Plan

> **Historical/completed plan.** Kept for implementation history only; current orchestration behavior lives in `AGENTS.md` and source.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce WCORE UrlFetch usage by controlling which work is allowed to start.

**Architecture:** Keep existing fetch guards, then add an intent layer (`WCORE_HTTP_MODE`) and category budgets (`BudgetHTTP.allow`). Watchdog schedulers rank and cap work so Sheets do less pulsing during pressure.

**Tech Stack:** Google Apps Script, ScriptProperties, existing `Http`, `BudgetHTTP`, `WATCHDOG_FROM_RECAP`, `ACTIVITY_WATCHDOG`, `UPDATE_DYNAMIC_RPCS`, static validation through `npm test`.

---

### Task 1: HTTP Mode And Budgets

**Files:**
- Modify: `src/03E_QUOTA_CIRCUIT_BREAKER.gs`
- Modify: `src/03_HTTP.gs`
- Modify: `src/01_INIT.gs`

- [x] Add `WcoreHttpMode` with `CACHE_ONLY`, `NORMAL`, `RECOVERY`, `ADMIN`.
- [x] Add `SET_WCORE_HTTP_MODE(mode, TRUE)` and `WCORE_HTTP_MODE_STATUS()`.
- [x] Add `BudgetHTTP.categoryForReason()` and `BudgetHTTP.allow(categoryOrReason)`.
- [x] Make `Http.canFetchNow()` enforce both mode and budget.
- [x] Make `WCORE_IS_SAFE()` report `CACHE_ONLY` / mode blocks.

### Task 2: Scheduler Pressure Reduction

**Files:**
- Modify: `src/16_REFRESH.gs`
- Modify: `src/27_ACTIVITY_REFRESH.gs`
- Modify: `src/33_DYNAMIC_RPC.gs`

- [x] Cap Recap B1 pulses per run with `WD_MAX_PULSES_PER_RUN`.
- [x] Sort Recap actions by `_wd_actionPriority_`.
- [x] Score activity watchdog tracked wallets via `_activityPriorityScore_`.
- [x] Require admin HTTP budget before Dynamic RPC maintenance fetches.

### Task 3: Static Verification And Deploy

**Files:**
- Modify: `scripts/validate-static.js`

- [x] Add static assertions for mode, budgets, priority scheduling, and admin gating.
- [x] Run `npm test`.
- [ ] Commit.
- [ ] Run `clasp status`.
- [ ] Push Apps Script.
