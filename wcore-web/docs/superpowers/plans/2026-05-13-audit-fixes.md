# Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the confirmed audit findings that can inflate portfolio values, weaken security, or break critical frontend/deploy flows.

**Architecture:** Keep fixes minimal and localized. Core scan/pricing changes live in `packages/core`; API security changes stay in existing Fastify plugins/routes; frontend fixes preserve current components and localStorage conventions; infra fixes update Docker/CI scripts without changing deployment model.

**Tech Stack:** TypeScript, Node test runner, Fastify, Prisma, Next.js, wagmi/viem, Docker, PowerShell.

**Status:** Implemented on 2026-05-13. Core/web/build/typecheck/static validation pass. API test suite requires Railway-backed `TEST_DATABASE_URL` and `TEST_REDIS_URL`; it must not target local loopback services or production data.

---

### Task 1: Core Scan And Pricing Correctness

**Files:**
- Modify: `packages/core/src/engines/evm.ts`
- Modify: `packages/core/src/pricing/stablecoins.ts`
- Modify: `packages/core/src/pricing/cascade.ts`
- Modify: `packages/core/src/engines/svm.ts`
- Modify: `packages/core/src/engines/cosmos.ts`
- Modify: `packages/shared/src/scam-detector.ts`
- Test: `packages/core/src/engines/evm.test.ts`
- Test: `packages/core/src/pricing/cascade.test.ts`
- Test: `packages/core/src/engines/svm.test.ts`
- Test: `packages/core/src/engines/cosmos.test.ts`
- Test: `packages/shared/src/scam-detector.test.ts` if present, otherwise `apps/web/__tests__/ui.test.ts` for shared behavior imports.

- [x] Add failing tests for custom tokens being scanned, stablecoin symbol spoof not getting peg price, native zero not falling back to cache, chain-scoped price cache, SVM metadata decimals fallback, Cosmos reward denom filtering, and admin block forcing scam.
- [x] Run targeted tests and confirm they fail for the expected reasons.
- [x] Implement minimal localized fixes.
- [x] Run `rtk pnpm --filter @wcore/core test` and affected shared/web tests.

### Task 2: API Security And Consistency

**Files:**
- Modify: `apps/api/src/billing.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/gamification.ts`
- Modify: `apps/api/src/auth.ts`
- Test: `apps/api/src/*.test.ts`
- Test: `apps/api/test/*.test.ts`

- [x] Add/extend regression coverage where available; DB-dependent API tests remain blocked locally by missing services.
- [x] Run targeted tests where dependencies are available; report local DB/Redis blocker for full API suite.
- [x] Move Stripe processed-event marking after successful processing.
- [x] Share custom-token resolution between sync and async scan with post-merge limits.
- [x] Fix GM score calculation and rate-limit `/api/gm/status-onchain`; add RPC fetch timeouts.
- [x] Remove SSE JWT fallback and fail-close SIWE allowlist in non-dev.

### Task 3: Frontend Critical Flows

**Files:**
- Modify: `apps/web/components/ConnectButton.tsx`
- Modify: `apps/web/components/WalletContent.tsx`
- Modify: `apps/web/hooks/useOnChainGm.ts`
- Modify: `apps/web/app/HomePageClient.tsx`
- Modify: `apps/web/app/profile/ProfileClient.tsx`
- Modify: `apps/web/components/TokenTable.tsx`
- Modify: `apps/web/components/ChainCard.tsx` if needed for scam override event identity.
- Test: `apps/web/__tests__/**/*.test.ts`

- [x] Add/extend tests for scam override and OP token icon; scan behavior covered by type/build plus existing UI-critical scan tests.
- [x] Implement auth persistence without clearing JWT on wagmi disconnect state alone.
- [x] Recompute wallet totals from merged chains and propagate async job errors.
- [x] Require backend success before GM local success/deploy success and remove public contract-list fallback.
- [x] Send `mode: "view_only"` from Home.
- [x] Keep backend contract-aware scam override support and hard-block contract overrides in shared detector.
- [x] Fix OP token icon regression.

### Task 4: Infra, CI, And Validation

**Files:**
- Modify: `apps/api/Dockerfile`
- Modify: `apps/web/Dockerfile`
- Modify: `docker-compose.prod.yml`
- Modify: `scripts/start-api.ps1`
- Modify: `scripts/deploy-staging.ps1`
- Modify: `.github/workflows/ci.yml`
- Modify: `eslint.config.mjs` or docs/script includes if lint scope is wrong.

- [x] Replace production `prisma db push --accept-data-loss` with `prisma migrate deploy`.
- [x] Pass build-time `NEXT_PUBLIC_*` args to web Docker build.
- [x] Make web healthcheck respect `process.env.PORT` and align compose port mapping.
- [x] Initialize `$root` before use in `start-api.ps1`.
- [x] Validate staging DB backup before migration.
- [x] Add lint/core/web tests to CI and exclude non-source docs/scripts from lint scope.
- [x] Run `rtk pnpm typecheck`, `rtk pnpm lint`, `rtk pnpm --filter @wcore/core test`, `rtk pnpm --filter @wcore/web test`, root static validation, build, and API tests with DB/Redis blocker reported.

### Verification Results

- `rtk pnpm typecheck`: pass, no TypeScript errors.
- `rtk pnpm --filter @wcore/core test`: pass, 112/112 tests.
- `rtk pnpm --filter @wcore/web test`: pass, 23/23 tests.
- `rtk pnpm test`: pass, static validation OK.
- `rtk pnpm lint`: pass with 16 warnings, 0 errors.
- `rtk pnpm build`: pass. Build warns that `NEXT_PUBLIC_WC_PROJECT_ID` is not set locally, disabling WalletConnect/Coinbase Wallet for that build.
- `rtk pnpm --filter @wcore/api test`: fail-fast guard verified. `apps/api/set-test-env.js` now requires `TEST_DATABASE_URL` and `TEST_REDIS_URL` and rejects `localhost`, `127.0.0.1`, and `::1` so Prisma cannot target local loopback. Do not run against production data because tests clean tables with Prisma.
- Railway deploy: API health 200 (`wcore-api`, core 0.2.0-phase2, 116 chains), web health 200. Prisma baselining via `start-production.sh` resolved P3005 on first deploy. Both services Online.

### Self-Review

- Coverage: The plan covers all confirmed critical/high audit items and the main medium validation blockers.
- Placeholders: No `TBD` or open implementation holes remain; exact files and commands are listed.
- Scope: This is large but decomposed into independently testable lots; changes should be applied in the listed order.
