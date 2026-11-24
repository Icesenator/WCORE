// Run: node --import tsx --test apps/api/src/gamification/leaderboard.test.ts
// Prisma est un stub : aucune base n'est touchee.
import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { registerLeaderboardRoutes } from "./leaderboard.js";

const OWNER = "0x00000000000000000000000000000000000000f1";
type U = { id: string; address: string; score: number };

// gms : nombre de GM on-chain par utilisateur sur la periode interrogee (period -> userId -> n).
async function appWith(users: U[], gms: Record<string, Record<string, number>> = {}) {
  let rawQueries = 0;
  const seenWhere: unknown[] = [];
  const prisma = {
    user: {
      findMany: async (args: { where?: { id?: { in?: string[] } } }) => {
        const ids = args?.where?.id?.in;
        return users.filter((u) => !ids || ids.includes(u.id)).map((u) => ({ ...u, gmStreak: 0, longestStreak: 0 }));
      },
    },
    gmContract: { groupBy: async () => [] },
    onchainGm: {
      groupBy: async (args: { where?: { createdAt?: unknown } }) => {
        seenWhere.push(args.where);
        const period = args.where?.createdAt ? "since" : "all";
        const byUser = gms[period] ?? gms.all ?? {};
        return Object.entries(byUser)
          .map(([userId, n]) => ({ userId, _count: { id: n } }))
          .sort((a, b) => b._count.id - a._count.id);
      },
    },
    $queryRaw: async () => { rawQueries++; return []; },
  };
  const app = Fastify();
  await registerLeaderboardRoutes(app, prisma as never, { PLATFORM_OWNER: { EVM: OWNER, SVM: "" } });
  return { app, rawQueries: () => rawQueries, seenWhere };
}

type Row = { address: string; score: number; gmCount: number };
const A1 = "0x00000000000000000000000000000000000000a1";
const A2 = "0x00000000000000000000000000000000000000a2";
const A3 = "0x00000000000000000000000000000000000000a3";

test("stats answer an empty leaderboard, not a 500, when nobody has said GM", async () => {
  const { app, rawQueries } = await appWith([{ id: "owner", address: OWNER, score: 120 }]);
  for (const period of ["all", "7d", "30d"]) {
    const res = await app.inject({ method: "GET", url: `/api/leaderboard/stats?period=${period}` });
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(res.json(), { leaderboard: [], period });
  }
  assert.equal(rawQueries(), 0, "no tips query with an empty id list");
  await app.close();
});

test("stats exclude the platform owner even when it has the most GMs", async () => {
  const { app } = await appWith(
    [{ id: "owner", address: OWNER, score: 120 }, { id: "u1", address: A1, score: 25 }],
    { all: { owner: 99, u1: 2 } },
  );
  const res = await app.inject({ method: "GET", url: "/api/leaderboard/stats?period=all" });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as { leaderboard: Row[] };
  assert.deepEqual(body.leaderboard.map((u) => [u.address, u.gmCount]), [[A1, 2]]);
  await app.close();
});

test("stats rank by GM count, not by points; equal GM counts fall back to points then address", async () => {
  const { app } = await appWith(
    [
      { id: "u1", address: A1, score: 900 }, // beaucoup de points, peu de GM
      { id: "u2", address: A2, score: 10 },  // peu de points, le plus de GM
      { id: "u3", address: A3, score: 10 },  // meme GM et memes points que u2 : adresse
    ],
    { all: { u1: 1, u2: 5, u3: 5 } },
  );
  const res = await app.inject({ method: "GET", url: "/api/leaderboard/stats?period=all" });
  const body = res.json() as { leaderboard: Row[] };
  assert.deepEqual(body.leaderboard.map((u) => [u.address, u.gmCount]), [[A2, 5], [A3, 5], [A1, 1]]);
  await app.close();
});

test("stats equal GM counts: the higher score comes first", async () => {
  const { app } = await appWith(
    [{ id: "u1", address: A1, score: 5 }, { id: "u2", address: A2, score: 50 }],
    { all: { u1: 3, u2: 3 } },
  );
  const res = await app.inject({ method: "GET", url: "/api/leaderboard/stats?period=all" });
  const body = res.json() as { leaderboard: Row[] };
  assert.deepEqual(body.leaderboard.map((u) => u.address), [A2, A1]);
  await app.close();
});

test("stats period filters the GM count itself, so the ranking can differ from all time", async () => {
  const { app, seenWhere } = await appWith(
    [{ id: "u1", address: A1, score: 0 }, { id: "u2", address: A2, score: 0 }],
    { all: { u1: 10, u2: 4 }, since: { u2: 3 } },
  );
  const all = (await app.inject({ method: "GET", url: "/api/leaderboard/stats?period=all" })).json() as { leaderboard: Row[] };
  const week = (await app.inject({ method: "GET", url: "/api/leaderboard/stats?period=7d" })).json() as { leaderboard: Row[] };
  assert.deepEqual(all.leaderboard.map((u) => [u.address, u.gmCount]), [[A1, 10], [A2, 4]]);
  assert.deepEqual(week.leaderboard.map((u) => [u.address, u.gmCount]), [[A2, 3]], "u1 has no GM in the period");
  assert.equal(seenWhere.length, 2);
  assert.ok((seenWhere[1] as { createdAt?: { gte?: Date } }).createdAt?.gte instanceof Date, "7d bounds the count by createdAt");
  await app.close();
});

test("stats: 250 users tied on GM count, the best score is still first (no cut inside a tie)", async () => {
  const users: U[] = [];
  const gms: Record<string, number> = {};
  for (let i = 0; i < 250; i++) {
    // le meilleur score est le dernier de la liste : une coupe a 200 le perdrait
    users.push({ id: `u${i}`, address: `0x${String(i).padStart(40, "0")}`, score: i });
    gms[`u${i}`] = 1;
  }
  const { app } = await appWith(users, { all: gms });
  const body = (await app.inject({ method: "GET", url: "/api/leaderboard/stats?period=all" })).json() as { leaderboard: Row[] };
  assert.equal(body.leaderboard.length, 50);
  assert.deepEqual(body.leaderboard.slice(0, 3).map((u) => u.score), [249, 248, 247]);
  assert.equal(body.leaderboard[49]?.score, 200);
  await app.close();
});

test("stats: a tie below the 100th rank does not displace users with more GMs", async () => {
  const users: U[] = [];
  const gms: Record<string, number> = {};
  for (let i = 0; i < 120; i++) {
    users.push({ id: `u${i}`, address: `0x${String(i).padStart(40, "0")}`, score: 1 });
    gms[`u${i}`] = i < 60 ? 5 : 1;
  }
  const { app } = await appWith(users, { all: gms });
  const body = (await app.inject({ method: "GET", url: "/api/leaderboard/stats?period=all" })).json() as { leaderboard: Row[] };
  assert.equal(body.leaderboard.length, 50);
  assert.ok(body.leaderboard.every((u) => u.gmCount === 5));
  await app.close();
});

test("stats keep at most 50 rows", async () => {
  const users: U[] = [];
  const gms: Record<string, number> = {};
  for (let i = 0; i < 70; i++) {
    users.push({ id: `u${i}`, address: `0x${String(i).padStart(40, "0")}`, score: i });
    gms[`u${i}`] = 1 + i;
  }
  const { app } = await appWith(users, { all: gms });
  const body = (await app.inject({ method: "GET", url: "/api/leaderboard/stats?period=all" })).json() as { leaderboard: Row[] };
  assert.equal(body.leaderboard.length, 50);
  assert.equal(body.leaderboard[0]?.gmCount, 70);
  assert.equal(body.leaderboard[49]?.gmCount, 21);
  await app.close();
});
