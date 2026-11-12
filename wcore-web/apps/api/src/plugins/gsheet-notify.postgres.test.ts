// Real PostgreSQL proof of the notification admission (daily cap, duplicates, pending state).
// Runs in CI against the test database (DATABASE_URL); skipped when none is configured.
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@wcore/db";
import { createPrismaNotifyAdmission } from "./gsheet-notify.js";

const databaseUrl = process.env.DATABASE_URL;

test("the daily cap holds under concurrency across two clients", { skip: !databaseUrl }, async () => {
  const a = new PrismaClient();
  const b = new PrismaClient();
  try {
    await a.opsEvent.deleteMany({ where: { type: "ntfy_notify" } });
    const admitA = createPrismaNotifyAdmission(a, 3);
    const admitB = createPrismaNotifyAdmission(b, 3);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) =>
      (i % 2 ? admitA : admitB)("cap-" + randomUUID())));
    const admitted = results.filter((r) => r.admission === "ok").length;
    const capped = results.filter((r) => r.admission === "cap").length;
    assert.equal(admitted, 3);
    assert.equal(capped, 5);
    assert.equal(await a.opsEvent.count({ where: { type: "ntfy_notify" } }), 3);
  } finally {
    await a.opsEvent.deleteMany({ where: { type: "ntfy_notify" } });
    await a.$disconnect();
    await b.$disconnect();
  }
});

test("an identical text is pending until sent, then a duplicate; a release admits a retry", { skip: !databaseUrl }, async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.opsEvent.deleteMany({ where: { type: "ntfy_notify" } });
    const admit = createPrismaNotifyAdmission(prisma, 20);
    const hash = "dup-" + randomUUID();

    const first = await admit(hash);
    assert.equal(first.admission, "ok");
    assert.equal((await admit(hash)).admission, "pending", "ambiguous first send: the retry is told to wait");

    await first.markSent!();
    assert.equal((await admit(hash)).admission, "duplicate", "confirmed send: no second notification");

    const other = "rel-" + randomUUID();
    const refused = await admit(other);
    await refused.release!();
    assert.equal((await admit(other)).admission, "ok", "a clear refusal frees the reservation");

    const rows = await prisma.opsEvent.findMany({ where: { type: "ntfy_notify" }, select: { message: true, data: true } });
    for (const r of rows) {
      assert.equal(r.message, "");
      assert.deepEqual(Object.keys(r.data as object).sort(), ["h", "s"], "only a hash and a state are stored");
    }
  } finally {
    await prisma.opsEvent.deleteMany({ where: { type: "ntfy_notify" } });
    await prisma.$disconnect();
  }
});
