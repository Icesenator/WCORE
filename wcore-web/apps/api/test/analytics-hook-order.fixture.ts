// Ordre CSRF -> auth -> rate limit -> garde events>5, sur l'application réelle (server.ts).
// Aucun .env : variables factices en dur. Prisma simulé en mémoire, Redis absent (MemoryCacheStore),
// réseau sortant bloqué (seul chains.json est servi localement, comme route-classification.fixture.ts).
import { after, mock, test } from "node:test";
import assert from "node:assert/strict";

const originalEnv = { ...process.env };
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://local:local@127.0.0.1:1/local";
process.env.JWT_SECRET = "local-analytics-hook-order-test-only-secret";
for (const key of ["REDIS_URL", "REDIS_HOST", "GSHEET_API_TOKEN", "ZERION_API_KEY", "AUTH_ALLOW_BEARER"]) delete process.env[key];
process.env.CORS_ORIGIN = "https://wcore.local";
process.env.RATE_LIMIT_CATCH_ALL = "3";

const originalFetch = globalThis.fetch;
let providerCalls = 0;
globalThis.fetch = (async (input) => {
  if (String(input) === "https://chainid.network/chains.json") return new Response("[]", { status: 200 });
  providerCalls++;
  throw new Error("Unexpected external provider call");
}) as typeof fetch;

let upserts = 0;
const db = await import("@wcore/db");
mock.module("@wcore/db", { namedExports: { ...db, PrismaClient: class {
  scanJob = { deleteMany: async () => ({ count: 0 }), findMany: async () => [] };
  scamOverride = { findMany: async () => [] };
  notification = { deleteMany: async () => ({ count: 0 }) };
  funnelEventAggregate = { upsert: async () => { upserts++; return {}; }, groupBy: async () => [] };
  $queryRawUnsafe = async () => [];
  $disconnect = async () => {};
} } });

const { FunnelEventSchema } = await import("../src/schemas.js");
const { app, prisma, sharedCache } = await import("../src/server.js");
await app.ready();
process.env.NODE_ENV = "development"; // garde CSRF réelle (hors bypass test)

after(async () => {
  await app.close();
  await prisma.$disconnect();
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

// Compte les validations d'éléments : 0 prouve que safeParse n'a pas parcouru le tableau.
// Zod 4 runs each schema through its own _zod.run (no shared _parse hook): count the event validations there.
const eventSchemaInternals = (FunnelEventSchema as unknown as { _zod: { run: (...args: unknown[]) => unknown } })._zod;
const originalRun = eventSchemaInternals.run;
let elementParses = 0;
eventSchemaInternals.run = function (this: unknown, ...args: unknown[]) { elementParses++; return originalRun.apply(this, args); };

const EVENT = { event: "scan_started", campaign: "unknown", surface: "home", variant: "control", dimensions: {} };
const SIX = { events: Array.from({ length: 6 }, () => EVENT) };
const URL_ = "/api/analytics/events";
const counterKey = (ip: string) => `rate_limit:catch_all:ip:${ip}`;
async function counter(ip: string): Promise<unknown> { return (await sharedCache.get(counterKey(ip))) ?? null; }
function reset() { elementParses = 0; upserts = 0; }

test("CSRF: Origin hostile + events>5 => 403 CSRF, sans rate limit ni garde ni parse", async () => {
  reset();
  const ip = "10.0.0.1";
  const res = await app.inject({ method: "POST", url: URL_, headers: { origin: "https://hostile.local" }, payload: SIX, remoteAddress: ip });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error, "csrf_origin_mismatch");
  assert.equal(await counter(ip), null, "le rate limit ne doit pas avoir été consommé");
  assert.equal(elementParses, 0);
  assert.equal(upserts, 0);
});

test("CSRF: sans Origin ni Referer + events>5 => 403 CSRF", async () => {
  reset();
  const ip = "10.0.0.2";
  const res = await app.inject({ method: "POST", url: URL_, payload: SIX, remoteAddress: ip });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error, "csrf_origin_mismatch");
  assert.equal(await counter(ip), null);
  assert.equal(elementParses, 0);
});

test("Auth: route publique, anonyme ou cookie invalide => garde 400 invalid_body (pas 401), 0 parse", async () => {
  for (const [ip, cookie] of [["10.0.0.3", undefined], ["10.0.0.4", "wcore_access=forged.jwt.value"]] as const) {
    reset();
    const headers: Record<string, string> = { origin: "https://wcore.local" };
    if (cookie) headers.cookie = cookie;
    const res = await app.inject({ method: "POST", url: URL_, headers, payload: SIX, remoteAddress: ip });
    assert.equal(res.statusCode, 400, ip);
    assert.deepEqual(res.json(), { error: "invalid_body" });
    assert.equal(elementParses, 0, "la garde précède safeParse");
    assert.equal(upserts, 0);
    assert.equal(await counter(ip), 1, "le rate limit a été consommé avant la garde");
  }
});

test("Rate limit: quota 3 consommé par les requêtes refusées par la garde, puis 429 avant la garde", async () => {
  reset();
  const ip = "10.0.0.5";
  const codes: number[] = [];
  for (let i = 0; i < 5; i++) {
    const res = await app.inject({ method: "POST", url: URL_, headers: { origin: "https://wcore.local" }, payload: SIX, remoteAddress: ip });
    codes.push(res.statusCode);
    if (res.statusCode === 429) assert.equal(res.json().error, "rate_limited");
  }
  assert.deepEqual(codes, [400, 400, 400, 429, 429]);
  assert.equal(elementParses, 0);
  assert.equal(upserts, 0);
  assert.equal(providerCalls, 0);
});

test("Contrôle positif: 5 événements valides => 202, 5 upserts", async () => {
  reset();
  const ip = "10.0.0.6";
  const res = await app.inject({ method: "POST", url: URL_, headers: { origin: "https://wcore.local" }, payload: { events: Array.from({ length: 5 }, () => EVENT) }, remoteAddress: ip });
  assert.equal(res.statusCode, 202, res.body);
  assert.deepEqual(res.json(), { ok: true });
  assert.equal(elementParses, 5);
  assert.equal(upserts, 5);
});
