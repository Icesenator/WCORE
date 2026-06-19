import { cacheKey } from "@wcore/shared";
import type { CacheStore } from "./cache/index.js";

export type FxFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface FxSource {
  readonly name: string;
  readonly fetch: (fetchImpl: FxFetch, signal?: AbortSignal) => Promise<number>;
}

export interface FxSourceResult {
  source: string;
  rate: number;
  ts: number;
}

export interface GetEurUsdRateOptions {
  fetchImpl?: FxFetch;
  cache?: CacheStore;
  forceRefresh?: boolean;
  minSources?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const FX_CACHE_TTL_MS = 60 * 60 * 1000;
const FX_CACHE_KEY = cacheKey("fxEurUsd", {});

interface CachedFx {
  rate: number;
  ts: number;
  sources: FxSourceResult[];
}

let _memCache: CachedFx | null = null;
const _memCacheTtlMs = FX_CACHE_TTL_MS;

function median(values: number[]): number {
  if (values.length === 0) throw new Error("median of empty array");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function isValidRate(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 && n < 100;
}

/**
 * FX SOURCES
 * ----------
 * All sources return the rate in the same unit: EUR per 1 USD.
 * This matches the convention in pricing/cascade.ts: `priceEur = priceUsd * fxRate`.
 *
 * Frankfurter and DefiLlama EURC natively return "USD per 1 EUR" — they are
 * inverted here. open.er-api.com and Coinbase natively return "EUR per 1 USD".
 */
export const FX_SOURCES: readonly FxSource[] = [
  {
    name: "frankfurter",
    async fetch(f, signal) {
      const res = await f("https://api.frankfurter.app/latest?from=EUR&to=USD", { signal });
      if (!res.ok) throw new Error(`frankfurter HTTP ${res.status}`);
      const data = (await res.json()) as { rates?: { USD?: number } };
      const usdPerEur = data.rates?.USD;
      if (!isValidRate(usdPerEur)) throw new Error("frankfurter: invalid rate");
      return 1 / usdPerEur; // invert to EUR per 1 USD
    },
  },
  {
    name: "open-er-api",
    async fetch(f, signal) {
      const res = await f("https://open.er-api.com/v6/latest/USD", { signal });
      if (!res.ok) throw new Error(`open-er-api HTTP ${res.status}`);
      const data = (await res.json()) as { rates?: { EUR?: number } };
      const rate = data.rates?.EUR;
      if (!isValidRate(rate)) throw new Error("open-er-api: invalid rate");
      return rate;
    },
  },
  {
    name: "coinbase",
    async fetch(f, signal) {
      const res = await f("https://api.coinbase.com/v2/exchange-rates?currency=USD", { signal });
      if (!res.ok) throw new Error(`coinbase HTTP ${res.status}`);
      const data = (await res.json()) as { data?: { rates?: { EUR?: string } } };
      const eurStr = data.data?.rates?.EUR;
      const rate = eurStr != null ? Number(eurStr) : NaN;
      if (!isValidRate(rate)) throw new Error("coinbase: invalid rate");
      return rate;
    },
  },
  {
    name: "defillama-eurc",
    async fetch(f, signal) {
      const res = await f(
        "https://coins.llama.fi/prices/current/coingecko:euro-coin",
        { signal },
      );
      if (!res.ok) throw new Error(`defillama-eurc HTTP ${res.status}`);
      const data = (await res.json()) as {
        coins?: { "coingecko:euro-coin"?: { price?: number; symbol?: string } };
      };
      const entry = data.coins?.["coingecko:euro-coin"];
      const usdPerEur = entry?.price;
      if (!isValidRate(usdPerEur)) throw new Error("defillama-eurc: invalid rate");
      return 1 / usdPerEur; // invert to EUR per 1 USD
    },
  },
] as const;

export const FX_SOURCE_NAMES = FX_SOURCES.map((s) => s.name) as readonly string[];

async function fetchWithTimeout(
  fetchImpl: FxFetch,
  source: FxSource,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<FxSourceResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onParentAbort = () => ctrl.abort();
  if (parentSignal) {
    if (parentSignal.aborted) ctrl.abort();
    parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }
  try {
    const rate = await source.fetch(fetchImpl, ctrl.signal);
    return { source: source.name, rate, ts: Date.now() };
  } finally {
    clearTimeout(timer);
    if (parentSignal) parentSignal.removeEventListener("abort", onParentAbort);
  }
}

export async function fetchAllFxSources(
  options: GetEurUsdRateOptions = {},
): Promise<FxSourceResult[]> {
  const fetchImpl = options.fetchImpl ?? (fetch as FxFetch);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const tasks = FX_SOURCES.map((source) =>
    fetchWithTimeout(fetchImpl, source, timeoutMs, options.signal).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      return { source: source.name, error: msg } as const;
    }),
  );
  const settled = await Promise.allSettled(tasks);
  const results: FxSourceResult[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") {
      const v = r.value;
      if ("rate" in v) results.push(v);
    }
  }
  return results;
}

export function consensusRate(results: FxSourceResult[], minSources = 1): number {
  if (results.length < minSources) {
    throw new Error(
      `FX cascade: only ${results.length} source(s) succeeded, need ${minSources}`,
    );
  }
  if (results.length === 1) return results[0]!.rate;
  if (results.length === 2) {
    const [a, b] = results;
    if (!a || !b) throw new Error("FX cascade: missing result");
    const delta = Math.abs(a.rate - b.rate) / Math.max(a.rate, b.rate);
    if (delta > 0.05) {
      throw new Error(
        `FX cascade: 2 sources disagree by ${(delta * 100).toFixed(2)}% (${a.source}=${a.rate}, ${b.source}=${b.rate})`,
      );
    }
    return (a.rate + b.rate) / 2;
  }
  return median(results.map((r) => r.rate));
}

export async function getEurUsdRate(
  options: GetEurUsdRateOptions = {},
): Promise<number> {
  const minSources = options.minSources ?? 1;

  if (!options.forceRefresh) {
    if (_memCache && Date.now() - _memCache.ts < _memCacheTtlMs) {
      return _memCache.rate;
    }
    if (options.cache) {
      try {
        const cached = await options.cache.get<CachedFx>(FX_CACHE_KEY);
        if (cached && Date.now() - cached.ts < FX_CACHE_TTL_MS) {
          _memCache = cached;
          return cached.rate;
        }
      } catch {
        // ignore cache read errors
      }
    }
  }

  const results = await fetchAllFxSources(options);
  const rate = consensusRate(results, minSources);

  const now = Date.now();
  const entry: CachedFx = { rate, ts: now, sources: results };
  _memCache = entry;

  if (options.cache) {
    try {
      await options.cache.set(FX_CACHE_KEY, entry, FX_CACHE_TTL_MS);
    } catch {
      // ignore cache write errors
    }
  }

  return rate;
}

export function _resetFxCacheForTests(): void {
  _memCache = null;
}
