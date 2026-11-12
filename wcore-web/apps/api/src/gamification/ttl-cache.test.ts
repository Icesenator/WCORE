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
  cache.set("old", 1);
  t += TTL - 1;
  cache.set("young", 2);
  assert.equal(cache.size(), 2, "no sweep before a full lifetime has passed");
  t += 2;
  cache.set("new", 3);
  assert.equal(cache.get("old"), undefined, "expired entry swept");
  assert.equal(cache.get("young"), 2, "live entry kept by the sweep");
  assert.equal(cache.size(), 2);
  // Right after a sweep, an entry that expires is kept until the next lifetime has passed.
  t += TTL - 10;
  cache.set("later", 4);
  assert.equal(cache.size(), 3, "young has expired but no second sweep yet");
  t += 20;
  cache.set("last", 5);
  assert.deepEqual([cache.get("young"), cache.get("new"), cache.get("later"), cache.get("last")], [undefined, undefined, 4, 5]);
});
