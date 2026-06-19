# Bybit CEX Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Bybit read-only CEX holdings to WCORE web using the existing Railway EU CEX relay.

**Architecture:** WCORE web stores user-provided Bybit read-only `apiKey` and `apiSecret` encrypted server-side, then asks the EU `cex-relay` to sign and fetch Bybit v5 balances. Holdings remain separate CEX sources, become synthetic `CEX_BYBIT` scan results, and reuse the existing CEX pricing/display pipeline.

**Tech Stack:** Fastify, Prisma/PostgreSQL, TypeScript, React/Next.js, Node test runner, Express relay in `wcore-gsheet/railway-relay`.

---

### Task 1: Bybit Normalizer Tests

**Files:**
- Modify: `apps/api/src/cex/normalizers.test.ts`
- Modify: `apps/api/src/cex/normalizers.ts`

- [ ] Add tests for Bybit exact-symbol aggregation and provider quotes.
- [ ] Run `rtk pnpm --filter @wcore/api test -- cex` and verify the new tests fail because Bybit exports are missing.
- [ ] Add `BybitBuckets` and `normalizeBybitBuckets()` using exact uppercase symbols per bucket.
- [ ] Re-run `rtk pnpm --filter @wcore/api test -- cex` and verify the CEX normalizer tests pass.

### Task 2: API Provider Wiring

**Files:**
- Modify: `apps/api/src/schemas.ts`
- Modify: `apps/api/src/plugins/cex.ts`

- [ ] Add `bybit` to `CexProviderSchema` and provider types.
- [ ] Add relay URL resolution for `BYBIT_RELAY_URL`, `CEX_RELAY_URL`, `RAILWAY_SERVICE_CEX_RELAY_URL`, and `RAILWAY_SERVICE_BINANCE_RELAY_URL` fallback.
- [ ] Add `fetchBybitRows()` that POSTs `{ token, apiKey, apiSecret }` to `/bybit/account` on the relay.
- [ ] Route Bybit account creation through HMAC credential validation, like Binance/Bitfinex.
- [ ] Route account sync to Bybit and persist holdings through the existing `pricedRows()` path.

### Task 3: Relay Multi-User Endpoint

**Files:**
- Modify: `C:/Users/strau/wcore-gsheet/railway-relay/server.js`

- [ ] Add `POST /bybit/account` protected by `RELAY_TOKEN`.
- [ ] Accept per-user `apiKey` and `apiSecret` from WCORE API only.
- [ ] Reuse Bybit v5 signed GET helpers against `https://api.bybit.eu`.
- [ ] Return `{ ok, ts, spot }` with exact symbols for WCORE web.
- [ ] Keep legacy `GET /bybit` unchanged for Apps Script.

### Task 4: Web Display and Profile Form

**Files:**
- Modify: `apps/web/lib/cex-display.ts`
- Modify: `apps/web/__tests__/cex-display.test.ts`
- Modify: `apps/web/hooks/useCexHoldings.ts`
- Modify: `apps/web/components/ChainCard.tsx`
- Modify: `apps/web/components/ChainIcon.tsx`
- Modify: `apps/web/app/profile/components/CexAccounts.tsx`
- Modify: `apps/web/app/profile/ProfileClient.tsx`
- Modify docs/text: `apps/web/app/HomePageClient.tsx`, `apps/web/app/about/page.tsx`, `ROADMAP.md`

- [ ] Add tests for Bybit provider metadata and `cex:bybit:*` parsing.
- [ ] Run `rtk pnpm --filter @wcore/web test -- cex-display` and verify the Bybit tests fail.
- [ ] Add Bybit to CEX provider union, metadata, parser regex, and synthetic `CEX_BYBIT` handling.
- [ ] Add Bybit API key form in Profile > CEX.
- [ ] Update copy from “Bybit next” to “Bybit live” and move Coinbase/OKX to next.
- [ ] Re-run `rtk pnpm --filter @wcore/web test -- cex-display` and verify it passes.

### Task 5: Verification

**Files:**
- Modify only files touched above.

- [ ] Run `rtk pnpm --filter @wcore/api test -- cex`.
- [ ] Run `rtk pnpm --filter @wcore/web test -- cex-display`.
- [ ] Run `rtk pnpm --filter @wcore/api typecheck`.
- [ ] Run `rtk pnpm --filter @wcore/web typecheck`.
- [ ] Summarize any verification failures with exact command output.
