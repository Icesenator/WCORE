# 2026-05-13 Audit Fixes Report

## Scope

This document records the audit fixes applied after the complete WCORE Web review on 2026-05-13. The changes target value-inflation bugs, security hardening, frontend state correctness, deployment safety, and validation coverage.

## Core Scan And Pricing

- Stablecoin peg pricing now requires `isStable === true`; a spoofed `USDC` symbol no longer bypasses price sources.
- EVM custom tokens are added to the actual balance scan list, not only to discovery bookkeeping.
- EVM and SVM native balance cache fallback is only used when consensus failed, not when consensus returned a real zero balance.
- EVM token price cache keys are chain-scoped with `${chain}:${contract}` to avoid cross-chain contract-address collisions.
- SVM metadata with unknown decimals no longer blocks RPC decimals fallback.
- Cosmos staking rewards are filtered to native denom before being added to native balance.
- Admin-blocked scam contracts now force `detectScam()` to return `scam`.
- RealToken (Gnosis) property tokens with long `REALTOKEN-` prefixes are exempted from scam detection rules #5 (symbol length) and #8 (generic name + no price). `SCAM_RULES_VERSION` bumped from 6 to 7.

## API Security And Consistency

- Stripe webhook idempotency marks events as processed only after successful business handling.
- SIWE in non-dev fails closed if `CORS_ORIGIN` does not provide an allowlist.
- Custom tokens are resolved through one helper for sync and async scans, scoped to the authenticated user and capped after merge.
- On-chain GM no longer grants duplicate general daily points when the user already GM'd today.
- `/api/gm/status-onchain` is no longer treated as an unlimited public read and all direct RPC fetches in that endpoint use `AbortSignal.timeout(8000)`.
- Notification SSE accepts only opaque single-use stream tokens; JWT query fallback was removed.

## Frontend Flows

- JWT-backed app auth is no longer cleared just because wagmi is temporarily disconnected after reload.
- Wallet scan totals are recomputed from merged chains instead of incrementing from stale previous totals.
- Async scan job errors are propagated to the UI instead of being rendered as successful empty scans.
- On-chain GM and GM contract deploy update local success state only after backend confirmation.
- The has-deployed check no longer treats any public contract on the chain as proof for the connected wallet.
- Home wallet linking sends `mode: "view_only"` for unsigned linked wallets.
- OP token icon override points to the OP token asset, not the Optimism chain logo.
- ChainIcon now renders an emoji placeholder behind the CDN image. During slow/blocked llamao CDN fetches the placeholder is visible immediately; when the image loads successfully it covers the placeholder. If the image fails (`onError` or `naturalWidth === 0`) the placeholder remains. This eliminates the intermittent blank icons in ValueDistribution.

## Infra And CI

- API Docker startup uses `prisma migrate deploy --schema ./prisma/schema.prisma` instead of `db push --accept-data-loss`.
- API startup baselines migration history only when Prisma returns `P3005` on an existing non-empty Railway DB, then reruns `migrate deploy`; it still never uses `db push`.
- Web Docker build receives `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WC_PROJECT_ID` as build args.
- Web healthcheck reads `process.env.PORT || 3000`.
- `docker-compose.prod.yml` keeps the internal web port fixed at 3000 while exposing `${WEB_PORT}` externally.
- `scripts/start-api.ps1` initializes `$root` before reading `.env.staging`.
- `scripts/deploy-staging.ps1` now fails if the pre-deploy backup command fails or creates an empty file.
- CI now runs lint, core tests, web tests, API tests, typecheck, and build.
- ESLint ignores non-source automation scripts under `docs/superpowers/specs/cm-scripts/**` and `scripts/**`, while keeping application/package code linted.

## Verification

- `rtk pnpm typecheck`: pass.
- `rtk pnpm --filter @wcore/core test`: pass, 112/112.
- `rtk pnpm --filter @wcore/web test`: pass, 23/23.
- `rtk pnpm test`: pass, static validation OK.
- `rtk pnpm lint`: pass with 16 warnings, 0 errors.
- `rtk pnpm build`: pass. Local build warns that `NEXT_PUBLIC_WC_PROJECT_ID` is unset.
- `rtk pnpm --filter @wcore/api test`: fail-fast guard verified. `apps/api/set-test-env.js` now requires `TEST_DATABASE_URL` and `TEST_REDIS_URL` and rejects `localhost`, `127.0.0.1`, and `::1` so Prisma cannot target local loopback. Do not run against production data because tests clean tables with Prisma.
- Railway deploy: API `https://api-production-b5bf.up.railway.app/health` → 200 (`wcore-api`, core `0.2.0-phase2`, 116 chains), web `https://wcore.xyz` → 200. Prisma baseline via `start-production.sh` resolved P3005. Both services Online.

## Follow-Up

- Run the API test suite again with Railway-backed test/staging Postgres and Redis via `TEST_DATABASE_URL` and `TEST_REDIS_URL`.
- Consider cleaning obsolete `eslint-disable @typescript-eslint/no-explicit-any` comments now that `no-explicit-any` is disabled for this repo.
- Review whether `apps/web/next.config.mjs` should keep `typescript.ignoreBuildErrors`; the root `typecheck` currently catches TS errors before build.
