import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGmStatusResponse } from "./gm-routes.js";

test("retired persisted contracts and GMs never become active status, without mutating history", () => {
  const history = ["superseed", " SUPERSEED ", "sseed", "5330", "0x14d2"].map(chainKey => ({ chainKey }));
  const before = JSON.stringify(history);
  assert.deepEqual(buildGmStatusResponse([...history, { chainKey: "ethereum" }], [...history, { chainKey: "SUPR" }]), {
    ethereum: { deployed: true, gmDone: false }, supr: { deployed: false, gmDone: true },
  });
  assert.equal(JSON.stringify(history), before);
});

test("buildGmStatusResponse normalizes chain keys from contracts and today's GMs", () => {
  const status = buildGmStatusResponse(
    [{ chainKey: "base" }, { chainKey: "ARBITRUM_ONE" }],
    [{ chainKey: "BASE" }, { chainKey: "arbitrum_one" }],
  );

  assert.deepEqual(status, {
    base: { deployed: true, gmDone: true },
    arbitrum_one: { deployed: true, gmDone: true },
  });
});
