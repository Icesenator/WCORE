// P1-GM-SERIE-SUIVIS-20261114, defaut 2 : serie par chaine de POST /api/gm/onchain.
import { test } from "node:test";
import assert from "node:assert/strict";
import { claimChainDailyGmWithRetry, computeChainDay, type ChainGmRow } from "./gm-streak-merge.js";

const DAY = 86_400_000;
const D = Date.UTC(2026, 10, 18); // jour J, 00:00 UTC
const at = (dayOffset: number, hour = 12) => new Date(D + dayOffset * DAY + hour * 3_600_000);
const dayStart = (dayOffset: number) => new Date(D + dayOffset * DAY);

type Row = ChainGmRow & { userId: string; chainKey: string };

// Base en memoire avec la semantique utile de Postgres : updateMany ne s'applique que si l'etat correspond
// encore a la condition (comparaison atomique), createMany(skipDuplicates) ne cree rien si (userId, chainKey) existe.
function store(initial: Row | null, hooks: { beforeWrite?: (n: number, s: { row: Row | null }) => void } = {}) {
  const s: { row: Row | null } = { row: initial ? { ...initial } : null };
  let writes = 0;
  const tx = {
    userChainGm: {
      async findUnique() { return s.row ? { ...s.row } : null; },
      async updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        hooks.beforeWrite?.(++writes, s);
        const w = a.where as { id: string; gmStreak: number; longestStreak: number; lastGmDate: Date | null };
        const r = s.row;
        const same = r && r.id === w.id && r.gmStreak === w.gmStreak && r.longestStreak === w.longestStreak
          && (r.lastGmDate?.getTime() ?? null) === (w.lastGmDate?.getTime() ?? null);
        if (!same) return { count: 0 };
        s.row = { ...r!, ...(a.data as Partial<Row>) };
        return { count: 1 };
      },
      async createMany(a: { data: Array<{ userId: string; chainKey: string; lastGmDate: Date; gmStreak: number; longestStreak: number }>; skipDuplicates: boolean }) {
        hooks.beforeWrite?.(++writes, s);
        if (s.row) return { count: 0 };
        s.row = { id: "c1", ...a.data[0]! };
        return { count: 1 };
      },
    },
  };
  return { tx, s };
}

const row = (lastGmDate: Date | null, gmStreak = 3, longestStreak = 7): Row => ({ id: "c1", userId: "u1", chainKey: "BASE", gmStreak, longestStreak, lastGmDate });
const claim = (tx: unknown, scoringDay: Date, gmDate: Date) =>
  claimChainDailyGmWithRetry({ tx: tx as never, userId: "u1", chainKey: "BASE", scoringDay, gmDate });

test("a late GM from yesterday is scored on yesterday and does not take today's place", async () => {
  const { tx, s } = store(row(at(-2)));
  const late = await claim(tx, dayStart(-1), at(-1, 22));
  assert.equal(late.claimed, true);
  assert.equal(late.chainStreak, 4);
  assert.equal(s.row!.lastGmDate!.getTime(), at(-1, 22).getTime(), "the GM's own date is stored, not the reception time");
  const todayGm = await claim(tx, dayStart(0), at(0, 9));
  assert.equal(todayGm.claimed, true, "today's GM is still credited");
  assert.equal(todayGm.chainStreak, 5);
  assert.equal(todayGm.scoreGain, 5 + 5);
});

test("yesterday is the previous UTC day, whatever the server time zone", () => {
  // 30/03/2026 : passage a l'heure d'ete a Paris. L'ancien setDate local placait la veille a 01:00 UTC.
  const scoringDay = new Date(Date.UTC(2026, 2, 30));
  const day = computeChainDay(row(new Date(Date.UTC(2026, 2, 29, 0, 30))), scoringDay);
  assert.equal(day.already, false);
  assert.equal(day.streak, 4, "29/03 00:30 UTC is yesterday: the streak continues");
});

test("a second GM on the same scoring day is not credited and writes nothing", async () => {
  let writes = 0;
  const { tx } = store(row(at(0, 8)), { beforeWrite: () => { writes++; } });
  const r = await claim(tx, dayStart(0), at(0, 15));
  assert.deepEqual([r.claimed, r.alreadyChainGm, r.scoreGain], [false, true, 0]);
  assert.equal(writes, 0);
});

test("two concurrent GMs on the same chain and day: the chain bonus is paid once", async () => {
  // Les deux requetes lisent la meme ligne (hier) ; la seconde ecrit apres que la premiere a ecrit.
  const { tx, s } = store(row(at(-1)));
  const first = await claim(tx, dayStart(0), at(0, 9));
  // Seconde requete : elle a lu l'etat d'avant (hier) ; on rejoue sa tentative contre l'etat courant.
  let reads = 0;
  const stale = row(at(-1));
  const tx2 = {
    userChainGm: {
      ...tx.userChainGm,
      async findUnique() { reads++; return reads === 1 ? { ...stale } : (s.row ? { ...s.row } : null); },
    },
  };
  const second = await claim(tx2, dayStart(0), at(0, 9, ));
  assert.equal(first.scoreGain > 0, true);
  assert.deepEqual([second.claimed, second.alreadyChainGm, second.scoreGain], [false, true, 0]);
  assert.equal(s.row!.gmStreak, 4, "the streak advanced once");
});

test("a concurrent first GM on a new chain: the losing insert does not double the bonus", async () => {
  const { tx, s } = store(null, {
    beforeWrite: (n, st) => { if (n === 1) st.row = { ...row(at(0, 8), 1, 1) }; }, // l'autre requete a cree la ligne
  });
  const r = await claim(tx, dayStart(0), at(0, 9));
  assert.deepEqual([r.claimed, r.alreadyChainGm, r.scoreGain], [false, true, 0]);
  assert.equal(s.row!.gmStreak, 1);
});

test("repeated conflicts abort with gm_conflict", async () => {
  const { tx } = store(row(at(-1)), { beforeWrite: (_n, st) => { st.row = { ...st.row!, longestStreak: st.row!.longestStreak + 1 }; } });
  await assert.rejects(() => claim(tx, dayStart(0), at(0, 9)), /gm_conflict/);
});

test("a row without a date never lowers the chain record", () => {
  const day = computeChainDay(row(null, 0, 9), dayStart(0));
  assert.deepEqual([day.streak, day.longest, day.gain], [1, 9, 5]);
});

test("an expired chain streak restarts at 1 and keeps the record", () => {
  const day = computeChainDay(row(at(-3), 6, 6), dayStart(0));
  assert.deepEqual([day.already, day.streak, day.longest, day.gain], [false, 1, 6, 5]);
});
