import { test } from "node:test";
import assert from "node:assert/strict";
import { rebuildChainStreakFromOnchain } from "./gm-streak-rebuild.js";

const USER = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";
const CONTRACT = "0xc9fd9b0b3936916b12a91bacd2267a8750cd99ad";
const CHAIN = "MOONRIVER";
const GM_EVENT_SIG = "0x1374bba5cce7233cce0d4275e8dd0bc1b0ef510fb043198247fc3cb179f8189d";

function topicAddress(address: string): string {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
}

function makeGmLog(opts: { txHash: string; ts: number; address?: string }): {
  address: string; topics: string[]; data: string;
  transactionHash: string; blockNumber: string;
} {
  return {
    address: opts.address ?? CONTRACT,
    topics: [GM_EVENT_SIG, topicAddress(USER)],
    data: "0x" + opts.ts.toString(16).padStart(64, "0") + "0".repeat(64),
    transactionHash: opts.txHash,
    blockNumber: "0x100",
  };
}

type MockState = {
  contracts: Map<string, { id: string; contractAddress: string }>;
  onchainGms: Map<string, { txHash: string; createdAt: Date }>;
  userChainGms: Map<string, { id: string; gmStreak: number; longestStreak: number }>;
  createCalls: Array<{ txHash: string; chainKey: string }>;
};

function buildPrismaMock(state: MockState) {
  return {
    gmContract: {
      findUnique: async (args: { where: { chainKey_contractAddress: { chainKey: string; contractAddress: string } } }) => {
        const k = `${args.where.chainKey_contractAddress.chainKey}|${args.where.chainKey_contractAddress.contractAddress.toLowerCase()}`;
        return state.contracts.get(k) ?? null;
      },
      create: async (args: { data: { chainKey: string; contractAddress: string } }) => {
        const id = `c-${state.contracts.size + 1}`;
        const rec = { id, contractAddress: args.data.contractAddress.toLowerCase() };
        state.contracts.set(`${args.data.chainKey}|${args.data.contractAddress.toLowerCase()}`, rec);
        return rec;
      },
      findMany: async (args: { where: { chainKey: string; contractAddress: { in: string[] } } }) => {
        const out: Array<{ id: string; contractAddress: string }> = [];
        for (const addr of args.where.contractAddress.in) {
          const k = `${args.where.chainKey}|${addr.toLowerCase()}`;
          const rec = state.contracts.get(k);
          if (rec) out.push(rec);
        }
        return out;
      },
    },
    onchainGm: {
      findMany: async (_args: { where: { userId: string; chainKey: string }; select: { txHash: boolean; createdAt: boolean } }) => {
        const out: Array<{ txHash: string; createdAt: Date }> = [];
        for (const r of state.onchainGms.values()) {
          if (r.txHash.length === 0) continue;
          out.push(r);
        }
        return out;
      },
      create: async (args: { data: { txHash: string; chainKey: string } }) => {
        const txHash = args.data.txHash.toLowerCase();
        state.createCalls.push({ txHash, chainKey: args.data.chainKey });
        const rec = { txHash, createdAt: new Date() };
        state.onchainGms.set(txHash, rec);
        return rec;
      },
    },
    userChainGm: {
      findUnique: async (args: { where: { userId_chainKey: { userId: string; chainKey: string } }; select: { gmStreak: boolean; longestStreak: boolean } }) => {
        const k = `${args.where.userId_chainKey.userId}|${args.where.userId_chainKey.chainKey}`;
        return state.userChainGms.get(k) ?? null;
      },
      upsert: async (args: { where: { userId_chainKey: { userId: string; chainKey: string } }; create: { userId: string; chainKey: string; gmStreak: number; longestStreak: number }; update: { gmStreak: number; longestStreak: number } }) => {
        const k = `${args.where.userId_chainKey.userId}|${args.where.userId_chainKey.chainKey}`;
        const rec = state.userChainGms.get(k) ?? { id: k, gmStreak: 0, longestStreak: 0 };
        rec.gmStreak = args.update.gmStreak;
        rec.longestStreak = args.update.longestStreak;
        state.userChainGms.set(k, rec);
        return rec;
      },
    },
  };
}

function installFetchMock(logs: Array<ReturnType<typeof makeGmLog>>) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string; params?: unknown[] };
    if (body.method === "eth_getLogs") {
      return Response.json({ jsonrpc: "2.0", id: 1, result: logs });
    }
    if (body.method === "eth_blockNumber") {
      return Response.json({ jsonrpc: "2.0", id: 1, result: "0x1000000" });
    }
    return Response.json({ jsonrpc: "2.0", id: 1, result: null });
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

test("rebuildChainStreakFromOnchain is idempotent for case-different OnchainGm rows (anti double-comptage)", async () => {
  // Pre-seed a legacy lowercase chainKey + lowercase txHash row. The
  // canonical insert path would use UPPERCASE chainKey + lowercase txHash.
  // Without the case-insensitive pre-check, the unique constraint
  // (chainKey, txHash) is case-sensitive in Postgres and lets the rebuild
  // insert a duplicate. The backfill then credits the score a second time.
  const state: MockState = {
    contracts: new Map(),
    onchainGms: new Map(),
    userChainGms: new Map(),
    createCalls: [],
  };
  // Seed: the contract exists.
  state.contracts.set(`${CHAIN}|${CONTRACT}`, { id: "c-1", contractAddress: CONTRACT });
  // Seed: legacy OnchainGm row already in DB (chainKey=CHAIN, txHash lowercased).
  state.onchainGms.set("0xaaa", { txHash: "0xaaa", createdAt: new Date(Date.now() - 5 * 86400_000) });

  // Chain log: same txHash that already exists. Should NOT be inserted.
  const logs = [makeGmLog({ txHash: "0xaaa", ts: Math.floor(Date.now() / 1000) - 5 * 86400 })];

  const restore = installFetchMock(logs);
  try {
    const prisma = buildPrismaMock(state);
    const result = await rebuildChainStreakFromOnchain(
      { prisma: prisma as never, getChainRpcs: () => ["https://rpc.test"], GM_EVENT_SIG, rpcJson: async () => null },
      "u1", USER, CHAIN,
    );
    assert.equal(result.insertedOnchainGms, 0, "no insert for an already-known txHash");
    assert.equal(state.createCalls.length, 0, "prisma.onchainGm.create must not be called for a known txHash");
  } finally {
    restore();
  }
});

test("rebuildChainStreakFromOnchain inserts truly new txHashes", async () => {
  const state: MockState = {
    contracts: new Map(),
    onchainGms: new Map(),
    userChainGms: new Map(),
    createCalls: [],
  };
  state.contracts.set(`${CHAIN}|${CONTRACT}`, { id: "c-1", contractAddress: CONTRACT });
  // Empty DB.

  const logs = [makeGmLog({ txHash: "0xbbb", ts: Math.floor(Date.now() / 1000) })];

  const restore = installFetchMock(logs);
  try {
    const prisma = buildPrismaMock(state);
    const result = await rebuildChainStreakFromOnchain(
      { prisma: prisma as never, getChainRpcs: () => ["https://rpc.test"], GM_EVENT_SIG, rpcJson: async () => null },
      "u1", USER, CHAIN,
    );
    assert.equal(result.insertedOnchainGms, 1, "should insert the truly new txHash");
    assert.equal(state.createCalls.length, 1);
    assert.equal(state.createCalls[0]?.txHash, "0xbbb");
  } finally {
    restore();
  }
});
