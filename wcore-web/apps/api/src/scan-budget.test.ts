import { test } from "node:test";
import assert from "node:assert/strict";
import { consumeScanBudget, scanRequestCost } from "./server-helpers.js";
import type { CacheStore } from "@wcore/core";

function memoryCache(): CacheStore {
  const store = new Map<string, unknown>();
  return {
    async get<T>(key: string) { return store.get(key) as T | undefined; },
    async set(key: string, value: unknown) { store.set(key, value); },
    async delete(key: string) { store.delete(key); },
  } as unknown as CacheStore;
}

test("scanRequestCost counts chain-checks, not requests", () => {
  assert.equal(scanRequestCost(1), 1);
  assert.equal(scanRequestCost(120), 120);
  // A batch multiplies the work by the number of wallets.
  assert.equal(scanRequestCost(120, 20), 2400);
  // A request always costs something, even when it asks for nothing.
  assert.equal(scanRequestCost(0), 1);
  assert.equal(scanRequestCost(Number.NaN, Number.NaN), 1);
});

test("consumeScanBudget lets normal use through", async () => {
  const cache = memoryCache();
  // A full multi-wallet refresh: 9 wallets across 182 chains.
  assert.equal(await consumeScanBudget(cache, "k", scanRequestCost(182, 9), 5000), true);
});

test("consumeScanBudget stops the amplification a request-count limit cannot see", async () => {
  const cache = memoryCache();
  const maximalBatch = scanRequestCost(120, 20); // 2400 chain-checks in one request

  // A request is admitted whenever budget remains, so a single large but legitimate
  // batch is never starved. It may overshoot once, by at most its own cost.
  assert.equal(await consumeScanBudget(cache, "k", maximalBatch, 5000), true);
  assert.equal(await consumeScanBudget(cache, "k", maximalBatch, 5000), true);
  assert.equal(await consumeScanBudget(cache, "k", maximalBatch, 5000), true); // 7200, overshoot
  // From there the budget is spent: the request-count limit would still have seen
  // only four requests out of two thousand.
  assert.equal(await consumeScanBudget(cache, "k", maximalBatch, 5000), false);
});

test("consumeScanBudget stops consuming once exhausted", async () => {
  const cache = memoryCache();
  await consumeScanBudget(cache, "k", 6000, 5000);
  const after = await cache.get<{ count: number }>("k");
  assert.equal(after?.count, 6000);
  // Further attempts are refused without inflating the counter further.
  assert.equal(await consumeScanBudget(cache, "k", 100, 5000), false);
  const unchanged = await cache.get<{ count: number }>("k");
  assert.equal(unchanged?.count, 6000);
});

test("consumeScanBudget keeps separate identities independent", async () => {
  const cache = memoryCache();
  assert.equal(await consumeScanBudget(cache, "user:a", 5000, 5000), true);
  assert.equal(await consumeScanBudget(cache, "user:b", 10, 5000), true);
});
