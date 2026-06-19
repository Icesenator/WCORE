import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { TEST_JWT_SECRET as JWT_SECRET } from "./test-secret.js";
import { app, prisma } from "./server.js";
const PLATFORM_OWNER = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";
const USER_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const USER_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function makeToken(userId: string, address: string): string {
  return jwt.sign({ sub: userId, address: address.toLowerCase(), type: "access" }, JWT_SECRET, { expiresIn: "7d" });
}

describe("support tickets", () => {
  let userA: { id: string; address: string };
  let userB: { id: string; address: string };
  let admin: { id: string; address: string };

  before(async () => {
    process.env.ADMIN_TOKEN = "test-admin-token";
    await app.ready();
    await prisma.ticket.deleteMany({ where: { user: { address: { in: [USER_A, USER_B, PLATFORM_OWNER] } } } });
    userA = await prisma.user.upsert({ where: { address: USER_A }, update: {}, create: { address: USER_A } });
    userB = await prisma.user.upsert({ where: { address: USER_B }, update: {}, create: { address: USER_B } });
    // Platform owner may already exist; find or create safely
    try {
      admin = await prisma.user.create({ data: { address: PLATFORM_OWNER } });
    } catch {
      admin = await prisma.user.findUniqueOrThrow({ where: { address: PLATFORM_OWNER } });
    }
    await prisma.ticket.createMany({
      data: [
        { userId: userA.id, title: "A bug", description: "Bug from A", type: "bug", status: "open" },
        { userId: userB.id, title: "B feature", description: "Feature from B", type: "feature", status: "resolved", response: "Done" },
      ],
    });
  });

  after(async () => {
    await prisma.ticket.deleteMany({ where: { user: { address: { in: [USER_A, USER_B, PLATFORM_OWNER] } } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id, admin.id] } } });
  });

  test("non-admin users see only their own tickets", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/tickets",
      headers: { authorization: `Bearer ${makeToken(userA.id, userA.address)}` },
    });

    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.payload) as { tickets: Array<{ title: string; user: { address: string } }> };
    assert.deepEqual(data.tickets.map((t) => t.title), ["A bug"]);
    assert.equal(data.tickets[0]?.user.address, USER_A);
  });

  test("admin users still see all tickets", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/tickets",
      headers: { authorization: `Bearer ${makeToken(admin.id, admin.address)}`, "x-admin-token": "test-admin-token" },
    });

    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.payload) as { tickets: Array<{ title: string }> };
    assert.deepEqual(data.tickets.map((t) => t.title).sort(), ["A bug", "B feature"]);
  });
});

describe("notification stream", () => {
  let user: { id: string; address: string };

  before(async () => {
    await app.ready();
    await prisma.notification.deleteMany({ where: { user: { address: USER_A } } });
    user = await prisma.user.upsert({ where: { address: USER_A }, update: {}, create: { address: USER_A } });
    await prisma.notification.create({
      data: { userId: user.id, type: "support", title: "Ticket answered", body: "Owner replied", read: false },
    });
  });

  after(async () => {
    await prisma.notification.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  });

  test("SSE stream accepts token query and returns an initial snapshot", async () => {
    const streamTokenRes = await app.inject({
      method: "POST",
      url: "/api/notifications/stream-token",
      headers: { authorization: `Bearer ${makeToken(user.id, user.address)}` },
    });
    assert.equal(streamTokenRes.statusCode, 200);
    const token = (JSON.parse(streamTokenRes.payload) as { token: string }).token;
    const res = await app.inject({
      method: "GET",
      url: `/api/notifications/stream?token=${encodeURIComponent(token)}&once=1`,
    });

    assert.equal(res.statusCode, 200);
    assert.match(res.headers["content-type"] as string, /text\/event-stream/);
    assert.match(res.payload, /event: snapshot/);
    assert.match(res.payload, /Ticket answered/);
  });
});
