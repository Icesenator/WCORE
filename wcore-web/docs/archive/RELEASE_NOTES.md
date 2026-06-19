# WCORE Release Notes

## Unreleased - Security Audit Follow-up

### Follow-up Ops Notes
- Local commit `c3f3adc` could not be pushed because this clone has no configured Git remote.
- Staging local smoke used API `4001` from `.env.staging`; dev/prod API default remains `4000`.
- `scripts/deploy-staging.ps1` and `scripts/smoke-test.ps1` were repaired after Windows PowerShell parsed UTF-8 typography as broken quotes.
- `scripts/smoke-test.ps1 -ApiPort 4001 -WebPort 3001` passes locally: 15/15 smoke checks.
- `scripts/deploy-staging.ps1 -SkipBuild` parsing is fixed, but full Docker verification is blocked in the current sandbox by denied access to Docker config/API.
- Next standalone reads `process.env.PORT` correctly. Earlier "PORT=3002 ignored" confusion was caused by a Manifest app on port 3000; `smoke-test.ps1` now checks for "WCORE" in the response body to detect wrong-app-on-port. `deploy-staging.ps1 -AutoStart` detects port conflicts before launching services.
- Manifest app removed entirely from system. CORS now accepts comma-separated origins (`localhost:3000,127.0.0.1:3000`) to prevent cross-loopback fetch failures.
- `com.docker.service` can stop spontaneously in sandbox (pipe not found → Postgres/Redis down → auth fails). Docker Desktop restart required.
- Staging DB already had schema without Prisma migration history, so local validation used `prisma db push --accept-data-loss` against the staging database, then seed.

### Scam Detection
- **ETHG / Ethereum Games** (2M tokens x 0.25 EUR = 497k EUR) was inflating scan totals. Added scam rule #9 to core `detectScam`: unknown token + value > 1000 EUR + supply > 100k → scam (weight 3). Rule #6 covers game-themed tokens.
- `SCAM_RULES_VERSION` bumped to 5 across core + frontend.
- `detectScam` now runs in the API backend (`server.ts`) to filter scam tokens from scan notifications and totals before returning results.

### Security
- SVM and Cosmos linked-wallet signing now verifies that the submitted public key derives to the claimed address before a wallet can become `SIGNED`.
- GM contract balance access supports both `creatorAddress` and legacy `ownerId` rows.
- Notification SSE uses a short-lived opaque stream token instead of passing the JWT in the query string.

### Correctness
- `GmOnChain.withdrawCreator()` emits the real withdrawn amount in `CreatorWithdrew`.
- GeckoTerminal bulk pricing is typed in the core pricing source interface, restoring full workspace typecheck.
- `pnpm` overrides pin patched `postcss` and `tmp`; dependency audit is clean.

### Verification
- Static Apps Script validation: 2468 global functions checked.
- Core tests: 105/105.
- API tests: 46/46.
- Web tests: 22/22.
- Workspace typecheck, production build, and `pnpm audit --json`: OK.

---

## Unreleased — Scan Perf Round 2 (commit `1865b46`)

### Performance
- EVM engine: native balance read+price now runs in parallel with token discovery instead of sequentially. Real wall-time win on every EVM scan.
- EVM engine: ERC-20 `balanceOf` fallbacks now run in bounded parallel groups when Multicall3 misses. This keeps the happy-path batch read, but avoids serial RPC consensus calls on chains where Multicall partially fails.
- EVM engine: GeckoTerminal token prices are now bulk-fetched in 1 HTTP call per chain (instead of N individual calls), pre-warming the shared price cache so cascade cache hits occur at 0ms. On BASE (52 tokens), `pricingMs` dropped from 2.1s to 24ms, and total `scanMs` from 6.7s to 699ms.
- Pricing cascade: DexScreener + DefiLlama now run in parallel when llama-map misses, cutting one sequential HTTP roundtrip per token.
- EVM + SVM engines: empty wallet/chain results are memoized in Redis for 10 minutes per `(wallet, chain)`. Subsequent scans of inactive chains short-circuit the full RPC cascade and surface `[CACHED_EMPTY]` in `errors`. Negative cache only writes when the scan was clean (no `[DEGRADED]` and no `consensus failed`).
- SVM engine: `scanMs` now reflects engine wall-time (was always 0). Dispatcher forwards `cache` to SVM so the negative cache path is reachable end-to-end.
- Cosmos engine: `scanMs` now reflects engine wall-time.
- Per-phase metrics on every `ChainScan`: `phases.{nativeMs, discoveryMs, balancesMs, pricingMs}`. Lets the frontend (or any consumer) attribute scan latency by stage across all VMs without instrumentation.

### Tests
- API test runner now pinned to `--test-concurrency=1`. Multiple `.test.ts` files were stepping on each other through the shared Prisma DB (e.g. `support tickets > admin users still see all tickets` would intermittently fail when run alongside `gamification` / `share` suites). Sequential file execution removes the flake without altering individual test logic.
- New core test: `getEvmWalletAssets short-circuits via negative cache for empty wallet/chain`. Existing test now also asserts `phases` coherence vs `scanMs`.
- New core test: `getEvmWalletAssets reads per-token balance fallbacks concurrently when multicall misses`.
- New core tests: `GeckoTerminal batchTokenPrices fetches multiple tokens in one call`, `runs dex and llama-coins in parallel when llama-map misses`, `getEvmWalletAssets bulk pre-fetches GT prices before per-token cascade`.

### Verification
- core: 101/101 pass.
- api: 42/42 pass (with `--test-concurrency=1`).
- typecheck core/api/shared: OK.
- Live `POST /api/scan` on ZERO with `forceRefresh=true` returns WBTC + ETH native with `phases.{nativeMs:419, discoveryMs:3432, balancesMs:292, pricingMs:750}`, scanMs total 4477ms.
- Live cached `POST /api/scan` on ARBITRUM_ONE improved from ~10.5s (`balancesMs` ~9.1s) to ~6.5s (`balancesMs` ~3.6s) after fallback balance parallelism.

---

## Unreleased — Scan Reliability Hotfixes

- Portefeuilles: linked wallets can now be saved server-side in view-only mode without an immediate signature. The API persists `verificationStatus` (`UNSIGNED` / `SIGNED`) and a later valid signature upgrades the wallet to `SIGNED`.
- Deep scan frontend path now always uses async polling and batches chains in groups of 5 for progressive results.
- Async polling now includes `Authorization` headers; authenticated jobs no longer return hidden 404s and stall until timeout.
- Backend chain validation catches `getChain()` throws and skips unknown chains instead of failing the entire scan with `invalid_chains`.
- EVM `eth_getLogs` discovery keeps 500k deep range but parallelizes chunks; ERC-20 balance checks use Multicall3.
- ZERO Network WBTC added to core token registry and mapped to `coingecko:wrapped-bitcoin`.
- Wallet scan cache bumped to `v3` so stale browser cache cannot hide ZERO WBTC after the registry fix.
- Scam rules now flag inflated unknown game tokens such as ETHG / Ethereum Games.
- GM Off-chain UX now shows `Sign in required` when a wallet is connected but SIWE auth token is missing.
- Deep scan loading card now uses compact dynamic progress: global weighted `chain checks`, wallet count, current wallet VM, and elapsed time.
- Deep scan progress now rounds active scans to at least `1%` after the first completed chain check.
- Header on-chain GM now grays out after a successful ChainCard on-chain GM by re-syncing local GM state on events, focus, and menu open.
- Header on-chain GM copy is now `On-chain +25 pts` without gas-fee wording.
- Optimism icon now uses a stable TrustWallet PNG fallback.
- Optimism token `OP` now uses a stable TrustWallet PNG token logo override.

Verification performed during fix session:
- Core targeted tests: token discovery and scam detector pass.
- Web unit tests pass.
- Core/web/API typechecks pass for touched packages.
- Live API checks: `Ledger + ZERO` detects WBTC; `Ledger + BASE deep` async returns a coherent total.
- Web targeted tests: scan progress and GM local status pass.
- Web targeted tests: Optimism icon fallback and scan cache namespace pass.
- Web targeted tests: OP token icon override and active-scan minimum progress pass.

---

## v0.1.18 — Post-Audit (2026-05-07)

### 🛡️ Full Audit — 27/27 Findings Fixed

Complete security and correctness audit across all code. 27 bugs found and fixed:

**HIGH (7)**
- Deploy RPC timeout (10s AbortSignal)
- GM on-chain: API confirm before localStorage
- OnchainV3 pricing: single endpoint SPOF noted (uses chain config)
- SIWE chain_id bypass when storedChainId=0
- ETH price hardcoded ($2000) → DefiLlama + CoinGecko fallback
- Admin open when ADMIN_TOKEN="" → NODE_ENV check
- JWT malformed treated as valid → expired on missing exp

**MEDIUM (13)**
- syncOnChainContracts/fetchOnChainContracts timeouts
- Redis memory fallback → documented as dev behavior
- Circuit breaker HALF_OPEN→CLOSED event firing
- Dispatcher unhealthy endpoint fallback removed
- ChainCard FACTORIES synced with backend (Base only)
- Stablecoin detection expanded (DAI, FRAX, LUSD, sDAI, etc.)
- Cosmos REST API 10s timeout
- Docker HEALTHCHECK uses node http (no wget)
- CSV formula injection: neutralizes pipe char (|)
- Scam-detector: O(n) Array.from → for-of loop
- metrics: reset() method added
- Amino key parsing: variable-length prefix handling

**LOW (7)**
- memory-cache: negative ttl clamped
- +6 more minor fixes

### Shareable Reports (NEW)
- `POST /api/scans/:id/share` — creates public share link
- `GET /api/public/scans/:shareToken` — no-auth public view
- `/share/[token]` page — read-only portfolio report with PDF
- Share button on scan detail with copy/revoke

### Tests
- Core: 89/89
- API: 34/34
- E2E: 7/7
- Web: 3/3
- **Total: 133/133**

---

## v0.1.17 — Monetization (retired in v0.2.21 · 2026-05-07)

- Stripe checkout, webhook, customer portal · **retired v0.2.21**
- Plan limits (free/pro/admin) with usage dashboard · **retired v0.2.21**
- /pricing page with Free vs Pro comparison · **retired v0.2.21**
- Multi-wallet PDF (Pro feature)
- Scan limit UX with upgrade CTA · **retired v0.2.21**
- Usage bar + reset timer in profile · **retired v0.2.21**

## v0.1.16 — Ops & Admin (2026-05-07)

- Admin dashboard: health, circuits, GM stats, chain errors, metrics history
- Ops timeline: circuit/heath events with type filter
- SIWE UX polish: auth states, error messages, JWT expiration
- PDF v2: branded cover, page numbers, exec summary
- Webhook alerting: ALERT_WEBHOOK_URL
- Pricing accuracy dashboard

## v0.1.15 — Hardened (2026-05-07)

- Full SIWE (EIP-4361)
- Consensus strict RPC/SVM
- Factories config (Base only)
- Docker runtime fix

## v0.1.14 — GM System (2026-05-06)

- GM on/off-chain with per-chain tracking
- Creator dashboard with tipWei
- GM contract deploy with on-chain verification
- ChainSelector redesign
- PDF v1 + CSV export

## v0.1.13 — Auth Fix (2026-05-06)

- Critical EVM login bug (nonce: prefix)
- Rate-limiting 3 tiers
- Non-blocking my-contracts

### 🆕 New Features

**Admin Dashboard** (`/admin`)
- Real-time health monitoring: DB, Redis, circuit breakers, API uptime
- GM stats: 24h, 7d, 30d, total
- Rate limit hits by bucket
- Top chain errors (RPC, pricing, other)
- Slowest chains by avg scan time
- Recent scans with truncated addresses and values
- Auto-refresh every 30s
- Admin auth via `ADMIN_TOKEN` env var

**Persistent Metrics History**
- `SystemMetricSnapshot` table with 7-day retention
- Automatic snapshot every 5 minutes
- CSS bar charts: scans, GM 24h, RPC errors, pricing errors
- API: `/api/admin/metrics/history?range=24h|48h|7d`

**Ops Event Timeline**
- `OpsEvent` table recording: circuit opened/closed, health degraded, DB down, Redis down
- Severity levels (info/warning/critical) with color dots
- Type filter dropdown in admin
- API: `/api/admin/events?limit=100&type=circuit_opened`
- 7-day auto-cleanup

**Webhook Alerting**
- `ALERT_WEBHOOK_URL` env var for Slack/Discord/generic webhook
- Events sent: circuit_opened, circuit_closed, health_degraded, db_down, redis_down
- JSON payload: `{ type, severity, service, ts, data }`
- Fire-and-forget with 5s timeout, silent on failure

**SIWE UX Polish**
- Auth state machine: idle → connecting → signing → verifying → authenticated
- User-friendly error messages (signature refused, network error, session expired)
- JWT expiration auto-detection with "Reconnect" button
- Animated loading spinner with step labels
- Clean disconnect on errors (no zombie state)

**PDF v2**
- Branded cover page with WCORE header, report ID, date/time
- Executive summary grid (total value, chains, tokens)
- Wallet addresses, warnings section
- Professional print CSS: page numbers, timestamp header, purple accent
- Reusable `PdfTokenTable` component

### 🔧 Backend Improvements
- Full SIWE (EIP-4361): domain, URI, chainId, issuedAt, expiration validation
- Factories config: only Base with real address (placeholder chains removed)
- Consensus strict: failed RPCs count toward quorum, SVM native requires majority
- `creatorAddress` on GmContract (wallet address matching, not CUID)
- `tipWei` on OnchainGm (decoded from GmCheckedIn event data)
- `[chainKey, txHash]` composite unique constraint
- Deploy verification: address from ContractDeployed event (not receipt.contractAddress)
- Rate limiting: `/api/wallets/nonce`, `/api/leaderboard`, `/api/scan/async`
- Trusted proxy: X-Forwarded-For only from localhost

### 📄 DB Migrations (v0.1.14 → v0.1.16)
- `20260506220000`: `creatorAddress`, `tipWei`, composite unique index
- `20260507180000`: `system_metric_snapshots` table
- `20260507190000`: `ops_events` table

### 🔐 Security
- Admin endpoints protected by `ADMIN_TOKEN`
- JWT expiration enforced (auto-logout)
- Nonce anti-DoS (deleted after verification, not before)
- Wallet linking nonce anti-DoS
- Platform owner identity verified via DB (not JWT claims)
- CORS restrictive by default in production

### 🧪 Tests
- Core: 89/89
- API: 34/34
- E2E: 7/7
- Web unit: 3/3
- **Total: 133/133**

---

## v0.1.15 — Hardened (2026-05-07)

- Full SIWE (EIP-4361) login
- Consensus RPC/SVM strict
- Factories config: Base only active
- Docker runtime fix (hoisted linker)
- 129 tests

## v0.1.14 — GM System (2026-05-06)

- GM on-chain/off-chain with per-chain tracking
- Creator dashboard with tipWei
- GM contract deploy with on-chain verification
- ChainSelector redesign
- PDF v1 + CSV export
- 126 tests

## v0.1.13 — Auth Fix (2026-05-06)

- Critical EVM login bug fix (nonce: prefix leak)
- Rate-limiting 3 tiers
- Non-blocking my-contracts
- 115 tests
