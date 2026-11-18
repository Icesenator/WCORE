import type { PrismaClient } from "@wcore/db";
import { canonicalChainKey, getFactory } from "@wcore/shared";
import { safeFetch } from "../lib/safe-http.js";

export interface GmHelpersDeps {
  prisma: PrismaClient;
  getChainRpcs: (chainKey: string) => string[] | undefined;
  rpcFetch: (rpcs: string[], body: unknown) => Promise<{ result?: unknown; error?: unknown }>;
  FACTORIES: Record<string, { address: string; chainId: number }>;
  CONTRACT_DEPLOYED_EVENT: string;
  extractDeployedContractAddresses: (logs: Array<{ topics: string[] }>, creatorAddress: string) => string[];
  getChainMaxLogRange?: (chainKey: string) => number | undefined;
}

// GmFactory.getAllContracts() selector (keccak256 of the signature, first 4 bytes).
const GET_ALL_CONTRACTS = "0x18d3ce96";
// GmFactory.isContract(address) selector (public mapping getter).
const IS_CONTRACT = "0x16279055";
const CREATOR_CHECK_CONCURRENCY = 8;
const LIST_RPC_FANOUT = 3;
// Above this the list is not a WCORE factory as deployed today; use the older paths.
const MAX_LISTED_CONTRACTS = 500;

/**
 * Decodes an ABI-encoded `address[]` return value. Returns null for anything that is
 * not a well-formed array (RPC error, revert, a factory without getAllContracts), so
 * the caller can fall back instead of reading a malformed answer as "no contract".
 */
export function decodeAddressArray(result: unknown): string[] | null {
  if (typeof result !== "string" || !/^0x([0-9a-fA-F]{64})*$/.test(result)) return null;
  const hex = result.slice(2);
  if (hex.length < 128) return null;
  const word = (i: number) => hex.slice(i * 64, i * 64 + 64);
  const offset = parseInt(word(0), 16);
  if (offset !== 32) return null;
  const length = parseInt(word(1), 16);
  if (!Number.isSafeInteger(length) || length > MAX_LISTED_CONTRACTS || hex.length !== (2 + length) * 64) return null;
  const out: string[] = [];
  for (let i = 0; i < length; i++) {
    const w = word(2 + i);
    if (!/^0{24}/.test(w)) return null;
    out.push(("0x" + w.slice(24)).toLowerCase());
  }
  return out;
}

function uniqueAddresses(addrs: string[]): string[] {
  return [...new Map(addrs.map((a) => [a.toLowerCase(), a] as const)).values()];
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
    for (const r of rpcs) {
      try {
        // safeFetch rejects an unsafe URL by throwing, which the catch below turns
        // into "try the next endpoint" — same outcome as the old pre-filter.
        const res = await safeFetch(r, {
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
      // Method 0: the factory's full list in ONE call (getAllContracts), then every
      // creator() in parallel. Complete whatever the deployment age, and fast. The
      // older paths below cost up to 50 sequential eth_getLogs plus 50 sequential
      // contracts(i) calls (each reverting index retried on every RPC), which is what
      // held /api/gm/has-deployed at 30 s on chains where the user had no contract yet.
      // The list is append-only: read it from up to LIST_RPC_FANOUT endpoints at once and
      // keep the union, so a lagging primary node cannot hide a contract a backup knows.
      const lists = await Promise.all(rpcs.slice(0, LIST_RPC_FANOUT).map(async (rpc) =>
        decodeAddressArray((await rpcFetch([rpc], { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: factory.address, data: GET_ALL_CONTRACTS }, "latest"] }) as { result?: string }).result)));
      const decoded = lists.filter((l): l is string[] => l !== null);
      const all = decoded.length > 0 ? [...new Set(decoded.flat())] : null;
      if (all) {
        const me = userAddress.toLowerCase();
        // A "none" needs the priority RPC's own list: master's paths trust that node
        // first, so a backup that answered while it failed must not decide alone (two
        // lagging backups could otherwise hide a contract the priority node knows).
        let complete = lists[0] !== null;
        for (let i = 0; i < all.length; i += CREATOR_CHECK_CONCURRENCY) {
          const batch = all.slice(i, i + CREATOR_CHECK_CONCURRENCY);
          // Each listed address is confirmed through the priority RPC order, exactly like
          // master's contracts(i) path: the factory must know it (isContract) and its
          // creator() must be the user. A list entry alone never registers a contract.
          const checks = await Promise.all(batch.map((addr) => Promise.all([
            rpcFetch(rpcs, { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: factory.address, data: IS_CONTRACT + addr.slice(2).padStart(64, "0") }, "latest"] }) as Promise<{ result?: string }>,
            rpcFetch(rpcs, { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: addr, data: "0x02d05d3f" }, "latest"] }) as Promise<{ result?: string }>,
          ])));
          checks.forEach(([member, creator], j) => {
            // isContract() is one ABI bool word, creator() one ABI address word; anything
            // else, or a list entry the factory does not confirm, leaves the list partial.
            if (member.result !== "0x" + "0".repeat(63) + "1") { complete = false; return; }
            if (typeof creator.result !== "string" || !/^0x0{24}[0-9a-fA-F]{40}$/.test(creator.result)) { complete = false; return; }
            if (("0x" + creator.result.slice(26)).toLowerCase() === me) found.push(batch[j]!);
          });
        }
        // An unreadable creator() could be the user's own contract, so a partial list is
        // never final: keep what it proved and let the older paths add the rest.
        if (complete) return found;
      }

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
      // A partial fast path may already hold what the older paths find again.
      return uniqueAddresses(found);
    } catch (e) { console.error("fetchOnChainContracts RPC error:", (e as Error).message || String(e)); return uniqueAddresses(found); }
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
