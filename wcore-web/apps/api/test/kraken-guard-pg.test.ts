// P2-DATA-KRAKEN-VIA-API : magasin de garde Kraken sur un vrai PostgreSQL.
// Prerequis : migrations appliquees (prisma migrate deploy) sur TEST_DATABASE_URL.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@wcore/db";
import { createPrismaKrakenGuardStore, KRAKEN_LOCKOUT_PAUSE_MS } from "../src/cex/kraken-guard.js";

const prefix = `kraken:test-${randomBytes(6).toString("hex")}`;
let prisma: PrismaClient;

describe("kraken_call_state (PostgreSQL)", () => {
  before(async () => { prisma = new PrismaClient(); });
  after(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "kraken_call_state" WHERE "key_id" LIKE $1`, `${prefix}%`);
    await prisma.$disconnect();
  });

  test("dix demandes concurrentes : un seul bail accorde", async () => {
    const store = createPrismaKrakenGuardStore(prisma);
    const key = `${prefix}-concurrent`;
    const results = await Promise.all(Array.from({ length: 10 }, () => store.claim(key, String(BigInt(Date.now()) * 1000n), null)));
    assert.equal(results.filter((r) => r.kind === "claimed").length, 1);
    assert.ok(results.filter((r) => r.kind !== "claimed").every((r) => r.kind === "busy"));
  });

  test("nonce au-dela de Number.MAX_SAFE_INTEGER relu exactement, plancher + 1 respecte", async () => {
    const store = createPrismaKrakenGuardStore(prisma);
    const key = `${prefix}-bigint`;
    const floor = "9007199254740993000"; // > 2^53, < 2^63
    const r = await store.claim(key, "1", floor);
    assert.deepEqual(r, { kind: "claimed", nonce: "9007199254740993001" });
  });

  test("liberation tardive : ne libere pas le bail d'un successeur, mais enregistre la pause", async () => {
    const store = createPrismaKrakenGuardStore(prisma);
    const key = `${prefix}-late`;
    const a = await store.claim(key, "1000", null);
    assert.equal(a.kind, "claimed");
    // Simule l'expiration du bail et de l'intervalle, puis un successeur.
    await prisma.$executeRawUnsafe(`UPDATE "kraken_call_state" SET "lease_until_ms" = 0, "last_call_ms" = 0 WHERE "key_id" = $1`, key);
    const b = await store.claim(key, "1000", null);
    assert.deepEqual(b, { kind: "claimed", nonce: "1001" });
    await store.release(key, "1000", { ok: true, lockout: false });
    const lease = await prisma.$queryRawUnsafe<{ lease: string | null }[]>(`SELECT "lease_until_ms"::text AS "lease" FROM "kraken_call_state" WHERE "key_id" = $1`, key);
    assert.notEqual(lease[0]!.lease, null, "le bail du successeur tient");
    const saved = await store.release(key, "1000", { ok: false, lockout: true });
    assert.ok(saved.lockoutUntilMs && saved.lockoutUntilMs > Date.now() + KRAKEN_LOCKOUT_PAUSE_MS - 60_000);
    await store.release(key, "1001", { ok: false, lockout: false });
    const again = await store.claim(key, "1", null);
    assert.equal(again.kind, "paused", "pause persistee, visible par toute instance");
  });

  test("intervalle minimal : un second bail juste apres liberation est refuse (too_soon)", async () => {
    const store = createPrismaKrakenGuardStore(prisma);
    const key = `${prefix}-interval`;
    const a = await store.claim(key, "1", null);
    assert.equal(a.kind, "claimed");
    await store.release(key, (a as { nonce: string }).nonce, { ok: true, lockout: false });
    assert.deepEqual(await store.claim(key, "1", null), { kind: "too_soon" });
  });
});
