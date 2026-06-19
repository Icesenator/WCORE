# Troubleshooting — WCORE Web

> 5-10 minutes de lecture pour les erreurs les plus fréquentes. Pour les détails complets, voir `AGENTS.md` (200+ gotchas).

## 🚨 Build / Typecheck

### `Cannot find module '@prisma/client'` au premier `pnpm typecheck`
**Cause** : client Prisma pas généré.  
**Fix** : `pnpm --filter @wcore/db db:generate` AVANT `pnpm typecheck`. CI le fait automatiquement, dev local non.

### `next build` Railway fails mais local OK
**Cause** : cache Docker Railway stale.  
**Fix** : changer un commentaire dans `Dockerfile` (ex. `# CACHE_BUST=...`) ou modifier `pnpm-workspace.yaml`. Ne pas boucler sur les retries.

### `ReferenceError: injected is not defined` au démarrage wagmi
**Cause** : chunk Turbopack cassé sur le connecteur `injected()`.  
**Fix** : déjà géré — `wagmi.ts` n'enregistre PAS `injected()` dans le config statique. Si tu vois ce message, c'est qu'on a re-introduit le connecteur par erreur. Vérifier `apps/web/lib/wagmi.ts:14` et la note juste au-dessus.

### `useEffect` is not defined au runtime
**Cause** : import manquant (`import { useEffect } from "react"`).  
**Fix** : ajouter l'import. Le dev local (Turbopack) ne le détecte pas toujours, mais `next build` Railway oui. Toujours vérifier après un edit.

## 🔌 API / Scan

### Scan timeout sur 1 chaîne
**Cause** : RPC free-tier saturé, consensus impossible.  
**Fix** : le timeout 90s est par défaut (`SCAN_CHAIN_TIMEOUT_MS`). Augmenter le TTL du cache n'aide pas — augmenter la santé du RPC source (RPC payant, ou attendre 5min pour la décroissance du circuit breaker).

### `prisma.user.upsert` wipe la DB prod
**Cause** : `TEST_DATABASE_URL` pointe vers prod.  
**Fix** : `apps/api/set-test-env.js` refuse `localhost`/`127.0.0.1`/`::1` dans `TEST_DATABASE_URL`. Si on a quand même wipe, restaurer depuis `backups/wcore-backup-*.sql` (rotation 7j).

### `error: "scan timed out"` en async
**Cause** : job > 30min (TTL hard cap) ou stuck > 180s.  
**Fix** : relancer avec `forceRefresh=true` (bypass cache `scan:v2:*`). Si ça persiste, vérifier que la chaîne n'est pas dans `FLAGS.DISABLE_CHAIN=true` (8 chaînes désactivées : `CROSS_MAINNET, ETHO_PROTOCOL, HAVEN1, MOCA_CHAIN, POLYNOMIAL, RIVALZ, STACK, SURFLAYER`).

## 💰 GM / Pricing

### `Native price zero for <chain>` au déploiement GM
**Cause** : cache `native_price:{chainKey}` non warmé ou DefiLlama + CoinGecko tous deux down.  
**Fix** : warmer le cache après deploy en hittant `/api/price/native?chain=<chainKey>` pour chaque chaîne GM. Le cache Redis `native_price:{chainKey}` (TTL 24h) sert en fallback si les 2 upstreams échouent au moment du clic.

### `0 PUSH0` mais chaîne pas dans `PARIS_BUILD_CHAINS`
**Cause** : chaîne pre-Shanghai oubliée.  
**Fix** : ajouter la chaîne au Set `PARIS_BUILD_CHAINS = new Set(["KCC", ...])` dans `apps/web/app/dev/deploy/build-selector.ts`, bump version build Paris, redéployer le web.

### `eth_getCode = 0x` sur un contrat GM déployé
**Cause** : deploy Shanghai sur chaîne pre-Shanghai = PUSH0 revert silencieux.  
**Fix** : DeployClient UX guard (commit `35f0434`) détecte et auto-clear `localStorage.gm_impl_${chainKey}`. Si l'erreur reste : redéployer avec le bon build.

### Bot GM off-chain grisé après GM on-chain
**Cause** : event `wcore-gm-done` non encore reçu.  
**Fix** : Header GM lit `wc_gm_onchain_chains` + l'event au montage, sur focus, à l'ouverture du menu. Forcer un refresh du menu Header.

## 🔐 Auth / Wallet

### Double Sign In bounce
**Cause** : refactor auth instable.  
**Fix** : déjà géré (commit `5f739c3`). Si ça réapparaît, vérifier que `apps/web/lib/api.ts` n'a pas régressé sur `apiFetch` 401 handling.

### `auth_failed` au lieu de `not_authenticated`
**Cause** : API down.  
**Fix** : vérifier `/api/health` (200 + `Content-Type: application/json`, pas HTML). Si HTML = mauvais service Docker file (incident 2026-05-19, deploy race).

### `wcore-auth-expired` événement pendant un scan
**Cause** : `apiFetch` interprétait un 401 transient comme logout.  
**Fix** : `lib/api.ts` ne dispatche `wcore-auth-expired` QUE si l'endpoint `/api/auth/refresh` retourne 401, pas sur un 401 d'endpoint arbitraire. Vérifier que le code n'a pas régressé.

### `JWT_SECRET` change à chaque restart
**Cause** : `JWT_SECRET` non persisté dans `.env.staging` ou `.env.production.local`.  
**Fix** : set `JWT_SECRET` fixe dans le fichier env. Sinon tous les tokens existants deviennent invalides au restart.

## 🚂 Railway / Déploiement

### `railway up` retourne "Deploys have been paused"
**Cause** : blocage côté Railway.  
**Fix** : réessayer plus tard. Les services restent online. Ne pas boucler.

### API sert du HTML au lieu de JSON après deploy
**Cause** : race condition — `railway.json` pointait sur `apps/web/Dockerfile` au lieu de `apps/api/Dockerfile` (incident 2026-05-19).  
**Fix** : `scripts/deploy.ps1` swap le `dockerfilePath` dans `try`, restore en `finally`. Ne JAMAIS lancer 2 deploy.ps1 en parallèle (API + Web simultanés se battent sur `railway.json`). Toujours vérifier `Content-Type: application/json` sur `/health` après deploy API.

### `clasp` token expiré
**Cause** : refresh token OAuth expiré.  
**Fix** : `apps/api/src/test-secret.ts` n'est pas concerné. Pour `clasp` (Apps Script legacy `wcore-gsheet`), voir la procédure OAuth dans `AGENTS.md` section "Autonomie sans MCP".

## 📊 DB / Cache

### Redis cache hit un prix fake
**Cause** : cache permanent RealT (`realt:price:{contract}`) sans TTL, écrit uniquement sur 200.  
**Fix** : cap à 7j en defense-in-depth (audit 2026-06-07 P1-5). Si pollué, `redis-cli DEL realt:price:<contract>`.

### EVM empty cache stale pour un wallet nouvellement fundé
**Cause** : cache EVM 1h masque wallet token-only.  
**Fix** : utiliser `forceRefresh=true` ou attendre 1h. Réduction EVM empty cache à 10min prévu (P1-4 audit 2026-06-07).

### GM score double-compté après rebuild
**Cause** : `OnchainGm @@unique([chainKey, txHash])` case-sensitive en Postgres. Rows legacy lowercase `chainKey="base"` ne collisionnent pas avec nouvelles UPPERCASE.  
**Fix** : déjà géré (commit `fa17a10` 2026-06-06). `rebuildChainStreakFromOnchain()` pre-fetch les `txHash` existants case-insensitive.

## 📱 Frontend

### TokenIcon affiche icône "image cassée" sur fonds coloré
**Cause** : le cercle coloré est rendu DERRIÈRE le `<img>`. Quand l'URL retourne 404, le navigateur affiche son icône cassée par-dessus.  
**Fix** : déjà géré (commit `e0bead8` 2026-06-06). `imageBroken` state cache l'img quand 404 ou `naturalWidth===0`.

### ChainIcon affiche emoji ⛓️ à la place du logo
**Cause** : URL llamao 404 ou naturalWidth=0 (WebP microscopique).  
**Fix** : déjà géré par la cascade v2 (2026-05-14) : FALLBACK_ICONS (TrustWallet fiable) → llamao. Vérifier `hasFallbackIcon(chainKey)` dans `icons.tsx`.

### Posts X avec em-dash refusé par sanitize
**Cause** : l'agent qui a écrit le draft n'a pas vu l'em-dash.  
**Fix** : `scripts/x-cycle/post-replies.cjs` `sanitize()` refuse d'envoyer si em-dash/en-dash/NBSP/ellipsis détectés. Si on doit poster, remplacer em-dash par un point suivi d'une majuscule (cf. AGENTS.md gotcha 2026-05-12).

## 🔗 Liens utiles

- `ROADMAP.md` — état courant + backlog
- `AGENTS.md` — 200+ gotchas détaillées
- `CHANGELOG.md` — changements release
- `docs/AUDIT.md` — audit consolidé unique (findings + roadmap)
- `docs/CM-STRATEGY.md` — communication X (95 KB)
- `docs/rpc-harmonization-2026-06-03.md` — défense RPC 11 couches
- `docs/wcore-gsheet-to-web-reconciliation-2026-06-03.md` — apps-script vs web

## 📞 Escalade

Si aucun fix ci-dessus ne résout :
1. Vérifier `pnpm typecheck` + `pnpm lint` + `pnpm test` pour isoler le scope
2. Lire `docs/AUDIT.md` Section concernée
3. Chercher dans `AGENTS.md` (Ctrl+F) le pattern
4. Demander à l'orchestrateur OMC si la racine est architecturale
