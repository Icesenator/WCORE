import type { FastifyInstance } from "fastify";
import { metrics } from "@wcore/core";
import type { CircuitBreaker } from "@wcore/core";

interface MetricsPluginDeps {
  getCircuitBreaker: (chain: string) => CircuitBreaker;
  isAdminAuthorized: (req: { headers: Record<string, string | string[] | undefined> }) => boolean;
}

export async function metricsPlugin(app: FastifyInstance, deps: MetricsPluginDeps) {
  const { getCircuitBreaker, isAdminAuthorized } = deps;

  app.get("/api/metrics/errors", async (req, reply) => {
    // Admin-only: exposes infrastructure details (cache backend, uptime, concurrency)
    if (!isAdminAuthorized(req)) return reply.code(401).send({ error: "unauthorized" });
    const snapshot = metrics.snapshot();
    const circuitBreakers = getCircuitBreaker;

    const open: string[] = [];
    const halfOpen: string[] = [];
    let closedCount = 0;

    // Iterate all known chains from the snapshot
    const allChains = new Set<string>();
    for (const chain of Object.keys(snapshot.errors.byChain)) allChains.add(chain);
    for (const chain of Object.keys(snapshot.scans.byChain)) allChains.add(chain);

    for (const chain of allChains) {
      const status = circuitBreakers(chain).getStatus();
      if (status.state === "OPEN") open.push(chain);
      else if (status.state === "HALF_OPEN") halfOpen.push(chain);
      else closedCount++;
    }

    return {
      byType: {
        rpc_consensus_failed: snapshot.errors.rpcTotal,
        pricing_no_price: snapshot.errors.pricingTotal,
        other: Object.values(snapshot.errors.byChain).reduce((sum, e) => sum + (e.other ?? 0), 0),
      },
      byChain: snapshot.errors.byChain,
      circuits: {
        open,
        halfOpen,
        closedCount,
        trips: snapshot.circuitBreaker.trips,
        lastTrip: snapshot.circuitBreaker.lastTrip,
      },
      cache: {
        backend: process.env.REDIS_URL ? "redis" : "memory",
        redis: snapshot.cache.redis,
        session: snapshot.cache.session,
      },
      scanConcurrency: Number(process.env.SCAN_CONCURRENCY) || 50,
      uptime: snapshot.uptimeSec,
      startedAt: snapshot.startTime,
    };
  });

  app.get("/api/metrics/errors/detail", async (req, reply) => {
    if (!isAdminAuthorized(req)) return reply.code(401).send({ error: "unauthorized" });
    const samples = metrics.getErrorSamples();
    const byChain: Record<string, { rpc: string[]; pricing: string[]; other: string[]; timeout: string[] }> = {};
    for (const s of samples) {
      let entry = byChain[s.chain];
      if (!entry) { entry = { rpc: [], pricing: [], other: [], timeout: [] }; byChain[s.chain] = entry; }
      entry[s.type].push(s.message);
    }
    return {
      total: samples.length,
      recent: samples.slice(-50).reverse(),
      byChain,
    };
  });
}
