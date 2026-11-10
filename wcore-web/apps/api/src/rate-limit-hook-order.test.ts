// Run: node --import tsx --test apps/api/src/rate-limit-hook-order.test.ts
// Regression test for audit 2026-06-05 P1-2: the rate-limit onRequest hook
// must execute AFTER the auth hook so that authenticated users get the
// authenticated bucket (e.g. gm_read=300/min) instead of the anonymous one
// (gm_read_anon=60/min).
//
// Before this fix, the rate-limit onRequest hook was registered BEFORE
// authPlugin in server.ts. Fastify runs onRequest hooks in registration
// order, so the rate-limit hook saw req.user=undefined even for valid JWTs
// and treated every authenticated user as anonymous (60/min cap).
//
// Strategy: pre-fill the rate-limit counter to the anonymous cap (60) and
// call applyPostAuthRateLimit directly. The MemoryCacheStore exposes an
// atomic `incr(key, ttlSec)` that stores a plain number. A pre-set value
// of `60` makes the next call return `61`. If the limit picked is 60
// (anonymous bucket) → 61 > 60 → 429. If the limit picked is 300
// (authenticated bucket) → 61 ≤ 300 → allowed.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MemoryCacheStore, metrics } from "@wcore/core";
import { applyPostAuthRateLimit, SCAN_POLL_RATE_LIMIT, type PostAuthRateLimitDeps } from "./server-helpers.js";

const baseDeps: Omit<PostAuthRateLimitDeps, "sharedCache"> = {
  metrics,
  rateLimits: {
    scan: 2000,
    scanAnon: 100,
    auth: 30,
    leaderboard: 30,
    catchAll: 120,
    gmRead: 300,
    gmReadAnon: 60,
  },
  rateLimitIdentity: (req) => "ip:" + req.ip,
  nonceTargetAddress: () => null,
};

function makeReply(): { code: (n: number) => { send: (v: unknown) => unknown }; statusCode: number | null } {
  const reply: { code: (n: number) => { send: (v: unknown) => unknown }; statusCode: number | null } = {
    statusCode: null,
    code(n: number) {
      this.statusCode = n;
      return { send: (v: unknown) => v };
    },
  };
  return reply;
}

describe("post-auth rate-limit applies the authenticated bucket when req.user is set (audit 2026-06-05 P1-2)", () => {
  test("authenticated gm_read request at the anonymous cap (count=60) is NOT rate-limited", async () => {
    const cache = new MemoryCacheStore();
    // Pre-set the counter to the anonymous cap. `incr` stores a plain number.
    await cache.set("rate_limit:gm_read:ip:127.0.0.1", 60, 60_000);
    const reply = makeReply();
    const req = {
      method: "GET",
      url: "/api/gm/random",
      ip: "127.0.0.1",
      headers: {},
      user: { id: "user_1", address: "0x4200000000000000000000000000000000000004" },
    };
    await applyPostAuthRateLimit(req as never, reply as never, { ...baseDeps, sharedCache: cache });
    assert.equal(reply.statusCode, null, "authenticated user must keep the 300/min bucket, not 60/min");
  });

  test("anonymous gm_read request at the anonymous cap (count=60) IS rate-limited (429)", async () => {
    const cache = new MemoryCacheStore();
    await cache.set("rate_limit:gm_read:ip:127.0.0.1", 60, 60_000);
    const reply = makeReply();
    const req = {
      method: "GET",
      url: "/api/gm/random",
      ip: "127.0.0.1",
      headers: {},
      // no req.user → anonymous
    };
    await applyPostAuthRateLimit(req as never, reply as never, { ...baseDeps, sharedCache: cache });
    assert.equal(reply.statusCode, 429, "anonymous user must be capped at 60/min");
  });

  test("authenticated scan request at the anonymous cap (count=100) is NOT rate-limited", async () => {
    const cache = new MemoryCacheStore();
    await cache.set("rate_limit:scan:ip:10.0.0.1", 100, 60_000);
    const reply = makeReply();
    const req = {
      method: "POST",
      url: "/api/scan",
      ip: "10.0.0.1",
      headers: {},
      user: { id: "user_2", address: "0x5200000000000000000000000000000000000005" },
    };
    await applyPostAuthRateLimit(req as never, reply as never, { ...baseDeps, sharedCache: cache });
    assert.equal(reply.statusCode, null, "authenticated scan must use 2000/min, not 100/min");
  });

  test("anonymous scan request at the anonymous cap (count=100) IS rate-limited (429)", async () => {
    const cache = new MemoryCacheStore();
    await cache.set("rate_limit:scan:ip:10.0.0.2", 100, 60_000);
    const reply = makeReply();
    const req = {
      method: "POST",
      url: "/api/scan",
      ip: "10.0.0.2",
      headers: {},
    };
    await applyPostAuthRateLimit(req as never, reply as never, { ...baseDeps, sharedCache: cache });
    assert.equal(reply.statusCode, 429);
  });

  test("rate-limit only fires for the right bucket — an unrelated path is untouched", async () => {
    const cache = new MemoryCacheStore();
    const reply = makeReply();
    const req = {
      method: "GET",
      url: "/health",
      ip: "127.0.0.1",
      headers: {},
      user: { id: "user_3", address: "0x6200000000000000000000000000000000000006" },
    };
    await applyPostAuthRateLimit(req as never, reply as never, { ...baseDeps, sharedCache: cache });
    assert.equal(reply.statusCode, null, "/health is not in any rate-limited bucket");
  });

  test("async scan polling uses its own high-capacity bucket", async () => {
    const cache = new MemoryCacheStore();
    await cache.set("rate_limit:scan_poll:ip:127.0.0.1", SCAN_POLL_RATE_LIMIT, 60_000);
    const reply = makeReply();
    const req = {
      method: "GET",
      url: "/api/scan/async/deadbeef",
      ip: "127.0.0.1",
      headers: {},
    };
    await applyPostAuthRateLimit(req as never, reply as never, { ...baseDeps, sharedCache: cache });
    assert.equal(reply.statusCode, 429);
    assert.equal(await cache.get("rate_limit:scan:ip:127.0.0.1"), undefined);
  });
});

describe("rate-limit counter failure", () => {
  test("a store that fails to increment rejects the request and never falls back to get/set", async () => {
    const calls: string[] = [];
    const cache = new MemoryCacheStore();
    cache.incr = async () => { calls.push("incr"); throw new Error("EVAL refused"); };
    const get = cache.get.bind(cache), set = cache.set.bind(cache);
    cache.get = (async (...args: Parameters<typeof get>) => { calls.push("get"); return get(...args); }) as typeof cache.get;
    cache.set = (async (...args: Parameters<typeof set>) => { calls.push("set"); return set(...args); }) as typeof cache.set;
    const reply = makeReply();
    const req = { method: "GET", url: "/api/cmc/crypto", ip: "127.0.0.1", headers: {} };
    const realError = console.error;
    const logged: unknown[][] = [];
    console.error = (...args: unknown[]) => { logged.push(args); };
    try {
      await applyPostAuthRateLimit(req as never, reply as never, { ...baseDeps, sharedCache: cache });
    } finally {
      console.error = realError;
    }
    assert.equal(reply.statusCode, 429);
    assert.deepEqual(calls, ["incr"]);
    assert.equal(logged.length, 1, "the failure must be observable");
  });
});

describe("nonce requests are capped per IP across targets", () => {
  test("rotating the target address cannot exceed the per-IP cap", async () => {
    const { NONCE_IP_LIMIT_FACTOR } = await import("./server-helpers.js");
    const cache = new MemoryCacheStore();
    let target = 0;
    const deps = { ...baseDeps, sharedCache: cache, nonceTargetAddress: () => `0x${String(++target).padStart(40, "0")}` };
    const cap = baseDeps.rateLimits.auth * NONCE_IP_LIMIT_FACTOR;
    let accepted = 0;
    for (let i = 0; i < cap + 10; i++) {
      const reply = makeReply();
      await applyPostAuthRateLimit({ method: "GET", url: "/api/auth/nonce?address=x", ip: "10.0.0.9", headers: {} } as never, reply as never, deps);
      if (reply.statusCode === null) accepted++;
    }
    assert.equal(accepted, cap, "every distinct target is accepted until the per-IP cap, then rejected");
  });

  test("the per-target cap still applies to one address", async () => {
    const cache = new MemoryCacheStore();
    const deps = { ...baseDeps, sharedCache: cache, nonceTargetAddress: () => "0xsame" };
    let accepted = 0;
    for (let i = 0; i < baseDeps.rateLimits.auth + 5; i++) {
      const reply = makeReply();
      await applyPostAuthRateLimit({ method: "GET", url: "/api/wallets/nonce?address=x", ip: "10.0.0.10", headers: {} } as never, reply as never, deps);
      if (reply.statusCode === null) accepted++;
    }
    assert.equal(accepted, baseDeps.rateLimits.auth);
  });
});
