// Multi-RPC dispatcher — picks healthy endpoints, fires the same call against
// several of them in parallel, applies strict-majority consensus on the result.
// Port of pickForConsensus + batchWithConsensus from src/05_RPC.gs.

import { reachConsensus, type ConsensusResult } from "./consensus.js";
import { RpcHealth } from "./health.js";
import { type RpcCallOptions } from "./client.js";

export interface DispatcherConfig {
  minRpcs?: number;
  maxRpcs?: number;
  timeoutMs?: number;
}

const DEFAULT_CONFIG: Required<DispatcherConfig> = {
  minRpcs: 2,
  maxRpcs: 3,
  timeoutMs: 2500,
};

export interface DispatchAttempt<T> {
  endpoint: string;
  ok: boolean;
  value: T | null;
  error?: unknown;
  durationMs: number;
}

export interface DispatchResult<T> extends ConsensusResult<T> {
  attempts: DispatchAttempt<T>[];
}

export class RpcDispatcher {
  constructor(
    private readonly health: RpcHealth = new RpcHealth(),
    private readonly config: DispatcherConfig = {},
  ) {}

  pickEndpoints(endpoints: ReadonlyArray<string>): string[] {
    const cfg = { ...DEFAULT_CONFIG, ...this.config };
    const healthy = this.health.filterHealthy(endpoints);
    const pool = healthy.length >= cfg.minRpcs ? healthy : (healthy.length > 0 ? healthy : [...endpoints]);
    return pool.slice(0, Math.max(cfg.minRpcs, Math.min(cfg.maxRpcs, pool.length)));
  }

  async run<T>(
    endpoints: ReadonlyArray<string>,
    call: (endpoint: string, opts: RpcCallOptions) => Promise<T>,
    serialize: (v: T) => string = (v) => JSON.stringify(v),
  ): Promise<DispatchResult<T>> {
    const cfg = { ...DEFAULT_CONFIG, ...this.config };
    const picked = this.pickEndpoints(endpoints);

    const attempts = await Promise.all(
      picked.map(async (ep): Promise<DispatchAttempt<T>> => {
        const start = Date.now();
        try {
          const value = await call(ep, { timeoutMs: cfg.timeoutMs });
          this.health.recordSuccess(ep);
          return { endpoint: ep, ok: true, value, durationMs: Date.now() - start };
        } catch (err) {
          this.health.recordFailure(ep);
          return {
            endpoint: ep,
            ok: false,
            value: null,
            error: err,
            durationMs: Date.now() - start,
          };
        }
      }),
    );

    const consensus = reachConsensus(
      attempts.map((a) => (a.ok ? a.value : null)),
      serialize,
      { total: attempts.length },
    );
    return { ...consensus, attempts };
  }
}
