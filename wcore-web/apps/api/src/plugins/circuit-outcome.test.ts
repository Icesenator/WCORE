import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chainCircuitOutcome, applyChainCircuitOutcome } from "./scan-utils.js";

function countingBreaker() {
  const calls = { failures: 0, successes: 0 };
  return {
    calls,
    breaker: {
      onFailure: () => { calls.failures++; },
      onSuccess: () => { calls.successes++; },
    },
  };
}

test("a clean scan is a success", () => {
  assert.equal(chainCircuitOutcome({ errors: [], totalValueEur: 12, tokens: [{}] }), "success");
  assert.equal(chainCircuitOutcome({ errors: [], totalValueEur: 0, tokens: [] }), "success");
});

test("a scan that returned nothing but errors is a failure", () => {
  assert.equal(chainCircuitOutcome({ errors: ["chain_timeout"], totalValueEur: 0, tokens: [] }), "failure");
});

test("a scan that still returned data despite errors counts neither way", () => {
  // Punishing a partly degraded chain that is still serving would open its breaker on
  // long-tail pricing misses; calling it a success would hide a real problem.
  const withTokens = chainCircuitOutcome({ errors: ["NO_PRICE"], totalValueEur: 0, tokens: [{}] });
  const withValue = chainCircuitOutcome({ errors: ["NO_PRICE"], totalValueEur: 5, tokens: [] });
  assert.equal(withTokens, "degraded");
  assert.equal(withValue, "degraded");

  const { calls, breaker } = countingBreaker();
  applyChainCircuitOutcome(breaker, { errors: ["NO_PRICE"], totalValueEur: 5, tokens: [] });
  assert.deepEqual(calls, { failures: 0, successes: 0 });
});

test("missing fields are treated as an empty scan", () => {
  assert.equal(chainCircuitOutcome({}), "success");
  assert.equal(chainCircuitOutcome({ errors: null, totalValueEur: null, tokens: null }), "success");
});

test("a timed-out chain is charged exactly once", () => {
  // The placeholder the synchronous handler returns on timeout.
  const placeholder = { errors: ["chain_timeout: BASE exceeded 90000ms"], totalValueEur: 0, tokens: [] };
  const { calls, breaker } = countingBreaker();

  applyChainCircuitOutcome(breaker, placeholder);

  assert.equal(calls.failures, 1, "one failed scan must move the breaker by one");
});

test("the synchronous scan route leaves breaker accounting to the aggregation loop", () => {
  // It used to charge a failure in its catch and charge the very same placeholder again
  // when it reached the aggregation loop, so every timeout counted twice and the breaker
  // opened at half its configured threshold.
  const source = readFileSync(fileURLToPath(new URL("./scan.ts", import.meta.url)), "utf8");
  const start = source.indexOf('app.post("/api/scan"');
  const end = source.indexOf('app.post("/api/scan/batch"');
  assert.ok(start >= 0 && end > start, "could not locate the synchronous scan route");

  const handler = source.slice(start, end);
  assert.ok(
    !/\.onFailure\(\)/.test(handler),
    "the synchronous route must not charge the breaker directly; the aggregation loop already does",
  );
  assert.ok(
    /applyChainCircuitOutcome\(/.test(handler),
    "the synchronous route must account for every result through the shared helper",
  );
});
