import test from "node:test";
import assert from "node:assert/strict";
import { buildChainStatusesFromApi, type ApiGmStatus } from "./gm-status-reconcile";

test("treats null data as unknown so per-card fetch can recover", () => {
  const out = buildChainStatusesFromApi(null, ["moonbeam", "moonriver"], () => false);
  assert.equal(out["moonbeam"]?.deployed, null);
  assert.equal(out["moonriver"]?.deployed, null);
  assert.equal(out["moonbeam"]?.gmDone, false);
  assert.equal(out["moonriver"]?.gmDone, false);
});

test("uses localStorage gmDone when data is null", () => {
  const out = buildChainStatusesFromApi(null, ["moonbeam"], (key) => key === "moonbeam");
  assert.equal(out["moonbeam"]?.deployed, null);
  assert.equal(out["moonbeam"]?.gmDone, true);
});

test("treats empty {} as definitive deployed:false for every chain (no fan-out)", () => {
  const out = buildChainStatusesFromApi({}, ["moonbeam", "moonriver", "astar"], () => false);
  assert.equal(out["moonbeam"]?.deployed, false);
  assert.equal(out["moonriver"]?.deployed, false);
  assert.equal(out["astar"]?.deployed, false);
  assert.equal(out["moonbeam"]?.gmDone, false);
  assert.equal(out["moonriver"]?.gmDone, false);
  assert.equal(out["astar"]?.gmDone, false);
});

test("uses per-chain values when present in data", () => {
  const data: ApiGmStatus = {
    moonbeam: { deployed: true, gmDone: true },
    moonriver: { deployed: true, gmDone: false },
  };
  const out = buildChainStatusesFromApi(data, ["moonbeam", "moonriver", "astar"], () => false);
  assert.equal(out["moonbeam"]?.deployed, true);
  assert.equal(out["moonbeam"]?.gmDone, true);
  assert.equal(out["moonriver"]?.deployed, true);
  assert.equal(out["moonriver"]?.gmDone, false);
  assert.equal(out["astar"]?.deployed, false);
  assert.equal(out["astar"]?.gmDone, false);
});

test("prefers API value over localStorage when both are present", () => {
  const data: ApiGmStatus = { moonbeam: { deployed: true, gmDone: false } };
  const out = buildChainStatusesFromApi(data, ["moonbeam"], () => true);
  assert.equal(out["moonbeam"]?.deployed, true);
  assert.equal(out["moonbeam"]?.gmDone, false);
});
