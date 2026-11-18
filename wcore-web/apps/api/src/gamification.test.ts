import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { getRpcEndpoints } from "@wcore/core";
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
const CONTRACT_E = "0x2000000000000000000000000000000000000005";
const CONTRACT_F = "0x2000000000000000000000000000000000000006";
const ADDR_C = "0x1000000000000000000000000000000000000003";

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
    assert.ok(getRpcEndpoints("BASE").includes(getChainRpc("base") ?? ""));
    assert.ok(getRpcEndpoints("ARBITRUM_ONE").includes(getChainRpc("Arbitrum_One") ?? ""));
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
    await prisma.gmContract.deleteMany({ where: { contractAddress: { in: [CONTRACT_A, CONTRACT_B, CONTRACT_C, CONTRACT_D, CONTRACT_E, CONTRACT_F] } } });
    await prisma.user.deleteMany({ where: { address: { in: [ADDR_A, ADDR_B] } } });
    userA = await prisma.user.create({ data: { address: ADDR_A } });
    userB = await prisma.user.create({ data: { address: ADDR_B } });
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    await prisma.onchainGm.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.gmContract.deleteMany({ where: { contractAddress: { in: [CONTRACT_A, CONTRACT_B, CONTRACT_C, CONTRACT_D, CONTRACT_E, CONTRACT_F] } } });
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

  // Production, 18/11 : un utilisateur dont la serie depasse 7 jours possede deja le badge streak_7 ; le create du
  // badge echouait (unique) a l'interieur de la transaction du POST, Postgres annulait la transaction (25P02) et
  // chaque GM en chaine repondait 500 (9 erreurs le 18/11, toutes sur le meme compte).
  test("POST /api/gm/onchain: a streak badge already earned does not abort the GM transaction", async () => {
    const ADDR_BADGE = "0x1000000000000000000000000000000000000007";
    const CONTRACT_BADGE = "0x2000000000000000000000000000000000000007";
    await prisma.onchainGm.deleteMany({ where: { user: { address: ADDR_BADGE } } });
    await prisma.gmContract.deleteMany({ where: { contractAddress: CONTRACT_BADGE } });
    await prisma.user.deleteMany({ where: { address: ADDR_BADGE } });
    const today = startOfUtcDay(new Date()).getTime();
    const userBadgeOwner = await prisma.user.create({
      data: { address: ADDR_BADGE, gmStreak: 7, longestStreak: 7, lastGmDate: new Date(today - 86_400_000 + 3_600_000) },
    });
    try {
      const badge = await prisma.badge.upsert({
        where: { key: "streak_7" },
        update: {},
        create: { key: "streak_7", title: "7-Day Streak", description: "Said GM for 7 consecutive days", icon: "fire" },
      });
      await prisma.userBadge.create({ data: { userId: userBadgeOwner.id, badgeId: badge.id } });
      await prisma.gmContract.create({ data: { chainKey: "base", contractAddress: CONTRACT_BADGE, ownerId: userBadgeOwner.id, creatorAddress: ADDR_BADGE } });
      // Never before UTC midnight: right after midnight the GM would fall on the previous day and skip the badge branch.
      const eventSec = BigInt(Math.floor(Math.max(Date.now() - 60_000, today + 1_000) / 1000));
      globalThis.fetch = async () => jsonResponse({
        result: {
          from: ADDR_BADGE,
          to: CONTRACT_BADGE,
          status: "0x1",
          logs: [{ address: CONTRACT_BADGE, topics: [GM_EVENT_SIG, topicAddress(ADDR_BADGE)], data: gmEventData(eventSec, 8n, 1n) }],
        },
      });
      const res = await app.inject({
        method: "POST",
        url: "/api/gm/onchain",
        headers: { authorization: `Bearer ${token(userBadgeOwner.id, ADDR_BADGE)}`, "x-forwarded-for": "198.51.100.71" },
        payload: { chainKey: "base", contractAddress: CONTRACT_BADGE, txHash: "0x0c71" },
      });
      assert.equal(res.statusCode, 200, res.payload);
      const fresh = await prisma.user.findUnique({ where: { id: userBadgeOwner.id } });
      assert.equal(fresh?.gmStreak, 8, "the 8th day is counted");
      assert.equal(await prisma.userBadge.count({ where: { userId: userBadgeOwner.id, badgeId: badge.id } }), 1, "the badge is not duplicated");
    } finally {
      await prisma.onchainGm.deleteMany({ where: { userId: userBadgeOwner.id } });
      await prisma.gmContract.deleteMany({ where: { contractAddress: CONTRACT_BADGE } });
      await prisma.user.delete({ where: { id: userBadgeOwner.id } }).catch(() => undefined);
    }
  });

  // P1-GM-SERIE-SUIVIS-20261114, defaut 2 : la serie par chaine suit le jour du GM, pas celui de la reception.
  test("POST /api/gm/onchain: a late GM from yesterday does not take the place of today's chain GM", async () => {
    await prisma.gmContract.upsert({
      where: { chainKey_contractAddress: { chainKey: "base", contractAddress: CONTRACT_E } },
      update: { ownerId: userB.id, creatorAddress: ADDR_B },
      create: { chainKey: "base", contractAddress: CONTRACT_E, ownerId: userB.id, creatorAddress: ADDR_B },
    });
    const today = startOfUtcDay(new Date()).getTime();
    // Etat connu : serie generale et serie BASE de 3 jours, dernier GM avant-hier.
    await prisma.user.update({ where: { id: userB.id }, data: { gmStreak: 3, longestStreak: 3, lastGmDate: new Date(today - 2 * 86_400_000 + 3_600_000) } });
    await prisma.userChainGm.upsert({
      where: { userId_chainKey: { userId: userB.id, chainKey: "BASE" } },
      update: { lastGmDate: new Date(today - 2 * 86_400_000 + 3_600_000), gmStreak: 3, longestStreak: 3 },
      create: { userId: userB.id, chainKey: "BASE", lastGmDate: new Date(today - 2 * 86_400_000 + 3_600_000), gmStreak: 3, longestStreak: 3 },
    });
    const post = async (txHash: string, eventMs: number, ip: string) => {
      globalThis.fetch = async () => jsonResponse({
        result: {
          from: ADDR_B,
          to: CONTRACT_E,
          status: "0x1",
          logs: [{ address: CONTRACT_E, topics: [GM_EVENT_SIG, topicAddress(ADDR_B)], data: gmEventData(BigInt(Math.floor(eventMs / 1000)), 1n, 1n) }],
        },
      });
      return app.inject({
        method: "POST",
        url: "/api/gm/onchain",
        headers: { authorization: `Bearer ${token(userB.id, ADDR_B)}`, "x-forwarded-for": ip },
        payload: { chainKey: "base", contractAddress: CONTRACT_E, txHash },
      });
    };

    const lateMs = today - 2 * 3_600_000; // hier, 22:00 UTC
    const late = await post("0x0c51", lateMs, "198.51.100.31");
    assert.equal(late.statusCode, 200);
    // Jour d'hier, consecutif a avant-hier : general 20 + 2 x 4, chaine 5 + 4. L'ancien code comparait la chaine
    // au jour de reception, remettait la serie de chaine a 1 et ne creditait que 5.
    assert.equal((JSON.parse(late.payload) as { scoreGain: number }).scoreGain, 28 + 9);
    const afterLate = await prisma.userChainGm.findUnique({ where: { userId_chainKey: { userId: userB.id, chainKey: "BASE" } } });
    assert.equal(afterLate?.lastGmDate?.toISOString(), new Date(Math.floor(lateMs / 1000) * 1000).toISOString(), "the GM's own date is stored");

    const nowMs = Math.max(Date.now() - 60_000, today + 1_000); // jamais avant minuit UTC (sinon le GM du jour tomberait la veille)
    const todayGm = await post("0x0c52", nowMs, "198.51.100.32");
    assert.equal(todayGm.statusCode, 200);
    const body = JSON.parse(todayGm.payload) as { alreadyChainGm: boolean };
    assert.equal(body.alreadyChainGm, false, "today's chain GM is still credited");
  });

  // Reserve de Codex sur le defaut 2 : deux GM du meme utilisateur, meme chaine, meme jour, en meme temps.
  // Contre Postgres : verrou de la ligne users puis ecriture conditionnelle ; un seul bonus, aucune erreur 500.
  test("POST /api/gm/onchain: two concurrent GMs on the same chain and day credit the chain bonus once", async () => {
    await prisma.onchainGm.deleteMany({ where: { user: { address: ADDR_C } } });
    await prisma.user.deleteMany({ where: { address: ADDR_C } });
    const userC = await prisma.user.create({ data: { address: ADDR_C } });
    try {
      await prisma.gmContract.upsert({
        where: { chainKey_contractAddress: { chainKey: "base", contractAddress: CONTRACT_F } },
        update: { ownerId: userC.id, creatorAddress: ADDR_C },
        create: { chainKey: "base", contractAddress: CONTRACT_F, ownerId: userC.id, creatorAddress: ADDR_C },
      });
      const eventSec = BigInt(Math.floor((Date.now() - 60_000) / 1000));
      globalThis.fetch = async () => jsonResponse({
        result: {
          from: ADDR_C,
          to: CONTRACT_F,
          status: "0x1",
          logs: [{ address: CONTRACT_F, topics: [GM_EVENT_SIG, topicAddress(ADDR_C)], data: gmEventData(eventSec, 1n, 1n) }],
        },
      });
      const post = (txHash: string, ip: string) => app.inject({
        method: "POST",
        url: "/api/gm/onchain",
        headers: { authorization: `Bearer ${token(userC.id, ADDR_C)}`, "x-forwarded-for": ip },
        payload: { chainKey: "base", contractAddress: CONTRACT_F, txHash },
      });
      const [r1, r2] = await Promise.all([post("0x0c61", "198.51.100.41"), post("0x0c62", "198.51.100.42")]);
      for (const r of [r1, r2]) assert.ok(r.statusCode === 200 || r.statusCode === 409, `status ${r.statusCode}: ${r.payload}`);
      const ok = [r1, r2].filter((r) => r.statusCode === 200).map((r) => JSON.parse(r.payload) as { alreadyChainGm: boolean; scoreGain: number });
      assert.ok(ok.length >= 1);
      assert.equal(ok.filter((b) => !b.alreadyChainGm).length, 1, "exactly one request is credited the chain bonus");
      assert.equal(ok.reduce((n, b) => n + b.scoreGain, 0), 20 + 5, "first general bonus and first chain bonus, once each");
      const row = await prisma.userChainGm.findUnique({ where: { userId_chainKey: { userId: userC.id, chainKey: "BASE" } } });
      assert.equal(row?.gmStreak, 1);
      const fresh = await prisma.user.findUnique({ where: { id: userC.id } });
      assert.equal(fresh?.score, 25);
    } finally {
      await prisma.onchainGm.deleteMany({ where: { userId: userC.id } });
      await prisma.user.delete({ where: { id: userC.id } }).catch(() => undefined);
    }
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
        getChainRpcs: () => ["https://203.0.113.10"],
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
        getChainRpcs: () => ["https://203.0.113.10"],
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
