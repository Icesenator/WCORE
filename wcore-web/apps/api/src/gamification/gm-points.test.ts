import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPerChainGmPoints } from "./gm-points.js";

const DAY_MS = 86_400_000;

function utcDay(offsetDays: number): Date {
  const now = new Date();
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(todayMs + offsetDays * DAY_MS + 8 * 60 * 60 * 1000);
}

test("buildPerChainGmPoints derives count, points and streak from normalized on-chain GM events", () => {
  const stats = buildPerChainGmPoints([
    { chainKey: "BASE", createdAt: utcDay(-1) },
    { chainKey: "base", createdAt: utcDay(0) },
    { chainKey: "base", createdAt: new Date(utcDay(0).getTime() + 60 * 60 * 1000) },
    { chainKey: "CYBER", createdAt: utcDay(-5) },
  ]).sort((a, b) => a.chain.localeCompare(b.chain));

  assert.deepEqual(stats, [
    { chain: "base", count: 2, points: 12, streak: 2, bestStreak: 2 },
    { chain: "cyber", count: 1, points: 5, streak: 0, bestStreak: 1 },
  ]);
});

test("buildPerChainGmPoints reports current streak separately from best streak", () => {
  const [stats] = buildPerChainGmPoints([
    { chainKey: "BASE", createdAt: utcDay(-10) },
    { chainKey: "BASE", createdAt: utcDay(-9) },
    { chainKey: "BASE", createdAt: utcDay(-7) },
  ]);

  assert.deepEqual(stats, { chain: "base", count: 3, points: 17, streak: 0, bestStreak: 2 });
});
