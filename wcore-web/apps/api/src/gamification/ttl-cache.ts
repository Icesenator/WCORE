/**
 * Small in-memory cache with a fixed lifetime per entry.
 *
 * An entry that is never read again is not removed by `get`, so a key that embeds a
 * changing part (a UTC day, an address) would stay until the process restarts. `set`
 * therefore drops every expired entry, at most once per lifetime: the map never holds
 * more than the entries written during the last two lifetimes.
 */
export interface TtlCache<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  size(): number;
}

export function createTtlCache<V>(ttlMs: number, now: () => number = Date.now): TtlCache<V> {
  const entries = new Map<string, { value: V; expiresAt: number }>();
  let sweptAt = now();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (now() > entry.expiresAt) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      const t = now();
      if (t - sweptAt >= ttlMs) {
        sweptAt = t;
        for (const [k, entry] of entries) if (t > entry.expiresAt) entries.delete(k);
      }
      entries.set(key, { value, expiresAt: t + ttlMs });
    },
    size: () => entries.size,
  };
}
