import type { RpcEndpointScore, ChainRpcHealth } from "./types.js";

export interface RpcHealthOptions {
  ttlMs?: number;
  minScore?: number;
  maxFailures?: number;
  minEndpoints?: number;
}

const DEFAULT_OPTIONS: Required<RpcHealthOptions> = {
  ttlMs: 60_000,
  minScore: 0.3,
  maxFailures: 3,
  minEndpoints: 2,
};

export class RpcHealthTracker {
  private readonly ttlMs: number;
  private readonly minScore: number;
  private readonly maxFailures: number;
  private readonly minEndpoints: number;
  private readonly chains = new Map<string, ChainRpcHealth>();

  constructor(options: RpcHealthOptions = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    this.ttlMs = opts.ttlMs;
    this.minScore = opts.minScore;
    this.maxFailures = opts.maxFailures;
    this.minEndpoints = opts.minEndpoints;
  }

  recordSuccess(chain: string, endpoint: string): void {
    const health = this.getOrCreate(chain);
    const score = this.decayIfNeeded(health, endpoint);
    score.success++;
    score.lastSeen = Date.now();
    score.score = score.success / (score.success + score.failure);
    health.endpoints.set(endpoint, score);
    health.updatedAt = Date.now();
  }

  recordFailure(chain: string, endpoint: string): void {
    const health = this.getOrCreate(chain);
    const score = this.decayIfNeeded(health, endpoint);
    score.failure++;
    score.lastSeen = Date.now();
    score.score = score.success / (score.success + score.failure);
    health.endpoints.set(endpoint, score);
    health.updatedAt = Date.now();
  }

  getHealthyEndpoints(chain: string, allEndpoints: string[]): string[] {
    const health = this.chains.get(chain);
    if (!health || Date.now() - health.updatedAt > this.ttlMs) {
      return allEndpoints;
    }
    const now = Date.now();
    const healthy = allEndpoints.filter((ep) => {
      const s = health.endpoints.get(ep);
      if (!s) return true;
      // Per-endpoint decay: stale stats (not seen within ttl) no longer count
      // against the endpoint. Without this, 3 lifetime failures permanently
      // exclude an endpoint that later recovered, shrinking the usable pool.
      if (now - s.lastSeen > this.ttlMs) return true;
      return s.score >= this.minScore && s.failure < this.maxFailures;
    });
    return healthy.length >= this.minEndpoints ? healthy : allEndpoints;
  }

  getScore(chain: string, endpoint: string): RpcEndpointScore | undefined {
    return this.chains.get(chain)?.endpoints.get(endpoint);
  }

  private getOrCreate(chain: string): ChainRpcHealth {
    let health = this.chains.get(chain);
    if (!health) {
      health = { endpoints: new Map(), updatedAt: 0 };
      this.chains.set(chain, health);
    }
    return health;
  }

  // Decay counters for an endpoint that hasn't been seen within the TTL window.
  // Without this, 3 lifetime failures permanently exclude an endpoint that later
  // recovered, shrinking the usable RPC pool over time.
  private decayIfNeeded(health: ChainRpcHealth, endpoint: string): RpcEndpointScore {
    const existing = health.endpoints.get(endpoint);
    if (!existing) return { success: 0, failure: 0, lastSeen: 0, score: 1 };
    const now = Date.now();
    if (now - existing.lastSeen <= this.ttlMs) return existing;
    // Halve both counters to衰減 the impact of old failures while preserving
    // some signal. Clamp to minimum 1 so recent data still counts.
    const decayed: RpcEndpointScore = {
      success: Math.max(1, Math.floor(existing.success / 2)),
      failure: Math.max(1, Math.floor(existing.failure / 2)),
      lastSeen: existing.lastSeen,
      score: 0,
    };
    decayed.score = decayed.success / (decayed.success + decayed.failure);
    return decayed;
  }
}

export const rpcHealth = new RpcHealthTracker();
