# Design — Scan/Cache/Redis/Errors Optimization

**Date** : 2026-05-20
**Status** : Draft — en attente de review
**Auteur** : opencode

## Contexte

WCORE scanne 180+ chaînes EVM/SVM/Cosmos via l'API Railway. Trois problèmes majeurs impactent la fiabilité et la performance :

1. **Scans intermittents** : un scan Base peut timeout 90s+ sans rien retourner (observé 2026-05-20). SolvBTC et d'autres tokens apparaissent/disparaissent selon la stabilité RPC du moment.
2. **Bruit d'erreurs** : 26 erreurs `balance consensus failed` sur Gnosis pour des contrats non-ERC20 (execution reverted sur les 3 RPCs). Chaque erreur coûte 3 RPC calls consensus.
3. **Pas de visibilité cache** : impossible de savoir si un scan lent vient de cache miss, de RPC lents, ou de pricing. Pas d'endpoint pour classifier les erreurs prod.

## Architecture existante

- `apps/api/src/plugins/scan.ts` → endpoint POST `/api/scan` et `/api/scan/async`
- `packages/core/src/engines/dispatch.ts` → `getWalletAssets()` dispatch EVM/SVM/Cosmos
- `packages/core/src/engines/evm.ts` → discovery → balances (Multicall3) → pricing (cascade)
- `packages/core/src/cache/redis-store.ts` → `createCacheStore()` avec ioredis, fallback MemoryCacheStore
- `packages/core/src/pricing/redis-pricing-cache.ts` → `RedisPricingCache` partage les prix entre workers
- `packages/core/src/circuit-breaker.ts` → CircuitBreaker par chaîne (threshold=20, decay=10min)
- `packages/core/src/metrics.ts` → `MetricsStore` agrège les compteurs scan en mémoire

## Design

### 1. RPC Health Cache partagé

**Fichier** : `packages/core/src/rpc/rpc-health.ts` (nouveau)

```typescript
interface RpcEndpointScore {
  success: number;
  failure: number;
  lastSeen: number;
  score: number; // success / (success + failure), 0-1
}

interface ChainRpcHealth {
  endpoints: Map<string, RpcEndpointScore>;
  updatedAt: number;
}

class RpcHealthTracker {
  private readonly ttlMs: number;
  private readonly chains: Map<string, ChainRpcHealth>;

  recordSuccess(chain: string, endpoint: string): void
  recordFailure(chain: string, endpoint: string): void
  getHealthyEndpoints(chain: string, allEndpoints: string[]): string[]
  // Filtre les endpoints avec score < 0.3 ou failure > 3 dans la fenêtre TTL
}

// Singleton module-level
export const rpcHealth = new RpcHealthTracker({ ttlMs: 60_000 });
```

**Intégration dans `evm.ts`** :
- Avant de créer le `RpcDispatcher`, appeler `rpcHealth.getHealthyEndpoints(key, endpoints)` pour réduire la liste
- Si tous les endpoints sont filtrés → fallback sur la liste complète (sécurité)
- Après chaque `eth_call` réussi/échoué dans `readErc20Balance` et `readNativeBalance` → `recordSuccess/Failure`
- Le `Promise.any` dans `onchainRpc.batch` enregistre le winner (success) et les losers (failure)

**Impact** : réduction des RPC calls vers des endpoints morts de 30× à ~2-3× par cycle de 60s.

**Risque** : faible. Cache vide = comportement actuel. TTL court = pas de stale prolongé.

### 2. Filtre contrats non-ERC20

**Fichier** : `packages/core/src/engines/evm.ts` (modifié)

Dans `readErc20Balance()` :

```typescript
// Avant le consensus retry, check le cache skip
const skipKey = `meta:skip:${key.toLowerCase()}:${contract.toLowerCase()}`;
if (cache) {
  const skip = await cache.get<{ reason: string }>(skipKey);
  if (skip) return { balance: 0n, consensusFailed: false, skipped: true };
}

// Après échec consensus : détecter "execution reverted" sur TOUS les RPCs
// Le dispatcher retourne { value: null, consensus: false } quand tous les RPCs
// retournent une erreur. On inspecte les erreurs collectées pour le pattern revert.
if (allEndpointsReverted) {
  if (cache) {
    cache.set(skipKey, { reason: "non-erc20" }, 24 * 60 * 60 * 1000).catch(() => {});
  }
  return { balance: 0n, consensusFailed: false, skipped: true };
}
```

**Interface de retour élargie** :

```typescript
interface Erc20BalanceRead {
  balance: bigint;
  consensusFailed: boolean;
  skipped?: boolean; // true si contrat non-ERC20 détecté
}
```
```

Dans le loop de balance (Phase 2) :

```typescript
if (ercRead.skipped) {
  errors.push(`${known.symbol}: skipped (non-ERC20 contract)`);
  continue; // pas de fallback cache, pas de comptage
}
```

**Clé cache** : `meta:skip:{chain}:{contract}`, TTL 24h.

**Détection** : `execution reverted` avec `data: "0x"` sur tous les endpoints = non-ERC20. On ne filtre PAS les contrats qui retournent `0x` (balance zéro valide).

**Impact** : -78 RPC calls/wallet sur Gnosis (26 contrats × 3 calls consensus).

### 3. Optimisations cache — réduction des round-trips Redis

**Audit actuel** : un scan EVM 26 tokens fait ~130-180 GETs Redis séquentiels :

| Étape | Calls | Type |
|-------|-------|------|
| `empty:{chain}:{addr}` get | 1 | Séquentiel |
| `disc:{addr}:{chain}` get | 1 | Séquentiel |
| `disc:{addr}:{chain}:block` get | 1 | Séquentiel |
| `native:{chain}:{addr}` get | 1 | Séquentiel |
| `price:{chain}:{contract}` get × 26 | 26 | 1 par token dans cascade |
| `marker:{chain}:{contract}` get × 26 | 0-52 | NEED_TRY3 + NEED_ONCHAIN |
| `token:{chain}:{contract}:{addr}` get | 0-26 | Balance fallback |
| `meta:{chain}:{contract}` get × 26 | 26 | Metadata ERC20 |
| `logo:{chain}:{contract}` get × 26 | 26 | Logo resolver |
| **Total** | **~130-180 GETs** | |

#### 3a. Batch initial — `Promise.all` des reads séquentiels

Les 4 premiers gets (empty, discovery, block, native) sont exécutés séquentiellement → 4 RTT Redis. En `Promise.all` → 1 RTT.

```typescript
// evm.ts — avant le scan
const [cachedEmpty, cachedDiscovery, cachedBlock, cachedNative] = await Promise.all([
  cache.get(`empty:${key}:${normalizedAddress}`),
  cache.get(getDiscoveryCacheKey(normalizedAddress, key)),
  cache.get(`${getDiscoveryCacheKey(normalizedAddress, key)}:block`),
  cache.get(`native:${key}:${normalizedAddress}`),
]);
```

#### 3b. Scan result cache (TTL court)

Aujourd'hui : même wallet + même chaîne = re-scan complet RPC. Pas de cache de résultat intermédiaire.

```typescript
// Clé : scan:{addr}:{chain} → { assets, totalEur, ts }  TTL 5 min
// Dans scan.ts, avant getWalletAssets :
const scanCacheKey = `scan:${parsedAddress.data.toLowerCase()}:${chain.toLowerCase()}`;
if (!forceRefresh) {
  const cached = await sharedCache.get<WalletAssets>(scanCacheKey);
  if (cached && Date.now() - cached.ts < 5 * 60_000) return cached;
}
// Après scan réussi :
sharedCache.set(scanCacheKey, result, 5 * 60_000).catch(() => {});
```

Bypassé par `forceRefresh:true`. TTL 5 min = sûr pour l'UX (un re-scan rapide ne coûte rien).

#### 3c. Pre-fetch batch des prix et metadata

La cascade fait `getPrice(key)` par token (1 GET Redis × 26 = 26 RTT). Solution : `mget` avant la cascade.

```typescript
// evm.ts — avant la phase pricing
const priceKeys = withBalances.map(t => `price:${key.toLowerCase()}:${t.contract.toLowerCase()}`);
const cachedPrices = await cache.mget(priceKeys); // 1 RTT au lieu de 26
// Hydrater un cache mémoire local que la cascade consulte avant Redis
const localPriceCache = new Map<string, CachedPrice>();
for (let i = 0; i < priceKeys.length; i++) {
  const p = cachedPrices[i];
  if (p) localPriceCache.set(priceKeys[i], p);
}
```

Même pattern pour les markers (`mget` batch) et les metadata ERC20.

**Nouvelles méthodes sur `CacheStore`** :

```typescript
interface CacheStore {
  // ... existants
  mget<T>(keys: string[]): Promise<(T | undefined)[]>;
}
```

Implémentation Redis : `client.mget(keys)` → parse JSON. Fallback MemoryCacheStore : `keys.map(k => map.get(k))`.

**Impact combiné** : ~180 GETs → ~15-20 GETs par scan EVM. Gain de latence estimé : -40-60%.

#### 3d. Balance cache conditionnel (no-TX shortcut)

**Principe** : après un scan réussi, on stocke le block number courant + les balances. Au scan suivant, on détecte s'il y a eu des transactions sur le couple chaîne/wallet depuis le dernier scan.

```typescript
// Après scan réussi (fire-and-forget) :
cache.set(`bal:${key}:${normalizedAddress}`, {
  native: { balance, priceEur, valueEur },
  tokens: tokens.map(t => ({ contract: t.contract, balance: t.balance, priceEur: t.priceEur, valueEur: t.valueEur })),
  block: currentBlock,
  ts: Date.now()
}, 3600_000).catch(() => {});

// Au scan suivant (après discovery, avant balances) :
const cachedBal = await cache.get(`bal:${key}:${normalizedAddress}`);
if (cachedBal && cachedBal.block != null) {
  const logs = await rpc.eth_getLogs({
    address: normalizedAddress,
    fromBlock: `0x${(cachedBal.block + 1).toString(16)}`,
    toBlock: 'latest'
  });
  if (logs.length === 0) {
    // Aucune TX → balances inchangées, retour immédiat
    return buildResultFromCache(cachedBal, chain, errors);
  }
  // TX détectée → scan complet, le cache sera écrasé à la fin
}
```

**Clé cache** : `bal:{chain}:{addr}`, TTL 1h. Déjà utilisé comme fallback, on l'upgrade en cache primaire avec block cursor.

**Sécurité** :
- Si `eth_getLogs` échoue → fallback au scan complet (pas de faux négatif)
- Si le cache est stale (>1h) → scan complet
- `forceRefresh` bypass ce cache

**Impact** : pour les wallets inactifs (majorité des rescans), le scan passe de ~5-15s à ~200ms (1 `eth_getLogs` rapide au lieu de N `balanceOf` + pricing cascade).

#### 3e. Intra-scan price cache partagé entre workers

**Problème** : quand `SCAN_CONCURRENCY=30` scanne 30 chaînes en parallèle, le prix de l'ETH (natif sur Base, Ethereum, Arbitrum, Optimism, etc.) est calculé **30 fois indépendamment**. Chaque worker appelle DefiLlama/CoinGecko en parallèle → appels HTTP redondants.

```typescript
// Dans scan.ts — partagé entre tous les workers du même scan
const intraScanPriceCache = new Map<string, Promise<PricingResult>>();

// Dans priceTokenCascade, avant d'appeler une source externe :
const key = normalizePriceKey(options.token.key);
const cached = intraScanPriceCache.get(key);
if (cached) return cached;
const promise = priceTokenCascade(options);
intraScanPriceCache.set(key, promise);
return promise;
```

**Injection** : le `PriceTokenCascadeOptions` reçoit une référence au cache intra-scan via `options.sharedPriceCache` (déjà présent) — on ajoute un `options.intraScanCache?: Map<string, Promise<PricingResult>>`.

**Nettoyage** : le Map est créé au début du scan et garbage-collecté après le `Promise.all`. Pas de TTL nécessaire (durée de vie du scan).

**Impact** : prix de l'ETH calculé 1 fois au lieu de 30. Sur un scan multi-chaînes avec tokens communs (USDC, WETH, WBTC), -50% à -80% d'appels pricing HTTP.

### 4. Métriques cache hit/miss/stale par scan

**Fichiers modifiés** : `evm.ts`, `svm.ts`, `cosmos.ts`, `scan.ts`

Nouveau type dans `packages/core/src/engines/types.ts` :

```typescript
export interface CacheStats {
  hits: number;      // lecture cache → valeur trouvée et valide
  misses: number;    // lecture cache → undefined
  stale: number;     // lecture cache → valeur présente mais TTL expiré
  skipped: number;   // skip délibéré (negative cache, meta:skip)
}

// Ajouté à WalletAssetsCommon
export interface WalletAssetsCommon<TToken = Record<string, unknown>> {
  // ... existants
  cacheStats?: CacheStats;
}
```

Compteurs dans chaque engine :
- `evm.ts` : negative cache check, native cache, discovery cache, balance cache, token cache
- `svm.ts` : negative cache, native cache, token accounts cache
- `cosmos.ts` : negative cache, delegations cache, rewards cache

Retour dans le scan response (`scan.ts`) :

```typescript
metrics: {
  totalMs: number,
  chainsScanned: number,
  chainsWithErrors: number,
  totalTokens: number,
  pricedTokens: number,
  cacheStats: {
    totalHits: number,
    totalMisses: number,
    totalStale: number,
    totalSkipped: number,
    hitRate: string // "0.73"
  }
}
```

### 5. Endpoint GET `/api/metrics/errors`

**Fichier** : `apps/api/src/plugins/metrics.ts` (nouveau) ou ajouté à `scan.ts`

Endpoint lecture seule, pas d'auth requise :

```json
{
  "byType": {
    "rpc_consensus_failed": 156,
    "pricing_no_price": 42,
    "blockscout_429": 8,
    "non_erc20_skipped": 26,
    "chain_timeout": 3,
    "circuit_open": 1
  },
  "byChain": {
    "GNOSIS": { errors: 26, rpc: 26, pricing: 0, skipped: 26 },
    "BASE": { errors: 0, rpc: 0, pricing: 0, skipped: 0 }
  },
  "circuits": {
    "open": [],
    "half_open": [],
    "closed_count": 180
  },
  "cacheBackend": "redis",
  "scanConcurrency": 30,
  "uptime": "2h 15m",
  "startedAt": "2026-05-20T10:30:00.000Z"
}
```

Les compteurs sont alimentés par `metrics.recordScan()` existant + nouveaux compteurs pour `non_erc20_skipped` et `chain_timeout`. Volatils (reset au restart).

### 6. Timeout global par chaîne

**Fichier** : `apps/api/src/plugins/scan.ts` (modifié)

Dans le scan pool (`pLimit`) :

```typescript
const CHAIN_TIMEOUT_MS = Number(process.env.SCAN_CHAIN_TIMEOUT_MS) || 30_000;

class ChainTimeoutError extends Error {
  constructor(chain: string, ms: number) {
    super(`chain_timeout: ${chain} exceeded ${ms}ms`);
    this.name = "ChainTimeoutError";
  }
}

const rawResults = await Promise.all(activeChains.map((chain) => scanPool(async () => {
  try {
    return await Promise.race([
      getWalletAssets(parsedAddress.data, chain, { ... }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new ChainTimeoutError(chain, CHAIN_TIMEOUT_MS)), CHAIN_TIMEOUT_MS)
      )
    ]);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { chain, chainName: chain, native: { ... }, tokens: [], errors: [msg], totalValueEur: 0, scanMs: 0 };
  }
})));
```

**Impact** : un scan de 120 chaînes ne bloque jamais plus de `30s × SCAN_CONCURRENCY` en worst case. En pratique, les chaînes saines retournent en <5s et libèrent des slots.

**Env** : `SCAN_CHAIN_TIMEOUT_MS` (défaut 30000). Configurable par déploiement.

## Fichiers modifiés

| Fichier | Changement |
|---------|------------|
| `packages/core/src/cache/types.ts` | Ajout `mget<T>(keys)` à l'interface `CacheStore` |
| `packages/core/src/cache/memory-cache.ts` | Implémentation `mget` |
| `packages/core/src/cache/redis-store.ts` | Implémentation `mget` via `client.mget` |
| `packages/core/src/rpc/rpc-health.ts` | **Nouveau** — RpcHealthTracker |
| `packages/core/src/rpc/index.ts` | Export rpcHealth |
| `packages/core/src/engines/evm.ts` | Intégration rpcHealth, filtre non-ERC20, cacheStats |
| `packages/core/src/engines/svm.ts` | CacheStats |
| `packages/core/src/engines/cosmos.ts` | CacheStats |
| `packages/core/src/engines/types.ts` | Interface CacheStats |
| `packages/core/src/metrics.ts` | Nouveaux compteurs (non_erc20_skipped, chain_timeout) |
| `apps/api/src/plugins/scan.ts` | Timeout par chaîne, cacheStats dans metrics |
| `apps/api/src/plugins/metrics.ts` | **Nouveau ou ajouté** — GET `/api/metrics/errors` |

## Tests de garde

1. `rpc-health.test.ts` — recordSuccess/Failure, getHealthyEndpoints filtre, TTL expiry, fallback si tous filtrés
2. `evm.test.ts` — non-ERC20 skip détecté et caché, cacheStats comptent correctement, timeout par chaîne retourne erreur structurée
3. `svm.test.ts` — cacheStats comptent correctement
4. `cosmos.test.ts` — cacheStats comptent correctement
5. `scan.test.ts` — timeout par chaîne ne bloque pas les autres chaînes, metrics/errors endpoint retourne structure valide

## Risques et mitigations

| Risque | Mitigation |
|--------|------------|
| RpcHealth filtre trop agressivement | Fallback sur liste complète si <2 endpoints restants |
| Cache meta:skip faux positif | TTL 24h seulement, pas permanent. Un scan forceRefresh bypass le cache |
| Timeout trop court pour chaînes lentes | Configurable via env, défaut 30s (suffisant pour 95% des chaînes) |
| Métriques endpoint expose des infos sensibles | Lecture seule, pas d'adresses wallet, pas de données utilisateur |

## Critères de succès

- [ ] Scan Base retourne en <15s au lieu de timeout 90s+
- [ ] SolvBTC apparaît de façon fiable (pas de disparition intermittente)
- [ ] Erreurs Gnosis `balance consensus failed` réduites de 26 à ~0 (non-ERC20 filtrés)
- [ ] `cacheStats.hitRate` visible dans la réponse scan
- [ ] `GET /api/metrics/errors` retourne une structure valide avec compteurs par type/chaîne
- [ ] Round-trips Redis par scan EVM réduits de ~180 à <25 (vérifiable via logs Redis MONITOR)
- [ ] Scan result cache hit sur re-scan <5 min → 0 RPC calls
- [ ] Balance no-TX shortcut : re-scan wallet inactif <500ms (1 eth_getLogs au lieu de N balanceOf)
- [ ] Intra-scan price cache : prix ETH calculé 1 fois au lieu de N (scan multi-chaînes)
- [ ] Tous les tests core passent (139/139 minimum)
- [ ] Build core et API passent sans erreur
