import assert from "node:assert/strict";
import { after, afterEach, beforeEach, mock, test } from "node:test";
import Fastify from "fastify";
import { PrismaClient } from "@wcore/db";
import { isAdminAuthorized } from "../admin-auth.js";
import { registerGmOnchainRoutes } from "./gm-onchain.js";
import { registerGmRoutes } from "./gm-routes.js";

const prisma = new PrismaClient();
const wallet = "0x" + "a1".padStart(40, "0");
const other = "0x" + "a2".padStart(40, "0");
const topic = "0x" + wallet.slice(2).padStart(64, "0");
const signature = "0x" + "11".repeat(32);
const dayMs = 86_400_000;
const today = Date.UTC(2026, 5, 18);
const startOfUtcDay = (d: Date) => new Date(Math.floor(d.getTime() / dayMs) * dayMs);
const day = (offset: number) => new Date(today + offset * dayMs).toISOString().slice(0, 10);
const window = { fromDay: day(0), toDay: day(1) };
const base = { contractAddress: "0x" + "b1".padStart(40, "0"), rpc: "https://203.0.113.10", chainId: 8453 };
const optimism = { contractAddress: "0x" + "b2".padStart(40, "0"), rpc: "https://203.0.113.11", chainId: 10 };
const networks = { BASE: base, OPTIMISM: optimism };
type Chain = keyof typeof networks;
const txHash = (n: number) => "0x" + n.toString(16).padStart(64, "0");
const word = (n: number) => n.toString(16).padStart(64, "0");

let app: ReturnType<typeof Fastify>;
let userId: string;
let failBadge: boolean;
let failRpc: Chain | undefined;
let rpcCalls: number;
let getLogsCalls: number;
let refuseWideRange: boolean;
let logs: Array<ReturnType<typeof logGm>>;
const originalAdmin = process.env.ADMIN_WALLET_ADDRESS;
function logGm(chainKey: Chain, n: number, offset = 0) {
  return {
    chainKey, transactionHash: txHash(n), blockNumber: "0x" + (3 + offset).toString(16),
    address: networks[chainKey].contractAddress, topics: [signature, topic],
    data: "0x" + word((today + offset * dayMs) / 1000) + word(1) + word(1),
  };
}

beforeEach(async () => {
  mock.timers.enable({ apis: ["Date"], now: today + 3_600_000 });
  process.env.ADMIN_WALLET_ADDRESS = wallet;
  logs = [];
  failBadge = false;
  failRpc = undefined;
  rpcCalls = 0;
  getLogsCalls = 0;
  refuseWideRange = false;
  userId = (await prisma.user.create({ data: { address: wallet } })).id;
  await prisma.gmContract.createMany({ data: Object.entries(networks).map(([chainKey, net]) => ({
    chainKey, contractAddress: net.contractAddress, ownerId: userId,
  })) });
  mock.method(globalThis, "fetch", async (url: string | URL, init?: RequestInit) => {
    rpcCalls++;
    const chain = String(url).startsWith(optimism.rpc) ? "OPTIMISM" : "BASE";
    const { method, params } = JSON.parse(String(init?.body)) as { method: string; params: [unknown, ...unknown[]] };
    if (chain === failRpc) return Response.json({ error: { code: -32000 } });
    if (method === "eth_getBlockByNumber") {
      const number = params[0] === "latest" ? 3 : Number(params[0]);
      const timestamp = (today + (number - 3) * dayMs) / 1000;
      return Response.json({ result: { number: "0x" + number.toString(16), timestamp: "0x" + timestamp.toString(16) } });
    }
    const onChain = logs.filter((log) => log.chainKey === chain);
    if (method === "eth_getLogs") {
      getLogsCalls++;
      const range = params[0] as { fromBlock: string; toBlock: string };
      // Real RPC semantics for the tags, so an "earliest".."latest" scan really sees the logs.
      const blockOf = (tag: string) => tag === "earliest" ? 0 : tag === "latest" ? 3 : Number(tag);
      if (refuseWideRange) {
        // Refuse the first (whole-window) request once, like an RPC with a block-range cap.
        refuseWideRange = false;
        return Response.json({ error: { code: -32005, message: "range too wide" } });
      }
      return Response.json({ result: onChain.filter((log) => Number(log.blockNumber) >= blockOf(range.fromBlock)
        && Number(log.blockNumber) <= blockOf(range.toBlock)) });
    }
    if (method === "eth_getTransactionReceipt") {
      const log = onChain.find((row) => row.transactionHash === params[0]);
      return Response.json({ result: log ? { status: "0x1", from: wallet, to: log.address, logs: [log] } : null });
    }
    throw new Error("Unexpected mock RPC method");
  });

  app = Fastify();
  app.decorateRequest("user", undefined);
  app.addHook("onRequest", async (req) => {
    req.user = { id: userId, address: req.headers["x-test-non-admin"] ? other : wallet };
  });
  const getChainRpc = (key: string) => networks[key.toUpperCase() as Chain]?.rpc;
  const deps = {
    prisma, startOfUtcDay, getChainRpc,
    getChainRpcs: (key: string) => {
      const rpc = getChainRpc(key);
      return rpc ? [rpc] : undefined;
    },
    checkStreakBadges: async () => { if (failBadge) throw new Error("forced failure after insertion and general claim"); },
    addReferralBonus: async () => {},
    isAdminAuthorized,
    rpcFetch: async () => ({}),
    FACTORIES: {
      base: { address: base.contractAddress, chainId: base.chainId },
      optimism: { address: optimism.contractAddress, chainId: optimism.chainId },
    },
    CONTRACT_DEPLOYED_EVENT: signature,
    extractDeployedContractAddresses: () => [],
    GM_EVENT_SIG: signature,
  };
  await registerGmRoutes(app, prisma, deps);
  await registerGmOnchainRoutes(app, prisma, deps);
});

afterEach(async () => {
  mock.restoreAll();
  mock.timers.reset();
  if (originalAdmin === undefined) delete process.env.ADMIN_WALLET_ADDRESS;
  else process.env.ADMIN_WALLET_ADDRESS = originalAdmin;
  await app?.close();
  await prisma.user.deleteMany({ where: { address: wallet } });
  await prisma.gmContract.deleteMany({ where: { contractAddress: { in: [base.contractAddress, optimism.contractAddress] } } });
});
after(async () => { await prisma.$disconnect(); });

const backfill = (payload: object = window, headers: Record<string, string> = {}) =>
  app.inject({ method: "POST", url: "/api/gm/backfill", payload, headers });
const account = () => prisma.user.findUniqueOrThrow({ where: { id: userId } });
const count = () => prisma.onchainGm.count({ where: { userId } });

test("free GM claims the day, then backfill pays only the chain and a replay pays zero", async () => {
  const free = await app.inject({ method: "POST", url: "/api/gm" });
  assert.equal(free.statusCode, 200, free.payload);
  const previous = await account();
  logs = [logGm("BASE", 0x1a)];
  const first = await backfill({ ...window, chainKey: "base" });
  assert.equal(first.statusCode, 200, first.payload);
  assert.equal(first.json().scoreDelta, 5);
  assert.equal(first.json().chains[0].insertedPaid, 1);
  const updated = await account();
  assert.equal(updated.score, previous.score + 5);
  assert.equal(updated.gmStreak, previous.gmStreak);
  assert.equal(updated.longestStreak, previous.longestStreak);
  assert.deepEqual(updated.lastGmDate, previous.lastGmDate);
  await prisma.onchainGm.updateMany({
    where: { userId },
    data: { chainKey: "base", txHash: txHash(0x1a).toUpperCase() },
  });
  const second = await backfill();
  assert.equal(second.statusCode, 200, second.payload);
  assert.equal(second.json().scoreDelta, 0);
  assert.equal(second.json().chains[0].alreadyPresent, 1);
  assert.equal((await account()).score, updated.score);
  assert.equal(await count(), 1);
});

test("another live chain has claimed the day and its self-heal does not consume unscored GMs", async () => {
  logs = [logGm("BASE", 1), logGm("BASE", 2), logGm("OPTIMISM", 3)];
  const live = await app.inject({ method: "POST", url: "/api/gm/onchain",
    payload: { chainKey: "base", contractAddress: base.contractAddress, txHash: txHash(1) } });
  assert.equal(live.statusCode, 200, live.payload);
  // The self-heal reads recorded rows only: no log scan at all (the mock answers "earliest".."latest"
  // like a real RPC, so an RPC import would have inserted tx 2 here).
  assert.equal(getLogsCalls, 0);
  assert.equal(await count(), 1);
  const res = await backfill();
  assert.equal(res.statusCode, 200, res.payload);
  assert.equal(res.json().scoreDelta, 5);
  assert.equal(res.json().chains[0].insertedUnpaid, 1);
  assert.equal((await account()).score, 30);
  assert.equal(await count(), 3);
});

test("two chains in one batch get one general bonus and two chain bonuses", async () => {
  logs = [logGm("OPTIMISM", 1), logGm("BASE", 2)];
  const res = await backfill();
  assert.equal(res.statusCode, 200, res.payload);
  assert.equal(res.json().scoreDelta, 30);
  const user = await account();
  assert.equal(user.score, 30);
  assert.equal(user.gmStreak, 1);
  assert.equal(user.longestStreak, 1);
  assert.deepEqual(user.lastGmDate, new Date(today));
  const rows = await prisma.userChainGm.findMany({ where: { userId } });
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.gmStreak === 1 && row.longestStreak === 1 && row.lastGmDate.getTime() === today));
});

test("older than both claims: records the candidate without paying or rewinding", async () => {
  const lastGmDate = new Date(today);
  await prisma.user.update({ where: { id: userId }, data: { lastGmDate, gmStreak: 2, longestStreak: 4, score: 50 } });
  await prisma.userChainGm.create({ data: { userId, chainKey: "BASE", lastGmDate, gmStreak: 2, longestStreak: 3 } });
  logs = [logGm("BASE", 1, -1), logGm("BASE", 2)];
  const res = await backfill({ chainKey: "base", fromDay: day(-1), toDay: day(0) });
  assert.equal(res.statusCode, 200, res.payload);
  assert.equal(res.json().scoreDelta, 0);
  assert.equal(res.json().chains[0].ignoredOlder, 1);
  const row = await prisma.onchainGm.findFirstOrThrow({ where: { userId } });
  assert.equal(row.txHash, txHash(1));
  assert.deepEqual(row.createdAt, new Date(today - dayMs));
  assert.equal(await count(), 1);
  const fresh = await account();
  assert.equal(fresh.score, 50);
  assert.deepEqual(fresh.lastGmDate, lastGmDate);
  const chain = await prisma.userChainGm.findUniqueOrThrow({ where: { userId_chainKey: { userId, chainKey: "BASE" } } });
  assert.deepEqual(chain.lastGmDate, lastGmDate);
});

test("rollback keeps a verified candidate eligible for a paid retry", async () => {
  failBadge = true;
  logs = [logGm("BASE", 1)];
  const failed = await backfill();
  assert.equal(failed.statusCode, 500, failed.payload);
  assert.equal(await count(), 0);
  assert.equal((await account()).score, 0);
  failBadge = false;
  const retried = await backfill();
  assert.equal(retried.statusCode, 200, retried.payload);
  assert.equal(retried.json().scoreDelta, 25);
  assert.equal(await count(), 1);
});

test("one chain scan is a single eth_getLogs when the RPC accepts the whole window", async () => {
  logs = [logGm("BASE", 1)];
  const res = await backfill({ chainKey: "base", ...window });
  assert.equal(res.statusCode, 200, res.payload);
  assert.equal(res.json().chains[0].insertedPaid, 1);
  assert.equal(getLogsCalls, 1);
});

test("a refused whole-window scan falls back to pages and still finds the GM", async () => {
  logs = [logGm("BASE", 1)];
  refuseWideRange = true;
  const res = await backfill({ chainKey: "base", ...window });
  assert.equal(res.statusCode, 200, res.payload);
  assert.equal(res.json().chains[0].insertedPaid, 1);
  assert.ok(getLogsCalls >= 2);
});

test("a legacy lowercase chain row is counted and skipped without blocking other chains", async () => {
  await prisma.userChainGm.create({ data: { userId, chainKey: "base", lastGmDate: new Date(today - 2 * dayMs), gmStreak: 1, longestStreak: 1 } });
  logs = [logGm("BASE", 1), logGm("OPTIMISM", 2)];
  const res = await backfill();
  assert.equal(res.statusCode, 200, res.payload);
  const byChain = Object.fromEntries(res.json().chains.map((c: { chainKey: string }) => [c.chainKey, c]));
  assert.equal(byChain.BASE.legacyConflict, 1);
  assert.equal(byChain.BASE.insertedPaid, 0);
  assert.equal(byChain.OPTIMISM.insertedPaid, 1);
  assert.equal(await count(), 1);
  assert.equal((await account()).score, 25);
});

test("incomplete discovery leaves all chains untouched", async () => {
  logs = [logGm("BASE", 1)];
  failRpc = "OPTIMISM";
  const res = await backfill();
  assert.equal(res.statusCode, 503, res.payload);
  assert.equal(res.json().chains[1].rpcErrors, 1);
  assert.equal(await count(), 0);
});

test("missing and invalid UTC windows are rejected before discovery", async () => {
  const missing = await backfill({});
  assert.equal(missing.statusCode, 400);
  assert.deepEqual(missing.json(), { error: "window_required" });
  for (const payload of [{ ...window, fromDay: "2026-02-30" }, { ...window, fromDay: day(-31) }]) {
    const invalid = await backfill(payload);
    assert.equal(invalid.statusCode, 400);
    assert.deepEqual(invalid.json(), { error: "invalid_window" });
  }
  assert.equal(rpcCalls, 0);
});

test("non-admin cannot backfill", async () => {
  const res = await backfill(window, { "x-test-non-admin": "1" });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.json(), { error: "admin_required" });
  assert.equal(rpcCalls, 0);
});
