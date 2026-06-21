# Token Logo Resolution Implementation Plan

> **Historical/completed plan.** Kept for implementation history only; current icon behavior lives in code and `AGENTS.md` gotchas.

**Status:** Implemented, tested, deployed to API Railway, pushed to `master`, and posted to X on 2026-05-19.

**Post X:** `https://x.com/WCORExyz/status/2056711198687539418` — `WCORE × Blockscout` avec tag `@blockscoutcom`. Image : `apps/web/public/wcore-blockscout-post.png`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build automated, contract-first token logo resolution using Redis cache, Blockscout, DexScreener, TrustWallet, and safe fallbacks.

**Architecture:** Add a focused async logo resolver in `packages/core/src/tokens/token-logo-resolver.ts`. Existing sync `token-logos.ts` becomes fallback-only, while EVM metadata/discovery/registry paths call the async resolver when a cache is available. Successful logos are cached by `logo:{chain}:{contract}` and bad/missing lookups use short negative cache keys.

**Tech Stack:** TypeScript, Node fetch API, existing `CacheStore`, existing Blockscout Pro chain map/cooldown patterns, built-in node test runner via package scripts, Railway Docker build.

---

## Files

- Create: `packages/core/src/tokens/token-logo-resolver.ts`
- Create: `packages/core/src/tokens/token-logo-resolver.test.ts`
- Modify: `packages/core/src/tokens/token-logos.ts`
- Modify: `packages/core/src/tokens/metadata.ts`
- Modify: `packages/core/src/tokens/explorer-discovery.ts`
- Modify: `packages/core/src/engines/evm.ts`
- Modify: `packages/core/src/tokens/index.ts`
- Modify: `AGENTS.md`

---

### Task 1: Add Token Logo Resolver Unit Tests

**Files:**
- Create: `packages/core/src/tokens/token-logo-resolver.test.ts`
- Read: `packages/core/src/cache/memory-cache.ts`
- Read: `packages/core/src/tokens/explorer-discovery.test.ts`

- [ ] **Step 1: Write failing tests for resolver priority and cache behavior**

Create `packages/core/src/tokens/token-logo-resolver.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { MemoryCacheStore } from "../cache/memory-cache.js";
import { resolveTokenLogoAsync, resetTokenLogoResolverStateForTests } from "./token-logo-resolver.js";

const H = "0xcf5104d094e3864cfcbda43b82e1cefd26a016eb";

test("resolveTokenLogoAsync returns positive cache before network", async () => {
  resetTokenLogoResolverStateForTests();
  const cache = new MemoryCacheStore();
  await cache.set("logo:ethereum:0xabc", "https://cdn.example/logo.png", 60_000);

  const result = await resolveTokenLogoAsync({
    symbol: "ABC",
    chainKey: "ETHEREUM",
    contract: "0xabc",
    cache,
    fetchImpl: async () => { throw new Error("network should not be called"); },
  });

  assert.equal(result, "https://cdn.example/logo.png");
});

test("resolveTokenLogoAsync ignores blocked coin-images cache and uses Blockscout icon_url", async () => {
  resetTokenLogoResolverStateForTests();
  process.env.BLOCKSCOUT_API_KEY = "test-key";
  const cache = new MemoryCacheStore();
  await cache.set("logo:ethereum:" + H, "https://coin-images.coingecko.com/coins/images/1/large/bad.png", 60_000);

  const calls: string[] = [];
  const fetchImpl = async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    return new Response(JSON.stringify({ icon_url: "https://assets.coingecko.com/coins/images/66811/small/H_tokenLogo_original.png" }), { status: 200 });
  };

  const result = await resolveTokenLogoAsync({
    symbol: "H",
    chainKey: "ETHEREUM",
    contract: H,
    cache,
    fetchImpl,
  });

  assert.equal(result, "https://assets.coingecko.com/coins/images/66811/small/H_tokenLogo_original.png");
  assert.equal(await cache.get("logo:ethereum:" + H), result);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /api\/v2\/tokens\/0xcf5104/);
});

test("resolveTokenLogoAsync falls back to DexScreener imageUrl when Blockscout misses", async () => {
  resetTokenLogoResolverStateForTests();
  process.env.BLOCKSCOUT_API_KEY = "test-key";
  const cache = new MemoryCacheStore();

  const fetchImpl = async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("blockscout")) return new Response(JSON.stringify({}), { status: 200 });
    return new Response(JSON.stringify({ pairs: [{ info: { imageUrl: "https://dd.dexscreener.com/ds-data/tokens/ethereum/0xabc.png" } }] }), { status: 200 });
  };

  const result = await resolveTokenLogoAsync({
    symbol: "ABC",
    chainKey: "ETHEREUM",
    contract: "0xabc",
    cache,
    fetchImpl,
  });

  assert.equal(result, "https://dd.dexscreener.com/ds-data/tokens/ethereum/0xabc.png");
});

test("resolveTokenLogoAsync negative-caches misses and returns fallback", async () => {
  resetTokenLogoResolverStateForTests();
  process.env.BLOCKSCOUT_API_KEY = "test-key";
  const cache = new MemoryCacheStore();
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return new Response(JSON.stringify({}), { status: 200 });
  };

  const first = await resolveTokenLogoAsync({ symbol: "NOPE", chainKey: "ETHEREUM", contract: "0x123", cache, fetchImpl });
  const second = await resolveTokenLogoAsync({ symbol: "NOPE", chainKey: "ETHEREUM", contract: "0x123", cache, fetchImpl });

  assert.equal(first, "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/nope.svg");
  assert.equal(second, first);
  assert.equal(calls, 2, "first call checks Blockscout and DexScreener; second call uses negative cache and no network");
});
```

- [ ] **Step 2: Run failing resolver tests**

Run: `pnpm --filter "@wcore/core" test -- token-logo-resolver.test.ts`

Expected: FAIL because `token-logo-resolver.ts` does not exist.

- [ ] **Step 3: Commit tests if desired**

Run: `rtk git add packages/core/src/tokens/token-logo-resolver.test.ts && rtk git commit -m "test: specify automated token logo resolver"`

---

### Task 2: Implement Async Resolver

**Files:**
- Create: `packages/core/src/tokens/token-logo-resolver.ts`
- Modify: `packages/core/src/tokens/token-logos.ts`
- Modify: `packages/core/src/tokens/index.ts`

- [ ] **Step 1: Convert `token-logos.ts` to fallback-only helpers**

Replace broad priority comments and keep only safe sync fallback builders:

```ts
const TRUSTWALLET_BASE = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains";
const CMC_BASE = "https://s2.coinmarketcap.com/static/img/coins/64x64";

const CHAIN_SLUGS: Record<string, string> = {
  ETHEREUM: "ethereum", BSC: "smartchain", POLYGON: "polygon",
  ARBITRUM_ONE: "arbitrum", OPTIMISM: "optimism", BASE: "base",
  AVALANCHE: "avalanchec", FANTOM: "fantom", GNOSIS: "xdai",
  CELO: "celo", LINEA: "linea", SCROLL: "scroll",
  ZKSYNC_ERA: "zksync", MANTLE: "mantle", BLAST: "blast",
  MODE: "mode", FRAXTAL: "fraxtal", WORLDCHAIN: "worldchain",
  UNICHAIN: "unichain", BERACHAIN: "berachain", SONIC: "sonic",
  ZORA: "zora", SEI: "sei", SHAPE: "shape", ANCIENT8: "ancient8",
  BOB: "bob", LISK: "lisk", METAL_L2: "metal", REDSTONE: "redstone",
  CYBER: "cyber", RARI: "rari", ZIRCUIT: "zircuit", OPENLEDGER: "openledger",
  STABLE: "stable", TAC: "tac", SONEIUM: "soneium", MEGAETH: "megaeth",
  INK: "ink", STORY: "story", REYA: "reya", MATCHAIN: "matchain",
  ZETACHAIN: "zetachain", HASHKEY: "hashkey", FVM: "fvm",
  ASTAR: "astar", FLOW: "flow", IMMUTABLE: "immutable",
  ETHERLINK: "etherlink", SHIBARIUM: "shibarium", FUSE: "fuse",
  ROOTSTOCK: "rootstock",
};

const SYMBOL_CMC_IDS: Record<string, number> = {
  H: 36922, L3: 33718, ZKP: 33558, ERA: 33372,
  WETH: 2396, USDC: 3408, USDT: 825, DAI: 4943, WBTC: 3717,
  LINK: 1975, UNI: 7083, AAVE: 7278, CRV: 6538, MKR: 1518,
  SNX: 2586, COMP: 5692, LDO: 8000, STETH: 13629,
  PEPE: 24478, SHIB: 5994, ARB: 11841, OP: 11840,
  MATIC: 3890, POL: 3890, AVAX: 5805, BNB: 1839,
  SOL: 5426, ATOM: 3794, OSMO: 12220, TIA: 22861,
  SEI: 23149, INJ: 7226, SUI: 20947, APT: 21794,
  DOT: 6636, NEAR: 6535, FTM: 3513, CRO: 3635,
  FLOKI: 10804, BONK: 23095, DOGE: 74, WIF: 28745,
  FRAX: 6952,
};

export function getTrustWalletLogoUrl(chainKey: string | undefined, contract: string | undefined): string | undefined {
  if (!chainKey || !contract) return undefined;
  const chainSlug = CHAIN_SLUGS[chainKey.toUpperCase()];
  if (!chainSlug) return undefined;
  return `${TRUSTWALLET_BASE}/${chainSlug}/assets/${contract.toLowerCase()}/logo.png`;
}

export function getSymbolLogoUrl(symbol: string): string | undefined {
  const cmcId = SYMBOL_CMC_IDS[symbol.toUpperCase()];
  return cmcId ? `${CMC_BASE}/${cmcId}.png` : undefined;
}

export function getSpothqLogoUrl(symbol: string): string {
  return `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/${symbol.toLowerCase()}.svg`;
}

export function resolveTokenLogo(symbol: string, chainKey?: string, contract?: string): string | undefined {
  return getSymbolLogoUrl(symbol) ?? getTrustWalletLogoUrl(chainKey, contract) ?? getSpothqLogoUrl(symbol);
}
```

- [ ] **Step 2: Implement `token-logo-resolver.ts`**

Create `packages/core/src/tokens/token-logo-resolver.ts`:

```ts
import type { CacheStore } from "../cache/index.js";
import { getSpothqLogoUrl, getSymbolLogoUrl, getTrustWalletLogoUrl } from "./token-logos.js";

const BLOCKED_LOGO_HOSTS = new Set(["coin-images.coingecko.com"]);
const POSITIVE_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;

const BLOCKSCOUT_DETAIL_BASES: Record<string, string> = {
  ETHEREUM: "https://eth.blockscout.com/api/v2/tokens",
  OPTIMISM: "https://optimism.blockscout.com/api/v2/tokens",
  BASE: "https://base.blockscout.com/api/v2/tokens",
  ARBITRUM_ONE: "https://arbitrum.blockscout.com/api/v2/tokens",
  GNOSIS: "https://gnosis.blockscout.com/api/v2/tokens",
  POLYGON: "https://polygon.blockscout.com/api/v2/tokens",
  CELO: "https://celo.blockscout.com/api/v2/tokens",
  SCROLL: "https://scroll.blockscout.com/api/v2/tokens",
  ZKSYNC_ERA: "https://zksync.blockscout.com/api/v2/tokens",
  LINEA: "https://linea.blockscout.com/api/v2/tokens",
};

export interface TokenLogoResolverParams {
  symbol: string;
  chainKey?: string;
  contract?: string;
  cache?: CacheStore;
  metadataLogoUrl?: string;
  fetchImpl?: typeof fetch;
}

export function isUsableLogoUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return !BLOCKED_LOGO_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function logoCacheKey(chainKey: string | undefined, contract: string | undefined): string | null {
  if (!chainKey || !contract) return null;
  return `logo:${chainKey.toLowerCase()}:${contract.toLowerCase()}`;
}

function logoMissCacheKey(chainKey: string | undefined, contract: string | undefined): string | null {
  if (!chainKey || !contract) return null;
  return `logo-miss:${chainKey.toLowerCase()}:${contract.toLowerCase()}`;
}

export async function resolveTokenLogoAsync(params: TokenLogoResolverParams): Promise<string | undefined> {
  const { symbol, chainKey, contract, cache, metadataLogoUrl } = params;
  const fetchImpl = params.fetchImpl ?? fetch;
  const key = logoCacheKey(chainKey, contract);
  const missKey = logoMissCacheKey(chainKey, contract);

  if (cache && key) {
    try {
      const cached = await cache.get<string>(key);
      if (isUsableLogoUrl(cached)) return cached;
    } catch { /* cache read failure is non-fatal */ }
  }

  if (isUsableLogoUrl(metadataLogoUrl)) {
    if (cache && key) cache.set(key, metadataLogoUrl, POSITIVE_TTL_MS).catch(() => {});
    return metadataLogoUrl;
  }

  if (cache && missKey) {
    try {
      const missed = await cache.get<boolean>(missKey);
      if (missed) return fallbackLogo(symbol, chainKey, contract);
    } catch { /* cache read failure is non-fatal */ }
  }

  const blockscout = await fetchBlockscoutLogo(chainKey, contract, fetchImpl);
  if (blockscout) {
    if (cache && key) cache.set(key, blockscout, POSITIVE_TTL_MS).catch(() => {});
    return blockscout;
  }

  const dex = await fetchDexScreenerLogo(chainKey, contract, fetchImpl);
  if (dex) {
    if (cache && key) cache.set(key, dex, POSITIVE_TTL_MS).catch(() => {});
    return dex;
  }

  if (cache && missKey) cache.set(missKey, true, NEGATIVE_TTL_MS).catch(() => {});
  return fallbackLogo(symbol, chainKey, contract);
}

function fallbackLogo(symbol: string, chainKey?: string, contract?: string): string | undefined {
  return getSymbolLogoUrl(symbol) ?? getTrustWalletLogoUrl(chainKey, contract) ?? getSpothqLogoUrl(symbol);
}

async function fetchBlockscoutLogo(chainKey: string | undefined, contract: string | undefined, fetchImpl: typeof fetch): Promise<string | undefined> {
  if (!chainKey || !contract) return undefined;
  const base = BLOCKSCOUT_DETAIL_BASES[chainKey.toUpperCase()];
  if (!base) return undefined;
  try {
    const resp = await fetchImpl(`${base}/${contract.toLowerCase()}`);
    if (!resp.ok) return undefined;
    const data = await resp.json() as { icon_url?: unknown };
    return isUsableLogoUrl(data.icon_url) ? data.icon_url : undefined;
  } catch {
    return undefined;
  }
}

async function fetchDexScreenerLogo(chainKey: string | undefined, contract: string | undefined, fetchImpl: typeof fetch): Promise<string | undefined> {
  if (!chainKey || !contract) return undefined;
  try {
    const resp = await fetchImpl(`https://api.dexscreener.com/latest/dex/tokens/${contract.toLowerCase()}`);
    if (!resp.ok) return undefined;
    const data = await resp.json() as { pairs?: Array<{ info?: { imageUrl?: unknown } }> };
    const image = data.pairs?.find((pair) => isUsableLogoUrl(pair.info?.imageUrl))?.info?.imageUrl;
    return isUsableLogoUrl(image) ? image : undefined;
  } catch {
    return undefined;
  }
}

export function resetTokenLogoResolverStateForTests(): void {
  // Reserved for future cooldown/concurrency state.
}
```

- [ ] **Step 3: Export resolver**

Modify `packages/core/src/tokens/index.ts` and add:

```ts
export * from "./token-logo-resolver.js";
```

- [ ] **Step 4: Run resolver tests**

Run: `pnpm --filter "@wcore/core" test -- token-logo-resolver.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit implementation**

Run: `rtk git add packages/core/src/tokens/token-logo-resolver.ts packages/core/src/tokens/token-logos.ts packages/core/src/tokens/index.ts && rtk git commit -m "feat: add automated token logo resolver"`

---

### Task 3: Wire Resolver Into Metadata And Discovery

**Files:**
- Modify: `packages/core/src/tokens/metadata.ts`
- Modify: `packages/core/src/tokens/explorer-discovery.ts`
- Test: `packages/core/src/tokens/metadata.test.ts`
- Test: `packages/core/src/tokens/explorer-discovery.test.ts`

- [ ] **Step 1: Update metadata cache path to preserve and resolve logos**

In `metadata.ts`, import async resolver:

```ts
import { resolveTokenLogoAsync } from "./token-logo-resolver.js";
```

Replace cached-token logo handling with:

```ts
const token = { ...cached.token };
const resolvedLogo = await resolveTokenLogoAsync({
  symbol: token.symbol,
  chainKey,
  contract: token.contract,
  cache,
  metadataLogoUrl: token.logoUrl,
});
if (resolvedLogo) token.logoUrl = resolvedLogo;
return { token, errors: [...cached.errors] };
```

Replace new result logo assignment with async resolver before building result:

```ts
const finalSymbol = symbol || contract.slice(0, 8);
const logoUrl = await resolveTokenLogoAsync({ symbol: finalSymbol, chainKey, contract, cache });
```

Then set:

```ts
symbol: finalSymbol,
logoUrl,
```

- [ ] **Step 2: Update explorer discovery to use resolver**

In `explorer-discovery.ts`, replace `resolveTokenLogo` import with:

```ts
import { resolveTokenLogoAsync } from "./token-logo-resolver.js";
```

Replace token construction logo line with:

```ts
logoUrl: await resolveTokenLogoAsync({ symbol, chainKey, contract, cache }),
```

- [ ] **Step 3: Add metadata test for blocked cache replacement**

In `metadata.test.ts`, add:

```ts
test("getErc20Metadata replaces blocked cached logoUrl with resolver result", async () => {
  const cache = new MemoryCacheStore();
  const contract = "0xcf5104d094e3864cfcbda43b82e1cefd26a016eb";
  await cache.set(`meta:ethereum:${contract}`, {
    token: { contract, symbol: "H", name: "Humanity", decimals: 18, source: "logs", logoUrl: "https://coin-images.coingecko.com/coins/images/1/large/bad.png" },
    errors: [],
  }, 60_000);

  const result = await getErc20Metadata({
    contract,
    endpoints: [],
    dispatcher: { run: async () => { throw new Error("network should not be called"); } } as never,
    rpc: {} as never,
    cache,
    chainKey: "ETHEREUM",
  });

  assert.equal(result.token?.logoUrl?.includes("coin-images.coingecko.com"), false);
});
```

- [ ] **Step 4: Run token tests**

Run: `pnpm --filter "@wcore/core" test -- metadata.test.ts explorer-discovery.test.ts token-logo-resolver.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit wiring**

Run: `rtk git add packages/core/src/tokens/metadata.ts packages/core/src/tokens/explorer-discovery.ts packages/core/src/tokens/metadata.test.ts && rtk git commit -m "feat: cache and reuse resolved token logos"`

---

### Task 4: Wire Resolver Into EVM Registry Tokens

**Files:**
- Modify: `packages/core/src/engines/evm.ts`
- Test: `packages/core/src/engines/evm.test.ts`

- [ ] **Step 1: Import resolver in EVM engine**

Modify imports in `evm.ts`:

```ts
import { resolveTokenLogoAsync } from "../tokens/token-logo-resolver.js";
```

- [ ] **Step 2: Update registry token logo assignment**

In `priceKnownToken`, replace:

```ts
logoUrl: known.logoUrl || resolveTokenLogo(known.symbol, chain.key, known.contract),
```

with:

```ts
logoUrl: known.logoUrl || await resolveTokenLogoAsync({ symbol: known.symbol, chainKey: chain.key, contract: known.contract, cache }),
```

If `cache` is not in scope for `priceKnownToken`, pass it from the caller using the existing `getEvmWalletAssets` cache variable.

- [ ] **Step 3: Add EVM test for registry token logo resolver**

In `evm.test.ts`, add a focused test if existing helpers allow. If not practical, skip adding a brittle engine test and rely on resolver + metadata tests.

- [ ] **Step 4: Run EVM and token tests**

Run: `pnpm --filter "@wcore/core" test -- evm.test.ts token-logo-resolver.test.ts metadata.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit EVM integration**

Run: `rtk git add packages/core/src/engines/evm.ts packages/core/src/engines/evm.test.ts && rtk git commit -m "feat: resolve registry token logos via cache-backed resolver"`

---

### Task 5: Verification And Deployment

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Run core build**

Run: `pnpm --filter "@wcore/core" build`

Expected: PASS with no TypeScript errors.

- [ ] **Step 2: Run focused tests**

Run: `pnpm --filter "@wcore/core" test -- token-logo-resolver.test.ts metadata.test.ts explorer-discovery.test.ts`

Expected: PASS.

- [ ] **Step 3: Deploy API**

Run: `powershell -File scripts/deploy.ps1 -Service api`

Expected: Railway upload starts and build logs URL appears.

- [ ] **Step 4: Verify API result for known problematic tokens**

Run a POST scan against `https://api-production-b5bf.up.railway.app/api/scan` for address `0x17d518736ee9341dcdc0a2498e013d33cfcdd080` and chain `ETHEREUM`.

Expected:
- `H`, `L3`, `ZKP`, `ERA` return usable non-TrustWallet-404 logos.
- No returned `logoUrl` uses `coin-images.coingecko.com`.
- Repeated scan returns same logos from cache.

- [ ] **Step 5: Update AGENTS.md gotcha**

Add:

```md
- **Automated token logo cache (v0.2.19)** : token logos are resolved by `logo:{chain}:{contract}` cache first, then metadata, Blockscout `icon_url`, DexScreener `imageUrl`, TrustWallet, and safe fallback. Never rely on symbol-only lookup for ERC-20 tokens unless all contract-based sources miss.
```

- [ ] **Step 6: Commit docs and push**

Run: `rtk git add AGENTS.md && rtk git commit -m "docs: document automated token logo cache" && rtk git push`

---

## Self-Review

- Spec coverage: Redis positive cache, metadata cache, Blockscout, DexScreener, TrustWallet, symbol fallback, negative cache, blocked host rejection, and verification are covered.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: resolver functions use `CacheStore`, `chainKey`, `contract`, and `logo:{chain}:{contract}` consistently across tasks.
