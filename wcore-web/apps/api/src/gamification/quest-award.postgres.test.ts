// Base PostgreSQL isolee de la CI (TEST_DATABASE_URL, jamais la production : voir set-test-env.js).
// Verifie les garanties que le stub en memoire ne peut pas prouver : contrainte unique sous concurrence reelle
// et annulation de l'insertion quand le credit du score echoue.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PrismaClient } from "@wcore/db";
import { awardQuestOnce } from "./quest-award.js";

const prisma = new PrismaClient();
const QUEST_KEY = "test_quest_award_pg";
const ADDRESSES = ["0x" + "c1".padStart(40, "0"), "0x" + "c2".padStart(40, "0")];

async function cleanup() {
  await prisma.user.deleteMany({ where: { address: { in: ADDRESSES } } });
  await prisma.quest.deleteMany({ where: { key: QUEST_KEY } });
}

before(async () => {
  await cleanup();
  await prisma.quest.create({ data: { key: QUEST_KEY, title: "Test", description: "Test quest", scoreReward: 25, type: "once" } });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("concurrent awards on PostgreSQL insert one completion and credit the score once", async () => {
  const user = await prisma.user.create({ data: { address: ADDRESSES[0]! } });
  const outcomes = await Promise.all(Array.from({ length: 6 }, () => awardQuestOnce(prisma, user.id, QUEST_KEY)));
  assert.equal(outcomes.filter((o) => o.awarded).length, 1);
  assert.equal(await prisma.userQuest.count({ where: { userId: user.id } }), 1);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).score, 25);
});

test("a failed score credit rolls the completion back, so a later award still works", async () => {
  const user = await prisma.user.create({ data: { address: ADDRESSES[1]! } });
  const failingCredit = {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => prisma.$transaction((tx) => fn(new Proxy(tx, {
      get: (target, prop, receiver) => prop === "user"
        ? { update: async () => { throw new Error("credit failed"); } }
        : Reflect.get(target, prop, receiver),
    }))),
  };
  await assert.rejects(awardQuestOnce(failingCredit as never, user.id, QUEST_KEY), /credit failed/);
  assert.equal(await prisma.userQuest.count({ where: { userId: user.id } }), 0, "the completion must not survive the rollback");
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).score, 0);

  assert.deepEqual(await awardQuestOnce(prisma, user.id, QUEST_KEY), { awarded: true, scoreReward: 25 });
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).score, 25);
});
