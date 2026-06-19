# WCORE v0.1.13 — Audit approfondi pour GPT-5.5

> Date : 2026-05-06
> Contexte : Post-fix critique auth + rate-limit GM. Audit complet demandé.
> Contrainte : **Pas d'action on-chain** — modifications code/config uniquement.

---

## AUDIT DEMANDÉ — Vérifie chaque point ci-dessous

### 1. AUTHENTIFICATION (SIWE + JWT) — Vient d'être fixé, audit critique

- **`apps/api/src/auth.ts`** : La ligne 64 utilisait `const key = \`nonce:${address.toLowerCase()}\``, puis la ligne 72 comparait `recovered.toLowerCase() !== key` (adresse vs `nonce:0x...` → toujours faux). La ligne 76-79 upsertait le user avec `address: key` (= `nonce:0x...`). **Corrigé** — séparation `nonceKey` / `normalizedAddress`. Vérifie qu'il ne reste AUCUNE autre occurrence de ce pattern ailleurs.
- Vérifie la validation de signature SVM et Cosmos (lignes 89+) — pas de bug similaire ?
- Vérifie `req.user.address` dans toute la codebase — est-ce toujours une adresse propre (pas `nonce:` prefix) ?
- Le `PLATFORM_OWNER.EVM` est-il maintenant correctement matché ? (gamification.ts:609)
- Y a-t-il des users corrompus en DB avec `nonce:` dans leur adresse ? Faut-il un script de migration ?
- Le nonce TTL est de 300s — est-ce suffisant contre les replay attacks ?
- Le JWT_SECRET fallback en dev est documenté, mais le warning est-il suffisamment visible ?

### 2. RATE LIMITING — Architecture complète

- **`apps/api/src/server.ts`** : 3 buckets GM (writes 30/min, reads 90/min, publics no limit). Vérifie :
  - Tous les endpoints `/api/gm/*` sont-ils correctement classifiés ?
  - Y a-t-il des endpoints GM manquants (ex: `/api/creator/stats`, `/api/quests`, `/api/badges`) qui devraient être rate-limités ?
  - Les buckets `scan` (60/min) et `auth` (30/min) sont-ils corrects ?
  - Le checkRateLimit utilise `sharedCache` avec TTL 60s — le reset de fenêtre est-il correct ?
  - Race condition possible entre `get` et `set` ?
- Vérifie `/api/leaderboard`, `/api/leaderboard/stats` — pas de rate limit → DDoS possible ?
- Le circuit breaker (20 échecs, 2 min cooldown) interagit-il correctement avec le rate limiting ?

### 3. GAMIFICATION (GM) — Logique métier

- **`apps/api/src/gamification.ts`** :
  - `POST /api/gm` (off-chain) : `updateMany` atomique avec `OR: [{ lastGmDate: null }, { lastGmDate: { lt: today } }]` — est-ce vraiment atomique ? Pas de double-GM possible ?
  - `checkRateLimit` dans server.ts bloque les writes, mais l'atomicité DB est-elle suffisante ?
  - `POST /api/gm/onchain` : vérifie `already_gm_today` + `already_gm_chain_today` + vérifie le tip (min 0.000001 ETH). Le `eth_getTransactionReceipt` est-il fiable ?
  - `fetchOnChainContracts` : scanne 100K blocks par chaîne (10 chunks × 10K). Limite RPC raisonnable ? Timeout implicite ?
  - `syncOnChainContracts` (nouveau, background) : pas de gestion d'erreur visible dans l'UI. L'utilisateur sait-il si la sync a réussi ?
  - `seedGmContracts` : upsert sans `ownerId`. Qui possède le contrat seed ?
  - `FACTORIES` : mêmes adresses pour toutes les chaînes (placeholder). Cohérent avec la réalité on-chain ?
  - `extractDeployedContractAddresses` : filtre par `topics[2]` = creator. Est-ce que ça capture tous les cas (create2, proxies) ?

### 4. CASCADE DE PRICING (packages/core/src/pricing/)

- **Vérifier l'ordre** : DefiLlama → DexScreener → GeckoTerminal → CoinGecko → Jupiter → Onchain V3
- Le fix `token.key` (session précédente) est-il bien en place ? Pas de régression ?
- Les tokens LP (liquidité contre non-USD) ont-ils des prix corrects ?
- Le cache L1 (CacheService, 2h TTL) est-il correctement invalidé sur forceFull ?
- Le fallback CoinGecko est-il activé ? (`allowCoinGeckoTokenFallback: true`)
- Les stablecoins sont-ils correctement fast-pathés (FX rate) ?

### 5. DÉCOUVERTE DE TOKENS (packages/core/src/tokens/)

- **Registry** (`registry.ts`) : 100+ tokens sur 10 chaînes. Vérifier les adresses (pas de typos).
- **Explorer discovery** (`explorer-discovery.ts`) : Blockscout API, filtre anti-spam. Le deepScan (500K blocs) est-il trop lourd ?
- **Log discovery** (`log-discovery.ts`) : scan par événements Transfer. Est-ce que ça trouve tous les tokens (ERC-721, ERC-1155) ?
- **Metadata** (`metadata.ts`) : `getErc20Metadata` avec consensus RPC. Que se passe-t-il si TOUS les RPC timeout ?

### 6. ENGINES (packages/core/src/engines/)

- **EVM** (`evm.ts`) : `getEvmWalletAssets`, `readNativeBalance`, `getErc20Balances`. Gère-t-il correctement les erreurs RPC partielles ?
- **SVM** (`svm.ts`) : `getBalance`, `getTokenAccountsByOwner`. Le fallback native balance (si RPC fail, préserve le cache) est-il en place ?
- **Cosmos** (`cosmos.ts`) : REST API `/bank/balances`, `/staking/delegations`. ADR-36 correct depuis le fix ?
- **Dispatch** (`dispatch.ts`) : `detectVm()` route-t-il correctement ? Les adresses multi-VM sont-elles gérées ?

### 7. CIRCUIT BREAKER & MODE DÉGRADÉ

- **`packages/core/src/cache/circuit-breaker.ts`** : seuil 20, cooldown 120s. Le `blockDurationMs` escalade-t-il correctement ?
- L'ouverture est basée sur `hasError && !hasValue`. Un wallet vide (0 tokens, 0 balance) est-il incorrectement compté comme échec ?
- Le mode dégradé (`[DEGRADED]`) est-il propagé jusqu'à l'UI ?
- Les circuit breakers sont-ils partagés entre toutes les requêtes ? Un utilisateur peut-il déclencher le breaker pour tout le monde ?

### 8. DB PRISMA — Schéma & Migrations

- **`packages/db/prisma/schema.prisma`** : cohérence des relations ? Pas d'orphelins ?
- Le modèle `GmContract` a `ownerId String?` (optionnel). Est-ce que des contrats sans owner cassent l'UI ?
- `OnchainGm.txHash` est unique — OK pour éviter les doubles GM. Mais `eth_getTransactionReceipt` peut-il retourner le même txHash pour des chaînes différentes ?
- Les index sont-ils suffisants pour les requêtes fréquentes (findUnique par address, findMany par userId) ?

### 9. UI — État & Hydratation

- **`apps/web/app/wallet/[address]/page.tsx`** : le `decodeURIComponent(address).split(",")` gère-t-il les cas limites (adresses vides, espaces, %-encoding incorrect) ?
- Hydratation : le bug wagmi précédent est-il vraiment fixé ? Pas de nouveau cas ?
- `WalletContent.tsx` : le multi-wallet, les labels, le `detectVm` — tout est cohérent ?
- `GmButton.tsx` : le `lastGmDate` est-il checké au montage ? Anti double-clic ?
- `GmContractsPanel.tsx` : affiche "You have not deployed a GM contract" si `gmContracts.length === 0`. Mais si l'API est lente, le message apparaît brièvement avant que les données arrivent. Flicker ?

### 10. TESTS — Couverture

- **Core** : 74 tests. Quels chemins critiques ne sont PAS testés ?
  - SVM engine (getBalance, getTokenAccounts)
  - Cosmos engine (REST API)
  - Cascade pricing pour tokens exotiques (LP, rebase, fee-on-transfer)
  - Circuit breaker escalade
- **API** : 30 tests. Manque-t-il un test de login réussi (EVM) ? Pourquoi le bug auth n'a-t-il pas été détecté ?
  - Test de `POST /api/gm` avec vrai flow complet ?
  - Test de `POST /api/gm/onchain` ?
  - Test de `GET /api/gm/my-contracts` pour le platform owner ?
- **E2E** : 6 scénarios Playwright. Suffisant ?

### 11. SÉCURITÉ GLOBALE

- CORS : `CORS_ORIGIN` configurable, `false` en prod par défaut (refuse tout). Correct ?
- Helmet : `contentSecurityPolicy: false` car Next.js gère le CSP. Est-ce vraiment OK ?
- Les tokens JWT contiennent `address` — exposent-ils trop d'info ?
- Les clés privées ou seeds ne sont-elles jamais loggées ou stockées ?
- Le service account Google Sheets (dans `AGENTS.md`) n'est PAS dans le code — vérifier qu'aucun fichier sensible n'est commité.

### 12. PERFORMANCE

- **`my-contracts`** : maintenant non-bloquant. Mais `fetchOnChainContracts` consomme jusqu'à 44 appels RPC par requête en background. Impact quota ?
- **`/api/scan`** : concurrence 3, timeout 2 min. Suffisant pour 116 chaînes ?
- **MemoryCacheStore** vs Redis : impact performance en production ?
- **Next.js build** : 6.1s TypeScript + 1.1s static pages. Acceptable ?

---

## Priorité recommandée

1. **Auth** (P0) — vérifier qu'aucun autre bug similaire n'existe, migrer les users corrompus
2. **Rate limiting** (P0) — vérifier la couverture complète, pas de trous
3. **Gamification** (P1) — atomicité DB, gestion d'erreurs background sync
4. **Tests** (P1) — le bug auth non détecté = fail de couverture
5. **Pricing cascade** (P1) — vérifier pas de régression du fix `token.key`
6. **UI/UX** (P2) — flicker, états de chargement, erreurs visibles
7. **Performance** (P2) — impact RPC du background sync
8. **Sécurité** (P2) — revue JWT, CORS, Helmet

---

## Contexte technique

```
API:     Fastify 5, port 4000, JWT auth, SIWE login, Prisma ORM
Web:     Next.js 16, port 3000, App Router, Tailwind, wagmi v2
Core:    TypeScript, engines EVM/SVM/Cosmos, cascade pricing 6 sources
DB:      PostgreSQL 16 (port 5433), Redis 7 (port 6380)
Tests:   Node.js test runner, 74 core + 30 API + 6 E2E Playwright
Monorepo: pnpm workspaces (apps/api, apps/web, packages/core, packages/shared, packages/db)
```
