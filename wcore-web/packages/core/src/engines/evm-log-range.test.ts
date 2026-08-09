// Run: node --import tsx --test packages/core/src/engines/evm-log-range.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { getRecentLogRange, pickHeadBlock } from "./evm.js";
import { narrowToIncrementalRange } from "./evm-scan.js";

// Mirrors the real dispatcher closely enough for this call: it reports the same
// strict-majority equality consensus, which getRecentLogRange must now ignore.
function dispatcherReturning(heads: Array<number | null>) {
  return {
    async run() {
      const attempts = heads.map((value, i) => ({
        endpoint: `https://rpc${i}.example`,
        ok: value != null,
        value,
        durationMs: 1,
      }));
      const counts = new Map<string, number>();
      for (const a of attempts) {
        if (a.ok) counts.set(String(a.value), (counts.get(String(a.value)) ?? 0) + 1);
      }
      let best: string | null = null;
      let bestCount = 0;
      for (const [key, n] of counts) {
        if (n > bestCount) {
          best = key;
          bestCount = n;
        }
      }
      const consensus = bestCount * 2 > attempts.length;
      return { consensus, value: consensus && best != null ? Number(best) : null, attempts };
    },
  };
}

const rpc = { async blockNumber(): Promise<number> { return 0; } };

test("pickHeadBlock returns the lower median so the window fits the slowest endpoint", () => {
  assert.equal(pickHeadBlock([]), null);
  assert.equal(pickHeadBlock([100]), 100);
  // Two healthy endpoints on a fast chain never agree; take the conservative one.
  assert.equal(pickHeadBlock([105, 100]), 100);
  assert.equal(pickHeadBlock([100, 105, 101]), 101);
  assert.equal(pickHeadBlock([100, 105, 101, 99]), 100);
});

test("pickHeadBlock ignores values that are not usable block heights", () => {
  assert.equal(pickHeadBlock([Number.NaN, -1]), null);
  assert.equal(pickHeadBlock([Number.NaN, 42, -7]), 42);
});

test("getRecentLogRange does not report an error when endpoints merely disagree", async () => {
  const errors: string[] = [];

  const range = await getRecentLogRange(
    dispatcherReturning([100, 105]) as never,
    rpc as never,
    ["https://rpc0.example", "https://rpc1.example"],
    50,
    errors,
  );

  // Previously this produced "blockNumber consensus failed", collapsed discovery to a
  // single block and flagged the chain degraded while both endpoints were healthy.
  assert.deepEqual(errors, []);
  assert.equal(range.toBlock, `0x${(100).toString(16)}`);
  assert.equal(range.fromBlock, `0x${(51).toString(16)}`);
});

test("getRecentLogRange still reports an error when every endpoint fails", async () => {
  const errors: string[] = [];

  const range = await getRecentLogRange(
    dispatcherReturning([null, null]) as never,
    rpc as never,
    ["https://rpc0.example", "https://rpc1.example"],
    50,
    errors,
  );

  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /blockNumber unavailable on every endpoint/);
  assert.deepEqual(range, { fromBlock: "latest", toBlock: "latest" });
});

test("narrowToIncrementalRange never widens a capped window", () => {
  // Cursor older than the cap: keeping it would ask for ~9000 blocks on a chain that
  // rejects anything past 1000, so the capped window must win.
  assert.equal(narrowToIncrementalRange("0x2710", 1_000), null); // capped from 10000
  // Cursor inside the window: it genuinely narrows the scan.
  assert.equal(narrowToIncrementalRange("0x2710", 10_500), `0x${(10_501).toString(16)}`);
  // Cursor exactly at the window start brings nothing.
  assert.equal(narrowToIncrementalRange("0x2710", 10_000 - 1), null);
});

test("narrowToIncrementalRange ignores a non-numeric window", () => {
  assert.equal(narrowToIncrementalRange("latest", 10_000), null);
});

test("getRecentLogRange keeps honouring the chain log-range cap", async () => {
  const errors: string[] = [];

  const range = await getRecentLogRange(
    dispatcherReturning([10_000, 10_002]) as never,
    rpc as never,
    ["https://rpc0.example", "https://rpc1.example"],
    50_000,
    errors,
    undefined,
    999,
  );

  assert.deepEqual(errors, []);
  assert.equal(range.toBlock, `0x${(10_000).toString(16)}`);
  assert.equal(range.fromBlock, `0x${(10_000 - 998).toString(16)}`);
});
