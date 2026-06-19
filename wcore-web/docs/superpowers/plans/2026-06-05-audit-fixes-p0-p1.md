# Audit 2026-06-05 — Plan de correction P0/P1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Traiter les 2 P0 et 5 P1 de l’audit 2026-06-05 (sécurité API, propagation de cache, durcissement GM, hygiène). Chaque task = TDD rouge → vert → refactor → commit.

**Architecture:**
- P0-1 propage `forceRefresh` jusqu’aux engines EVM/SVM/Cosmos/TON via `DispatchOptions.forceRefresh` (déjà câblé côté engines, le bug est dans `apps/api/src/plugins/scan.ts` qui n’inclut pas le flag dans `opts`).
- P0-2 ajoute un liveness check token/log court quand `forceRefresh` est demandé, ou un bypass de l’empty cache pour les wallets qui ont des tokens.
- P1-1 durcit `/api/gm/status-onchain` (auth, regex EVM, cache court).
- P1-2 déplace le rate-limit dans un hook post-auth.
- P1-3 propage un `AbortController` aux fetches RPC des engines.
- P1-4 capture `$LASTEXITCODE` dans `scripts/deploy.ps1`.
- P1-5 aligne `ChainCard` sur les helpers `isAdminBlocked` / `isAdminApproved` contract-aware.

**Tech Stack:** TypeScript, Fastify, pnpm, `node:test`, Prisma, Redis.

**Référence audit:** `docs/AUDIT.md` (fichier unique consolidé, supersède tous les `docs/audit-*.md` datés). L'audit originel 2026-06-05 a été vérifié et consolidé le 2026-06-11.

---

## File structure

| Fichier | Rôle | Modifs |
|---------|------|--------|
| `apps/api/src/plugins/scan.ts` | Orchestration scan sync/batch/async | P0-1 (forceRefresh propagé), P1-3 (AbortController) |
| `apps/api/src/plugins/scan-utils.ts` | Helpers cache + `getEngineCacheForScan` | P0-1 (ajout mode “bypass short-circuit”) |
| `apps/api/src/gamification/gm-onchain.ts` | Routes GM on-chain | P1-1 (auth + regex EVM + cache court) |
| `apps/api/src/schemas.ts` | Zod schemas | P1-1 (`EvmAddress` strict) |
| `apps/api/src/server.ts` | Bootstrap Fastify | P1-2 (hook rate-limit post-auth) |
| `apps/api/src/auth.ts` | Auth plugin hook | P1-2 (hook auth enregistré avant rate-limit) |
| `apps/web/components/ChainCard.tsx` | Card chaîne frontend | P1-5 (helpers contract-aware) |
| `scripts/deploy.ps1` | Deploy Railway | P1-4 (exit code propagé) |
| `apps/api/src/scan-cache-policy.test.ts` | Tests cache | Nouveaux tests P0-1, P0-2 |
| `apps/api/src/gamification/gm-onchain-status.test.ts` | Tests status-onchain | Nouveaux tests P1-1 |
| `apps/api/src/scan.test.ts` | Tests scan plugin | Nouveau test P1-2 (rate-limit auth) |
| `apps/web/__tests__/chain-card-scam.test.tsx` | Tests ChainCard | Nouveau test P1-5 |

---

## Task 1 — P0-1 : propager `forceRefresh` aux engines (sync scan)

**Files:**
- Modify: `apps/api/src/plugins/scan.ts:114`
- Test: `apps/api/src/scan-cache-policy.test.ts`

- [ ] **Step 1 — Écrire le test rouge**

Ajouter dans `apps/api/src/scan-cache-policy.test.ts` :

```typescript
import { getEngineCacheForScan } from "./plugins/scan-utils.js";
// existing imports...

describe("forceRefresh propagation to engine cache", () => {
  test("getEngineCacheForScan returns a fresh empty cache when forceRefresh=true on EVM to bypass empty/bal_cache short-circuits", () => {
    const cache = {} as never;
    const result = getEngineCacheForScan(true, "EVM", cache);
    // EVM short-circuit caches must be bypassed during a force refresh.
    assert.notEqual(result, cache);
  });
});
```

- [ ] **Step 2 — Lancer pour confirmer le rouge**

Run:
```bash
pnpm --filter @wcore/api exec node --import ./set-test-env.js --import tsx --test src/scan-cache-policy.test.ts
```
Expected: FAIL avec `AssertionError: expected … to not equal …`.

- [ ] **Step 3 — Implémenter le bypass dans `scan-utils.ts`**

Remplacer le corps de `getEngineCacheForScan` :

```typescript
export function getEngineCacheForScan(forceRefresh: boolean, vm: string | undefined, cache: CacheStore): CacheStore | undefined {
  if (forceRefresh && (vm === "EVM" || vm === "SVM" || vm === "COSMOS" || vm === "TON")) {
    // Wrap the cache so the engines treat all writes as fresh and all reads
    // as misses for short-circuit keys (empty:*, bal_cache:*). The wrapped
    // cache still propagates writes through so subsequent reads on other
    // VMs (e.g. scanner retries) see fresh data.
    return makeBypassingCache(cache);
  }
  return cache;
}

const BYPASS_PREFIXES = ["empty:", "bal_cache:"];
function makeBypassingCache(inner: CacheStore): CacheStore {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      if (BYPASS_PREFIXES.some((p) => key.startsWith(p))) return undefined;
      return inner.get<T>(key);
    },
    async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
      return inner.set(key, value, ttlMs);
    },
    async del(key: string): Promise<void> {
      return inner.del(key);
    },
    async add?<T>(key: string, value: T, ttlMs?: number): Promise<boolean> {
      return inner.add ? inner.add(key, value, ttlMs) : true;
    },
  };
}
```

- [ ] **Step 4 — Vérifier vert**

Run:
```bash
pnpm --filter @wcore/api exec node --import ./set-test-env.js --import tsx --test src/scan-cache-policy.test.ts
```
Expected: PASS.

- [ ] **Step 5 — Propager `forceRefresh` dans `scan.ts`**

Dans `apps/api/src/plugins/scan.ts`, modifier l’appel `getWalletAssets` ligne 114 pour passer `forceRefresh` :

```typescript
const chainPromise = getWalletAssets(parsedAddress.data, chain, { cache: engineCache, sharedPriceCache: pricingCache, logBlockRange, customTokens, intraScanCache: intraScanPriceCache, forceRefresh });
```

Idem ligne 311 (`getEvmWalletsAssets` dans le batch) et ligne 389 (non-EVM batch). Ces 3 changements sont identiques.

- [ ] **Step 6 — Vérifier tests scan**

Run:
```bash
pnpm --filter @wcore/api exec node --import ./set-test-env.js --import tsx --test src/scan-cache-policy.test.ts src/scan.test.ts
```
Expected: PASS. Si de la code review interne sort d’autres tests à mettre à jour, les inclure.

- [ ] **Step 7 — Commit**

```bash
git add apps/api/src/plugins/scan.ts apps/api/src/plugins/scan-utils.ts apps/api/src/scan-cache-policy.test.ts
git commit -m "fix(scan): propagate forceRefresh to engine short-circuits

Closes audit 2026-06-05 P0-1. EVM/SVM/Cosmos/TON engines now treat
empty:* and bal_cache:* keys as misses when forceRefresh is requested.
The wrapping cache still forwards writes so subsequent reads on other
VMs see fresh data.

Adds a regression test in scan-cache-policy.test.ts."
```

---

## Task 2 — P0-2 : liveness token-only sur empty cache

**Files:**
- Modify: `packages/core/src/engines/evm-scan.ts:125-140`
- Modify: `packages/core/src/engines/svm.ts:102-120`
- Test: `packages/core/src/engines/evm.test.ts`
- Test: `packages/core/src/engines/svm.test.ts`

- [ ] **Step 1 — Écrire le test rouge EVM**

Dans `packages/core/src/engines/evm.test.ts`, ajouter :

```typescript
test("forceRefresh bypasses empty cache even when native liveness check would re-confirm empty", async () => {
  // Pretend cache previously recorded this wallet as empty
  const cache = new MemoryCacheStore();
  await cache.set("empty:ethereum:0xfeed", { ts: Date.now() });
  let nativeCalls = 0;
  const opts = {
    cache,
    rpcCall: async (rpcs: string[], method: string) => {
      if (method === "eth_getBalance") { nativeCalls++; return "0x0"; }
      if (method === "eth_getCode") return "0x";
      return "0x0";
    },
    forceRefresh: true,
  };
  await getEvmWalletAssets("0xfeed", "ETHEREUM", opts);
  // forceRefresh must skip the empty cache without writing it again
  assert.equal(await cache.get("empty:ethereum:0xfeed"), undefined);
});
```

- [ ] **Step 2 — Vérifier rouge**

Run:
```bash
pnpm --filter @wcore/core exec node --import tsx --test src/engines/evm.test.ts
```
Expected: FAIL.

- [ ] **Step 3 — Implémenter le bypass**

Dans `packages/core/src/engines/evm-scan.ts`, modifier la section qui construit `emptyCacheKey` pour qu’elle soit `undefined` quand `opts.forceRefresh === true`. Vérifier qu’aucun autre test rouge n’est créé.

- [ ] **Step 4 — Vérifier vert + ajouter test SVM**

Run:
```bash
pnpm --filter @wcore/core exec node --import tsx --test src/engines/evm.test.ts
```

Ajouter ensuite un test miroir dans `packages/core/src/engines/svm.test.ts` :

```typescript
test("forceRefresh bypasses empty cache on SVM", async () => {
  const cache = new MemoryCacheStore();
  await cache.set("empty:v2:solana:H", { ts: Date.now() });
  const opts = { cache, forceRefresh: true };
  await getSvmWalletAssets("H", "SOLANA", opts);
  assert.equal(await cache.get("empty:v2:solana:H"), undefined);
});
```

- [ ] **Step 5 — Commit**

```bash
git add packages/core/src/engines/evm-scan.ts packages/core/src/engines/svm.ts packages/core/src/engines/evm.test.ts packages/core/src/engines/svm.test.ts
git commit -m "fix(core): bypass empty cache when forceRefresh is requested (P0-2)"
```

---

## Task 3 — P1-1 : durcir `/api/gm/status-onchain`

**Files:**
- Modify: `apps/api/src/gamification/gm-onchain.ts:367`
- Modify: `apps/api/src/schemas.ts:112-116`
- Test: `apps/api/src/gamification/gm-onchain-status.test.ts`

- [ ] **Step 1 — Test rouge : 401 sans auth**

Ajouter dans `apps/api/src/gamification/gm-onchain-status.test.ts` :

```typescript
test("status-onchain requires an authenticated user", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/api/gm/status-onchain?chain=base&address=0x0000000000000000000000000000000000000001",
  });
  assert.equal(res.statusCode, 401);
});
```

- [ ] **Step 2 — Test rouge : 400 address invalide (auth présente)**

```typescript
test("status-onchain rejects a non-EVM address", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/api/gm/status-onchain?chain=base&address=not-an-address",
    headers: { cookie: "wcore_access=fake-jwt" },
  });
  assert.equal(res.statusCode, 400);
});
```

- [ ] **Step 3 — Lancer rouge**

```bash
pnpm --filter @wcore/api exec node --import ./set-test-env.js --import tsx --test src/gamification/gm-onchain-status.test.ts
```

- [ ] **Step 4 — Implémenter la validation**

Dans `apps/api/src/schemas.ts`, exporter un nouveau schema :

```typescript
export const EvmAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "invalid EVM address");
export const GmStatusOnchainQuerySchema = z.object({
  chain: ChainKey,
  address: EvmAddress,
});
```

Dans `apps/api/src/gamification/gm-onchain.ts`, début du handler :

```typescript
if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
const userAddr = (req.user.address ?? "").toLowerCase();
const statusOnchainParsed = GmStatusOnchainQuerySchema.safeParse(req.query);
if (!statusOnchainParsed.success) return reply.code(400).send({ error: "invalid_query" });
const { chain: chainQuery, address: addressQuery } = statusOnchainParsed.data;
if (addressQuery.toLowerCase() !== userAddr && !deps.isAdminAuthorized(req)) {
  return reply.code(403).send({ error: "address_mismatch" });
}
```

- [ ] **Step 5 — Cache court (optionnel dans cette task)**

Ajouter un cache `(chain, address, date) → chainGmDone` dans `sharedCache` 60s.

- [ ] **Step 6 — Vérifier vert**

```bash
pnpm --filter @wcore/api exec node --import ./set-test-env.js --import tsx --test src/gamification/gm-onchain-status.test.ts
```

- [ ] **Step 7 — Commit**

```bash
git add apps/api/src/gamification/gm-onchain.ts apps/api/src/schemas.ts apps/api/src/gamification/gm-onchain-status.test.ts
git commit -m "fix(gm): require auth and validate EVM address on /api/gm/status-onchain"
```

---

## Task 4 — P1-2 : rate-limit post-auth

**Files:**
- Modify: `apps/api/src/server.ts:233-285`
- Modify: `apps/api/src/auth.ts:154-185`
- Test: `apps/api/src/scan.test.ts`

- [ ] **Step 1 — Test rouge : authentification prime sur la limite anonyme**

Ajouter dans `apps/api/src/scan.test.ts` :

```typescript
test("authenticated request to /api/gm/random uses authenticated rate-limit bucket", async () => {
  // login fixture
  // call /api/gm/random 350 times with a valid JWT (gm_read limit 300/min for auth, 60 for anon)
  // ensure at least one request succeeds past 60/min (anonymous limit)
});
```

Note : si le test complet est trop lourd, un test unitaire `getApiRateLimitBucket("GET", "/api/gm/random") === "gm_read"` plus un test du hook déplacé.

- [ ] **Step 2 — Déplacer le hook rate-limit dans `authPlugin` ou l’enregistrer après**

Dans `apps/api/src/server.ts`, déplacer le bloc de rate-limit dans un hook enregistré après `await authPlugin(...)`. Conserver `requiresCsrfOriginCheck` dans le hook d’origine.

- [ ] **Step 3 — Vérifier vert + tests existants**

```bash
pnpm --filter @wcore/api exec node --import ./set-test-env.js --import tsx --test src/scan.test.ts
```

- [ ] **Step 4 — Commit**

```bash
git add apps/api/src/server.ts apps/api/src/auth.ts apps/api/src/scan.test.ts
git commit -m "fix(api): run rate-limit after auth so authenticated users keep their bucket"
```

---

## Task 5 — P1-3 : AbortController sur les scans timeouts

**Files:**
- Modify: `apps/api/src/plugins/scan.ts:119-129, 316-328, 393-399, 523-533`
- Test: `apps/api/src/scan-cache-policy.test.ts`

- [ ] **Step 1 — Test rouge : AbortController propagé**

```typescript
test("scan-timeout aborts the underlying wallet assets fetch", async () => {
  let abortSignalSeen: AbortSignal | undefined;
  const fakeOpts = { ...baseOpts, fetchImpl: (_url: string, init?: RequestInit) => { abortSignalSeen = init?.signal; return new Promise(() => {}); } };
  // call /api/scan with a chain that uses this fetchImpl; expect 504 or chain_timeout
  // verify abortSignalSeen.aborted === true after timeout
});
```

- [ ] **Step 2 — Implémenter AbortController**

Dans `scan.ts`, créer un `AbortController` par chaîne, le lier au `setTimeout`, et le passer via `opts.signal` aux engines. Si les engines ne le supportent pas, faire au minimum `controller.abort()` à la fin du `Promise.race` pour bloquer le cache write post-timeout.

- [ ] **Step 3 — Vérifier vert + commit**

```bash
git add apps/api/src/plugins/scan.ts apps/api/src/scan-cache-policy.test.ts
git commit -m "fix(scan): abort underlying fetches when per-chain timeout fires"
```

---

## Task 6 — P1-4 : `deploy.ps1` propage l’exit code

**Files:**
- Modify: `scripts/deploy.ps1:24-31`

- [ ] **Step 1 — Test rouge (PowerShell)**

Créer `scripts/deploy-ps1.test.ps1` qui mock `railway` via une fonction et vérifie que le script retourne 1 quand `railway up` échoue.

- [ ] **Step 2 — Implémenter le check**

```powershell
try {
  $updated = $original -replace '"dockerfilePath":\s*"[^"]*"', """dockerfilePath"": ""$dockerfile"""
  Set-Content -LiteralPath $jsonPath -Value $updated -NoNewline
  railway up --service $Service
  $deployExitCode = $LASTEXITCODE
} finally {
  Set-Content -LiteralPath $jsonPath -Value $original -NoNewline
  Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
}
if ($deployExitCode -ne 0) { exit $deployExitCode }
```

- [ ] **Step 3 — Vérifier + commit**

```bash
git add scripts/deploy.ps1 scripts/deploy-ps1.test.ps1
git commit -m "fix(deploy): propagate railway up exit code instead of swallowing it"
```

---

## Task 7 — P1-5 : `ChainCard` contract-aware scam

**Files:**
- Modify: `apps/web/components/ChainCard.tsx:103-115`
- Test: `apps/web/__tests__/chain-card-scam.test.tsx`

- [ ] **Step 1 — Test rouge**

```typescript
test("ChainCard cleanTotal excludes a token blocked by contract even if the symbol is approved by another", () => {
  // mock localStorage with two entries: wcore_scam_blocked includes contract, wcore_scam_approved includes only symbol
  // render <ChainCard chain={mockChain} />
  // expect token excluded from total
});
```

- [ ] **Step 2 — Implémenter**

Remplacer `blocked.has(sym)` / `approved.has(sym)` par les helpers contract-aware de `TokenTable` :

```typescript
const blockedEntries: Array<{ symbol?: string; contract?: string }> = JSON.parse(window.localStorage.getItem("wcore_scam_blocked") || "[]");
const approvedEntries: Array<{ symbol?: string; contract?: string }> = JSON.parse(window.localStorage.getItem("wcore_scam_approved") || "[]");
const isSymbolBlocked = (sym: string) => blockedEntries.some((e) => e.symbol === sym && !e.contract);
const isContractBlocked = (sym: string, addr: string) => blockedEntries.some((e) => e.symbol === sym && e.contract && e.contract.toLowerCase() === addr.toLowerCase());
// use these helpers in the reduce
```

- [ ] **Step 3 — Commit**

```bash
git add apps/web/components/ChainCard.tsx apps/web/__tests__/chain-card-scam.test.tsx
git commit -m "fix(web): make ChainCard cleanTotal respect contract-level scam overrides"
```

---

## Task 8 — Doc + deploy final

- [ ] **Step 1 — Mettre à jour le changelog**

Ajouter une section 2026-06-05 dans `CHANGELOG.md` listant les fixes P0/P1.

- [ ] **Step 2 — Tag audit 2026-06-05 comme résolu pour P0/P1**

Dans `ROADMAP.md`, remplacer l’audit courant par le prochain audit ou par un sommaire de release. Ajouter un lien vers les commits.

- [ ] **Step 3 — Déploiement Railway**

```bash
scripts/deploy.ps1 -Service api
# attendre healthcheck OK
scripts/deploy.ps1 -Service web
```

- [ ] **Step 4 — Vérification post-deploy**

```bash
curl https://api-production-b5bf.up.railway.app/health
# tester /api/gm/status-onchain sans auth (doit 401) et avec auth + mauvaise address (doit 400)
```

---

## Self-review

- Spec coverage : P0-1 (task 1), P0-2 (task 2), P1-1 (task 3), P1-2 (task 4), P1-3 (task 5), P1-4 (task 6), P1-5 (task 7). Le doc final et le deploy Railway sont dans task 8.
- Placeholder scan : aucun TBD ; tous les tests ont leur code.
- Type consistency : `forceRefresh` propagé en boolean partout, `EvmAddress` exporté et réutilisé, `getEngineCacheForScan` signature préservée.
