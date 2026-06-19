// Run: node --import tsx --test apps/api/test/wallet-plugins.test.ts
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { TEST_JWT_SECRET as JWT_SECRET } from "../src/test-secret.js";
import { app, prisma } from "../src/server.js";
import jwt from "jsonwebtoken";

const OWNER_ADDRESS = "0xplugin0000000000000000000000000000000001";
const OTHER_ADDRESS = "0xplugin0000000000000000000000000000000002";

function makeToken(userId: string, address: string): string {
  return jwt.sign({ sub: userId, address: address.toLowerCase(), type: "access" }, JWT_SECRET, { expiresIn: "7d" });
}

describe("wallet plugin — privilege guards", () => {
  let ready = false;
  let userA: { id: string; address: string };
  let userB: { id: string; address: string };
  let scanAId: string;
  let customTokenId: string;

  before(async () => {
    if (!ready) {
      await app.ready();
      ready = true;
    }

    // Clean up existing test data
    const existingUsers = await prisma.user.findMany({
      where: { address: { in: [OWNER_ADDRESS, OTHER_ADDRESS] } },
      select: { id: true },
    });
    for (const u of existingUsers) {
      await prisma.customToken.deleteMany({ where: { userId: u.id } }).catch(() => {});
      await prisma.walletScan.deleteMany({ where: { userId: u.id } }).catch(() => {});
    }
    await prisma.user.deleteMany({ where: { address: { in: [OWNER_ADDRESS, OTHER_ADDRESS] } } });

    // Seed test users
    userA = await prisma.user.upsert({
      where: { address: OWNER_ADDRESS },
      update: {},
      create: { address: OWNER_ADDRESS },
    });
    userB = await prisma.user.upsert({
      where: { address: OTHER_ADDRESS },
      update: {},
      create: { address: OTHER_ADDRESS },
    });

    // Seed a scan owned by userA
    const scan = await prisma.walletScan.create({
      data: {
        userId: userA.id,
        address: OWNER_ADDRESS,
        chains: ["BASE"],
        totalEur: 0,
        tokenCount: 0,
        result: { chains: [] },
      },
    });
    scanAId = scan.id;

    // Seed a custom token owned by userA
    const ct = await prisma.customToken.create({
      data: {
        userId: userA.id,
        contract: "0x0000000000000000000000000000000000000001",
        label: "Test Token",
        chainType: "EVM",
      },
    });
    customTokenId = ct.id;
  });

  after(async () => {
    await prisma.customToken.deleteMany({
      where: { id: { in: [customTokenId] } },
    });
    await prisma.walletScan.deleteMany({
      where: { id: { in: [scanAId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    });
    await app.close();
  });

  // --- /api/custom-tokens ---
  test("GET /api/custom-tokens returns 401 without auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/custom-tokens",
    });
    assert.equal(res.statusCode, 401);
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "not_authenticated");
  });

  test("GET /api/custom-tokens returns tokens for authenticated user", async () => {
    const token = makeToken(userA.id, userA.address);
    const res = await app.inject({
      method: "GET",
      url: "/api/custom-tokens",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.payload) as { tokens?: Array<{ contract: string }> };
    assert.ok(Array.isArray(data.tokens));
    assert.ok(data.tokens!.length >= 1);
  });

  test("GET /api/custom-tokens returns only current user's tokens", async () => {
    const token = makeToken(userB.id, userB.address);
    const res = await app.inject({
      method: "GET",
      url: "/api/custom-tokens",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.payload) as { tokens?: Array<{ contract: string }> };
    // userB has no custom tokens
    assert.equal(data.tokens!.length, 0);
  });

  test("POST /api/custom-tokens returns 401 without auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/custom-tokens",
      payload: { contract: "0x1111111111111111111111111111111111111111", chainType: "EVM" },
    });
    assert.equal(res.statusCode, 401);
  });

  test("DELETE /api/custom-tokens/:id returns 401 without auth", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/custom-tokens/${customTokenId}`,
    });
    assert.equal(res.statusCode, 401);
  });

  test("DELETE /api/custom-tokens/:id returns 404 when another user tries to delete", async () => {
    const token = makeToken(userB.id, userB.address);
    const res = await app.inject({
      method: "DELETE",
      url: `/api/custom-tokens/${customTokenId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 404);
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "not_found");
  });

  test("DELETE /api/custom-tokens/:id succeeds for owner", async () => {
    const token = makeToken(userA.id, userA.address);
    // Create a disposable token to delete
    const ct = await prisma.customToken.create({
      data: { userId: userA.id, contract: "0x2222222222222222222222222222222222222222", chainType: "EVM" },
    });
    const res = await app.inject({
      method: "DELETE",
      url: `/api/custom-tokens/${ct.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 200);
  });

  // --- /api/scans ---
  test("GET /api/scans returns 401 without auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/scans",
    });
    assert.equal(res.statusCode, 401);
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "not_authenticated");
  });

  test("GET /api/scans returns user's scans when authenticated", async () => {
    const token = makeToken(userA.id, userA.address);
    const res = await app.inject({
      method: "GET",
      url: "/api/scans",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.payload) as { scans?: Array<{ id: string }> };
    assert.ok(Array.isArray(data.scans));
    assert.ok(data.scans!.length >= 1);
  });

  test("GET /api/scans returns only current user's scans", async () => {
    const token = makeToken(userB.id, userB.address);
    const res = await app.inject({
      method: "GET",
      url: "/api/scans",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.payload) as { scans?: Array<{ id: string }> };
    assert.equal(data.scans!.length, 0);
  });

  // --- /api/scans/:id ---
  test("GET /api/scans/:id returns 401 without auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/scans/${scanAId}`,
    });
    assert.equal(res.statusCode, 401);
  });

  test("GET /api/scans/:id returns 404 for another user's scan", async () => {
    const token = makeToken(userB.id, userB.address);
    const res = await app.inject({
      method: "GET",
      url: `/api/scans/${scanAId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 404);
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "not_found");
  });

  test("GET /api/scans/:id succeeds for owner", async () => {
    const token = makeToken(userA.id, userA.address);
    const res = await app.inject({
      method: "GET",
      url: `/api/scans/${scanAId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.payload) as { id?: string; address?: string };
    assert.equal(data.id, scanAId);
  });

  // --- /api/scans/:id/share ---
  test("POST /api/scans/:id/share returns 401 without auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/scans/${scanAId}/share`,
      payload: { expiresAt: "2027-01-01T00:00:00Z" },
    });
    assert.equal(res.statusCode, 401);
  });

  test("POST /api/scans/:id/share returns 404 for another user's scan", async () => {
    const token = makeToken(userB.id, userB.address);
    const res = await app.inject({
      method: "POST",
      url: `/api/scans/${scanAId}/share`,
      headers: { authorization: `Bearer ${token}` },
      payload: { expiresAt: "2027-01-01T00:00:00Z" },
    });
    assert.equal(res.statusCode, 404);
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "not_found");
  });

  test("POST /api/scans/:id/share succeeds for owner", async () => {
    const token = makeToken(userA.id, userA.address);
    const res = await app.inject({
      method: "POST",
      url: `/api/scans/${scanAId}/share`,
      headers: { authorization: `Bearer ${token}` },
      payload: { expiresAt: "2027-01-01T00:00:00Z" },
    });
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.payload) as { shareToken?: string; url?: string };
    assert.ok(typeof data.shareToken === "string");
    assert.ok(data.url!.includes("/share/"));
  });

  // --- /api/public/scans/:shareToken (no auth needed) ---
  test("GET /api/public/scans/:shareToken returns 404 for nonexistent token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/public/scans/nonexistent-share-token",
    });
    assert.equal(res.statusCode, 404);
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "not_found");
  });

  test("GET /api/public/scans/:shareToken serves shared scan without auth", async () => {
    // Share userA's scan first
    const token = makeToken(userA.id, userA.address);
    const shareRes = await app.inject({
      method: "POST",
      url: `/api/scans/${scanAId}/share`,
      headers: { authorization: `Bearer ${token}` },
      payload: { expiresAt: "2027-01-01T00:00:00Z" },
    });
    const { shareToken } = JSON.parse(shareRes.payload) as { shareToken: string };

    // Read without auth
    const res = await app.inject({
      method: "GET",
      url: `/api/public/scans/${shareToken}`,
    });
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.payload) as { id?: string; address?: string };
    assert.equal(data.id, scanAId);
    assert.equal(data.address, OWNER_ADDRESS);
  });

  // --- /api/scans/:id/share DELETE ---
  test("DELETE /api/scans/:id/share returns 401 without auth", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/scans/${scanAId}/share`,
    });
    assert.equal(res.statusCode, 401);
  });

  test("DELETE /api/scans/:id/share returns 404 for another user's scan", async () => {
    const token = makeToken(userB.id, userB.address);
    const res = await app.inject({
      method: "DELETE",
      url: `/api/scans/${scanAId}/share`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 404);
  });

  test("DELETE /api/scans/:id/share succeeds for owner", async () => {
    const token = makeToken(userA.id, userA.address);
    const res = await app.inject({
      method: "DELETE",
      url: `/api/scans/${scanAId}/share`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 200);
  });
});
