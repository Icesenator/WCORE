export interface CacheStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  /** Batch read multiple keys in a single round-trip. Returns values in same order as keys. */
  mget<T>(keys: string[]): Promise<(T | undefined)[]>;
  /**
   * Atomically set `key` only if it does not already exist (Redis `SET NX`).
   * Returns true if THIS call created the key, false if it was already present.
   * Used for single-use claims (refresh-token rotation) and locks. On a backing
   * store error it fails closed (returns false) so callers reject rather than
   * double-grant.
   */
  add<T>(key: string, value: T, ttlMs?: number): Promise<boolean>;
  /**
   * Atomically increment the numeric value at `key`, setting it to 1 if absent
   * or expired. Returns the NEW count. `ttlSec` resets the key's expiry on each
   * increment. Used by the rate-limit counter (Redis `INCR + EXPIRE`, in-memory
   * event-loop-atomic read-then-write).
   */
  incr?(key: string, ttlSec: number): Promise<number>;
  /**
   * Buffer multiple set operations and flush them in a single round-trip.
   * Reduces Redis latency for batch cache writes (e.g. 50k token prices).
   * In-memory implementation flushes immediately. Redis uses pipeline().
   * Returns the number of operations buffered.
   */
  pipeline?(ops: Array<{ key: string; value: unknown; ttlMs?: number }>): Promise<number>;
}

export const DISCOVERY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — cursor + token list persist across restarts
export const METADATA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
