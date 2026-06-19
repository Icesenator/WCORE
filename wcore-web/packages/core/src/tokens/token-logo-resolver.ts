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

  // Parallel: hit and miss are independent, so a single Redis RTT instead of two.
  const [cached, missed] = cache
    ? await Promise.all([
        key ? cache.get<string>(key).catch(() => undefined) : Promise.resolve(undefined),
        missKey ? cache.get<boolean>(missKey).catch(() => undefined) : Promise.resolve(undefined),
      ])
    : [undefined, undefined];

  if (isUsableLogoUrl(cached)) return cached;

  if (isUsableLogoUrl(metadataLogoUrl)) {
    if (cache && key) cache.set(key, metadataLogoUrl, POSITIVE_TTL_MS).catch(() => {});
    return metadataLogoUrl;
  }

  if (missed) return fallbackLogo(symbol, chainKey, contract);

  const blockscout = await fetchBlockscoutLogo(chainKey, contract, fetchImpl);
  if (blockscout) {
    if (cache && key) cache.set(key, blockscout, POSITIVE_TTL_MS).catch(() => {});
    return blockscout;
  }

  const dex = await fetchDexScreenerLogo(contract, fetchImpl);
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

async function fetchDexScreenerLogo(contract: string | undefined, fetchImpl: typeof fetch): Promise<string | undefined> {
  if (!contract) return undefined;
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

/**
 * Cache-only logo lookup for the pricing hot path: returns a cached URL if present,
 * otherwise a synchronous fallback (TrustWallet/CMC by symbol). Never makes HTTP calls.
 * Pair with `prefetchTokenLogo` to populate the cache out-of-band.
 */
export async function resolveTokenLogoCachedOrFallback(params: TokenLogoResolverParams): Promise<string | undefined> {
  const { symbol, chainKey, contract, cache, metadataLogoUrl } = params;
  const key = logoCacheKey(chainKey, contract);

  if (cache && key) {
    try {
      const cached = await cache.get<string>(key);
      if (isUsableLogoUrl(cached)) return cached;
    } catch { /* best-effort */ }
  }
  if (isUsableLogoUrl(metadataLogoUrl)) return metadataLogoUrl;
  return fallbackLogo(symbol, chainKey, contract);
}

const _prefetchInflight = new Map<string, Promise<unknown>>();

/**
 * Fire-and-forget prefetch: runs the full HTTP resolver in the background and
 * writes to cache for the next scan. Single-flight per (chain, contract) key so
 * 30 concurrent scans of the same token issue only 1 HTTP fetch.
 */
export function prefetchTokenLogo(params: TokenLogoResolverParams): void {
  const key = logoCacheKey(params.chainKey, params.contract);
  if (!key || !params.cache) return;
  if (_prefetchInflight.has(key)) return;
  const promise = resolveTokenLogoAsync(params)
    .catch(() => { /* best-effort */ })
    .finally(() => { _prefetchInflight.delete(key); });
  _prefetchInflight.set(key, promise);
}

export function resetTokenLogoResolverStateForTests(): void {
  _prefetchInflight.clear();
}
