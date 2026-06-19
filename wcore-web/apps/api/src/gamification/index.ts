import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@wcore/db";
import { GM_FACTORIES, canonicalChainKey } from "@wcore/shared";
import { getChainMaxLogRange, getPrimaryRpcEndpoint, getRpcEndpoints, warmDynamicRpcEndpoints } from "@wcore/core";
import { encodeFunctionData, decodeFunctionResult, parseAbi } from "viem";
import { registerGmRoutes } from "./gm-routes.js";
import { registerGmOnchainRoutes } from "./gm-onchain.js";
import { registerGmContractsRoutes } from "./gm-contracts.js";
import { registerLeaderboardRoutes } from "./leaderboard.js";
import { registerCreatorRoutes } from "./creator.js";
import { registerNotificationRoutes } from "./notifications.js";
import { assertAllPublicHttp, assertPublicHttp } from "../lib/safe-http.js";

const PLATFORM_OWNER = {
  EVM: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080",
  SVM: "AxU68jEGjXMj3YGRPSPVXg4qpYmUWhoBUfsbuhrFyDe4",
};

const FACTORIES = GM_FACTORIES;

const GM_EVENT_SIG = "0x1374bba5cce7233cce0d4275e8dd0bc1b0ef510fb043198247fc3cb179f8189d";
const CONTRACT_DEPLOYED_EVENT = "0x33c981baba081f8fd2c52ac6ad1ea95b6814b4376640f55689051f6584729688"; // keccak256("ContractDeployed(address,address)")

// Defense-in-depth: fail boot if any configured RPC points at localhost,
// link-local, RFC1918, or a non-http(s) scheme. Without this, a tampered config
// could turn the API into an SSRF proxy for cloud metadata / internal services.
assertAllPublicHttp(Object.keys(FACTORIES).flatMap((chainKey) => getRpcEndpoints(chainKey, { includeDynamic: false, useHealth: false })), "gamification:centralized RPCs");
warmDynamicRpcEndpoints(Object.keys(FACTORIES));

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function getChainRpc(chainKey: string): string | undefined {
  return getPrimaryRpcEndpoint(chainKey);
}

export function getChainRpcs(chainKey: string): string[] | undefined {
  const endpoints = getRpcEndpoints(chainKey);
  return endpoints.length ? endpoints : undefined;
}

async function rpcFetch(rpcs: string[], body: unknown): Promise<{ result?: unknown; error?: unknown }> {
  for (const rpc of rpcs) {
    try {
      assertPublicHttp(rpc);
      const res = await fetch(rpc, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = await res.json() as { result?: unknown; error?: unknown };
      if (!data.error) return data;
    } catch (e) { console.error("rpcFetch RPC error:", (e as Error).message || String(e)); /* try next RPC */ }
  }
  return {};
}

async function readGmContractBalances(chainKey: string, contractAddress: string): Promise<{ creatorBalance: string; platformBalance: string }> {
  const rpcs = getChainRpcs(chainKey);
  if (!rpcs?.length) return { creatorBalance: "0", platformBalance: "0" };
  const [creatorData, platformData] = await Promise.all([
    rpcFetch(rpcs, { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: contractAddress, data: "0xaf55ec73" }, "latest"] }),
    rpcFetch(rpcs, { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: contractAddress, data: "0x62a5dbbc" }, "latest"] }),
  ]);
  return {
    creatorBalance: typeof creatorData.result === "string" ? BigInt(creatorData.result).toString() : "0",
    platformBalance: typeof platformData.result === "string" ? BigInt(platformData.result).toString() : "0",
  };
}

// Multicall3 default address — deployed at the same address on most EVM chains.
// https://www.multicall3.com/
const MULTICALL3_DEFAULT = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
// zkSync Era / Abstract use CREATE2 from a different deployer, so the canonical
// address misses and every batch silently falls back to N per-contract RPCs.
// Sources: https://docs.zksync.io / https://docs.abs.xyz
const MULTICALL3_OVERRIDES: Record<string, string> = {
  zksync_era: "0xF9cda624FBC7e059355ce98a31693d299FACd963",
  abstract: "0xaa630755eDeED8a82EB389BBd0eaeFa040f9bCC1",
};
function getMulticall3Address(chainKey: string): string {
  return MULTICALL3_OVERRIDES[chainKey.trim().toLowerCase()] ?? MULTICALL3_DEFAULT;
}
const CREATOR_BALANCE_SELECTOR = "0xaf55ec73" as const;
const PLATFORM_BALANCE_SELECTOR = "0x62a5dbbc" as const;

const multicall3Abi = parseAbi([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calls) payable returns (Result[] returnData)",
]);

async function readGmContractBalancesBatch(
  chainKey: string,
  contracts: Array<{ contractAddress: string }>,
): Promise<Map<string, { creatorBalance: string; platformBalance: string }>> {
  const out = new Map<string, { creatorBalance: string; platformBalance: string }>();
  if (contracts.length === 0) return out;
  const rpcs = getChainRpcs(chainKey);
  if (!rpcs?.length) { for (const c of contracts) out.set(c.contractAddress, { creatorBalance: "0", platformBalance: "0" }); return out; }

  // 2 calls per contract: creatorBalance + platformBalance
  const calls = contracts.flatMap((c) => [
    { target: c.contractAddress as `0x${string}`, allowFailure: true, callData: CREATOR_BALANCE_SELECTOR as `0x${string}` },
    { target: c.contractAddress as `0x${string}`, allowFailure: true, callData: PLATFORM_BALANCE_SELECTOR as `0x${string}` },
  ]);
  const callData = encodeFunctionData({ abi: multicall3Abi, functionName: "aggregate3", args: [calls] });
  const data = await rpcFetch(rpcs, {
    jsonrpc: "2.0", id: 1, method: "eth_call",
    params: [{ to: getMulticall3Address(chainKey), data: callData }, "latest"],
  });

  if (typeof data.result !== "string" || data.result === "0x") {
    // Multicall3 not deployed or revert: fall back to per-contract reads.
    const fallback = await Promise.all(contracts.map(async (c) => [c.contractAddress, await readGmContractBalances(chainKey, c.contractAddress)] as const));
    for (const [addr, bal] of fallback) out.set(addr, bal);
    return out;
  }

  try {
    const decoded = decodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", data: data.result as `0x${string}` });
    for (let i = 0; i < contracts.length; i++) {
      const creator = decoded[i * 2];
      const platform = decoded[i * 2 + 1];
      const creatorVal = creator?.success && creator.returnData.length >= 66 ? BigInt(creator.returnData) : 0n;
      const platformVal = platform?.success && platform.returnData.length >= 66 ? BigInt(platform.returnData) : 0n;
      out.set(contracts[i]!.contractAddress, {
        creatorBalance: creatorVal.toString(),
        platformBalance: platformVal.toString(),
      });
    }
  } catch (e) {
    console.error("Multicall3 decode error:", (e as Error).message || String(e));
    for (const c of contracts) out.set(c.contractAddress, { creatorBalance: "0", platformBalance: "0" });
  }
  return out;
}

export function extractDeployedContractAddresses(logs: Array<{ topics: string[] }>, creatorAddress: string): string[] {
  const creatorTopic = "0x000000000000000000000000" + creatorAddress.toLowerCase().slice(2);
  return logs
    .filter((log) => log.topics[2]?.toLowerCase() === creatorTopic)
    .map((log) => "0x" + (log.topics[1] ?? "").slice(26))
    .filter((address) => /^0x[a-fA-F0-9]{40}$/.test(address));
}

export async function gamificationPlugin(app: FastifyInstance, prisma: PrismaClient, isAdminAuthorized: (req: { headers: Record<string, string | string[] | undefined> }) => boolean) {
  // Give referral bonus to the user who referred this user (10% of points earned)
  async function addReferralBonus(userId: string, pointsEarned: number) {
    if (pointsEarned <= 0) return;
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { referredById: true } });
      if (!user?.referredById) return;
      const bonus = Math.max(1, Math.floor(pointsEarned * 0.1)); // 10%, minimum 1 point
      await prisma.user.update({
        where: { id: user.referredById },
        data: { score: { increment: bonus }, referralEarnings: { increment: bonus } },
      });
    } catch (_e) { console.error("Referral bonus failed:", _e); /* non-critical */ }
  }

  const sharedDeps = {
    prisma,
    startOfUtcDay,
    getChainRpc,
    getChainRpcs,
    getChainMaxLogRange,
    rpcFetch,
    readGmContractBalances,
    readGmContractBalancesBatch,
    extractDeployedContractAddresses,
    checkStreakBadges,
    addReferralBonus,
    FACTORIES,
    isAdminAuthorized,
    GM_EVENT_SIG,
    CONTRACT_DEPLOYED_EVENT,
    PLATFORM_OWNER,
  };

  await Promise.all([
    registerGmRoutes(app, prisma, sharedDeps),
    registerGmOnchainRoutes(app, prisma, sharedDeps),
    registerGmContractsRoutes(app, prisma, sharedDeps),
    registerLeaderboardRoutes(app, prisma, { PLATFORM_OWNER }),
    registerCreatorRoutes(app, prisma, { readGmContractBalances }),
    registerNotificationRoutes(app, prisma),
  ]);
}

async function checkStreakBadges(tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">, userId: string, streak: number) {
  const badgeMap: Record<number, string> = { 7: "streak_7", 30: "streak_30", 100: "streak_100" };
  const keys = Object.keys(badgeMap).map(Number).filter((d) => streak >= d);
  for (const days of keys) {
    const badgeKey = badgeMap[days];
    if (!badgeKey) continue;
    const badge = await tx.badge.findUnique({ where: { key: badgeKey } });
    if (!badge) continue;
    try {
      await tx.userBadge.create({ data: { userId, badgeId: badge.id } });
    } catch (e) { console.error("checkStreakBadges DB error:", (e as Error).message || String(e)); /* already exists */ }
  }
}

export async function seedGmContracts(prisma: PrismaClient) {
  const contracts = [
    { chainKey: "base", contractAddress: "0xea392000a2ae8045cfe72e538cdfbb809c6c49ea", creatorAddress: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080" },
  ];
  for (const c of contracts) {
    const chainKey = canonicalChainKey(c.chainKey);
    await prisma.gmContract.upsert({
      where: { chainKey_contractAddress: { chainKey, contractAddress: c.contractAddress } },
      update: { creatorAddress: c.creatorAddress },
      create: { ...c, chainKey },
    }).catch((e: unknown) => { console.error("seedGmContracts upsert error:", (e as Error)?.message || String(e)); });
  }
}
