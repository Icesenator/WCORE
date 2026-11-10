import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LOG_SCAN_BLOCKS, effectiveLogScanWindow } from "./evm-types.js";
import { getChain } from "../chains/index.js";

// A block window is a time window only through the block time: 5,000 blocks are hours on most
// chains but 41 minutes on Elysium (0.49 s blocks). Ledger scans run hours apart, so a chain can
// declare a floor (RPC.MIN_LOG_SCAN_BLOCKS) that keeps every transfer between two scans in range.

test("without a chain floor, the requested window or the default is used unchanged", () => {
  assert.equal(effectiveLogScanWindow({}, undefined), DEFAULT_LOG_SCAN_BLOCKS);
  assert.equal(effectiveLogScanWindow({}, 5_000), 5_000);
  assert.equal(effectiveLogScanWindow({ RPC: {} }, 200_000), 200_000);
});

test("a chain floor widens a smaller requested window, never narrows a larger one", () => {
  const chain = { RPC: { MIN_LOG_SCAN_BLOCKS: 500_000 } };
  assert.equal(effectiveLogScanWindow(chain, undefined), 500_000);
  assert.equal(effectiveLogScanWindow(chain, 5_000), 500_000);
  assert.equal(effectiveLogScanWindow(chain, 900_000), 900_000);
});

test("an invalid chain floor is ignored", () => {
  for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "500000", null]) {
    assert.equal(effectiveLogScanWindow({ RPC: { MIN_LOG_SCAN_BLOCKS: bad } }, 5_000), 5_000, String(bad));
  }
});

test("Elysium (Kinetiq) declares a floor that covers more than a day of blocks", () => {
  const chain = getChain("ELYSIUM");
  assert.ok(chain);
  const floor = effectiveLogScanWindow(chain, 5_000);
  // 0.49 s blocks measured on 2026-11-10: a day is ~176,000 blocks.
  assert.ok(floor >= 176_000, `floor ${floor}`);
  assert.equal(chain.RPC?.MAX_LOG_RANGE, undefined, "the RPC served the whole chain in one eth_getLogs call: no cap");
});
