import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { DependencyTransitionTracker, auditEvmRpcChains, dependencyHealthStatus } from "./plugins/admin.js";

describe("API dependency health", () => {
  test("Redis failure degrades status even when the database is healthy", () => {
    assert.equal(dependencyHealthStatus(true, false, 0), "degraded");
    assert.equal(dependencyHealthStatus(false, true, 0), "down");
    assert.equal(dependencyHealthStatus(true, true, 1), "degraded");
  });

  test("dependency alerts and ops events are emitted once per transition", async () => {
    const events: string[] = [];
    const alerts: string[] = [];
    const tracker = new DependencyTransitionTracker({
      recordOpsEvent: async (type) => { events.push(type); },
      sendAlert: async (alert) => { alerts.push(alert.type); },
    });

    await tracker.observe({ db: true, redis: true });
    await tracker.observe({ db: true, redis: false });
    await tracker.observe({ db: true, redis: false });
    await tracker.observe({ db: true, redis: true });

    assert.deepEqual(events, ["redis_down", "redis_recovered"]);
    assert.deepEqual(alerts, events);
  });

  test("an initially unavailable dependency emits a down transition", async () => {
    const events: string[] = [];
    const tracker = new DependencyTransitionTracker({
      recordOpsEvent: async (type) => { events.push(type); },
      sendAlert: async () => {},
    });

    await tracker.observe({ db: false, redis: true });
    assert.deepEqual(events, ["db_down"]);
  });

  test("RPC lifecycle audit identifies dead and mismatched EVM chains", async () => {
    const chains = [
      { key: "ALIVE", vm: "EVM", CHAIN: { CHAIN_ID: 1 }, RPC: { ENDPOINTS: ["https://alive"] } },
      { key: "DEAD", vm: "EVM", CHAIN: { CHAIN_ID: 2 }, RPC: { ENDPOINTS: ["https://dead"] } },
      { key: "MISMATCH", vm: "EVM", CHAIN: { CHAIN_ID: 3 }, RPC: { ENDPOINTS: ["https://wrong"] } },
      { key: "COSMOS", vm: "COSMOS", CHAIN: { CHAIN_ID: "cosmoshub-4" }, RPC: { ENDPOINTS: ["https://cosmos"] } },
    ];
    const fetcher = async (url: string) => {
      if (url === "https://alive") return new Response(JSON.stringify({ result: "0x1" }), { status: 200 });
      if (url === "https://wrong") return new Response(JSON.stringify({ result: "0x4" }), { status: 200 });
      throw new Error("offline");
    };

    const result = await auditEvmRpcChains(chains as never, { fetcher: fetcher as typeof fetch, timeoutMs: 100 });

    assert.equal(result.scanned, 3);
    assert.deepEqual(result.dead.map((chain) => chain.key), ["DEAD", "MISMATCH"]);
    assert.equal(result.rows.find((chain) => chain.key === "ALIVE")?.alive, 1);
    assert.equal(result.rows.find((chain) => chain.key === "MISMATCH")?.mismatched, 1);
  });
});
