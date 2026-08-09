# Watchdog Background Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove long global-lock contention and inline maintenance from the watchdog while guaranteeing bounded fair watchdog and J1 progress.

**Architecture:** Watchdog and autoheal use separate owner-safe ScriptProperties leases whose atomic mutations alone are protected by ScriptLock. Watchdog pulse selection retains its four-slot cycle lane, deferred no-cache rows re-enter after B1 cooldown, and both watchdog J1 actions and the dedicated J1 sync use persisted circular cursors with a strict 20-write cap.

**Tech Stack:** Google Apps Script JavaScript, Node.js `assert`/`vm` tests, Advanced Sheets batch updates, RTK-wrapped npm commands.

---

### Task 1: Lock and critical-path contracts

**Files:**
- Modify: `tests/watchdog-quota-guard.test.js`
- Modify: `tests/auto-heal-new-ledgers.test.js`

- [ ] Add failing tests proving separate lease keys, stale recovery, owner-safe release, atomic short ScriptLock ownership, no inline watchdog maintenance, and watchdog progress while autoheal owns its lease.
- [ ] Run `rtk npm run test:watchdog-quota` and `rtk npm run test:auto-heal-new-ledgers`; retain the exact assertion failures as RED evidence.
- [ ] Add the shared lease primitive and wire watchdog/diagnostic entry points and autoheal to distinct leases.
- [ ] Re-run both targeted tests and confirm those assertions pass.

### Task 2: Deferred and pulse fairness

**Files:**
- Modify: `tests/watchdog-quota-guard.test.js`
- Modify: `src/16_REFRESH.gs`

- [ ] Replace the old permanent deferred exclusion test with failing cooldown/re-admission assertions.
- [ ] Add a 105-wallet simulation requiring at most five pulses per run, at least four cycle-lane pulses while backlog exists, and complete coverage within 27 runs.
- [ ] Run `rtk npm run test:watchdog-quota` and capture the RED assertions.
- [ ] Treat `[WEB_SCAN_DEFERRED] N/A` as no usable cache after B1 cooldown without bypassing the existing pulse cap or cycle reservation.
- [ ] Re-run the watchdog test to GREEN.

### Task 3: Strict fair J1 caps

**Files:**
- Modify: `tests/watchdog-quota-guard.test.js`
- Modify: `src/16_REFRESH.gs`

- [ ] Add failing simulations for 105 stale J1 values through the dedicated sync and watchdog collection paths.
- [ ] Assert no run writes more than 20 J1 cells and every stale row is selected across persisted cursor cycles.
- [ ] Run `rtk npm run test:watchdog-quota` and capture RED failures.
- [ ] Add separate persisted circular cursors, cap each path at `SYNC_J1_MAX_SYNCS_PER_RUN`, and use one Advanced Sheets batch update where available with a strict bounded fallback.
- [ ] Re-run the watchdog test to GREEN.

### Task 4: Versions and regression verification

**Files:**
- Modify: `src/16_REFRESH.gs`
- Modify: `src/16B_AUTO_HEAL.gs`
- Modify: `src/01_INIT.gs`
- Modify: `tools/validate-static.js`

- [ ] Bump watchdog to `4.16.44`, autoheal to `4.16.35`, global WCORE to `4.16.35`, and update the static rule that currently requires inline autoheal.
- [ ] Run `rtk npm run test:watchdog-quota`, `rtk npm run test:auto-heal-new-ledgers`, `rtk npm run test:web-scan-adapter`, and the CEX guard tests.
- [ ] Run `rtk npm test` and `rtk npm run validate:static`.
- [ ] Inspect `rtk git diff` and `rtk git status --short`, confirming only intended additive edits and no live, clasp, commit, or push operation.
