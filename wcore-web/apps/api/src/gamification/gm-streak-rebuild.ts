import type { PrismaClient } from "@wcore/db";
import { canonicalChainKey } from "@wcore/shared";
import { safeFetch } from "../lib/safe-http.js";

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
      // Only the protocol was checked here, so a chain entry resolving to a private
      // address was reachable. safeFetch applies the full guard and throws, which the
      // catch below turns into "try the next endpoint".
      const res = await safeFetch(rpc, {
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
const MIN_PAGE_BLOCKS = 25; // smallest eth_getLogs page of the backfill scan
const HEAD_LAG_TOLERANCE_MS = 30 * 60_000; // a head older than this does not prove the absence of recent blocks

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

export class GmBackfillRpcError extends Error {}

export interface BackfillCandidate {
  chainKey: string;
  txHash: string;
  contractId: string;
  createdAt: Date;
  tipWei: string;
}

export async function scanGmBackfillCandidates(
  deps: RebuildDeps,
  chainKey: string,
  address: string,
  maxLogRange: number | undefined,
  fromMs: number,
  toMs: number,
  nowMs: number,
): Promise<BackfillCandidate[]> {
  const { prisma, getChainRpcs, GM_EVENT_SIG, rpcJson } = deps;
  const rpcs = getChainRpcs(chainKey);
  const contracts = await prisma.gmContract.findMany({
    where: { chainKey: { equals: chainKey, mode: "insensitive" } },
    select: { id: true, contractAddress: true },
  });
  if (!contracts.length) return [];
  if (!rpcs?.length) throw new GmBackfillRpcError("rpc_unavailable");
  const contractsByAddress = new Map(contracts.map((row) => [row.contractAddress.toLowerCase(), row.id]));
  const paddedUser = "0x" + address.slice(2).padStart(64, "0");
  const hex = (n: number) => "0x" + n.toString(16);
  const quantity = (value: unknown) => typeof value === "string" && /^0x[0-9a-f]+$/i.test(value)
    ? Number(value) : NaN;
  const rpc = async <T>(method: string, params: unknown[]): Promise<T> => {
    for (const endpoint of rpcs) {
      const response = await rpcJson<{ result?: T; error?: unknown }>(
        [endpoint], { jsonrpc: "2.0", id: 1, method, params },
      );
      if (!response?.error && response?.result != null) return response.result;
    }
    throw new GmBackfillRpcError("rpc_unavailable");
  };
  const parseBlock = (result: { number: string; timestamp: string }, at: string) => {
    const height = quantity(result.number);
    const ms = quantity(result.timestamp) * 1000;
    if (!Number.isSafeInteger(height) || !Number.isSafeInteger(ms) || (at !== "latest" && height !== Number(at))) {
      throw new GmBackfillRpcError("rpc_invalid_block");
    }
    return { height, ms };
  };
  const block = async (at: string) => parseBlock(
    await rpc<{ number: string; timestamp: string }>("eth_getBlockByNumber", [at, false]), at,
  );
  const head = await block("latest");
  // A head older than the end of the window (or than 30 minutes ago when the window reaches into the future) means
  // the RPC lags or the chain is halted: the blocks of the window may exist elsewhere, so an empty or truncated
  // scan would not be proof of absence. Refuse instead of reading "no block in the window".
  if (head.ms < Math.min(toMs, nowMs - HEAD_LAG_TOLERANCE_MS)) throw new GmBackfillRpcError("rpc_head_behind");
  // GmCheckedIn uses block.timestamp. Search only the block interval for the requested days.
  const at = async (height: number) => (height === head.height ? head : await block(hex(height)));
  const legacyFirstBlockAtOrAfter = async (ms: number) => {
    let low = 0;
    let high = head.height + 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if ((await at(mid)).ms < ms) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  const firstBlockAtOrAfter = async (ms: number) => {
    if (head.ms < ms) return head.height + 1;
    // Fast search near the target first; if it cannot complete (a block it needs is refused, or the block time
    // changed too much for the estimate), the bisection from block 0 used before is run as it always was.
    try { return await nearBlockAtOrAfter(ms); } catch { return legacyFirstBlockAtOrAfter(ms); }
  };
  const nearBlockAtOrAfter = async (ms: number) => {
    // Estimate the block from the recent block time, then bracket it with small growing strides and bisect.
    // Only blocks close to the target are read: public nodes prune old history, and the bisection from
    // block 0 asks for the block at half the chain height, which they refuse.
    const span = Math.min(1024, head.height);
    // The reference block only improves the estimate: if the node refuses it, start from the head instead.
    const reference = span > 0 ? await at(head.height - span).catch(() => undefined) : undefined;
    const speed = reference && head.ms > reference.ms ? (head.ms - reference.ms) / span : 0; // ms per block
    const guess = speed > 0
      ? Math.min(head.height, Math.max(0, head.height - Math.round((head.ms - ms) / speed)))
      : head.height;
    let older = -1; // a block known to be before `ms`
    let high = head.height; // a block known to be at or after `ms`
    let stride = 256;
    if ((await at(guess)).ms < ms) {
      older = guess;
      while (older + stride < head.height) {
        const candidate = older + stride;
        if ((await at(candidate)).ms >= ms) { high = candidate; break; }
        older = candidate;
        stride *= 2;
      }
    } else {
      high = guess;
      while (older < 0) {
        if (high === 0) return 0;
        const candidate = Math.max(0, high - stride);
        if ((await at(candidate)).ms < ms) older = candidate;
        else { high = candidate; stride *= 2; }
      }
    }
    let low = older + 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if ((await at(mid)).ms < ms) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  const first = await firstBlockAtOrAfter(fromMs);
  const end = await firstBlockAtOrAfter(toMs);
  const defaultStep = CHAIN_STEP_SIZES[chainKey] ?? 2000;
  const step = maxLogRange && maxLogRange > 0 ? Math.min(maxLogRange, defaultStep) : defaultStep;
  const candidates = new Map<string, BackfillCandidate>();
  // One request for the whole window first (cheap on chains that accept it), then pages only if the RPCs refuse
  // it. Public RPCs cap eth_getLogs at 50 to 2000 blocks (and refuse oversized answers): a refused page is
  // halved and retried, down to MIN_PAGE_BLOCKS (never above an explicit cap, never raised to it), and the size
  // that worked is kept for the next pages. Every RPC request counts against MAX_LOG_CALLS; a page that cannot be
  // read at the smallest size, or an exhausted budget, stops the whole scan (503, nothing written): a hole in the
  // scan could hide an earlier GM.
  const MAX_LOG_CALLS = 6000;
  let logCalls = 0;
  const getLogs = async (from: number, to: number): Promise<GmLog[] | undefined> => {
    for (const endpoint of rpcs) {
      if (++logCalls > MAX_LOG_CALLS) throw new GmBackfillRpcError("rpc_budget_exceeded");
      const page = await tryGetLogs([endpoint], GM_EVENT_SIG, paddedUser, hex(from), hex(to));
      if (!page?.error && Array.isArray(page?.result)) return page.result;
    }
    return undefined;
  };
  const pages: GmLog[][] = [];
  if (first < end) {
    // A known per-chain cap means a wider request could be truncated silently: page directly then.
    const capped = !!maxLogRange && maxLogRange > 0;
    const whole = capped && end - first > maxLogRange! ? undefined : await getLogs(first, end - 1);
    if (whole) pages.push(whole);
    else {
      const minPage = Math.min(MIN_PAGE_BLOCKS, step);
      let size = step;
      for (let from = first; from < end;) {
        const to = Math.min(from + size, end) - 1;
        const page = await getLogs(from, to);
        if (page) {
          pages.push(page);
          from = to + 1;
        } else {
          if (size <= minPage) throw new GmBackfillRpcError("rpc_incomplete_logs");
          size = Math.max(minPage, Math.floor(size / 2));
        }
      }
    }
  }
  for (const logs of pages) {
    for (const log of logs) {
      if (typeof log?.address !== "string" || typeof log.transactionHash !== "string") {
        throw new GmBackfillRpcError("rpc_invalid_log");
      }
      const contractAddress = log.address.toLowerCase();
      const contractId = contractsByAddress.get(contractAddress);
      if (!contractId) continue;
      const txHash = log.transactionHash.toLowerCase();
      if (!/^0x[0-9a-f]{64}$/.test(txHash)) throw new GmBackfillRpcError("rpc_invalid_log");
      if (candidates.has(txHash)) continue;
      const receipt = await rpc<{ from: string; to: string | null; status: string; logs: GmLog[] }>(
        "eth_getTransactionReceipt", [txHash],
      );
      // A malformed receipt must stop the whole batch (503, nothing written): silently skipping it could let
      // a later, more recent GM advance lastGmDate and close the older day's bonus for good.
      const wellFormedLog = (entry: GmLog | null | undefined) => !!entry && typeof entry.address === "string"
        && Array.isArray(entry.topics) && entry.topics.every((topic) => typeof topic === "string")
        && typeof entry.data === "string";
      if (!receipt || typeof receipt !== "object" || !Array.isArray(receipt.logs) || typeof receipt.from !== "string"
        || typeof receipt.status !== "string" || (receipt.to !== null && typeof receipt.to !== "string")
        || !receipt.logs.every(wellFormedLog)) {
        throw new GmBackfillRpcError("rpc_invalid_receipt");
      }
      const event = receipt.logs.find((entry) => typeof entry?.address === "string" && Array.isArray(entry.topics)
        && entry.address.toLowerCase() === contractAddress
        && entry.topics[0] === GM_EVENT_SIG && typeof entry.topics[1] === "string"
        && entry.topics[1].toLowerCase() === paddedUser);
      if (receipt.status !== "0x1" || receipt.from.toLowerCase() !== address
        || receipt.to?.toLowerCase() !== contractAddress || !event) continue;
      if (typeof event.data !== "string" || !/^0x[0-9a-f]{192}$/i.test(event.data)) throw new GmBackfillRpcError("rpc_invalid_log");
      const ms = quantity(event.data.slice(0, 66)) * 1000;
      const tip = BigInt("0x" + event.data.slice(-64));
      if (!Number.isSafeInteger(ms) || ms <= 0) throw new GmBackfillRpcError("rpc_invalid_log");
      if (tip <= 0n || ms < fromMs || ms >= toMs || ms > nowMs) continue;
      candidates.set(txHash, { chainKey, txHash, contractId, createdAt: new Date(ms), tipWei: tip.toString() });
    }
  }
  return [...candidates.values()];
}

// Rebuild per-chain GM streak from on-chain truth. Merges chain events with
// existing DB rows (the just-inserted tx may not yet be visible to eth_getLogs;
// the DB row carries us through that window).
// How far ahead of our clock an on-chain GM timestamp may be and still be its own date (chain clock drift).
// Shared with POST /api/gm/onchain so both paths give a GM the same fixed date.
export const GM_CLOCK_MARGIN_MS = 10 * 60_000;

export async function rebuildChainStreakFromOnchain(
  deps: RebuildDeps,
  userId: string,
  address: string,
  chainKey: string,
  options: { recordedOnly?: boolean } = {},
): Promise<RebuildResult> {
  // Normalize to UPPERCASE — all DB queries and GmContract rows MUST use
  // UPPERCASE chainKeys to avoid case-sensitive duplicates.
  const normalizedChainKey = canonicalChainKey(chainKey);
  const { prisma, getChainRpcs, GM_EVENT_SIG, rpcJson } = deps;
  // Time is read when each timestamp is used, never once at the start.
  const nowSecNow = () => Math.floor(Date.now() / 1000);
  const FUTURE_MARGIN_SEC = Math.floor(GM_CLOCK_MARGIN_MS / 1000);
  const rpcs = options.recordedOnly ? undefined : getChainRpcs(normalizedChainKey);
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
  // Chain timestamp of every log, also for rows already in the DB: the fallback date of an old row still dated
  // in the future (stored before the cap), instead of dropping it.
  const logTsByTxHash = new Map<string, number>();
  const insertedTxHashes = new Set<string>();
  let insertedOnchainGms = 0;
  for (const log of logs) {
    const txHash = log.transactionHash.toLowerCase();
    const contractAddress = log.address.toLowerCase();
    const contractId = contractIdByAddress.get(contractAddress);
    if (!contractId) continue;
    const tsHex = log.data.slice(0, 66);
    // Horodatage en chaine plafonne a maintenant (P1-GM-SERIE-SUIVIS-20261114, defaut 3), meme regle que le POST :
    // un journal au plus GM_CLOCK_MARGIN_MS en avance garde sa propre date ; au-dela, ce n'est pas une date
    // utilisable et la ligne prend l'heure d'insertion, qui ne change plus ensuite.
    const rawTs = parseInt(tsHex, 16);
    const nowSec = nowSecNow();
    const usable = rawTs > 0 && rawTs <= nowSec + FUTURE_MARGIN_SEC;
    const ts = usable ? rawTs : nowSec;
    // Fallback date for an old future row: only a usable log date (a capped one would move every rebuild).
    if (usable) logTsByTxHash.set(txHash, rawTs);
    if (existingTxHashes.has(txHash)) continue;
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
    let chainTs = tsByTxHash.get(txHash);
    const rowSec = Math.floor(row.createdAt.getTime() / 1000);
    if (chainTs === undefined && rowSec > nowSecNow() + FUTURE_MARGIN_SEC) {
      // Ancienne ligne encore datee du futur (stockee avant le plafond) : date du journal en chaine si elle est
      // connue ; sinon aucune date effective, elle est ecartee (elle compterait comme « aujourd'hui » a chaque
      // nouveau jour de recalcul, ou porterait lastGmDate dans le futur).
      chainTs = logTsByTxHash.get(txHash);
      if (chainTs === undefined) continue;
    }
    // Every other row keeps its own fixed date: never re-capped, so one GM is never counted on two days.
    const ts = chainTs ?? rowSec;
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
      select: { gmStreak: true, longestStreak: true, lastGmDate: true },
    });
    appliedCurrent = Math.max(current, existing?.gmStreak ?? 0);
    appliedLongest = Math.max(longest, existing?.longestStreak ?? 0);
    const key = { userId, chainKey: normalizedChainKey };
    if (!existing) {
      // Creation concurrente (un GM du meme utilisateur sur la meme chaine) : ON CONFLICT DO NOTHING.
      await prisma.userChainGm.createMany({
        data: [{ ...key, lastGmDate: lastGmDate ?? new Date(), gmStreak: Math.max(appliedCurrent, 1), longestStreak: Math.max(appliedLongest, 1) }],
        skipDuplicates: true,
      });
    } else {
      // P1-GM-SERIE-SUIVIS-20261114, reserves de Codex sur le defaut 2 : cette reconstruction suit la transaction
      // du POST, hors verrou. Ses evenements decrivent la chaine jusqu'a lastGmDate ; une ligne plus recente (GM
      // du jour credite, ou serie remise a 1 par un nouveau jour) fait foi. La date et la serie ne s'ecrivent donc
      // que si la ligne n'a pas change depuis la lecture et n'est pas plus recente que les evenements : sinon une
      // reconstruction de J-1 terminee apres le GM de J rouvrirait le bonus de J, ou retablirait une serie perimee.
      // Le record ne baisse jamais : il ne s'ecrit que vers le haut.
      if (lastGmDate && existing.lastGmDate.getTime() <= lastGmDate.getTime()) {
        await prisma.userChainGm.updateMany({
          where: { ...key, lastGmDate: existing.lastGmDate, gmStreak: existing.gmStreak },
          data: { lastGmDate, gmStreak: appliedCurrent },
        });
      }
      await prisma.userChainGm.updateMany({ where: { ...key, longestStreak: { lt: appliedLongest } }, data: { longestStreak: appliedLongest } });
    }
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
