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

  // Resolving each contract's symbol, name and decimals is an RPC round-trip, and they
  // were awaited one after another: a wallet touching fifty contracts paid fifty
  // sequential round-trips before a single balance was read. Deduplicate first, then
  // resolve in bounded groups so the burst stays comparable to the rest of the engine.
  const METADATA_CONCURRENCY = 10;
  const toResolve: string[] = [];
  for (const contract of logs.contracts) {
    if (contract === null || contract === undefined) continue;
    const key = String(contract).toLowerCase();
    if (seen.has(key)) continue;
    // Claim it up front: a contract repeated in the logs must not be queried twice.
    seen.add(key);
    toResolve.push(key);
  }

  for (let i = 0; i < toResolve.length; i += METADATA_CONCURRENCY) {
    const group = toResolve.slice(i, i + METADATA_CONCURRENCY);
    const metas = await Promise.all(group.map((key) => context.metadata!(key)));
    for (const meta of metas) {
      context.errors?.push(...meta.errors);
      if (meta.token) tokens.push(meta.token);
    }
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
