// Run: node --import tsx --test packages/core/src/rpc/consensus.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { reachConsensus } from "./consensus.js";

test("strict majority: 3/4 reaches consensus", () => {
  const r = reachConsensus(["A", "A", "A", "B"]);
  assert.equal(r.consensus, true);
  assert.equal(r.value, "A");
  assert.equal(r.votes, 3);
  assert.equal(r.total, 4);
});

test("strict majority: 2/4 is NOT consensus (tie)", () => {
  const r = reachConsensus(["A", "A", "B", "B"]);
  assert.equal(r.consensus, false);
  assert.equal(r.value, null);
});

test("strict majority: 2/3 reaches consensus", () => {
  const r = reachConsensus(["A", "A", "B"]);
  assert.equal(r.consensus, true);
  assert.equal(r.value, "A");
});

test("strict majority: 1/2 is NOT consensus (tie)", () => {
  const r = reachConsensus(["A", "B"]);
  assert.equal(r.consensus, false);
});

test("strict majority: 1/1 IS consensus (single value)", () => {
  const r = reachConsensus(["A"]);
  assert.equal(r.consensus, true);
  assert.equal(r.value, "A");
});

test("strict majority: 1/3 is NOT consensus when failed RPCs count toward quorum", () => {
  const r = reachConsensus(["A", null, undefined], undefined, { total: 3 });
  assert.equal(r.consensus, false);
  assert.equal(r.value, null);
  assert.equal(r.votes, 1);
  assert.equal(r.total, 3);
});

test("nulls are excluded from total count", () => {
  const r = reachConsensus(["A", "A", null, undefined]);
  assert.equal(r.total, 2);
  assert.equal(r.consensus, true);
  assert.equal(r.value, "A");
});

test("custom serializer for non-string values", () => {
  const r = reachConsensus(
    [{ x: 1 }, { x: 1 }, { x: 2 }],
    (v) => String(v.x),
  );
  assert.equal(r.consensus, true);
  assert.deepEqual(r.value, { x: 1 });
});

test("empty input returns no consensus", () => {
  const r = reachConsensus([]);
  assert.equal(r.consensus, false);
  assert.equal(r.value, null);
  assert.equal(r.total, 0);
});
