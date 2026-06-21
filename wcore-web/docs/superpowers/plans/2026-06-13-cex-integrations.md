# CEX Integrations Implementation Plan

> **Historical/completed plan.** CEX integrations have moved into live docs and roadmap; keep this file for implementation history only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Binance and Bitpanda CEX holdings to WCORE web as user-scoped, server-synced portfolio sources.

**Architecture:** Add focused CEX API/plugin code, Prisma models for accounts/holdings, provider normalizers adapted from `wcore-gsheet`, and a Profile tab to connect/sync/view holdings. CEX holdings stay separate from on-chain wallet scans and do not pretend to be chains.

**Tech Stack:** Fastify, Prisma/PostgreSQL, React/Next.js, TypeScript, Node `crypto` for authenticated Binance relay access.

---

### Task 1: Provider Normalization

**Files:**
- Create: `apps/api/src/cex/normalizers.ts`
- Test: `apps/api/src/cex/normalizers.test.ts`

- [ ] Implement `normalizeBinanceBuckets()` preserving `USDC`, `TUSD`, `USDT`, `EUR`, `EURI`, and `EURC` as distinct symbols.
- [ ] Skip Binance `LD*` lending wrapper assets before aggregation.
- [ ] Implement Bitpanda row aggregation by exact uppercase symbol only.
- [ ] Test exact-symbol aggregation and no forbidden cross-symbol aliases.

### Task 2: Database Models

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] Add `CexAccount` and `CexHolding` relations under `User`.
- [ ] Store provider, label, encrypted credentials JSON, sync status, last sync metadata.
- [ ] Store holdings by `accountId + symbol + bucket`, with balance, price/value EUR, source, updatedAt.

### Task 3: CEX API Plugin

**Files:**
- Create: `apps/api/src/plugins/cex.ts`
- Modify: `apps/api/src/schemas.ts`
- Modify: `apps/api/src/server.ts`

- [ ] Add authenticated routes: list accounts/holdings, upsert account credentials, delete account, sync account.
- [ ] Binance sync calls configured relay URL with token and provider account metadata.
- [ ] Bitpanda sync calls Bitpanda API server-side with the stored API key.
- [ ] Price via explicit symbol mapping plus fiat/stable fast paths; unknown symbols return `priceEur:null`.

### Task 4: Profile UI

**Files:**
- Create: `apps/web/app/profile/components/CexAccounts.tsx`
- Modify: `apps/web/app/profile/ProfileClient.tsx`

- [ ] Add Profile tab `CEX`.
- [ ] Add minimal forms for Binance relay token/URL and Bitpanda API key.
- [ ] Show account status, sync button, and holdings table.

### Task 5: Verification

**Commands:**
- `pnpm --filter @wcore/api test -- cex`
- `pnpm --filter @wcore/api typecheck`
- `pnpm --filter @wcore/web typecheck`

- [ ] Fix any type or test failures.
- [ ] Document gotchas in `AGENTS.md` if behavior differs from Apps Script.
