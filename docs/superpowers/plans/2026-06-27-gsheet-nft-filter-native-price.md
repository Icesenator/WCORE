# GSheet NFT Filter Native Price Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exclude NFTs/badges from GSheet-backed portfolio scans everywhere and preserve native/token prices when GSheet expands compact wallet cache.

**Architecture:** Filter non-fungible/badge-like assets at the Web GSheet boundary before cache conversion. Restore `price_eur`/`value_eur` from `priceMap` during GSheet compact cache expansion so native prices returned by Web survive display.

**Tech Stack:** TypeScript Fastify API, Apps Script `.gs`, Node test runner.

---

### Task 1: Web GSheet Non-Fungible Filter

**Files:**
- Modify: `wcore-web/apps/api/src/plugins/gsheet.ts`
- Test: `wcore-web/apps/api/src/plugins/gsheet.test.ts`

- [ ] Add a failing test showing `/api/gsheet/scan` removes ERC721/ERC1155/badge-like tokens, keeps native and regular ERC20 tokens, and reports filtered counts in `cacheStats`.
- [ ] Implement a small `isNonPortfolioGsheetToken()` helper used by `sanitizeGsheetScanResult()`.
- [ ] Recompute `totalValueEur` after filtering and attach `cacheStats.nonFungibleFiltered`.
- [ ] Run `rtk pnpm --filter @wcore/api exec node --import ./set-test-env.js --import tsx --test src/plugins/gsheet.test.ts`.

### Task 2: GSheet Compact Cache Price Restoration

**Files:**
- Modify: `wcore-gsheet/src/04C_CACHE_GLOBAL.gs`
- Test: `wcore-gsheet/tests/packed-wallet-cache.test.js` or a focused cache test.

- [ ] Add a failing test for a compact cache with `a:[['n', balance, ...]]`, `pm:{native: price}`, and `fx`; expected expanded asset has `price_eur`, `value_eur`, and reconstructed `INFO_TOTAL` > 0.
- [ ] Update `_expand()` to apply prices from `compact.pm` to each expanded asset using `native` for `n/native` and lowercase fallback for contracts.
- [ ] Recompute `INFO_TOTAL` from restored values when generated metadata is needed.
- [ ] Run `rtk npm run test:packed-wallet-cache` and `rtk npm test` from `wcore-gsheet`.

### Task 3: Deploy And Verify Scroll

**Files:**
- Deploy API via `scripts/deploy.ps1 -Service api`.
- Push Apps Script via `rtk proxy npx @google/clasp push` from `wcore-gsheet`.

- [ ] Run API typecheck/build.
- [ ] Deploy API.
- [ ] Push GSheet code.
- [ ] Pulse `Ledger - Scroll!B1`, wait for `I1/J1`, then verify `ETH` native has price/value and NFT/badge rows are absent.
