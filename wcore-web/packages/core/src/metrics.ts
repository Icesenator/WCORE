type ChainMetrics = {
  scans: number;
  totalMs: number;
  tokensFound: number;
  pricedTokens: number;
  rpcErrors: number;
  pricingErrors: number;
  otherErrors: number;
};

type CacheMetrics = {
  hits: number;
  misses: number;
};

interface ErrorSample {
  chain: string;
  type: "rpc" | "pricing" | "other" | "timeout";
  message: string;
  ts: number;
}

export type MetricsSnapshot = {
  uptimeSec: number;
  scans: { total: number; byChain: Record<string, ChainMetrics> };
  cache: { redis: CacheMetrics; session: CacheMetrics };
  errors: { rpcTotal: number; pricingTotal: number; byChain: Record<string, { rpc: number; pricing: number; other: number }> };
  rateLimits: { scanHits: number; authHits: number; gmHits: number; leaderboardHits: number; catchAllHits: number };
  circuitBreaker: { trips: number; lastTrip: string | null };
  startTime: string;
};

class MetricsStore {
  private startTime: number;
  scanCount = 0;
  chainMetrics = new Map<string, ChainMetrics>();
  redisCache = { hits: 0, misses: 0 };
  sessionCache = { hits: 0, misses: 0 };
  rpcErrors: Record<string, number> = {};
  pricingErrors: Record<string, number> = {};
  otherErrors: Record<string, number> = {};
  rateLimitScanHits = 0;
  rateLimitAuthHits = 0;
  rateLimitGmHits = 0;
  rateLimitLeaderboardHits = 0;
  rateLimitCatchAllHits = 0;
  circuitBreakerTrips = 0;
  circuitBreakerLastTrip: string | null = null;
  private errorSamples: ErrorSample[] = [];
  private readonly MAX_ERROR_SAMPLES = 200;

  constructor() {
    this.startTime = Date.now();
  }

  recordScan(chainKey: string, ms: number, tokens: number, priced: number, rpcErrs: number, priceErrs: number, otherErrs: number) {
    this.scanCount++;
    const c = this.chainMetrics.get(chainKey) || { scans: 0, totalMs: 0, tokensFound: 0, pricedTokens: 0, rpcErrors: 0, pricingErrors: 0, otherErrors: 0 };
    c.scans++;
    c.totalMs += ms;
    c.tokensFound += tokens;
    c.pricedTokens += priced;
    c.rpcErrors += rpcErrs;
    c.pricingErrors += priceErrs;
    c.otherErrors += otherErrs;
    this.chainMetrics.set(chainKey, c);

    if (chainKey) {
      this.rpcErrors[chainKey] = (this.rpcErrors[chainKey] || 0) + rpcErrs;
      this.pricingErrors[chainKey] = (this.pricingErrors[chainKey] || 0) + priceErrs;
      this.otherErrors[chainKey] = (this.otherErrors[chainKey] || 0) + otherErrs;
    }
  }

  recordCacheHit(type: "redis" | "session") {
    if (type === "redis") this.redisCache.hits++;
    else this.sessionCache.hits++;
  }

  recordCacheMiss(type: "redis" | "session") {
    if (type === "redis") this.redisCache.misses++;
    else this.sessionCache.misses++;
  }

  recordRateLimit(type: "scan" | "auth" | "gm" | "leaderboard" | "catch_all") {
    if (type === "scan") this.rateLimitScanHits++;
    else if (type === "gm") this.rateLimitGmHits++;
    else if (type === "leaderboard") this.rateLimitLeaderboardHits++;
    else if (type === "catch_all") this.rateLimitCatchAllHits++;
    else this.rateLimitAuthHits++;
  }

  recordCircuitBreakerTrip() {
    this.circuitBreakerTrips++;
    this.circuitBreakerLastTrip = new Date().toISOString();
  }

  recordChainTimeout(chain: string) {
    this.otherErrors[chain] = (this.otherErrors[chain] || 0) + 1;
    this.pushErrorSample({ chain, type: "timeout", message: `chain_timeout: ${chain} exceeded limit`, ts: Date.now() });
  }

  recordRpcError(chain: string, message: string) {
    this.rpcErrors[chain] = (this.rpcErrors[chain] || 0) + 1;
    this.pushErrorSample({ chain, type: "rpc", message, ts: Date.now() });
  }

  recordPricingError(chain: string, message: string) {
    this.pricingErrors[chain] = (this.pricingErrors[chain] || 0) + 1;
    this.pushErrorSample({ chain, type: "pricing", message, ts: Date.now() });
  }

  recordOtherError(chain: string, message: string) {
    this.otherErrors[chain] = (this.otherErrors[chain] || 0) + 1;
    this.pushErrorSample({ chain, type: "other", message, ts: Date.now() });
  }

  private pushErrorSample(sample: ErrorSample) {
    this.errorSamples.push(sample);
    if (this.errorSamples.length > this.MAX_ERROR_SAMPLES) {
      this.errorSamples = this.errorSamples.slice(-this.MAX_ERROR_SAMPLES);
    }
  }

  getErrorSamples(): ErrorSample[] {
    return [...this.errorSamples];
  }

  reset(): void {
    this.scanCount = 0;
    this.chainMetrics.clear();
    this.redisCache = { hits: 0, misses: 0 };
    this.sessionCache = { hits: 0, misses: 0 };
    this.rpcErrors = {};
    this.pricingErrors = {};
    this.otherErrors = {};
    this.rateLimitScanHits = 0;
    this.rateLimitAuthHits = 0;
    this.rateLimitGmHits = 0;
    this.rateLimitLeaderboardHits = 0;
    this.rateLimitCatchAllHits = 0;
    this.circuitBreakerTrips = 0;
    this.circuitBreakerLastTrip = null;
    this.startTime = Date.now();
  }

  snapshot(): MetricsSnapshot {
    const byChain: Record<string, ChainMetrics> = {};
    const errByChain: Record<string, { rpc: number; pricing: number; other: number }> = {};
    for (const [key, m] of this.chainMetrics) {
      byChain[key] = { ...m };
      errByChain[key] = {
        rpc: this.rpcErrors[key] || 0,
        pricing: this.pricingErrors[key] || 0,
        other: this.otherErrors[key] || 0,
      };
    }

    return {
      uptimeSec: Math.round((Date.now() - this.startTime) / 1000),
      scans: { total: this.scanCount, byChain },
      cache: {
        redis: { ...this.redisCache },
        session: { ...this.sessionCache },
      },
      errors: {
        rpcTotal: Object.values(this.rpcErrors).reduce((a, b) => a + b, 0),
        pricingTotal: Object.values(this.pricingErrors).reduce((a, b) => a + b, 0),
        byChain: errByChain,
      },
      rateLimits: { scanHits: this.rateLimitScanHits, authHits: this.rateLimitAuthHits, gmHits: this.rateLimitGmHits, leaderboardHits: this.rateLimitLeaderboardHits, catchAllHits: this.rateLimitCatchAllHits },
      circuitBreaker: { trips: this.circuitBreakerTrips, lastTrip: this.circuitBreakerLastTrip },
      startTime: new Date(this.startTime).toISOString(),
    };
  }
}

export const metrics = new MetricsStore();
