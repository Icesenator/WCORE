import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { registerGmOnchainRoutes } from "./gm-onchain.js";

const USER = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";
const CONTRACT = "0xc9fd9b0b3936916b12a91bacd2267a8750cd99ad";

function topicAddress(address: string): string {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
}

type MockUser = { id: string; address: string };

function buildApp(opts: { user?: MockUser | undefined } = {}): FastifyInstance {
  const app = Fastify();
  // Fastify expects `req.user` to be a decorated property. Mirror what
  // authPlugin does so the GM handlers can read it without importing JWT.
  app.decorateRequest("user", undefined);
  if (opts.user) {
    const user = opts.user;
    app.addHook("onRequest", async (req) => {
      (req as unknown as { user: MockUser }).user = user;
    });
  }
  return app;
}

async function registerRoutes(app: FastifyInstance) {
  await registerGmOnchainRoutes(app, {} as never, {
    prisma: {} as never,
    startOfUtcDay: (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
    getChainRpc: () => "https://rpc.test",
    getChainRpcs: () => ["https://rpc.test"],
    checkStreakBadges: async () => {},
    addReferralBonus: async () => {},
    isAdminAuthorized: () => false,
    rpcFetch: async () => ({}),
    FACTORIES: { moonriver: { address: "0x5472f231a017ce1f03ccdfb2325a7d6a90b07de1", chainId: 1285 } },
    CONTRACT_DEPLOYED_EVENT: "0x33c981baba081f8fd2c52ac6ad1ea95b6814b4376640f55689051f6584729688",
    extractDeployedContractAddresses: () => [],
    getChainMaxLogRange: () => 1024,
    GM_EVENT_SIG: "0x1374bba5cce7233cce0d4275e8dd0bc1b0ef510fb043198247fc3cb179f8189d",
  });
}

test("status-onchain respects chain MAX_LOG_RANGE when scanning GM logs", async () => {
  const originalFetch = globalThis.fetch;
  const logRanges: Array<{ from: number; to: number }> = [];

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string; params?: unknown[] };
    if (body.method === "eth_call") {
      const call = (body.params?.[0] ?? {}) as { data?: string };
      if (call.data === "0x9399869d") {
        return Response.json({ jsonrpc: "2.0", id: 1, result: "0x1" });
      }
      if (call.data?.startsWith("0x474da79a")) {
        return Response.json({ jsonrpc: "2.0", id: 1, result: topicAddress(CONTRACT) });
      }
    }
    if (body.method === "eth_blockNumber") {
      return Response.json({ jsonrpc: "2.0", id: 2, result: "0x10000" });
    }
    if (body.method === "eth_getLogs") {
      const filter = (body.params?.[0] ?? {}) as { fromBlock: string; toBlock: string };
      logRanges.push({ from: parseInt(filter.fromBlock, 16), to: parseInt(filter.toBlock, 16) });
      return Response.json({ jsonrpc: "2.0", id: 1, result: [] });
    }
    return Response.json({ jsonrpc: "2.0", id: 1, result: null });
  }) as typeof fetch;

  try {
    const app = buildApp({ user: { id: "u1", address: USER } });
    await registerRoutes(app);

    const res = await app.inject({
      method: "GET",
      url: `/api/gm/status-onchain?chain=moonriver&address=${USER}`,
    });

    assert.equal(res.statusCode, 200);
    assert.ok(logRanges.length > 0, "expected an eth_getLogs call");
    for (const range of logRanges) {
      assert.ok(range.to - range.from <= 1024, `range ${range.from}..${range.to} exceeds 1024`);
    }
    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("status-onchain returns 401 when no authenticated user is attached", async () => {
  const app = buildApp();
  await registerRoutes(app);

  const res = await app.inject({
    method: "GET",
    url: "/api/gm/status-onchain?chain=moonriver&address=0x0000000000000000000000000000000000000001",
  });

  assert.equal(res.statusCode, 401);
  const body = res.json() as { error?: string };
  assert.equal(body.error, "not_authenticated");

  await app.close();
});

test("status-onchain rejects a non-EVM address when authenticated", async () => {
  const app = buildApp({ user: { id: "u1", address: USER } });
  await registerRoutes(app);

  const res = await app.inject({
    method: "GET",
    url: "/api/gm/status-onchain?chain=moonriver&address=not-an-address",
  });

  assert.equal(res.statusCode, 400);
  const body = res.json() as { error?: string };
  assert.equal(body.error, "invalid_query");

  await app.close();
});
