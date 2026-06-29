# GSheet Web Scan All Chains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delegate GSheet ledger refresh scans for EVM, SVM, Cosmos, and TON to WCORE Web through `POST /api/gsheet/scan` while preserving existing GSheet formulas and local cache fallback.

**Architecture:** Add an authenticated web endpoint in the existing `gsheetPlugin`, then add a GSheet adapter that calls the endpoint and converts the response into the existing `WalletCache` shape. Integrate the adapter at the start of each VM refresh path, with kill-switch, allowlist, and no native fallback when Apps Script quota is already tripped.

**Tech Stack:** Fastify + TypeScript in `wcore-web`, Google Apps Script `.gs` runtime in `wcore-gsheet`, Node test runner, GSheet static validator.

---

### Task 1: Web `/api/gsheet/scan` Endpoint

**Files:**
- Modify: `wcore-web/apps/api/src/plugins/gsheet.ts`
- Modify: `wcore-web/apps/api/src/plugins/gsheet.test.ts`

- [ ] **Step 1: Add failing tests**

Add tests covering unauthorized access, invalid body, successful scan through an injected `scanRunner`, and `chain_not_found` mapping.

- [ ] **Step 2: Run web plugin tests**

Run: `rtk pnpm --filter @wcore/api test -- gsheet.test.ts`

Expected: new scan tests fail because `/api/gsheet/scan` does not exist.

- [ ] **Step 3: Implement endpoint**

Add `scanRunner?: (input: GsheetScanInput) => Promise<GsheetScanResult>` to plugin options. Default runner imports `@wcore/core`, validates the chain, fetches FX, uses `RedisPricingCache` when cache exists, and calls `getWalletAssets(address, chain, { cache, sharedPriceCache, customTokens, strictTokens, forceRefresh, fxRate })`.

- [ ] **Step 4: Run web plugin tests**

Run: `rtk pnpm --filter @wcore/api test -- gsheet.test.ts`

Expected: scan tests pass.

### Task 2: GSheet Web Scan Adapter

**Files:**
- Create: `wcore-gsheet/src/41_GSHEET_WEB_SCAN.gs`
- Create: `wcore-gsheet/tests/web-scan-adapter.test.js`
- Modify: `wcore-gsheet/package.json`

- [ ] **Step 1: Add failing adapter tests**

Test config gating, allowlist behavior, web payload to cache shape conversion, non-destructive invalid response, and quota-tripped fallback blocking.

- [ ] **Step 2: Run adapter test**

Run: `rtk npm run test:web-scan-adapter`

Expected: fails because adapter does not exist.

- [ ] **Step 3: Implement adapter**

Implement `_webScanEnabled_`, `_webScanAllowed_`, `_webScanBuildRequest_`, `_webScanConvertToWalletCache_`, `_webScanWallet_`, `DIAG_WEB_SCAN_STATUS`, and `DIAG_WEB_SCAN_CHAIN`.

- [ ] **Step 4: Run adapter test**

Run: `rtk npm run test:web-scan-adapter`

Expected: pass.

### Task 3: GSheet Engine Integration

**Files:**
- Modify: `wcore-gsheet/src/11_EVM_ENGINE.gs`
- Modify: `wcore-gsheet/src/14_SVM_ENGINE.gs`
- Modify: `wcore-gsheet/src/15_COSMOS_ENGINE.gs`
- Modify: `wcore-gsheet/src/TON.gs`
- Modify: `wcore-gsheet/tests/web-scan-adapter.test.js`

- [ ] **Step 1: Add failing integration tests**

Test that refresh-status paths call `_webScanWallet_` before native scan when enabled, return web status on success, fall back when web returns null and quota is OK, and do not fall back when quota is tripped.

- [ ] **Step 2: Implement minimal integration**

At the start of each VM `getRefreshStatus` flow, call the adapter with `{ address, config, forceFull, tokensRange }`. Return adapter status if successful. If adapter reports blocked due quota, return the existing quota blocked status. Otherwise continue native path.

- [ ] **Step 3: Run GSheet tests and static validation**

Run: `rtk npm test`

Expected: static validation plus watchdog/web-scan tests pass.

### Task 4: Verification And Deployment

**Files:**
- No new source files beyond Tasks 1-3.

- [ ] **Step 1: Run targeted web tests**

Run: `rtk pnpm --filter @wcore/api test -- gsheet.test.ts`

Expected: pass.

- [ ] **Step 2: Run GSheet validation**

Run: `rtk npm test` from `wcore-gsheet`

Expected: pass.

- [ ] **Step 3: Deploy web API**

Use the existing WCORE Web deployment path only after tests pass.

- [ ] **Step 4: Deploy Apps Script**

Run from `wcore-gsheet`: `rtk proxy npx @google/clasp status`, then `rtk proxy npx @google/clasp push`.

- [ ] **Step 5: Live verification**

Set `GSHEET_WEB_SCAN_ENABLED=true` and `GSHEET_WEB_SCAN_ALLOWLIST=ALL`, then validate representative chains: `Ledger - Base`, `Ledger - Solana`, `Ledger - Cosmos Hub`, and `Space - TON`.
