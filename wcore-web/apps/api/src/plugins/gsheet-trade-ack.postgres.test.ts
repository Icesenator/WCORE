// Real PostgreSQL proof of the "Trade fait" acknowledgement store (one record per key, one take per
// acknowledgement, even under concurrency; only for a notification that was really sent). Runs in CI
// against the test database (DATABASE_URL); skipped when none is configured.
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@wcore/db";
import { createPrismaAckStore } from "./gsheet-trade-ack.js";

const databaseUrl = process.env.DATABASE_URL;

function key(prefix: string): string {
  return prefix + "-" + randomUUID().replace(/-/g, "").slice(0, 28);
}

/** A notification row as the relay writes it once ntfy confirmed the send. */
async function seedSent(prisma: PrismaClient, notifyKey: string, state: "sent" | "pending" = "sent"): Promise<void> {
  await prisma.opsEvent.create({ data: { type: "ntfy_notify", severity: "info", message: "", data: { h: notifyKey, s: state } } });
}

async function cleanup(prisma: PrismaClient, notifyKeys: string[]): Promise<void> {
  await prisma.opsEvent.deleteMany({ where: { type: "trade_ack" } });
  for (const k of notifyKeys) {
    await prisma.opsEvent.deleteMany({ where: { type: "ntfy_notify", data: { path: ["h"], equals: k } } });
  }
}

test("concurrent taps of one notification record once; concurrent takes deliver it once", { skip: !databaseUrl }, async () => {
  const a = new PrismaClient();
  const b = new PrismaClient();
  const nk = key("nk");
  try {
    await a.opsEvent.deleteMany({ where: { type: "trade_ack" } });
    await seedSent(a, nk);
    const storeA = createPrismaAckStore(a);
    const storeB = createPrismaAckStore(b);
    const k = key("k");

    const taps = await Promise.all(Array.from({ length: 6 }, (_, i) => (i % 2 ? storeA : storeB).record(k, "crypto", nk)));
    assert.equal(taps.filter((r) => r === "recorded").length, 1);
    assert.equal(taps.filter((r) => r === "duplicate").length, 5);
    assert.equal(await a.opsEvent.count({ where: { type: "trade_ack" } }), 1);

    const takes = await Promise.all(Array.from({ length: 6 }, (_, i) => (i % 2 ? storeA : storeB).take()));
    const delivered = takes.flatMap((t) => t ?? []);
    assert.deepEqual(delivered, ["crypto"], "exactly one take receives the acknowledgement");
    assert.deepEqual(await storeA.take(), [], "a taken acknowledgement is never delivered again");

    const rows = await a.opsEvent.findMany({ where: { type: "trade_ack" }, select: { message: true, data: true } });
    for (const r of rows) {
      assert.equal(r.message, "");
      assert.deepEqual(Object.keys(r.data as object).sort(), ["c", "h", "taken"], "only a hash, a category and a state are stored");
    }
  } finally {
    await cleanup(a, [nk]);
    await a.$disconnect();
    await b.$disconnect();
  }
});

test("an acknowledgement needs a notification that was really sent", { skip: !databaseUrl }, async () => {
  const prisma = new PrismaClient();
  const sentKey = key("nk");
  const pendingKey = key("nk");
  try {
    await prisma.opsEvent.deleteMany({ where: { type: "trade_ack" } });
    await seedSent(prisma, sentKey, "sent");
    await seedSent(prisma, pendingKey, "pending");
    const store = createPrismaAckStore(prisma);
    assert.equal(await store.record(key("k"), "crypto", key("nk-never-sent")), "unknown", "no notification row at all");
    assert.equal(await store.record(key("k"), "crypto", pendingKey), "unknown", "a pending (unconfirmed) notification does not count");
    assert.equal(await prisma.opsEvent.count({ where: { type: "trade_ack" } }), 0);
    assert.equal(await store.record(key("k"), "crypto", sentKey), "recorded");
  } finally {
    await cleanup(prisma, [sentKey, pendingKey]);
    await prisma.$disconnect();
  }
});

test("an old acknowledgement is not delivered, and rows past retention are purged", { skip: !databaseUrl }, async () => {
  const prisma = new PrismaClient();
  const nk = key("nk");
  try {
    await prisma.opsEvent.deleteMany({ where: { type: "trade_ack" } });
    await seedSent(prisma, nk);
    let clock = Date.now();
    const store = createPrismaAckStore(prisma, () => clock);
    await store.record(key("old"), "action", nk);
    clock += 6 * 60 * 60 * 1000 + 60_000;
    assert.deepEqual(await store.take(), [], "older than the take window: not replayed");
    clock += 3 * 24 * 60 * 60 * 1000;
    await seedSent(prisma, nk + "x");
    await store.record(key("new"), "crypto", nk + "x");
    assert.equal(await prisma.opsEvent.count({ where: { type: "trade_ack" } }), 1, "the expired row was purged");
  } finally {
    await cleanup(prisma, [nk, nk + "x"]);
    await prisma.$disconnect();
  }
});

test("a waiting acknowledgement past the take window is revived by a new valid tap, a taken one stays a duplicate", { skip: !databaseUrl }, async () => {
  const prisma = new PrismaClient();
  const nk = key("nk");
  try {
    await prisma.opsEvent.deleteMany({ where: { type: "trade_ack" } });
    await seedSent(prisma, nk);
    const store = createPrismaAckStore(prisma);
    const stale = key("stale");
    assert.equal(await store.record(stale, "crypto", nk), "recorded");
    await prisma.opsEvent.updateMany({ where: { type: "trade_ack" }, data: { createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) } });
    assert.deepEqual(await store.take(), [], "past the window: not delivered");
    assert.equal(await store.record(stale, "crypto", nk), "recorded", "a new tap revives the stale waiting row");
    assert.equal(await prisma.opsEvent.count({ where: { type: "trade_ack" } }), 1, "revived in place, no second row");
    assert.deepEqual(await store.take(), ["crypto"]);
    assert.equal(await store.record(stale, "crypto", nk), "duplicate", "already taken: a further tap is a duplicate");
  } finally {
    await cleanup(prisma, [nk]);
    await prisma.$disconnect();
  }
});
