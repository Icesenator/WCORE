# WCORE Web — Audit consolidé unique

> **Date** : 2026-06-11 · **Périmètre** : monorepo `wcore-web` (apps/api Fastify, apps/web Next.js 16, packages/core, packages/shared, packages/db Prisma)
> **Score global : 8.8 / 10 (A-)** — en hausse vs 8.6 au 2026-06-07 (8 findings P0/P1/P2 vérifiés corrigés dans le code depuis).
> **Ce fichier est LA source unique d'état d'audit.** Il consolide et remplace les 12 rapports datés du 2026-05-11 au 2026-06-07 (conservés dans l'historique git, commit `6ef62a7` et antérieurs). Toute évolution se fait ICI : on coche, on ajoute, on ne crée plus de nouveau fichier daté.

---

## 1. Synthèse exécutive

| Axe | Note | Tendance | Commentaire |
|-----|------|----------|-------------|
| Sécurité | A- | ↗ | 0 vuln deps, CSRF/SIWE/cookies durcis, status-onchain authentifié et cache court. Reliquat : metrics publics, DNS rebinding. |
| Fiabilité scan | A- | ↗ | forceRefresh propagé, liveness empty-cache, TTL empty EVM harmonisé à 10 min, consensus zéro durci, per-chain timeout. Reliquat : jobs en mémoire. |
| Tests | B+ | ↗ | 71 fichiers / ~350 tests. Trous : routes `/api/scan/async|batch`, `useScanOrchestrator`, POST `/api/gm/onchain` E2E. |
| Performance | B+ | → | compress + mget partiel + intraScanCache. Reliquat : writes Redis non pipelinés, AllTokensTable non virtualisée. |
| Qualité code | B | ↘ | Régression lint (34 erreurs vs 0 au 05-30). Duplications QUAL connues. scan.ts 612 LOC. |
| Docs / DX | B+ | ↗ | TROUBLESHOOTING créé, .nvmrc créé, audits consolidés. Manque : CONTRIBUTING, TESTING, split AGENTS.md. |

**Top 3 risques actuels** : (1) endpoints observabilité publics, (2) `useScanOrchestrator` sans tests dédiés, (3) POST `/api/gm/onchain` sans E2E complet.

---

## 2. Méthodologie et sources

- **Consolidation** de 12 rapports : audit-2026-05-21(.md/-complet), -05-23, -05-24, -05-27, -05-28, -05-29, -05-30(+extended), -06-05, -06-07, archive/AUDIT.md (baseline v0.1.x), plan `2026-06-05-audit-fixes-p0-p1.md`.
- **Re-vérification code le 2026-06-11** : chaque finding « ouvert » du rapport le plus récent a été confronté au code réel (`fichier:ligne`). Résultat : 8 findings étaient déjà corrigés mais jamais cochés — la dérive doc/code constatée aux audits 05-24 et 06-07 se répète ; d'où ce fichier unique.
- **Convention statuts** : `[ ]` ouvert · `[x]` corrigé (avec preuve) · `[~]` partiel.

### État vérifié au 2026-06-11 (réconciliation)

| Finding (audit 06-07) | Verdict 06-11 | Preuve |
|---|---|---|
| P0-1 Bearer permissif | **CORRIGÉ** | `apps/api/src/auth.ts:170-174` — deny-by-default en prod, Bearer seulement si `AUTH_ALLOW_BEARER === "true"` |
| P0-2 status-onchain non protégé | **CORRIGÉ** (auth+ownership+zod + cache court 5 min) | `gm-onchain.ts` + roadmap 2026-06-20 |
| P0-3 tests routes scan | **CORRIGÉ** | `apps/api/test/scan-plugin-routes.test.ts` — async/batch couverts (23/23), bugs `forceRefresh` async + batch invalid address corrigés |
| forceRefresh non propagé (06-05 P0-1) | **CORRIGÉ** | `scan.ts:116,315,394,513` + `evm-scan.ts:125`, `svm.ts:102`, `cosmos.ts:128` |
| `strict:false` web | **CORRIGÉ** | `apps/web/tsconfig.json:14` |
| @fastify/compress absent | **CORRIGÉ** | `server.ts:225` |
| Indexes DB manquants | **CORRIGÉ** (+ test de garde) | `schema.prisma:38,171-172,189-191,221-222`, `schema-indexes.test.ts` |
| N+1 `/api/gm/random` | **CORRIGÉ** | `gm-contracts.ts:225-233` (batch findMany + Set) |
| next/dynamic absent | **CORRIGÉ** (4 usages) | HomePageClient, TopBar, WalletContent, ScanDetailClient |
| error.tsx 1 seul global | **PARTIEL** (4 routes : global, history, gm, profile) | `apps/web/app/**/error.tsx` |
| .nvmrc absent | **CORRIGÉ** | `.nvmrc` = `20` |
| rate-limit pré-auth (06-05 P1-2) | **CORRIGÉ** | `rate-limit-hook-order.test.ts` |
| EVM empty cache sans liveness | **CORRIGÉ** (liveness ✅ `canServeEmptyCache`, TTL EVM 10 min) | `evm-balances.ts:115-131`, `evm-scan.ts`, `evm-batch.ts` |
| RealT cache sans TTL | **CORRIGÉ** | `realt.ts` — `REGISTRY_REDIS_SAFETY_TTL_MS` 7 j appliqué à `realt:registry:v2` |
| @tanstack/react-query mort | **INVALIDÉ** — peer requirement wagmi (QueryClientProvider) | `Web3Provider.tsx:3,10,15` |
| @fastify/rate-limit mort | **CORRIGÉ** | retiré de `apps/api/package.json` + `pnpm-lock.yaml` |
| Chemins hardcodés contracts/ | **CORRIGÉ** | `compile-v0.8.19.js`, `patch-build-json.js` utilisent `__dirname` / `path.join` |
| CONTRIBUTING / TESTING | **OUVERT** | absents |

---

## 3. Findings OUVERTS

### P0 — Critique (à traiter cette semaine)

- [x] **P0-1 · `AUTH_ALLOW_BEARER` permissif par défaut** — ✅ corrigé 2026-06-11 : deny-by-default quand `NODE_ENV=production` (`apps/api/src/auth.ts:170-174` — Bearer seulement si `AUTH_ALLOW_BEARER === "true"` en prod ; hors prod, actif sauf `false`). Documenté dans `.env.example`. Le seul Bearer frontend restant est l'`ADMIN_TOKEN` (vérifié par `admin-auth.ts`, voie séparée).
- [x] **P0-2 · Routes `/api/scan/async` et `/api/scan/batch` : 0 test** — ✅ corrigé 2026-06-11 : `apps/api/test/scan-plugin-routes.test.ts` (23/23, sans DB/réseau : deps injectées + chaîne fake fail-fast + cache seedé). Couvre : 400 body/address/chains, 503 circuit_open, lifecycle job async, ownership user/IP, cache-served vs forceRefresh, fire-and-forget history. **2 bugs réels trouvés et corrigés en l'écrivant** : (1) la route async ne passait pas `forceRefresh` à l'engine (`scan.ts:525`) → `empty:*` non bypassé en async ; (2) adresse invalide dans `/api/scan/batch` → throw 500 au lieu de 400 (`scan.ts:221-228`).

### P1 — Haute priorité (sprint en cours / suivant)

- [x] **P1-1 · TDZ `sendLogin` ConnectButton + lint rouge** — ✅ corrigé 2026-06-11 : `sendLogin` déclaré avant `signAndLogin`/`signAndLoginRaw` + listé dans les deps, `cause` attaché aux erreurs wallet, `wagmiChainId` mort retiré. `pnpm lint` : **0 erreur, 0 warning** (était 34/8). Autres fichiers purgés : server.ts (2 imports morts dont `checkRateLimit` dupliqué), DeployClient (interface vide → type alias), scam-overrides (useless assignment), contracts/*.js (globals node dans eslint.config.mjs).
- [ ] **P1-2 · N+1 GM upserts cold-start** — `gm-contracts.ts:300-357`, `gm-routes.ts:141-158` : boucles `findFirst`+`upsert` séquentielles (10+ queries/user) sur has-deployed/status. **Fix** : `findMany` + `createMany({ skipDuplicates: true })`. *Effort : ½ j.*
- [x] **P1-3 · Dep morte `@fastify/rate-limit`** — ✅ retirée 2026-06-11 (`pnpm --filter @wcore/api remove`).
- [x] **P1-4 · RealT `realt:registry:v2` sans TTL Redis** — ✅ corrigé 2026-06-11 : safety TTL 7 j sur l'écriture Redis (`realt.ts` — `REGISTRY_REDIS_SAFETY_TTL_MS`), staleness logique 6h + stale fallback inchangés.
- [ ] **P1-5 · `useScanOrchestrator` 0 test** — `apps/web/hooks/useScanOrchestrator.ts` (~490 LOC, 18 useState/9 useRef) : polling, merge progressif, abort, circuit breaker frontend non testés. *Effort : 1 j.*
- [ ] **P1-6 · POST `/api/gm/onchain` sans E2E** — `gm-onchain.ts:26-365` : anti-replay, score, streak rebuild = flow monétisation sans test bout-en-bout. *Effort : 1 j.*
- [x] **P1-7 · `deploy.ps1` exit code masqué** — ✅ déjà corrigé (commit `cc67375`, v0.2.40) : `$deployExitCode` capturé avant le `finally` (`scripts/deploy.ps1:24,30,35`). Finding listé ouvert par erreur (drift doc/code). Nit d'interpolation PowerShell du warning stale-lock corrigé au passage.
- [ ] **P1-8 · ChainCard scam matching symbol-only** — `apps/web/components/ChainCard.tsx:103-115` : `blocked.has(sym)` au lieu des helpers contract-aware → totaux incohérents avec TokenTable/WalletContent. *Effort : ½ j.*
- [ ] **P1-9 · SSRF gaps `safe-http`** — `apps/api/src/lib/safe-http.ts:6-7` : la regex `PRIVATE_HOSTNAME` ne bloque ni `0.0.0.0` ni `::ffff:127.0.0.1`. *Effort : 1 h + tests.*

### P2 — Moyen terme (mois)

**Sécurité**
- [ ] **P2-1 · Endpoints observabilité publics** — `/api/stats`, `/api/circuit`, `/api/metrics/errors(/detail)`, `/api/admin/scam-overrides` exposent l'état interne (récurrent depuis 5 audits). **Fix** : admin-only ou `x-admin-token`. *½ j.*
- [ ] **P2-2 · DNS rebinding non appliqué** — `assertNoDnsRebind()` défini (`safe-http.ts:32-50`) mais pas utilisé sur les fetch RPC gamification. **Fix** : wrapper `safeFetchPublicHttp()` systématique. *½ j.*
- [ ] **P2-3 · Access token 24h sans révocation user-level** — `auth.ts:44`. **Fix** : TTL 1h + refresh flow, ou `jti` + blacklist. *½ j.*
- [ ] **P2-4 · Jobs scan anonymes lisibles par tout authentifié** — `scan.ts:783-790` (`userId=undefined`). **Fix** : binder un token de session anonyme au job. *½ j.*
- [x] **P2-5 · Cache court manquant sur status-onchain** — ✅ corrigé 2026-06-20 : cache mémoire 5 min par `(chain,address,UTC day)` pour éviter les `eth_getLogs` répétés.

**Performance**
- [x] **P2-6 · `prisma.walletScan.create` await dans le response path** — ✅ corrigé 2026-06-11 : persistence historique fire-and-forget avec `.catch`, sans bloquer la réponse.
- [x] **P2-7 · Cache check Redis séquentiel** — ✅ corrigé 2026-06-11 : cache scan sync/batch lu par `mget` au lieu de N round-trips.
- [ ] **P2-8 · Writes Redis non pipelinés / intraScanCache non partagé cross-batch / RpcHealth instance par scan** — `redis-store.ts:70-80`, `scan.ts:229,410,676`. *1-2 j cumulés.*
- [ ] **P2-9 · AllTokensTable sans virtualisation ni memo** — `AllTokensTable.tsx:32-68` (110k DOM nodes potentiels) ; `TokenTable` non memoizé. *1 j.*
- [ ] **P2-10 · `RpcHealthTracker` sans decay** — `rpc/rpc-health.ts:32-50` : échecs accumulés à vie, pool RPC rétrécit sur session longue (le decay existe sur CircuitBreaker, pas ici). *½ j.*
- [x] **P2-11 · EVM empty cache TTL 1h asymétrique** — ✅ corrigé 2026-06-19 : TTL réduit à 10 min dans `evm-scan.ts` et `evm-batch.ts`, avec tests de garde single-wallet + batch dans `evm.test.ts`. Liveness native inchangée via `canServeEmptyCache`.
- [ ] **P2-12 · `snapshotMetrics` 3 COUNT + 2 deleteMany / 5 min** — `server.ts:190-194`. *1-2 h.*

**Qualité / cohérence**
- [ ] **P2-13 · Duplications QUAL** — `calcCleanChainValue` triplé, triple cast detectScam, `any[]` evm-batch, `detectChainType` dupliqué 3×, `AuthUser` dupliqué, duplication structurelle evm-scan/evm-batch. *1-2 j cumulés.*
- [ ] **P2-14 · Stables EUR jamais flaggées** — EURC/EURS/EURE sans `isStable` → fast-path EUR mort (`evm-pricing.ts:90`, `evm-batch.ts:507`). *½ j.*
- [ ] **P2-15 · Cosmos : staking partiel down peut écrire un native cache zéro ; denoms non-IBC inconnus default 6 décimales** — `cosmos.ts:173-242,508`. *½ j.*
- [ ] **P2-16 · TON engine ignore `opts.sources`** — `engines/ton.ts`. *1 h.*
- [ ] **P2-17 · GM API reliquats** — fan-out RPC `/api/gm/random` non borné (by-design mais sans cap), share sans `expiresAt` défaut, deploy recovery écrase `creatorAddress`. *1 j cumulé.*

**Infra / DX / Docs**
- [ ] **P2-18 · `config.ts` central zod** — 18 fichiers lisent `process.env` directement (server.ts 32×, auth.ts 10×). *1 j.*
- [x] **P2-19 · Chemins Windows hardcodés contracts/** — ✅ corrigé 2026-06-11 : chemins construits via `__dirname` / `path.join`, scripts portables hors `C:/Users/strau/...`.
- [ ] **P2-20 · Dockerfile API non pruné (~500 MB)** — `apps/api/Dockerfile:49` → `pnpm deploy --prod` (~200 MB). `.dockerignore` incomplet (docs/, tools/, backups/). Web Dockerfile garde un `RUN chown -R`. *½ j.*
- [ ] **P2-21 · CONTRIBUTING.md + TESTING.md absents** — onboarding/test workflow non documentés. *½ j.*
- [ ] **P2-22 · AGENTS.md = 2 docs en 1 (1000+ lignes)** — moitié legacy Apps Script, pas de TOC. **Fix** : split `docs/apps-script.md` (archive) + guide web vivant. *½ j.*
- [x] **P2-23 · Drift `SCAN_CONCURRENCY` docs/code** — ✅ corrigé : `DEPLOY.md` documente `SCAN_CONCURRENCY` défaut 50, source de vérité `apps/api/src/plugins/scan.ts:13`.
- [ ] **P2-24 · `package.json` racine : deux blocs `devDependencies` + deps prod tooling-only** (googleapis, playwright). *1 h.*
- [ ] **P2-25 · `scripts/validate-static.js` rouge** — SYNC_J1_ALL_SHEETS, WCORE_AUTO_HEAL manquants (upstream `wcore-gsheet`, hors scope web mais le script vit ici). *à traiter upstream.*

### P3 — Backlog (opportuniste)

- [ ] Schema test des 182 chain configs (1 seule testée — aurait attrapé le chainId SOMNIA). *½ j.*
- [ ] error.tsx pour les routes restantes (leaderboard, stats, scans/[id], share, pricing). *2 h.*
- [ ] JSDoc sur les ~20 fonctions publiques critiques (core engines, auth). *½ j.*
- [ ] ROADMAP.md (209 KB) : extraire l'historique vers CHANGELOG, garder ~300 lignes vivantes. *½ j.*
- [ ] CI : `needs:` sur le job e2e, job release/deploy. *2 h.*
- [ ] Surveillance des 8-12 chaînes single-RPC (ANCIENT8, B3, CITREA, FOGO, INTUITION, MITOSIS, OPENLEDGER, STABLE, TAC, TEMPO, VANA, ZIRCUIT) — alerting si RPC unique down. *1 j.*
- [x] ~~`src/*.gs` (169 fichiers legacy Apps Script trackés)~~ — ✅ supprimés (Phase 1.5, 2026-06-18). L'extraction vit maintenant dans `wcore-gsheet/tools/extract-chains.mjs`. Le package `@wcore/chains` est généré depuis `wcore-gsheet/src/*.gs`.
- [ ] `next/image` : tradeoff Docker standalone assumé — documenter dans DEPLOY.md, pas d'action code.
- [ ] GT API key ($50/mo) pour lever le throttle 40 calls/60s vs 174 chaînes actives (décision produit/budget).

---

## 4. Findings CORRIGÉS (traçabilité condensée)

Détails complets dans l'historique git des rapports datés. Synthèse :

- **Auth/SIWE** : nonce binding, chainId `> 0`, Expiration+ChainId obligatoires, URI matching multi-origin, cookies httpOnly, CSRF deny-by-default prod, rate-limit per-address pré-auth, rate-limit ordonné après auth (test de garde), token tolerant (clear sur 401 explicite uniquement).
- **Scan/Engines** : forceRefresh propagé aux engines (bypass `empty:*`), liveness `canServeEmptyCache`, consensus strict zéro-vs-cache (zéro non-consensus n'écrase plus), per-chain timeout 90s, partial cache writes async, job TTL 3-guards, negative/native/balance/per-token caches alignés 3 VMs, scan result cache `scan:result:*`, batch multi-wallet Multicall3, cache engine préservé SVM/Cosmos en forceRefresh.
- **Pricing** : RealT registry bulk + Woo fallback + short-circuit cascade, GT bulk pre-fetch, RedisPricingCache partagé inter-workers, stablecoin peg `isStable === true` only, scam-detector contract-aware + overrides 3 niveaux persistés.
- **GM** : chainKey canonique uppercase + lookups insensibles, anti-replay case-insensitive, N+1 random batché, status-onchain auth+ownership+zod+cache court, factories source unique `factories.ts`, RPC résolus via `@wcore/core`, KCC build Paris (PUSH0), 8 chaînes activées pattern unifié.
- **API/Infra** : compress global, indexes DB + test de garde, migrate deploy (jamais db push prod), Docker non-root, secrets retirés des docs/CI (`job.env`), `.env.staging` untracké, backup quotidien + rotation 7j, smoke test ≥180 chaînes.
- **Frontend** : strict:true web, RSC server-shell pattern complet, splits WalletContent/evm.ts, next/dynamic ×4, error.tsx ×4, TokenIcon broken-image overlay, FX fetch via apiFetch, useGmContracts cross-user publication fixée.
- **Findings invalidés** : `@tanstack/react-query` (peer wagmi, pas mort), code-splitting "absent" (faux positif dès 05-29, confirmé corrigé 06-11), fallback 2000 fetchNativePrice (déjà retiré).

---

## 5. Nettoyage du 2026-06-11 (effectué dans le cadre de cet audit)

**Racine** (fichiers non trackés / ignorés) :
- Supprimés : `build.log`, `deploy-web.log`, `next-build.log`, `tsc.log`, `nul`, `test-data-uris.png`, 2 PNG temp égarés (`UsersstrauAppData...png`).
- Archivés vers `scripts/archive-x/` : 17 scripts `x-*.js` (sessions X de mai, supersédés par `scripts/x/` + `scripts/x-cycle/post-replies.cjs`).

**scripts/** :
- Retirés de git + disque : `.icon-audit.json`, `.icon-manifest.json`, `.icon-manual-urls.txt` (artefacts générés, référencés nulle part).
- Archivés vers `scripts/archive-x/` : 19 one-shots X/CM (`x-cycle-*`, `x-search-*`, `scan-x-feed`, `search-x-targets`, `verify-replies`, `cm-scan.mjs`, `check-aaladin*`, `check-inkhub`).
- Supprimés (debug ponctuel obsolète) : `tweet-screenshot.png` (181 KB), `inspect-*.cjs` ×4, `find-unknown-tokens*.js` ×2, `check-logos-playwright.js`, `fetch-token-meta*.mjs` ×2, `fetch-tokens-blockscout.mjs`, `fix-roadmap.js`, `append-gotchas.js`, `build-post-v12*.cjs` + `render-post-v12.cjs` (itérations supersédées).
- **Conservés volontairement** : `chrome-cdp.js`, `connect-google.js`, `clasp-*.js` (documentés AGENTS.md), `analyze-errors.ps1` (routine), `audit-rpcs.mjs`, `audit-gm-consistency.ts`, `deploy-gm-contract.mjs`, `backfill-gm-logs.ts` / `recover-gm-history.ts` / `recalc-gm-streaks-db.ts` (outils de recovery GM), `build-post-gm-*.cjs` / `build-post-tower.cjs` / `build-post-trustworthy-balances.cjs` / `svg-to-png*.mjs` (générateurs marketing documentés).

**docs/** :
- 11 rapports `audit-*.md` + `archive/AUDIT.md` supprimés, consolidés dans CE fichier (historique complet dans git).
- Références mises à jour : ROADMAP.md, DEPLOY.md, TROUBLESHOOTING.md, AGENTS.md → pointent vers `docs/AUDIT.md`.

---

## 6. Roadmap intelligente

Priorisation impact × effort. Une case cochée = vérifiée dans le code, pas seulement « intentionnée ».

### 🔴 Sprint 1 — cette semaine (~2,5 j)
| # | Action | Réf | Effort | Impact |
|---|--------|-----|--------|--------|
| 1 | ✅ `AUTH_ALLOW_BEARER=false` prod + guard NODE_ENV | P0-1 | 15 min | Sécurité prod |
| 2 | ✅ Retirer `@fastify/rate-limit` | P1-3 | 1 min | Hygiène |
| 3 | ✅ Fix TDZ `sendLogin` + purge des 34 erreurs lint | P1-1 | ½ j | Bug réel + CI verte |
| 4 | ✅ Tests routes `scan-plugin-routes.test.ts` (async/batch) | P0-3 | 1 j | Filet revenue path |
| 5 | ✅ RealT registry TTL 7 j | P1-4 | 1 h | Intégrité pricing € |
| 6 | ✅ `walletScan.create` fire-and-forget + `mget` cache check | P2-6/7 | 2 h | -30-80 ms/scan |
| 7 | ✅ `deploy.ps1` exit code | P1-7 | 1 h | Déploiements fiables |

### 🟠 Sprint 2 — semaine suivante (~4 j)
| # | Action | Réf | Effort |
|---|--------|-----|--------|
| 8 | E2E POST `/api/gm/onchain` | P1-6 | 1 j |
| 9 | Tests `useScanOrchestrator` | P1-5 | 1 j |
| 10 | N+1 GM upserts → createMany | P1-2 | ½ j |
| 11 | ChainCard scam contract-aware | P1-8 | ½ j |
| 12 | SSRF `0.0.0.0`/`::ffff:` + wrapper DNS rebinding | P1-9, P2-2 | ½ j |
| 13 | ✅ Cache court status-onchain | P2-5 | Fait 2026-06-20 |
| 14 | Endpoints metrics admin-only | P2-1 | ½ j |

### 🟡 Mois — chantiers de fond (~5 j)
- `config.ts` central zod (P2-18) → prérequis pour tuer les drifts env.
- Cosmos decimals/staking (P2-15).
- Dédup QUAL (`calcCleanChainValue`, `detectChainType`, `AuthUser`) (P2-13) + stables EUR (P2-14).
- Docker prune API + `.dockerignore` + compose args web (P2-20).
- CONTRIBUTING.md + TESTING.md (P2-21) ; split AGENTS.md (P2-22).
- Chemins contracts/ portables (P2-19) ; package.json racine nettoyé (P2-24).
- Memoize + virtualisation AllTokensTable (P2-9) ; RpcHealth decay (P2-10).

### 🟢 Trimestre — structurant
- **Job store Redis/BullMQ** : jobs async survivants au restart API (aujourd'hui perdus, `job_not_found`).
- **AbortSignal bout-en-bout** dans le scan engine (annulation réelle des chains en cours).
- **Access token 1h + révocation** (P2-3) + ownership jobs anonymes (P2-4).
- **Schema test 182 chain configs** + alerting chaînes single-RPC.
- **GT API key** (décision budget) ou cache GT plus agressif.
- **Pipelining Redis + intraScanCache cross-batch** (P2-8) si le scaling multi-user le justifie.
- [x] ~~Migration `src/*.gs` + outillage vers wcore-gsheet~~ — ✅ extraction figée (182/182 extractibles, Phase 3 terminée 2026-06-19).

### Règles de maintenance de ce fichier
1. **Un seul fichier d'audit.** Pas de nouveau `audit-YYYY-MM-DD.md` : on met à jour les sections 3, 4 et 6 ici.
2. **Cocher = preuve.** Une case passe à `[x]` uniquement avec `fichier:ligne` ou commit en preuve (leçon des dérives 05-24 / 06-07 / 06-11).
3. **Re-vérification trimestrielle** : repasser la section 3 au crible du code (les findings « ouverts » pourrissent vite — 8/18 étaient déjà corrigés au dernier passage).
4. Les gros audits multi-agents futurs déversent leurs findings ICI, classés P0-P3, puis leurs rapports bruts vont dans l'historique git (commit) sans fichier persistant.
