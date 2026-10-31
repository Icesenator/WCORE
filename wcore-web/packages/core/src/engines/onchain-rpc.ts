import type { EvmRpc } from "../rpc/index.js";
import { rpcHealth } from "../rpc/rpc-health.js";
import type { OnchainV3Rpc } from "../pricing/sources/onchain-v3.js";

export interface OnchainBatchRpcOptions {
  chainKey: string;
  endpoints: string[];
  rpc: Pick<EvmRpc, "batch">;
  /** Overridden chain: a pool price is used only when two providers return it. */
  strict: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const MIN_AGREEING_PROVIDERS = 2;

export function createOnchainBatchRpc(opts: OnchainBatchRpcOptions): OnchainV3Rpc {
  const { chainKey, endpoints, rpc, strict, signal } = opts;
  const timeoutMs = opts.timeoutMs ?? 5000;

  const readFrom = async (endpoint: string, calls: Array<{ to: string; data: string }>): Promise<Array<string | null>> => {
    const ethCalls = calls.map((c) => ({ method: "eth_call", params: [{ to: c.to, data: c.data }, "latest"] }));
    const results = await rpc.batch(endpoint, ethCalls, { timeoutMs, signal });
    const mapped = calls.map((_, i) => {
      const r = results[i];
      return r && "result" in r && typeof r.result === "string" ? r.result : null;
    });
    rpcHealth.recordSuccess(chainKey, endpoint);
    return mapped;
  };

  return {
    async batch(calls) {
      if (!strict) {
        try {
          return await Promise.any(endpoints.map((endpoint) => readFrom(endpoint, calls)));
        } catch {
          for (const ep of endpoints) rpcHealth.recordFailure(chainKey, ep);
          return calls.map(() => null);
        }
      }
      const settled = await Promise.allSettled(endpoints.map((endpoint) => readFrom(endpoint, calls)));
      endpoints.forEach((endpoint, i) => { if (settled[i]?.status === "rejected") rpcHealth.recordFailure(chainKey, endpoint); });
      const answers = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
      return calls.map((_, i) => {
        const counts = new Map<string, number>();
        for (const answer of answers) {
          const value = answer[i];
          if (value != null) counts.set(value, (counts.get(value) ?? 0) + 1);
        }
        for (const [value, count] of counts) if (count >= MIN_AGREEING_PROVIDERS) return value;
        return null;
      });
    },
  };
}
