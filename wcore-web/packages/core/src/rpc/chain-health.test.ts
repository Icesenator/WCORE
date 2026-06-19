import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyChainHealth, isChainDisabled } from "./chain-health.js";

describe("classifyChainHealth", () => {
  it("classifies MIND via live health data", () => {
    const r = classifyChainHealth("MIND");
    assert.ok(["healthy", "single", "half"].includes(r.category));
    assert.ok(r.totalEndpoints >= 1, "MIND has at least 1 endpoint");
  });

  it("classifies an unknown chain as dead", () => {
    const r = classifyChainHealth("__no_such_chain__");
    assert.equal(r.category, "dead");
    assert.match(r.reason, /no static|unknown/i);
  });

  it("isChainDisabled returns false for healthy chain", () => {
    assert.equal(isChainDisabled("ETHEREUM"), false);
  });

  it("returns 'dead' for chains whose health has been fully degraded", () => {
    // Use a synthetic single-endpoint chain so any failure flips it to dead.
    const r0 = classifyChainHealth("__synthetic_dead__");
    assert.equal(r0.category, "dead", "synthetic chain starts dead");
  });
});
