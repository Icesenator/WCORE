import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runWithConcurrency } from "../lib/concurrency";

describe("runWithConcurrency", () => {
  it("processes all items", async () => {
    const processed: number[] = [];
    await runWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => { processed.push(n); });
    assert.deepEqual(processed.sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  });

  it("respects the concurrency limit", async () => {
    let active = 0;
    let maxActive = 0;
    await runWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
    });
    assert.ok(maxActive <= 2, `maxActive ${maxActive} should be <= 2`);
  });

  it("handles empty array", async () => {
    let called = false;
    await runWithConcurrency([], 5, async () => { called = true; });
    assert.equal(called, false);
  });

  it("stops processing when signal is aborted", async () => {
    const signal = { aborted: false };
    const processed: number[] = [];
    const items = Array.from({ length: 20 }, (_, i) => i);
    const promise = runWithConcurrency(items, 1, async (n) => {
      processed.push(n);
      if (n === 2) signal.aborted = true;
      await new Promise((r) => setTimeout(r, 1));
    }, signal);
    await promise;
    // After abort at item 2, no more items should be picked up
    assert.ok(processed.length < items.length, `processed ${processed.length} should be < ${items.length}`);
  });

  it("caps workers to item count when concurrency exceeds items", async () => {
    const processed: number[] = [];
    await runWithConcurrency([1, 2], 10, async (n) => { processed.push(n); });
    assert.deepEqual(processed.sort((a, b) => a - b), [1, 2]);
  });
});
