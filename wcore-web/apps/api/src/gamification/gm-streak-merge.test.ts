import { test } from "node:test";
import assert from "node:assert/strict";
import { claimGeneralDailyGmWithRetry, gmEventDate, mergeGeneralStreak, reconcileGeneralFromOnchain, utcDayStartMs, type StoredGmState } from "./gm-streak-merge.js";

const DAY_MS = 86_400_000;
const NOW = new Date(Date.UTC(2026, 10, 14, 10, 0, 0)); // 14/11/2026 10:00 UTC
const at = (offsetDays: number, hour = 8) => new Date(Date.UTC(2026, 10, 14) + offsetDays * DAY_MS + hour * 3_600_000);

test("a valid stored streak is not lowered by an on-chain-only recomputation (the reported bug)", () => {
  // 30 jours au bouton gratuit, dernier GM hier ; un GM en chaine aujourd'hui, serie en chaine = 2.
  const r = mergeGeneralStreak({
    computedStreak: 2, computedLongest: 2, latestEventMs: at(0).getTime(),
    stored: { gmStreak: 30, longestStreak: 30, lastGmDate: at(-1) }, now: NOW,
  });
  assert.equal(r.gmStreak, 31, "yesterday's stored streak continues with today's on-chain GM");
  assert.equal(r.longestStreak, 31);
  assert.equal(r.changed, true);
});

test("same day, a second recomputation is idempotent: the day is counted once", () => {
  const first = mergeGeneralStreak({
    computedStreak: 2, computedLongest: 2, latestEventMs: at(0).getTime(),
    stored: { gmStreak: 30, longestStreak: 30, lastGmDate: at(-1) }, now: NOW,
  });
  const second = mergeGeneralStreak({
    computedStreak: 2, computedLongest: 2, latestEventMs: at(0).getTime(),
    stored: { gmStreak: first.gmStreak, longestStreak: first.longestStreak, lastGmDate: first.lastGmDate }, now: NOW,
  });
  assert.equal(second.gmStreak, 31);
  assert.equal(second.changed, false);
});

test("stored streak already counted today is kept", () => {
  const r = mergeGeneralStreak({
    computedStreak: 1, computedLongest: 1, latestEventMs: at(0, 9).getTime(),
    stored: { gmStreak: 12, longestStreak: 15, lastGmDate: at(0, 7) }, now: NOW,
  });
  assert.equal(r.gmStreak, 12);
  assert.equal(r.longestStreak, 15);
});

test("an expired stored streak is not resurrected: the on-chain value applies", () => {
  const r = mergeGeneralStreak({
    computedStreak: 1, computedLongest: 1, latestEventMs: at(0).getTime(),
    stored: { gmStreak: 30, longestStreak: 30, lastGmDate: at(-5) }, now: NOW,
  });
  assert.equal(r.gmStreak, 1);
  assert.equal(r.longestStreak, 30, "the record is never lowered");
});

test("a longer on-chain streak still wins", () => {
  const r = mergeGeneralStreak({
    computedStreak: 9, computedLongest: 9, latestEventMs: at(0).getTime(),
    stored: { gmStreak: 3, longestStreak: 3, lastGmDate: at(-1) }, now: NOW,
  });
  assert.equal(r.gmStreak, 9);
  assert.equal(r.longestStreak, 9);
});

test("lastGmDate never goes backwards", () => {
  const r = mergeGeneralStreak({
    computedStreak: 0, computedLongest: 4, latestEventMs: at(-3).getTime(),
    stored: { gmStreak: 5, longestStreak: 5, lastGmDate: at(-1) }, now: NOW,
  });
  assert.equal(r.lastGmDate?.getTime(), at(-1).getTime());
  assert.equal(r.gmStreak, 5, "stored streak (last GM yesterday) still valid");
});

test("a slightly future stored lastGmDate (clock drift) is not judged expired", () => {
  // Dans la marge (5 min d'avance) : date legitime, jamais reculee.
  const slightlyAhead = new Date(NOW.getTime() + 5 * 60_000);
  const r = mergeGeneralStreak({
    computedStreak: 1, computedLongest: 1, latestEventMs: at(0).getTime(),
    stored: { gmStreak: 12, longestStreak: 12, lastGmDate: slightlyAhead }, now: NOW,
  });
  assert.equal(r.gmStreak, 12);
  assert.equal(r.lastGmDate?.getTime(), slightlyAhead.getTime(), "lastGmDate never goes backwards");
});

// P1-GM-SERIE-SUIVIS-20261114, defaut 3 (relecture Codex, point 3) : au-dela de la marge, la date n'est pas
// utilisable et bloquerait toute reclamation jusqu'a elle : elle est ramenee au dernier evenement non futur.
test("a stored lastGmDate beyond the clock margin is brought back to the latest non-future event", () => {
  const r = mergeGeneralStreak({
    computedStreak: 1, computedLongest: 1, latestEventMs: at(0).getTime(),
    stored: { gmStreak: 12, longestStreak: 12, lastGmDate: at(1, 2) }, now: NOW,
  });
  assert.equal(r.gmStreak, 12, "the stored streak is kept");
  assert.equal(r.lastGmDate?.getTime(), at(0).getTime());
  assert.equal(r.changed, true);
});

test("a far-future stored lastGmDate with no event is brought back to now, never left in the future", () => {
  const r = mergeGeneralStreak({
    computedStreak: 0, computedLongest: 0, latestEventMs: null,
    stored: { gmStreak: 4, longestStreak: 4, lastGmDate: at(3) }, now: NOW,
  });
  assert.equal(r.lastGmDate?.getTime(), NOW.getTime());
  assert.equal(r.gmStreak, 4);
});

test("no stored date and no event: nothing changes", () => {
  const r = mergeGeneralStreak({
    computedStreak: 0, computedLongest: 0, latestEventMs: null,
    stored: { gmStreak: 0, longestStreak: 0, lastGmDate: null }, now: NOW,
  });
  assert.deepEqual({ s: r.gmStreak, l: r.longestStreak, d: r.lastGmDate, c: r.changed }, { s: 0, l: 0, d: null, c: false });
});

test("the UTC day boundary decides: 23:30 UTC yesterday is yesterday, 00:30 UTC today is today", () => {
  const r = mergeGeneralStreak({
    computedStreak: 1, computedLongest: 1, latestEventMs: Date.UTC(2026, 10, 14, 0, 30),
    stored: { gmStreak: 7, longestStreak: 7, lastGmDate: new Date(Date.UTC(2026, 10, 13, 23, 30)) }, now: NOW,
  });
  assert.equal(r.gmStreak, 8);
});

// P1-GM-SERIE-SUIVIS-20261114, defaut 3 : serie stockee arretee avant hier, continuite prouvee par les GM en chaine.
test("a stored streak ending two days ago continues when an on-chain GM proves yesterday (10 + J-1 = 11)", () => {
  const r = mergeGeneralStreak({
    computedStreak: 1, computedLongest: 1, latestEventMs: at(-1).getTime(),
    stored: { gmStreak: 10, longestStreak: 10, lastGmDate: at(-2) }, now: NOW,
  });
  assert.equal(r.gmStreak, 11);
  assert.equal(r.longestStreak, 11);
  assert.equal(r.lastGmDate!.getTime(), at(-1).getTime());
});

test("J-1 and J proven on-chain after a stored streak ending at J-2: 10 + 2 = 12", () => {
  const r = mergeGeneralStreak({
    computedStreak: 2, computedLongest: 2, latestEventMs: at(0).getTime(),
    stored: { gmStreak: 10, longestStreak: 10, lastGmDate: at(-2) }, now: NOW,
  });
  assert.equal(r.gmStreak, 12);
});

test("a missing day is never filled: stored J-2 and an on-chain GM at J only give 1", () => {
  const r = mergeGeneralStreak({
    computedStreak: 1, computedLongest: 1, latestEventMs: at(0).getTime(),
    stored: { gmStreak: 10, longestStreak: 10, lastGmDate: at(-2) }, now: NOW,
  });
  assert.equal(r.gmStreak, 1);
  assert.equal(r.longestStreak, 10);
});

test("an on-chain run overlapping the stored end does not count a day twice", () => {
  // Serie stockee de 10 finissant a J-2 ; la suite en chaine couvre J-3, J-2 et J-1 (3 jours).
  const r = mergeGeneralStreak({
    computedStreak: 3, computedLongest: 3, latestEventMs: at(-1).getTime(),
    stored: { gmStreak: 10, longestStreak: 10, lastGmDate: at(-2) }, now: NOW,
  });
  assert.equal(r.gmStreak, 11);
});

test("the extension is idempotent: a second recomputation keeps 11", () => {
  const first = mergeGeneralStreak({
    computedStreak: 1, computedLongest: 1, latestEventMs: at(-1).getTime(),
    stored: { gmStreak: 10, longestStreak: 10, lastGmDate: at(-2) }, now: NOW,
  });
  const second = mergeGeneralStreak({
    computedStreak: 1, computedLongest: 1, latestEventMs: at(-1).getTime(),
    stored: { gmStreak: first.gmStreak, longestStreak: first.longestStreak, lastGmDate: first.lastGmDate }, now: NOW,
  });
  assert.equal(second.gmStreak, 11);
  assert.equal(second.changed, false);
});

// --- Relecture Codex de la PR 196 ---

// Faux compte : findUnique et updateMany conditionne comme Prisma (egalites, OR lastGmDate null / lt).
function fakeUserStore(row: { id: string; score: number } & StoredGmState) {
  const same = (a: Date | null, b: Date | null) => (a == null && b == null) || (a != null && b != null && a.getTime() === b.getTime());
  return {
    row,
    user: {
      async findUnique(_args: { where: { id: string }; select?: unknown }) { return { ...row }; },
      async updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        const w = args.where;
        if (w.gmStreak !== undefined && w.gmStreak !== row.gmStreak) return { count: 0 };
        if (w.longestStreak !== undefined && w.longestStreak !== row.longestStreak) return { count: 0 };
        if (w.lastGmDate !== undefined && !same(w.lastGmDate as Date | null, row.lastGmDate)) return { count: 0 };
        const or = w.OR as Array<{ lastGmDate: null | { lt: Date } }> | undefined;
        if (or && !or.some((c) => (c.lastGmDate === null ? row.lastGmDate === null : row.lastGmDate != null && row.lastGmDate.getTime() < c.lastGmDate.lt.getTime()))) return { count: 0 };
        const d = args.data;
        if (typeof d.gmStreak === "number") row.gmStreak = d.gmStreak;
        if (typeof d.longestStreak === "number") row.longestStreak = d.longestStreak;
        if (d.lastGmDate instanceof Date) row.lastGmDate = d.lastGmDate;
        const inc = (d.score as { increment?: number } | undefined)?.increment;
        if (inc) row.score += inc;
        return { count: 1 };
      },
    },
  };
}

// Meme enchainement que POST /api/gm/onchain : reconciliation depuis les GM deja enregistres, reclamation du jour
// de scoring, puis reconciliation apres la transaction (avec la ligne du GM).
async function postOnchainGm(store: ReturnType<typeof fakeUserStore>, priorRows: Date[], eventAt: Date, now: Date) {
  const gmDate = gmEventDate(eventAt, now);
  const scoringDay = new Date(utcDayStartMs(gmDate));
  await reconcileGeneralFromOnchain({ store: store as never, userId: "u1", createdAts: priorRows, now, neverLower: true });
  const general = await claimGeneralDailyGmWithRetry({ tx: store as never, userId: "u1", initial: { ...store.row }, scoringDay, gmDate });
  await reconcileGeneralFromOnchain({ store: store as never, userId: "u1", createdAts: [...priorRows, gmDate], now });
  return general;
}

test("point 1: an event at 00:01 seen at 23:59 UTC is dated now, never on the next UTC day", () => {
  const now = new Date(Date.UTC(2026, 10, 14, 23, 59));
  const event = new Date(Date.UTC(2026, 10, 15, 0, 1));
  assert.equal(gmEventDate(event, now).getTime(), now.getTime());
  assert.equal(utcDayStartMs(gmEventDate(event, now)), Date.UTC(2026, 10, 14), "scoring day = current UTC day");
  const past = new Date(Date.UTC(2026, 10, 14, 9));
  assert.equal(gmEventDate(past, now).getTime(), past.getTime(), "a past event keeps its own date");
  assert.equal(gmEventDate(undefined, now).getTime(), now.getTime());
});

test("point 1: after a GM at 23:59 whose event says 00:01, the next day's GM is not refused", async () => {
  const store = fakeUserStore({ id: "u1", score: 0, gmStreak: 3, longestStreak: 3, lastGmDate: new Date(Date.UTC(2026, 10, 13, 8)) });
  const nowJ = new Date(Date.UTC(2026, 10, 14, 23, 59));
  const first = await postOnchainGm(store, [], new Date(Date.UTC(2026, 10, 15, 0, 1)), nowJ);
  assert.equal(first.claimed, true);
  assert.equal(store.row.lastGmDate!.getTime(), nowJ.getTime(), "lastGmDate stays on day J");
  const nowJ1 = new Date(Date.UTC(2026, 10, 15, 9));
  const second = await postOnchainGm(store, [nowJ], nowJ1, nowJ1);
  assert.equal(second.claimed, true, "day J+1 is still open");
  assert.equal(store.row.gmStreak, 5);
});

test("point 2: stored 10 ending J-2 + a recorded GM of J-1, the POST of J gives 12 end to end", async () => {
  const store = fakeUserStore({ id: "u1", score: 0, gmStreak: 10, longestStreak: 10, lastGmDate: at(-2) });
  const general = await postOnchainGm(store, [at(-1)], at(0, 9), NOW);
  assert.equal(general.generalStreak, 12, "today's bonus is computed on the continued streak");
  assert.equal(store.row.gmStreak, 12);
  assert.equal(store.row.longestStreak, 12);
  assert.equal(store.row.lastGmDate!.getTime(), at(0, 9).getTime());
});

test("point 3: a lastGmDate stored in the future no longer refuses the on-chain GM of today", async () => {
  // Ancien GM d'hier stocke avec un horodatage futur (J+3) : lastGmDate J+3 bloquait toute reclamation.
  const store = fakeUserStore({ id: "u1", score: 0, gmStreak: 5, longestStreak: 5, lastGmDate: at(3) });
  const general = await postOnchainGm(store, [at(-1), at(3)], at(0, 9), NOW);
  assert.equal(general.claimed, true, "the claim is not refused as already done");
  assert.equal(store.row.gmStreak, 6);
  assert.ok(store.row.lastGmDate!.getTime() <= NOW.getTime(), "lastGmDate is no longer in the future");
});

test("a late GM of J-1 still continues a stored streak ending at J-2 when an older on-chain GM is recorded (11)", async () => {
  // La reconciliation avant la reclamation juge la serie expiree par rapport a maintenant : elle ne doit pas la
  // baisser, la reclamation du jour J-1 la prolonge.
  const store = fakeUserStore({ id: "u1", score: 0, gmStreak: 10, longestStreak: 10, lastGmDate: at(-2) });
  const general = await postOnchainGm(store, [at(-10)], at(-1), NOW);
  assert.equal(general.generalStreak, 11);
  assert.equal(store.row.gmStreak, 11);
  assert.equal(store.row.longestStreak, 11);
});

test("a stored streak ending at J-3 with a GM at J-1 and none at J-2 is not inflated by the POST of J (2, not 11)", async () => {
  const store = fakeUserStore({ id: "u1", score: 0, gmStreak: 10, longestStreak: 10, lastGmDate: at(-3) });
  const general = await postOnchainGm(store, [at(-1)], at(0, 9), NOW);
  assert.equal(general.generalStreak, 1, "no continuity from J-3: the claim restarts at 1");
  assert.equal(store.row.gmStreak, 2, "J-1 and J proven on-chain");
  assert.equal(store.row.longestStreak, 10);
});

// Batterie en table : serie stockee, jours des GM en chaine deja enregistres, date de l'evenement du POST (a NOW).
const POST_CASES: Array<{ name: string; stored: [number, number]; chain: Date[]; event: Date; streak: number; claimed: boolean }> = [
  { name: "exact continuity (10 at J-2 + J-1, POST J)", stored: [10, -2], chain: [at(-1)], event: at(0, 9), streak: 12, claimed: true },
  { name: "a gap (10 at J-3 + J-1, POST J)", stored: [10, -3], chain: [at(-1)], event: at(0, 9), streak: 2, claimed: true },
  { name: "overlap (10 at J-2, chain J-3..J-1, POST J)", stored: [10, -2], chain: [at(-3), at(-2), at(-1)], event: at(0, 9), streak: 12, claimed: true },
  { name: "late GM of yesterday (10 at J-2, old GM J-10, POST of J-1)", stored: [10, -2], chain: [at(-10)], event: at(-1), streak: 11, claimed: true },
  { name: "no on-chain GM, stored yesterday (10 at J-1, POST J)", stored: [10, -1], chain: [], event: at(0, 9), streak: 11, claimed: true },
  { name: "no on-chain GM, expired (10 at J-3, POST J)", stored: [10, -3], chain: [], event: at(0, 9), streak: 1, claimed: true },
  { name: "future lastGmDate (5 at J+3, chain J-1 and J+3, POST J)", stored: [5, 3], chain: [at(-1), at(3)], event: at(0, 9), streak: 6, claimed: true },
];
for (const c of POST_CASES) {
  test(`POST table: ${c.name}`, async () => {
    const store = fakeUserStore({ id: "u1", score: 0, gmStreak: c.stored[0], longestStreak: c.stored[0], lastGmDate: at(c.stored[1]) });
    const general = await postOnchainGm(store, c.chain, c.event, NOW);
    assert.equal(general.claimed, c.claimed);
    assert.equal(store.row.gmStreak, c.streak);
    assert.ok(store.row.lastGmDate!.getTime() <= NOW.getTime() + 10 * 60_000, "lastGmDate never left in the future");
  });
}