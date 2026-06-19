import { test } from "node:test";
import assert from "node:assert/strict";
import { RpcDispatcher } from "./rpc/dispatcher.js";
import { RpcHealth, MemoryHealthStore } from "./rpc/health.js";
import { CircuitBreaker } from "./circuit-breaker.js";

test("RpcDispatcher falls back to full list when all endpoints unhealthy", async () => {
  const store = new MemoryHealthStore();
  const health = new RpcHealth(store);
  // Mark all endpoints as unhealthy
  health.recordFailure("rpc-a");
  health.recordFailure("rpc-a");
  health.recordFailure("rpc-b");
  health.recordFailure("rpc-b");

  const dispatcher = new RpcDispatcher(health, { minRpcs: 2 });

  const result = await dispatcher.run(
    ["rpc-a", "rpc-b"],
    async (endpoint) => {
      if (endpoint === "rpc-a") return 42;
      throw new Error("down");
    },
  );

  // Falls back to all endpoints, 1 succeeds with value 42, 1/2 no consensus
  assert.equal(result.consensus, false);
  assert.equal(result.attempts.length, 2);
  assert.ok(result.attempts.some((a) => a.ok && a.value === 42));
});

test("RpcDispatcher uses healthy subset when enough healthy endpoints", async () => {
  const dispatcher = new RpcDispatcher(undefined, { minRpcs: 2, maxRpcs: 2 });

  const result = await dispatcher.run(
    ["rpc-a", "rpc-b", "rpc-c"],
    async () => 100,
  );

  assert.equal(result.consensus, true);
  assert.equal(result.value, 100);
  // Only 2 of 3 were picked (maxRpcs=2)
  assert.equal(result.attempts.length, 2);
});

test("Circuit breaker HALF_OPEN → CLOSED on success", () => {
  const breaker = new CircuitBreaker("test", 2, 100);
  // Trigger OPEN
  breaker.onFailure();
  breaker.onFailure();
  assert.equal(breaker.currentState, "OPEN");

  // Fast-forward past cooldown
  const cb = breaker as unknown as { cooldownMs: number };
  const _originalCooldown = cb.cooldownMs;
  // Use reflection to override cooldown for testing
  Object.defineProperty(breaker, "cooldownMs", { value: 0, configurable: true });

  breaker.allowRequest(); // transitions to HALF_OPEN
  assert.equal(breaker.currentState, "HALF_OPEN");

  breaker.onSuccess();
  assert.equal(breaker.currentState, "CLOSED");
});

test("Circuit breaker HALF_OPEN → OPEN on failure", () => {
  const breaker = new CircuitBreaker("test", 2, 100);
  breaker.onFailure();
  breaker.onFailure();
  assert.equal(breaker.currentState, "OPEN");

  Object.defineProperty(breaker, "cooldownMs", { value: 0, configurable: true });
  breaker.allowRequest(); // HALF_OPEN
  assert.equal(breaker.currentState, "HALF_OPEN");

  breaker.onFailure(); // probe fails → re-OPEN
  assert.equal(breaker.currentState, "OPEN");
});

test("Circuit breaker failureCount decays after decayMs without new failures", () => {
  const breaker = new CircuitBreaker("test", 20, 120_000, 600_000);
  breaker.onFailure();
  breaker.onFailure();
  breaker.onFailure();
  assert.equal(breaker.getStatus().failureCount, 3);
  assert.equal(breaker.currentState, "CLOSED");

  // Simulate decay window elapsed by rewinding lastFailureAt
  Object.defineProperty(breaker, "lastFailureAt", { value: Date.now() - 700_000, configurable: true });

  // Any of allowRequest / onFailure / getStatus triggers decay
  assert.equal(breaker.allowRequest(), true);
  assert.equal(breaker.getStatus().failureCount, 0);
});

test("Circuit breaker fires circuit_half_open event", () => {
  const events: string[] = [];
  const breaker = new CircuitBreaker("test", 1, 100);
  breaker.setEventListener((e) => events.push(e.event));

  breaker.onFailure(); // threshold 1 → OPEN immediately
  assert.equal(breaker.currentState, "OPEN");
  assert.deepEqual(events, ["circuit_opened"]);

  Object.defineProperty(breaker, "cooldownMs", { value: 0, configurable: true });
  breaker.allowRequest(); // OPEN → HALF_OPEN
  assert.equal(breaker.currentState, "HALF_OPEN");
  assert.deepEqual(events, ["circuit_opened", "circuit_half_open"]);
});
