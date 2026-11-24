// Run: node --import tsx --test apps/api/src/gamification/leaderboard.test.ts
// Prisma est un stub : aucune base n'est touchee.
import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { registerLeaderboardRoutes } from "./leaderboard.js";

const OWNER = "0x00000000000000000000000000000000000000f1";

async function appWith(users: Array<{ id: string; address: string; score: number }>) {
  let rawQueries = 0;
  const prisma = {
    user: { findMany: async () => users.map((u) => ({ ...u, gmStreak: 0, longestStreak: 0 })) },
    gmContract: { groupBy: async () => [] },
    onchainGm: { groupBy: async () => [] },
    $queryRaw: async () => { rawQueries++; return []; },
  };
  const app = Fastify();
  await registerLeaderboardRoutes(app, prisma as never, { PLATFORM_OWNER: { EVM: OWNER, SVM: "" } });
  return { app, rawQueries: () => rawQueries };
}

test("stats answer an empty leaderboard, not a 500, when only the platform owner exists", async () => {
  const { app, rawQueries } = await appWith([{ id: "owner", address: OWNER, score: 120 }]);
  for (const period of ["all", "7d", "30d"]) {
    const res = await app.inject({ method: "GET", url: `/api/leaderboard/stats?period=${period}` });
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(res.json(), { leaderboard: [], period });
  }
  assert.equal(rawQueries(), 0, "no tips query with an empty id list");
  await app.close();
});

test("stats still list the other users and exclude the platform owner", async () => {
  const { app } = await appWith([
    { id: "owner", address: OWNER, score: 120 },
    { id: "u1", address: "0x00000000000000000000000000000000000000a1", score: 25 },
  ]);
  const res = await app.inject({ method: "GET", url: "/api/leaderboard/stats?period=all" });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as { leaderboard: Array<{ address: string; score: number }> };
  assert.deepEqual(body.leaderboard.map((u) => [u.address, u.score]), [["0x00000000000000000000000000000000000000a1", 25]]);
  await app.close();
});
