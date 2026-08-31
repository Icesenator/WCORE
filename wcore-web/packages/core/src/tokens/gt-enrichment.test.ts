// Run: node --import tsx --test packages/core/src/tokens/gt-enrichment.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { gtNetworkForChain } from "./gt-enrichment.js";

test("GT network slugs match the /v2/networks registry (verified 2026-08-27)", () => {
  assert.equal(gtNetworkForChain(1), "eth");
  assert.equal(gtNetworkForChain(56), "bsc");
  assert.equal(gtNetworkForChain(137), "polygon_pos");
  assert.equal(gtNetworkForChain(10), "optimism");
  assert.equal(gtNetworkForChain(42161), "arbitrum");
  assert.equal(gtNetworkForChain(43114), "avax");
  assert.equal(gtNetworkForChain(8453), "base");
  assert.equal(gtNetworkForChain(480), "world-chain");
});

test("unknown chains return undefined so callers stay fail-graceful", () => {
  assert.equal(gtNetworkForChain(999999), undefined);
  assert.equal(gtNetworkForChain(0), undefined);
});
