// Shared scan utilities extracted from scan.ts for reuse across endpoints.
import type { CacheStore, WalletAssets } from "@wcore/core";
import { cacheKey, type ChainScan } from "@wcore/shared";

export interface TimeoutHandle<T> {
  promise: Promise<T>;
  cancel: () => void;
}

/**
 * Race a factory against a deadline. The factory receives an AbortController's
 * signal: when the deadline fires, the signal is aborted BEFORE the wrapper
 * rejects, so the underlying promise (e.g. an engine scan calling RPC) can
 * observe `signal.aborted === true` and short-circuit its internal fetches.
 *
 * Use `cancel()` to abort early without waiting for the deadline (e.g. when
 * the caller has already given up for another reason).
 */
export function runWithTimeout<T>(factory: (signal: AbortSignal) => Promise<T>, ms: number): TimeoutHandle<T> {
  const controller = new AbortController();
  const timeoutError = new Error(`chain_timeout: exceeded ${ms}ms`);

  let resolveOuter!: (value: T) => void;
  let rejectOuter!: (err: unknown) => void;
  const outer = new Promise<T>((resolve, reject) => {
    resolveOuter = resolve;
    rejectOuter = reject;
  });

  let settled = false;
  const settle = (action: "resolve" | "reject", value: unknown) => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    if (action === "resolve") resolveOuter(value as T);
    else rejectOuter(value);
  };

  const timer = setTimeout(() => {
    controller.abort();
    settle("reject", timeoutError);
  }, ms);

  factory(controller.signal).then(
    (value) => settle("resolve", value),
    (err) => settle("reject", err),
  );

  return {
    promise: outer,
    cancel: () => {
      if (settled) return;
      controller.abort();
      settle("reject", timeoutError);
    },
  };
}

const MAJOR_PRICEABLE_SYMBOLS = new Set(["AAVE", "AIXBT", "B3", "BNKR", "BTC", "CBETH", "CLANKER", "DAI", "EIGEN", "ETH", "ETHFI", "EURC", "LINK", "MOG", "PENDLE", "RETH", "SOLVBTC", "STETH", "UNI", "USDC", "USDT", "WBTC", "WETH", "WSTETH", "ZORA"]);

export const BALANCE_CACHE_TTL_MS = 3600_000;

export interface BalanceCacheEntry {
  nativeBalance: string;
  nativePriceEur: number | null;
  tokens: Array<{ contract: string; symbol: string; name: string; balance: string; decimals: number; priceEur: number | null }>;
  block: number;
  ts: number;
}

export function getBalanceCacheKey(chain: string, address: string): string {
  return `bal_cache:${chain.toLowerCase()}:${address.toLowerCase()}`;
}

export async function readBalanceCache(cache: CacheStore, chain: string, address: string): Promise<BalanceCacheEntry | null> {
  try {
    const cached = await cache.get<BalanceCacheEntry>(getBalanceCacheKey(chain, address));
    if (cached && (Date.now() - cached.ts) < BALANCE_CACHE_TTL_MS) return cached;
  } catch { /* cache miss */ }
  return null;
}

export function getScanResultCacheKey(address: string, chain: string): string {
  return cacheKey("scanResult", { address: address.toLowerCase(), chainKey: chain.toLowerCase() });
}

export function getEngineCacheForScan(forceRefresh: boolean, vm: string | undefined, cache: CacheStore): CacheStore | undefined {
  if (forceRefresh && (vm === "EVM" || vm === "SVM" || vm === "COSMOS" || vm === "TON")) {
    // Wrap the cache so the engines treat short-circuit keys (empty:*, bal_cache:*)
    // as misses during a force refresh. The wrapped cache still forwards all
    // writes/reads/deletes to the inner store so the next read on another VM
    // (e.g. a fallback retry) sees fresh data.
    return makeBypassingCache(cache);
  }
  return cache;
}

// Prefixes that engines consult to short-circuit a scan (return immediately
// without RPC calls). During a force refresh, the user has explicitly asked
// for fresh data, so we must hide these cached "shortcut" decisions and force
// the engine to re-evaluate against live RPCs.
const BYPASS_PREFIXES = ["empty:", "bal_cache:"];

function makeBypassingCache(inner: CacheStore): CacheStore {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      if (BYPASS_PREFIXES.some((p) => key.startsWith(p))) return undefined;
      return inner.get<T>(key);
    },
    async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
      await inner.set(key, value, ttlMs);
    },
    async delete(key: string): Promise<void> {
      await inner.delete(key);
    },
    async clear(): Promise<void> {
      await inner.clear();
    },
    async mget<T>(keys: string[]): Promise<(T | undefined)[]> {
      // For each key, return undefined on bypassed prefixes, otherwise delegate.
      return Promise.all(keys.map(async (key) => {
        if (BYPASS_PREFIXES.some((p) => key.startsWith(p))) return undefined;
        return inner.get<T>(key);
      }));
    },
    async add<T>(key: string, value: T, ttlMs?: number): Promise<boolean> {
      return inner.add(key, value, ttlMs);
    },
  };
}

// Cache-read criterion: a cached result is worth serving when it has any value.
export function hasCachedValue(assets: WalletAssets): boolean {
  const tokenCount = assets.tokens?.length ?? 0;
  const totalValue = assets.totalValueEur ?? 0;
  const nativeBalance = Number(assets.native?.balance ?? 0);
  const hasNativePrice = assets.native?.priceEur != null;
  if (nativeBalance > 0 && !hasNativePrice) return false;
  if (hasMajorPriceableTokenWithoutPrice(assets)) return false;
  return tokenCount > 0 || totalValue > 0 || nativeBalance > 0;
}

// A non-EVM scan result is worth retrying when its RPCs failed AND it produced no value.
export function isRetriableNonEvmResult(assets: WalletAssets): boolean {
  if (hasCachedValue(assets)) return false;
  const errors = assets.errors ?? [];
  return errors.some((error) => {
    const message = error.toLowerCase();
    return message.includes("token accounts: no data") ||
      message.includes("balances fetch:") ||
      message.includes("balances http") ||
      message.includes("native balance failed on all") ||
      message.includes("no strict consensus") ||
      message.includes("chain_timeout") ||
      message.includes("rpc") ||
      message.includes("fetch") ||
      message.includes("429") ||
      message.includes("timeout");
  });
}

// Cache-write criterion: a scan result is safe to cache when it has no errors.
export function shouldCacheAssets(assets: WalletAssets): boolean {
  const errors = assets.errors ?? [];
  if (errors.some((error) => {
    const message = error.toLowerCase();
    return message.includes("token accounts: no data") ||
      message.includes("balances fetch:") ||
      message.includes("balances http") ||
      message.includes("native balance failed on all");
  })) return false;

  if (hasMajorPriceableTokenWithoutPrice(assets)) return false;

  const tokenCount = assets.tokens?.length ?? 0;
  const totalValue = assets.totalValueEur ?? 0;
  const nativeValue = assets.native?.valueEur ?? 0;
  const nativeBalance = Number(assets.native?.balance ?? 0);
  if (nativeBalance > 0 && assets.native?.priceEur == null) return false;
  if (tokenCount === 0 && totalValue === 0 && nativeValue === 0 && nativeBalance === 0) return false;

  return true;
}

function hasMajorPriceableTokenWithoutPrice(assets: WalletAssets): boolean {
  const errors = assets.errors ?? [];
  for (const token of (assets.tokens ?? []) as Array<Record<string, unknown>>) {
    const symbol = String(token.symbol ?? "").toUpperCase();
    if (!MAJOR_PRICEABLE_SYMBOLS.has(symbol)) continue;
    if (Number(token.balance ?? 0) <= 0) continue;
    if (token.priceEur != null) continue;
    if (errors.some((error) => error.toUpperCase().includes(`${symbol} PRICE: NO_PRICE`))) return true;
  }
  return false;
}

// Calculate clean chain value by subtracting scam token values from the total.
export function calcCleanChainValue(c: ChainScan, detectScam: typeof import("@wcore/core").detectScam): number {
  let val = c.totals.valueEur;
  try {
    for (const t of c.tokens) {
      if (detectScam(t.symbol, t.name, t.balance, t.priceEur, t.contract).isSuspicious) val -= (t.valueEur ?? 0);
    }
    if (c.native && detectScam(c.native.symbol, c.native.name, c.native.balance, c.native.priceEur, c.native.contract).isSuspicious) val -= (c.native.valueEur ?? 0);
  } catch { /* individual token error should not break the total */ }
  return Math.max(0, Math.round(val * 100) / 100);
}
