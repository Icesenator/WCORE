import test from "node:test";
import assert from "node:assert/strict";
import { buildChainStatusesFromApi, type ApiGmStatus } from "./gm-status-reconcile";

test("treats null data as unknown so per-card fetch can recover", () => {
  const out = buildChainStatusesFromApi(null, ["cronos", "fuse"], () => false);
  assert.equal(out["cronos"]?.deployed, null);
  assert.equal(out["fuse"]?.deployed, null);
  assert.equal(out["cronos"]?.gmDone, false);
  assert.equal(out["fuse"]?.gmDone, false);
});

test("uses localStorage gmDone when data is null", () => {
  const out = buildChainStatusesFromApi(null, ["cronos"], (key) => key === "cronos");
  assert.equal(out["cronos"]?.deployed, null);
  assert.equal(out["cronos"]?.gmDone, true);
});

test("treats empty {} as definitive deployed:false for every chain (no fan-out)", () => {
  const out = buildChainStatusesFromApi({}, ["cronos", "fuse", "astar"], () => false);
  assert.equal(out["cronos"]?.deployed, false);
  assert.equal(out["fuse"]?.deployed, false);
  assert.equal(out["astar"]?.deployed, false);
  assert.equal(out["cronos"]?.gmDone, false);
  assert.equal(out["fuse"]?.gmDone, false);
  assert.equal(out["astar"]?.gmDone, false);
});

test("uses per-chain values when present in data", () => {
  const data: ApiGmStatus = {
    cronos: { deployed: true, gmDone: true },
    fuse: { deployed: true, gmDone: false },
  };
  const out = buildChainStatusesFromApi(data, ["cronos", "fuse", "astar"], () => false);
  assert.equal(out["cronos"]?.deployed, true);
  assert.equal(out["cronos"]?.gmDone, true);
  assert.equal(out["fuse"]?.deployed, true);
  assert.equal(out["fuse"]?.gmDone, false);
  assert.equal(out["astar"]?.deployed, false);
  assert.equal(out["astar"]?.gmDone, false);
});

test("prefers API value over localStorage when both are present", () => {
  const data: ApiGmStatus = { cronos: { deployed: true, gmDone: false } };
  const out = buildChainStatusesFromApi(data, ["cronos"], () => true);
  assert.equal(out["cronos"]?.deployed, true);
  assert.equal(out["cronos"]?.gmDone, false);
});
