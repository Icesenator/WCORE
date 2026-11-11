// Route tests for the scan plugin (sync / batch / async + job polling).
// Runs WITHOUT a database, Redis, or network:
//  - deps are injected (prisma stub, MemoryCacheStore, fake circuit breakers)
//  - engine calls use a fake chain key ("X_TEST_FAKE") that getWalletAssets
//    rejects instantly with "unknown chain" (no RPC involved)
//  - cache-served paths use seeded scan:result:* entries so the engine is never hit
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
import { ownsScanJob, serializePollResult, type EnqueueScanJobInput, type ScanJobHandler, type ScanJobPollResult, type ScanJobQueue } from "../src/plugins/scan-job.js";

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

class MemoryScanJobQueue implements ScanJobQueue {
  private handler?: ScanJobHandler;
  private jobs = new Map<string, EnqueueScanJobInput & { status: "queued" | "running" | "done" | "error"; result?: ScanJobPollResult }>();

  start(handler: ScanJobHandler): void { this.handler = handler; }
  async stop(): Promise<void> { this.jobs.clear(); }

  async enqueue(input: EnqueueScanJobInput) {
    const row = { ...input, status: "queued" as const };
    this.jobs.set(input.jobId, row);
    queueMicrotask(async () => {
      const current = this.jobs.get(input.jobId);
      if (!current || !this.handler) return;
      current.status = "running";
      const outcome = await this.handler({
        job: { id: input.jobId, address: input.address, userId: input.userId ?? null, ip: input.ip ?? null, request: input.request, progress: input.progress, attempts: 1, leaseToken: `test:${input.jobId}` },
        signal: new AbortController().signal,
        publish: async (next) => { current.progress = structuredClone(next); return true; },
      });
      current.status = outcome.status;
      current.progress = outcome.progress;
      current.result = serializePollResult(input.jobId, input.address, outcome.status, outcome.progress);
    });
    return { ok: true as const, jobId: input.jobId };
  }

  async getOwned(jobId: string, userId: string | undefined, ip: string, pollTokenValid: boolean) {
    const row = this.jobs.get(jobId);
    if (!row || !ownsScanJob(row, userId, ip, pollTokenValid)) return null;
    return row.result ?? serializePollResult(row.jobId, row.address, row.status, row.progress);
  }
}

const scanJobQueue = new MemoryScanJobQueue();

// Engine double. It answers without network for ENGINE_CHAIN (a non-EVM chain for the
// plugin) and, while enabled, for BASE (the batched EVM path). Every other call goes to the
// real engine, so the fake chain used above keeps failing deterministically.
const ENGINE_CHAIN = "X_ENGINE_OK";
const TOKEN_A = "0x00000000000000000000000000000000000000aa";
const TOKEN_B = "0x00000000000000000000000000000000000000bb";
const engineCalls: Array<{ path: "single" | "evm-batch"; address: string; chain: string }> = [];
const fakeEvmEngine = { enabled: false };

interface EngineOptions { customTokens?: string[]; strictTokens?: boolean }

/** A wallet holding two tokens; a strict scan returns only the requested ones, as the real engine does. */
function fakeWallet(chain: string, opts: EngineOptions): WalletAssets {
  const all = [
    { symbol: "AAA", name: "Token A", contract: TOKEN_A, balance: 10, decimals: 18, priceEur: 1, valueEur: 10 },
    { symbol: "BBB", name: "Token B", contract: TOKEN_B, balance: 20, decimals: 18, priceEur: 1, valueEur: 20 },
  ];
  const strict = opts.strictTokens && opts.customTokens?.length ? new Set(opts.customTokens.map((token) => token.toLowerCase())) : null;
  const tokens = strict ? all.filter((token) => strict.has(token.contract)) : all;
  return {
    chain,
    chainName: chain,
    native: { symbol: "ETH", balance: 1, priceEur: 100, valueEur: 100 },
    tokens,
    errors: [],
    totalValueEur: 100 + tokens.reduce((sum, token) => sum + token.valueEur, 0),
    scanMs: 1,
  } as unknown as WalletAssets;
}

const testEngine: NonNullable<ScanPluginDeps["engine"]> = {
  getWalletAssets: (async (address: string, chain: string, opts: EngineOptions) => {
    if (chain !== ENGINE_CHAIN) return (await import("@wcore/core")).getWalletAssets(address, chain, opts as never);
    engineCalls.push({ path: "single", address, chain });
    return fakeWallet(chain, opts);
  }) as never,
  getEvmWalletsAssets: (async (addresses: string[], chain: string, opts: EngineOptions) => {
    if (!fakeEvmEngine.enabled) return (await import("@wcore/core")).getEvmWalletsAssets(addresses, chain, opts as never);
    for (const address of addresses) engineCalls.push({ path: "evm-batch", address, chain });
    return { wallets: addresses.map((address) => ({ address, assets: fakeWallet(chain, opts) })) };
  }) as never,
};

/** Tokens of the shared cache entry of (address, chain), or null when there is none. Cache writes are fire-and-forget. */
async function cachedTokenCount(address: string, chain: string): Promise<number | null> {
  await new Promise((resolve) => setTimeout(resolve, 20));
  const entry = await sharedCache.get<{ tokens: unknown[] }>(scanCacheKey(address, chain));
  return entry ? entry.tokens.length : null;
}

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
    // Comme en production : les jetons valides de la requete sont repris.
    resolveCustomTokens: async (_userId: string | undefined, requestTokens: unknown) => (Array.isArray(requestTokens) ? requestTokens.map(String) : []),
    buildChainScan,
    getScanLimit: async () => 120,
    MAX_CHAINS_PER_SCAN: 120,
    ANONYMOUS_MAX_CHAINS_PER_SCAN: 20,
    scanJobQueue,
    engine: testEngine,
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
  return `scan:result:${address.toLowerCase()}:${chain.toLowerCase()}`;
}

async function pollJob(app: FastifyInstance, jobId: string, opts: { user?: string; remoteAddress?: string; pollToken?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.user) headers["x-test-user"] = opts.user;
  if (opts.pollToken) headers["x-scan-poll-token"] = opts.pollToken;
  return app.inject({ method: "GET", url: `/api/scan/async/${jobId}`, headers, remoteAddress: opts.remoteAddress });
}

async function waitForJobSettled(app: FastifyInstance, jobId: string, opts: { user?: string; pollToken?: string } = {}): Promise<Record<string, unknown>> {
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
    const seeded = seedableAssets(FAKE_CHAIN, 2000);
    seeded.ts = Date.now() - 2 * 60 * 60 * 1000;
    await sharedCache.set(scanCacheKey(ADDR_A, FAKE_CHAIN), seeded);
    const res = await app.inject({ method: "POST", url: "/api/scan", payload: { address: ADDR_A, chains: [FAKE_CHAIN] } });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.chains.length, 1);
    assert.equal(body.chains[0].errors.length, 0, "cached result should carry no engine errors");
    assert.equal(body.totals.valueEur, 2000);
    assert.equal(body.chains[0].cachedAt, new Date(seeded.ts).toISOString(), "a cached result says when it was observed");
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

  test("a strict token scan is not served from the shared scan result cache", async () => {
    await sharedCache.set(scanCacheKey(ADDR_A, FAKE_CHAIN), seedableAssets(FAKE_CHAIN, 2000));
    const res = await app.inject({
      method: "POST",
      url: "/api/scan",
      payload: { address: ADDR_A, chains: [FAKE_CHAIN], strictTokens: true, customTokens: ["0x00000000000000000000000000000000000000aa"] },
    });
    assert.equal(res.statusCode, 200);
    assert.ok(
      res.json().chains[0].errors.some((e: { message: string }) => e.message.includes("unknown chain")),
      "a strict scan must hit the engine: the shared entry describes the whole wallet",
    );
    const kept = await sharedCache.get<{ totalValueEur: number }>(scanCacheKey(ADDR_A, FAKE_CHAIN));
    assert.equal(kept?.totalValueEur, 2000, "the shared entry is left as it was");
    await sharedCache.delete(scanCacheKey(ADDR_A, FAKE_CHAIN));
  });

  test("every scan result cache access goes through the strict-scan guard", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../src/plugins/scan.ts", import.meta.url), "utf8");
    assert.equal(/sharedCache\.set\(scanCacheKey/.test(source), false, "writes must use the guarded cache");
    assert.equal(/sharedCache\.mget<WalletAssets/.test(source), false, "reads must use the guarded cache");
    assert.equal((source.match(/scanResultCacheFor\(/g) || []).length, 3, "sync, batch and async scans each build their guard");
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
    const seededA = seedableAssets("BASE", 100);
    await sharedCache.set(scanCacheKey(ADDR_A, "BASE"), seededA);
    await sharedCache.set(scanCacheKey(ADDR_B, "BASE"), seedableAssets("BASE", 250));
    const res = await app.inject({ method: "POST", url: "/api/scan/batch", payload: { addresses: [ADDR_A, ADDR_B], chains: ["BASE"] } });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    const byAddr = new Map<string, { totals: { valueEur: number } }>(
      (body.wallets as Array<{ address: string; totals: { valueEur: number } }>).map((w) => [w.address, w]),
    );
    assert.equal(byAddr.get(ADDR_A)!.totals.valueEur, 100);
    assert.equal(byAddr.get(ADDR_B)!.totals.valueEur, 250);
    const walletA = (body.wallets as Array<{ address: string; chains: Array<{ cachedAt: string | null }> }>).find((w) => w.address === ADDR_A)!;
    assert.equal(walletA.chains[0]!.cachedAt, new Date(seededA.ts).toISOString(), "batch EVM path keeps the cache date");
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
    const wallets = body.wallets as Array<{ address: string; chains: Array<{ cachedAt: string | null }> }>;
    assert.equal(typeof wallets.find((w) => w.address === ADDR_A)!.chains[0]!.cachedAt, "string", "non-EVM cached result keeps its date");
    assert.equal(wallets.find((w) => w.address === ADDR_B)!.chains[0]!.cachedAt, null, "a result scanned now has no cache date");
    await sharedCache.delete(scanCacheKey(ADDR_A, FAKE_CHAIN));
  });
});

// --- Shared scan result cache and partial scans, on every path ---------------
//
// With an engine that succeeds, each path is driven through the same sequence: a strict
// token scan leaves no entry behind, a plain scan stores the whole wallet, and a later
// strict scan neither reads that entry nor replaces it.

describe("shared scan result cache and partial scans", () => {
  const strict = { strictTokens: true, customTokens: [TOKEN_A] };

  test("single scan: a strict scan is never stored nor served from the cache", async () => {
    engineCalls.length = 0;
    const scan = (extra: Record<string, unknown> = {}) => app.inject({ method: "POST", url: "/api/scan", payload: { address: ADDR_A, chains: [ENGINE_CHAIN], ...extra } });
    try {
      assert.equal((await scan(strict)).statusCode, 200);
      assert.equal(await cachedTokenCount(ADDR_A, ENGINE_CHAIN), null, "a successful strict scan stores nothing");
      assert.equal((await scan()).statusCode, 200);
      assert.equal(await cachedTokenCount(ADDR_A, ENGINE_CHAIN), 2, "the plain scan stores the whole wallet");
      assert.equal(engineCalls.length, 2);
      const partial = await scan(strict);
      assert.equal(partial.json().chains[0].tokens.length, 1, "the strict scan returns only the requested token");
      assert.equal(engineCalls.length, 3, "the strict scan went to the engine, not to the cache");
      assert.equal(await cachedTokenCount(ADDR_A, ENGINE_CHAIN), 2, "and left the whole-wallet entry in place");
      const plain = await scan();
      assert.equal(engineCalls.length, 3, "the plain scan is still answered from the cache");
      assert.equal(plain.json().chains[0].tokens.length, 2, "with the whole wallet");
    } finally {
      await sharedCache.delete(scanCacheKey(ADDR_A, ENGINE_CHAIN));
    }
  });

  test("single scan: custom tokens are answered only by an entry that looked them up", async () => {
    engineCalls.length = 0;
    const scan = (extra: Record<string, unknown> = {}) => app.inject({ method: "POST", url: "/api/scan", payload: { address: ADDR_A, chains: [ENGINE_CHAIN], ...extra } });
    try {
      await scan();
      await cachedTokenCount(ADDR_A, ENGINE_CHAIN);
      assert.equal(engineCalls.length, 1);
      await scan({ customTokens: [TOKEN_B] });
      assert.equal(engineCalls.length, 2, "the plain entry never looked up that token: rescan");
      await cachedTokenCount(ADDR_A, ENGINE_CHAIN);
      await scan({ customTokens: [TOKEN_B] });
      assert.equal(engineCalls.length, 2, "now covered: answered from the cache");
      const plain = await scan();
      assert.equal(engineCalls.length, 2, "a plain scan accepts the richer entry");
      assert.equal(plain.body.includes("scannedCustomTokens"), false, "the bookkeeping field never reaches the response");
    } finally {
      await sharedCache.delete(scanCacheKey(ADDR_A, ENGINE_CHAIN));
    }
  });

  for (const [label, chain, path] of [["EVM batch", "BASE", "evm-batch"], ["non-EVM batch", ENGINE_CHAIN, "single"]] as const) {
    test(`${label}: a strict scan is never stored nor served from the cache`, async () => {
      engineCalls.length = 0;
      fakeEvmEngine.enabled = true;
      const scan = (extra: Record<string, unknown> = {}) => app.inject({ method: "POST", url: "/api/scan/batch", payload: { addresses: [ADDR_A, ADDR_B], chains: [chain], ...extra } });
      try {
        assert.equal((await scan(strict)).statusCode, 200);
        assert.deepEqual([await cachedTokenCount(ADDR_A, chain), await cachedTokenCount(ADDR_B, chain)], [null, null], "a successful strict scan stores nothing");
        assert.equal((await scan()).statusCode, 200);
        assert.deepEqual([await cachedTokenCount(ADDR_A, chain), await cachedTokenCount(ADDR_B, chain)], [2, 2], "the plain scan stores both whole wallets");
        assert.equal(engineCalls.length, 4);
        assert.ok(engineCalls.every((call) => call.path === path), `this scenario runs on the ${label} path`);
        assert.equal((await scan(strict)).statusCode, 200);
        assert.equal(engineCalls.length, 6, "the strict scan went to the engine for both wallets");
        assert.deepEqual([await cachedTokenCount(ADDR_A, chain), await cachedTokenCount(ADDR_B, chain)], [2, 2], "and left both entries in place");
        const plain = await scan();
        assert.equal(engineCalls.length, 6, "the plain scan is still answered from the cache");
        for (const wallet of plain.json().wallets) assert.equal(wallet.chains[0].tokens.length, 2, "with the whole wallet");
      } finally {
        fakeEvmEngine.enabled = false;
        await sharedCache.delete(scanCacheKey(ADDR_A, chain));
        await sharedCache.delete(scanCacheKey(ADDR_B, chain));
      }
    });
  }

  test("async job: a strict scan is never stored, a plain one is", async () => {
    engineCalls.length = 0;
    const run = async (extra: Record<string, unknown> = {}) => {
      const res = await app.inject({ method: "POST", url: "/api/scan/async", payload: { address: ADDR_A, chains: [ENGINE_CHAIN], forceRefresh: true, ...extra } });
      assert.equal(res.statusCode, 200);
      const { jobId, pollToken } = res.json() as { jobId: string; pollToken: string };
      const settled = await waitForJobSettled(app, jobId, { pollToken });
      assert.equal(settled.status, "done", JSON.stringify(settled.errors));
    };
    try {
      await run(strict);
      assert.equal(await cachedTokenCount(ADDR_A, ENGINE_CHAIN), null, "a successful strict job stores nothing");
      await run();
      assert.equal(await cachedTokenCount(ADDR_A, ENGINE_CHAIN), 2, "the plain job stores the whole wallet");
      await run(strict);
      assert.equal(await cachedTokenCount(ADDR_A, ENGINE_CHAIN), 2, "a later strict job leaves it in place");
      assert.equal(engineCalls.length, 3);
    } finally {
      await sharedCache.delete(scanCacheKey(ADDR_A, ENGINE_CHAIN));
    }
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
    const { jobId, pollToken } = res.json() as { jobId: string; pollToken: string };
    assert.ok(jobId, "jobId returned");
    assert.match(pollToken, /^[A-Za-z0-9_-]{43}$/, "poll token returned in the body");

    const body = await waitForJobSettled(app, jobId, { pollToken });
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
    const { jobId, pollToken } = res.json() as { jobId: string; pollToken: string };
    const body = await waitForJobSettled(app, jobId, { pollToken });
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
    const { jobId, pollToken } = res.json() as { jobId: string; pollToken: string };

    const wrongIp = await pollJob(app, jobId, { remoteAddress: "192.0.2.99", pollToken });
    assert.equal(wrongIp.statusCode, 404, "different IP must not read an anonymous job");

    const rightIp = await pollJob(app, jobId, { remoteAddress: "192.0.2.10", pollToken });
    assert.equal(rightIp.statusCode, 200, "creator IP can poll its job");
  });

  test("anonymous jobs also require the poll token: the creator IP alone is not enough", async () => {
    const res = await app.inject({ method: "POST", url: "/api/scan/async", payload: { address: ADDR_A, chains: [FAKE_CHAIN] }, remoteAddress: "192.0.2.10" });
    assert.equal(res.statusCode, 200);
    const { jobId, pollToken } = res.json() as { jobId: string; pollToken: string };

    const noToken = await pollJob(app, jobId, { remoteAddress: "192.0.2.10" });
    assert.equal(noToken.statusCode, 404, "an IP match without the token must not read the job");
    assert.equal(noToken.json().error, "job_not_found", "same answer as an unknown job");

    const badToken = await pollJob(app, jobId, { remoteAddress: "192.0.2.10", pollToken: pollToken.slice(0, -1) + (pollToken.endsWith("A") ? "B" : "A") });
    assert.equal(badToken.statusCode, 404, "an altered token must not read the job");
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
