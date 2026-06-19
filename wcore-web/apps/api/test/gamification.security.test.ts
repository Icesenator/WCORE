// Run: node --import tsx --test apps/api/test/gamification.security.test.ts
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { TEST_JWT_SECRET as JWT_SECRET } from "../src/test-secret.js";
import { app, prisma } from "../src/server.js";
import jwt from "jsonwebtoken";

const OWNER_ADDRESS = "0xowner0000000000000000000000000000000000";
const RANDOM_ADDRESS = "0xrandom00000000000000000000000000000000";
const PLATFORM_OWNER_ADDRESS = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";
const CONTRACT_ADDRESS = "0x1234567890123456789012345678901234567890";

function makeToken(userId: string, address: string): string {
  return jwt.sign({ sub: userId, address: address.toLowerCase(), type: "access" }, JWT_SECRET, { expiresIn: "7d" });
}

describe("gamification security", () => {
  let ready = false;
  let ownerUser: { id: string; address: string };
  let randomUser: { id: string; address: string };
  let platformOwnerUser: { id: string; address: string };
  let contractId: string;

  before(async () => {
    if (!ready) {
      await app.ready();
      ready = true;
    }

    // Clean up any leftovers from previous runs
    await prisma.gmContract.deleteMany({ where: { contractAddress: CONTRACT_ADDRESS } });
    await prisma.user.deleteMany({
      where: { address: { in: [OWNER_ADDRESS, RANDOM_ADDRESS, PLATFORM_OWNER_ADDRESS] } },
    });

    // Seed test users (upsert for idempotency across runs)
    ownerUser = await prisma.user.upsert({ where: { address: OWNER_ADDRESS }, update: {}, create: { address: OWNER_ADDRESS } });
    randomUser = await prisma.user.upsert({ where: { address: RANDOM_ADDRESS }, update: {}, create: { address: RANDOM_ADDRESS } });
    platformOwnerUser = await prisma.user.upsert({ where: { address: PLATFORM_OWNER_ADDRESS }, update: {}, create: { address: PLATFORM_OWNER_ADDRESS } });

    // Seed a GM contract owned by ownerUser (upsert for idempotency)
    const contract = await prisma.gmContract.upsert({
      where: { chainKey_contractAddress: { chainKey: "base", contractAddress: CONTRACT_ADDRESS } },
      update: { ownerId: ownerUser.id },
      create: { chainKey: "base", contractAddress: CONTRACT_ADDRESS, ownerId: ownerUser.id },
    });
    contractId = contract.id;
  });

  after(async () => {
    await prisma.gmContract.deleteMany({ where: { id: contractId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerUser.id, randomUser.id, platformOwnerUser.id] } },
    });
    await app.close();
    await prisma.$disconnect();
  });

  test("GET /api/gm/contracts/:id/balance rejects unauthorized requests with 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/gm/contracts/${contractId}/balance`,
    });
    assert.equal(res.statusCode, 401);
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "not_authenticated");
  });

  test("contract owner sees creatorBalance and gets 0 for platformBalance", async () => {
    const token = makeToken(ownerUser.id, ownerUser.address);
    const res = await app.inject({
      method: "GET",
      url: `/api/gm/contracts/${contractId}/balance`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.payload) as {
      creatorBalance?: string;
      platformBalance?: string;
      chainKey?: string;
      contractAddress?: string;
    };
    assert.ok(typeof data.creatorBalance === "string");
    assert.equal(data.platformBalance, "0");
    assert.equal(data.chainKey, "base");
    assert.equal(data.contractAddress, CONTRACT_ADDRESS);
  });

  test("platform owner sees platformBalance and gets 0 for creatorBalance", async () => {
    const token = makeToken(platformOwnerUser.id, platformOwnerUser.address);
    const res = await app.inject({
      method: "GET",
      url: `/api/gm/contracts/${contractId}/balance`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.payload) as {
      creatorBalance?: string;
      platformBalance?: string;
    };
    assert.equal(data.creatorBalance, "0");
    assert.ok(typeof data.platformBalance === "string");
  });

  test("random authenticated user gets 403 for another user's contract", async () => {
    const token = makeToken(randomUser.id, randomUser.address);
    const res = await app.inject({
      method: "GET",
      url: `/api/gm/contracts/${contractId}/balance`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 403);
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "forbidden");
  });

  test("rate limiting returns 429 after rapid requests to GM endpoints", async () => {
    const token = makeToken(ownerUser.id, ownerUser.address);
    let hit429 = false;

    // POST /api/gm is a write endpoint rate-limited at RATE_LIMIT_AUTH (30)
    // Calling it rapidly triggers the gm write rate limit bucket
    for (let i = 0; i < 50; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/gm",
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.statusCode === 429) {
        hit429 = true;
        const data = JSON.parse(res.payload) as { error?: string };
        assert.equal(data.error, "rate_limited");
        break;
      }
    }

    assert.ok(hit429, "expected to eventually hit 429 rate limit");
  });
});
