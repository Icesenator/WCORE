import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RpcHealthTracker } from "./rpc-health.js";

describe("RpcHealthTracker", () => {
  it("returns all endpoints when no data", () => {
    const tracker = new RpcHealthTracker();
    const result = tracker.getHealthyEndpoints("BASE", ["a", "b", "c"]);
    assert.deepEqual(result, ["a", "b", "c"]);
  });

  it("filters unhealthy endpoints", () => {
    const tracker = new RpcHealthTracker({ ttlMs: 60_000, minEndpoints: 1 });
    tracker.recordFailure("BASE", "bad1");
    tracker.recordFailure("BASE", "bad1");
    tracker.recordFailure("BASE", "bad1");
    tracker.recordFailure("BASE", "bad1");
    tracker.recordSuccess("BASE", "good1");
    tracker.recordSuccess("BASE", "good2");
    const result = tracker.getHealthyEndpoints("BASE", ["bad1", "good1", "good2"]);
    assert.ok(!result.includes("bad1"), "bad1 should be filtered");
    assert.ok(result.includes("good1"), "good1 should be included");
    assert.ok(result.includes("good2"), "good2 should be included");
  });

  it("falls back to all endpoints when too few healthy", () => {
    const tracker = new RpcHealthTracker({ ttlMs: 60_000, minEndpoints: 3 });
    tracker.recordFailure("BASE", "a");
    tracker.recordFailure("BASE", "a");
    tracker.recordFailure("BASE", "a");
    tracker.recordFailure("BASE", "a");
    const result = tracker.getHealthyEndpoints("BASE", ["a", "b"]);
    assert.deepEqual(result, ["a", "b"], "should return all when < minEndpoints healthy");
  });

  it("expires after TTL", () => {
    const tracker = new RpcHealthTracker({ ttlMs: 1 });
    tracker.recordFailure("BASE", "bad");
    tracker.recordFailure("BASE", "bad");
    tracker.recordFailure("BASE", "bad");
    tracker.recordFailure("BASE", "bad");
    const health = (tracker as any).chains.get("BASE");
    health.updatedAt = Date.now() - 100;
    const result = tracker.getHealthyEndpoints("BASE", ["bad", "good"]);
    assert.deepEqual(result, ["bad", "good"], "should return all after TTL");
  });

  it("decays stale per-endpoint failures so a long-flaky endpoint recovers", () => {
    const tracker = new RpcHealthTracker({ ttlMs: 60_000, minEndpoints: 1 });
    // Endpoint accrued 3 failures long ago (lastSeen older than ttl), then recovered.
    tracker.recordFailure("BASE", "ep");
    tracker.recordFailure("BASE", "ep");
    tracker.recordFailure("BASE", "ep");
    const score = tracker.getScore("BASE", "ep")!;
    score.lastSeen = Date.now() - 120_000; // 2× ttl ago
    // Another endpoint keeps the chain "active" (updatedAt fresh) so the chain-level
    // TTL bypass does NOT kick in — we are testing the per-endpoint decay path.
    tracker.recordSuccess("BASE", "other");
    const result = tracker.getHealthyEndpoints("BASE", ["ep", "other"]);
    assert.ok(result.includes("ep"), "stale-failure endpoint should be eligible again");
  });

  it("getScore returns undefined for unknown endpoint", () => {
    const tracker = new RpcHealthTracker();
    assert.equal(tracker.getScore("BASE", "unknown"), undefined);
  });

  it("getScore returns score after recording", () => {
    const tracker = new RpcHealthTracker();
    tracker.recordSuccess("BASE", "ep1");
    tracker.recordFailure("BASE", "ep1");
    const score = tracker.getScore("BASE", "ep1");
    assert.ok(score !== undefined);
    assert.equal(score.success, 1);
    assert.equal(score.failure, 1);
    assert.equal(score.score, 0.5);
  });
});
