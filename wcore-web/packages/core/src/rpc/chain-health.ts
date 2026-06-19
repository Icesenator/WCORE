// Chain health classification — categorizes a chain's static RPC pool to
// drive scan / UI behavior. Adapted from the Apps Script `RPCAvalancheDetector`
// pattern but kept lightweight (no proactive probing; we only inspect the
// configured endpoints + the live `rpcHealth` tracker).
//
// Categories:
//   "healthy"  — 2+ endpoints configured AND at least one has a healthy score.
//   "single"   — 1 endpoint OR 0-1 healthy endpoints; consensus unreachable.
//   "half"     — multi-endpoint but 50%+ dead.
//   "dead"     — 0 healthy endpoints.
//
// The categories feed the scan path (skip chain when dead), the UI badge
// (single/half for transparency), and the warmup / refresh strategy
// (single/half chains eagerly try `refreshDynamicRpcEndpoints`).

import { getChain } from "../chains/index.js";
import { rpcHealth } from "./rpc-health.js";
import { getStaticRpcEndpoints } from "./endpoints.js";

export type ChainHealthCategory = "healthy" | "single" | "half" | "dead";

export interface ChainHealthReport {
  chain: string;
  category: ChainHealthCategory;
  totalEndpoints: number;
  healthyEndpoints: number;
  reason: string;
}

function normalizeKey(key: string): string {
  return key.trim().toUpperCase();
}

function healthyCount(chainKey: string, endpoints: string[]): number {
  let count = 0;
  for (const ep of endpoints) {
    const score = rpcHealth.getScore(chainKey, ep);
    if (!score) {
      // No data yet → assume healthy (first call wins).
      count++;
      continue;
    }
    if (Date.now() - score.lastSeen > 60_000) {
      count++;
      continue;
    }
    if (score.score >= 0.3 && score.failure < 3) count++;
  }
  return count;
}

export function classifyChainHealth(chainKey: string): ChainHealthReport {
  const key = normalizeKey(chainKey);
  const chain = getChain(key);
  if (chain?.FLAGS?.DISABLE_CHAIN === true) {
    return { chain: key, category: "dead", totalEndpoints: 0, healthyEndpoints: 0, reason: "FLAGS.DISABLE_CHAIN=true" };
  }
  const endpoints = getStaticRpcEndpoints(key);
  if (endpoints.length === 0) {
    return { chain: key, category: "dead", totalEndpoints: 0, healthyEndpoints: 0, reason: "no static endpoints" };
  }
  const healthy = healthyCount(key, endpoints);
  if (healthy === 0) {
    return { chain: key, category: "dead", totalEndpoints: endpoints.length, healthyEndpoints: 0, reason: "all endpoints marked unhealthy" };
  }
  if (endpoints.length === 1 || healthy < Math.max(1, Math.floor(endpoints.length / 2))) {
    return {
      chain: key,
      category: "single",
      totalEndpoints: endpoints.length,
      healthyEndpoints: healthy,
      reason: endpoints.length === 1 ? "single-RPC chain" : `${healthy}/${endpoints.length} healthy`,
    };
  }
  if (healthy < endpoints.length) {
    return {
      chain: key,
      category: "half",
      totalEndpoints: endpoints.length,
      healthyEndpoints: healthy,
      reason: `${healthy}/${endpoints.length} healthy`,
    };
  }
  return { chain: key, category: "healthy", totalEndpoints: endpoints.length, healthyEndpoints: healthy, reason: "ok" };
}

export function isChainDisabled(chainKey: string): boolean {
  const chain = getChain(normalizeKey(chainKey));
  return chain?.FLAGS?.DISABLE_CHAIN === true;
}
