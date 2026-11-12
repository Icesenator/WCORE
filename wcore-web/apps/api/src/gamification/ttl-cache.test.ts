import { test } from "node:test";
import assert from "node:assert/strict";
import { createTtlCache } from "./ttl-cache.js";

const TTL = 5 * 60 * 1000;

test("an entry is served until its lifetime ends, then dropped on read", () => {
  let t = 1_000_000;
  const cache = createTtlCache<boolean>(TTL, () => t);
  cache.set("a", true);
  cache.set("b", false);
  assert.equal(cache.get("a"), true);
  assert.equal(cache.get("b"), false, "a stored false is a hit, not a miss");
  t += TTL;
  assert.equal(cache.get("a"), true, "still valid at the exact end of the lifetime");
  t += 1;
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.size(), 1, "only the entry that was read is dropped by get");
});

test("entries that are never read again are dropped by a later write", () => {
  let t = 1_000_000;
  const cache = createTtlCache<boolean>(TTL, () => t);
  // One key per day and per address: yesterday's keys are never asked for again.
  for (let i = 0; i < 500; i++) cache.set(`chain:0x${i}:2026-11-11`, true);
  assert.equal(cache.size(), 500);
  t += TTL + 1;
  cache.set("chain:0x0:2026-11-12", true);
  assert.equal(cache.size(), 1, "the expired entries are gone, the new one stays");
  assert.equal(cache.get("chain:0x0:2026-11-12"), true);
});

test("the sweep runs at most once per lifetime and never drops a live entry", () => {
  let t = 1_000_000;
  const cache = createTtlCache<number>(TTL, () => t);
  cache.set("old", 1); // expires at t0 + TTL
  t += TTL - 1;
  cache.set("young", 2); // expires at t0 + 2*TTL - 1
  assert.equal(cache.size(), 2, "no sweep before a full lifetime has passed");
  t += 2; // t0 + TTL + 1: first sweep
  cache.set("new", 3); // expires at t0 + 2*TTL + 1
  assert.equal(cache.size(), 2, "the expired entry is swept, the live one is kept");
  assert.equal(cache.get("young"), 2);
  t += TTL - 1; // t0 + 2*TTL: young has expired, the last sweep is TTL - 1 old
  cache.set("later", 4);
  assert.equal(cache.size(), 3, "an expired entry is still counted: no second sweep within one lifetime");
  t += 2; // t0 + 2*TTL + 2: second sweep, young and new have both expired
  cache.set("last", 5);
  assert.equal(cache.size(), 2, "the write swept both expired entries");
  assert.deepEqual([cache.get("later"), cache.get("last")], [4, 5]);
});

test("a clock that steps back does not suspend the sweep", () => {
  const t0 = 10_000_000;
  let t = t0 + 10 * TTL;
  const cache = createTtlCache<number>(TTL, () => t);
  t += TTL;
  cache.set("future", 1); // sweep recorded far ahead of the corrected clock below
  t = t0; // the clock is corrected backwards
  cache.set("a", 2); // expires at t0 + TTL
  t = t0 + TTL + 1;
  cache.set("b", 3);
  // Without the step-back rule the sweep would wait until the clock reaches the old future again.
  assert.equal(cache.size(), 2, "the expired entry is swept although the last sweep lies in the future");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), 3);
});
