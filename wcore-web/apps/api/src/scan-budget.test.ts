import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryCacheStore, type CacheStore } from "@wcore/core";
import { consumeScanBudget, scanRequestCost } from "./server-helpers.js";

test("scanRequestCost counts chain-checks, not requests", () => {
  assert.equal(scanRequestCost(1), 1);
  assert.equal(scanRequestCost(120), 120);
  assert.equal(scanRequestCost(120, 20), 2400);
  assert.equal(scanRequestCost(0), 1);
  assert.equal(scanRequestCost(Number.NaN, Number.NaN), 1);
});

test("consumeScanBudget lets normal use through", async () => {
  const cache = new MemoryCacheStore();
  assert.equal(await consumeScanBudget(cache, "k", scanRequestCost(182, 9), 5000), true);
});

test("consumeScanBudget rejects work that would exceed the limit without overshoot", async () => {
  const cache = new MemoryCacheStore();
  const maximalBatch = scanRequestCost(120, 20);

  assert.equal(await consumeScanBudget(cache, "k", maximalBatch, 5000), true);
  assert.equal(await consumeScanBudget(cache, "k", maximalBatch, 5000), true);
  assert.equal(await consumeScanBudget(cache, "k", maximalBatch, 5000), false);
  assert.equal(await cache.get<number>("k"), 4800);
});

test("consumeScanBudget rejects an oversized first request without consuming", async () => {
  const cache = new MemoryCacheStore();
  assert.equal(await consumeScanBudget(cache, "k", 5001, 5000), false);
  assert.equal(await cache.get("k"), undefined);
});

test("consumeScanBudget keeps separate identities independent", async () => {
  const cache = new MemoryCacheStore();
  assert.equal(await consumeScanBudget(cache, "user:a", 5000, 5000), true);
  assert.equal(await consumeScanBudget(cache, "user:b", 10, 5000), true);
});

test("consumeScanBudget never overshoots under concurrent requests", async () => {
  const cache = new MemoryCacheStore();
  const results = await Promise.all(Array.from({ length: 100 }, () => consumeScanBudget(cache, "k", 75, 1000)));
  assert.equal(results.filter(Boolean).length, 13);
  assert.equal(await cache.get<number>("k"), 975);
});

test("consumeScanBudget fails closed when atomic consume is unavailable or errors", async () => {
  assert.equal(await consumeScanBudget({} as CacheStore, "k", 1, 10), false);
  const failing = { consume: async () => { throw new Error("cache down"); } } as unknown as CacheStore;
  assert.equal(await consumeScanBudget(failing, "k", 1, 10), false);
});
