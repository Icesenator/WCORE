import { CACHE_KEY_REGISTRY, type CacheKeyName } from "./cache-key-registry";

export function cacheKey(name: CacheKeyName, vars: Record<string, string>): string {
  const def = CACHE_KEY_REGISTRY[name];
  if (!def.web) throw new Error(`No web key defined for ${String(name)}`);
  return _interpolate(def.web, vars);
}

export function cacheKeyGsheet(name: CacheKeyName, vars: Record<string, string>): string | null {
  const def = CACHE_KEY_REGISTRY[name];
  if (!def.gsheet) return null;
  return _interpolate(def.gsheet, vars);
}

export function walletKey(
  prefix: string | undefined | null,
  address: string
): string {
  return (prefix || "") + "WALLET_" + address.toLowerCase();
}

function _interpolate(
  pattern: string,
  vars: Record<string, string>
): string {
  return pattern.replace(/\{(\w+)\}/g, (_, key) => {
    if (!(key in vars)) {
      throw new Error(`Missing var ${key} for cache key`);
    }
    return vars[key]!;
  });
}
