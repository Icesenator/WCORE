// Run: node --import tsx --test packages/core/src/tokens/metadata.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeErc20Decimals, encodeErc20Name, encodeErc20Symbol } from "./abi.js";
import { getErc20Metadata } from "./metadata.js";
import { MemoryCacheStore } from "../cache/memory-cache.js";
import type { CacheStore } from "../cache/types.js";

const TOKEN = "0x1111111111111111111111111111111111111111";

let rpcCallCount = 0;

function abiString(value: string): string {
  return (
    "0x" +
    "20".padStart(64, "0") +
    value.length.toString(16).padStart(64, "0") +
    Buffer.from(value).toString("hex").padEnd(64, "0")
  );
}

function makeRpc() {
  return {
    async ethCall(_endpoint: string, to: string, data: string): Promise<string> {
      rpcCallCount++;
      assert.equal(to, TOKEN);
      if (data === encodeErc20Symbol()) return abiString("MOCK");
      if (data === encodeErc20Name()) return abiString("Mock Token");
      if (data === encodeErc20Decimals()) return "0x" + "6".padStart(64, "0");
      throw new Error(`unexpected selector ${data}`);
    },
  };
}

function makeDispatcher() {
  return {
    async run<T>(_endpoints: ReadonlyArray<string>, call: (endpoint: string) => Promise<T>) {
      const value = await call("https://rpc.example");
      return { consensus: true, value, votes: 1, total: 1, attempts: [] };
    },
  };
}

test.beforeEach(() => {
  rpcCallCount = 0;
});

test("getErc20Metadata reads symbol, name and decimals with consensus", async () => {
  const result = await getErc20Metadata({
    contract: TOKEN,
    endpoints: ["https://rpc.example"],
    dispatcher: makeDispatcher() as never,
    rpc: makeRpc() as never,
  });

  assert.deepEqual(result.token, {
    contract: TOKEN,
    symbol: "MOCK",
    name: "Mock Token",
    decimals: 6,
    source: "logs",
  });
  assert.deepEqual(result.errors, []);
});

test("getErc20Metadata returns null when both symbol and name fail", async () => {
  const rpc = {
    async ethCall(_endpoint: string, _to: string, data: string): Promise<string> {
      if (data === encodeErc20Decimals()) return "0x" + "c".padStart(64, "0");
      throw new Error("metadata string failed");
    },
  };
  const dispatcher = {
    async run<T>(_endpoints: ReadonlyArray<string>, call: (endpoint: string) => Promise<T>) {
      try {
        const value = await call("https://rpc.example");
        return { consensus: true, value, votes: 1, total: 1, attempts: [] };
      } catch {
        return { consensus: false, value: null, votes: 0, total: 1, attempts: [] };
      }
    },
  };

  const result = await getErc20Metadata({
    contract: TOKEN,
    endpoints: ["https://rpc.example"],
    dispatcher: dispatcher as never,
    rpc: rpc as never,
  });

  assert.equal(result.token, null);
  assert.equal(result.errors.length, 3);
});

test("getErc20Metadata uses cache on second call", async () => {
  const cache: CacheStore = new MemoryCacheStore();

  const first = await getErc20Metadata({
    contract: TOKEN,
    endpoints: ["https://rpc.example"],
    dispatcher: makeDispatcher() as never,
    rpc: makeRpc() as never,
    cache,
    chainKey: "BASE",
  });

  assert.ok(first.token);
  const firstCallCount = rpcCallCount;

  const second = await getErc20Metadata({
    contract: TOKEN,
    endpoints: ["https://rpc.example"],
    dispatcher: makeDispatcher() as never,
    rpc: makeRpc() as never,
    cache,
    chainKey: "BASE",
  });

  assert.deepEqual(second.token, first.token);
  assert.equal(rpcCallCount, firstCallCount);
});

test("getErc20Metadata does not use cache when chainKey missing", async () => {
  const cache: CacheStore = new MemoryCacheStore();

  await getErc20Metadata({
    contract: TOKEN,
    endpoints: ["https://rpc.example"],
    dispatcher: makeDispatcher() as never,
    rpc: makeRpc() as never,
    cache,
  });

  const firstCount = rpcCallCount;

  await getErc20Metadata({
    contract: TOKEN,
    endpoints: ["https://rpc.example"],
    dispatcher: makeDispatcher() as never,
    rpc: makeRpc() as never,
    cache,
  });

  assert.ok(rpcCallCount > firstCount);
});

test("getErc20Metadata does not cache when no cache provided", async () => {
  const first = await getErc20Metadata({
    contract: TOKEN,
    endpoints: ["https://rpc.example"],
    dispatcher: makeDispatcher() as never,
    rpc: makeRpc() as never,
  });

  const second = await getErc20Metadata({
    contract: TOKEN,
    endpoints: ["https://rpc.example"],
    dispatcher: makeDispatcher() as never,
    rpc: makeRpc() as never,
  });

  assert.deepEqual(second.token, first.token);
});

test("getErc20Metadata survives cache failure and returns live data", async () => {
  const brokenCache: CacheStore = {
    get: async () => { throw new Error("cache read error"); },
    set: async () => { throw new Error("cache write error"); },
    delete: async () => {},
    clear: async () => {},
    mget: async () => { throw new Error("cache read error"); },
    add: async () => true,
  };

  const result = await getErc20Metadata({
    contract: TOKEN,
    endpoints: ["https://rpc.example"],
    dispatcher: makeDispatcher() as never,
    rpc: makeRpc() as never,
    cache: brokenCache,
    chainKey: "BASE",
  });

  assert.ok(result.token);
  assert.equal(result.token?.symbol, "MOCK");
});

test("getErc20Metadata replaces blocked cached logoUrl", async () => {
  const cache: CacheStore = new MemoryCacheStore();
  const contract = "0xcf5104d094e3864cfcbda43b82e1cefd26a016eb";
  await cache.set(`meta:ethereum:${contract}`, {
    token: {
      contract,
      symbol: "H",
      name: "Humanity",
      decimals: 18,
      source: "logs",
      logoUrl: "https://coin-images.coingecko.com/coins/images/1/large/bad.png",
    },
    errors: [],
  }, 60_000);

  const result = await getErc20Metadata({
    contract,
    endpoints: [],
    dispatcher: { run: async () => { throw new Error("network should not be called"); } } as never,
    rpc: {} as never,
    cache,
    chainKey: "ETHEREUM",
  });

  assert.ok(result.token?.logoUrl);
  assert.equal(result.token.logoUrl.includes("coin-images.coingecko.com"), false);
});
