interface MetaEntry {
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
  ts: number;
}

const MAX_ENTRIES = 5000;
const TTL_MS = 24 * 60 * 60 * 1000;

// Map preserves insertion order → it doubles as the LRU access order.
// Move-to-end is delete+set (O(1)); oldest is `keys().next().value` (O(1)).
const _cache = new Map<string, MetaEntry>();

function evict() {
  const now = Date.now();
  for (const [k, v] of _cache) {
    if (now - v.ts > TTL_MS) _cache.delete(k);
  }
  while (_cache.size > MAX_ENTRIES) {
    const oldest = _cache.keys().next().value;
    if (oldest === undefined) break;
    _cache.delete(oldest);
  }
}

export function getCachedMeta(key: string): { symbol: string; name: string; decimals: number; logoUrl?: string } | undefined {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > TTL_MS) {
    _cache.delete(key);
    return undefined;
  }
  _cache.delete(key);
  _cache.set(key, entry);
  return { symbol: entry.symbol, name: entry.name, decimals: entry.decimals, logoUrl: entry.logoUrl };
}

export function setCachedMeta(key: string, meta: { symbol: string; name: string; decimals: number; logoUrl?: string }): void {
  _cache.delete(key);
  _cache.set(key, { ...meta, ts: Date.now() });
  if (_cache.size > MAX_ENTRIES * 1.2) evict();
}

export function getMetaKey(chainKey: string, contract: string): string {
  return `${chainKey}:${contract.toLowerCase()}`;
}

export function getCacheStats(): { size: number; maxSize: number } {
  return { size: _cache.size, maxSize: MAX_ENTRIES };
}
