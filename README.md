# WCORE

WCORE is a read-only multi-chain wallet tracking system. It helps users inspect balances, pricing, scam-token risk, CEX holdings, and cross-chain GM activity without requiring wallet connection for portfolio scans.

Production site: https://wcore.xyz

## Repository Layout

```text
WCORE/
├── wcore-web/      # Next.js web app, Fastify API, Prisma DB, shared packages
└── wcore-gsheet/   # Google Apps Script runtime and canonical chain configs
```

## Main Components

- `wcore-web/apps/web` — Next.js 16 frontend.
- `wcore-web/apps/api` — Fastify API, scan orchestration, auth, GM, CEX integrations.
- `wcore-web/packages/core` — wallet scan engines and pricing cascade for EVM, SVM, Cosmos, and TON.
- `wcore-web/packages/shared` — shared cache keys, chain metadata helpers, factories, types.
- `wcore-gsheet/src` — Google Apps Script source and canonical chain configs.
- `wcore-gsheet/dist` — generated `@wcore/chains` package consumed by the web runtime.

## What WCORE Tracks

- 180+ chain configs across EVM, Solana/SVM, Cosmos SDK, and TON.
- Read-only wallet scans, multi-wallet portfolio views, and public share reports.
- Multi-source pricing cascade: stablecoin fast-path, cache, DefiLlama, DexScreener, GeckoTerminal, Jupiter, CoinGecko fallback.
- Scam-token filtering and clean-total calculations.
- Optional CEX account imports using read-only API keys.
- Cross-chain GM contracts, streaks, and leaderboard features.

## Local Development

Generate the chain package first when starting from a fresh clone or after changing `wcore-gsheet/src/*.gs`:

```powershell
cd wcore-gsheet
npm install
npm run build:chains
```

Then install and verify the web workspace:

```powershell
cd wcore-web
pnpm install
pnpm build
pnpm test
```

From the repo root, the wrapper scripts delegate into `wcore-web` and `wcore-gsheet`:

```powershell
pnpm typecheck
pnpm test
pnpm sync:chains
```

## Deployment Safety

- Use `wcore-web/scripts/deploy.ps1 -Service api|web` for Railway deploys.
- Do not run `railway up` manually from the repo root: `railway.json` is a shared mutable deploy config and defaults to the web Dockerfile.
- Do not deploy API and web in parallel; the deploy script temporarily rewrites `railway.json`.

For detailed setup, see:

- `wcore-web/README.md` for the web/API runtime.
- `wcore-gsheet/README.md` for the Google Sheets + Apps Script runtime.
- `ROADMAP.md` for cross-runtime WCORE status and harmonization backlog.
- `wcore-web/ROADMAP.md` for web/API runtime status and release history.
- `wcore-web/docs/AUDIT.md` for the current web audit backlog.

## Security Notes

- Do not commit secrets, API keys, private keys, Railway tokens, database URLs, or `.env*` files.
- CEX keys must be read-only and stored through runtime secrets, never in source code.
- Public scans are read-only. Portfolio scanning does not require wallet signing.

## License

No license file is currently provided. All rights reserved unless a license is added later.
