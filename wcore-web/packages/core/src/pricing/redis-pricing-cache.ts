import type { CacheStore } from "../cache/types.js";
import type { CachedPrice, PricingCache, PricingMarker } from "./types.js";
import { normalizePriceKey } from "./types.js";

const PRICE_PREFIX = "price:";
const MARKER_PREFIX = "marker:";
const DEFAULT_MARKER_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Redis-backed PricingCache — replaces MemoryPricingCache so pricing data
 * is shared across all concurrent scan workers (SCAN_CONCURRENCY=50) and
 * survives API restarts.
 *
 * Keys: `price:{normalizedKey}` for prices, `marker:{normalizedKey}` for markers.
 */
export class RedisPricingCache implements PricingCache {
  constructor(private readonly store: CacheStore) {}

  async getPrice(key: string): Promise<CachedPrice | null> {
    const raw = await this.store.get<CachedPrice>(PRICE_PREFIX + normalizePriceKey(key));
    return raw ?? null;
  }

  async setPrice(key: string, value: CachedPrice): Promise<void> {
    // 6h TTL matches the staleness window of MemoryPricingCache
    await this.store.set(PRICE_PREFIX + normalizePriceKey(key), value, 6 * 60 * 60 * 1000);
  }

  async getMarker(key: string): Promise<PricingMarker | null> {
    const raw = await this.store.get<PricingMarker>(MARKER_PREFIX + normalizePriceKey(key));
    return raw ?? null;
  }

  async setMarker(key: string, marker: PricingMarker, ttlMs?: number): Promise<void> {
    await this.store.set(MARKER_PREFIX + normalizePriceKey(key), marker, ttlMs ?? DEFAULT_MARKER_TTL_MS);
  }
}
