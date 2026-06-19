import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGmStatusResponse } from "./gm-routes.js";

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
