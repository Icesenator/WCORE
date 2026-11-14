import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { registerGmRoutes } from "./gm-routes.js";
import { applyMergedStreak, claimGeneralDailyGm, claimGeneralDailyGmWithRetry, mergeGeneralStreak, type StoredGmState, type StreakStore } from "./gm-streak-merge.js";

const DAY_MS = 86_400_000;
const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const todayMs = startOfUtcDay(new Date()).getTime();
const at = (offsetDays: number, hour = 8) => new Date(todayMs + offsetDays * DAY_MS + hour * 3_600_000);

interface UserRow { id: string; gmStreak: number; longestStreak: number; lastGmDate: Date | null; score: number }

// Faux Prisma : un seul compte, updateMany conditionne comme Prisma (id, gmStreak, longestStreak, lastGmDate < aujourd'hui).
function fakePrisma(row: UserRow, hooks: { afterRead?: (n: number) => void } = {}) {
  let reads = 0;
  const prisma = {
    user: {
      async findUnique(args: { where: { id: string }; select?: unknown }) {
        reads += 1;
        const snap = { ...row };
        hooks.afterRead?.(reads);
        void args;
        return snap;
      },
      async updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        const w = args.where;
        if (w.gmStreak !== undefined && w.gmStreak !== row.gmStreak) return { count: 0 };
        if (w.longestStreak !== undefined && w.longestStreak !== row.longestStreak) return { count: 0 };
        const wd = w.lastGmDate as Date | null | undefined;
        if (wd !== undefined) {
          const same = (wd == null && row.lastGmDate == null) || (wd != null && row.lastGmDate != null && wd.getTime() === row.lastGmDate.getTime());
          if (!same) return { count: 0 };
        }
        const or = w.OR as Array<{ lastGmDate: null | { lt: Date } }> | undefined;
        if (or) {
          const ok = or.some((c) => (c.lastGmDate === null ? row.lastGmDate === null : row.lastGmDate != null && row.lastGmDate.getTime() < c.lastGmDate.lt.getTime()));
          if (!ok) return { count: 0 };
        }
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
  return prisma;
}

async function postGm(prisma: unknown) {
  const app = Fastify();
  app.addHook("onRequest", async (req) => { (req as unknown as { user: { id: string } }).user = { id: "u1" }; });
  await registerGmRoutes(app, prisma as never, {
    startOfUtcDay,
    checkStreakBadges: async () => {},
    addReferralBonus: async () => {},
    getChainRpcs: () => undefined,
    rpcFetch: async () => ({}),
    FACTORIES: {},
    CONTRACT_DEPLOYED_EVENT: "0x",
    extractDeployedContractAddresses: () => [],
  });
  const res = await app.inject({ method: "POST", url: "/api/gm" });
  await app.close();
  return { status: res.statusCode, body: res.json() as Record<string, unknown> };
}

test("free GM: a repair that lands after the read is not overwritten by the stale snapshot", async () => {
  // Compte 2 / hier. Le GM gratuit lit 2 ; une reparation ecrit 9 / hier ; le GM gratuit doit recalculer : 10.
  const row: UserRow = { id: "u1", gmStreak: 2, longestStreak: 2, lastGmDate: at(-1), score: 0 };
  const prisma = fakePrisma(row, { afterRead: (n) => { if (n === 1) { row.gmStreak = 9; row.longestStreak = 9; } } });
  const r = await postGm(prisma);
  assert.equal(r.status, 200);
  assert.equal(r.body.streak, 10, "the free GM continues the repaired streak, not the stale one");
  assert.equal(row.gmStreak, 10);
  assert.equal(row.longestStreak, 10);
});

test("free GM: a repair that only moves lastGmDate after the read is not overwritten", async () => {
  // Compte 1 / avant-hier. Le GM gratuit lit : serie 1, hors serie (avant-hier) -> il repartirait a 1.
  // Une reparation ecrit seulement lastGmDate = hier (serie inchangee) : le GM gratuit doit recalculer : 2.
  const row: UserRow = { id: "u1", gmStreak: 1, longestStreak: 1, lastGmDate: at(-2), score: 0 };
  const prisma = fakePrisma(row, { afterRead: (n) => { if (n === 1) row.lastGmDate = at(-1); } });
  const r = await postGm(prisma);
  assert.equal(r.status, 200);
  assert.equal(r.body.streak, 2);
});

test("on-chain claim: a repair landing after the read makes the claim lose instead of overwriting", async () => {
  const row: UserRow = { id: "u1", gmStreak: 2, longestStreak: 2, lastGmDate: at(-1), score: 0 };
  const prisma = fakePrisma(row);
  const stale = { id: "u1", gmStreak: 2, longestStreak: 2, lastGmDate: at(-1) };
  // reparation concurrente entre la lecture et la reclamation
  row.gmStreak = 9; row.longestStreak = 100;
  const won = await claimGeneralDailyGm({ tx: prisma, user: stale, scoringDay: at(0, 0), gmDate: at(0, 9), generalStreak: 3, generalLongest: 3, scoreGain: 22 });
  assert.equal(won, false);
  assert.equal(row.gmStreak, 9);
  assert.equal(row.longestStreak, 100);
  assert.equal(row.score, 0);
  // sans concurrence, la reclamation passe
  const fresh = { id: "u1", gmStreak: 9, longestStreak: 100, lastGmDate: at(-1) };
  const won2 = await claimGeneralDailyGm({ tx: prisma, user: fresh, scoringDay: at(0, 0), gmDate: at(0, 9), generalStreak: 10, generalLongest: 100, scoreGain: 40 });
  assert.equal(won2, true);
  assert.equal(row.gmStreak, 10);
  assert.equal(row.score, 40);
});

test("on-chain claim with retry: a repair that only changes longestStreak does not cost the daily bonus, and the record is kept", async () => {
  // Lecture : 2 / hier / record 2. Reparation concurrente : record 100 seul. La reclamation perd, relit et recalcule.
  const row: UserRow = { id: "u1", gmStreak: 2, longestStreak: 2, lastGmDate: at(-1), score: 0 };
  const prisma = {
    user: {
      ...fakePrisma(row).user,
      async findUnique() { return { ...row }; },
    },
  };
  const initial = { id: "u1", gmStreak: 2, longestStreak: 2, lastGmDate: at(-1) as Date | null };
  row.longestStreak = 100;
  const r = await claimGeneralDailyGmWithRetry({ tx: prisma, userId: "u1", initial, scoringDay: at(0, 0), gmDate: at(0, 9) });
  assert.equal(r.claimed, true, "the bonus is credited, not lost");
  assert.equal(r.generalStreak, 3);
  assert.equal(r.generalLongest, 100, "the repaired record is preserved");
  assert.equal(row.longestStreak, 100);
  assert.equal(row.gmStreak, 3);
  assert.equal(row.score, 26, "20 + 3 * 2 credited exactly once");
});

test("on-chain claim with retry: when the day was taken meanwhile, no second bonus", async () => {
  const row: UserRow = { id: "u1", gmStreak: 2, longestStreak: 2, lastGmDate: at(-1), score: 0 };
  const prisma = { user: { ...fakePrisma(row).user, async findUnique() { return { ...row }; } } };
  const initial = { id: "u1", gmStreak: 2, longestStreak: 2, lastGmDate: at(-1) as Date | null };
  row.gmStreak = 3; row.lastGmDate = at(0, 7); // GM gratuit du jour entre-temps
  const r = await claimGeneralDailyGmWithRetry({ tx: prisma, userId: "u1", initial, scoringDay: at(0, 0), gmDate: at(0, 9) });
  assert.equal(r.claimed, false);
  assert.equal(r.alreadyGeneralGm, true);
  assert.equal(r.scoreGain, 0);
  assert.equal(r.generalStreak, 3);
  assert.equal(row.score, 0);
});

test("on-chain claim with retry: repeated conflicts abort with gm_conflict and write nothing", async () => {
  const row: UserRow = { id: "u1", gmStreak: 2, longestStreak: 2, lastGmDate: at(-1), score: 0 };
  let n = 0;
  const prisma = { user: { ...fakePrisma(row).user, async findUnique() { n += 1; const snap = { ...row }; row.longestStreak += 1; return snap; } } };
  const initial = { id: "u1", gmStreak: 2, longestStreak: 2, lastGmDate: at(-1) as Date | null };
  row.longestStreak += 1;
  await assert.rejects(() => claimGeneralDailyGmWithRetry({ tx: prisma, userId: "u1", initial, scoringDay: at(0, 0), gmDate: at(0, 9) }), /gm_conflict/);
  assert.equal(row.score, 0);
});

test("free GM: a second free GM the same day is refused after the first one", async () => {
  const row: UserRow = { id: "u1", gmStreak: 5, longestStreak: 5, lastGmDate: at(-1), score: 0 };
  const prisma = fakePrisma(row);
  const first = await postGm(prisma);
  const second = await postGm(prisma);
  assert.equal(first.body.streak, 6);
  assert.equal(second.body.error, "already_gm_today");
  assert.equal(row.score, 16);
});

test("free GM: repeated conflicts write nothing and answer 409", async () => {
  const row: UserRow = { id: "u1", gmStreak: 5, longestStreak: 5, lastGmDate: at(-1), score: 0 };
  const prisma = fakePrisma(row, { afterRead: () => { row.gmStreak += 1; } });
  const r = await postGm(prisma);
  assert.equal(r.status, 409);
  assert.equal(r.body.error, "gm_conflict");
  assert.equal(row.score, 0, "no score credited without a successful write");
});

test("a concurrent record in longestStreak alone is not replaced (merge write guards longestStreak too)", async () => {
  const state: StoredGmState & { score: number } = { gmStreak: 30, longestStreak: 30, lastGmDate: at(-1), score: 0 };
  let reads = 0;
  const store: StreakStore = {
    user: {
      async findUnique() {
        reads += 1;
        const snap = { gmStreak: state.gmStreak, longestStreak: state.longestStreak, lastGmDate: state.lastGmDate };
        if (reads === 1) state.longestStreak = 100; // record concurrent, seul champ modifie
        return snap;
      },
      async updateMany({ where, data }) {
        const w = where.lastGmDate as Date | null;
        const sameDate = (w == null && state.lastGmDate == null) || (w != null && state.lastGmDate != null && w.getTime() === state.lastGmDate.getTime());
        if (where.gmStreak !== state.gmStreak || where.longestStreak !== state.longestStreak || !sameDate) return { count: 0 };
        if (typeof data.gmStreak === "number") state.gmStreak = data.gmStreak;
        if (typeof data.longestStreak === "number") state.longestStreak = data.longestStreak;
        if (data.lastGmDate instanceof Date) state.lastGmDate = data.lastGmDate;
        return { count: 1 };
      },
    },
  };
  await applyMergedStreak({
    store, userId: "u1",
    compute: (stored) => mergeGeneralStreak({ computedStreak: 40, computedLongest: 40, latestEventMs: at(0).getTime(), stored }),
  });
  assert.equal(state.longestStreak, 100, "the concurrent record survives");
  assert.equal(state.gmStreak, 40);
});
