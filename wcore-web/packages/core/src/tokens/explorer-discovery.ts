import type { DiscoveredToken } from "./types.js";
import type { CacheStore } from "../cache/index.js";
import { METADATA_CACHE_TTL_MS } from "../cache/index.js";
import { prefetchTokenLogo, resolveTokenLogoCachedOrFallback } from "./token-logo-resolver.js";

interface ExplorerTokenResult {
  tokens: DiscoveredToken[];
  errors: string[];
}

// Blockscout Pro API — endpoint universel avec chain_id + apikey.
// Docs: https://docs.blockscout.com/devs/pro-api-responses-and-routes
// Seules les chaînes listées sur https://chains.blockscout.com/ sont supportées par la Pro API.
// Les chaînes non supportées retournent 404 — fallback eth_getLogs automatique.
// BSC (56) et AVALANCHE (43114) exclus — utilisent BscScan/SnowTrace (Etherscan fork).
const BLOCKSCOUT_CHAIN_IDS: Record<string, number> = {
  // WCORE existantes avec Blockscout Pro API confirmé
  ETHEREUM: 1,
  OPTIMISM: 10,
  ROOTSTOCK: 30,
  GNOSIS: 100,
  SHIBARIUM: 109,
  FUSE: 122,
  UNICHAIN: 130,
  POLYGON: 137,
  HASHKEY: 177,
  TAC: 239,
  FVM: 314,
  ZKSYNC_ERA: 324,
  SHAPE: 360,
  ASTAR: 592,
  FLOW: 747,
  REDSTONE: 690,
  MATCHAIN: 698,
  ZETACHAIN: 7000,
  LISK: 1135,
  STORY: 1514,
  REYA: 1729,
  SONEIUM: 1868,
  WORLDCHAIN: 480,
  MEGAETH: 4326,
  MODE: 34443,
  INK: 57073,
  BASE: 8453,
  ARBITRUM_ONE: 42161,
  ARBITRUM_NOVA: 42170,
  CELO: 42220,
  ETHERLINK: 42793,
  IMMUTABLE: 13371,
  SCROLL: 534352,
  ETHEREUM_CLASSIC: 61,
  ZILLIQA_EVM: 32769,
  // Chaînes Blockscout Pro API ajoutées (2026-05-18)
  SHIMMER_EVM: 148,
  BXN: 488,
  EDEN: 714,
  WORLD_MOBILE: 869,
  PLAYNANCE_PLAYBLOCK: 1829,
  LIGHTLINK: 1890,
  MOCA_CHAIN: 2288,
  KITEAI: 2366,
  AWAJI: 6497,
  NUMINE: 8021,
  IOTA_EVM: 8822,
  EDU_CHAIN: 41923,
  ICB_NETWORK: 73115,
  CREDITCOIN: 102030,
  CROSS_MAINNET: 612055,
  GENSYN: 685689,
  NEON: 245022934,
};

const BLOCKSCOUT_PRO_URL = "https://api.blockscout.com/v2/api";

const blockscoutCooldownUntil = new Map<string, number>();

export function resetBlockscoutExplorerStateForTests(): void {
  blockscoutCooldownUntil.clear();
}

export function hasExplorerDiscovery(chainKey: string): boolean {
  return Boolean(BLOCKSCOUT_CHAIN_IDS[chainKey.toUpperCase()]);
}

export async function discoverTokensFromExplorer(
  address: string,
  chainKey: string,
  fetchImpl: typeof fetch = fetch,
  cache?: CacheStore,
): Promise<ExplorerTokenResult> {
  const chainId = BLOCKSCOUT_CHAIN_IDS[chainKey.toUpperCase()];
  if (!chainId) return { tokens: [], errors: [] };

  const normalizedChain = chainKey.toUpperCase();
  if (getEnv("BLOCKSCOUT_DISABLE") === "1") {
    return { tokens: [], errors: [`explorer disabled for ${normalizedChain}`] };
  }

  const apiKey = getEnv("BLOCKSCOUT_API_KEY");
  if (!apiKey) return { tokens: [], errors: [`no BLOCKSCOUT_API_KEY for ${normalizedChain}`] };

  const cooldownUntil = blockscoutCooldownUntil.get(normalizedChain) ?? 0;
  if (cooldownUntil > Date.now()) {
    return { tokens: [], errors: [`explorer cooldown active for ${normalizedChain}`] };
  }

  const errors: string[] = [];
  const timeoutMs = getPositiveEnvNumber("BLOCKSCOUT_TIMEOUT_MS", 2500);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${BLOCKSCOUT_PRO_URL}?module=account&action=tokenlist&address=${address.toLowerCase()}&chain_id=${chainId}&apikey=${apiKey}`;
    console.log(`[Blockscout] Calling ${normalizedChain} (chain_id=${chainId})`);
    const res = await fetchImpl(url, { headers: { accept: "application/json" }, signal: controller.signal });
    console.log(`[Blockscout] ${normalizedChain} response: ${res.status}`);
    if (!res.ok) {
      if (shouldCooldown(res.status)) startCooldown(normalizedChain);
      errors.push(`explorer HTTP ${res.status} for ${normalizedChain}`);
      return { tokens: [], errors };
    }
    const data = (await res.json()) as {
      status?: string;
      message?: string;
      result?: Array<{
        contractAddress?: string;
        tokenSymbol?: string;
        symbol?: string;
        tokenName?: string;
        name?: string;
        tokenDecimal?: string;
        decimals?: string;
        tokenType?: string;
      }>;
    };

    if (data.status !== "1" || !data.result) {
      const msg = data.message || "unknown";
      if (msg === "NOTOK" || data.status === "0") {
        errors.push(`explorer API ${msg} for ${normalizedChain}`);
        return { tokens: [], errors };
      }
    }

    const result = data.result ?? [];
    const maxTokenlist = getPositiveEnvNumber("BLOCKSCOUT_MAX_TOKENLIST", 500);
    if (result.length > maxTokenlist) {
      errors.push(`explorer tokenlist too large for ${normalizedChain}: ${result.length}`);
      return { tokens: [], errors };
    }

    const tokens: DiscoveredToken[] = [];
    for (const item of result) {
      const contract = (item.contractAddress ?? "").toLowerCase();
      if (!contract || !/^0x[0-9a-f]{40}$/.test(contract)) continue;
      const decimals = Number(item.tokenDecimal ?? item.decimals ?? 18);
      const symbol = String(item.tokenSymbol ?? item.symbol ?? "");
      const name = String(item.tokenName ?? item.name ?? "");
      if (!symbol || symbol.length < 2) { console.log(`[Blockscout] Skip ${normalizedChain}: empty symbol for ${contract}`); continue; }
      if (name === "Unknown Token" || name === "" || symbol === "UNKNOWN") { console.log(`[Blockscout] Skip ${normalizedChain}: ${symbol} / ${name}`); continue; }
      if (isLikelySpam(symbol, name)) { console.log(`[Blockscout] Skip ${normalizedChain}: spam ${symbol}`); continue; }
      const logoUrl = await resolveTokenLogoCachedOrFallback({ symbol, chainKey, contract, cache });
      prefetchTokenLogo({ symbol, chainKey, contract, cache, fetchImpl });
      const token: DiscoveredToken = {
        contract,
        symbol,
        name,
        decimals,
        source: "indexer",
        logoUrl,
      };
      tokens.push(token);

      // Cache metadata so RPC fallback isn't needed on next scan.
      // Fire-and-forget: don't block the hot path on cache writes.
      if (cache) {
        const metaKey = `meta:${chainKey.toLowerCase()}:${contract}`;
        cache.set(metaKey, { token, errors: [] }, METADATA_CACHE_TTL_MS).catch((err) => {
          console.warn(`[explorer-discovery] cache.set failed for ${metaKey}:`, err instanceof Error ? err.message : String(err));
        });
      }
    }

    return { tokens, errors };
  } catch (error) {
    startCooldown(normalizedChain);
    errors.push(`explorer error ${normalizedChain}: ${error instanceof Error ? error.message : String(error)}`);
    return { tokens: [], errors };
  } finally {
    clearTimeout(timeout);
  }
}

function getEnv(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env[name] : undefined;
}

function getPositiveEnvNumber(name: string, fallback: number): number {
  const value = Number(getEnv(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function shouldCooldown(status: number): boolean {
  return status === 402 || status === 403 || status === 429 || status >= 500;
}

function startCooldown(chainKey: string): void {
  const cooldownMs = getPositiveEnvNumber("BLOCKSCOUT_COOLDOWN_MS", 10 * 60_000);
  blockscoutCooldownUntil.set(chainKey, Date.now() + cooldownMs);
}

function isLikelySpam(symbol: string, name: string): boolean {
  if (symbol.startsWith("REALTOKEN-")) return false;
  return symbol.includes("http") || symbol.includes("www.") || symbol.includes(".com")
    || symbol.includes(".io") || symbol.includes(".cc") || symbol.includes(".xyz")
    || symbol.includes("claim") || symbol.includes("airdrop")
    || name.includes("http") || name.includes("www.") || name.includes(".com")
    || name.includes("Claim ") || name.includes("airdrop")
    || symbol === "!" || symbol.length > 20;
}
