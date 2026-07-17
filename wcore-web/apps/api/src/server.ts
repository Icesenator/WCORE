import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import compress from "@fastify/compress";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@wcore/db";
import { CORE_VERSION, chainList, createCacheStore, MemoryCacheStore, CircuitBreaker, loadChainlist, metrics, sendAlert } from "@wcore/core";

import { authPlugin } from "./auth.js";
import { gamificationPlugin, seedGmContracts } from "./gamification/index.js";
import { supportPlugin } from "./support.js";
import { scanPlugin } from "./plugins/scan.js";
import { adminPlugin } from "./plugins/admin.js";
import { walletPlugin } from "./plugins/wallet.js";
import { cexPlugin } from "./plugins/cex.js";
import { chainsPlugin } from "./plugins/chains.js";
import { metricsPlugin } from "./plugins/metrics-plugin.js";
import { gsheetPlugin } from "./plugins/gsheet.js";
import { CanonicalStockService } from "./stocks/stock-service.js";
import { buildGsheetStockPortfolioSnapshot } from "./stocks/stock-portfolio.js";
import { CanonicalCryptoService } from "./crypto/crypto-listing-service.js";
import { toCryptoMarketCapRow, toStockMarketCapRow } from "./market-cap/presentation.js";
import { RealTPriceSource } from "@wcore/core";
import { buildChainScan, registerPostAuthRateLimit, requiresCsrfOriginCheck, validateChains, validateCustomToken } from "./server-helpers.js";
import { isAdminAuthorized } from "./admin-auth.js";
import { apiConfig } from "./config.js";

// `true` would trust any X-Forwarded-For chain hop (IP spoofing surface for rate-limiting).
// In prod Railway routes through a single proxy, so `1` (single hop) is the correct default
// when the user opts in via TRUST_PROXY=true. Explicit hop counts (e.g. TRUST_PROXY=2) and
// loopback fallback are preserved.
const PORT = apiConfig.server.port;
const HOST = apiConfig.server.host;
const trustProxy = apiConfig.server.trustProxy;

const app = Fastify({
  trustProxy,
  logger: apiConfig.runtime.isTest
    ? false
    : (apiConfig.server.usePrettyLogger
      ? { level: apiConfig.server.logLevel, transport: { target: "pino-pretty" } }
      : { level: apiConfig.server.logLevel }),
});

const redisConfig = apiConfig.redis.config;
const sharedCache = redisConfig
  ? await createCacheStore({
    ...redisConfig,
    onFallback: (err) => {
      app.log.warn({ err: err instanceof Error ? err.message : String(err), redisUrlConfigured: apiConfig.redis.configuredViaUrl, redisHost: redisConfig.host, redisPort: redisConfig.port },
        "redis unreachable — falling back to in-memory cache");
    },
  })
  : Object.assign(new MemoryCacheStore(), { errorCount: 0 });

// Diagnostic: log cache backend at startup so we know if discovery/pricing
// caches are shared (Redis) or per-process (MemoryCacheStore).
app.log.info(
  { redisConfigured: !!redisConfig, cacheType: redisConfig ? "redis" : "memory", redisHost: redisConfig?.host, redisPort: redisConfig?.port },
  "cache backend initialized",
);

// --- Circuit Breakers ---

const circuitBreakers = new Map<string, CircuitBreaker>();
function getCircuitBreaker(chain: string): CircuitBreaker {
  const key = chain.toLowerCase();
  if (!circuitBreakers.has(key)) {
    // decayMs=5min: failureCount auto-resets on idle, so a chain isn't permanently
    // excluded after intermittent failures (cf. memory project_circuit_breaker_decay).
    const breaker = new CircuitBreaker(key, 20, 120_000, 300_000);
    breaker.setEventListener((evt) => {
      app.log.warn(evt, `circuit ${evt.event} for ${evt.chain}`);
      const severity = evt.event === "circuit_opened" ? "critical" : "info";
      sendAlert({ type: evt.event, severity, service: "wcore-api", ts: evt.ts, data: { chain: evt.chain, failureCount: evt.failureCount, openedAt: evt.openedAt } }).catch(() => {});
      recordOpsEvent(evt.event, severity, `Circuit ${evt.event} for ${evt.chain}`, { chain: evt.chain, failureCount: evt.failureCount });
    });
    circuitBreakers.set(key, breaker);
  }
  return circuitBreakers.get(key)!;
}

// --- Plan & Rate Limit ---

const MAX_CHAINS_PER_SCAN = apiConfig.limits.maxChainsPerScan;
const ANONYMOUS_MAX_CHAINS_PER_SCAN = apiConfig.limits.anonymousMaxChainsPerScan;
const PLAN_LIMITS: Record<string, { maxChains: number; maxScansPerDay: number; multiWalletPdf: boolean }> = {
  free: { maxChains: 120, maxScansPerDay: 9999, multiWalletPdf: true },
  pro: { maxChains: 120, maxScansPerDay: 9999, multiWalletPdf: true },
  admin: { maxChains: 120, maxScansPerDay: 9999, multiWalletPdf: true },
};

// Plan cache: avoids a Prisma roundtrip per /api/scan (20 concurrent scans
// for the same user previously fired 20 identical DB queries). 5-min TTL.
const USER_PLAN_CACHE_TTL_MS = 5 * 60_000;
const userPlanCacheKey = (userId: string) => `user_plan:${userId}`;

async function getUserPlan(userId: string): Promise<string> {
  const cacheKey = userPlanCacheKey(userId);
  try {
    const cached = await sharedCache.get<string>(cacheKey);
    if (cached) return cached;
  } catch { /* cache miss tolerated */ }
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
    const plan = user?.plan ?? "free";
    sharedCache.set(cacheKey, plan, USER_PLAN_CACHE_TTL_MS).catch(() => { /* cache write failed */ });
    return plan;
  } catch (e) { console.error("getUserPlan DB error:", (e).message || String(e)); return "free"; }
}

async function getScanLimit(userId: string): Promise<number> {
  const plan = await getUserPlan(userId);
  return (PLAN_LIMITS[plan] ?? PLAN_LIMITS["free"]!).maxChains;
}

const RATE_LIMIT_SCAN = apiConfig.limits.rateLimitScan;
const RATE_LIMIT_SCAN_ANON = apiConfig.limits.rateLimitScanAnon;
const RATE_LIMIT_AUTH = apiConfig.limits.rateLimitAuth;
const RATE_LIMIT_LEADERBOARD = apiConfig.limits.rateLimitLeaderboard;
const RATE_LIMIT_CATCH_ALL = apiConfig.limits.rateLimitCatchAll;
// The /gm page renders ~30 chain cards; even after the per-card global-fetch
// fix, deployed-but-undone cards each do a targeted status-onchain reconcile.
// Keep this generous so a single page load can never 429 the header's GM reads.
// Lower for unauthenticated requests to prevent RPC amplification.
const RATE_LIMIT_GM_READ = apiConfig.limits.rateLimitGmRead;
const RATE_LIMIT_GM_READ_ANON = apiConfig.limits.rateLimitGmReadAnon;

function rateLimitIdentity(req: { ip: string; headers: Record<string, string | string[] | undefined> }): string {
  // Always use IP for rate-limit identity. Do NOT derive a bucket from an
  // unverified cookie — an attacker can rotate the cookie value at will to
  // create infinite rate-limit buckets and bypass DoS protection.
  return "ip:" + req.ip;
}

// For pre-auth nonce endpoints, IP-only keying is spoofable via X-Forwarded-For
// if TRUST_PROXY=true without a CIDR allowlist. Binding to the queried address
// adds a second axis: an attacker must rotate addresses to scale a flood, and
// each address gets its own per-minute bucket.
function nonceTargetAddress(req: { query?: unknown }): string | null {
  const q = req.query as Record<string, unknown> | undefined;
  const raw = q?.address;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length < 4 || trimmed.length > 150) return null;
  return trimmed;
}

// Rate limiting itself lives in server-helpers.ts (registerPostAuthRateLimit).

// --- Prisma & Admin ---

const prisma = new PrismaClient();

// Admin auth centralized in ./admin-auth.ts (timing-safe, shared with support plugin).

// --- Ops Events ---

async function recordOpsEvent(type: string, severity: string, message: string, data: Record<string, unknown> = {}) {
  try {
    await prisma.opsEvent.create({ data: { type, severity, message, data: data as never } });
  } catch (e) { console.error("recordOpsEvent DB error:", (e).message || String(e)); }
}

async function snapshotMetrics() {
  try {
    const snap = metrics.snapshot();
    const now = Date.now();
    const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    const redisOk = await sharedCache.set("health:ping", { ts: now }, 5000).then(() => true).catch(() => false);
    const circuits = Object.fromEntries(Array.from(circuitBreakers.entries()).map(([k, v]) => [k, v.getStatus()]));
    const openCircuits = Object.values(circuits).filter((c: { state: string }) => c.state === "OPEN").length;
    const gm24h = await prisma.onchainGm.count({ where: { createdAt: { gte: new Date(now - 24 * 60 * 60 * 1000) } } }).catch(() => 0);
    const gm7d = await prisma.onchainGm.count({ where: { createdAt: { gte: new Date(now - 7 * 24 * 60 * 60 * 1000) } } }).catch(() => 0);
    const gm30d = await prisma.onchainGm.count({ where: { createdAt: { gte: new Date(now - 30 * 24 * 60 * 60 * 1000) } } }).catch(() => 0);
    const rpcErrors = Object.values(snap.errors.byChain).reduce((s, c) => s + c.rpc, 0);
    const pricingErrors = Object.values(snap.errors.byChain).reduce((s, c) => s + c.pricing, 0);
    const status = !dbOk ? "down" : openCircuits > 0 ? "degraded" : "ok";
    await prisma.systemMetricSnapshot.create({ data: { status, dbOk, redisOk, openCircuits, rpcErrors, pricingErrors, scanCount: snap.scans.total, gm24h, gm7d, gm30d } });
    await prisma.systemMetricSnapshot.deleteMany({ where: { createdAt: { lt: new Date(now - 7 * 24 * 60 * 60 * 1000) } } });
    await prisma.opsEvent.deleteMany({ where: { createdAt: { lt: new Date(now - 7 * 24 * 60 * 60 * 1000) } } });
  } catch (e) { console.error("snapshotMetrics DB error:", (e).message || String(e)); }
}

// --- Middleware ---

await app.register(cors, {
  origin: apiConfig.cors.fastifyOrigin,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-admin-token"],
});

await app.register(compress, { global: true });

await app.register(helmet, {
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] } },
});

await app.register(cookie);

app.addHook("onRequest", async (req, reply) => {
  // CSRF protection: validate Origin/Referer on state-changing endpoints that use cookie auth.
  // Cookies with SameSite=None are vulnerable to cross-site form submissions.
  // This middleware ensures the request comes from the expected CORS_ORIGIN domain(s).
  // Rate-limiting intentionally lives in a separate hook registered after authPlugin below
  // so `req.user` is populated when the bucket is selected (audit 2026-06-05 P1-2).
  const method = req.method.toUpperCase();
  const path = req.url.split("?")[0] ?? "";
  if (requiresCsrfOriginCheck(method, path)) {
      // Fail fast in production if CORS_ORIGIN is not set — a missing origin
      // allowlist silently disables CSRF protection (fail-open).
      if (apiConfig.cors.origins.length === 0 && apiConfig.runtime.isProduction) {
        return reply.code(500).send({ error: "csrf_config_missing", message: "CORS_ORIGIN must be set in production." });
      }
      if (apiConfig.cors.origins.length > 0) {
      const allowedHosts = apiConfig.cors.origins
        .map(s => {
          try { return new URL(s.trim()).hostname.toLowerCase(); } catch { return s.trim().toLowerCase(); }
        });
      const hostOf = (raw: string | undefined): string | null => {
        if (!raw) return null;
        try { return new URL(raw).hostname.toLowerCase(); } catch { return null; }
      };
      const originHost = hostOf(req.headers.origin as string | undefined);
      const refererHost = hostOf(req.headers.referer as string | undefined);
      const allowed = (originHost && allowedHosts.includes(originHost)) ||
                      (refererHost && allowedHosts.includes(refererHost));
      // Dev-bypass is explicit: only when running tests. NODE_ENV unset in prod must NOT
      // fail open.
      const allowDevBypass = apiConfig.runtime.isTest;
      if (!allowed && !allowDevBypass) {
        return reply.code(403).send({ error: "csrf_origin_mismatch", message: "Origin not in allowlist" });
      }
      }
  }
});

// --- Core Plugins ---

await authPlugin(app, prisma, sharedCache);
// Register the rate-limit hook AFTER authPlugin so `req.user` is populated
// when the bucket is selected. Before this fix, the hook was registered
// before authPlugin (server.ts:233, pre-refactor) and every authenticated
// request was treated as anonymous, hitting the stricter 60/min gm_read
// limit instead of the authenticated 300/min bucket (audit 2026-06-05 P1-2).
registerPostAuthRateLimit(app, {
  sharedCache,
  metrics,
  rateLimits: {
    scan: RATE_LIMIT_SCAN,
    scanAnon: RATE_LIMIT_SCAN_ANON,
    auth: RATE_LIMIT_AUTH,
    leaderboard: RATE_LIMIT_LEADERBOARD,
    catchAll: RATE_LIMIT_CATCH_ALL,
    gmRead: RATE_LIMIT_GM_READ,
    gmReadAnon: RATE_LIMIT_GM_READ_ANON,
  },
  rateLimitIdentity,
  nonceTargetAddress,
});
await gamificationPlugin(app, prisma, isAdminAuthorized);
await supportPlugin(app, prisma);
// --- Health ---

app.get("/health", async () => ({
  status: "ok", service: "wcore-api", coreVersion: CORE_VERSION,
  uptimeSec: Math.round(process.uptime()), chainCount: chainList.length,
  // Circuit breaker states excluded from public endpoint (SEC-10).
  // Use admin /api/metrics/errors for detailed circuit info.
}));

app.get("/api/me/plan", async (req, reply) => {
  if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
  const plan = await getUserPlan(req.user.id);
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS["free"]!;
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const scansUsedToday = await prisma.walletScan.count({ where: { userId: req.user.id, createdAt: { gte: today } } }).catch(() => 0);
  const resetAt = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const remaining = Math.max(0, limits.maxScansPerDay - scansUsedToday);
  return { plan, limits, scansUsedToday, scansRemainingToday: remaining, scanLimitResetAt: resetAt };
});

// --- Helpers for plugins ---

const MAX_CUSTOM_TOKENS = 100;

async function resolveCustomTokens(userId: string | undefined, requestTokens: unknown): Promise<string[]> {
  const tokens = new Set<string>();
  if (Array.isArray(requestTokens)) {
    for (const token of requestTokens) {
      if (validateCustomToken(token)) tokens.add(token.trim().toLowerCase());
      if (tokens.size >= MAX_CUSTOM_TOKENS) break;
    }
  }
  if (userId && tokens.size < MAX_CUSTOM_TOKENS) {
    try {
      const persisted = await prisma.customToken.findMany({ where: { userId }, select: { contract: true }, take: MAX_CUSTOM_TOKENS });
      for (const token of persisted) {
        if (validateCustomToken(token.contract)) tokens.add(token.contract.trim().toLowerCase());
        if (tokens.size >= MAX_CUSTOM_TOKENS) break;
      }
    } catch (e) { console.error("customToken findMany DB error:", (e).message || String(e)); }
  }
  return [...tokens];
}

// --- Feature Plugins ---

await scanPlugin(app, { prisma, sharedCache, getCircuitBreaker, validateChains, resolveCustomTokens, buildChainScan, getScanLimit, MAX_CHAINS_PER_SCAN, ANONYMOUS_MAX_CHAINS_PER_SCAN });
await adminPlugin(app, { prisma, sharedCache, circuitBreakers, isAdminAuthorized, recordOpsEvent, CORE_VERSION });
await walletPlugin(app, { prisma, validateCustomToken });
await cexPlugin(app, { prisma, sharedCache });
await chainsPlugin(app, { circuitBreakers, cache: sharedCache });
await metricsPlugin(app, { getCircuitBreaker, isAdminAuthorized });

// Gsheet bridge: expose /api/gsheet/cache/get to GAS for delegated reads of
// the shared cache (Redis or in-memory). Gated by GSHEET_API_TOKEN so envs
// without the token keep their existing route set untouched. The wrapper
// narrows sharedCache.get<T>(): T | undefined -> string | null to match the
// plugin's expected cacheStore contract.
const gsheetApiToken = apiConfig.integrations.gsheetApiToken;
if (gsheetApiToken) {
  // v0.3.x: WCT Stake dynamic [Lock] → [Flex] determination via lockUntil query.
  // Inject the production fetcher (from @wcore/core) into the gsheet plugin.
  try {
    const core = await import("@wcore/core");
    if (typeof core.getWCTStakeLockStatus === "function") {
      const { injectWCTStakeLockStatusFetcher } = await import("./plugins/gsheet.js");
      injectWCTStakeLockStatusFetcher(async (userAddress, rpcLike, endpoint) => {
        try {
          const WCT_STAKE = "0x521b4c065bbdbe3e20b3727340730936912dfa46";
          // keccak256("lockUntil(address)")[:4]
          const data = "0x025b22f4" + userAddress.toLowerCase().replace(/^0x/, "").padStart(64, "0");
          await rpcLike.ethCall(endpoint, WCT_STAKE, data);
          return await core.getWCTStakeLockStatus(rpcLike, endpoint, userAddress);
        } catch {
          return "flex" as const;
        }
      });
    }
  } catch {
    // @wcore/core not importable in this context (tests, etc.) — fall back to
    // registry-based static [Lock] determination.
  }
  await gsheetPlugin(app, {
    token: gsheetApiToken,
    cache: sharedCache,
    cacheStore: {
      get: async (key: string): Promise<string | null> => {
        const v = await sharedCache.get<string>(key);
        return v ?? null;
      },
    },
    cacheWriter: {
      set: async (key: string, value: unknown, ttlMs: number) => {
        await sharedCache.set(key, value, ttlMs);
      },
      get: async (key: string) => {
        return await sharedCache.get<unknown>(key);
      },
    },
    stockPortfolioProvider: async ({ fresh }) => {
      const ownerAddress = apiConfig.integrations.gsheetOwnerAddress;
      if (!ownerAddress) throw new Error("GSHEET_OWNER_ADDRESS is not configured");
      const user = await prisma.user.findFirst({
        where: { address: { equals: ownerAddress, mode: "insensitive" } },
        select: {
          id: true,
          address: true,
          cexAccounts: {
            where: { provider: "bitpanda" },
            orderBy: { createdAt: "asc" },
            include: { holdings: { where: { bucket: "stocks" }, orderBy: { symbol: "asc" } } },
          },
        },
      });
      const account = user?.cexAccounts[0];
      if (!user || !account) throw new Error("Configured GSheet owner has no Bitpanda account");
      const service = new CanonicalStockService({ cache: sharedCache });
      const holdings = account.holdings.map((holding) => ({
        symbol: holding.symbol,
        balance: holding.balance,
        updatedAt: holding.updatedAt,
      }));
      const top = await service.getTopMarketCapSnapshot(5_000, { fresh });
      const heldPrices = {} as Awaited<ReturnType<CanonicalStockService["getPricesForBitpandaSymbols"]>>;
      for (let index = 0; index < holdings.length; index += 50) {
        Object.assign(heldPrices, await service.getPricesForBitpandaSymbols(holdings.slice(index, index + 50).map((holding) => holding.symbol)));
      }
      return buildGsheetStockPortfolioSnapshot({
        generatedAt: new Date().toISOString(),
        ownerAddress: user.address.toLowerCase(),
        rankedRows: top.rows,
        holdings,
        holdingsStale: account.lastSyncStatus === "error",
        heldPrices,
      });
    },
    cryptoPortfolioProvider: async ({ fresh }) => {
      const service = new CanonicalCryptoService({ cache: sharedCache });
      const snapshot = await service.getListingSnapshot(5_000, { fresh });
      return {
        ok: true,
        generatedAt: snapshot.generatedAt,
        rows: snapshot.rows.map((row) => ({
          canonicalSymbol: row.symbol,
          rank: row.rank,
          name: row.name,
          priceEur: row.priceEur,
          marketCapEur: row.marketCapEur,
        })),
        stats: {
          ranked: snapshot.rows.length,
          unpriced: 0,
        },
      };
    },
  });

  // --- Public CMC pages (no auth) ---

  app.get("/api/cmc/crypto", async (req, reply) => {
    const fresh = String((req.query as Record<string, unknown>)?.fresh || "") === "true";
    try {
      const service = new CanonicalCryptoService({ cache: sharedCache });
      const snapshot = await service.getListingSnapshot(5_000, { fresh });
      return {
        ok: true,
        generatedAt: snapshot.generatedAt,
        stale: snapshot.stale,
        rows: snapshot.rows.map(toCryptoMarketCapRow),
      };
    } catch (e) {
      app.log.warn({ err: e instanceof Error ? e.message : String(e) }, "cmc crypto failed");
      return reply.code(503).send({ error: "cmc_crypto_unavailable" });
    }
  });

  app.get("/api/cmc/stocks", async (req, reply) => {
    const fresh = String((req.query as Record<string, unknown>)?.fresh || "") === "true";
    try {
      const service = new CanonicalStockService({ cache: sharedCache });
      const snapshot = await service.getTopMarketCapSnapshot(5_000, { fresh });
      return {
        ok: true,
        generatedAt: snapshot.generatedAt,
        stale: snapshot.stale,
        rows: snapshot.rows.map(toStockMarketCapRow),
      };
    } catch (e) {
      app.log.warn({ err: e instanceof Error ? e.message : String(e) }, "cmc stocks failed");
      return reply.code(503).send({ error: "cmc_stocks_unavailable" });
    }
  });

}

// --- Re-exports for tests ---
export { app, prisma, sharedCache, validateChains, buildChainScan };

// --- Startup ---

// Warn at startup for EVM/SVM chains with <2 RPC endpoints. The consensus rule
// `votes*2 > total` cannot reach majority on a single endpoint, so a faulty RPC
// silently dictates results. CITREA is acknowledged in AGENTS.md; the others
// should grow a second public endpoint.
function warnSingleRpcChains(): void {
  const offenders: string[] = [];
  for (const chain of chainList) {
    if (chain.vm !== "EVM" && chain.vm !== "SVM" && chain.vm !== "TON") continue;
    const endpoints = chain.RPC?.ENDPOINTS ?? [];
    if (endpoints.length < 2) offenders.push(`${chain.key}(${endpoints.length})`);
  }
  if (offenders.length > 0) {
    app.log.warn(
      { count: offenders.length, chains: offenders },
      `[startup] ${offenders.length} EVM/SVM/TON chains have <2 RPC endpoints — consensus rule votes*2>total cannot reach majority`,
    );
  }
}

const isMainModule = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (!apiConfig.runtime.isTest && isMainModule) {
  try {
    warnSingleRpcChains();
    seedGmContracts(prisma).catch((e) => { console.error("seedGmContracts error:", (e).message || String(e)); });
    // Pre-load RealT registry into Redis at startup so scans can price RealT tokens
    // even if the RealT API blocks Railway IPs later.
    const realTSource = new RealTPriceSource(sharedCache);
    realTSource.getTokenPriceUsd({ key: "realt-dummy", chain: { key: "GNOSIS", vm: "EVM" } as any, contract: "0x0000000000000000000000000000000000000000", symbol: "" }).catch(() => { /* registry load failed, will retry on first RealT scan */ });
    await app.listen({ port: PORT, host: HOST });
    loadChainlist().catch((e) => { console.error("loadChainlist error:", (e).message || String(e)); });
    setInterval(() => snapshotMetrics().catch((e) => { console.error("snapshotMetrics interval error:", (e).message || String(e)); }), 300_000).unref();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
