// Run: node --import tsx --test packages/core/src/cache/cache.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryCacheStore } from "./memory-cache.js";

test("MemoryCacheStore set and get", async () => {
  const cache = new MemoryCacheStore();
  await cache.set("key1", { data: 42 }, 60_000);
  const value = await cache.get<{ data: number }>("key1");
  assert.deepEqual(value, { data: 42 });
});

test("MemoryCacheStore returns undefined for missing key", async () => {
  const cache = new MemoryCacheStore();
  const value = await cache.get("nonexistent");
  assert.equal(value, undefined);
});

test("MemoryCacheStore TTL expiration", async () => {
  const cache = new MemoryCacheStore();
  await cache.set("expire", "value", 10);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const value = await cache.get("expire");
  assert.equal(value, undefined);
});

test("MemoryCacheStore overwrite value", async () => {
  const cache = new MemoryCacheStore();
  await cache.set("key1", "first", 60_000);
  await cache.set("key1", "second", 60_000);
  const value = await cache.get("key1");
  assert.equal(value, "second");
});

test("MemoryCacheStore delete", async () => {
  const cache = new MemoryCacheStore();
  await cache.set("key1", "value", 60_000);
  await cache.delete("key1");
  const value = await cache.get("key1");
  assert.equal(value, undefined);
});

test("MemoryCacheStore clear", async () => {
  const cache = new MemoryCacheStore();
  await cache.set("key1", "a", 60_000);
  await cache.set("key2", "b", 60_000);
  await cache.clear();
  assert.equal(await cache.get("key1"), undefined);
  assert.equal(await cache.get("key2"), undefined);
});

test("MemoryCacheStore handles different value types", async () => {
  const cache = new MemoryCacheStore();
  await cache.set("num", 123, 60_000);
  await cache.set("str", "hello", 60_000);
  await cache.set("arr", [1, 2, 3], 60_000);
  await cache.set("obj", { x: 1 }, 60_000);
  await cache.set("null", null, 60_000);

  assert.equal(await cache.get("num"), 123);
  assert.equal(await cache.get("str"), "hello");
  assert.deepEqual(await cache.get("arr"), [1, 2, 3]);
  assert.deepEqual(await cache.get("obj"), { x: 1 });
  assert.equal(await cache.get("null"), null);
});

test("MemoryCacheStore no TTL means no expiration", async () => {
  const cache = new MemoryCacheStore();
  await cache.set("forever", "alive");
  await new Promise((resolve) => setTimeout(resolve, 10));
  const value = await cache.get("forever");
  assert.equal(value, "alive");
});

test("MemoryCacheStore mget returns values in order", async () => {
  const cache = new MemoryCacheStore();
  await cache.set("a", 1);
  await cache.set("b", 2);
  await cache.set("c", 3);
  const result = await cache.mget<number>(["a", "b", "c", "missing"]);
  assert.deepEqual(result, [1, 2, 3, undefined]);
});

test("MemoryCacheStore mget handles expired entries", async () => {
  const cache = new MemoryCacheStore();
  await cache.set("x", "val", 1);
  await new Promise((r) => setTimeout(r, 5));
  const result = await cache.mget<string>(["x"]);
  assert.deepEqual(result, [undefined]);
});

test("MemoryCacheStore mget empty array returns empty", async () => {
  const cache = new MemoryCacheStore();
  const result = await cache.mget<number>([]);
  assert.deepEqual(result, []);
});

test("MemoryCacheStore add is single-use: first wins, second loses", async () => {
  const cache = new MemoryCacheStore();
  assert.equal(await cache.add("claim", "1"), true);
  assert.equal(await cache.add("claim", "1"), false);
  assert.equal(await cache.add("claim", "1"), false);
});

test("MemoryCacheStore add: concurrent claims only grant one winner", async () => {
  const cache = new MemoryCacheStore();
  const results = await Promise.all(
    Array.from({ length: 10 }, () => cache.add("race", "1", 60_000)),
  );
  assert.equal(results.filter(Boolean).length, 1);
});

test("MemoryCacheStore add: expired key can be re-claimed", async () => {
  const cache = new MemoryCacheStore();
  assert.equal(await cache.add("k", "1", 1), true);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(await cache.add("k", "1", 60_000), true);
});

test("MemoryCacheStore pipeline writes all ops and returns count", async () => {
  const cache = new MemoryCacheStore();
  const count = await cache.pipeline([
    { key: "p1", value: { a: 1 }, ttlMs: 60_000 },
    { key: "p2", value: { b: 2 }, ttlMs: 60_000 },
    { key: "p3", value: "three", ttlMs: 60_000 },
  ]);
  assert.equal(count, 3);
  assert.deepEqual(await cache.get("p1"), { a: 1 });
  assert.deepEqual(await cache.get("p2"), { b: 2 });
  assert.equal(await cache.get("p3"), "three");
});

test("MemoryCacheStore pipeline empty ops returns 0", async () => {
  const cache = new MemoryCacheStore();
  assert.equal(await cache.pipeline([]), 0);
});

test("MemoryCacheStore pipeline respects TTL", async () => {
  const cache = new MemoryCacheStore();
  await cache.pipeline([{ key: "ttl1", value: "x", ttlMs: 1 }]);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(await cache.get("ttl1"), undefined);
});
