# WCORE Web

Next.js 16 frontend + Fastify API + Prisma/PostgreSQL runtime for WCORE.

Current product status and active action items live in [ROADMAP.md](./ROADMAP.md). Test counts are CI-derived and should not be hardcoded here. Architecture, gotchas, and dev procedures live in [AGENTS.md](./AGENTS.md). Unified repository overview: see [../README.md](../README.md).

## Quick Links
- `/` — Wallet scanner (multi-wallet, 180+ chains, EVM/SVM/Cosmos/TON)
- `/pricing` — Token pricing dashboard
- `/profile` — User profile, GM contracts, streaks
- `/admin` — Ops dashboard (health, circuits, metrics, events)
- `/creator` — Creator revenue dashboard
- `/leaderboard` — GM leaderboard
- `/share/:token` — Shared scan reports (public)

## Contributor Docs

- [CONTRIBUTING.md](./CONTRIBUTING.md) - contribution rules and workflow.
- [TESTING.md](./TESTING.md) - test commands and environment requirements.

## Architecture

```
wcore-web/
├── apps/
│   ├── api/          # Fastify API (port 4000)
│   └── web/          # Next.js 16 App Router (port 3000)
├── packages/
│   ├── core/         # Wallet scan engines + pricing cascade
│   ├── db/           # Prisma schema + migrations
│   └── shared/       # Types, cache-key registry, factories, utilities
├── scripts/
│   ├── start-api.ps1
│   └── deploy.ps1
├── apps/api/Dockerfile.railway
└── apps/web/Dockerfile.railway
```

Chain configs are generated upstream in `../wcore-gsheet/dist` and consumed as the local `@wcore/chains` package. Do not reintroduce the old `src/*.gs` mirror inside this package.

## Quick Start

### Prerequisites
- Node.js 20+ & pnpm 9+
- PostgreSQL and Redis for API integration tests. Use dedicated test/staging instances, never production.

### Environment
```powershell
$env:DATABASE_URL="postgresql://USER:PASSWORD@127.0.0.1:5433/wcore"
$env:JWT_SECRET="<generate-a-64-char-secret>"
$env:REDIS_HOST="127.0.0.1"
$env:REDIS_PORT="6380"
$env:CORS_ORIGIN="http://localhost:3000"
```

### Install & Build
```powershell
pnpm install
pnpm --filter @wcore/shared build
pnpm --filter @wcore/core build
pnpm --filter @wcore/api build
pnpm --filter @wcore/web build
```

### Database
```powershell
pnpm --filter @wcore/db exec prisma migrate deploy
pnpm --filter @wcore/db db:seed
```

### Run
```powershell
# Terminal 1 — API
pnpm --filter @wcore/api dev

# Terminal 2 — Web
pnpm --filter @wcore/web dev
```

Open http://localhost:3000

## Tests

```powershell
# Unit tests (core)
pnpm --filter @wcore/core test

# API tests
pnpm --filter @wcore/api test

# Monorepo checks
pnpm typecheck
pnpm lint

# E2E tests (requires API + Web running)
pnpm --filter @wcore/web test:e2e
```

## Deployment

### Staging
```powershell
.\scripts\deploy-staging.ps1 -AutoStart
```

### Production
Production deploys run on Railway with the parent repository context so `wcore-gsheet/dist` is available to `@wcore/chains`. Use `scripts/deploy.ps1` rather than editing `railway.json` manually.

Set strong runtime secrets (`JWT_SECRET`, database URL, Redis URL, CEX secret material) in Railway or the target environment. Never commit `.env*` files or provider secrets.

## Google Apps Script Runtime
The Apps Script runtime lives in `../wcore-gsheet`. Its `src/*.gs` files are the canonical source for chain configs and are extracted to `../wcore-gsheet/dist` for web consumption.

## Changelog
See [CHANGELOG.md](./CHANGELOG.md)

## Audit
Current state and consolidated action items live in [ROADMAP.md](./ROADMAP.md). Historical audit snapshots are archived under [docs/archive/](./docs/archive/).
