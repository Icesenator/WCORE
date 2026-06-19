// Run: node --import tsx --test packages/core/src/rpc/health.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { RpcHealth, MemoryHealthStore, blockDurationMs } from "./health.js";

const MIN = 60_000;
const HOUR = 60 * MIN;

test("blockDurationMs escalation", () => {
  assert.equal(blockDurationMs(0), 30 * MIN);
  assert.equal(blockDurationMs(1), 30 * MIN);
  assert.equal(blockDurationMs(2), 30 * MIN);
  assert.equal(blockDurationMs(3), 30 * MIN);
  assert.equal(blockDurationMs(4), 2 * HOUR);
  assert.equal(blockDurationMs(5), 2 * HOUR);
  assert.equal(blockDurationMs(6), 6 * HOUR);
  assert.equal(blockDurationMs(99), 6 * HOUR);
});

test("recordFailure blocks after 2 failures", () => {
  const now = 1_000_000;
  const h = new RpcHealth(new MemoryHealthStore(), () => now);
  const ep = "https://rpc.example.com";

  assert.equal(h.isHealthy(ep), true);
  h.recordFailure(ep);
  assert.equal(h.isHealthy(ep), true, "1 failure not enough to block");
  h.recordFailure(ep);
  assert.equal(h.isHealthy(ep), false, "2 failures should block");
});

test("block expires after duration based on failure count", () => {
  let now = 1_000_000;
  const h = new RpcHealth(new MemoryHealthStore(), () => now);
  const ep = "https://rpc.example.com";

  h.recordFailure(ep);
  h.recordFailure(ep); // failures=2, block 30min
  assert.equal(h.isHealthy(ep), false);

  now += 29 * MIN;
  assert.equal(h.isHealthy(ep), false);

  now += 2 * MIN;
  assert.equal(h.isHealthy(ep), true, "block expired after 30min");
});

test("recordSuccess resets failure count", () => {
  const now = 1_000_000;
  const h = new RpcHealth(new MemoryHealthStore(), () => now);
  const ep = "https://rpc.example.com";

  h.recordFailure(ep);
  h.recordFailure(ep);
  assert.equal(h.isHealthy(ep), false);

  h.recordSuccess(ep);
  assert.equal(h.isHealthy(ep), true);
});

test("filterHealthy keeps only unblocked endpoints", () => {
  const h = new RpcHealth();
  const ep1 = "https://a.example";
  const ep2 = "https://b.example";
  h.recordFailure(ep1);
  h.recordFailure(ep1);
  const filtered = h.filterHealthy([ep1, ep2]);
  assert.deepEqual(filtered, [ep2]);
});

test("escalation: 6+ failures yield 6h block", () => {
  let now = 1_000_000;
  const h = new RpcHealth(new MemoryHealthStore(), () => now);
  const ep = "https://rpc.example.com";

  for (let i = 0; i < 6; i++) h.recordFailure(ep);
  assert.equal(h.isHealthy(ep), false);

  now += 5 * HOUR + 59 * MIN;
  assert.equal(h.isHealthy(ep), false, "still blocked at 5h59min");

  now += 2 * MIN;
  assert.equal(h.isHealthy(ep), true, "unblocked after 6h");
});
