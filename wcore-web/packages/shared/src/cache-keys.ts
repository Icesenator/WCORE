import { CACHE_KEY_REGISTRY, type CacheKeyName } from "./cache-key-registry";

export function cacheKey(name: CacheKeyName, vars: Record<string, string>): string {
  const def = CACHE_KEY_REGISTRY[name];
  if (!def.web) throw new Error(`No web key defined for ${String(name)}`);
  return _interpolate(def.web, _prepareVars(def, vars));
}

export function cacheKeyGsheet(name: CacheKeyName, vars: Record<string, string>): string | null {
  const def = CACHE_KEY_REGISTRY[name];
  if (!def.gsheet) return null;
  return _interpolate(def.gsheet, _prepareVars(def, vars));
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

function _prepareVars(
  def: (typeof CACHE_KEY_REGISTRY)[CacheKeyName],
  vars: Record<string, string>,
): Record<string, string> {
  for (const key of def.vars) {
    if (!(key in vars)) throw new Error(`Missing var ${key} for cache key`);
  }

  return "normalize" in def ? def.normalize(vars) : vars;
}
