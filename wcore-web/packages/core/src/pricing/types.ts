import type { ChainConfig } from "../types.js";

export type PriceSource =
  | "stablecoin-usd"
  | "stablecoin-eur"
  | "cache"
  | "llama-native"
  | "llama-map"
  | "llama-coins"
  | "dex"
  | "gt"
  | "gt-batch"
  | "gt-l1"
  | "coingecko"
  | "jupiter"
  | "onchain-v3"
  | "onchain-v3-l1"
  | "realt"
  | "zora";

export type PricingMarker = "NEED_DEEP" | "NEED_TRY3" | "NEED_ONCHAIN";

export interface PricingToken {
  key: string;
  chain: ChainConfig;
  contract?: string;
  symbol?: string;
  name?: string;
  isStable?: boolean;
  peg?: "USD" | "EUR" | string;
  stablePeg?: "USD" | "EUR" | string;
  isNative?: boolean;
}

export interface SourcePrice {
  priceUsd: number | null;
  source: PriceSource | string;
  symbol?: string;
  name?: string;
  marker?: PricingMarker;
  reason?: string;
}

export type SourcePriceLike = number | SourcePrice | null;

export interface PricingTrailStep {
  source: PriceSource | string;
  status: "hit" | "miss" | "skipped" | "error";
  reason?: string;
  marker?: PricingMarker;
}

export interface PricingResult {
  key: string;
  priceEur: number | null;
  priceUsd: number | null;
  source: PriceSource | string | null;
  reason: string | null;
  marker?: PricingMarker;
  trail: PricingTrailStep[];
}

export interface CachedPrice {
  priceEur: number;
  ts: number;
  source?: PriceSource | string;
}

export interface PricingCache {
  getPrice(key: string): Promise<CachedPrice | null> | CachedPrice | null;
  setPrice(key: string, value: CachedPrice): Promise<void> | void;
  getMarker(key: string): Promise<PricingMarker | null> | PricingMarker | null;
  setMarker(key: string, marker: PricingMarker, ttlMs?: number): Promise<void> | void;
}

// Default max entries per map. ~20k * (CachedPrice|PricingMarker) ≈ a few MB —
// bounded growth on long-running Railway processes. Env override for ops tuning.
const MEMORY_PRICING_CACHE_MAX = (() => {
  const raw = Number(process.env.PRICING_CACHE_MAX_ENTRIES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 20_000;
})();

export class MemoryPricingCache implements PricingCache {
  private prices = new Map<string, CachedPrice>();
  private markers = new Map<string, PricingMarker>();
  private readonly maxEntries: number;

  constructor(maxEntries: number = MEMORY_PRICING_CACHE_MAX) {
    this.maxEntries = maxEntries;
  }

  // LRU touch: re-insert to move the key to the most-recent end of insertion order.
  private touch<V>(map: Map<string, V>, key: string): V | undefined {
    const value = map.get(key);
    if (value === undefined) return undefined;
    map.delete(key);
    map.set(key, value);
    return value;
  }

  private evict<V>(map: Map<string, V>): void {
    if (map.size <= this.maxEntries) return;
    // Map preserves insertion order; first key = least-recently used.
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }

  getPrice(key: string): CachedPrice | null {
    return this.touch(this.prices, normalizePriceKey(key)) ?? null;
  }

  setPrice(key: string, value: CachedPrice): void {
    const k = normalizePriceKey(key);
    this.prices.delete(k);
    this.prices.set(k, value);
    this.evict(this.prices);
  }

  getMarker(key: string): PricingMarker | null {
    return this.touch(this.markers, normalizePriceKey(key)) ?? null;
  }

  setMarker(key: string, marker: PricingMarker): void {
    const k = normalizePriceKey(key);
    this.markers.delete(k);
    this.markers.set(k, marker);
    this.evict(this.markers);
  }
}

export interface DefiLlamaSource {
  getTokenPriceUsd(token: PricingToken, llamaId?: string): Promise<SourcePriceLike>;
  getNativePriceUsd(token: PricingToken, llamaId?: string): Promise<SourcePriceLike>;
  // Optional bulk endpoint: returns Map<contract, priceUsd> for tokens addressable as `${slug}:${contract}`.
  // Engines call this once per scan to pre-warm the shared price cache (1 HTTP for N tokens).
  batchTokenPrices?(chainSlug: string, contracts: string[]): Promise<Map<string, number>>;
}

export interface TokenPriceSource {
  getTokenPriceUsd(token: PricingToken): Promise<SourcePriceLike>;
  batchTokenPrices?(network: string, contracts: string[]): Promise<Map<string, number> | undefined>;
}

export interface RealTSource extends TokenPriceSource {
  isKnownRealTContract(token: PricingToken): Promise<boolean>;
}

export interface CoinGeckoSource {
  getNativePriceUsd(token: PricingToken, geckoId?: string): Promise<SourcePriceLike>;
  getTokenPriceUsd(token: PricingToken, geckoId?: string): Promise<SourcePriceLike>;
}

export interface PricingSourceSet {
  defillama: DefiLlamaSource;
  dexscreener: TokenPriceSource;
  geckoterminal: TokenPriceSource;
  coingecko: CoinGeckoSource;
  jupiter: TokenPriceSource;
  onchainV3: TokenPriceSource;
  realt?: RealTSource;
  zora?: TokenPriceSource;
}

/**
 * Shared in-flight price-lookup cache scoped to a single scan run. Keyed by the
 * cascade price key; the value is the pending (or settled) cascade promise so
 * concurrent workers dedupe identical token lookups. Defined once here and
 * reused by every engine + the scan plugin (was duplicated as
 * `Map<string, Promise<any>>` in 7 places).
 */
export type IntraScanCache = Map<string, Promise<PricingResult>>;

export interface PriceTokenCascadeOptions {
  token: PricingToken;
  fxRate: number;
  cache: PricingCache;
  sources: PricingSourceSet;
  nowMs?: number;
  priceStaleMs?: number;
  skipCache?: boolean;
  allowStaleCacheOnMiss?: boolean;
  allowCoinGeckoTokenFallback?: boolean;
  /** Optional shared cache for deduplicating price lookups within a single scan. */
  intraScanCache?: IntraScanCache;
}

export function normalizePriceKey(key: string): string {
  return String(key || "").trim().toLowerCase();
}

export function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
