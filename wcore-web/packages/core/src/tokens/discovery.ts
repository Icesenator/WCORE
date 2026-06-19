import { TOKEN_REGISTRY, normalizeTokenChainKey } from "./registry.js";
import type { DiscoveredToken, TokenDiscovery } from "./types.js";
import type { TransferLogDiscoveryResult } from "./log-discovery.js";
import type { Erc20MetadataResult } from "./metadata.js";
import type { CacheStore } from "../cache/index.js";
import { DISCOVERY_CACHE_TTL_MS } from "../cache/index.js";

interface ExplorerDiscoveryResult {
  tokens: DiscoveredToken[];
  errors: string[];
}

export interface TokenDiscoveryContext {
  logDiscovery?: () => Promise<TransferLogDiscoveryResult>;
  explorerDiscovery?: () => Promise<ExplorerDiscoveryResult>;
  trustExplorerWhenClean?: boolean;
  metadata?: (contract: string) => Promise<Erc20MetadataResult>;
  errors?: string[];
  cache?: CacheStore;
  cacheKey?: string;
}

export async function getKnownTokensForChain(chainKey: string): Promise<DiscoveredToken[]> {
  const key = normalizeTokenChainKey(chainKey);
  return cloneTokens(TOKEN_REGISTRY[key] ?? []);
}

export function getDiscoveryCacheKey(address: string, chainKey: string): string {
  return `disc:${String(address).trim().toLowerCase()}:${normalizeTokenChainKey(chainKey).toLowerCase()}`;
}

export async function discoverTokensForWallet(
  _address: string,
  chainKey: string,
  context: TokenDiscoveryContext = {},
): Promise<DiscoveredToken[]> {
  const { cache, cacheKey } = context;

  if (cache && cacheKey) {
    try {
      const cached = await cache.get<DiscoveredToken[]>(cacheKey);
      if (cached) return cloneTokens(cached);
    } catch {
      // cache failure → continue execution
    }
  }

  const tokens = await getKnownTokensForChain(chainKey);
  const seen = new Set(tokens.map((token) => token.contract.toLowerCase()));
  let explorerAdded = 0;
  let explorerHadErrors = false;

  if (context.explorerDiscovery) {
    const explorer = await context.explorerDiscovery();
    explorerHadErrors = explorer.errors.length > 0;
    context.errors?.push(...explorer.errors);
    for (const token of explorer.tokens) {
      const key = token.contract.toLowerCase();
      if (seen.has(key)) continue;
      tokens.push(token);
      seen.add(key);
      explorerAdded++;
    }
  }

  // Si l'explorer a trouvé des tokens → on skip eth_getLogs pour ne pas gaspiller de RPC calls.
  if (explorerAdded > 0) {
    if (cache && cacheKey) {
      try { await cache.set(cacheKey, tokens, DISCOVERY_CACHE_TTL_MS); } catch { /* noop */ }
    }
    return tokens;
  }

  // Si trustExplorerWhenClean et l'explorer a répondu sans erreur → on trust la réponse vide.
  if (context.trustExplorerWhenClean && !explorerHadErrors) {
    if (cache && cacheKey) {
      try { await cache.set(cacheKey, tokens, DISCOVERY_CACHE_TTL_MS); } catch { /* noop */ }
    }
    return tokens;
  }

  if (!context.logDiscovery) {
    if (cache && cacheKey) {
      try { await cache.set(cacheKey, tokens, DISCOVERY_CACHE_TTL_MS); } catch { /* noop */ }
    }
    return tokens;
  }

  const logs = await context.logDiscovery();
  context.errors?.push(...logs.errors);

  if (!context.metadata) {
    if (cache && cacheKey) {
      try { await cache.set(cacheKey, tokens, DISCOVERY_CACHE_TTL_MS); } catch { /* noop */ }
    }
    return tokens;
  }

  for (const contract of logs.contracts) {
    if (contract === null || contract === undefined) continue;
    const key = String(contract).toLowerCase();
    if (seen.has(key)) continue;
    const meta = await context.metadata(key);
    context.errors?.push(...meta.errors);
    if (!meta.token) continue;
    tokens.push(meta.token);
    seen.add(key);
  }

  if (cache && cacheKey) {
    try { await cache.set(cacheKey, tokens, DISCOVERY_CACHE_TTL_MS); } catch { /* noop */ }
  }

  return tokens;
}

export const registryTokenDiscovery: TokenDiscovery = {
  discoverTokensForWallet,
};

function cloneTokens(tokens: ReadonlyArray<DiscoveredToken>): DiscoveredToken[] {
  return tokens.map((token) => ({ ...token }));
}
