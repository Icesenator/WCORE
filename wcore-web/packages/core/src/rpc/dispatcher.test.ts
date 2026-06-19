// Run: node --import tsx --test packages/core/src/rpc/dispatcher.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { RpcDispatcher } from "./dispatcher.js";

test("RpcDispatcher requires strict majority across attempted RPCs", async () => {
  const dispatcher = new RpcDispatcher(undefined, { minRpcs: 3, maxRpcs: 3 });
  const result = await dispatcher.run(
    ["rpc-a", "rpc-b", "rpc-c"],
    async (endpoint) => {
      if (endpoint === "rpc-a") return "A";
      throw new Error("RPC unavailable");
    },
  );

  assert.equal(result.consensus, false);
  assert.equal(result.value, null);
  assert.equal(result.votes, 1);
  assert.equal(result.total, 3);
});
