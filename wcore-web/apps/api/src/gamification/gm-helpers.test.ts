import { test } from "node:test";
import assert from "node:assert/strict";
import { createGmHelpers, decodeAddressArray, type GmHelpersDeps } from "./gm-helpers.js";

function makeDeps(overrides: Partial<GmHelpersDeps> = {}): GmHelpersDeps {
  const calls: Array<{ method: string; params: unknown }> = [];
  return {
    prisma: {} as never,
    getChainRpcs: overrides.getChainRpcs ?? (() => ["https://203.0.113.10"]),
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
  const created: Array<{ chainKey: string; contractAddress: string }> = [];
  const prisma = {
    gmContract: {
      // Legacy lowercase row — must be matched case-insensitively as "known".
      findMany: async (args?: { select?: { chainKey?: boolean; contractAddress?: boolean } }) => {
        if (args?.select?.chainKey) return [{ chainKey: "base" }];
        if (args?.select?.contractAddress) return [];
        return [];
      },
      updateMany: async () => ({ count: 0 }),
      createMany: async (args: { data: Array<{ chainKey: string; contractAddress: string }> }) => {
        created.push(...args.data);
        return { count: args.data.length };
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
  assert.equal(created.length, 1);
  assert.equal(created[0]!.chainKey, "MERLIN", "created rows use the canonical UPPERCASE chainKey");
  assert.equal(created[0]!.contractAddress, "0xabc0000000000000000000000000000000000001", "contract address is lowercased");
  assert.deepEqual(synced, ["MERLIN"]);
});

test("syncOnChainContracts batches discovered contract persistence", async () => {
  let findFirstCalls = 0;
  let upsertCalls = 0;
  let createManyCalls = 0;
  const createManyRows: Array<{ chainKey: string; contractAddress: string; creatorAddress: string; ownerId: string }> = [];
  const prisma = {
    gmContract: {
      findMany: async (args?: { select?: { chainKey?: boolean; contractAddress?: boolean; ownerId?: boolean } }) => {
        if (args?.select?.chainKey) return [];
        if (args?.select?.contractAddress) return [];
        return [];
      },
      findFirst: async () => { findFirstCalls++; return null; },
      upsert: async () => { upsertCalls++; return {}; },
      createMany: async (args: { data: typeof createManyRows; skipDuplicates: boolean }) => {
        createManyCalls++;
        createManyRows.push(...args.data);
        return { count: args.data.length };
      },
    },
  };
  const deps = makeDeps({
    FACTORIES: {
      merlin: { address: "0xf200000000000000000000000000000000000002", chainId: 4200 },
    },
    extractDeployedContractAddresses: () => [
      "0xAbC0000000000000000000000000000000000001",
      "0xDeF0000000000000000000000000000000000002",
    ],
  });
  (deps as { prisma: unknown }).prisma = prisma;
  deps.rpcFetch = (async (_rpcs: string[], body: { method: string }) => {
    if (body.method === "eth_blockNumber") return { result: "0x4c4b40" };
    if (body.method === "eth_getLogs") return { result: [{ topics: [] }] };
    return { result: "0x0" };
  }) as GmHelpersDeps["rpcFetch"];

  const { syncOnChainContracts } = createGmHelpers(deps);
  const synced = await syncOnChainContracts("0x17d518736ee9341dcdc0a2498e013d33cfcdd080", "user1");

  assert.equal(findFirstCalls, 0, "must not do one ownership lookup per contract");
  assert.equal(upsertCalls, 0, "must not do one upsert per contract");
  assert.equal(createManyCalls, 1, "new contracts should be inserted in one batch");
  assert.deepEqual(createManyRows.map((row) => row.contractAddress), [
    "0xabc0000000000000000000000000000000000001",
    "0xdef0000000000000000000000000000000000002",
  ]);
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

// --- getAllContracts fast path (has-deployed latency, 18/11) ---------------------------

const USER = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";
const OTHER = "0x00000000000000000000000000000000000000aa";
const C1 = "0x1111111111111111111111111111111111111111";
const C2 = "0x2222222222222222222222222222222222222222";
const word = (hex: string) => hex.replace(/^0x/, "").padStart(64, "0");
const encodeAddresses = (addrs: string[]) => "0x" + word("20") + word(addrs.length.toString(16)) + addrs.map(word).join("");

function fastPathDeps(opts: { list: unknown; creators: Record<string, string | undefined> }) {
  const deps = makeDeps();
  const calls = (deps as unknown as { _calls: Array<{ method: string; params: unknown }> })._calls;
  const base = deps.rpcFetch;
  deps.rpcFetch = (async (rpcs: string[], body: { method: string; params?: Array<{ to: string; data: string }> }) => {
    if (body.method === "eth_call") {
      calls.push({ method: body.method, params: body.params });
      const { to, data } = body.params![0]!;
      if (data === "0x18d3ce96") return opts.list === undefined ? {} : { result: opts.list };
      if (data === "0x02d05d3f") {
        const creator = opts.creators[to.toLowerCase()];
        return creator === undefined ? {} : { result: "0x" + word(creator) };
      }
    }
    return (base as (r: string[], b: unknown) => Promise<unknown>)(rpcs, body);
  }) as GmHelpersDeps["rpcFetch"];
  return { deps, calls };
}

test("decodeAddressArray reads a well-formed address[] and rejects anything else", () => {
  assert.deepEqual(decodeAddressArray(encodeAddresses([C1, C2])), [C1, C2]);
  assert.deepEqual(decodeAddressArray(encodeAddresses([])), []);
  assert.equal(decodeAddressArray(undefined), null);
  assert.equal(decodeAddressArray("0x"), null);
  assert.equal(decodeAddressArray("0x0"), null);
  assert.equal(decodeAddressArray(encodeAddresses([C1]).slice(0, -64)), null, "truncated");
  assert.equal(decodeAddressArray(encodeAddresses([C1]) + word("0")), null, "trailing data");
  assert.equal(decodeAddressArray("0x" + word("40") + word("1") + word(C1)), null, "wrong offset");
  assert.equal(decodeAddressArray("0x" + word("20") + word("1") + "f".repeat(64)), null, "not an address word");
});

test("fetchOnChainContracts answers from getAllContracts + creator() without scanning logs", async () => {
  const { deps, calls } = fastPathDeps({ list: encodeAddresses([C1, C2]), creators: { [C1]: OTHER, [C2]: USER } });
  const { fetchOnChainContracts } = createGmHelpers(deps);
  assert.deepEqual(await fetchOnChainContracts("moonriver", USER), [C2]);
  assert.equal(calls.filter((c) => c.method === "eth_getLogs").length, 0);
  assert.equal(calls.filter((c) => c.method === "eth_blockNumber").length, 0);
});

test("an empty factory list is a definitive none in a single call (the 30 s case)", async () => {
  const { deps, calls } = fastPathDeps({ list: encodeAddresses([]), creators: {} });
  const { fetchOnChainContracts } = createGmHelpers(deps);
  assert.deepEqual(await fetchOnChainContracts("moonriver", USER), []);
  assert.equal(calls.length, 1, "only getAllContracts");
});

test("an unreadable creator() never yields a definitive none: falls back to the log scan", async () => {
  const { deps, calls } = fastPathDeps({ list: encodeAddresses([C1, C2]), creators: { [C1]: OTHER } });
  const { fetchOnChainContracts } = createGmHelpers(deps);
  await fetchOnChainContracts("moonriver", USER);
  assert.ok(calls.some((c) => c.method === "eth_getLogs"), "partial list must not short-circuit");
});

test("a factory without getAllContracts (no result) keeps the older paths", async () => {
  const { deps, calls } = fastPathDeps({ list: undefined, creators: {} });
  const { fetchOnChainContracts } = createGmHelpers(deps);
  await fetchOnChainContracts("moonriver", USER);
  assert.ok(calls.some((c) => c.method === "eth_getLogs"));
});

test("a malformed creator() word is unreadable, not a read: falls back to the log scan", async () => {
  const { deps, calls } = fastPathDeps({ list: encodeAddresses([C1, C2]), creators: { [C1]: OTHER, [C2]: "f".repeat(64) } });
  const { fetchOnChainContracts } = createGmHelpers(deps);
  await fetchOnChainContracts("moonriver", USER);
  assert.ok(calls.some((c) => c.method === "eth_getLogs"), "dirty high bytes must not count as a creator");
});

test("a proven own contract is returned even when another creator() is unreadable", async () => {
  const { deps, calls } = fastPathDeps({ list: encodeAddresses([C1, C2]), creators: { [C2]: USER } });
  const { fetchOnChainContracts } = createGmHelpers(deps);
  assert.deepEqual(await fetchOnChainContracts("moonriver", USER), [C2]);
  assert.equal(calls.filter((c) => c.method === "eth_getLogs").length, 0);
});
