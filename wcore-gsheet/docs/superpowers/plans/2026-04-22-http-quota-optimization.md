# HTTP Quota Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce WCORE UrlFetch burn while preserving cache correctness and current GAS behavior.

**Architecture:** Centralize quota blocking before any network call, keep sheet reads cache-first, and use existing JSON-RPC batch paths instead of adding broad refactors. Pricing gets longer negative-cache semantics and no-fetch early exits in quota-blocked mode.

**Tech Stack:** Google Apps Script `.gs`, existing `Http`, `QuotaCircuitBreaker`, `HttpErrorGuard`, `SimpleBalanceFetcher`, `PriceManager`, static Node validation via `npm test`.

---

### Task 1: Static Contracts

**Files:**
- Modify: `scripts/validate-static.js`

- [x] Add failing static assertions for `Http.canFetchNow`, no-fetch guards in price helpers, quota-aware `26B` counter patch, RPC batch chunk helper, and variable price attempt TTL.
- [x] Run `npm test` and verify the new assertions fail before source edits.

### Task 2: No-Fetch Quota Gate

**Files:**
- Modify: `src/03_HTTP.gs`
- Modify: `src/26B_HTTP_SAVINGS.gs`
- Modify: `src/07_PRICES.gs`

- [ ] Add `Http.isBlocked()` / `Http.canFetchNow(reason)` wrappers that check `QuotaCircuitBreaker` and `HttpErrorGuard`.
- [ ] Ensure `Http.get`, `Http.post`, `Http.fetchAll`, `Http.fetchAllSafe`, and `Http.fetchWithRetry` return immediately when blocked.
- [ ] Update `26B_HTTP_SAVINGS.gs` fetch counters so blocked calls return before incrementing.
- [ ] Update direct price helper fetches to return `null` when blocked instead of reaching `UrlFetchApp`.

### Task 3: RPC Batch Discipline

**Files:**
- Modify: `src/05_RPC.gs`
- Modify: `src/09_SIMPLE_ROTATION.gs`

- [ ] Add `RpcClient.batchCallChunked(rpc, calls, maxBatchSize, timer, config)`.
- [ ] Replace local chunk loops in `SimpleBalanceFetcher._scanBatch` with the shared helper.
- [ ] Preserve existing consensus and fallback semantics.

### Task 4: Pricing Negative Cache

**Files:**
- Modify: `src/07_PRICES.gs`

- [ ] Add `PriceManager.getAttemptTs_`, `setAttemptTs_`, `isAttemptCooling_` and `cleanupAttempts` support for `{ts, ttl, reason}` entries while still accepting legacy numeric timestamps.
- [ ] Use longer TTLs for final fallback misses than temporary errors.

### Task 5: Verification and Deploy

**Files:**
- Test: `scripts/validate-static.js`

- [ ] Run `npm test`.
- [ ] Run `git status --short`.
- [ ] Commit source changes.
- [ ] Run `clasp status` with temporary `.clasp.json rootDir=src`.
- [ ] Push with `clasp push --force` and restore `.clasp.json`.
