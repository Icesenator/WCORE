import type { PrismaClient } from "@wcore/db";
import { canonicalChainKey } from "@wcore/shared";

export interface RebuildDeps {
  prisma: PrismaClient;
  getChainRpcs: (chainKey: string) => string[] | undefined;
  GM_EVENT_SIG: string;
  rpcJson: <T>(rpcs: string[], body: object) => Promise<T | null>;
}

export interface RebuildEvent {
  ts: number;       // seconds since epoch
  dayMs: number;    // start of UTC day in ms
  txHash: string;
  wasInserted: boolean;
}

export interface RebuildResult {
  chainKey: string;
  chainEvents: number;
  dbRows: number;
  insertedOnchainGms: number;
  insertedContracts: number;
  currentStreak: number;
  longestStreak: number;
  lastGmDate: Date | null;
  distinctDays: number;
  events: RebuildEvent[];
}

type GmLog = {
  address: string;
  topics: string[];
  data: string;
  transactionHash: string;
  blockNumber: string;
};

function utcDayStart(date: Date | number): number {
  const d = typeof date === "number" ? new Date(date) : date;
  const copy = new Date(d.getTime());
  copy.setUTCHours(0, 0, 0, 0);
  return copy.getTime();
}

// Try eth_getLogs with a specific block range. Returns { result } on success,
// { error } on JSON-RPC error (so callers can read the error message), or null
// when every RPC fails to respond.
async function tryGetLogs(
  rpcs: string[],
  GM_EVENT_SIG: string,
  paddedUser: string,
  fromBlock: string,
  toBlock: string,
): Promise<{ result?: GmLog[]; error?: { message?: string } } | null> {
  for (const rpc of rpcs) {
    try {
      const u = new URL(rpc);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "eth_getLogs",
          params: [{ fromBlock, toBlock, topics: [GM_EVENT_SIG, paddedUser] }],
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const data = await res.json() as { result?: GmLog[]; error?: { message?: string } };
      return data; // return even if it has an error (caller inspects)
    } catch { /* try next RPC */ }
  }
  return null;
}

// Per-chain step sizes for block-range-limited RPCs.
// Must be ≤ each chain's max eth_getLogs block range.
const CHAIN_STEP_SIZES: Record<string, number> = {
  CYBER: 500,       // max ~1000 blocks per query (safe for 500-range)
  OPENLEDGER: 500,  // max 1000 blocks per query (rpc.openledger.xyz limit)
  STABLE: 2000,     // CometBFT-based, smaller step for reliability
};
const COVER_BLOCKS = 500_000; // ~11 days at 2s/block

async function fetchAllUserGmLogs(
  rpcs: string[],
  GM_EVENT_SIG: string,
  paddedUser: string,
  rpcJson: RebuildDeps["rpcJson"],
  chainKey: string,
): Promise<GmLog[]> {
  // Try full range first — many EVM RPCs accept earliest→latest for topic-filtered queries.
  const full = await tryGetLogs(rpcs, GM_EVENT_SIG, paddedUser, "earliest", "latest");
  if (full?.result) return full.result;

  // Get latest block
  const bn = await rpcJson<{ result?: string }>(rpcs, { jsonrpc: "2.0", id: 1, method: "eth_blockNumber" });
  const latest = parseInt(bn?.result || "0x0", 16);
  if (!latest) return [];

  // Determine step size based on chain RPC limits
  const step = CHAIN_STEP_SIZES[chainKey] ?? 2000;

  // Scan BACKWARD from latest block, covering COVER_BLOCKS (~11 days).
  // Stop after 100 consecutive empty chunks to avoid scanning the full window
  // for a wallet with zero GM activity (100 × step = 50k–200k blocks, ~1–4 days).
  const MAX_EMPTY_CHUNKS = 100;
  const logs: GmLog[] = [];
  const startBlock = Math.max(0, latest - COVER_BLOCKS);
  let emptyStreak = 0;

  for (let to = latest; to > startBlock; to -= step) {
    const from = Math.max(startBlock, to - step + 1);
    const page = await tryGetLogs(rpcs, GM_EVENT_SIG, paddedUser, "0x" + from.toString(16), "0x" + to.toString(16));
    if (page?.result && page.result.length > 0) {
      logs.push(...page.result);
      emptyStreak = 0;
    } else {
      emptyStreak++;
      if (emptyStreak >= MAX_EMPTY_CHUNKS) break;
    }
    // If all RPCs are unreachable, break early (no point continuing)
    if (page === null) break;
  }
  return logs;
}

// Rebuild per-chain GM streak from on-chain truth. Merges chain events with
// existing DB rows (the just-inserted tx may not yet be visible to eth_getLogs;
// the DB row carries us through that window).
export async function rebuildChainStreakFromOnchain(
  deps: RebuildDeps,
  userId: string,
  address: string,
  chainKey: string,
): Promise<RebuildResult> {
  // Normalize to UPPERCASE — all DB queries and GmContract rows MUST use
  // UPPERCASE chainKeys to avoid case-sensitive duplicates.
  const normalizedChainKey = canonicalChainKey(chainKey);
  const { prisma, getChainRpcs, GM_EVENT_SIG, rpcJson } = deps;
  const rpcs = getChainRpcs(normalizedChainKey);
  const userAddr = address.toLowerCase();
  const paddedUser = "0x000000000000000000000000" + userAddr.slice(2);

  const logs = rpcs?.length
    ? await fetchAllUserGmLogs(rpcs, GM_EVENT_SIG, paddedUser, rpcJson, normalizedChainKey)
    : [];

  // Upsert GmContract rows for every distinct contract address seen on-chain.
  const uniqueContracts = [...new Set(logs.map((l) => l.address.toLowerCase()))];
  let insertedContracts = 0;
  for (const contractAddress of uniqueContracts) {
    const existing = await prisma.gmContract.findUnique({
      where: { chainKey_contractAddress: { chainKey: normalizedChainKey, contractAddress } },
    });
    if (!existing) {
      await prisma.gmContract.create({
        data: { chainKey: normalizedChainKey, contractAddress, ownerId: null },
      });
      insertedContracts++;
    }
  }

  // Map contractAddress → contractId (covers existing rows too).
  const contractRows = uniqueContracts.length
    ? await prisma.gmContract.findMany({
        where: { chainKey: normalizedChainKey, contractAddress: { in: uniqueContracts } },
        select: { id: true, contractAddress: true },
      })
    : [];
  const contractIdByAddress = new Map(
    contractRows.map((c) => [c.contractAddress.toLowerCase(), c.id]),
  );

  // Pre-fetch existing txHashes for this (userId, chainKey) so the case-sensitive
  // Postgres @@unique([chainKey, txHash]) constraint does not let a legacy row
  // (e.g. lowercase "base") collide with a canonical insert ("BASE") and double-
  // count score when self-heal backfill runs. We compare lowercased hashes.
  const existingRows = await prisma.onchainGm.findMany({
    where: { userId, chainKey: normalizedChainKey },
    select: { txHash: true },
  });
  const existingTxHashes = new Set(existingRows.map((r) => r.txHash.toLowerCase()));

  // Insert missing OnchainGm rows (idempotent via unique [chainKey, txHash]).
  // Build map txHash → onchain timestamp for later day computation.
  // Track which txHashes were newly inserted so the caller can apply score
  // deltas only for newly-counted GMs.
  const tsByTxHash = new Map<string, number>();
  const insertedTxHashes = new Set<string>();
  let insertedOnchainGms = 0;
  for (const log of logs) {
    const txHash = log.transactionHash.toLowerCase();
    const contractAddress = log.address.toLowerCase();
    const contractId = contractIdByAddress.get(contractAddress);
    if (!contractId) continue;
    if (existingTxHashes.has(txHash)) continue;
    const tsHex = log.data.slice(0, 66);
    const ts = parseInt(tsHex, 16);
    if (ts > 0) tsByTxHash.set(txHash, ts);
    const tipHex = "0x" + (log.data || "0x0").slice(-64);
    let tipWei = "0";
    try { tipWei = BigInt(tipHex).toString(); } catch { /* keep "0" */ }
    try {
      await prisma.onchainGm.create({
        data: { userId, txHash, chainKey: normalizedChainKey, contractId, tipWei, ...(ts > 0 ? { createdAt: new Date(ts * 1000) } : {}) },
      });
      insertedOnchainGms++;
      insertedTxHashes.add(txHash);
      existingTxHashes.add(txHash);
    } catch { /* duplicate (chainKey,txHash) → already tracked */ }
  }

  // Read DB rows as the merged source of truth (chain logs ∪ pre-existing rows).
  const dbRows = await prisma.onchainGm.findMany({
    where: { userId, chainKey: normalizedChainKey },
    select: { txHash: true, createdAt: true },
  });

  // Build event list from merged DB rows (chain ts when known, createdAt
  // fallback for rows whose log isn't indexed yet). `wasInserted` flags rows
  // newly added in this run so the caller can settle score deltas.
  const events: RebuildEvent[] = [];
  let latestTsSec = 0;
  for (const row of dbRows) {
    const txHash = row.txHash.toLowerCase();
    const chainTs = tsByTxHash.get(txHash);
    const ts = chainTs ?? Math.floor(row.createdAt.getTime() / 1000);
    if (ts > latestTsSec) latestTsSec = ts;
    events.push({
      ts,
      dayMs: utcDayStart(ts * 1000),
      txHash,
      wasInserted: insertedTxHashes.has(txHash),
    });
  }
  events.sort((a, b) => a.ts - b.ts);
  const dayMs = new Set<number>(events.map((e) => e.dayMs));
  const sortedDays = [...dayMs].sort((a, b) => a - b);

  // Longest streak = max run of consecutive UTC days.
  let longest = 0;
  let run = 0;
  let prevDay = -1;
  for (const d of sortedDays) {
    if (prevDay !== -1 && d === prevDay + 86_400_000) run++;
    else run = 1;
    if (run > longest) longest = run;
    prevDay = d;
  }

  // Current streak = consecutive days back from the latest event, but only if
  // the latest event happened today or yesterday (UTC). Otherwise the streak
  // has expired and current = 0.
  const today = utcDayStart(new Date());
  const yesterday = today - 86_400_000;
  let current = 0;
  const lastDay = sortedDays.length > 0 ? sortedDays[sortedDays.length - 1] : undefined;
  if (lastDay !== undefined) {
    if (lastDay === today || lastDay === yesterday) {
      let expected = lastDay;
      for (let i = sortedDays.length - 1; i >= 0; i--) {
        const d = sortedDays[i];
        if (d === undefined) break;
        if (d === expected) {
          current++;
          expected -= 86_400_000;
        } else if (d < expected) {
          break;
        }
      }
    }
  }

  const lastGmDate = latestTsSec ? new Date(latestTsSec * 1000) : null;

  let appliedCurrent = current;
  let appliedLongest = longest;
  if (sortedDays.length > 0) {
    const existing = await prisma.userChainGm.findUnique({
      where: { userId_chainKey: { userId, chainKey: normalizedChainKey } },
      select: { gmStreak: true, longestStreak: true },
    });
    appliedCurrent = Math.max(current, existing?.gmStreak ?? 0);
    appliedLongest = Math.max(longest, existing?.longestStreak ?? 0);
    await prisma.userChainGm.upsert({
      where: { userId_chainKey: { userId, chainKey: normalizedChainKey } },
      create: {
        userId,
        chainKey: normalizedChainKey,
        lastGmDate: lastGmDate ?? new Date(),
        gmStreak: Math.max(appliedCurrent, 1),
        longestStreak: Math.max(appliedLongest, 1),
      },
      update: {
        lastGmDate: lastGmDate ?? undefined,
        gmStreak: appliedCurrent,
        longestStreak: appliedLongest,
      },
    });
  }

  return {
    chainKey: normalizedChainKey,
    chainEvents: logs.length,
    dbRows: dbRows.length,
    insertedOnchainGms,
    insertedContracts,
    currentStreak: appliedCurrent,
    longestStreak: appliedLongest,
    lastGmDate,
    distinctDays: dayMs.size,
    events,
  };
}
