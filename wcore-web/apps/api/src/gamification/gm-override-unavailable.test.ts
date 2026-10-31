import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { registerGmOnchainRoutes } from "./gm-onchain.js";
import { registerGmContractsRoutes } from "./gm-contracts.js";
import { GmChainUnavailableError } from "./gm-unavailable.js";

const USER = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";
const B3_CONTRACT = "0x3000000000000000000000000000000000000003";
const BASE_CONTRACT = "0x4000000000000000000000000000000000000004";
const TX = `0x${"ab".repeat(32)}`;
const RPC = "https://203.0.113.10";
const UNAVAILABLE = { error: "gm_chain_unavailable", reason: "rpc_override_unattested", chainKey: "B3" };

const isB3 = (chainKey: string) => chainKey.trim().toUpperCase() === "B3";
const getChainRpcs = (chainKey: string) => {
  if (isB3(chainKey)) throw new GmChainUnavailableError(chainKey);
  return [RPC];
};
const getChainRpc = (chainKey: string) => getChainRpcs(chainKey)[0];

function buildApp(): FastifyInstance {
  const app = Fastify();
  app.decorateRequest("user", undefined);
  app.addHook("onRequest", async (req) => {
    (req as unknown as { user: { id: string; address: string } }).user = { id: "u1", address: USER };
  });
  return app;
}

const baseDeps = {
  rpcFetch: async () => ({}),
  FACTORIES: {
    b3: { address: "0x5472f231a017ce1f03ccdfb2325a7d6a90b07de1", chainId: 8333 },
    base: { address: "0x6472f231a017ce1f03ccdfb2325a7d6a90b07de2", chainId: 8453 },
  },
  CONTRACT_DEPLOYED_EVENT: "0x33c981baba081f8fd2c52ac6ad1ea95b6814b4376640f55689051f6584729688",
  extractDeployedContractAddresses: () => [],
  getChainMaxLogRange: () => 1024,
};

async function onchainApp(): Promise<FastifyInstance> {
  const app = buildApp();
  await registerGmOnchainRoutes(app, {} as never, {
    ...baseDeps,
    prisma: {} as never,
    startOfUtcDay: (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
    getChainRpc,
    getChainRpcs,
    checkStreakBadges: async () => {},
    addReferralBonus: async () => {},
    isAdminAuthorized: () => false,
    GM_EVENT_SIG: "0x1374bba5cce7233cce0d4275e8dd0bc1b0ef510fb043198247fc3cb179f8189d",
  } as never);
  return app;
}

function contractsPrisma() {
  const rows = [
    { id: "c-b3", chainKey: "B3", contractAddress: B3_CONTRACT, creatorAddress: USER, createdAt: new Date() },
    { id: "c-base", chainKey: "BASE", contractAddress: BASE_CONTRACT, creatorAddress: USER, createdAt: new Date() },
  ];
  return {
    user: { findUnique: async () => ({ address: USER }) },
    gmContract: {
      findMany: async () => rows,
      findFirst: async () => null,
      findUnique: async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null,
      count: async () => 0,
      create: async () => { throw new Error("must not persist"); },
      upsert: async () => ({}),
    },
    onchainGm: { findMany: async () => [] },
  };
}

async function contractsApp(): Promise<FastifyInstance> {
  const app = buildApp();
  const prisma = contractsPrisma();
  await registerGmContractsRoutes(app, prisma as never, {
    ...baseDeps,
    prisma: prisma as never,
    getChainRpcs,
    readGmContractBalances: async (chainKey: string) => {
      getChainRpcs(chainKey);
      return { creatorBalance: "7", platformBalance: "0" };
    },
    readGmContractBalancesBatch: async (chainKey: string, list: Array<{ contractAddress: string }>) => {
      getChainRpcs(chainKey);
      return new Map(list.map((c) => [c.contractAddress, { creatorBalance: "7", platformBalance: "0" }]));
    },
    PLATFORM_OWNER: { EVM: "0x0000000000000000000000000000000000000009", SVM: "x" },
  } as never);
  return app;
}

test("GM onchain : chaîne surchargée = 503 explicite, jamais 500", async () => {
  const app = await onchainApp();
  const res = await app.inject({ method: "POST", url: "/api/gm/onchain", payload: { txHash: TX, chainKey: "b3" } });
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.json(), UNAVAILABLE);
  await app.close();
});

test("GM status-onchain : chaîne surchargée = 503 explicite", async () => {
  const app = await onchainApp();
  const res = await app.inject({ method: "GET", url: `/api/gm/status-onchain?chain=b3&address=${USER}` });
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.json(), UNAVAILABLE);
  await app.close();
});

test("GM deploy : vérification impossible = 503, aucune écriture", async () => {
  const app = await contractsApp();
  const res = await app.inject({ method: "POST", url: "/api/gm/contracts/deploy", payload: { chainKey: "b3", contractAddress: "0x5000000000000000000000000000000000000005", txHash: TX } });
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.json(), UNAVAILABLE);
  await app.close();
});

test("GM solde de contrat : indisponible = 503, jamais un zéro", async () => {
  const app = await contractsApp();
  const res = await app.inject({ method: "GET", url: "/api/gm/contracts/c-b3/balance" });
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.json(), UNAVAILABLE);
  await app.close();
});

test("GM mes contrats : B3 indisponible explicitement, BASE intact", async () => {
  const app = await contractsApp();
  const res = await app.inject({ method: "GET", url: "/api/gm/my-contracts" });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { contracts: Array<{ chainKey: string; creatorBalance: string | null; balanceStatus?: string }> };
  const b3 = body.contracts.find((c) => c.chainKey === "b3");
  const base = body.contracts.find((c) => c.chainKey === "base");
  assert.equal(b3?.creatorBalance, null);
  assert.equal(b3?.balanceStatus, "UNAVAILABLE");
  assert.equal(base?.creatorBalance, "7");
  assert.equal(base?.balanceStatus, undefined);
  await app.close();
});

test("GM random (en-tête) : B3 indisponible n'empêche pas BASE", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/api/price/native")) return Response.json({ price: 3000 });
    return Response.json({ jsonrpc: "2.0", id: 1, result: "0xde0b6b3a7640000" });
  }) as typeof fetch;
  try {
    const app = await contractsApp();
    const res = await app.inject({ method: "GET", url: `/api/gm/random?address=${USER}` });
    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as { chainKey: string }).chainKey, "BASE");
    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
