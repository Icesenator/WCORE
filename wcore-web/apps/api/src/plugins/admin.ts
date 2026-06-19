import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@wcore/db";
import type { CacheStore, CircuitBreaker } from "@wcore/core";
import {
  MetricsHistoryQuerySchema,
  ScamOverrideBodySchema,
  AdminEventsQuerySchema,
} from "../schemas.js";

export interface AdminPluginDeps {
  prisma: PrismaClient;
  sharedCache: CacheStore;
  circuitBreakers: Map<string, CircuitBreaker>;
  isAdminAuthorized: (req: { headers: Record<string, string | string[] | undefined> }) => boolean;
  recordOpsEvent: (type: string, severity: string, message: string, data?: Record<string, unknown>) => Promise<void>;
  CORE_VERSION: string;
}

export async function adminPlugin(app: FastifyInstance, deps: AdminPluginDeps) {
  const { prisma, sharedCache, circuitBreakers, isAdminAuthorized, recordOpsEvent, CORE_VERSION } = deps;

  // --- Detailed Health ---

  app.get("/api/health/detailed", async (req, reply) => {
    if (!isAdminAuthorized(req)) return reply.code(401).send({ error: "unauthorized" });
    const now = Date.now();
    const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    const redisOk = await sharedCache.set("health:ping", { ts: now }, 5000).then(() => true).catch(() => false);
    const circuits = Object.fromEntries(Array.from(circuitBreakers.entries()).map(([k, v]) => [k, v.getStatus()]));
    const openCircuits = Object.values(circuits).filter((c: { state: string }) => c.state === "OPEN").length;
    const { metrics, sendAlert, isAlertingConfigured } = await import("@wcore/core");
    const snap = metrics.snapshot();

    let recentScanRows: Array<{ address: string; chains: string[]; totalEur: number; createdAt: Date }> = [];
    try {
      recentScanRows = await prisma.walletScan.findMany({ select: { address: true, chains: true, totalEur: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 10 });
    } catch (e) { console.error("health recent scans DB error:", (e).message || String(e)); }

    let gm24h = 0; let gm7d = 0; let gm30d = 0; let gmAll = 0;
    try {
      gm24h = await prisma.onchainGm.count({ where: { createdAt: { gte: new Date(now - 24 * 60 * 60 * 1000) } } });
      gm7d = await prisma.onchainGm.count({ where: { createdAt: { gte: new Date(now - 7 * 24 * 60 * 60 * 1000) } } });
      gm30d = await prisma.onchainGm.count({ where: { createdAt: { gte: new Date(now - 30 * 24 * 60 * 60 * 1000) } } });
      gmAll = await prisma.onchainGm.count();
    } catch (e) { console.error("health GM stats DB error:", (e).message || String(e)); }

    const chainErrors = Object.entries(snap.errors.byChain)
      .map(([chain, errs]) => ({ chain, ...errs }))
      .sort((a, b) => (b.rpc + b.pricing + b.other) - (a.rpc + a.pricing + a.other))
      .slice(0, 10);

    const scanMetrics = Object.entries(snap.scans.byChain || {})
      .map(([chain, m]) => ({ chain, avgMs: m.totalMs / Math.max(1, m.scans), scans: m.scans } as { chain: string; avgMs: number; scans: number }))
      .filter(c => c.scans > 0)
      .sort((a, b) => b.avgMs - a.avgMs)
      .slice(0, 5);

    const status = !dbOk ? "down" : openCircuits > 0 ? "degraded" : "ok";

    if (status !== "ok") {
      const alertType = !dbOk ? "db_down" : !redisOk ? "redis_down" : "health_degraded";
      const severity = status === "down" ? "critical" : "warning" as const;
      sendAlert({ type: alertType, severity, service: "wcore-api", ts: new Date(now).toISOString(), data: { dbOk, redisOk, openCircuits, status } }).catch(() => {});
      recordOpsEvent(alertType, severity, `Health ${status} (db:${dbOk} redis:${redisOk} circuits:${openCircuits})`, { dbOk, redisOk, openCircuits });
    }

    return {
      status, service: "wcore-api", version: CORE_VERSION,
      uptimeSec: Math.round(process.uptime()), checks: { db: dbOk, redis: redisOk, openCircuits },
      alerting: isAlertingConfigured(),
      circuits,
      metrics: { scans: snap.scans.total, rateLimits: snap.rateLimits, cache: snap.cache, circuitBreaker: snap.circuitBreaker },
      gm: { last24h: gm24h, last7d: gm7d, last30d: gm30d, total: gmAll },
      recentScans: recentScanRows.map(s => ({ address: s.address, chains: s.chains.length, totalEur: s.totalEur, at: s.createdAt.toISOString() })),
      chainCount: (await import("@wcore/core")).chainList.length, chainErrors, slowChains: scanMetrics,
    };
  });

  // --- Metrics History ---

  app.get("/api/admin/metrics/history", async (req, reply) => {
    if (!isAdminAuthorized(req)) return reply.code(401).send({ error: "unauthorized" });
    const { range } = MetricsHistoryQuerySchema.parse(req.query);
    const hours = range === "7d" ? 168 : range === "48h" ? 48 : 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    try {
      const snapshots = await prisma.systemMetricSnapshot.findMany({
        where: { createdAt: { gte: since } }, orderBy: { createdAt: "asc" },
        select: { createdAt: true, status: true, dbOk: true, redisOk: true, openCircuits: true, rpcErrors: true, pricingErrors: true, scanCount: true, gm24h: true, gm7d: true, gm30d: true },
      });
      return { snapshots, range, count: snapshots.length };
    } catch { return { snapshots: [], range, count: 0 }; }
  });

  // --- Pricing Accuracy ---

  app.get("/api/admin/pricing/accuracy", async (req, reply) => {
    if (!isAdminAuthorized(req)) return reply.code(401).send({ error: "unauthorized" });
    try {
      const { metrics } = await import("@wcore/core");
      const snap = metrics.snapshot();
      const byChain = Object.entries(snap.scans.byChain || {})
        .map(([chain, m]) => ({
          chain, scans: m.scans, tokensFound: m.tokensFound, pricedTokens: m.pricedTokens,
          unpriced: m.tokensFound - m.pricedTokens,
          ratio: m.tokensFound > 0 ? (m.pricedTokens / m.tokensFound * 100).toFixed(1) : "100.0",
          pricingErrors: snap.errors.byChain[chain]?.pricing ?? 0,
          rpcErrors: snap.errors.byChain[chain]?.rpc ?? 0,
        }))
        .filter(c => c.tokensFound > 0)
        .sort((a, b) => (parseFloat(a.ratio) - parseFloat(b.ratio)));

      const totalTokens = byChain.reduce((s, c) => s + c.tokensFound, 0);
      const totalPriced = byChain.reduce((s, c) => s + c.pricedTokens, 0);
      const globalRatio = totalTokens > 0 ? (totalPriced / totalTokens * 100).toFixed(1) : "100.0";

      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const history = await prisma.systemMetricSnapshot.findMany({
        where: { createdAt: { gte: dayAgo } },
        select: { createdAt: true, pricingErrors: true, rpcErrors: true },
        orderBy: { createdAt: "asc" },
      });

      const unpricedTokens: Array<{ chain: string; symbol: string; name: string; contract: string }> = [];
      try {
        const recentScans = await prisma.walletScan.findMany({ where: { createdAt: { gte: dayAgo } }, select: { result: true }, orderBy: { createdAt: "desc" }, take: 20 });
        const seen = new Set<string>();
        for (const scan of recentScans) {
          const r = scan.result as { chains?: Array<{ chainName: string; tokens?: Array<{ symbol: string; name: string; contract: string; flags?: string[] }> }> } | null;
          for (const chain of r?.chains ?? []) {
            for (const token of chain.tokens ?? []) {
              if (token.flags?.includes("NO_PRICE") && !seen.has(token.contract)) {
                seen.add(token.contract);
                unpricedTokens.push({ chain: chain.chainName, symbol: token.symbol, name: token.name, contract: token.contract });
              }
            }
          }
        }
      } catch (e) { console.error("unpriced tokens DB error:", (e).message || String(e)); }

      return { globalRatio, totalTokens, totalPriced, byChain, unpricedTokens: unpricedTokens.slice(0, 20), history: history.map(h => ({ at: h.createdAt.toISOString(), pricing: h.pricingErrors, rpc: h.rpcErrors })) };
    } catch { return { globalRatio: "0", totalTokens: 0, totalPriced: 0, byChain: [], unpricedTokens: [], history: [] }; }
  });

  // --- Scam Override ---

  app.post("/api/admin/scam-override", async (req, reply) => {
    if (!isAdminAuthorized(req)) return reply.code(401).send({ error: "unauthorized" });
    const { addAdminApproved, addAdminBlocked } = await import("@wcore/core");

    const scamParsed = ScamOverrideBodySchema.safeParse(req.body);
    if (!scamParsed.success) return reply.code(400).send({ error: "symbol and action required" });
    const { symbol, action, contract } = scamParsed.data;
    const sym = symbol.trim().toUpperCase();
    const upsertOverride = async (approved: boolean) => {
      const contractLower = contract?.toLowerCase();
      if (contractLower) {
        await prisma.scamOverride.upsert({
          where: { symbol_contract: { symbol: sym, contract: contractLower } },
          update: { approved: approved },
          create: { symbol: sym, contract: contractLower, approved: approved }
        });
        return;
      }
      const existing = await prisma.scamOverride.findFirst({ where: { symbol: sym, contract: null } });
      if (existing) await prisma.scamOverride.update({ where: { id: existing.id }, data: { approved: approved } });
      else await prisma.scamOverride.create({ data: { symbol: sym, contract: null, approved: approved } });
    };
    if (action === "approve") {
      addAdminApproved(sym, contract);
      await upsertOverride(true);
    } else if (action === "block") {
      addAdminBlocked(sym, contract);
      await upsertOverride(false);
    }
    return { ok: true };
  });

  // --- Admin Events ---

  app.get("/api/admin/events", async (req, reply) => {
    if (!isAdminAuthorized(req)) return reply.code(401).send({ error: "unauthorized" });
    const eventsQ = AdminEventsQuerySchema.parse(req.query);
    const limit = eventsQ.limit ?? 100;
    const typeFilter = eventsQ.type;
    try {
      const where: Record<string, unknown> = {};
      if (typeFilter) where.type = typeFilter;
      const events = await prisma.opsEvent.findMany({ where, orderBy: { createdAt: "desc" }, take: limit });
      return { events, count: events.length };
    } catch { return { events: [], count: 0 }; }
  });

  // --- Load scam overrides from DB ---
  // Also exposed as a GET endpoint so the frontend can sync on page load.
  async function loadScamOverridesFromDb() {
    try {
      const { addAdminApproved, addAdminBlocked } = await import("@wcore/core");
      const overrides = await prisma.scamOverride.findMany();
      for (const o of overrides) {
        if (o.approved) addAdminApproved(o.symbol, o.contract ?? undefined);
        else addAdminBlocked(o.symbol, o.contract ?? undefined);
      }
      if (overrides.length > 0) app.log.info(`Loaded ${overrides.length} scam overrides from DB`);
      return overrides;
    } catch (e) { console.error("loadScamOverrides DB error:", (e).message || String(e)); return []; }
  }

  app.get("/api/admin/scam-overrides", async (req, reply) => {
    if (!isAdminAuthorized(req)) return reply.code(401).send({ error: "unauthorized" });
    try {
      const overrides = await prisma.scamOverride.findMany();
      return { overrides: overrides.map(o => ({ symbol: o.symbol, contract: o.contract ?? null, approved: o.approved })) };
    } catch { return { overrides: [] }; }
  });

  await loadScamOverridesFromDb();
}
