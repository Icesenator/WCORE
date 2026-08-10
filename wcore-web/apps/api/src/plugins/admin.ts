import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@wcore/db";
import type { CircuitBreaker } from "@wcore/core";
import {
  MetricsHistoryQuerySchema,
  ScamOverrideBodySchema,
  AdminEventsQuerySchema,
} from "../schemas.js";

export interface AdminPluginDeps {
  prisma: PrismaClient;
  checkRedis: () => Promise<boolean>;
  circuitBreakers: Map<string, CircuitBreaker>;
  isAdminAuthorized: (req: { headers: Record<string, string | string[] | undefined> }) => boolean;
  recordOpsEvent: (type: string, severity: string, message: string, data?: Record<string, unknown>) => Promise<void>;
  CORE_VERSION: string;
}

export function dependencyHealthStatus(dbOk: boolean, redisOk: boolean, openCircuits: number): "ok" | "degraded" | "down" {
  if (!dbOk) return "down";
  if (!redisOk || openCircuits > 0) return "degraded";
  return "ok";
}

type DependencyName = "db" | "redis";
type AlertSeverity = "info" | "warning" | "critical";

type RpcAuditChain = {
  key: string;
  vm: string;
  CHAIN?: { CHAIN_ID?: number | string };
  RPC?: { ENDPOINTS?: readonly string[] };
  FLAGS?: { DISABLE_CHAIN?: boolean };
};

type RpcProbeResult = {
  url: string;
  ok: boolean;
  ms: number;
  status?: number;
  chainId?: number;
  error?: string;
};

export async function auditEvmRpcChains(
  chains: readonly RpcAuditChain[],
  options: { fetcher?: typeof fetch; timeoutMs?: number; concurrency?: number } = {},
) {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const concurrency = options.concurrency ?? 12;
  const evmChains = chains.filter((chain) => chain.vm === "EVM" && typeof chain.CHAIN?.CHAIN_ID === "number");
  const rows: Array<{
    key: string;
    chainId: number;
    disabled: boolean;
    total: number;
    alive: number;
    mismatched: number;
    endpoints: RpcProbeResult[];
  }> = [];

  let cursor = 0;
  async function worker() {
    while (cursor < evmChains.length) {
      const chain = evmChains[cursor++];
      if (!chain || typeof chain.CHAIN?.CHAIN_ID !== "number") continue;
      const expectedChainId = chain.CHAIN.CHAIN_ID;
      const endpoints = [...(chain.RPC?.ENDPOINTS ?? [])];
      const probes = await Promise.all(endpoints.map(async (url): Promise<RpcProbeResult> => {
        const startedAt = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetcher(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
            signal: controller.signal,
          });
          const ms = Date.now() - startedAt;
          if (!response.ok) return { url, ok: false, ms, status: response.status, error: `HTTP ${response.status}` };
          const data = await response.json() as { result?: string };
          const chainId = typeof data.result === "string" ? Number.parseInt(data.result, 16) : Number.NaN;
          if (!Number.isFinite(chainId)) return { url, ok: false, ms, error: "invalid_chain_id" };
          return chainId === expectedChainId
            ? { url, ok: true, ms, chainId }
            : { url, ok: false, ms, chainId, error: `chain_id_mismatch expected=${expectedChainId} got=${chainId}` };
        } catch (error) {
          return { url, ok: false, ms: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) };
        } finally {
          clearTimeout(timer);
        }
      }));
      rows.push({
        key: chain.key,
        chainId: expectedChainId,
        disabled: Boolean(chain.FLAGS?.DISABLE_CHAIN),
        total: probes.length,
        alive: probes.filter((probe) => probe.ok).length,
        mismatched: probes.filter((probe) => probe.error?.startsWith("chain_id_mismatch")).length,
        endpoints: probes,
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, evmChains.length)) }, () => worker()));
  rows.sort((a, b) => a.key.localeCompare(b.key));
  const dead = rows.filter((row) => row.total === 0 || row.alive === 0);
  return { scanned: rows.length, dead, rows };
}

export class DependencyTransitionTracker {
  private readonly states = new Map<DependencyName, boolean>();

  constructor(private readonly deps: {
    recordOpsEvent: AdminPluginDeps["recordOpsEvent"];
    sendAlert: (alert: { type: string; severity: AlertSeverity; service: string; ts: string; data: Record<string, unknown> }) => Promise<unknown>;
  }) {}

  async observe(checks: { db: boolean; redis: boolean }, now = new Date()): Promise<void> {
    for (const dependency of ["db", "redis"] as const) {
      const ok = checks[dependency];
      const previous = this.states.get(dependency);
      this.states.set(dependency, ok);
      if (previous === ok || (previous === undefined && ok)) continue;

      const type = `${dependency}_${ok ? "recovered" : "down"}`;
      const severity: AlertSeverity = ok ? "info" : dependency === "db" ? "critical" : "warning";
      const message = `${dependency.toUpperCase()} dependency ${ok ? "recovered" : "unavailable"}`;
      const data = { dependency, ok };
      await Promise.allSettled([
        this.deps.recordOpsEvent(type, severity, message, data),
        this.deps.sendAlert({ type, severity, service: "wcore-api", ts: now.toISOString(), data }),
      ]);
    }
  }
}

export async function adminPlugin(app: FastifyInstance, deps: AdminPluginDeps) {
  const { prisma, checkRedis, circuitBreakers, isAdminAuthorized, CORE_VERSION } = deps;

  // --- Detailed Health ---

  app.get("/api/health/detailed", async (req, reply) => {
    if (!isAdminAuthorized(req)) return reply.code(401).send({ error: "unauthorized" });
    const now = Date.now();
    const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    const redisOk = await checkRedis();
    const circuits = Object.fromEntries(Array.from(circuitBreakers.entries()).map(([k, v]) => [k, v.getStatus()]));
    const openCircuits = Object.values(circuits).filter((c: { state: string }) => c.state === "OPEN").length;
    const { metrics, isAlertingConfigured } = await import("@wcore/core");
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

    const status = dependencyHealthStatus(dbOk, redisOk, openCircuits);

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

  // --- Chain RPC lifecycle audit (runs from Railway, not the local network) ---

  app.get("/api/admin/chains/rpc-audit", async (req, reply) => {
    if (!isAdminAuthorized(req)) return reply.code(401).send({ error: "unauthorized" });
    const { chainList } = await import("@wcore/core");
    const audit = await auditEvmRpcChains(chainList, { timeoutMs: 8_000, concurrency: 12 });
    return { generatedAt: new Date().toISOString(), ...audit };
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
