import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { TEST_JWT_SECRET as JWT_SECRET } from "./test-secret.js";
import { app, prisma } from "./server.js";
const OWNER_ADDR = "0x1111111111111111111111111111111111111111";
const OTHER_ADDR = "0x2222222222222222222222222222222222222222";

function makeToken(userId: string, address: string): string {
  return jwt.sign({ sub: userId, address: address.toLowerCase(), type: "access" }, JWT_SECRET, { expiresIn: "7d" });
}

describe("share scans", () => {
  let owner: { id: string; address: string };
  let other: { id: string; address: string };
  let scanId: string;

  before(async () => {
    await app.ready();
    await prisma.user.deleteMany({ where: { address: { in: [OWNER_ADDR, OTHER_ADDR] } } });
    owner = await prisma.user.create({ data: { address: OWNER_ADDR } });
    other = await prisma.user.create({ data: { address: OTHER_ADDR } });

    // Create a scan owned by owner
    const scan = await prisma.walletScan.create({
      data: {
        userId: owner.id,
        address: OWNER_ADDR,
        chains: ["BASE"],
        totalEur: 1234.56,
        tokenCount: 5,
        result: { chains: [], totals: { valueEur: 1234.56, tokenCount: 5 } },
      },
    });
    scanId = scan.id;
  });

  after(async () => {
    await prisma.walletScan.deleteMany({ where: { userId: { in: [owner.id, other.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
  });

  test("owner creates share token", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/scans/${scanId}/share`,
      headers: { authorization: `Bearer ${makeToken(owner.id, owner.address)}` },
    });

    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.payload) as { shareToken: string; url: string };
    assert.ok(data.shareToken.length >= 32);
    assert.ok(data.url.includes(data.shareToken));

    // Verify scan was updated
    const scan = await prisma.walletScan.findUnique({ where: { id: scanId } });
    assert.equal(scan?.shareToken, data.shareToken);
    assert.ok(scan?.sharedAt);
  });

  test("non-owner cannot create share token", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/scans/${scanId}/share`,
      headers: { authorization: `Bearer ${makeToken(other.id, other.address)}` },
    });

    assert.equal(res.statusCode, 404);
  });

  test("public view returns sanitized data (no userId)", async () => {
    // First create a share
    const createRes = await app.inject({
      method: "POST",
      url: `/api/scans/${scanId}/share`,
      headers: { authorization: `Bearer ${makeToken(owner.id, owner.address)}` },
    });
    const { shareToken } = JSON.parse(createRes.payload) as { shareToken: string };

    const res = await app.inject({
      method: "GET",
      url: `/api/public/scans/${shareToken}`,
    });

    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.payload) as Record<string, unknown>;
    assert.ok(!("userId" in data));
    assert.equal(data.address, OWNER_ADDR);
    assert.equal(data.totalEur, 1234.56);
  });

  test("public view with invalid shareToken returns 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/public/scans/nonexistenttoken123",
    });

    assert.equal(res.statusCode, 404);
  });

  test("public view with expired shareToken returns 410", async () => {
    // Create a share with past expiration
    const pastExpiry = new Date(Date.now() - 3600_000).toISOString();
    const createRes = await app.inject({
      method: "POST",
      url: `/api/scans/${scanId}/share`,
      headers: { authorization: `Bearer ${makeToken(owner.id, owner.address)}` },
      payload: { expiresAt: pastExpiry },
    });
    const { shareToken } = JSON.parse(createRes.payload) as { shareToken: string };

    const res = await app.inject({
      method: "GET",
      url: `/api/public/scans/${shareToken}`,
    });

    assert.equal(res.statusCode, 410);
  });

  test("revoked share returns 404 on public view", async () => {
    // Create then revoke
    const createRes = await app.inject({
      method: "POST",
      url: `/api/scans/${scanId}/share`,
      headers: { authorization: `Bearer ${makeToken(owner.id, owner.address)}` },
    });
    const { shareToken } = JSON.parse(createRes.payload) as { shareToken: string };

    const revokeRes = await app.inject({
      method: "DELETE",
      url: `/api/scans/${scanId}/share`,
      headers: { authorization: `Bearer ${makeToken(owner.id, owner.address)}` },
    });
    assert.equal(revokeRes.statusCode, 200);

    const res = await app.inject({
      method: "GET",
      url: `/api/public/scans/${shareToken}`,
    });
    assert.equal(res.statusCode, 404);
  });

  test("non-owner cannot revoke share", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: `/api/scans/${scanId}/share`,
      headers: { authorization: `Bearer ${makeToken(owner.id, owner.address)}` },
    });
    assert.equal(createRes.statusCode, 200);

    const res = await app.inject({
      method: "DELETE",
      url: `/api/scans/${scanId}/share`,
      headers: { authorization: `Bearer ${makeToken(other.id, other.address)}` },
    });
    assert.equal(res.statusCode, 404);
  });
});
