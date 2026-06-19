import { test } from "node:test";
import assert from "node:assert/strict";
import { createGmHelpers, type GmHelpersDeps } from "./gm-helpers.js";

function makeDeps(overrides: Partial<GmHelpersDeps> = {}): GmHelpersDeps {
  const calls: Array<{ method: string; params: unknown }> = [];
  return {
    prisma: {} as never,
    getChainRpcs: overrides.getChainRpcs ?? (() => ["https://rpc.test"]),
    rpcFetch: (async (rpcs: string[], body: { method: string; params?: unknown }) => {
      calls.push({ method: body.method, params: body.params });
      // Default: blockNumber returns 5_000_000, eth_getLogs returns []
      if (body.method === "eth_blockNumber") {
        return { result: "0x4c4b40" };
      }
      if (body.method === "eth_getLogs") {
        return { result: [] };
      }
      return { result: "0x0" };
    }) as GmHelpersDeps["rpcFetch"],
    FACTORIES: overrides.FACTORIES ?? {
      MOONRIVER: { address: "0x5472f231a017ce1f03ccdfb2325a7d6a90b07de1", chainId: 1285 },
    },
    CONTRACT_DEPLOYED_EVENT: "0x33c981baba081f8fd2c52ac6ad1ea95b6814b4376640f55689051f6584729688",
    extractDeployedContractAddresses: overrides.extractDeployedContractAddresses ?? (() => []),
    getChainMaxLogRange: overrides.getChainMaxLogRange ?? (() => 1024),
    _calls: calls,
  } as GmHelpersDeps & { _calls: Array<{ method: string; params: unknown }> };
}

test("fetchOnChainContracts uses chain MAX_LOG_RANGE for eth_getLogs chunks (MOONRIVER=1024)", async () => {
  const deps = makeDeps();
  const { fetchOnChainContracts } = createGmHelpers(deps);
  await fetchOnChainContracts("moonriver", "0x17d518736ee9341dcdc0a2498e013d33cfcdd080");

  const calls = (deps as unknown as { _calls: Array<{ method: string; params: unknown }> })._calls;
  const logCalls = calls.filter((c) => c.method === "eth_getLogs");
  assert.ok(logCalls.length > 0, "should make at least one eth_getLogs call");
  for (const call of logCalls) {
    const params = call.params as Array<{ fromBlock: string; toBlock: string }>;
    const filter = params[0]!;
    const from = parseInt(filter.fromBlock, 16);
    const to = parseInt(filter.toBlock, 16);
    const chunk = to - from;
    assert.ok(chunk <= 1024, `chunk ${chunk} should respect MAX_LOG_RANGE=1024, got ${from}..${to}`);
  }
});

test("syncOnChainContracts targets only missing chains and upserts discovered contracts", async () => {
  const scannedChains: string[] = [];
  const upserts: Array<{ chainKey: string; contractAddress: string }> = [];
  const prisma = {
    gmContract: {
      // Legacy lowercase row — must be matched case-insensitively as "known".
      findMany: async () => [{ chainKey: "base" }],
      findFirst: async () => null,
      upsert: async (args: { create: { chainKey: string; contractAddress: string } }) => {
        upserts.push(args.create);
        return args.create;
      },
    },
  };
  const deps = makeDeps({
    FACTORIES: {
      base: { address: "0xf100000000000000000000000000000000000001", chainId: 8453 },
      merlin: { address: "0xf200000000000000000000000000000000000002", chainId: 4200 },
    },
    extractDeployedContractAddresses: () => ["0xAbC0000000000000000000000000000000000001"],
  });
  (deps as { prisma: unknown }).prisma = prisma;
  const origGetChainRpcs = deps.getChainRpcs;
  deps.getChainRpcs = (k) => { scannedChains.push(k); return origGetChainRpcs(k); };
  deps.rpcFetch = (async (_rpcs: string[], body: { method: string }) => {
    if (body.method === "eth_blockNumber") return { result: "0x4c4b40" };
    if (body.method === "eth_getLogs") return { result: [{ topics: [] }] };
    return { result: "0x0" };
  }) as GmHelpersDeps["rpcFetch"];

  const { syncOnChainContracts } = createGmHelpers(deps);
  const synced = await syncOnChainContracts("0x17d518736ee9341dcdc0a2498e013d33cfcdd080", "user1");

  assert.deepEqual(scannedChains, ["MERLIN"], "BASE is known in DB (case-insensitive) and must not be rescanned");
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0]!.chainKey, "MERLIN", "upserts use the canonical UPPERCASE chainKey");
  assert.equal(upserts[0]!.contractAddress, "0xabc0000000000000000000000000000000000001", "contract address is lowercased");
  assert.deepEqual(synced, ["MERLIN"]);
});

test("fetchOnChainContracts falls back to 5000 chunk when no MAX_LOG_RANGE is configured", async () => {
  const deps = makeDeps({ getChainMaxLogRange: () => undefined });
  const { fetchOnChainContracts } = createGmHelpers(deps);
  await fetchOnChainContracts("moonriver", "0x17d518736ee9341dcdc0a2498e013d33cfcdd080");

  const calls = (deps as unknown as { _calls: Array<{ method: string; params: unknown }> })._calls;
  const logCalls = calls.filter((c) => c.method === "eth_getLogs");
  assert.ok(logCalls.length > 0, "should make at least one eth_getLogs call");
  for (const call of logCalls) {
    const params = call.params as Array<{ fromBlock: string; toBlock: string }>;
    const filter = params[0]!;
    const from = parseInt(filter.fromBlock, 16);
    const to = parseInt(filter.toBlock, 16);
    const chunk = to - from;
    assert.ok(chunk <= 5000, `chunk ${chunk} should use default 5000 when MAX_LOG_RANGE is missing`);
  }
});
