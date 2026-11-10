import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryCacheStore } from "@wcore/core";
import { changesFromHistory, dailyCloseKey, preferSourceChanges, recordDailyCloses, withHistoryChanges } from "./price-history.js";

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
