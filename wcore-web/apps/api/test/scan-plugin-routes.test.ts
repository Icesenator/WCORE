// Route tests for the scan plugin (sync / batch / async + job polling).
// Runs WITHOUT a database, Redis, or network:
//  - deps are injected (prisma stub, MemoryCacheStore, fake circuit breakers)
//  - engine calls use a fake chain key ("X_TEST_FAKE") that getWalletAssets
//    rejects instantly with "unknown chain" (no RPC involved)
//  - cache-served paths use seeded scan:v2:* entries so the engine is never hit
//
// Run: node --import tsx --test apps/api/test/scan-plugin-routes.test.ts
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { MemoryCacheStore } from "@wcore/core";
import type { CircuitBreaker, WalletAssets } from "@wcore/core";
import type { PrismaClient } from "@wcore/db";
import { scanPlugin, type ScanPluginDeps } from "../src/plugins/scan.js";
import { buildChainScan } from "../src/server-helpers.js";

const FAKE_CHAIN = "X_TEST_FAKE";
const ADDR_A = "0x1111111111111111111111111111111111111111";
const ADDR_B = "0x2222222222222222222222222222222222222222";

// --- Test doubles ----------------------------------------------------------

interface FakeBreaker {
  allow: boolean;
  failures: number;
  successes: number;
}

const breakers = new Map<string, FakeBreaker>();
function getFakeBreaker(chain: string): FakeBreaker {
  let b = breakers.get(chain);
  if (!b) { b = { allow: true, failures: 0, successes: 0 }; breakers.set(chain, b); }
  return b;
}

const walletScanCreates: Array<{ userId: string; address: string }> = [];

const prismaStub = {
  walletScan: {
    create: async (args: { data: { userId: string; address: string } }) => {
      walletScanCreates.push({ userId: args.data.userId, address: args.data.address });
      return { id: "stub" };
    },
  },
} as unknown as PrismaClient;

const sharedCache = new MemoryCacheStore();

function makeDeps(): ScanPluginDeps {
  return {
    prisma: prismaStub,
    sharedCache,
    getCircuitBreaker: (chain: string) => {
      const fake = getFakeBreaker(chain);
      return {
        allowRequest: () => fake.allow,
        onFailure: () => { fake.failures++; },
        onSuccess: () => { fake.successes++; },
        getStatus: () => ({ state: fake.allow ? "CLOSED" : "OPEN" }),
      } as unknown as CircuitBreaker;
    },
    // Accept any chain string (uppercased) so the fake chain reaches the engine
    // dispatch, which rejects it deterministically without network.
    validateChains: (input: unknown) => {
      if (input == null) return { ok: true, chains: [FAKE_CHAIN] };
      if (!Array.isArray(input) || input.length === 0) return { ok: false, error: "chains must be a non-empty array" };
      return { ok: true, chains: input.map((c) => String(c).toUpperCase()) };
    },
    resolveCustomTokens: async () => [],
    buildChainScan,
    getScanLimit: async () => 120,
    MAX_CHAINS_PER_SCAN: 120,
    ANONYMOUS_MAX_CHAINS_PER_SCAN: 20,
  };
}

function seedableAssets(chain: string, valueEur: number): WalletAssets & { ts: number } {
  return {
    chain,
    chainName: chain,
    native: { symbol: "ETH", balance: 1, priceEur: valueEur, valueEur },
    tokens: [],
    errors: [],
    totalValueEur: valueEur,
    scanMs: 5,
    ts: Date.now(),
  } as unknown as WalletAssets & { ts: number };
}

function scanCacheKey(address: string, chain: string): string {
  return `scan:v2:${address.toLowerCase()}:${chain.toLowerCase()}`;
}

async function pollJob(app: FastifyInstance, jobId: string, opts: { user?: string; remoteAddress?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.user) headers["x-test-user"] = opts.user;
  return app.inject({ method: "GET", url: `/api/scan/async/${jobId}`, headers, remoteAddress: opts.remoteAddress });
}

async function waitForJobSettled(app: FastifyInstance, jobId: string, opts: { user?: string } = {}): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 5000;
  for (;;) {
    const res = await pollJob(app, jobId, opts);
    assert.equal(res.statusCode, 200, `poll failed: ${res.body}`);
    const body = res.json() as Record<string, unknown>;
    if (body.status !== "running") return body;
    if (Date.now() > deadline) throw new Error(`job ${jobId} still running after 5s`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

// --- App setup ---------------------------------------------------------------

let app: FastifyInstance;

before(async () => {
  app = Fastify({ logger: false });
  app.decorateRequest("user", undefined);
  // Simulated auth: the real auth hook is tested elsewhere; here a header
  // drives req.user so we can exercise ownership rules deterministically.
  app.addHook("onRequest", async (req) => {
    const u = req.headers["x-test-user"];
    if (typeof u === "string" && u) {
      (req as unknown as { user: { id: string; address: string } }).user = { id: u, address: ADDR_A };
    }
  });
  await app.register(async (instance) => scanPlugin(instance, makeDeps()));
  await app.ready();
});

after(async () => {
  await app.close();
});

// --- POST /api/scan (sync) ---------------------------------------------------

describe("POST /api/scan", () => {
  test("rejects malformed body with 400 invalid_body", async () => {
    const res = await app.inject({ method: "POST", url: "/api/scan", payload: { unknownField: true } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "invalid_body");
  });

  test("rejects invalid address with 400 invalid_address", async () => {
    const res = await app.inject({ method: "POST", url: "/api/scan", payload: { address: "not-an-address", chains: [FAKE_CHAIN] } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "invalid_address");
  });

  test("enforces anonymous chain limit with 400 too_many_chains", async () => {
    const chains = Array.from({ length: 21 }, (_, i) => `CHAIN_${i}`);
    const res = await app.inject({ method: "POST", url: "/api/scan", payload: { address: ADDR_A, chains } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "too_many_chains");
  });

  test("returns 503 circuit_open when all requested chains have open breakers", async () => {
    getFakeBreaker("X_OPEN_CHAIN").allow = false;
    const res = await app.inject({ method: "POST", url: "/api/scan", payload: { address: ADDR_A, chains: ["X_OPEN_CHAIN"] } });
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().error, "circuit_open");
  });

  test("engine failure yields a chain entry with errors and trips the breaker", async () => {
    const breaker = getFakeBreaker(FAKE_CHAIN);
    const failuresBefore = breaker.failures;
    const res = await app.inject({ method: "POST", url: "/api/scan", payload: { address: ADDR_A, chains: [FAKE_CHAIN] } });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.chains.length, 1);
    assert.equal(body.chains[0].chainKey, FAKE_CHAIN);
    assert.ok(body.chains[0].errors.some((e: { message: string }) => e.message.includes("unknown chain")));
    assert.equal(body.totals.valueEur, 0);
    assert.ok(breaker.failures > failuresBefore, "breaker.onFailure should have been called");
  });

  test("serves a fresh cached result without calling the engine (mget path)", async () => {
    await sharedCache.set(scanCacheKey(ADDR_A, FAKE_CHAIN), seedableAssets(FAKE_CHAIN, 2000));
    const res = await app.inject({ method: "POST", url: "/api/scan", payload: { address: ADDR_A, chains: [FAKE_CHAIN] } });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.chains.length, 1);
    assert.equal(body.chains[0].errors.length, 0, "cached result should carry no engine errors");
    assert.equal(body.totals.valueEur, 2000);
    await sharedCache.delete(scanCacheKey(ADDR_A, FAKE_CHAIN));
  });

  test("forceRefresh bypasses the scan result cache", async () => {
    await sharedCache.set(scanCacheKey(ADDR_A, FAKE_CHAIN), seedableAssets(FAKE_CHAIN, 2000));
    const res = await app.inject({ method: "POST", url: "/api/scan", payload: { address: ADDR_A, chains: [FAKE_CHAIN], forceRefresh: true } });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(
      body.chains[0].errors.some((e: { message: string }) => e.message.includes("unknown chain")),
      "forceRefresh must hit the engine, not the cache",
    );
    await sharedCache.delete(scanCacheKey(ADDR_A, FAKE_CHAIN));
  });

  test("persists walletScan history fire-and-forget for authenticated users", async () => {
    walletScanCreates.length = 0;
    const res = await app.inject({ method: "POST", url: "/api/scan", payload: { address: ADDR_A, chains: [FAKE_CHAIN] }, headers: { "x-test-user": "user-history" } });
    assert.equal(res.statusCode, 200);
    // create is fire-and-forget: give the microtask queue a tick to flush
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(walletScanCreates.length, 1);
    assert.equal(walletScanCreates[0]!.userId, "user-history");
    assert.equal(walletScanCreates[0]!.address, ADDR_A);
  });

  test("does not persist history for anonymous users", async () => {
    walletScanCreates.length = 0;
    const res = await app.inject({ method: "POST", url: "/api/scan", payload: { address: ADDR_A, chains: [FAKE_CHAIN] } });
    assert.equal(res.statusCode, 200);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(walletScanCreates.length, 0);
  });
});

// --- POST /api/scan/batch ----------------------------------------------------

describe("POST /api/scan/batch", () => {
  test("rejects malformed body with 400 invalid_body", async () => {
    const res = await app.inject({ method: "POST", url: "/api/scan/batch", payload: { addresses: [] } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "invalid_body");
  });

  test("rejects an invalid address in the list with 400 (not a 500)", async () => {
    const res = await app.inject({ method: "POST", url: "/api/scan/batch", payload: { addresses: [ADDR_A, "garbage"], chains: [FAKE_CHAIN] } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "invalid_address");
  });

  test("enforces anonymous chain limit with 400 too_many_chains", async () => {
    const chains = Array.from({ length: 21 }, (_, i) => `CHAIN_${i}`);
    const res = await app.inject({ method: "POST", url: "/api/scan/batch", payload: { addresses: [ADDR_A], chains } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "too_many_chains");
  });

  test("returns 503 circuit_open when all chains have open breakers", async () => {
    getFakeBreaker("X_OPEN_CHAIN").allow = false;
    const res = await app.inject({ method: "POST", url: "/api/scan/batch", payload: { addresses: [ADDR_A], chains: ["X_OPEN_CHAIN"] } });
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().error, "circuit_open");
  });

  test("returns per-wallet results with engine errors surfaced per chain", async () => {
    const res = await app.inject({ method: "POST", url: "/api/scan/batch", payload: { addresses: [ADDR_A, ADDR_B], chains: [FAKE_CHAIN] } });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.wallets.length, 2);
    for (const wallet of body.wallets) {
      assert.equal(wallet.chains.length, 1);
      assert.ok(wallet.chains[0].errors.length > 0, "fake chain must surface an error");
      assert.equal(wallet.totals.valueEur, 0);
    }
  });

  test("serves cached EVM results without engine calls (batch mget path)", async () => {
    // BASE is a real EVM chain: with every (addr, chain) pair cached, the
    // uncached-pairs list is empty and getEvmWalletsAssets is never invoked,
    // so no network access happens.
    await sharedCache.set(scanCacheKey(ADDR_A, "BASE"), seedableAssets("BASE", 100));
    await sharedCache.set(scanCacheKey(ADDR_B, "BASE"), seedableAssets("BASE", 250));
    const res = await app.inject({ method: "POST", url: "/api/scan/batch", payload: { addresses: [ADDR_A, ADDR_B], chains: ["BASE"] } });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    const byAddr = new Map<string, { totals: { valueEur: number } }>(
      (body.wallets as Array<{ address: string; totals: { valueEur: number } }>).map((w) => [w.address, w]),
    );
    assert.equal(byAddr.get(ADDR_A)!.totals.valueEur, 100);
    assert.equal(byAddr.get(ADDR_B)!.totals.valueEur, 250);
    await sharedCache.delete(scanCacheKey(ADDR_A, "BASE"));
    await sharedCache.delete(scanCacheKey(ADDR_B, "BASE"));
  });

  test("serves cached non-EVM results and scans the rest (mixed cache state)", async () => {
    await sharedCache.set(scanCacheKey(ADDR_A, FAKE_CHAIN), seedableAssets(FAKE_CHAIN, 75));
    const res = await app.inject({ method: "POST", url: "/api/scan/batch", payload: { addresses: [ADDR_A, ADDR_B], chains: [FAKE_CHAIN] } });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    const byAddr = new Map<string, { totals: { valueEur: number }; chains: Array<{ errors: unknown[] }> }>(
      (body.wallets as Array<{ address: string; totals: { valueEur: number }; chains: Array<{ errors: unknown[] }> }>).map((w) => [w.address, w]),
    );
    assert.equal(byAddr.get(ADDR_A)!.totals.valueEur, 75, "wallet A served from cache");
    assert.ok(byAddr.get(ADDR_B)!.chains[0]!.errors.length > 0, "wallet B hit the engine and errored");
    await sharedCache.delete(scanCacheKey(ADDR_A, FAKE_CHAIN));
  });
});

// --- POST /api/scan/async + GET /api/scan/async/:jobId -----------------------

describe("async scan job lifecycle", () => {
  test("rejects invalid address with 400", async () => {
    const res = await app.inject({ method: "POST", url: "/api/scan/async", payload: { address: "nope", chains: [FAKE_CHAIN] } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "invalid_address");
  });

  test("returns 503 circuit_open when all chains have open breakers", async () => {
    getFakeBreaker("X_OPEN_CHAIN").allow = false;
    const res = await app.inject({ method: "POST", url: "/api/scan/async", payload: { address: ADDR_A, chains: ["X_OPEN_CHAIN"] } });
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().error, "circuit_open");
  });

  test("creates a job, runs it to completion, and reports per-chain results", async () => {
    const res = await app.inject({ method: "POST", url: "/api/scan/async", payload: { address: ADDR_A, chains: [FAKE_CHAIN] } });
    assert.equal(res.statusCode, 200);
    const { jobId } = res.json() as { jobId: string };
    assert.ok(jobId, "jobId returned");

    const body = await waitForJobSettled(app, jobId);
    // The fake chain errors on every entry → 0 done → job status "error"
    assert.equal(body.status, "error");
    const progress = body.progress as { done: number; total: number };
    assert.equal(progress.total, 1);
    assert.equal(progress.done, 1);
    assert.ok((body.errors as string[]).some((e) => e.includes("unknown chain")));
  });

  test("mixes open-circuit chains (pre-errored) with scanned chains in one job", async () => {
    getFakeBreaker("X_OPEN_CHAIN").allow = false;
    const res = await app.inject({ method: "POST", url: "/api/scan/async", payload: { address: ADDR_A, chains: ["X_OPEN_CHAIN", FAKE_CHAIN] } });
    assert.equal(res.statusCode, 200);
    const { jobId } = res.json() as { jobId: string };
    const body = await waitForJobSettled(app, jobId);
    const progress = body.progress as { done: number; total: number };
    assert.equal(progress.total, 2);
    const chains = body.chains as Array<{ chainKey: string; errors: Array<{ message: string }> }>;
    const open = chains.find((c) => c.chainKey === "X_OPEN_CHAIN");
    assert.ok(open, "open-circuit chain present in results");
    assert.ok(open!.errors.some((e) => e.message.includes("circuit_open")));
  });

  test("GET unknown jobId returns 404", async () => {
    const res = await pollJob(app, "deadbeefdeadbeefdeadbeefdeadbeef");
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error, "job_not_found");
  });

  test("anonymous jobs are bound to the creator IP", async () => {
    const res = await app.inject({ method: "POST", url: "/api/scan/async", payload: { address: ADDR_A, chains: [FAKE_CHAIN] }, remoteAddress: "192.0.2.10" });
    assert.equal(res.statusCode, 200);
    const { jobId } = res.json() as { jobId: string };

    const wrongIp = await pollJob(app, jobId, { remoteAddress: "192.0.2.99" });
    assert.equal(wrongIp.statusCode, 404, "different IP must not read an anonymous job");

    const rightIp = await pollJob(app, jobId, { remoteAddress: "192.0.2.10" });
    assert.equal(rightIp.statusCode, 200, "creator IP can poll its job");
  });

  test("authenticated jobs require the owning user", async () => {
    const res = await app.inject({ method: "POST", url: "/api/scan/async", payload: { address: ADDR_A, chains: [FAKE_CHAIN] }, headers: { "x-test-user": "owner-1" } });
    assert.equal(res.statusCode, 200);
    const { jobId } = res.json() as { jobId: string };

    const anon = await pollJob(app, jobId);
    assert.equal(anon.statusCode, 404, "anonymous cannot read an authenticated job");

    const otherUser = await pollJob(app, jobId, { user: "intruder-2" });
    assert.equal(otherUser.statusCode, 404, "another user cannot read the job");

    const owner = await pollJob(app, jobId, { user: "owner-1" });
    assert.equal(owner.statusCode, 200, "owner can poll the job");
  });
});
