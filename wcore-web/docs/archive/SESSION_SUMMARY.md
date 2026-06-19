# WCORE Web — Session Summary & Handoff

## Dernier commit : `fix(audit-final): 27/27 complete`

## État final v0.1.18-post-audit

| Indicateur | Valeur |
|-----------|--------|
| Core tests | 89/89 |
| API tests | 34/34 |
| E2E tests | 7/7 |
| Web unit | 3/3 |
| **Total** | **133/133** |
| Typecheck | 5/5 |
| Docker API build | OK |
| Docker Web build | OK |
| Staging validated | `/admin`, health, SIWE, PDF, share |
| Audit | 27/27 fixed |

### Ce qui a été fait (v0.1.16 → v0.1.18)

- **v0.1.17** — Plans, usage dashboard, upgrade UX, pricing page (Stripe retired in v0.2.21)
- **v0.1.18** — Share reports: public scan links, share tokens
- **v0.1.18-post-audit** — Full audit: 27 bugs fixed across all layers

### Architecture

```
wcore-web/
├── apps/
│   ├── api/          # Fastify port 4000
│   │   └── src/
│   │       ├── server.ts        # Routes, rate-limit, circuit breaker, admin, share
│   │       ├── auth.ts          # SIWE login (FIXÉ — chainId bypass)
│   │       ├── gamification.ts  # GM, contrats, sync (FIXÉ — deploy timeout)
│   │       ├── support.ts       # Tickets
│   └── web/          # Next.js 16 port 3000
│       ├── app/
│       │   ├── page.tsx              # Homepage (scans left badge)
│       │   ├── pricing/page.tsx      # Pricing page (NEW)
│       │   ├── admin/page.tsx        # Admin dashboard
│       │   ├── profile/page.tsx      # Profile (plan card)
│       │   ├── wallet/[address]/     # Wallet scan
│       │   ├── scans/[id]/page.tsx   # Scan detail (share button)
│       │   └── share/[token]/page.tsx # Public share (NEW)
│       └── components/
│           ├── ConnectButton.tsx      # Auth states + JWT expiry (FIXÉ)
│           ├── GmButton.tsx           # GM UI
│           ├── ChainCard.tsx          # Per-chain GM (FIXÉ — factories)
│           ├── MultiWalletPdfExport.tsx # Multi-wallet PDF
│           ├── PdfExport.tsx          # PDF v2
│           └── scam-detector.ts       # (FIXÉ — Array.from)
├── packages/
│   ├── core/         # Business logic (FIXÉ — cosmos timeout, stablecoin, dispatcher, circuit breaker, metrics)
│   ├── shared/       # Zod schemas
│   └── db/           # Prisma schema (shareToken)
└── docker-compose.prod.yml  # Production deployment (FIXÉ — HEALTHCHECK node)
```

### Commandes

```powershell
# Typecheck tout
pnpm -r typecheck

# Tests
pnpm --filter @wcore/core test
$env:NODE_ENV = "test"; pnpm --filter @wcore/api test

# Redémarrer API
$p = Get-NetTCPConnection -LocalPort 4000 | % OwningProcess; if ($p -and $p -gt 0) { Stop-Process -Id $p -Force }
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd C:\Users\strau\wcore-web; pnpm --filter @wcore/api dev" -WindowStyle Hidden

# Redémarrer Web
$p = Get-NetTCPConnection -LocalPort 3000 | % OwningProcess; if ($p -and $p -gt 0) { Stop-Process -Id $p -Force }
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd C:\Users\strau\wcore-web; pnpm --filter @wcore/web dev" -WindowStyle Hidden

# Push schema
pnpm --filter @wcore/db db:generate && pnpm --filter @wcore/db db:push --accept-data-loss

# Déploiement staging
docker compose -f docker-compose.prod.yml --env-file .env.production.local up -d
```

### Reste à faire (post v0.1.18)

- [ ] Email/web notifications
- [ ] Referral/invite codes
- [ ] Team/multi-seat accounts
- [ ] OnchainV3 multi-RPC (not just endpoints[0])
- [ ] WalletConnect deploy support (useOnChainGm window.ethereum bypass)
- [ ] Redis real cache in multi-instance (currently memory fallback)
