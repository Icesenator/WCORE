import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMergedStreak, mergeGeneralStreak, type StoredGmState, type StreakStore } from "./gm-streak-merge.js";

const DAY_MS = 86_400_000;
const NOW = new Date(Date.UTC(2026, 10, 14, 10, 0, 0));
const at = (offsetDays: number, hour = 8) => new Date(Date.UTC(2026, 10, 14) + offsetDays * DAY_MS + hour * 3_600_000);

// Faux magasin : etat du compte en memoire, updateMany conditionne comme Prisma, avec un hook qui
// simule une ecriture concurrente (GM gratuit) entre la lecture et l'ecriture.
function fakeStore(initial: StoredGmState & { score?: number }) {
  const state = { ...initial, score: initial.score ?? 0 };
  let reads = 0;
  let onRead: ((n: number) => void) | null = null;
  const store: StreakStore = {
    user: {
      async findUnique() {
        const snap = { gmStreak: state.gmStreak, longestStreak: state.longestStreak, lastGmDate: state.lastGmDate };
        reads += 1;
        if (onRead) onRead(reads);
        return snap;
      },
      async updateMany({ where, data }) {
        const w = where.lastGmDate as Date | null | undefined;
        const sameDate = (w == null && state.lastGmDate == null) || (w != null && state.lastGmDate != null && w.getTime() === state.lastGmDate.getTime());
        if (where.gmStreak !== state.gmStreak || !sameDate) return { count: 0 };
        if (typeof data.gmStreak === "number") state.gmStreak = data.gmStreak;
        if (typeof data.longestStreak === "number") state.longestStreak = data.longestStreak;
        if (data.lastGmDate instanceof Date) state.lastGmDate = data.lastGmDate;
        const inc = (data.score as { increment?: number } | undefined)?.increment;
        if (inc) state.score += inc;
        return { count: 1 };
      },
    },
  };
  return { store, state, setOnRead: (f: (n: number) => void) => { onRead = f; } };
}

const mk = (computedStreak: number, latestEventMs: number | null, computedLongest = computedStreak) =>
  (stored: StoredGmState) => mergeGeneralStreak({ computedStreak, computedLongest, latestEventMs, stored, now: NOW });

test("a concurrent free GM between read and write is not overwritten: the merge is recomputed on fresh state", async () => {
  // Evenements en chaine arretes a hier, compte a 30 / hier. Un GM gratuit ecrit 31 / aujourd'hui apres la lecture.
  const f = fakeStore({ gmStreak: 30, longestStreak: 30, lastGmDate: at(-1) });
  f.setOnRead((n) => { if (n === 1) { f.state.gmStreak = 31; f.state.longestStreak = 31; f.state.lastGmDate = at(0, 9); } });
  const r = await applyMergedStreak({ store: f.store, userId: "u", compute: mk(2, at(-1).getTime()) });
  assert.equal(f.state.gmStreak, 31, "the free GM of today survives");
  assert.equal(f.state.lastGmDate?.getTime(), at(0, 9).getTime());
  assert.equal(r.applied, false, "nothing left to change on the fresh state");
});

test("a stale snapshot never overwrites the concurrent free GM, the recomputed merge applies", async () => {
  const f = fakeStore({ gmStreak: 30, longestStreak: 30, lastGmDate: at(-1) });
  f.setOnRead((n) => { if (n === 1) { f.state.gmStreak = 31; f.state.longestStreak = 31; f.state.lastGmDate = at(0, 9); } });
  const r = await applyMergedStreak({ store: f.store, userId: "u", compute: mk(40, at(0).getTime()) });
  assert.equal(f.state.gmStreak, 40, "the larger on-chain streak applies on fresh state");
  assert.equal(r.merged.gmStreak, 40);
});

test("catch-up credits the score once, by the write that succeeds", async () => {
  const f = fakeStore({ gmStreak: 30, longestStreak: 30, lastGmDate: at(-1), score: 100 });
  f.setOnRead((n) => { if (n === 1) { f.state.gmStreak = 31; f.state.lastGmDate = at(0, 9); } });
  const r = await applyMergedStreak({ store: f.store, userId: "u", compute: mk(2, at(-1).getTime()), extraData: { score: { increment: 25 } }, alwaysWrite: true });
  assert.equal(r.applied, true);
  assert.equal(f.state.score, 125, "score credited exactly once even after a conflict");
  assert.equal(f.state.gmStreak, 31);
});

test("repeated conflicts overwrite nothing", async () => {
  const f = fakeStore({ gmStreak: 30, longestStreak: 30, lastGmDate: at(-1) });
  f.setOnRead(() => { f.state.gmStreak += 1; });
  const r = await applyMergedStreak({ store: f.store, userId: "u", compute: mk(2, at(0).getTime()), maxTries: 3 });
  assert.equal(r.applied, false);
  assert.equal(f.state.gmStreak, 33, "only the concurrent writes landed");
});

test("sequences: free then on-chain, then a second recomputation the same day", async () => {
  const a = fakeStore({ gmStreak: 30, longestStreak: 30, lastGmDate: at(-1) });
  await applyMergedStreak({ store: a.store, userId: "u", compute: mk(2, at(0).getTime()) });
  assert.equal(a.state.gmStreak, 31);
  const again = await applyMergedStreak({ store: a.store, userId: "u", compute: mk(2, at(0).getTime()) });
  assert.equal(again.applied, false);
  assert.equal(a.state.gmStreak, 31, "catch-up after self-heal does not count the day twice");
  assert.ok(a.state.lastGmDate && a.state.lastGmDate.getTime() >= at(0, 0).getTime(), "the free GM guard (lastGmDate >= today) refuses a second free GM");
});

test("several days exclusively on-chain: the streak follows the on-chain days", async () => {
  const f = fakeStore({ gmStreak: 3, longestStreak: 3, lastGmDate: at(-1) });
  const r = await applyMergedStreak({ store: f.store, userId: "u", compute: mk(4, at(0).getTime(), 4) });
  assert.equal(f.state.gmStreak, 4);
  assert.equal(r.applied, true);
});
