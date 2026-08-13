import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getPrimaryRpcEndpoint, getRpcEndpoints, getVerifiedEvmRpcEndpoints } from "./endpoints.js";
import { RpcDispatcher } from "./dispatcher.js";

describe("centralized RPC endpoints", () => {
  test("reads static RPC endpoints from chain configs", () => {
    const endpoints = getRpcEndpoints("ethereum", { includeDynamic: false, useHealth: false });
    assert.ok(endpoints.includes("https://1rpc.io/eth"));
    assert.equal(getPrimaryRpcEndpoint("ETHEREUM"), endpoints[0]);
  });

  test("appends the Blockscout RPC as a fallback behind public endpoints", () => {
    const endpoints = getRpcEndpoints("camp", { includeDynamic: false, useHealth: false });
    assert.deepEqual(endpoints, [
      "https://rpc-mainnet.campnetwork.xyz",
      "https://camp.cloud.blockscout.com/api/eth-rpc",
    ]);
    assert.equal(endpoints.at(-1), "https://camp.cloud.blockscout.com/api/eth-rpc");
  });

  test("returns empty array for unknown chains", () => {
    assert.deepEqual(getRpcEndpoints("not_a_chain", { includeDynamic: false }), []);
  });

  test("excludes wrong-network static endpoints and caches identity preflights", async () => {
    const configured = getRpcEndpoints("ETHEREUM", { includeDynamic: false, useHealth: false });
    const validEndpoint = configured.at(-1)!;
    const calls = new Map<string, number>();
    const rpc = {
      async chainId(endpoint: string) {
        calls.set(endpoint, (calls.get(endpoint) ?? 0) + 1);
        return endpoint === validEndpoint ? 1 : 8453;
      },
    };

    const first = await getVerifiedEvmRpcEndpoints("ETHEREUM", {
      includeDynamic: false,
      useHealth: false,
      limit: 1,
      rpc: rpc as never,
    });
    const second = await getVerifiedEvmRpcEndpoints("ETHEREUM", {
      includeDynamic: false,
      useHealth: false,
      limit: 1,
      rpc: rpc as never,
    });

    assert.deepEqual(first, [validEndpoint]);
    assert.deepEqual(second, [validEndpoint]);
    assert.equal([...calls.values()].reduce((sum, count) => sum + count, 0), configured.length);

    const dispatched: string[] = [];
    await new RpcDispatcher(undefined, { minRpcs: 1, maxRpcs: 1 }).run(first, async (endpoint) => {
      dispatched.push(endpoint);
      return "0x0";
    });
    assert.deepEqual(dispatched, [validEndpoint]);
  });
});
