import test from "node:test";
import assert from "node:assert/strict";
import { resolveBalance, type BalanceVote } from "./consensus.js";

const NOW = 1_800_000;

function vote(partial: Partial<BalanceVote> & { source: BalanceVote["source"]; raw: bigint }): BalanceVote {
  return {
    confidence: 1,
    observedAt: NOW,
    ...partial,
  };
}

test("live consensus zero beats fresh positive cache", () => {
  const decision = resolveBalance([
    vote({ source: "rpc", raw: 0n, confidence: 1, consensus: true, observedAt: NOW }),
    vote({ source: "cache", raw: 123n, confidence: 0.8, observedAt: NOW - 10_000 }),
  ], { nowMs: NOW });

  assert.equal(decision.raw, 0n);
  assert.equal(decision.source, "rpc");
  assert.equal(decision.degraded, false);
  assert.equal(decision.reason, "live_consensus");
});

test("failed live read plus fresh positive cache returns degraded cache", () => {
  const decision = resolveBalance([
    vote({ source: "rpc", raw: 0n, confidence: 0, error: "consensus failed", observedAt: NOW }),
    vote({ source: "cache", raw: 456n, confidence: 0.8, observedAt: NOW - 20_000 }),
  ], { nowMs: NOW });

  assert.equal(decision.raw, 456n);
  assert.equal(decision.source, "cache");
  assert.equal(decision.degraded, true);
  assert.equal(decision.reason, "cache_fallback_live_failed");
});

test("partial live zero plus failed RPCs preserves fresh positive cache", () => {
  const decision = resolveBalance([
    vote({ source: "rpc", raw: 0n, confidence: 0.9, observedAt: NOW }),
    vote({ source: "rpc", raw: 0n, confidence: 0, error: "timeout", observedAt: NOW }),
    vote({ source: "rpc", raw: 0n, confidence: 0, error: "fetch failed", observedAt: NOW }),
    vote({ source: "cache", raw: 456n, confidence: 0.8, observedAt: NOW - 20_000 }),
  ], { nowMs: NOW });

  assert.equal(decision.raw, 456n);
  assert.equal(decision.source, "cache");
  assert.equal(decision.degraded, true);
  assert.equal(decision.reason, "cache_fallback_live_failed");
});

test("single healthy live read beats stale cache", () => {
  const decision = resolveBalance([
    vote({ source: "rpc", raw: 789n, confidence: 0.7, observedAt: NOW }),
    vote({ source: "cache", raw: 456n, confidence: 0.4, observedAt: NOW - 25 * 60 * 60 * 1000 }),
  ], { nowMs: NOW });

  assert.equal(decision.raw, 789n);
  assert.equal(decision.source, "rpc");
  assert.equal(decision.degraded, false);
  assert.equal(decision.reason, "best_live_vote");
});

test("legacy cache without observedAt remains degraded fallback", () => {
  const decision = resolveBalance([
    { source: "cache", raw: 999n, confidence: 0.3 },
  ], { nowMs: NOW });

  assert.equal(decision.raw, 999n);
  assert.equal(decision.source, "cache");
  assert.equal(decision.degraded, true);
  assert.equal(decision.reason, "legacy_cache_fallback");
});

test("positive cache conflict chooses most recent fallback", () => {
  const decision = resolveBalance([
    vote({ source: "cache", raw: 100n, confidence: 0.6, observedAt: NOW - 50_000 }),
    vote({ source: "indexer", raw: 200n, confidence: 0.6, observedAt: NOW - 10_000 }),
  ], { nowMs: NOW });

  assert.equal(decision.raw, 200n);
  assert.equal(decision.source, "indexer");
  assert.equal(decision.degraded, true);
  assert.equal(decision.reason, "balance_conflict");
});

test("no usable votes returns degraded zero", () => {
  const decision = resolveBalance([], { nowMs: NOW });

  assert.equal(decision.raw, 0n);
  assert.equal(decision.source, "none");
  assert.equal(decision.confidence, 0);
  assert.equal(decision.degraded, true);
  assert.equal(decision.reason, "no_votes");
});
