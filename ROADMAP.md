# WCORE Roadmap

Root roadmap for cross-runtime WCORE work. This file is intentionally short: volatile product status, release history, and implementation details live in runtime-specific docs.

## Runtime Ownership

- `wcore-gsheet/` is the Google Apps Script + Google Sheets runtime and the canonical source for chain configs in `src/*.gs`.
- `wcore-gsheet/dist/` is the generated `@wcore/chains` package.
- `wcore-web/` is the Next.js + Fastify + Prisma + Railway runtime and consumes `@wcore/chains`.

## Current Sources Of Truth

- Web/API product status and active backlog: `wcore-web/ROADMAP.md`.
- Web audit backlog: `wcore-web/docs/AUDIT.md`.
- Web deployment: `wcore-web/DEPLOY.md`.
- Web release history: `wcore-web/CHANGELOG.md`.
- GSheet runtime setup and operations: `wcore-gsheet/README.md` and `wcore-gsheet/AGENTS.md`.
- CEX architecture: `wcore-gsheet/docs/cex-sync.md` and `wcore-gsheet/railway-relay/README.md`.
- Exact current chain count: `/api/chains` in prod, or `npm run build:chains` in `wcore-gsheet`.

## Completed Harmonization Phases

### Phase 1 - Shared FX and Cache Keys

Status: done.

- Shared EUR/USD FX cascade with no fixed fallback.
- Cache-key registry aligned between web and gsheet.
- Cross-runtime FX telemetry and parity endpoint.
- Rule: new cache keys must go through the registry.

### Phase 1.5 - Unified Chain Package

Status: done.

- Removed the duplicated `.gs` mirror from the web runtime.
- `wcore-gsheet/src/*.gs` is the canonical source for chain configs.
- `wcore-gsheet/dist` generates the `@wcore/chains` package consumed by `wcore-web`.
- Railway deploy now uses parent context so web/API builds include `wcore-gsheet/dist`.

### Phase 2 - CEX Runtime Alignment

Status: done for current providers.

- Web supports multi-user CEX imports with encrypted user credentials.
- GSheet keeps its server-owned Apps Script CEX sync model.
- Providers covered in the current codebase: Binance, Bitpanda, Bitfinex, Bybit, Coinbase, OKX.
- Relay pattern is explicit where needed, especially Binance, Bybit, stock prices, Coinbase, and OKX.

### Phase 3 - Chain Config Consolidation

Status: done.

- 182/182 chain configs are extractible from `wcore-gsheet/src/*.gs`.
- Web consumes all configs from the generated chain package.
- TON is represented through `ChainFactory.createTonChain` on the gsheet side while keeping the web TON engine standalone.

### Phase 4 - GSheet-to-Web Scan Delegation

Status: implemented, hardening in progress.

Goal: let GSheet optionally delegate wallet scans to `wcore-web` API instead of running the full Apps Script engine. This reduces HTTP quota consumption and `ScriptProperties` pressure.

- **Increment 1**: `POST /api/gsheet/scan` web endpoint + `DIAG_WEB_SCAN_*` in GSheet, guarded behind global kill-switch and chain allowlist.
- **Increment 2**: EVM/SVM/Cosmos/TON refresh paths attempt WCORE Web first and save a compatible wallet cache with `scanStats.source=wcore-web`.
- **Increment 3 (active)**: converge to Web-required scans. `GSHEET_WEB_SCAN_REQUIRE=true` makes allowlisted Web chains retry Web and stop before native fallback on failure, returning `[WEB_SCAN_ERROR]` while preserving the last displayed cache through `J1`/A1.
- **Increment 4 (future)**: after Web-required mode is stable across all chains, remove native fallback from Web-enabled refresh paths to avoid mixed-source wallet caches.
- Spec: `wcore-gsheet/docs/superpowers/specs/2026-06-25-gsheet-web-scan-proxy-design.md`.

### Phase 5 - Web-Backed GSheet Cache

Status: design captured (2026-06-26), implementation deferred to a later session.

Goal: prevent GSheet `ScriptProperties` saturation by moving all reconstructible cache/state to WCORE Web-backed storage. GSheet should become a lightweight UI/orchestration runtime that keeps only secrets, kill-switches, minimal trigger/UI flags, and last-known display timestamps locally.

- **Chosen direction**: option 3, migrate all reconstructible cache out of GSheet where practical.
- **Primary backend**: WCORE Web API backed by Redis/Postgres, not Apps Script `ScriptProperties`.
- **Priority data classes**: pricing/FX caches, HTTP counters, attempt cooldowns, output snapshots, scan results, wallet/asset cache references, and activity bookkeeping.
- **Local GSheet guardrail**: keep GSheet autonomous enough to degrade gracefully if WCORE Web is unavailable; do not hard-fail visible sheets because web cache is down.
- **Spec**: `wcore-gsheet/docs/superpowers/specs/2026-06-26-gsheet-web-backed-cache-design.md`.

## Active Cross-Runtime Guardrails

### 1. Chain Sunset Calendar

Priority: high, date-driven.

Keep affected chains active until the public deadline so users can see and move funds. After the deadline, disable or remove the chain from both runtimes and all dependent surfaces.

Known deadlines are tracked in `wcore-web/ROADMAP.md`; do not duplicate the full calendar here.

Required removal checklist per chain:

- GSheet source config in `wcore-gsheet/src`.
- Generated chain package via `npm run build:chains`.
- Web chain consumers in `packages/core`, API `/api/chains`, scan filters, icons, native symbols.
- GM factories, wagmi, deploy client, explorer maps, docs, and counters if the chain has GM support.
- Static validation, phase3 chain test, typecheck, API build, web build.

### 2. Runtime Parity Guardrails

Priority: high.

- Keep GSheet autonomous for scan/pricing critical paths.
- Web API delegation from GSheet is optional only for `web-backed` cache keys.
- Never make GSheet depend hard on the web API for normal operation.
- Preserve valid cache on API/RPC failures in both runtimes.
- Keep degraded-mode semantics aligned: cached data can be returned with explicit degraded signals.

### 3. Cache and Scan Policy Alignment

Priority: high.

Recent v0.3.1 work fixed web-side scan result caching and stale major-token price snapshots. Next cross-runtime check is to ensure the same invariants remain true in GSheet:

- Never overwrite valid wallet cache with API/RPC failure data.
- Do not serve a cached positive native balance without price as a final healthy result.
- Do not serve major positive tokens without price as a final healthy result.
- Keep empty-wallet TTLs short enough to avoid hiding newly funded wallets.

### 4. Docs Split and Source Of Truth

Priority: medium.

- Root `ROADMAP.md`: cross-runtime index and guardrails only.
- `wcore-web/ROADMAP.md`: web/API runtime details and release history.
- `wcore-gsheet/README.md` or future `wcore-gsheet/ROADMAP.md`: Apps Script runtime details if needed.
- Planned cleanup: split large mixed guidance from `AGENTS.md` into focused docs while keeping agent-critical gotchas accessible.

### 5. Ops and Deploy Safety

Priority: medium.

- Use `wcore-web/scripts/deploy.ps1 -Service api|web` for Railway deploys.
- Do not run API and web deploy scripts in parallel.
- Keep Railway API autodeploy disconnected until service-level config is separated; the single `railway.json` defaults to web behavior.
- Keep DB backup freshness checks active.

## Open Backlog Snapshot

- **Phase 4 Increment 1**: GSheet web scan proxy (spec ready, see above).
- **Phase 5**: Web-backed GSheet cache migration to eliminate `ScriptProperties` saturation scenarios (spec captured, implementation deferred).
- Protect or reduce public metrics endpoints (`/api/stats`, `/api/circuit`) if still exposed.
- Continue API environment centralization: boot, auth, scan, and metrics now use a typed config module; CEX/GM env reads remain for a later pass.
- Reduce API Docker image size with a pruned production deploy flow.
- Add `.nvmrc` to remove Node version ambiguity.
- Add or finish onboarding docs (`CONTRIBUTING.md`, `TESTING.md`) if the project is opened to more contributors.
- Add web tests for `useScanOrchestrator` and GM on-chain POST E2E if still missing.

## Verification Baseline

Before declaring harmonization work complete, run the relevant subset:

```powershell
# From WCORE
pnpm typecheck
pnpm test
pnpm build
pnpm --dir wcore-web --filter @wcore/core build
pnpm --dir wcore-web --filter @wcore/api build
pnpm --dir wcore-web --filter @wcore/web build

# From WCORE, for Apps Script / generated chains
npm --prefix wcore-gsheet run validate:static
npm --prefix wcore-gsheet run build:chains
npm --prefix wcore-gsheet run test:phase3-chains

# GSheet-specific targeted tests
node --prefix wcore-gsheet tests/cex-null-fetch-guard.test.js
```

## Recent Sessions

### 2026-06-25 — Quota recovery + CEX hardening

- **Cache compaction**: `COMPACT_PACKED_WALLET_CACHE` reduced `GLOBAL_WALLET_CACHE_V1` from 491KB to 444KB (target 454KB). `_PACKED_CACHE_MAX_BYTES` lowered to 455000.
- **Quota breaker**: recovered from tripped state; now OK with `TEST_QUOTA_NOW()` returning available.
- **CEX fetch guards**: Added `!resp` null-response guards in all 6 CEX connectors (`_bpFetch_`, `_binFetchBucketsViaRelay_`, `_bfxAuthPost_`, `_bybitFetchBucketsViaRelay_`, `_cbFetchBucketsViaRelay_`, `_okxFetchBucketsViaRelay_`) to prevent silent `TypeError: Cannot read properties of null (reading 'getResponseCode')`.
- **CEX_HOURLY_REFRESH logging**: Now logs summary to Cloud Logs for post-execution diagnostics.
- **`[CACHE_ONLY]` false-positive fix**: `11_EVM_ENGINE.gs` now stores `httpCalls` in `scanStats` and skips the `[CACHE_ONLY]` marker when the cache proves HTTP activity occurred.
- **Test**: Added `tests/cex-null-fetch-guard.test.js` for regression. Passed before push.

## Navigation

- Product/runtime detail: `wcore-web/ROADMAP.md`.
- Release notes: `wcore-web/CHANGELOG.md`.
- Deploy details: `wcore-web/DEPLOY.md`.
- Current audit: `wcore-web/docs/AUDIT.md`.
- GSheet runtime: `wcore-gsheet/README.md` and `wcore-gsheet/AGENTS.md`.
