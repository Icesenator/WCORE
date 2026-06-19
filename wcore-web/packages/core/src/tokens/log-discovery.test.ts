// Run: node --import tsx --test packages/core/src/tokens/log-discovery.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { TRANSFER_EVENT_TOPIC } from "./abi.js";
import { discoverTokensByTransferLogs, topicForAddress } from "./log-discovery.js";

const OWNER = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
const TOKEN_A = "0x1111111111111111111111111111111111111111";
const TOKEN_B = "0x2222222222222222222222222222222222222222";

test("topicForAddress pads an EVM address for indexed topics", () => {
  assert.equal(topicForAddress(OWNER), "0x000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045");
});

test("discoverTokensByTransferLogs deduplicates from/to Transfer logs", async () => {
  const calls: unknown[][] = [];
  const dispatcher = {
    async run<T>(_endpoints: ReadonlyArray<string>, call: (endpoint: string) => Promise<T>) {
      const value = await call("https://rpc.example");
      return { consensus: true, value, votes: 1, total: 1, attempts: [] };
    },
  };
  const rpc = {
    async call(_endpoint: string, method: string, params: unknown[]): Promise<unknown> {
      assert.equal(method, "eth_getLogs");
      calls.push(params);
      return [
        { address: TOKEN_A, topics: [TRANSFER_EVENT_TOPIC, topicForAddress(OWNER), topicForAddress("0x0000000000000000000000000000000000000001")] },
        { address: TOKEN_A, topics: [TRANSFER_EVENT_TOPIC, topicForAddress("0x0000000000000000000000000000000000000002"), topicForAddress(OWNER)] },
        { address: TOKEN_B, topics: [TRANSFER_EVENT_TOPIC, topicForAddress("0x0000000000000000000000000000000000000003"), topicForAddress(OWNER)] },
      ];
    },
  };

  const result = await discoverTokensByTransferLogs({
    address: OWNER,
    endpoints: ["https://rpc.example"],
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    fromBlock: "0x1",
    toBlock: "0x2",
  });

  assert.deepEqual(result.contracts, [TOKEN_A, TOKEN_B]);
  assert.deepEqual(result.errors, []);
  assert.equal(calls.length, 2, "from and to filters should be queried");
});

test("discoverTokensByTransferLogs returns non-blocking errors on RPC failure", async () => {
  const dispatcher = {
    async run() {
      return { consensus: false, value: null, votes: 0, total: 1, attempts: [] };
    },
  };

  const result = await discoverTokensByTransferLogs({
    address: OWNER,
    endpoints: ["https://rpc.example"],
    dispatcher: dispatcher as never,
    rpc: {} as never,
  });

  assert.deepEqual(result.contracts, []);
  assert.equal(result.errors.length, 2);
});

test("discoverTokensByTransferLogs queries from/to directions concurrently", async () => {
  let active = 0;
  let maxActive = 0;
  const dispatcher = {
    async run<T>(_endpoints: ReadonlyArray<string>, call: (endpoint: string) => Promise<T>) {
      const value = await call("https://rpc.example");
      return { consensus: true, value, votes: 1, total: 1, attempts: [] };
    },
  };
  const rpc = {
    async call(): Promise<unknown> {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active--;
      return [];
    },
  };

  await discoverTokensByTransferLogs({
    address: OWNER,
    endpoints: ["https://rpc.example"],
    dispatcher: dispatcher as never,
    rpc: rpc as never,
    fromBlock: "0x1",
    toBlock: "0x2",
  });

  assert.equal(maxActive, 2);
});
