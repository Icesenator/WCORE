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
  /**
   * Aborts every call this dispatcher issues.
   *
   * A scan that has already timed out used to keep its RPC calls running: the per-chain
   * timeout released the concurrency slot while the underlying work carried on, so the
   * real number of in-flight scans drifted above the configured limit and the RPC quota
   * kept burning for a result nobody would read.
   */
  signal?: AbortSignal;
}

const DEFAULT_CONFIG: Required<Omit<DispatcherConfig, "signal">> = {
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
    const signal = this.config.signal;

    // Nothing downstream will consume the result, so do not open the connections.
    if (signal?.aborted) {
      return { ...reachConsensus<T>([], serialize, { total: 0 }), attempts: [] };
    }

    const picked = this.pickEndpoints(endpoints);

    const attempts = await Promise.all(
      picked.map(async (ep): Promise<DispatchAttempt<T>> => {
        const start = Date.now();
        try {
          const value = await call(ep, { timeoutMs: cfg.timeoutMs, signal });
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
