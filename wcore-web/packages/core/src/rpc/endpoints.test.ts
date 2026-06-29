import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getPrimaryRpcEndpoint, getRpcEndpoints } from "./endpoints.js";

describe("centralized RPC endpoints", () => {
  test("reads static RPC endpoints from chain configs", () => {
    const endpoints = getRpcEndpoints("ethereum", { includeDynamic: false, useHealth: false });
    assert.ok(endpoints.includes("https://1rpc.io/eth"));
    assert.equal(getPrimaryRpcEndpoint("ETHEREUM"), endpoints[0]);
  });

  test("uses Blockscout RPC fallback when a chain has no public RPC endpoints", () => {
    const endpoints = getRpcEndpoints("camp", { includeDynamic: false, useHealth: false });
    assert.deepEqual(endpoints, ["https://camp.cloud.blockscout.com/api/eth-rpc"]);
  });

  test("returns empty array for unknown chains", () => {
    assert.deepEqual(getRpcEndpoints("not_a_chain", { includeDynamic: false }), []);
  });
});
