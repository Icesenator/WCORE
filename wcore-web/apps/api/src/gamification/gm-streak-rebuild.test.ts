import { test } from "node:test";
import assert from "node:assert/strict";
import { rebuildChainStreakFromOnchain } from "./gm-streak-rebuild.js";

const USER = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";
const CONTRACT = "0xc9fd9b0b3936916b12a91bacd2267a8750cd99ad";
const CHAIN = "CRONOS";
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
  userChainGms: Map<string, { id: string; gmStreak: number; longestStreak: number; lastGmDate?: Date }>;
  createCalls: Array<{ txHash: string; chainKey: string }>;
  /** Simule une ecriture concurrente entre la lecture de la ligne par la reconstruction et son ecriture. */
  afterChainRead?: (key: string) => void;
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
      create: async (args: { data: { txHash: string; chainKey: string; createdAt?: Date } }) => {
        const txHash = args.data.txHash.toLowerCase();
        state.createCalls.push({ txHash, chainKey: args.data.chainKey });
        const rec = { txHash, createdAt: args.data.createdAt ?? new Date() };
        state.onchainGms.set(txHash, rec);
        return rec;
      },
    },
    userChainGm: {
      findUnique: async (args: { where: { userId_chainKey: { userId: string; chainKey: string } }; select: { gmStreak: boolean; longestStreak: boolean } }) => {
        const k = `${args.where.userId_chainKey.userId}|${args.where.userId_chainKey.chainKey}`;
        const rec = state.userChainGms.get(k) ?? null;
        const snapshot = rec ? { ...rec } : null;
        state.afterChainRead?.(k);
        return snapshot;
      },
      createMany: async (args: { data: Array<{ userId: string; chainKey: string; gmStreak: number; longestStreak: number; lastGmDate: Date }>; skipDuplicates: boolean }) => {
        const d = args.data[0]!;
        const k = `${d.userId}|${d.chainKey}`;
        if (state.userChainGms.has(k)) return { count: 0 };
        state.userChainGms.set(k, { id: k, gmStreak: d.gmStreak, longestStreak: d.longestStreak, lastGmDate: d.lastGmDate });
        return { count: 1 };
      },
      // Conditions utilisees par la reconstruction : champ { lt: valeur } ; ecriture seulement si la ligne y repond.
      updateMany: async (args: { where: Record<string, unknown> & { userId: string; chainKey: string }; data: Record<string, unknown> }) => {
        const k = `${args.where.userId}|${args.where.chainKey}`;
        const rec = state.userChainGms.get(k) as Record<string, unknown> | undefined;
        if (!rec) return { count: 0 };
        const v = (x: unknown) => (x instanceof Date ? x.getTime() : x);
        for (const [field, cond] of Object.entries(args.where)) {
          if (field === "userId" || field === "chainKey") continue;
          const cur = rec[field] as number | Date | undefined;
          if (cur === undefined) return { count: 0 };
          if (cond && typeof cond === "object" && !(cond instanceof Date) && "lt" in cond) {
            if (!((v(cur) as number) < (v((cond as { lt: number | Date }).lt) as number))) return { count: 0 };
          } else if (v(cur) !== v(cond)) return { count: 0 };
        }
        Object.assign(rec, args.data);
        return { count: 1 };
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
      { prisma: prisma as never, getChainRpcs: () => ["https://203.0.113.10"], GM_EVENT_SIG, rpcJson: async () => null },
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
      { prisma: prisma as never, getChainRpcs: () => ["https://203.0.113.10"], GM_EVENT_SIG, rpcJson: async () => null },
      "u1", USER, CHAIN,
    );
    assert.equal(result.insertedOnchainGms, 1, "should insert the truly new txHash");
    assert.equal(state.createCalls.length, 1);
    assert.equal(state.createCalls[0]?.txHash, "0xbbb");
  } finally {
    restore();
  }
});

test("rebuildChainStreakFromOnchain never moves a chain row backwards (a GM recorded after its read wins)", async () => {
  // Reconstruction lancee pour un GM tardif d'hier, terminee apres le GM du jour : la ligne porte deja aujourd'hui,
  // une serie de 5 et un record de 9 ; les evenements lus ne voient qu'hier. Rien ne doit reculer.
  const DAY = 86_400_000;
  const today = Date.UTC(2026, 10, 18);
  const yesterdayTs = Math.floor((today - DAY + 20 * 3_600_000) / 1000);
  const state: MockState = {
    contracts: new Map([[`${CHAIN}|${CONTRACT}`, { id: "c-1", contractAddress: CONTRACT }]]),
    onchainGms: new Map(),
    userChainGms: new Map([[`u1|${CHAIN}`, { id: "r1", gmStreak: 5, longestStreak: 9, lastGmDate: new Date(today + 9 * 3_600_000) }]]),
    createCalls: [],
  };
  const restore = installFetchMock([makeGmLog({ txHash: "0xaa01", ts: yesterdayTs })]);
  try {
    await rebuildChainStreakFromOnchain(
      { prisma: buildPrismaMock(state) as never, getChainRpcs: () => ["https://203.0.113.10"], GM_EVENT_SIG, rpcJson: async () => null },
      "u1", USER, CHAIN,
    );
  } finally {
    restore();
  }
  const row = state.userChainGms.get(`u1|${CHAIN}`)!;
  assert.equal(row.lastGmDate!.getTime(), today + 9 * 3_600_000, "lastGmDate is not moved back to yesterday");
  assert.equal(row.gmStreak, 5);
  assert.equal(row.longestStreak, 9);
});

async function rebuildWith(state: MockState, eventTs: number) {
  const restore = installFetchMock([makeGmLog({ txHash: "0xaa02", ts: eventTs })]);
  try {
    return await rebuildChainStreakFromOnchain(
      { prisma: buildPrismaMock(state) as never, getChainRpcs: () => ["https://203.0.113.10"], GM_EVENT_SIG, rpcJson: async () => null },
      "u1", USER, CHAIN,
    );
  } finally {
    restore();
  }
}

test("rebuildChainStreakFromOnchain does not restore a stale streak over a newer reset", async () => {
  // Le POST de J a remis la serie a 1 (dernier GM avant-hier) ; la reconstruction ne voit qu'un evenement de J-1
  // mais lit une serie stockee plus ancienne : la ligne, plus recente, fait foi.
  const DAY = 86_400_000;
  const today = Date.UTC(2026, 10, 18);
  const state: MockState = {
    contracts: new Map([[`${CHAIN}|${CONTRACT}`, { id: "c-1", contractAddress: CONTRACT }]]),
    onchainGms: new Map(),
    userChainGms: new Map([[`u1|${CHAIN}`, { id: "r1", gmStreak: 1, longestStreak: 5, lastGmDate: new Date(today + 8 * 3_600_000) }]]),
    createCalls: [],
  };
  await rebuildWith(state, Math.floor((today - DAY + 3_600_000) / 1000));
  const row = state.userChainGms.get(`u1|${CHAIN}`)!;
  assert.equal(row.gmStreak, 1, "the reset streak is kept");
  assert.equal(row.lastGmDate!.getTime(), today + 8 * 3_600_000);
});

test("rebuildChainStreakFromOnchain skips its streak write when the row changed after its read", async () => {
  // Lecture : serie 5 terminee a J-2 ; entre la lecture et l'ecriture, le POST de J ecrit (J, serie 1).
  const DAY = 86_400_000;
  const today = Date.UTC(2026, 10, 18);
  const state: MockState = {
    contracts: new Map([[`${CHAIN}|${CONTRACT}`, { id: "c-1", contractAddress: CONTRACT }]]),
    onchainGms: new Map(),
    userChainGms: new Map([[`u1|${CHAIN}`, { id: "r1", gmStreak: 5, longestStreak: 5, lastGmDate: new Date(today - 2 * DAY + 3_600_000) }]]),
    createCalls: [],
    afterChainRead: (k) => { state.userChainGms.set(k, { id: "r1", gmStreak: 1, longestStreak: 5, lastGmDate: new Date(today + 9 * 3_600_000) }); },
  };
  await rebuildWith(state, Math.floor((today - DAY + 3_600_000) / 1000));
  const row = state.userChainGms.get(`u1|${CHAIN}`)!;
  assert.equal(row.gmStreak, 1, "the concurrent POST wins");
  assert.equal(row.lastGmDate!.getTime(), today + 9 * 3_600_000);
});

test("an on-chain timestamp in the future is stored capped at now (defect 3)", async () => {
  const state: MockState = {
    contracts: new Map([[`${CHAIN}|${CONTRACT}`, { id: "c-1", contractAddress: CONTRACT }]]),
    onchainGms: new Map(),
    userChainGms: new Map(),
    createCalls: [],
  };
  const before = Date.now();
  await rebuildWith(state, Math.floor(before / 1000) + 2 * 86_400);
  const row = state.onchainGms.get("0xaa02");
  assert.ok(row, "the event is recorded");
  assert.ok(row!.createdAt.getTime() <= Date.now(), "never stored in the future");
  assert.ok(row!.createdAt.getTime() >= before - 1000);
  assert.ok(state.userChainGms.get(`u1|${CHAIN}`)!.lastGmDate!.getTime() <= Date.now());
});

async function rebuildRecorded(state: MockState, options: { recordedOnly?: boolean } = {}) {
  const restore = installFetchMock([]);
  try {
    return await rebuildChainStreakFromOnchain(
      { prisma: buildPrismaMock(state) as never, getChainRpcs: () => ["https://203.0.113.10"], GM_EVENT_SIG, rpcJson: async () => null },
      "u1", USER, CHAIN, options,
    );
  } finally {
    restore();
  }
}

test("an old row still dated in the future is left out of the computation (defect 3)", async () => {
  // Les deux modes : avec lecture des journaux (aucun journal) et recordedOnly (seul mode du POST sur master).
  for (const recordedOnly of [false, true]) {
    const state: MockState = {
      contracts: new Map([[`${CHAIN}|${CONTRACT}`, { id: "c-1", contractAddress: CONTRACT }]]),
      onchainGms: new Map([["0xfuture", { txHash: "0xfuture", createdAt: new Date(Date.now() + 3 * 86_400_000) }]]),
      userChainGms: new Map(),
      createCalls: [],
    };
    const result = await rebuildRecorded(state, { recordedOnly });
    assert.equal(result.currentStreak, 0, "a row with no known effective date is not counted as today");
    assert.equal(state.userChainGms.size, 0, "nothing written from it");
  }
});

test("a GM recorded just now (same second, DB clock slightly ahead) is never taken for a future one", async () => {
  const state: MockState = {
    contracts: new Map([[`${CHAIN}|${CONTRACT}`, { id: "c-1", contractAddress: CONTRACT }]]),
    onchainGms: new Map([["0xnow1", { txHash: "0xnow1", createdAt: new Date(Date.now() + 900) }]]),
    userChainGms: new Map(),
    createCalls: [],
  };
  const result = await rebuildRecorded(state);
  assert.equal(result.currentStreak, 1, "today's GM counts");
  assert.ok(state.userChainGms.get(`u1|${CHAIN}`), "the chain row is written");
});

test("an old row dated in the future takes the date of its on-chain log when the log is known", async () => {
  const DAY = 86_400_000;
  const yesterdayTs = Math.floor((Date.now() - DAY) / 1000);
  const state: MockState = {
    contracts: new Map([[`${CHAIN}|${CONTRACT}`, { id: "c-1", contractAddress: CONTRACT }]]),
    onchainGms: new Map([["0xaa02", { txHash: "0xaa02", createdAt: new Date(Date.now() + 3 * DAY) }]]),
    userChainGms: new Map(),
    createCalls: [],
  };
  const result = await rebuildWith(state, yesterdayTs);
  assert.equal(result.currentStreak, 1, "counted on the log's day (yesterday), not dropped");
  assert.equal(state.userChainGms.get(`u1|${CHAIN}`)!.lastGmDate!.getTime(), yesterdayTs * 1000);
});

test("a row a few minutes ahead (within the clock margin) keeps its own fixed date and counts", async () => {
  const state: MockState = {
    contracts: new Map([[`${CHAIN}|${CONTRACT}`, { id: "c-1", contractAddress: CONTRACT }]]),
    onchainGms: new Map([["0xsoon1", { txHash: "0xsoon1", createdAt: new Date(Date.now() + 5 * 60_000) }]]),
    userChainGms: new Map(),
    createCalls: [],
  };
  await rebuildRecorded(state);
  const row = state.userChainGms.get(`u1|${CHAIN}`);
  assert.ok(row, "the GM counts");
  // Its own date, never re-capped: a date moved to "now" at each rebuild could count one GM on two UTC days.
  assert.equal(row!.lastGmDate!.getTime(), Math.floor(state.onchainGms.get("0xsoon1")!.createdAt.getTime() / 1000) * 1000);
});

test("an old future row whose own log is also in the future gets no date and is left out", async () => {
  const DAY = 86_400_000;
  const state: MockState = {
    contracts: new Map([[`${CHAIN}|${CONTRACT}`, { id: "c-1", contractAddress: CONTRACT }]]),
    onchainGms: new Map([["0xaa02", { txHash: "0xaa02", createdAt: new Date(Date.now() + 3 * DAY) }]]),
    userChainGms: new Map(),
    createCalls: [],
  };
  const result = await rebuildWith(state, Math.floor((Date.now() + 2 * DAY) / 1000));
  assert.equal(result.currentStreak, 0, "a capped future log date would move to a new day at every rebuild");
  assert.equal(state.userChainGms.size, 0);
});
