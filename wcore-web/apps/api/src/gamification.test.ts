import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { TEST_JWT_SECRET as JWT_SECRET } from "./test-secret.js";
import { app, prisma } from "./server.js";
import {
  extractDeployedContractAddresses,
  getChainRpc,
  startOfUtcDay,
} from "./gamification/index.js";
import { rebuildChainStreakFromOnchain } from "./gamification/gm-streak-rebuild.js";
const FACTORY = "0xe7cfd4b041650ddc8861ffe066a2cd2cce0f6ecb";
const GM_EVENT_SIG = "0x1374bba5cce7233cce0d4275e8dd0bc1b0ef510fb043198247fc3cb179f8189d";
const DEPLOYED_EVENT = "0x33c981baba081f8fd2c52ac6ad1ea95b6814b4376640f55689051f6584729688";

const ADDR_A = "0x1000000000000000000000000000000000000001";
const ADDR_B = "0x1000000000000000000000000000000000000002";
const CONTRACT_A = "0x2000000000000000000000000000000000000001";
const CONTRACT_B = "0x2000000000000000000000000000000000000002";
const CONTRACT_C = "0x2000000000000000000000000000000000000003";
const CONTRACT_D = "0x2000000000000000000000000000000000000004";

function token(userId: string, address: string): string {
  return jwt.sign({ sub: userId, address: address.toLowerCase(), type: "access" }, JWT_SECRET, { expiresIn: "7d" });
}

function topicAddress(address: string): string {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
}

function uint256(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function gmEventData(timestamp: bigint, streak: bigint, tipWei: bigint): string {
  return `0x${uint256(timestamp)}${uint256(streak)}${uint256(tipWei)}`;
}

function jsonResponse(data: unknown): Response {
  return { ok: true, json: async () => data } as Response;
}

describe("gamification helpers", () => {
  test("startOfUtcDay normalizes to UTC midnight", () => {
    const day = startOfUtcDay(new Date("2026-05-06T23:30:00.000Z"));
    assert.equal(day.toISOString(), "2026-05-06T00:00:00.000Z");
  });

  test("getChainRpc returns configured RPCs and never falls back unknown chains to Base", () => {
    assert.equal(getChainRpc("base"), "https://base.drpc.org");
    assert.equal(getChainRpc("Arbitrum_One"), "https://arb1.arbitrum.io/rpc");
    assert.equal(getChainRpc("unknown_chain"), undefined);
  });

  test("extractDeployedContractAddresses reads contract from topics[1] and filters creator in topics[2]", () => {
    const contract = "0x1234567890123456789012345678901234567890";
    const creator = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
    const otherCreator = "0xffffffffffffffffffffffffffffffffffffffff";
    const pad = (address: string) => `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;

    const addresses = extractDeployedContractAddresses([
      { topics: ["0xsig", pad(contract), pad(creator)] },
      { topics: ["0xsig", pad("0x9999999999999999999999999999999999999999"), pad(otherCreator)] },
    ], creator);

    assert.deepEqual(addresses, [contract]);
  });
});

describe("GM API regressions", () => {
  const originalFetch = globalThis.fetch;
  let userA: { id: string; address: string };
  let userB: { id: string; address: string };

  before(async () => {
    await app.ready();
    await prisma.onchainGm.deleteMany({ where: { user: { address: { in: [ADDR_A, ADDR_B] } } } });
    await prisma.gmContract.deleteMany({ where: { contractAddress: { in: [CONTRACT_A, CONTRACT_B, CONTRACT_C, CONTRACT_D] } } });
    await prisma.user.deleteMany({ where: { address: { in: [ADDR_A, ADDR_B] } } });
    userA = await prisma.user.create({ data: { address: ADDR_A } });
    userB = await prisma.user.create({ data: { address: ADDR_B } });
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    await prisma.onchainGm.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.gmContract.deleteMany({ where: { contractAddress: { in: [CONTRACT_A, CONTRACT_B, CONTRACT_C, CONTRACT_D] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await app.close();
    await prisma.$disconnect();
  });

  test("POST /api/gm/contracts/deploy accepts factory deploys using ContractDeployed topics[1]", async () => {
    globalThis.fetch = async () => jsonResponse({
      result: {
        to: FACTORY,
        contractAddress: null,
        status: "0x1",
        logs: [{ address: FACTORY, topics: [DEPLOYED_EVENT, topicAddress(CONTRACT_A), topicAddress(ADDR_A)], data: "0x" }],
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/gm/contracts/deploy",
      headers: { authorization: `Bearer ${token(userA.id, ADDR_A)}`, "x-forwarded-for": "198.51.100.10" },
      payload: { chainKey: "base", contractAddress: CONTRACT_A, txHash: "0xde0101" },
    });

    assert.equal(res.statusCode, 200);
    const contract = await prisma.gmContract.findFirst({ where: { chainKey: { equals: "base", mode: "insensitive" }, contractAddress: CONTRACT_A } });
    assert.equal(contract?.creatorAddress, ADDR_A);
    assert.equal(contract?.ownerId, userA.id);
  });

  test("POST /api/gm/contracts/deploy rejects and does not persist an unverified deploy", async () => {
    globalThis.fetch = async () => jsonResponse({
      result: {
        to: FACTORY,
        contractAddress: null,
        status: "0x1",
        logs: [{ address: FACTORY, topics: [DEPLOYED_EVENT, topicAddress(CONTRACT_B), topicAddress(ADDR_A)], data: "0x" }],
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/gm/contracts/deploy",
      headers: { authorization: `Bearer ${token(userA.id, ADDR_A)}`, "x-forwarded-for": "198.51.100.15" },
      payload: { chainKey: "base", contractAddress: CONTRACT_C, txHash: "0xde0bad01" },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.payload).error, "deploy_verification_failed");
    const contract = await prisma.gmContract.findUnique({ where: { chainKey_contractAddress: { chainKey: "base", contractAddress: CONTRACT_C } } });
    assert.equal(contract, null);
  });

  test("POST /api/gm/onchain persists tipWei from the last GmCheckedIn data word", async () => {
    await prisma.gmContract.upsert({
      where: { chainKey_contractAddress: { chainKey: "base", contractAddress: CONTRACT_B } },
      update: { ownerId: userA.id, creatorAddress: ADDR_A },
      create: { chainKey: "base", contractAddress: CONTRACT_B, ownerId: userA.id, creatorAddress: ADDR_A },
    });
    const tipWei = 123456789012345n;
    globalThis.fetch = async () => jsonResponse({
      result: {
        from: ADDR_A,
        to: CONTRACT_B,
        status: "0x1",
        logs: [{ address: CONTRACT_B, topics: [GM_EVENT_SIG, topicAddress(ADDR_A)], data: gmEventData(111n, 7n, tipWei) }],
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/gm/onchain",
      headers: { authorization: `Bearer ${token(userA.id, ADDR_A)}`, "x-forwarded-for": "198.51.100.11" },
      payload: { chainKey: "base", contractAddress: CONTRACT_B, txHash: "0x0c01" },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload) as { tipWei?: string };
    assert.equal(body.tipWei, tipWei.toString());
    const gm = await prisma.onchainGm.findFirst({ where: { chainKey: { equals: "base", mode: "insensitive" }, txHash: "0x0c01" } });
    assert.equal(gm?.tipWei, tipWei.toString());
  });

  test("POST /api/gm/onchain records the on-chain event timestamp as createdAt", async () => {
    await prisma.gmContract.upsert({
      where: { chainKey_contractAddress: { chainKey: "base", contractAddress: CONTRACT_D } },
      update: { ownerId: userA.id, creatorAddress: ADDR_A },
      create: { chainKey: "base", contractAddress: CONTRACT_D, ownerId: userA.id, creatorAddress: ADDR_A },
    });
    const eventTs = 1_779_550_000n;
    globalThis.fetch = async () => jsonResponse({
      result: {
        from: ADDR_A,
        to: CONTRACT_D,
        status: "0x1",
        logs: [{ address: CONTRACT_D, topics: [GM_EVENT_SIG, topicAddress(ADDR_A)], data: gmEventData(eventTs, 9n, 777n) }],
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/gm/onchain",
      headers: { authorization: `Bearer ${token(userA.id, ADDR_A)}`, "x-forwarded-for": "198.51.100.12" },
      payload: { chainKey: "base", contractAddress: CONTRACT_D, txHash: "0x0c02" },
    });

    assert.equal(res.statusCode, 200);
    const gm = await prisma.onchainGm.findFirst({ where: { chainKey: { equals: "base", mode: "insensitive" }, txHash: "0x0c02" } });
    assert.equal(gm?.createdAt.toISOString(), new Date(Number(eventTs) * 1000).toISOString());
  });

  test("POST /api/gm/onchain rejects a GM tx the user did not send (receipt.from mismatch)", async () => {
    await prisma.gmContract.upsert({
      where: { chainKey_contractAddress: { chainKey: "base", contractAddress: CONTRACT_B } },
      update: { ownerId: userA.id, creatorAddress: ADDR_A },
      create: { chainKey: "base", contractAddress: CONTRACT_B, ownerId: userA.id, creatorAddress: ADDR_A },
    });
    // Receipt sent by ADDR_B but emits a forged GmCheckedIn event with ADDR_A's topic.
    globalThis.fetch = async () => jsonResponse({
      result: {
        from: ADDR_B,
        to: CONTRACT_B,
        status: "0x1",
        logs: [{ address: CONTRACT_B, topics: [GM_EVENT_SIG, topicAddress(ADDR_A)], data: gmEventData(111n, 7n, 777n) }],
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/gm/onchain",
      headers: { authorization: `Bearer ${token(userA.id, ADDR_A)}`, "x-forwarded-for": "198.51.100.19" },
      payload: { chainKey: "base", contractAddress: CONTRACT_B, txHash: "0xf0f601" },
    });

    assert.equal(res.statusCode, 400);
    const gm = await prisma.onchainGm.findFirst({ where: { chainKey: { equals: "base", mode: "insensitive" }, txHash: "0xf0f601" } });
    assert.equal(gm, null, "forged-from GM must not be persisted");
  });

  test("rebuildChainStreakFromOnchain records inserted logs with their on-chain timestamp", async () => {
    const eventTs = 1_779_550_123;
    const txHash = "0x0e0101";
    globalThis.fetch = async () => jsonResponse({ result: [{
      address: CONTRACT_C,
      topics: [GM_EVENT_SIG, topicAddress(ADDR_A)],
      data: gmEventData(BigInt(eventTs), 11n, 999n),
      transactionHash: txHash,
      blockNumber: "0x1",
    }] });
    await rebuildChainStreakFromOnchain(
      {
        prisma,
        getChainRpcs: () => ["https://example.invalid"],
        GM_EVENT_SIG,
        rpcJson: async <T,>() => ({ result: "0x1" } as T),
      },
      userA.id,
      ADDR_A,
      "base",
    );

    const gm = await prisma.onchainGm.findFirst({ where: { chainKey: { equals: "base", mode: "insensitive" }, txHash } });
    assert.equal(gm?.createdAt.toISOString(), new Date(eventTs * 1000).toISOString());
  });

  test("rebuildChainStreakFromOnchain does not lower an existing per-chain streak", async () => {
    const eventTs = Math.floor(Date.now() / 1000);
    globalThis.fetch = async () => jsonResponse({ result: [{
      address: CONTRACT_C,
      topics: [GM_EVENT_SIG, topicAddress(ADDR_A)],
      data: gmEventData(BigInt(eventTs), 1n, 999n),
      transactionHash: "0x0e0102",
      blockNumber: "0x1",
    }] });
    await prisma.userChainGm.upsert({
      where: { userId_chainKey: { userId: userA.id, chainKey: "BASE" } },
      create: { userId: userA.id, chainKey: "BASE", lastGmDate: new Date(eventTs * 1000), gmStreak: 8, longestStreak: 8 },
      update: { lastGmDate: new Date(eventTs * 1000), gmStreak: 8, longestStreak: 8 },
    });

    const result = await rebuildChainStreakFromOnchain(
      {
        prisma,
        getChainRpcs: () => ["https://example.invalid"],
        GM_EVENT_SIG,
        rpcJson: async <T,>() => ({ result: "0x1" } as T),
      },
      userA.id,
      ADDR_A,
      "base",
    );

    const chainGm = await prisma.userChainGm.findUnique({ where: { userId_chainKey: { userId: userA.id, chainKey: "BASE" } } });
    assert.equal(result.currentStreak, 8);
    assert.equal(chainGm?.gmStreak, 8);
  });

  test("POST /api/gm/onchain allows the same txHash on different chains", async () => {
    await prisma.gmContract.upsert({
      where: { chainKey_contractAddress: { chainKey: "base", contractAddress: CONTRACT_A } },
      update: {},
      create: { chainKey: "base", contractAddress: CONTRACT_A, ownerId: userA.id, creatorAddress: ADDR_A },
    });
    await prisma.gmContract.upsert({
      where: { chainKey_contractAddress: { chainKey: "optimism", contractAddress: CONTRACT_C } },
      update: {},
      create: { chainKey: "optimism", contractAddress: CONTRACT_C, ownerId: userA.id, creatorAddress: ADDR_A },
    });
    globalThis.fetch = async (input: string | URL | globalThis.Request) => {
      const url = String(input);
      const contract = url.includes("optimism") ? CONTRACT_C : CONTRACT_A;
      return jsonResponse({
        result: {
          from: ADDR_A,
          to: contract,
          status: "0x1",
          logs: [{ address: contract, topics: [GM_EVENT_SIG, topicAddress(ADDR_A)], data: gmEventData(222n, 8n, 777n) }],
        },
      });
    };

    const baseRes = await app.inject({
      method: "POST",
      url: "/api/gm/onchain",
      headers: { authorization: `Bearer ${token(userA.id, ADDR_A)}`, "x-forwarded-for": "198.51.100.13" },
      payload: { chainKey: "base", contractAddress: CONTRACT_A, txHash: "0x5a01" },
    });
    const optimismRes = await app.inject({
      method: "POST",
      url: "/api/gm/onchain",
      headers: { authorization: `Bearer ${token(userA.id, ADDR_A)}`, "x-forwarded-for": "198.51.100.14" },
      payload: { chainKey: "optimism", contractAddress: CONTRACT_C, txHash: "0x5a01" },
    });

    assert.equal(baseRes.statusCode, 200);
    assert.equal(optimismRes.statusCode, 200);
    const count = await prisma.onchainGm.count({ where: { txHash: "0x5a01" } });
    assert.equal(count, 2);
  });

  test("POST /api/gm/onchain rejects replay of the same txHash on the same chain", async () => {
    await prisma.gmContract.upsert({
      where: { chainKey_contractAddress: { chainKey: "base", contractAddress: CONTRACT_A } },
      update: { ownerId: userA.id, creatorAddress: ADDR_A },
      create: { chainKey: "base", contractAddress: CONTRACT_A, ownerId: userA.id, creatorAddress: ADDR_A },
    });
    globalThis.fetch = async () => jsonResponse({
      result: {
        from: ADDR_A,
        to: CONTRACT_A,
        status: "0x1",
        logs: [{ address: CONTRACT_A, topics: [GM_EVENT_SIG, topicAddress(ADDR_A)], data: gmEventData(333n, 3n, 777n) }],
      },
    });

    const first = await app.inject({
      method: "POST",
      url: "/api/gm/onchain",
      headers: { authorization: `Bearer ${token(userA.id, ADDR_A)}`, "x-forwarded-for": "198.51.100.31" },
      payload: { chainKey: "base", contractAddress: CONTRACT_A, txHash: "0xabc123" },
    });
    const replay = await app.inject({
      method: "POST",
      url: "/api/gm/onchain",
      headers: { authorization: `Bearer ${token(userA.id, ADDR_A)}`, "x-forwarded-for": "198.51.100.31" },
      payload: { chainKey: "BASE", contractAddress: CONTRACT_A, txHash: "0xabc123" },
    });

    assert.equal(first.statusCode, 200);
    assert.equal(replay.statusCode, 400);
    assert.equal(replay.json().error, "duplicate_tx");
    const count = await prisma.onchainGm.count({ where: { txHash: "0xabc123" } });
    assert.equal(count, 1);
  });

  test("GET /api/gm/has-deployed preserves existing owners and self-heals newly discovered user contracts", async () => {
    await prisma.gmContract.deleteMany({ where: { ownerId: userA.id, chainKey: { equals: "base", mode: "insensitive" } } });
    await prisma.gmContract.upsert({
      where: { chainKey_contractAddress: { chainKey: "base", contractAddress: CONTRACT_C } },
      update: { ownerId: userB.id, creatorAddress: ADDR_B },
      create: { chainKey: "base", contractAddress: CONTRACT_C, ownerId: userB.id, creatorAddress: ADDR_B },
    });
    let logLookups = 0;
    globalThis.fetch = async (_input: string | URL | globalThis.Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
      if (body.method === "eth_blockNumber") return jsonResponse({ result: "0x100" });
      if (body.method === "eth_getLogs") {
        logLookups++;
        return jsonResponse({ result: [
          { topics: [DEPLOYED_EVENT, topicAddress(CONTRACT_C), topicAddress(ADDR_A)] },
          { topics: [DEPLOYED_EVENT, topicAddress(CONTRACT_D), topicAddress(ADDR_A)] },
        ] });
      }
      return jsonResponse({ result: null });
    };

    const res = await app.inject({
      method: "GET",
      url: `/api/gm/has-deployed?chain=base&contract=${CONTRACT_D}`,
      headers: { authorization: `Bearer ${token(userA.id, ADDR_A)}`, "x-forwarded-for": "198.51.100.12" },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(logLookups, 1);
    const contract = await prisma.gmContract.findUnique({ where: { chainKey_contractAddress: { chainKey: "base", contractAddress: CONTRACT_C } } });
    assert.equal(contract?.ownerId, userB.id);
    assert.equal(contract?.creatorAddress, ADDR_B);
    const newContract = await prisma.gmContract.findFirst({ where: { chainKey: { equals: "base", mode: "insensitive" }, contractAddress: CONTRACT_D } });
    assert.equal(newContract?.ownerId, userA.id);
    assert.equal(newContract?.creatorAddress, ADDR_A);
  });
});
