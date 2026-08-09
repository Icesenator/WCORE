# Wallet Six-Hour Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh every managed on-chain wallet within a normal six-hour cycle while keeping the five-pulse quota cap and making every I1 status explicit.

**Architecture:** Each 10-minute watchdog run reserves four slots for the oldest ordinary wallet statuses and one slot for urgent recovery work. If no urgent candidate exists, the fifth slot joins the ordinary cycle. Cache-only branches report their known execution mode directly instead of inferring it from a process-global HTTP counter.

**Tech Stack:** Google Apps Script JavaScript, Node.js `node:test`/assert fixture tests, Google Sheets formulas and time triggers.

---

### Task 1: Make Cache-Only Status Deterministic

**Files:**
- Modify: `wcore-gsheet/tests/web-scan-adapter.test.js`
- Modify: `wcore-gsheet/src/10A_BASE_ENGINE.gs:528-560`

- [ ] **Step 1: Add a failing concurrency test**

Assert that `BaseEngine.wrapCacheOnlyMarker('2026-07-19 08:00:00', before)` returns `[CACHE_ONLY] 2026-07-19 08:00:00` even if the global HTTP counter increases between snapshot and return.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node wcore-gsheet/tests/web-scan-adapter.test.js`

Expected: the concurrent-counter case returns a plain timestamp.

- [ ] **Step 3: Implement explicit cache-only output**

Make `wrapCacheOnlyMarker` idempotently return `[CACHE_ONLY] ` plus the supplied status. Preserve already-prefixed cache-only values and the existing function signature for callers.

- [ ] **Step 4: Run focused status tests**

Run: `node wcore-gsheet/tests/web-scan-adapter.test.js`

Expected: all assertions pass and no cache-only branch can emit a raw timestamp.

### Task 2: Guarantee Fair Six-Hour Scheduling

**Files:**
- Modify: `wcore-gsheet/tests/watchdog-quota-guard.test.js`
- Modify: `wcore-gsheet/src/16_REFRESH.gs:103-112,1052-1059,1077-1255`

- [ ] **Step 1: Add failing scheduler tests**

Build 123 healthy wallet fixtures with ordered I1 ages plus urgent error and partial candidates. Simulate 31 watchdog runs and assert every ordinary wallet is selected at least once, no run exceeds five pulses, at least four slots serve the oldest ordinary wallets, and at most one urgent slot is reserved per run.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node wcore-gsheet/tests/watchdog-quota-guard.test.js`

Expected: current priority sorting lets urgent/partial candidates consume all five slots.

- [ ] **Step 3: Implement two-lane selection**

Classify healthy/stale candidates into the age-cycle lane and retry candidates into the urgent lane. Wallets with no usable cache (`[NO_CACHE]`, blank I1, or `[CACHE_ONLY] ... N/A`) participate in both lanes so an initial/recovery backlog can use all five slots while B1 recency still moves each attempted wallet to the back. Web errors and partial cycles remain urgent-only. Select the four oldest cycle candidates first, then one urgent candidate; when a lane is short, fill unused capacity from the other lane. Keep the total at `WD_MAX_PULSES_PER_RUN = 5`, retain Web-error backoff and quota suppression, and deduplicate before lane selection.

- [ ] **Step 4: Run watchdog tests**

Run: `node wcore-gsheet/tests/watchdog-quota-guard.test.js`

Expected: all fairness, backoff, rollback, and cap assertions pass.

### Task 3: Verify and Deploy

**Files:**
- Verify: `wcore-gsheet/src/10A_BASE_ENGINE.gs`
- Verify: `wcore-gsheet/src/16_REFRESH.gs`
- Verify: `wcore-gsheet/tests/*.test.js`

- [ ] **Step 1: Run the complete GSheet suite**

Run from `wcore-gsheet`: `npm test`

Expected: all tests and static validation pass.

- [ ] **Step 2: Deploy safely**

Run from `wcore-gsheet`: `powershell -NoProfile -ExecutionPolicy Bypass -File safe-push.ps1`

Expected: Apps Script push succeeds and `.clasp.json` is restored.

- [ ] **Step 3: Verify live read-only behavior**

Read `Recap Portfolio!A:G` after successive watchdog runs. Expected: no new raw I1 timestamps, no run pulses more than five wallets, and oldest wallets advance through the cycle.
