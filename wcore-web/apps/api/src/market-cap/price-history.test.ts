import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryCacheStore } from "@wcore/core";
import { changesFromHistory, dailyCloseKey, preferSourceChanges, recordDailyCloses, rowChanges, withHistoryChanges } from "./price-history.js";

const day = (iso: string) => new Date(`${iso}T15:00:00.000Z`);

test("recordDailyCloses keeps the latest price of the UTC day per symbol", async () => {
  const cache = new MemoryCacheStore();
  await recordDailyCloses(cache, "stock", [{ symbol: "AAPL", priceEur: 100 }], new Date("2026-11-10T08:00:00.000Z"));
  await recordDailyCloses(cache, "stock", [{ symbol: "AAPL", priceEur: 110 }, { symbol: "MSFT", priceEur: null }], new Date("2026-11-10T20:00:00.000Z"));
  const stored = await cache.get<Record<string, number>>(dailyCloseKey("stock", "2026-11-10"));
  assert.deepEqual(stored, { AAPL: 110 });
});

test("changesFromHistory compares with the closes of 1, 7 and 30 days earlier", async () => {
  const cache = new MemoryCacheStore();
  await recordDailyCloses(cache, "stock", [{ symbol: "AAPL", priceEur: 100 }], day("2026-11-09"));
  await recordDailyCloses(cache, "stock", [{ symbol: "AAPL", priceEur: 80 }], day("2026-11-03"));
  await recordDailyCloses(cache, "stock", [{ symbol: "AAPL", priceEur: 50 }], day("2026-10-11"));
  const changes = await changesFromHistory(cache, "stock", [{ symbol: "AAPL", priceEur: 110 }], day("2026-11-10"));
  const c = changes.get("AAPL")!;
  assert.equal(Math.round(c.d1! * 100) / 100, 10);
  assert.equal(Math.round(c.w1! * 100) / 100, 37.5);
  assert.equal(Math.round(c.m1! * 100) / 100, 120);
  assert.equal(c.h1, null);
});

test("a missing history day gives null, never a zero change", async () => {
  const cache = new MemoryCacheStore();
  const changes = await changesFromHistory(cache, "stock", [{ symbol: "AAPL", priceEur: 110 }, { symbol: "X", priceEur: null }], day("2026-11-10"));
  assert.deepEqual(changes.get("AAPL"), { h1: null, d1: null, w1: null, m1: null });
  assert.deepEqual(changes.get("X"), { h1: null, d1: null, w1: null, m1: null });
});

test("withHistoryChanges records once per snapshot and adds changes to each row", async () => {
  const cache = new MemoryCacheStore();
  await recordDailyCloses(cache, "stock", [{ symbol: "AAPL", priceEur: 100 }], day("2026-11-09"));
  let writes = 0;
  const counting = Object.assign(Object.create(Object.getPrototypeOf(cache)), cache, {
    set: async (k: string, v: unknown, t?: number) => { writes++; return cache.set(k, v, t); },
  });
  const snapshot = { generatedAt: "2026-11-10T15:00:00.000Z", rows: [{ symbol: "AAPL", priceEur: 110 }] };
  const a = await withHistoryChanges(counting, "stock", snapshot, day("2026-11-10"));
  const b = await withHistoryChanges(counting, "stock", snapshot, day("2026-11-10"));
  assert.equal(writes, 1, "the same snapshot is recorded once");
  assert.equal(Math.round(a.get("AAPL")!.d1! * 100) / 100, 10);
  assert.deepEqual(b.get("AAPL"), a.get("AAPL"));
});

test("a cache failure never breaks the page: changes are null", async () => {
  const broken = {
    get: async () => { throw new Error("down"); }, set: async () => { throw new Error("down"); },
    mget: async () => { throw new Error("down"); }, delete: async () => {}, clear: async () => {},
  } as never;
  const changes = await withHistoryChanges(broken, "stock", { generatedAt: "g-broken", rows: [{ symbol: "AAPL", priceEur: 1 }] }, day("2026-11-10"));
  assert.deepEqual(changes.get("AAPL"), { h1: null, d1: null, w1: null, m1: null });
});

test("preferSourceChanges takes the source per period and falls back to history", () => {
  const history = { h1: null, d1: 1, w1: 2, m1: 3 };
  assert.deepEqual(preferSourceChanges({ d1: 9, w1: null, m1: null }, history), { h1: null, d1: 9, w1: 2, m1: 3 });
  assert.deepEqual(preferSourceChanges(undefined, history), history);
  assert.deepEqual(preferSourceChanges({ d1: 9, w1: null, m1: null }, undefined), { h1: null, d1: 9, w1: null, m1: null });
  assert.equal(preferSourceChanges(undefined, undefined), null);
});

test("a snapshot is recorded on its own day, not on the day it is viewed", async () => {
  const cache = new MemoryCacheStore();
  await recordDailyCloses(cache, "stock", [{ symbol: "AAPL", priceEur: 100 }], day("2026-11-08"));
  // Instantane du 09/11 servi (cache, panne de reconstruction) et consulte le 10/11.
  const changes = await withHistoryChanges(cache, "stock", { generatedAt: "2026-11-09T21:00:00.000Z", rows: [{ symbol: "AAPL", priceEur: 105 }] }, day("2026-11-10"));
  assert.deepEqual(await cache.get(dailyCloseKey("stock", "2026-11-09")), { AAPL: 105 });
  assert.equal(await cache.get(dailyCloseKey("stock", "2026-11-10")), undefined, "today gets no artificial close");
  assert.equal(Math.round(changes.get("AAPL")!.d1! * 100) / 100, 5, "the change compares with the day before the snapshot");
});

test("a stale row never carries changes, even when the same snapshot was served fresh before", async () => {
  const cache = new MemoryCacheStore();
  await recordDailyCloses(cache, "stock", [{ symbol: "MSFT", priceEur: 100 }], day("2026-11-08"));
  const snapshot = { generatedAt: "2026-11-09T21:30:00.000Z", rows: [{ symbol: "MSFT", priceEur: 105 }] };
  const history = await withHistoryChanges(cache, "stock", snapshot, day("2026-11-10"));
  const source = { d1: 1.5, w1: 2, m1: null };
  assert.ok(rowChanges(false, source, history.get("MSFT"))!.d1 !== null, "fresh row keeps its changes");
  // Meme generatedAt, la ligne devient perimee : le memo rend les memes variations, la sortie non.
  const memoized = await withHistoryChanges(cache, "stock", { ...snapshot, rows: [{ symbol: "MSFT", priceEur: null }] }, day("2026-11-10"));
  assert.equal(rowChanges(true, source, memoized.get("MSFT")), null);
  assert.equal(rowChanges(true, null, null), null);
});
