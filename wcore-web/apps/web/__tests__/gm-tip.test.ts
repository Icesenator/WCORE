import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { computeGmTipWei } from "../lib/gm-tip";

// WC-09 — behavioral coverage of the on-chain GM tip the user actually pays.
describe("GM tip computation (~$0.05 in native wei, with buffer)", () => {
  test("converts ~$0.05 at ETH $2000 into wei", () => {
    assert.equal(computeGmTipWei(2000), 25500000000000n);
  });

  test("converts ~$0.05 at ETH $2500 into wei", () => {
    assert.equal(computeGmTipWei(2500), 20400000000000n);
  });

  test("applies the buffer (quoted tip strictly exceeds the bare amount)", () => {
    assert.ok(computeGmTipWei(2000, 0.05, 1.02) > computeGmTipWei(2000, 0.05, 1.0));
  });

  test("a cheaper native token yields a larger wei tip (inverse price)", () => {
    assert.ok(computeGmTipWei(1000) > computeGmTipWei(2000));
  });

  test("returns a positive bigint", () => {
    const tip = computeGmTipWei(2000);
    assert.equal(typeof tip, "bigint");
    assert.ok(tip > 0n);
  });

  test("refuses a non-positive price instead of paying a bogus tip", () => {
    assert.throws(() => computeGmTipWei(0), /Native price unavailable/);
    assert.throws(() => computeGmTipWei(-1), /Native price unavailable/);
  });
});
