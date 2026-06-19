import { EvmRpc, RpcDispatcher } from "../rpc/index.js";
import { rpcHealth } from "../rpc/rpc-health.js";
import { resolveBalance, type BalanceDecision, type BalanceVote } from "../balances/index.js";
import type { CacheStore } from "../cache/index.js";
import { decodeUint256, encodeBalanceOf } from "../tokens/index.js";
import { cacheVote, liveVote, failedLiveVote, cacheEntry, type BalanceCacheEntry } from "./evm-types.js";

// Per-chain block number cache — avoids N × eth_blockNumber calls when
// scanning multiple wallets on the same chain. 30s TTL is safe since blocks
// advance every ~12s (Ethereum) and the log window is thousands of blocks.
export const _blockCache = new Map<string, { block: number; ts: number }>();
export const _BLOCK_CACHE_TTL_MS = 30_000;

export async function getRecentLogRange(
  dispatcher: RpcDispatcher,
  rpc: EvmRpc,
  endpoints: string[],
  logBlockWindow: number,
  errors: string[],
  chainKey?: string,
  maxLogRange?: number,
): Promise<{ fromBlock: string; toBlock: string }> {
  // Check block cache first — avoids redundant eth_blockNumber across wallets
  let toBlock: number | null = null;
  if (chainKey) {
    const cached = _blockCache.get(chainKey);
    if (cached && Date.now() - cached.ts < _BLOCK_CACHE_TTL_MS) {
      toBlock = cached.block;
    }
  }

  if (toBlock == null) {
    const res = await dispatcher.run(endpoints, (endpoint, rpcOpts) =>
      rpc.blockNumber(endpoint, rpcOpts),
    (value) => String(value));
    if (!res.consensus || res.value == null) {
      errors.push("blockNumber consensus failed; token log discovery limited to latest block");
      return { fromBlock: "latest", toBlock: "latest" };
    }
    toBlock = res.value;
    if (chainKey) _blockCache.set(chainKey, { block: toBlock, ts: Date.now() });
  }

  const effectiveWindow = maxLogRange ? Math.min(logBlockWindow, maxLogRange) : logBlockWindow;
  const fromBlock = Math.max(0, toBlock - effectiveWindow);
  return {
    fromBlock: `0x${fromBlock.toString(16)}`,
    toBlock: `0x${toBlock.toString(16)}`,
  };
}

export async function readNativeBalance(
  dispatcher: RpcDispatcher,
  rpc: EvmRpc,
  endpoints: string[],
  address: string,
  chainKey: string,
  cache?: CacheStore,
): Promise<BalanceDecision> {
  const res = await dispatcher.run(endpoints, (endpoint, rpcOpts) =>
    rpc.getBalance(endpoint, address, "latest", rpcOpts),
  (value) => value.toString());

  const votes: BalanceVote[] = [];
  for (const a of res.attempts) {
    if (a.ok && a.value != null) {
      votes.push(liveVote("rpc", BigInt(a.value), false, 0.9, a.endpoint));
    } else {
      votes.push(failedLiveVote("rpc", String(a.error ?? "balance fetch failed")));
    }
  }

  // If dispatcher found strict majority, mark matching votes as consensus
  if (res.consensus && res.value != null) {
    const consensusRaw = BigInt(res.value);
    if (res.attempts.length === 0) {
      // Backward-compat: synthesize a vote when attempts aren't populated (e.g. test mocks)
      votes.push(liveVote("rpc", consensusRaw, true, 0.9, undefined));
    } else {
      for (const v of votes) {
        if (v.raw === consensusRaw && v.source === "rpc") v.consensus = true;
      }
    }
  }

  // Add cache vote from native balance cache
  if (cache) {
    const ccKey = `native:${chainKey.toLowerCase()}:${address}`;
    try {
      const cached = await cache.get<BalanceCacheEntry>(ccKey);
      const cv = cacheVote(cached);
      if (cv) votes.push(cv);
    } catch { /* cache miss */ }
  }

  const decision = resolveBalance(votes);

  // Record rpcHealth based on decision outcome
  if (decision.source === "rpc" && !decision.degraded) {
    const winner = decision.votes.find((v) => v.source === "rpc" && v.endpoint && v.raw === decision.raw);
    if (winner?.endpoint) rpcHealth.recordSuccess(chainKey, winner.endpoint);
  } else if (decision.degraded || decision.source === "none") {
    for (const ep of endpoints) rpcHealth.recordFailure(chainKey, ep);
  }

  // Persist cache on reliable live success, including confirmed zero balances.
  if (!decision.degraded && decision.source !== "cache" && decision.confidence >= 0.65 && cache) {
    const ccKey = `native:${chainKey.toLowerCase()}:${address}`;
    cache.set(ccKey, cacheEntry(decision), 3600_000).catch(() => {});
  }

  return decision;
}

export async function canServeEmptyCache(
  dispatcher: RpcDispatcher,
  rpc: EvmRpc,
  endpoints: string[],
  address: string,
  chainKey: string,
  cache: CacheStore | undefined,
  disableNative: boolean,
): Promise<boolean> {
  if (disableNative) return false;
  try {
    const decision = await readNativeBalance(dispatcher, rpc, endpoints, address, chainKey, cache);
    return decision.raw === 0n && !decision.degraded && decision.source !== "none";
  } catch {
    return false;
  }
}

export async function readErc20Balance(
  dispatcher: RpcDispatcher,
  rpc: EvmRpc,
  endpoints: string[],
  contract: string,
  owner: string,
  chainKey: string,
  cache?: CacheStore,
): Promise<{ decision: BalanceDecision; skipped: boolean }> {
  // Check skip cache — non-ERC20 tokens flagged by a previous scan
  if (cache) {
    const skipKey = `meta:skip:${chainKey.toLowerCase()}:${contract.toLowerCase()}`;
    try {
      const skip = await cache.get<{ reason: string }>(skipKey);
      if (skip) return { decision: { raw: 0n, source: "none", confidence: 0, degraded: false, reason: "non_erc20_skip", votes: [] }, skipped: true };
    } catch { /* ignore */ }
  }

  const data = encodeBalanceOf(owner);
  const res = await dispatcher.run(endpoints, (endpoint, rpcOpts) =>
    rpc.ethCall(endpoint, contract, data, "latest", rpcOpts),
  (value) => value.toLowerCase());

  const votes: BalanceVote[] = [];
  for (const a of res.attempts) {
    if (a.ok && a.value) {
      const raw = decodeUint256(a.value);
      votes.push(liveVote("rpc", raw, false, 0.9, a.endpoint));
    } else {
      votes.push(failedLiveVote("rpc", String(a.error ?? "eth_call failed")));
    }
  }

  if (res.consensus && res.value) {
    const decoded = decodeUint256(res.value);
    if (res.attempts.length === 0) {
      // Backward-compat: synthesize a vote when attempts aren't populated (e.g. test mocks)
      votes.push(liveVote("rpc", decoded, true, 0.9, undefined));
    } else {
      for (const v of votes) {
        if (v.raw === decoded && v.source === "rpc") v.consensus = true;
      }
    }
  }

  // Add cache vote from token balance cache
  if (cache) {
    const tcKey = `token:${chainKey.toLowerCase()}:${contract.toLowerCase()}:${owner}`;
    try {
      const cached = await cache.get<BalanceCacheEntry>(tcKey);
      const cv = cacheVote(cached);
      if (cv) votes.push(cv);
    } catch { /* cache miss */ }
  }

  const decision = resolveBalance(votes);

  // Check if ALL RPCs reverted → flag as non-ERC20 for future scans
  const allReverted = res.attempts.length > 0 && res.attempts.every((a) => {
    if (a.ok) return false;
    const msg = String(a.error ?? "");
    return msg.includes("revert") || msg.includes("reverted");
  });
  if (allReverted && cache) {
    const skipKey = `meta:skip:${chainKey.toLowerCase()}:${contract.toLowerCase()}`;
    cache.set(skipKey, { reason: "non-erc20" }, 24 * 60 * 60 * 1000).catch(() => {});
    return { decision: { raw: 0n, source: "none", confidence: 0, degraded: false, reason: "non_erc20_revert", votes }, skipped: true };
  }

  // Health recording
  if (decision.source === "rpc" && !decision.degraded) {
    const winner = decision.votes.find((v) => v.source === "rpc" && v.endpoint && v.raw === decision.raw);
    if (winner?.endpoint) rpcHealth.recordSuccess(chainKey, winner.endpoint);
  } else if (decision.degraded || decision.source === "none") {
    for (const ep of endpoints) rpcHealth.recordFailure(chainKey, ep);
  }

  // Persist cache on reliable live success, including confirmed zero balances.
  if (!decision.degraded && decision.source !== "cache" && decision.confidence >= 0.65 && cache) {
    const tcKey = `token:${chainKey.toLowerCase()}:${contract.toLowerCase()}:${owner}`;
    cache.set(tcKey, cacheEntry(decision), 3600_000).catch(() => {});
  }

  return { decision, skipped: false };
}
