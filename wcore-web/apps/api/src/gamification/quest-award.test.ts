// Run: node --import tsx --test apps/api/src/gamification/quest-award.test.ts
// Base en memoire : la contrainte unique (userId, questId) est simulee par un Set, comme skipDuplicates en Postgres.
import { test } from "node:test";
import assert from "node:assert/strict";
import { awardFirstScanQuest, awardQuestOnce, FIRST_SCAN_QUEST_KEY } from "./quest-award.js";

function memoryStore(quests: Record<string, { id: string; scoreReward: number }>) {
  const completions = new Set<string>();
  const scores = new Map<string, number>();
  const store = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn({
      quest: { findUnique: async (args: { where: { key: string } }) => quests[args.where.key] ?? null },
      userQuest: {
        createMany: async (args: { data: Array<{ userId: string; questId: string }>; skipDuplicates: boolean }) => {
          assert.equal(args.skipDuplicates, true, "the unique constraint must absorb duplicates");
          let count = 0;
          for (const row of args.data) {
            const key = `${row.userId}:${row.questId}`;
            if (completions.has(key)) continue;
            completions.add(key);
            count++;
          }
          return { count };
        },
      },
      user: {
        update: async (args: { where: { id: string }; data: { score: { increment: number } } }) => {
          scores.set(args.where.id, (scores.get(args.where.id) ?? 0) + args.data.score.increment);
          return {};
        },
      },
    }),
  };
  return { store: store as never, completions, scores };
}

const FIRST_SCAN = { [FIRST_SCAN_QUEST_KEY]: { id: "q-first-scan", scoreReward: 25 } };

test("awardQuestOnce credits the quest reward exactly once", async () => {
  const { store, scores } = memoryStore(FIRST_SCAN);
  assert.deepEqual(await awardQuestOnce(store, "u1", FIRST_SCAN_QUEST_KEY), { awarded: true, scoreReward: 25 });
  assert.deepEqual(await awardQuestOnce(store, "u1", FIRST_SCAN_QUEST_KEY), { awarded: false, scoreReward: 0 });
  assert.equal(scores.get("u1"), 25);
});

test("concurrent scans of the same user credit the quest once", async () => {
  const { store, scores, completions } = memoryStore(FIRST_SCAN);
  const outcomes = await Promise.all([1, 2, 3].map(() => awardQuestOnce(store, "u2", FIRST_SCAN_QUEST_KEY)));
  assert.equal(outcomes.filter((o) => o.awarded).length, 1);
  assert.equal(completions.size, 1);
  assert.equal(scores.get("u2"), 25);
});

test("a quest already claimed elsewhere is not credited again", async () => {
  const { store, scores, completions } = memoryStore(FIRST_SCAN);
  completions.add("u3:q-first-scan");
  assert.equal((await awardQuestOnce(store, "u3", FIRST_SCAN_QUEST_KEY)).awarded, false);
  assert.equal(scores.has("u3"), false);
});

test("an unseeded quest awards nothing", async () => {
  const { store, scores } = memoryStore({});
  assert.deepEqual(await awardQuestOnce(store, "u4", FIRST_SCAN_QUEST_KEY), { awarded: false, scoreReward: 0 });
  assert.equal(scores.size, 0);
});

test("awardFirstScanQuest never throws into the scan path", async () => {
  const failing = { $transaction: async () => { throw new Error("db down"); } } as never;
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  try {
    await assert.doesNotReject(awardFirstScanQuest(failing, "u5"));
  } finally {
    console.error = original;
  }
  assert.equal(errors.length, 1);
});
