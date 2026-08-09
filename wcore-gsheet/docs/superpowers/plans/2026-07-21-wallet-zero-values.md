# Wallet Zero Values Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist useful degraded scans, restore missing valuations, and expose unavailable chains as errors instead of verified zero balances.

**Architecture:** Fix data loss at the GSheet adapter boundary, preserve pricing metadata and precision in the core engines, then correct canonical chain configuration. Treat disabled or fully unreachable chains as explicit degraded errors and propagate those errors into Recap Portfolio and Strat.

**Tech Stack:** Google Apps Script, Node.js, TypeScript, Fastify, Google Sheets formulas, Node test runner.

---

### Task 1: Save A Useful First Degraded Scan

**Files:**
- Modify: `src/41_GSHEET_WEB_SCAN.gs:783-887`
- Test: `tests/web-scan-adapter.test.js`

- [ ] Add a failing adapter test using a degraded BSC payload with a positive token and no `__walletCache`; assert one save and `WEB_SCAN_DEGRADED`.
- [ ] Run `rtk npm run test:web-scan-adapter`; verify the new assertion fails with `WEB_SCAN_PRESERVED` and zero saves.
- [ ] Load `existingCache` before the preservation decision and call `_webScanShouldPreserveExistingCache_(payload, existingCache, config)`. Preserve or merge only when that existing cache is useful; otherwise save the incoming converted cache through the normal path.
- [ ] Run `rtk npm run test:web-scan-adapter`; expect all adapter tests to pass.

### Task 2: Preserve Fogo Stablecoin Metadata

**Files:**
- Modify: `wcore-web/packages/core/src/engines/svm.ts:27-60,205-236,455-487`
- Test: `wcore-web/packages/core/src/engines/svm.test.ts`

- [ ] Add a failing Fogo test whose known USDC metadata contains `isStable: true` and `peg: "USD"`; assert the returned token price equals the supplied FX rate and no `USDC price: NO_PRICE` error exists.
- [ ] Run `rtk pnpm --filter @wcore/core test -- svm.test.ts`; verify the test fails with a null price.
- [ ] Extend `SvmTokenMetadata` with `isStable?: boolean` and `peg?: string`, copy those fields in `getKnownSvmTokenMetadata()`, and pass the selected metadata to `priceSvmToken()`.
- [ ] Set `PricingToken.isStable` and `PricingToken.peg` from that metadata without adding chain-specific engine logic.
- [ ] Run the focused SVM test and `rtk pnpm --filter @wcore/core typecheck`; expect both to pass.

### Task 3: Keep Sub-Cent Native Prices

**Files:**
- Modify: `wcore-web/packages/core/src/engines/evm-types.ts:100-102`
- Modify: `wcore-web/packages/core/src/engines/evm-pricing.ts:46-74`
- Test: `wcore-web/packages/core/src/engines/evm-pricing.test.ts`

- [ ] Add a failing `priceNative` test with oracle price `0.000456763` and a positive CAMP balance; assert `priceEur === 0.000456763` and `valueEur` remains two-decimal money-rounded.
- [ ] Run `rtk pnpm --filter @wcore/core test -- evm-pricing.test.ts`; verify `priceEur` is currently zero.
- [ ] Add a narrowly named price precision helper that rounds to 12 decimal places, use it for unit prices, and keep `roundMoney()` for total values.
- [ ] Run the focused pricing test and core typecheck; expect both to pass.

### Task 4: Correct Canonical BNB And Monad Configuration

**Files:**
- Modify: `src/BSC.gs:6-11`
- Modify: `src/MONAD.gs:6-9`
- Regenerate: `dist/chains/BSC.ts`
- Regenerate: `dist/chains/MONAD.ts`
- Test: `tools/test-phase3-chain-port.cjs` or a focused chain-config test

- [ ] Add assertions that BSC exports bounded log range `5000` with current Binance dataseed endpoints and Monad exports `MAX_LOG_RANGE: 1000`.
- [ ] Run `rtk npm run test:phase3-chains`; verify the source/generated mismatch is reported.
- [ ] Update canonical `.gs` configs: BSC gets the working dataseed ordering and `MAX_LOG_RANGE: 5000`; Monad gets `MAX_LOG_RANGE: 1000`.
- [ ] Run `rtk npm run build:chains`, then rerun phase-3 chain tests.

### Task 5: Represent Disabled And Unreachable Chains Honestly

**Files:**
- Modify: `wcore-web/apps/api/src/plugins/gsheet.ts:818-849,918-955`
- Modify: `wcore-web/packages/core/src/engines/evm-types.ts:69-72`
- Test: `wcore-web/apps/api/src/plugins/gsheet.test.ts`
- Test: `wcore-web/packages/core/src/engines/evm.test.ts`
- Modify: `src/SYNDICATE_COMMONS.gs:32-52`

- [ ] Add an API test proving a chain with `FLAGS.DISABLE_CHAIN` returns an explicit `chain_disabled` degraded payload without invoking the wallet engine.
- [ ] Add a core test proving a balance decision with `source: "none"` emits a `balance unavailable` error instead of silently representing zero.
- [ ] Run the focused API and EVM tests; verify both fail before implementation.
- [ ] Guard `defaultScanRunner()` against `DISABLE_CHAIN` and reuse the existing degraded-200 route fallback to surface `[WEB_SCAN_ERROR] chain_disabled`.
- [ ] Change `pushBalanceDecisionError()` so `source === "none"` emits `[DEGRADED] <symbol> balance unavailable: <reason>`.
- [ ] Remove the two invalid Syndicate fallback endpoints, retain the documented official endpoint, and keep the chain enabled. Full official RPC failure must therefore produce an explicit unavailable error while allowing old cache preservation.
- [ ] Run focused API/core tests and typechecks; expect all to pass.

### Task 6: Propagate Errors To Recap Portfolio And Strat

**Files:**
- Update spreadsheet: `Recap Portfolio!CA2`
- Update spreadsheet: `Strat!AY1`

- [ ] Extend the existing `CA2` MAP formula so an underlying wallet `I1` containing `WEB_SCAN_ERROR`, `chain_disabled`, or `balance unavailable` returns an `Erreur (...)` value before counting `V` cells.
- [ ] Set `Strat!AY1` to `=IF(COUNTIF('Recap Portfolio'!CA:CA;"*Erreur*")>0;"V";IF('Portefeuille Crypto'!P1>=1;"X";"V"))`.
- [ ] Read both cells with formula rendering and verify the stored formulas exactly match the intended rules.

### Task 7: Verify And Deploy

**Files:**
- Verify all modified source and generated files.

- [ ] Run `rtk npm test` in `wcore-gsheet`.
- [ ] Run `rtk pnpm --filter @wcore/core test`, `rtk pnpm --filter @wcore/core typecheck`, and the focused API GSheet tests in `wcore-web`.
- [ ] Deploy the API through the repository deployment script, never by editing `railway.json` directly.
- [ ] Deploy Apps Script with `safe-push.ps1`, then execute `WCORE_AUTO_HEAL_FORCE()` if trigger authorization requires renewal.
- [ ] Force-refresh the six affected wallet tabs.
- [ ] Verify expected production outcomes: BNB and Monad positive, Fogo USDC priced, CAMP unit price positive, Ancient8 explicit disabled error, Syndicate explicit RPC-unavailable error if the official RPC remains down, and `Strat!AY1=V` while either error remains.
