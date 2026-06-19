import { getChain } from "../chains/index.js";
import { getRpcUrls, loadChainlist } from "../chainlist.js";
import { rpcHealth } from "./rpc-health.js";

export interface RpcEndpointOptions {
  includeDynamic?: boolean;
  useHealth?: boolean;
  limit?: number;
}

const DYNAMIC_TTL_MS = 6 * 60 * 60 * 1000;
const dynamicRpcCache = new Map<string, { endpoints: string[]; ts: number }>();
const refreshInflight = new Map<string, Promise<string[]>>();

function normalizeChainKey(chainKey: string): string {
  return chainKey.trim().toUpperCase();
}

function dedupe(endpoints: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const endpoint of endpoints) {
    const value = endpoint.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function isUsableRpcUrl(url: string): boolean {
  return url.startsWith("https://") && !url.includes("${") && !url.includes("{") && !url.includes("}");
}

function getStaticRpcEndpoints(chainKey: string): string[] {
  const chain = getChain(normalizeChainKey(chainKey));
  if (!chain) return [];
  if (chain.vm === "COSMOS") {
    return dedupe([chain.API?.RPC_URL, chain.API?.REST_URL, chain.API?.LCD_URL].filter((x): x is string => typeof x === "string"));
  }
  return dedupe(chain.RPC?.ENDPOINTS ?? []);
}

export { getStaticRpcEndpoints };

function getChainId(chainKey: string): number | undefined {
  const chain = getChain(normalizeChainKey(chainKey));
  const id = chain?.CHAIN?.CHAIN_ID;
  if (typeof id === "number") return id;
  if (typeof id === "string") {
    const parsed = Number(id);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Returns the chain's configured `RPC.MAX_LOG_RANGE` (max block span for a
 * single `eth_getLogs` call) when defined and a positive integer. Used by
 * helpers that need to chunk log queries (e.g. the GM on-chain contract scan,
 * where the official Moonriver RPC rejects 10k-block chunks with -32603).
 * Returns `undefined` when the chain has no explicit limit — callers should
 * fall back to a safe default.
 */
export function getChainMaxLogRange(chainKey: string): number | undefined {
  const chain = getChain(normalizeChainKey(chainKey));
  const value = chain?.RPC?.MAX_LOG_RANGE;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function getRpcEndpoints(chainKey: string, options: RpcEndpointOptions = {}): string[] {
  const key = normalizeChainKey(chainKey);
  const staticEndpoints = getStaticRpcEndpoints(key);
  const dynamic = options.includeDynamic !== false ? dynamicRpcCache.get(key) : undefined;
  const dynamicFresh = dynamic && Date.now() - dynamic.ts < DYNAMIC_TTL_MS ? dynamic.endpoints : [];
  const merged = dedupe([...staticEndpoints, ...dynamicFresh]);
  const healthy = options.useHealth === false ? merged : rpcHealth.getHealthyEndpoints(key, merged);
  return typeof options.limit === "number" ? healthy.slice(0, options.limit) : healthy;
}

export function getPrimaryRpcEndpoint(chainKey: string): string | undefined {
  return getRpcEndpoints(chainKey, { limit: 1 })[0];
}

export function getCachedDynamicRpcEndpoints(chainKey: string): string[] {
  const cached = dynamicRpcCache.get(normalizeChainKey(chainKey));
  return cached && Date.now() - cached.ts < DYNAMIC_TTL_MS ? [...cached.endpoints] : [];
}

async function validatesChainId(endpoint: string, expectedChainId: number): Promise<boolean> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return false;
    const data = await res.json() as { result?: string };
    return Number.parseInt(data.result ?? "", 16) === expectedChainId;
  } catch {
    return false;
  }
}

export async function refreshDynamicRpcEndpoints(chainKey: string, limit = 6): Promise<string[]> {
  const key = normalizeChainKey(chainKey);
  const existing = refreshInflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const chain = getChain(key);
    if (!chain || chain.vm !== "EVM") return [];
    const chainId = getChainId(key);
    if (!chainId) return [];

    await loadChainlist();
    const candidates = getRpcUrls(chainId, 20).filter(isUsableRpcUrl);
    const validated: string[] = [];
    for (const candidate of candidates) {
      if (validated.length >= limit) break;
      if (await validatesChainId(candidate, chainId)) validated.push(candidate);
    }
    const deduped = dedupe(validated);
    dynamicRpcCache.set(key, { endpoints: deduped, ts: Date.now() });
    return deduped;
  })().finally(() => refreshInflight.delete(key));

  refreshInflight.set(key, promise);
  return promise;
}

export function warmDynamicRpcEndpoints(chainKeys: string[]): void {
  for (const chainKey of chainKeys) {
    refreshDynamicRpcEndpoints(chainKey).catch(() => {});
  }
}
