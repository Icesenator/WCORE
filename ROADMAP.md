# WCORE Roadmap

Root roadmap for the unified WCORE project. This file tracks the work shared by both runtimes:

- `wcore-gsheet/` - Google Apps Script + Google Sheets runtime.
- `wcore-web/` - Next.js + Fastify + Prisma + Railway runtime.

Use this file first when resuming cross-runtime work. Runtime-specific details stay in:

- `wcore-web/ROADMAP.md` - web/API product, deploy, audit, GM, CEX, UI.
- `wcore-gsheet/README.md` and `wcore-gsheet/AGENTS.md` - Apps Script constraints and operations.
- `wcore-web/docs/AUDIT.md` - current web audit backlog.

## Current State - 2026-06-20

- Production web is live at `https://wcore.xyz`.
- Production API health is OK with `chainCount=182`.
- GitHub public branch is clean: `origin/master` at `946bcef` after v0.3.1 deploy.
- Temporary branch `v0.3.1-public` was removed locally and remotely.
- Local safety backup branch kept: `backup/web-before-public-rebase`.

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

## Active Cross-Runtime Work

### 1. Chain Sunset Calendar

Priority: high, date-driven.

Keep affected chains active until the public deadline so users can see and move funds. After the deadline, disable or remove the chain from both runtimes and all dependent surfaces.

Known deadlines tracked in `wcore-web/ROADMAP.md`:

- Swell Chain: 2026-06-23.
- Corn: 2026-06-30.
- Polygon zkEVM: 2026-07-01.
- Botanix: 2026-07-09.
- ZERO Network: 2026-07-31.
- Mint Blockchain: 2026-10-20.
- Cronos zkEVM Alpha: 2027-06-03.

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

### 4. Docs Split and Source of Truth

Priority: medium.

- Root `ROADMAP.md`: cross-runtime work and project-wide state.
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

- Protect or reduce public metrics endpoints (`/api/stats`, `/api/circuit`) if still exposed.
- Centralize web API environment reads through a typed config module.
- Reduce API Docker image size with a pruned production deploy flow.
- Add `.nvmrc` to remove Node version ambiguity.
- Add or finish onboarding docs (`CONTRIBUTING.md`, `TESTING.md`) if the project is opened to more contributors.
- Add web tests for `useScanOrchestrator` and GM on-chain POST E2E if still missing.

## Verification Baseline

Before declaring harmonization work complete, run the relevant subset:

```powershell
# From WCORE
pnpm typecheck
pnpm --filter @wcore/core build
pnpm --filter @wcore/api build
pnpm --filter @wcore/web build

# From wcore-web/wcore-gsheet
npm run validate:static
npm run build:chains
npm run test:phase3-chains
```

## Navigation

- Product/runtime detail: `wcore-web/ROADMAP.md`.
- Release notes: `wcore-web/CHANGELOG.md`.
- Deploy details: `wcore-web/DEPLOY.md`.
- Current audit: `wcore-web/docs/AUDIT.md`.
- GSheet runtime: `wcore-gsheet/README.md` and `wcore-gsheet/AGENTS.md`.
