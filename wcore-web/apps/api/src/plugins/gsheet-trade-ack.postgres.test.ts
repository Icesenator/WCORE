// Real PostgreSQL proof of the "Trade fait" acknowledgement store (one record per key, one take per
// acknowledgement, even under concurrency). Runs in CI against the test database (DATABASE_URL);
// skipped when none is configured.
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@wcore/db";
import { createPrismaAckStore } from "./gsheet-trade-ack.js";

const databaseUrl = process.env.DATABASE_URL;

test("concurrent taps of one notification record once; concurrent takes deliver it once", { skip: !databaseUrl }, async () => {
  const a = new PrismaClient();
  const b = new PrismaClient();
  try {
    await a.opsEvent.deleteMany({ where: { type: "trade_ack" } });
    const storeA = createPrismaAckStore(a);
    const storeB = createPrismaAckStore(b);
    const key = "k-" + randomUUID().replace(/-/g, "").slice(0, 30);

    const taps = await Promise.all(Array.from({ length: 6 }, (_, i) => (i % 2 ? storeA : storeB).record(key, "crypto")));
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
    await a.opsEvent.deleteMany({ where: { type: "trade_ack" } });
    await a.$disconnect();
    await b.$disconnect();
  }
});

test("an old acknowledgement is not delivered, and rows past retention are purged", { skip: !databaseUrl }, async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.opsEvent.deleteMany({ where: { type: "trade_ack" } });
    let clock = Date.now();
    const store = createPrismaAckStore(prisma, () => clock);
    await store.record("old-" + randomUUID().replace(/-/g, "").slice(0, 28), "action");
    clock += 6 * 60 * 60 * 1000 + 60_000;
    assert.deepEqual(await store.take(), [], "older than 6 h: not replayed");
    clock += 3 * 24 * 60 * 60 * 1000;
    await store.record("new-" + randomUUID().replace(/-/g, "").slice(0, 28), "crypto");
    assert.equal(await prisma.opsEvent.count({ where: { type: "trade_ack" } }), 1, "the expired row was purged");
  } finally {
    await prisma.opsEvent.deleteMany({ where: { type: "trade_ack" } });
    await prisma.$disconnect();
  }
});

test("a waiting acknowledgement past the take window is revived by a new valid tap, a taken one stays a duplicate", { skip: !databaseUrl }, async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.opsEvent.deleteMany({ where: { type: "trade_ack" } });
    const store = createPrismaAckStore(prisma);
    const stale = "stale-" + randomUUID().replace(/-/g, "").slice(0, 26);
    assert.equal(await store.record(stale, "crypto"), "recorded");
    await prisma.opsEvent.updateMany({ where: { type: "trade_ack" }, data: { createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) } });
    assert.deepEqual(await store.take(), [], "past the window: not delivered");
    assert.equal(await store.record(stale, "crypto"), "recorded", "a new tap revives the stale waiting row");
    assert.equal(await prisma.opsEvent.count({ where: { type: "trade_ack" } }), 1, "revived in place, no second row");
    assert.deepEqual(await store.take(), ["crypto"]);
    assert.equal(await store.record(stale, "crypto"), "duplicate", "already taken: a further tap is a duplicate");
  } finally {
    await prisma.opsEvent.deleteMany({ where: { type: "trade_ack" } });
    await prisma.$disconnect();
  }
});
