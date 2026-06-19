# WCORE v0.1.18 — Prompt d'audit complet pour Claude

> **Demande : Audit complet de tout le code WCORE Web (v0.1.18-post-audit).**
> **Contrainte : Audit lecture seule — aucun changement code/config.**

---

## Contexte

WCORE est une plateforme d'analyse de portefeuilles crypto multi-chaînes (116+ blockchains EVM/SVM/Cosmos). Le backend est en TypeScript (Fastify + Prisma + PostgreSQL), le frontend en Next.js 16.

Un premier audit a déjà été fait (27 findings corrigés). Cet audit a **couvert uniquement le code applicatif direct** (auth, GM, routes, composants frontend). Il n'a **PAS couvert** :
- Les engines core (EVM, SVM, Cosmos)
- La cascade de pricing (DefiLlama, DexScreener, GeckoTerminal, CoinGecko, OnchainV3)
- Le système de tokens (discovery, registry, ABI/metadata)
- Le cache (memory, Redis)
- Le circuit breaker
- Les tests unitaires (couverture ?)
- La configuration Docker
- Les migrations Prisma

**Cet audit doit couvrir TOUT, avec un focus particulier sur ces zones non auditées.**

---

## Scope complet

### 1. AUTHENTIFICATION — `apps/api/src/auth.ts`
- SIWE login : ordre nonce→verify→delete correct ?
- JWT : expiration, secret, validation
- Wallet linking : SVM/Cosmos paths — anti-DoS ? Signature vérification ?
- Nonce TTL 300s : suffisant ?
- `req.user` : toujours défini avant d'être utilisé ?

### 2. GAMIFICATION — `apps/api/src/gamification.ts`
- GM off-chain : `updateMany` atomique, pas de double-GM ?
- GM on-chain : `prisma.$transaction` complet ? Anti-replay `[chainKey, txHash]` ? TipWei décodé correctement (dernier word ABI) ?
- Deploy : adresse depuis `topics[1]` du `ContractDeployed` event ? Factory vérifiée ?
- My-contracts : matching par `creatorAddress` + `owner.address` ? Platform owner voit TOUS ?
- `syncOnChainContracts` + `has-deployed` : overwrite protection (vérifie `existing.ownerId`) ?
- Balance endpoint : fetch DB pour user address (pas JWT) ?
- Factories : seulement Base active ? Placeholders retirés ?
- RPC calls : timeout ? `eth_getLogs` chunk size (10K) trop grand pour certains RPC ?

### 3. SERVEUR — `apps/api/src/server.ts`
- Rate-limit : tous les endpoints couverts ? GM reads/writes/publics corrects ?
- Circuit breaker : ouvert/fermé correctement ? Event listener câblé ?
- `getClientIp` : X-Forwarded-For seulement depuis localhost ?
- Admin auth : `ADMIN_TOKEN` + `NODE_ENV` check en prod ?
- `maxScansPerDay` : **enforced** serveur-side ou juste informatif ?
- Scan async : circuit breaker mis à jour ?
- Share endpoints : `shareToken` aléatoire ? Expiration vérifiée ? Ownership validé ?

### 4. BILLING — `apps/api/src/billing.ts`
- Stripe checkout : customer créé avec metadata userId ?
- Webhook : signature validée ? `checkout.session.completed` → plan="pro" ?
- Subscription : `customer.subscription.deleted` → plan="free" ?
- Portal : vérifie que l'user possède le customer ?
- `planExpiresAt` : vérifié dans `getUserPlan()` pour période de grâce ?

### 5. ENGINES — `packages/core/src/engines/`
- **EVM** (`evm.ts`) : `getEvmWalletAssets` — error handling ? RPC consensus ? Token discovery injecté proprement ? Native balance fallback ?
- **SVM** (`svm.ts`) : native balance consensus strict ? SPL tokens parsés correctement ? RPC failure → préserve le cache ?
- **Cosmos** (`cosmos.ts`) : REST API calls — timeout ? Staking delegations — bien comptées ? ADR-36 correct ?
- **Dispatch** (`dispatch.ts`) : `detectVm()` route correctement ? Adresses multi-VM gérées ?

### 6. PRICING — `packages/core/src/pricing/`
- **Cascade** (`cascade.ts`) : ordre correct (Llama → Dex → GT → CG → Jupiter → OnchainV3) ? Stablecoin fast-path ? `token.key` fix en place ?
- **DefiLlama** (`sources/defillama.ts`) : seuil de confiance (0.6) ? Timeout ?
- **DexScreener** (`sources/dexscreener.ts`) : sélection par liquidité ? Quote token inference ?
- **GeckoTerminal** (`sources/geckoterminal.ts`) : API paths corrects ? Throttle 40/run ?
- **CoinGecko** (`sources/coingecko.ts`) : ID vérification ? Fallback activé ?
- **OnchainV3** (`sources/onchain-v3.ts`) : Aerodrome Slipstream + Uniswap V3 ? WETH fallback ? Plus haute liquidité ?

### 7. TOKENS — `packages/core/src/tokens/`
- Discovery (`explorer-discovery.ts`) : Blockscout API — timeout ? Anti-spam filter ?
- Discovery (`log-discovery.ts`) : `eth_getLogs` — range limité ? ERC-721/1155 aussi ?
- Registry (`registry.ts`) : 100+ tokens sur 10 chaînes — adresses exactes ?
- Metadata (`metadata.ts`) : `getErc20Metadata` — consensus RPC ? Fallback decimals à 18 ?
- ABI (`abi.ts`) : encode/decode corrects ? `decodeStringResult` pour bytes32 ?

### 8. RPC — `packages/core/src/rpc/`
- Client (`client.ts`) : timeout ? Retry ? Error handling ?
- Consensus (`consensus.ts`) : majorité stricte `votes * 2 > total` ? Failed RPCs comptés dans `total` ?
- Dispatcher (`dispatcher.ts`) : `pickEndpoints` — fallback unhealthy retiré ? `opts.total` passé au consensus ?

### 9. CACHE — `packages/core/src/cache/`
- Memory (`memory-cache.ts`) : TTL correct ? Négatif clampé ? Pas de memory leak ?
- Redis (`redis-store.ts`) : ioredis connection ? Fallback MemoryCacheStore ? `clear()` utilise `SCAN` ou `KEYS` ?

### 10. CIRCUIT BREAKER + ALERTING
- `circuit-breaker.ts` : états CLOSED/OPEN/HALF_OPEN corrects ? Side effect dans getter `currentState` ? Events sur TOUTES transitions ?
- `alerting.ts` : `sendAlert()` fire-and-forget ? Timeout 5s ?
- `metrics.ts` : tous les compteurs incrémentés ? Snapshot correct ?

### 11. FRONTEND — `apps/web/`
- **ConnectButton** : auth states corrects ? JWT malformé traité comme expiré ? Error messages lisibles ?
- **GmButton** : `alreadyOffChain`/`OnChain` séparés ? Event listener `wcore-gm-done` ?
- **ChainCard** : `wc_gm_onchain_date` (pas `wc_gm_date`) ? FACTORIES match backend ?
- **WalletContent** : multi-wallet PDF lock effectif (pas juste cosmétique) ?
- **useOnChainGm** : sendGm appelle API AVANT localStorage ? Deploy lit depuis receipt log (pas `contractCount`) ?
- **Scam-detector** : `Array.from` retiré ? KNOWN_TOKENS suffisant ?
- **CSV export** : neutralisation `=+-@|` ? Backward compat ?
- **Pricing page** : checkout redirige vers Stripe ?
- **Share page** : pas de leak de données ?

### 12. DB — `packages/db/prisma/schema.prisma`
- Tous les modèles : types corrects ? Relations ? Indexes (surtout `stripeSubscriptionId`, `stripeCustomerId` @unique, `shareToken` @unique) ?
- Migrations cohérentes avec le schéma ?
- Contraintes uniques : `[chainKey, txHash]`, `[chainKey, contractAddress]`, `[userId, chainKey]`

### 13. DOCKER — `apps/api/Dockerfile`, `docker-compose.prod.yml`
- Dockerfile API : hoisted linker ? pnpm deploy ? node_modules copiés correctement ?
- HEALTHCHECK : utilise `node -e "require('http')..."` (pas wget) ?
- `docker-compose.prod.yml` : toutes les env vars ? Ports ? Healthchecks ? Redis password pas dans CLI ?
- Web Dockerfile : hooks/ et lib/ copiés ?

### 14. TESTS
- Core : 89 tests — quels chemins ne sont PAS couverts ?
- API : 34 tests — login réussi EVM ? Rate-limit GM ? Deploy avec mock receipt ? Onchain avec tipWei ?
- E2E : 7 tests — GM flow complet ? ChainCard per-chain ? SIWE connect/reconnect ?
- Couverture des 27 fixes d'audit ?

### 15. SÉCURITÉ GLOBALE
- CORS restrictif en prod ?
- JWT_SECRET hard-fail en prod ?
- Pas de secrets dans le code ou les logs ?
- Rate-limit sur tous les endpoints sensibles ?
- $aborted scan/async a les mêmes protections que /scan ?

---

## Priorité

1. Engines + Pricing + Tokens (ce qui n'a pas été audité avant)
2. RPC + Cache + Circuit breaker (core infrastructure)
3. DB + Docker (schéma et déploiement)
4. Tests manquants (couverture)
5. Sécurité globale

## Format de réponse attendu

Pour chaque bug trouvé :
- Sévérité (CRITICAL / HIGH / MEDIUM / LOW)
- Fichier + ligne
- Description du problème
- Impact
- Suggestion de fix
