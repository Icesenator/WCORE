import { after, mock, test } from "node:test";
import assert from "node:assert/strict";
import { getApiRateLimitBucket, requiresCsrfOriginCheck } from "./server-helpers.js";

// No dotenv loader: the production application is imported with local-only dependencies.
const originalEnv = { ...process.env };
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://local:local@127.0.0.1:1/local";
process.env.JWT_SECRET = "local-route-classification-test-only-secret";
for (const key of ["REDIS_URL", "REDIS_HOST", "GSHEET_API_TOKEN", "ZERION_API_KEY"]) delete process.env[key];
process.env.CORS_ORIGIN = "https://wcore.local";
const originalFetch = globalThis.fetch;
let providerCalls = 0;
globalThis.fetch = (async (input) => {
  // Module bootstrap loads the public chain registry; satisfy it locally.
  if (String(input) === "https://chainid.network/chains.json") return new Response("[]", { status: 200 });
  providerCalls++;
  throw new Error("Unexpected external provider call");
}) as typeof fetch;
const db = await import("@wcore/db");
mock.module("@wcore/db", { namedExports: { ...db, PrismaClient: class {
  scanJob = { deleteMany: async () => ({ count: 0 }), findMany: async () => [] };
  scamOverride = { findMany: async () => [] };
  notification = { deleteMany: async () => ({ count: 0 }) };
  $queryRawUnsafe = async () => [];
  $disconnect = async () => {};
} } });
const { app, prisma, sharedCache } = await import("./server.js");
await app.ready();
// Bootstrap quietly as tests, but exercise the actual non-test CSRF guard.
process.env.NODE_ENV = "development";
after(async () => {
  await app.close();
  await prisma.$disconnect();
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

for (const url of ["/%61pi/scan", "/api/%73can", "/%61pi/%73can?next=%2Fapi%2Fauth%2Flogin", "/api/scan?text=%ZZ"]) {
  test(`real app rejects hostile-origin scan: ${url}`, async () => {
    const response = await app.inject({ method: "POST", url, headers: { origin: "https://hostile.local" }, payload: {} });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error, "csrf_origin_mismatch");
    assert.equal(providerCalls, 0);
    const accepted = await app.inject({ method: "POST", url, headers: { origin: "https://wcore.local" }, payload: {} });
    assert.equal(accepted.statusCode, 400);
    assert.equal(accepted.json().error, "invalid_address");
  });
}

for (const url of ["/%61pi/scan/async/missing", "/api/%73can/async/missing", "/api/scan/%61sync/missing"]) {
  test(`real app enforces scan polling bucket: ${url}`, async () => {
    await sharedCache.set("rate_limit:scan_poll:ip:127.0.0.1", 600, 60_000);
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 429);
    assert.equal(response.json().error, "rate_limited");
    assert.equal(providerCalls, 0);
  });
}

test("real app preserves nonce-address rate-limit identity across encoded paths", async () => {
  const address = "0x4200000000000000000000000000000000000004";
  await sharedCache.set(`rate_limit:auth:ip:127.0.0.1|${address}`, 1_000_000, 60_000);
  for (const url of [`/api/auth/nonce?address=${address}`, `/%61pi/%61uth/nonce?address=${address}`, `/api/wallets/%6eonce?address=${address}`]) {
    assert.equal((await app.inject({ method: "GET", url })).statusCode, 429, url);
  }
});

test("real app keeps legitimate encoded queries, public endpoints and router errors", async () => {
  assert.equal((await app.inject({ method: "GET", url: "/health?next=%2F%ZZ" })).statusCode, 200);
  const allowed = await app.inject({ method: "POST", url: "/api/%73can?next=%2Fapi%2Fgsheet%2F&text=%ZZ", headers: { origin: "https://wcore.local" }, payload: {} });
  assert.equal(allowed.statusCode, 400); // Business validation, not CSRF or providers.
  const login = await app.inject({ method: "POST", url: "/%61pi/auth/log%69n?next=%2F", payload: {} });
  assert.equal(login.statusCode, 200); // Honeypot login response; public exemption remains intact.
  assert.equal((await app.inject({ method: "GET", url: "/api/not-a-route" })).statusCode, 404);
  assert.equal((await app.inject({ method: "GET", url: "/api/%ZZ" })).statusCode, 400);
  assert.equal(providerCalls, 0);
});

test("canonical classification does not decode query strings or encoded separators into exemptions", () => {
  assert.equal(getApiRateLimitBucket("POST", "/%61pi/%73can?next=%ZZ"), "scan");
  assert.equal(getApiRateLimitBucket("GET", "/api/%61uth/nonce"), "auth");
  assert.equal(getApiRateLimitBucket("GET", "/api/%67m/status"), "gm_read");
  assert.equal(getApiRateLimitBucket("POST", "/api/%67m/onchain"), "gm");
  assert.equal(requiresCsrfOriginCheck("POST", "/%61pi/gsheet/cache/get?key=%ZZ"), false);
  for (const path of ["/api/auth%2flogin", "/api/gsheet%2fcache/get", "/api/%2567sheet/cache/get", "/%ZZpi/scan"]) {
    assert.equal(requiresCsrfOriginCheck("POST", path), true, path);
  }
  assert.equal(getApiRateLimitBucket("POST", "/%ZZpi/scan"), "catch_all");
});
