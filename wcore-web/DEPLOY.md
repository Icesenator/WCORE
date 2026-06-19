# WCORE Deployment Guide

## Production deploys — Railway (wcore.xyz / api-production-b5bf.up.railway.app)

The Railway project has **two services** (`web` and `api`). Since `@wcore/core` depends on `@wcore/chains` from `../wcore-gsheet/dist`, deploys use the parent repo context `C:\Users\strau\WCORE\wcore-web` and the parent `railway.json`. `scripts/deploy.ps1` swaps `dockerfilePath` according to `-Service`, runs `railway up <parent> --path-as-root --service <name> --ci`, restores the JSON in a `finally` block, and propagates Railway's exit code.

```powershell
# From wcore-web/wcore-web
powershell -File scripts\deploy.ps1 -Service api

powershell -File scripts\deploy.ps1 -Service web

# Deploy both (sequentially)
powershell -File scripts\deploy.ps1 -Service api; powershell -File scripts\deploy.ps1 -Service web
```

### ⚠️ Do not run `railway up` directly

Bare `railway up` (no `--service` flag) deploys to the currently linked service with whatever `dockerfilePath` is in `railway.json`. Running it from `wcore-web/wcore-web` can also exclude `wcore-gsheet/dist`, breaking `@wcore/chains`. Always use `scripts/deploy.ps1`.

### Verification after deploy

```powershell
# Service status (both services)
railway status

# Build logs for the most recent deploy
railway logs --service api --build
railway logs --service web --build

# Runtime logs (current live deployment)
railway logs --service api
railway logs --service web

# Production health checks
curl https://api-production-b5bf.up.railway.app/health
curl -I https://wcore.xyz
```

A stuck "Deploying" status without runtime logs from the new container usually means the new container is failing healthcheck — open the Railway dashboard for exit codes and restart counts. Re-running `scripts/deploy.ps1 -Service <name>` queues a fresh build and Railway replaces the stuck one once the new build is healthy.

### Railway link

| Service | URL | Dockerfile |
|---------|-----|------------|
| `web` | https://wcore.xyz | `wcore-web/apps/web/Dockerfile.railway` |
| `api` | https://api-production-b5bf.up.railway.app | `wcore-web/apps/api/Dockerfile.railway` |

Project ID: `cbb16f4a-79c1-46ef-92b2-019c9c9940d7` · Environment: `production` · Region: `sfo`

### `@wcore/chains` Docker gotcha

`@wcore/chains` is generated under `wcore-gsheet/dist` and its package source is TypeScript. The Railway Dockerfiles compile it to JavaScript and patch both `/wcore-gsheet/dist/package.json` and `node_modules/@wcore/chains/package.json` to point at `chains/index.js`. Do not remove this step unless `@wcore/chains` is published or generated as JS before install; Node 22 refuses to strip TypeScript under `node_modules`.

### API Dockerfile import rewrite gotcha

`apps/api/Dockerfile.railway` rewrites extensionless compiled ESM imports in `packages/shared/dist` and `packages/core/dist`. The replacement string must escape the capture group as `./\$1.js` inside the `RUN node -e "..."` command. If it is written as `./$1.js`, `/bin/sh` expands `$1` to an empty string during the Docker build and the API crashes at runtime with `ERR_MODULE_NOT_FOUND` for `/app/packages/shared/dist/.js`.

Quick verification after changing this line:

```powershell
docker build --target builder -f wcore-web/apps/api/Dockerfile.railway -t wcore-api-railway-builder-check .
docker run --rm wcore-api-railway-builder-check node -e "const fs=require('fs');const s=fs.readFileSync('/app/packages/shared/dist/index.js','utf8');if(s.includes('./.js')) process.exit(1);console.log(s)"
```

### GitHub autodeploy note

The `web` service can stay connected to `Icesenator/WCORE@master` because the committed `railway.json` points at the web Dockerfile. Keep the `api` service disconnected from GitHub until Railway has a service-level config or separate config file pointing at `wcore-web/apps/api/Dockerfile.railway`; otherwise a GitHub deploy can build the web image for the API service.

---

## Process supervisor (pm2)

`scripts/deploy-staging.ps1 -AutoStart` launches the API and Web as
PowerShell `Start-Job` background jobs that die with the host shell.
For anything longer-lived than a manual demo, use pm2:

```bash
npm i -g pm2

# From the repo root, after `pnpm --filter @wcore/web build` (which now
# also copies .next/static into the standalone output):
pm2 start ecosystem.config.cjs

pm2 logs wcore-staging-api
pm2 status
pm2 save                # persist the process list
pm2 startup             # boot service hook (Linux only)
```

`ecosystem.config.cjs` sets `autorestart: true`, `max_memory_restart`
(768MB API / 512MB Web — bump if `SCAN_CONCURRENCY` is raised), and
funnels logs to `.pm2-logs/`. `TRUST_PROXY` is read at process start —
update the env and `pm2 restart` to pick it up.

## Reverse proxy / `TRUST_PROXY`

The Fastify API derives `req.ip` from the `trustProxy` setting:

| `TRUST_PROXY` | Behavior | Use when |
|---------------|----------|----------|
| unset / `false` | Trust loopback only (`127.0.0.1`, `::1`) | No proxy, or local docker/nginx co-located on the API host |
| `true` | Trust *any* upstream — accepts `X-Forwarded-For` from anywhere | Single trusted proxy you control AND the API is not directly reachable |
| CIDR list (e.g. `10.0.0.0/8`) | Trust only the listed networks | Multi-hop proxy chain |

Setting `TRUST_PROXY=true` while the API is still reachable on a public
port lets clients spoof their IP via `X-Forwarded-For` and bypass the
Redis-backed rate limiter. Treat it as a privileged switch.

---

## Scan Perf Round 2 — Operational Notes (commit `1865b46`)

### Negative cache for empty wallet/chain

- Stored in **Redis** under key `empty:<chainKey>:<address>` with **TTL 10 min**. Survives API restarts.
- Only written when the scan is clean (no `[DEGRADED]`, no `consensus failed` in `errors`) AND the wallet truly has zero native + zero tokens. A flaky-RPC empty result will not poison the cache.
- Hits surface as `errors: ["[CACHED_EMPTY] wallet/chain has no assets within TTL"]` in the `ChainScan`. UI may want to special-case this string to avoid showing it as a real error.
- To invalidate manually: `redis-cli DEL "empty:<chain>:<address>"`. `forceRefresh=true` bypasses the top-level `scan:v2:*` result cache; as of the 2026-06-05 audit, propagation to engine-level short-circuits is an open P0 and must not be assumed for manual cache invalidation.

### Per-phase metrics

- Every `ChainScan` exposes `phases.{nativeMs, discoveryMs, balancesMs, pricingMs}` across all VMs. Cosmos uses only `balancesMs` + `pricingMs` (others 0); EVM/SVM populate all four.
- EVM phases overlap: native (read+price) and discovery now run via `Promise.all`. So `scanMs ≈ max(nativeMs, discoveryMs) + balancesMs + pricingMs`, not the sum.

### Cache layers, do not confuse

- **Frontend portfolio scan cache**: disabled. Portfolio scan results are no longer persisted in browser `localStorage`.
- **Backend Redis (sharedCache)**: stores scan result cache `scan:v2:{address}:{chain}`, discovery cache, ERC-20 metadata, native balance fallback, and negative empty-cache. Survives API restarts.
- A stale scan result now usually means Redis/API cache, not browser cache. Use `forceRefresh=true` to bypass the top-level scan result cache.

### Tests

- API tests run with `--test-concurrency=1`. Do not remove this flag while multiple `.test.ts` files share the Prisma DB; the parallel runner causes `support` / `gamification` / `share` suites to step on each other's user/ticket fixtures and intermittently fail with empty result sets. Either keep concurrency 1 or isolate fixtures per-suite (separate schema / DB, or per-test transactions).

---

## Post-v0.1.19 Scan Reliability Notes

### Runtime checks

- After restarting the API during local/dev testing, force-refresh the web tab (`Ctrl+Shift+R`). Async scan jobs are in-memory; jobs created before an API restart will return `404 job_not_found`.
- Authenticated async scan jobs require authenticated polling. The frontend must send the same `Authorization` header to `GET /api/scan/async/:jobId` as it sends to `POST /api/scan/async`.
- Deep scan is expected to use async polling even for a single chain. Sync scans still have a 60s frontend timeout.
- Chrome CDP debugging must use the persistent profile `%USERPROFILE%\chrome-debug-profile`. A temp profile will look logged out and disconnected from wallet/session state.
- Deep scan loading progress is computed from `chain checks`: the sum of VM-compatible chains per enabled wallet. Do not use raw selected-chain count or current-wallet chain count as the global denominator.
- Active deep scans show at least `1%` after the first completed chain check, even when the weighted denominator is large.
- Header on-chain GM status is local-first. If a ChainCard GM succeeds, `wc_gm_onchain_date` must gray the Header on-chain action without a refresh.
- Browser portfolio scan cache is disabled. If a browser still misses a newly fixed asset after deploy, verify the API response first, then inspect Redis `scan:v2:*` and engine-level caches.

### EVM scan performance

- Deep scan range remains `500_000` blocks.
- `eth_getLogs` is chunked by 10k blocks and processed in parallel groups of 5.
- ERC-20 balances are read through Multicall3 where available (`0xcA11bde05977b3631167028862bE2a173976CA11`), with per-token fallback when needed.

### Known token coverage

- ZERO Network WBTC is registry-backed: `0xf1f9e08a0818594fde4713ae0db1e46672ca960e`, decimals `8`, price id `coingecko:wrapped-bitcoin`.
- Optimism chain icon uses a TrustWallet PNG fallback because the generated Llama URL can render as a broken image in the UI.
- Optimism token `OP` uses a separate TrustWallet PNG token-logo override; do not confuse it with the chain icon fallback.

---

## v0.1.19 — Audit Hardening Release

### Pre-flight

- [x] Typecheck: 5/5 packages
- [x] Core tests: 94/94 (+5 guard tests)
- [x] API tests: 41/41 (+7 share tests)
- [x] Docker API build: OK
- [x] Docker Web build: OK
- [x] Audit Sprint 1+2+3A+3B: all CRITICAL/HIGH resolved

### Key fixes in v0.1.19

**Sprint 1 — CRITICAL/HIGH prod blockers**
- CR1: Admin route extracted from scan handler (was dead code)
- CR2/3: EVM+SVM native balance cache fallback on RPC consensus failure (`[DEGRADED]` flag)
- H-A1: Admin auth requires token in all environments (no dev bypass)
- H-A3: Platform owner check always verifies DB, no JWT fast-path
- H-R1: Dispatcher falls back to all endpoints when none healthy (no blackout)
- H-R2/3: Circuit breaker HALF_OPEN state, `circuit_half_open` event, no getter mutation
- H-F1: Multi-wallet PDF export gated by user plan (not just button)
- M-D1: Docker compose includes ADMIN_TOKEN var

**Sprint 2 — Pricing, Engines, Cache**
- H-P1: CoinGecko symbol defaults map removed (no guessing CG IDs)
- H-P2: GeckoTerminal Try3 filters pools by contract match
- H-P4: HTTP timeouts (5s) on all GT + CG calls
- H-E2: Cosmos IBC token decimals: 18 (was hardcoded 6)
- H-E3: Cosmos staking includes unbonding + rewards
- H-R4: Redis SCAN instead of KEYS for clear()
- H-R5: eth_getLogs chunked by 10K blocks
- H-A4: Chain GM streak handles null lastGmDate
- H-F3: Malformed JWT cleans up localStorage (was silently authenticating)
- H-D1: Web Docker HEALTHCHECK uses node http (no wget)

**Sprint 3A — Security hardening**
- H-A5: Notifications SSE uses opaque token (POST stream-token), JWT never in query string
- H-A6: Async scan jobId uses crypto.randomBytes, status endpoint verifies ownership
- Custom tokens: regex validation (EVM/SVM/Cosmos), max 100, 128-char limit
- Share tokens: 7 tests (owner-only, sanitized, expired, revoked)

**Sprint 3B — Pricing/cache/guard hardening**
- H-P5: GT throttle 40/60s, CG rate-limit 30/60s
- H-R6: Redis errors reported via onError callback with 60s cooldown
- H-P3: DexScreener quote allowlist (USDC/USDT/DAI/WETH/...)
- H-F2: CSV export preserves negative numbers, neutralizes formulas
- FACTORIES: single source of truth in @wcore/shared
- Guard tests: dispatcher unhealthy fallback, circuit breaker transitions, circuit_half_open event
- Docker web: non-root, node healthcheck

### New env vars in v0.1.19

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `PUBLIC_URL` | No | `http://localhost:3000` | Base URL for share links |

### Migrations

No new migrations in v0.1.19. Schema unchanged from v0.1.18.

---

## v0.1.18 — Post-Audit Release (27/27 findings fixed)

### Pre-flight

- [x] Typecheck: 5/5 packages
- [x] Core tests: 89/89
- [x] API tests: 34/34
- [x] E2E tests: 7/7
- [x] Web unit tests: 3/3
- [x] Docker API build: OK
- [x] Docker Web build: OK
- [x] Full audit: 27/27 findings resolved

### Key fixes in v0.1.18

- ETH price endpoint: DefiLlama + CoinGecko fallback (no hardcoded $2000)
- Admin auth: NODE_ENV check prevents open access in production
- Deploy RPC: 10s timeout (AbortSignal) on all RPC calls
- JWT validation: malformed tokens treated as expired (not valid)
- GM on-chain: API call before localStorage (no lost records)
- Stablecoin detection: DAI, FRAX, LUSD, sDAI added to fast-path
- circuit-breaker: HALF_OPEN→CLOSED now fires events
- dispatcher: never falls back to unhealthy RPC endpoints
- ChainCard: only Base factory active (matching backend)
- Docker: HEALTHCHECK uses node http (no wget dependency)
- CSV: neutralizes pipe char for injection safety

### Plans (retired — Stripe removed in v0.2.21)

WCORE is free. The billing plugin, Stripe checkout, webhook, portal, and all `STRIPE_*` variables have been removed.

### New in v0.1.17

- **Plans**: User.plan field (free/pro/admin), enforced limits on scans
- **Usage dashboard**: scans used/remaining, reset timer, usage bar
- **Multi-wallet PDF export**: available to all users (no Pro gate)

### New Features

- **Admin dashboard** (`/admin`): health, circuits, GM stats, rate limits, chain errors, slow chains, metrics history charts, ops timeline
- **Admin auth** (`ADMIN_TOKEN`): protects `/api/health/detailed`, `/api/admin/*` endpoints
- **SIWE UX**: auth states (connecting→signing→verifying→authenticated), error messages, JWT expiration check
- **PDF v2**: branded cover page, exec summary, warnings, page numbering
- **Persistent metrics**: `SystemMetricSnapshot` table, 5min snapshots, 7d retention, CSS bar charts
- **Ops timeline**: `OpsEvent` table, circuit open/close, health degraded events, type filter
- **Webhook alerting**: `ALERT_WEBHOOK_URL` → POST JSON on circuit open/close, db/redis down, health degraded

### Auth: SIWE (EIP-4361)

The nonce endpoint now returns a SIWE-formatted message with domain, URI, chainId, issuedAt, expiration.
- Domain: extracted from `Host` header (falls back to `localhost`)
- URI: from `CORS_ORIGIN` env var (first entry)
- Login validates expiration and chainId match
- Backward compat: legacy plain-text nonces during transition
- JWT expiration auto-detected, session expired state with "Reconnect" button

### Admin Endpoints (ADMIN_TOKEN protected)

| Endpoint | Purpose |
|----------|---------|
| `/api/health/detailed` | DB/Redis ping, circuits, metrics, GM stats, recent scans |
| `/api/admin/metrics/history?range=24h` | Snapshot history (24h/48h/7d) |
| `/api/admin/events?limit=100&type=circuit_opened` | Ops event timeline |

### Migrations (v0.1.14 → v0.1.16)

| Migration | Tables |
|-----------|--------|
| `20260506220000_v0_1_14_gm_enhancements` | `creatorAddress`, `tipWei`, composite unique |
| `20260507180000_add_system_metric_snapshots` | `system_metric_snapshots` |
| `20260507190000_add_ops_events` | `ops_events` |

### Legacy Docker Compose Path

This section is kept for historical/self-hosted reference. The active production path is Railway via `scripts/deploy.ps1 -Service api|web`. Do not use this Docker Compose path as the source of truth without first applying the open audit fixes in `docs/AUDIT.md` (P2-20: `NEXT_PUBLIC_*` build args, Web Dockerfile `chown`, DB/Redis exposure review).

### 1. Environment Setup

```bash
# Copy template and fill in secrets
cp .env.production.template .env.production.local
# Edit .env.production.local:
#   DB_PASSWORD=<strong password>
#   JWT_SECRET=<64+ char random string>
#   CORS_ORIGIN=https://your-domain.com
#   NEXT_PUBLIC_API_URL=https://api.your-domain.com
#   NEXT_PUBLIC_WC_PROJECT_ID=<walletconnect project id>
#   REDIS_PASSWORD=<strong password>
```

### 2. Database

```bash
# Start DB + Redis only
docker compose -f docker-compose.prod.yml up -d postgres redis

# Wait for healthy
docker compose -f docker-compose.prod.yml ps

# Run migrations
docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
```

### 3. Start Services

```bash
# Start API + Web
docker compose -f docker-compose.prod.yml up -d api web

# Verify health
curl http://localhost:4000/health
curl http://localhost:3000
```

### 4. Post-deploy Verification

- [ ] Health endpoint returns 200: `curl http://localhost:4000/health`
- [ ] Web serves homepage: `curl -s http://localhost:3000 | head -5`
- [ ] API `/api/chains` returns the current live chain count from `ROADMAP.md` (currently 170+ live)
- [ ] Login with wallet: `/api/auth/nonce` → `/api/auth/login`
- [ ] GM off-chain: `POST /api/gm`
- [ ] Scan: `POST /api/scan` with valid address
- [ ] Profile: `/api/auth/me`
- [ ] Creator dashboard: `/api/creator/stats`
- [ ] Circuit breaker/metrics: use admin metrics endpoints for detailed internals; `/api/circuit` is currently listed in audit 2026-06-05 for public exposure review.

### 5. Staging Configuration

For staging, use `docker-compose.staging.yml` (or override file):

```bash
# Build with staging ARG
docker compose -f docker-compose.prod.yml build \
  --build-arg NODE_ENV=production
```

Or create a `docker-compose.staging.yml` with:
- Different ports (4001/3001)
- Staging CORS_ORIGIN
- Staging domain names

### 6. Rollback

```bash
# Tag current images before deploying new version
docker tag wcore-web-api:latest wcore-web-api:v0.1.13
docker tag wcore-web-web:latest wcore-web-web:v0.1.13

# To rollback
docker tag wcore-web-api:v0.1.13 wcore-web-api:latest
docker tag wcore-web-web:v0.1.13 wcore-web-web:latest
docker compose -f docker-compose.prod.yml up -d api web
```

### 7. Backup

```bash
# Backup Postgres
docker exec wcore-postgres-prod pg_dump -U wcore wcore > backup-$(date +%Y%m%d).sql

# Backup Redis
docker exec wcore-redis-prod redis-cli SAVE
docker cp wcore-redis-prod:/data/dump.rdb redis-backup-$(date +%Y%m%d).rdb
```

### Environment Variables Reference

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DB_USER` | No | wcore | Postgres user |
| `DB_PASSWORD` | **Yes** | — | Postgres password |
| `DB_NAME` | No | wcore | Database name |
| `DB_PORT` | No | 5432 | Postgres port |
| `REDIS_PASSWORD` | **Yes** | — | Redis auth |
| `REDIS_PORT` | No | 6379 | Redis port |
| `JWT_SECRET` | **Yes** | — | JWT signing key (64+ chars) |
| `CORS_ORIGIN` | **Yes** | — | Allowed CORS origin |
| `API_PORT` | No | 4000 | API listen port |
| `WEB_PORT` | No | 3000 | Web listen port |
| `NEXT_PUBLIC_API_URL` | **Yes** | — | API URL for browser |
| `NEXT_PUBLIC_WC_PROJECT_ID` | No | — | WalletConnect ID |
| `RATE_LIMIT_SCAN` | No | 60 | Scan rate limit |
| `RATE_LIMIT_AUTH` | No | 30 | Auth rate limit |
| `TRUST_PROXY` | No | loopback | `true`, `false`, or CIDR — see Reverse proxy section |
| `LOG_LEVEL` | No | info | pino level (`debug` / `info` / `warn` / `error`) |
| `SCAN_CONCURRENCY` | No | 50 | Per-scan chain concurrency. >50 saturates public RPCs. Single source of truth: `apps/api/src/plugins/scan.ts:13`. |
| `ADMIN_TOKEN` | No | — | Protects /admin + /api/admin/* |
| `ALERT_WEBHOOK_URL` | No | — | Webhook for circuit/health alerts |
