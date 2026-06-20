import type { PrismaClient } from "@wcore/db";
import { canonicalChainKey, getFactory } from "@wcore/shared";
import { assertPublicHttp } from "../lib/safe-http.js";

export interface GmHelpersDeps {
  prisma: PrismaClient;
  getChainRpcs: (chainKey: string) => string[] | undefined;
  rpcFetch: (rpcs: string[], body: unknown) => Promise<{ result?: unknown; error?: unknown }>;
  FACTORIES: Record<string, { address: string; chainId: number }>;
  CONTRACT_DEPLOYED_EVENT: string;
  extractDeployedContractAddresses: (logs: Array<{ topics: string[] }>, creatorAddress: string) => string[];
  getChainMaxLogRange?: (chainKey: string) => number | undefined;
}

export function createGmHelpers(deps: GmHelpersDeps) {
  const { prisma, getChainRpcs, rpcFetch, FACTORIES, CONTRACT_DEPLOYED_EVENT, extractDeployedContractAddresses, getChainMaxLogRange } = deps;

  // Notifications helper — used by GM routes.
  // Deduplicates by (userId, type, title): if a notification with the same
  // type+title already exists for this user, skip creation. Prevents streak
  // milestone notifications from reappearing after a streak reset+rebuild cycle.
  async function createNotification(userId: string, type: string, title: string, body: string, metadata?: Record<string, unknown>) {
    try {
      const existing = await prisma.notification.findFirst({
        where: { userId, type, title },
        select: { id: true },
      });
      if (existing) return;
      await prisma.notification.create({ data: { userId, type, title, body, metadata: metadata as never ?? {} } });
    } catch (e) { console.error("createNotification DB error:", (e as Error).message || String(e)); /* silent */ }
  }

  // Generic RPC JSON fetch with failover across multiple endpoints.
  // Used by status-onchain where single-RPC reliance is brittle.
  async function rpcJson<T>(rpcs: string[], body: unknown): Promise<T | null> {
    const safeRpcs = rpcs.filter((r) => { try { assertPublicHttp(r); return true; } catch { return false; } });
    for (const r of safeRpcs) {
      try {
        const res = await fetch(r, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        return await res.json() as T;
      } catch { /* try next */ }
    }
    return null;
  }

  // Fetch on-chain contracts deployed by a user via the factory.
  // Uses eth_getLogs first (fast), falls back to enumerating factory.contracts().
  async function fetchOnChainContracts(chainKey: string, userAddress: string): Promise<string[]> {
    const rpcs = getChainRpcs(chainKey);
    if (!rpcs?.length) return [];
    const factory = getFactory(chainKey);
    if (!factory) return [];
    const paddedAddress = "0x000000000000000000000000" + userAddress.slice(2);
    const found: string[] = [];

    try {
      // Method 1: eth_getLogs (fast, works on nodes with full archive)
      let logsFound = false;
      const bnData = await rpcFetch(rpcs, { jsonrpc: "2.0", id: 1, method: "eth_blockNumber" });
      if (bnData.result) {
        const latest = parseInt(bnData.result as string, 16);
        // Respect the chain's MAX_LOG_RANGE (e.g. Moonriver/Moonbeam = 1024,
        // BASE = 2000). Without this, the official Moonriver RPC rejects our
        // 10k-block chunks with -32603 "block range too wide" and we never
        // discover the user's contracts via logs.
        const maxRange = getChainMaxLogRange?.(chainKey);
        const CHUNK = maxRange && maxRange > 0 ? Math.min(maxRange, 5000) : 5000;
        const MAX_CHUNKS = 50;

        for (let i = 0; i < MAX_CHUNKS; i++) {
          const to = latest - i * CHUNK;
          const from = Math.max(0, to - CHUNK);
          const data = await rpcFetch(rpcs, {
            jsonrpc: "2.0", id: 1,
            method: "eth_getLogs",
            params: [{
              address: factory.address,
              fromBlock: "0x" + from.toString(16),
              toBlock: "0x" + to.toString(16),
              topics: [CONTRACT_DEPLOYED_EVENT, null, paddedAddress],
            }],
          }) as { result?: Array<{ topics: string[] }> };
          if (data.result && data.result.length > 0) {
            found.push(...extractDeployedContractAddresses(data.result, userAddress));
            logsFound = true;
            break;
          }
          if (from === 0) break;
        }
      }

      // Method 2: fallback — enumerate factory.contracts(uint256) + check creator()
      // Runs even if Method 1 failed (eth_getLogs unsupported, etc.)
      if (!logsFound) {
        const countData = await rpcFetch(rpcs, { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: factory.address, data: "0x9399869d" }, "latest"] }) as { result?: string };
        const count = parseInt(countData.result || "0x0", 16) || 50;
        const MAX_SCAN = Math.min(count || 50, 50);
        for (let i = 0; i < MAX_SCAN; i++) {
          const addrData = await rpcFetch(rpcs, { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: factory.address, data: "0x474da79a" + i.toString(16).padStart(64, "0") }, "latest"] }) as { result?: string };
          if (!addrData.result) continue; // RPC failed, try next
          if (addrData.result === "0x") break; // empty slot, no more contracts
          const contractAddr = "0x" + addrData.result.slice(26);
          const creatorData = await rpcFetch(rpcs, { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: contractAddr, data: "0x02d05d3f" }, "latest"] }) as { result?: string };
          if (!creatorData.result || creatorData.result === "0x") continue;
          const creator = "0x" + creatorData.result.slice(26).toLowerCase();
          if (creator === userAddress.toLowerCase()) {
            found.push(contractAddr);
          }
        }
      }
      return found;
    } catch (e) { console.error("fetchOnChainContracts RPC error:", (e as Error).message || String(e)); return found; }
  }

  // TTL map to avoid re-syncing on-chain contracts on every request (5 min cooldown per user)
  const syncCooldown = new Map<string, number>();

  // Sync on-chain contracts to DB — TARGETED: only factory chains the user has
  // no DB row for, scanned in parallel. This is the single recovery mechanism
  // shared by /api/gm/my-contracts and /api/gm/status so a deploy whose API
  // registration failed self-heals on the next page load, uniformly for every
  // factory chain. Never overwrites existing owners. Returns synced chainKeys.
  async function syncOnChainContracts(userAddress: string, userId: string): Promise<string[]> {
    const owned = await prisma.gmContract.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { creatorAddress: userAddress },
          { owner: { address: userAddress } },
        ],
      },
      select: { chainKey: true },
    });
    const known = new Set(owned.map((c: { chainKey: string }) => canonicalChainKey(c.chainKey)));
    const missing = Object.keys(FACTORIES)
      .map(canonicalChainKey)
      .filter((chainKey) => !known.has(chainKey));
    if (missing.length === 0) return [];

    const syncedKeys: string[] = [];
    await Promise.allSettled(missing.map(async (chainKey) => {
      const onChain = await fetchOnChainContracts(chainKey, userAddress);
      const addresses = Array.from(new Set(onChain.map((addr) => addr.toLowerCase())));
      if (addresses.length === 0) return;
      try {
        const existing = await prisma.gmContract.findMany({
          where: { chainKey: { equals: chainKey, mode: "insensitive" }, contractAddress: { in: addresses } },
          select: { contractAddress: true, ownerId: true },
        });
        const existingByAddress = new Map(existing.map((row: { contractAddress: string; ownerId: string | null }) => [row.contractAddress.toLowerCase(), row]));
        const recoverableExisting = existing
          .filter((row: { ownerId: string | null }) => !row.ownerId || row.ownerId === userId)
          .map((row: { contractAddress: string }) => row.contractAddress.toLowerCase());
        const createRows = addresses
          .filter((addr) => !existingByAddress.has(addr))
          .map((addr) => ({ chainKey, contractAddress: addr, creatorAddress: userAddress, ownerId: userId }));

        if (recoverableExisting.length > 0) {
          await prisma.gmContract.updateMany({
            where: {
              chainKey: { equals: chainKey, mode: "insensitive" },
              contractAddress: { in: recoverableExisting },
              OR: [{ ownerId: null }, { ownerId: userId }],
            },
            data: { ownerId: userId, creatorAddress: userAddress },
          });
        }
        if (createRows.length > 0) {
          await prisma.gmContract.createMany({ data: createRows, skipDuplicates: true });
        }
        if (recoverableExisting.length > 0 || createRows.length > 0) syncedKeys.push(chainKey);
      } catch (e) { console.error("syncOnChainContracts gmContract batch DB error:", (e as Error).message || String(e)); /* ignore duplicates */ }
    }));
    return syncedKeys;
  }

  return { createNotification, rpcJson, fetchOnChainContracts, syncCooldown, syncOnChainContracts };
}
