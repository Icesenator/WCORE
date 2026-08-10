# WCORE Web â€” Wallet CORE

Portfolio tracking app (182 chains, EVM/SVM/Cosmos/TON) migrated from Google Apps Script.

**Stack** : Node.js (>=20.10), pnpm (>=9), TypeScript, Next.js 16 (Turbopack), Fastify, Prisma, Redis, PostgreSQL, Docker, Railway
**Domains** : `wcore.xyz` (web), `api-production-b5bf.up.railway.app` (API)
**Language** : French (developer). Reply in French.

---

## Essential Commands

```powershell
# Dev
pnpm dev                       # apps/api (4000) + apps/web (3000)
pnpm dev:api                   # API only
pnpm dev:web                   # Web only

# Build & Check
pnpm build                     # packages first, then apps
pnpm typecheck                 # all workspaces
pnpm lint                      # ESLint flat config (eslint.config.mjs)
pnpm test                      # typecheck + packages tests + web tests

# Deploy (Railway)
& scripts/deploy.ps1 -Service api    # API deploy
& scripts/deploy.ps1 -Service web    # Web deploy
# Never run two deploys in parallel (they race on railway.json)

# Staging
& scripts/deploy-staging.ps1 -AutoStart   # API:4001, Web:3001

# DB
& scripts/backup-db.ps1                  # Manual backup
& scripts/check-backup-freshness.ps1     # Alert if no backup >48h

# Chain lifecycle audit (weekly, see .github/workflows/chain-lifecycle-audit.yml)
# Probes every EVM RPC from Railway (cloud, not local ISP), cross-checks ChainList,
# flags chains that are dead / removed / chainId-mismatched / misconfigured.
$env:ADMIN_TOKEN="<railway ADMIN_TOKEN>"
pnpm audit:chain-lifecycle
```

---

## Project Structure

```
wcore-web/
  apps/
    api/                   # Fastify API (port 4000/4001 staging)
      src/
        plugins/           # scan.ts, admin.ts, wallet.ts, chains.ts
        auth.ts            # SIWE + JWT (httpOnly cookies)
        server.ts          # Main Fastify app (~360 LOC)
        server-helpers.ts  # Pure helpers (testable without Fastify)
    web/                   # Next.js 16 frontend (port 3000/3001 staging)
      app/                 # App Router pages (server components + XxxClient.tsx)
      components/          # WalletContent, ChainCard, TokenTable, ChainIcon, etc.
      hooks/               # useOnChainGm, useCexHoldings, useSafeSwitchChain
      lib/                 # api.ts (apiFetch), gm-storage.ts, defaults.ts
  packages/
    core/                  # Scan engines (EVM, SVM, Cosmos, TON) + pricing cascade
      src/
        chains/            # 182 chain configs (*.ts)
        engines/           # evm.ts (split: -types, -balances, -pricing, -scan, -batch), svm.ts, cosmos.ts, ton.ts
        pricing/           # Cascade: DefiLlama â†’ DexScreener â†’ GT â†’ Jupiter â†’ CoinGecko
        tokens/            # scam-detector.ts, explorer-discovery.ts, registry.ts
        rpc/               # Multicall3, consensus, health tracker, RPC resolver
    shared/                # Types, factories (GM_FACTORIES), cache keys, address schemas
    db/                    # Prisma schema + client (Postgres, railway/viaduct.proxy)
  scripts/                 # deploy, backup, staging, audit-rpcs, build-post-*.cjs
  docs/                    # audits/AUDIT.md, reference/, guides/, archive/
  contracts/               # Solidity (GmOnChain, GmFactory)
```

---

## Critical Constraints

| Constraint | Value |
|---|---|
| API port (dev) | `4000` |
| Web port (dev) | `3000` |
| API port (staging) | `4001` |
| Web port (staging) | `3001` |
| Web port (Railway prod) | `8080` (standalone Next) |
| API port (Railway prod) | `4000` |
| `SCAN_CONCURRENCY` | **50** default |
| `NEXT_PUBLIC_SCAN_CONCURRENCY` | **50** (must match backend) |
| `SCAN_CHAIN_TIMEOUT_MS` | **90000** (90s per chain) |
| `JWT_SECRET` | Required in prod, 32+ chars random |
| `AUTH_ALLOW_BEARER` | `false` in prod (cookie-only) |
| `ADMIN_TOKEN` | Required for admin endpoints, `timingSafeEqual` |
| `DATABASE_URL` / `REDIS_URL` | Railway viaduct.proxy (not internal `postgres.railway.internal`) |
| 182 chain configs | 15 disabled via `FLAGS.DISABLE_CHAIN=true` |

**PSA** : `railway.json` controls which Dockerfile deploys. Never `edit railway.json` + `railway up` manually â€” always use `scripts/deploy.ps1`. Never run two deploys in parallel (race condition).

---

## Architecture Summary

### API Routes
- `POST /api/scan` / `POST /api/scan/async` â€” wallet scan (sync/async job polling)
- `POST /api/scan/batch` â€” multi-wallet batch scan (max 20 addresses)
- `GET /api/chains` â€” chain registry (disabled flag, RPC count)
- `/api/auth/*` â€” SIWE login/logout (JWT httpOnly cookies)
- `/api/gm/*` â€” on-chain GM (deploy, status, my-contracts)
- `/api/cex/*` â€” CEX sync (Binance, Bitpanda, Bitfinex, Bybit, Kraken)
- `/api/price/native` / `/api/price/fx` â€” pricing (4-source FX cascade median)
- `GET /api/diag/fx-parity` â€” cross-runtime drift detector (web vs gsheet)

### Pricing Cascade (per token)
```
Stablecoins (fast-path) â†’ FX Rate Cache (6h) â†’ DefiLlama â†’ DexScreener â†’
GeckoTerminal (bulk + per-token) â†’ Jupiter (SVM) â†’ CoinGecko (last resort)
```
FX cascade (EUR/USD): Frankfurter â†’ open.er-api.com â†’ Coinbase â†’ DefiLlama EURC (consensus median, >2 sources). No fixed fallback. Throw on 0 sources.

### Scan Engine
- **EVM** : Consensus RPC (`votes*2 > total`), Multicall3 batch balances, incremental log discovery (Redis cursor)
- **SVM** : Solana RPC, no consensus on native balance
- **Cosmos** : REST/API endpoints, IBC decimals
- **TON** : TonAPI primary, Toncenter fallback, single-RPC (no consensus)

### Cache Layers
1. L1 CacheService (volatile, 2h TTL, skipL1 on forceFull)
2. GlobalPriceCache (ScriptProperties/Redis, 6h staleness)
3. WalletCache (packed, virtualized, 14j TTL)

---

## Contribution Rules

### DO
- Incremental: one fix = one problem, small targeted PRs
- Exact cache keys, exact contract addresses â€” never guess
- `forceRefresh=true` to bypass cache, not manual Redis/key deletion
- Update `ROADMAP.md` for major features; update `CHANGELOG.md` for releases
- `"use client"` on any `.tsx` file using React hooks

### DON'T
- Never hardcode a CoinGecko ID â€” always verify via `/search`
- Never add chain-specific logic in scan engines (core package is universal)
- Never overwrite valid cache on API errors (mode dÃ©gradÃ© with `[DEGRADED]`)
- Never use `fetch()` raw for internal API â€” use `apiFetch()` (handles CORS + JWT cookies)
- Never `await` cache writes in engines (fire-and-forget, .catch silent)

---

## Recent Gotchas (July 2026)

- **isNoMarketToken filters unpriced tokens (2026-07-14)** : `sanitizeGsheetScanResult` drops tokens with `priceEur=null` not in protectedContracts. Tokens outside registry on chains without DEX/GT fail the pricing cascade. Fix: add known stablecoin symbols to `knownTokenSymbols` (gsheet.ts:584-592) + add tokens to chain registry. Files: `gsheet.ts:619`, `evm-pricing.ts:95`.

- **LLAMA_ID_MAP case-sensitive (2026-07-14)** : `getSymbolLlamaId` (cascade.ts:260) does exact-then-uppercase lookup. If config has `"USDC.e"` (lowercase) but ERC-20 returns `"USDC.E"` (uppercase), lookup fails. Always add both case variants in `LLAMA_ID_MAP`. Files: `cascade.ts:260-267`, `TEMPO.ts:41`.

- **Refresh All + CEX sync (2026-07-17)** : `handleRefreshAll` triggers on-chain refresh + `refreshCex()` in parallel. State `refreshingAll || isRefreshingCex` stays true until both paths finish. CEX sync uses `Promise.allSettled` with 30s global timeout; non-2xx keeps last snapshot with stale marker. Do not reintroduce manual CEX POST in `WalletContent` â€” canonical orchestration lives in `useCexHoldings`.

---

## Links

- **AGENTS-ARCHIVE.md** â€” Full historical agents doc (965 lines, 240 KB): gotchas v0.x-v4.x, Apps Script internals, GAS constraints, clasp workflow, Codex memory systems, security audits detail
- **ROADMAP.md** â€” Current state, migration plan, session history, version tracking
- **CHANGELOG.md** â€” Release notes
- **DEPLOY.md** â€” Deployment operations
- **docs/audits/AUDIT.md** â€” Current audit status (verified 2026-07-10)
- **docs/reference/fx-cascade.md** â€” FX pricing cascade design document
- **docs/reference/rpc-harmonization-2026-06-03.md** â€” RPC 11-layer architecture
- **docs/guides/** â€” Setup, testing, troubleshooting guides

## Cross-project rules

See ProjetIA/AGENTS.md:
1. **Data property** — collect proprietary data first, store locally
2. **Terminal + Obsidian** — CLI scripts connected to Obsidian MCPs
3. **Wiki & Raw (Karpathy)** — write Raw first, distill to Wiki after
4. **Monthly audit** — 1st of every month, full system audit
5. **No learning loops** — every output verifiable against ground truth
6. **Principle** — never build SEO projects with LLMs without rules 1-5
