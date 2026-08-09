import assert from "node:assert/strict";
import test from "node:test";
import Redis from "ioredis";
import { MemoryCacheStore } from "./memory-cache.js";
import {
  createCacheStore,
  createRedisCacheStore,
  pipelineExecError,
  type RedisClient,
} from "./redis-store.js";
import { isAtomicCacheStore } from "./types.js";

class FakeRedisClient implements RedisClient {
  evalCalls: unknown[][] = [];
  evalResults: Array<number | Error> = [];
  pingError?: Error;

  async connect() {}
  async ping() {
    if (this.pingError) throw this.pingError;
    return "PONG";
  }
  async get() { return null; }
  async set() { return "OK"; }
  async del() { return 0; }
  async scan(): Promise<[string, string[]]> { return ["0", []]; }
  async mget(keys: string[]) { return keys.map(() => null); }
  async incr() { return 1; }
  async expire() { return 1; }
  async eval(...args: unknown[]) {
    this.evalCalls.push(args);
    const result = this.evalResults.shift() ?? 0;
    if (result instanceof Error) throw result;
    return result;
  }
  pipeline() {
    return {
      set() {},
      async exec(): Promise<[Error | null, unknown][] | null> { return []; },
    };
  }
}

type RedisTestEnvironment = Record<string, string | undefined>;

function normalizedRedisUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.protocol !== "redis:" && url.protocol !== "rediss:") throw new Error();
    url.hostname = url.hostname.toLowerCase();
    return url.href;
  } catch {
    throw new Error("Test Redis URL is invalid");
  }
}

function getSafeTestRedisUrl(env: RedisTestEnvironment): string {
  if (env.WCORE_ALLOW_TEST_REDIS !== "1" || !env.TEST_REDIS_URL) {
    throw new Error("Real Redis tests require explicit opt-in and a test URL");
  }

  const normalizedTestUrl = normalizedRedisUrl(env.TEST_REDIS_URL);
  const hostname = new URL(normalizedTestUrl).hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)) {
    throw new Error("Real Redis tests require a Railway test or staging instance");
  }
  if (env.REDIS_URL && normalizedTestUrl === normalizedRedisUrl(env.REDIS_URL)) {
    throw new Error("Test Redis must differ from the configured Redis instance");
  }
  return env.TEST_REDIS_URL;
}

test("pipelineExecError rejects null, incomplete, and per-command failures", () => {
  assert.match(pipelineExecError(null, 2)!.message, /no results/);
  assert.match(pipelineExecError([[null, "OK"]], 2)!.message, /1 of 2/);
  assert.match(
    pipelineExecError([[null, "OK"], [new Error("second write failed"), null]], 2)!.message,
    /second write failed/,
  );
  assert.equal(pipelineExecError([[null, "OK"], [null, "OK"]], 2), undefined);
});

test("isAtomicCacheStore distinguishes memory from Redis", () => {
  const redis = createRedisCacheStore(new FakeRedisClient());

  assert.equal(isAtomicCacheStore(new MemoryCacheStore()), false);
  assert.equal(isAtomicCacheStore(redis), true);
  assert.equal(redis.backend, "redis");
});

test("compareAndDelete only reports release for the matching serialized owner", async () => {
  const client = new FakeRedisClient();
  client.evalResults.push(0, 1);
  const cache = createRedisCacheStore(client);

  assert.equal(await cache.compareAndDelete("lease", { owner: "wrong" }), false);
  assert.equal(await cache.compareAndDelete("lease", { owner: "right" }), true);
  assert.deepEqual(client.evalCalls.map((call) => call.slice(1)), [
    [1, "lease", JSON.stringify({ owner: "wrong" })],
    [1, "lease", JSON.stringify({ owner: "right" })],
  ]);
  assert.match(String(client.evalCalls[0]![0]), /GET/);
  assert.match(String(client.evalCalls[0]![0]), /DEL/);
});

test("a stale owner cannot release a reacquired lease", async () => {
  const client = new FakeRedisClient();
  client.evalResults.push(0);
  const cache = createRedisCacheStore(client);

  assert.equal(await cache.compareAndDelete("lease", "stale-owner"), false);
  assert.equal(client.evalCalls[0]![3], JSON.stringify("stale-owner"));
});

test("compareAndSet supports absent, current, mismatch, and PX TTL", async () => {
  const client = new FakeRedisClient();
  client.evalResults.push(1, 1, 0);
  const cache = createRedisCacheStore(client);

  assert.equal(await cache.compareAndSet("state", undefined, { version: 1 }), true);
  assert.equal(await cache.compareAndSet("state", { version: 1 }, { version: 2 }, 2500), true);
  assert.equal(await cache.compareAndSet("state", { version: 1 }, { version: 3 }), false);
  assert.deepEqual(client.evalCalls.map((call) => call.slice(1)), [
    [1, "state", "0", "", JSON.stringify({ version: 1 }), ""],
    [1, "state", "1", JSON.stringify({ version: 1 }), JSON.stringify({ version: 2 }), "2500"],
    [1, "state", "1", JSON.stringify({ version: 1 }), JSON.stringify({ version: 3 }), ""],
  ]);
  assert.match(String(client.evalCalls[1]![0]), /PX/);
});

test("incrementWithTtl uses one script call and passes a millisecond TTL", async () => {
  const client = new FakeRedisClient();
  client.evalResults.push(1, 2);
  const cache = createRedisCacheStore(client);

  assert.equal(await cache.incrementWithTtl("counter", 5000), 1);
  assert.equal(await cache.incrementWithTtl("counter", 5000), 2);
  assert.deepEqual(client.evalCalls.map((call) => call.slice(1)), [
    [1, "counter", "5000"],
    [1, "counter", "5000"],
  ]);
  assert.match(String(client.evalCalls[0]![0]), /INCR/);
  assert.match(String(client.evalCalls[0]![0]), /count == 1/);
  assert.match(String(client.evalCalls[0]![0]), /PEXPIRE/);
  await assert.rejects(cache.incrementWithTtl("counter", 0), /positive/);
  await assert.rejects(cache.incrementWithTtl("counter", 0.5), /positive integer/);
  await assert.rejects(cache.incrementWithTtl("counter", 1e100), /safe positive integer/);
  assert.equal(client.evalCalls.length, 2);
});

test("consume atomically accepts capacity without exceeding the limit", async () => {
  const client = new FakeRedisClient();
  client.evalResults.push(1, 0);
  const cache = createRedisCacheStore(client);

  assert.equal(await cache.consume?.("scan-budget", 3, 5, 60), true);
  assert.equal(await cache.consume?.("scan-budget", 3, 5, 60), false);
});

test("Redis isAvailable returns false when PING fails", async () => {
  const client = new FakeRedisClient();
  client.pingError = new Error("offline");
  const cache = createRedisCacheStore(client);

  assert.equal(await cache.isAvailable(), false);
  assert.equal(cache.errorCount, 1);
});

test("real Redis safety requires explicit opt-in without exposing URLs", () => {
  const secretUrl = "redis://user:secret@railway-test.example:6379/1";
  assert.throws(
    () => getSafeTestRedisUrl({ TEST_REDIS_URL: secretUrl }),
    (error: Error) => !error.message.includes(secretUrl) && /explicit opt-in/.test(error.message),
  );
});

test("real Redis safety rejects localhost and normalized production matches", () => {
  assert.throws(
    () => getSafeTestRedisUrl({ WCORE_ALLOW_TEST_REDIS: "1", TEST_REDIS_URL: "redis://127.0.0.1:6379/1" }),
    /Railway test or staging/,
  );
  assert.throws(
    () => getSafeTestRedisUrl({
      WCORE_ALLOW_TEST_REDIS: "1",
      TEST_REDIS_URL: "redis://user:secret@RAILWAY-TEST.example:6379/1",
      REDIS_URL: "redis://user:secret@railway-test.example:6379/1",
    }),
    /must differ/,
  );
});

const runRealRedisTests = process.env.WCORE_ALLOW_TEST_REDIS === "1" && !!process.env.TEST_REDIS_URL;
test("atomic Lua operations work against TEST_REDIS_URL", { skip: !runRealRedisTests }, async () => {
  const testRedisUrl = getSafeTestRedisUrl(process.env);
  const url = new URL(testRedisUrl);
  const prefix = `wcore-test:atomic:${process.pid}:${Date.now()}:`;
  const cache = await createCacheStore({
    host: url.hostname,
    port: Number(url.port || 6379),
    password: decodeURIComponent(url.password),
    keyPrefix: prefix,
  });
  assert.equal(isAtomicCacheStore(cache), true);
  if (!isAtomicCacheStore(cache)) return;

  try {
    assert.equal(await cache.compareAndSet("cas", undefined, "one", 5000), true);
    assert.equal(await cache.compareAndSet("cas", undefined, "two"), false);
    assert.equal(await cache.compareAndSet("cas", "one", "two"), true);
    assert.equal(await cache.compareAndDelete("cas", "one"), false);
    assert.equal(await cache.compareAndDelete("cas", "two"), true);
    assert.equal(await cache.incrementWithTtl("count", 5000), 1);
    assert.equal(await cache.incrementWithTtl("count", 5000), 2);

    const raw = new Redis(testRedisUrl, { keyPrefix: prefix, lazyConnect: true });
    try {
      await raw.connect();
      assert.ok((await raw.pttl("count")) > 0);
    } finally {
      raw.disconnect();
    }
  } finally {
    await cache.delete("cas");
    await cache.delete("count");
  }
});
