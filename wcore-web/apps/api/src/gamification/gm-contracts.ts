import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@wcore/db";
import { canonicalChainKey, getFactory } from "@wcore/shared";
import type { GmHelpersDeps } from "./gm-helpers.js";
import { createGmHelpers } from "./gm-helpers.js";

const DISABLED_GM_CONTRACTS = new Set([
  "base:0x4622e578ca79864dd475cc241e623e2ba556fb1b",
]);

type GmContractResponse = {
  id: string;
  chainKey: string;
  contractAddress: string;
  creatorBalance: string;
  platformBalance: string;
  role?: string;
  [key: string]: unknown;
};

type GmRandomContract = {
  id: string;
  chainKey: string;
  contractAddress: string;
  creatorAddress?: string | null;
};

type GmContractAddress = {
  chainKey: string;
  contractAddress: string;
};

type DeployReceipt = {
  to?: string | null;
  status?: string | null;
  logs?: Array<{ address?: string | null; topics?: string[] }>;
};

function addressFromTopic(topic: string | undefined): string | null {
  if (!topic || !/^0x[0-9a-fA-F]{64}$/.test(topic)) return null;
  const address = `0x${topic.slice(26)}`.toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(address) ? address : null;
}

export function findVerifiedDeployedContract(receipt: DeployReceipt, factoryAddress: string, eventSig: string, expectedCreator: string): string | null {
  const factory = factoryAddress.toLowerCase();
  const creator = expectedCreator.toLowerCase();
  if (receipt.status !== "0x1") return null;
  if (receipt.to?.toLowerCase() !== factory) return null;

  for (const log of receipt.logs ?? []) {
    const topics = log.topics ?? [];
    if (log.address && log.address.toLowerCase() !== factory) continue;
    if (topics[0]?.toLowerCase() !== eventSig.toLowerCase()) continue;
    if (addressFromTopic(topics[2]) !== creator) continue;
    return addressFromTopic(topics[1]);
  }
  return null;
}

function maxBalance(a: string, b: string): string {
  try {
    return BigInt(a || "0") >= BigInt(b || "0") ? a : b;
  } catch {
    return a || b || "0";
  }
}

function hasWithdrawableBalance(value: string): boolean {
  try {
    return BigInt(value || "0") > 0n;
  } catch {
    return false;
  }
}

export function prepareMyContractsResponse(contracts: GmContractResponse[], isPlatformOwner: boolean): GmContractResponse[] {
  const byContract = new Map<string, GmContractResponse>();

  for (const contract of contracts) {
    const chainKey = contract.chainKey.toLowerCase();
    const contractAddress = contract.contractAddress.toLowerCase();
    const key = `${chainKey}:${contractAddress}`;
    const normalized = { ...contract, chainKey, contractAddress };
    const existing = byContract.get(key);

    if (!existing) {
      byContract.set(key, normalized);
      continue;
    }

    const creatorEntry = existing.role !== "platform" ? existing : normalized.role !== "platform" ? normalized : existing;
    byContract.set(key, {
      ...existing,
      ...creatorEntry,
      chainKey,
      contractAddress,
      role: creatorEntry.role,
      creatorBalance: maxBalance(existing.creatorBalance, normalized.creatorBalance),
      platformBalance: maxBalance(existing.platformBalance, normalized.platformBalance),
    });
  }

  return Array.from(byContract.values()).filter((contract) => {
    if (!isPlatformOwner || contract.role !== "platform") return true;
    return hasWithdrawableBalance(contract.platformBalance);
  });
}

export function filterUnusedGmContracts<T extends GmRandomContract>(contracts: T[], usedContractIds: Set<string>): T[] {
  return contracts.filter((contract) => !usedContractIds.has(contract.id));
}

export function filterDisabledGmContracts<T extends GmContractAddress>(contracts: T[]): T[] {
  return contracts.filter((contract) => !DISABLED_GM_CONTRACTS.has(`${contract.chainKey.toLowerCase()}:${contract.contractAddress.toLowerCase()}`));
}

export function pickCreatorContractsFirst<T extends GmRandomContract>(contracts: T[], userAddress: string): T[] {
  const normalized = userAddress.trim().toLowerCase();
  if (!normalized) return contracts;
  const mine = contracts.filter((contract) => contract.creatorAddress?.toLowerCase() === normalized);
  return mine.length > 0 ? mine : contracts;
}

export async function registerGmContractsRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  deps: GmHelpersDeps & {
    getChainRpcs: (chainKey: string) => string[] | undefined;
    readGmContractBalances: (chainKey: string, contractAddress: string) => Promise<{ creatorBalance: string; platformBalance: string }>;
    readGmContractBalancesBatch: (chainKey: string, contracts: Array<{ contractAddress: string }>) => Promise<Map<string, { creatorBalance: string; platformBalance: string }>>;
    CONTRACT_DEPLOYED_EVENT: string;
    PLATFORM_OWNER: { EVM: string; SVM: string };
  },
) {
  const { getChainRpcs, readGmContractBalances, readGmContractBalancesBatch, CONTRACT_DEPLOYED_EVENT, PLATFORM_OWNER } = deps;
  const { syncCooldown, syncOnChainContracts } = createGmHelpers(deps);
  const { fetchOnChainContracts } = createGmHelpers(deps);

  async function fetchDeployReceipt(chainKey: string, txHash: string): Promise<DeployReceipt | null> {
    const rpcs = getChainRpcs(chainKey);
    if (!rpcs?.length) return null;
    const { assertPublicHttp } = await import("../lib/safe-http.js");

    const fetchReceipt = async (rpc: string): Promise<DeployReceipt | null> => {
      try {
        assertPublicHttp(rpc);
        const response = await fetch(rpc, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash] }),
          signal: AbortSignal.timeout(10_000),
        });
        const data = await response.json() as { result?: DeployReceipt | null };
        return data.result ?? null;
      } catch {
        return null;
      }
    };

    // Receipt indexing on public RPCs can lag a few seconds behind the user's
    // wallet RPC (which already confirmed the tx before this POST). Retry with
    // backoff — same spirit as /api/gm/onchain verification — instead of
    // failing the registration on the first miss. Uniform for every chain.
    for (let attempt = 0; attempt < 5; attempt++) {
      const receipts = await Promise.all(rpcs.map(fetchReceipt));
      const receipt = receipts.find((r): r is DeployReceipt => Boolean(r)) ?? null;
      if (receipt) return receipt;
      if (attempt < 4) await new Promise((r) => setTimeout(r, 3000 + attempt * 2000));
    }
    return null;
  }

  // List all GM contracts (public — contract addresses are on-chain public data)
  app.get("/api/gm/contracts", async () => {
    const contracts = filterDisabledGmContracts(await prisma.gmContract.findMany({
      select: { chainKey: true, contractAddress: true },
      orderBy: { chainKey: "asc" },
    }));
    return { contracts };
  });

  // Deploy contract
  app.post("/api/gm/contracts/deploy", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const { GmDeployBodySchema } = await import("../schemas.js");
    const deployParsed = GmDeployBodySchema.safeParse(req.body);
    if (!deployParsed.success) {
      const issues = deployParsed.error.issues;
      const missing = issues.find(i => i.path[0] === "chainKey") ? "missing_chain_key"
        : issues.find(i => i.path[0] === "contractAddress") ? "missing_contract_address"
        : "missing_tx_hash";
      return reply.code(400).send({ error: missing });
    }
    const { contractAddress, txHash } = deployParsed.data;
    const chainKey = canonicalChainKey(deployParsed.data.chainKey);

    const factory = getFactory(chainKey);
    if (!factory) return reply.code(400).send({ error: "unsupported_chain" });

    const existing = await prisma.gmContract.findFirst({
      where: { chainKey: { equals: chainKey, mode: "insensitive" }, contractAddress: contractAddress.toLowerCase() },
    });
    if (existing) return reply.code(409).send({ error: "contract_already_registered", id: existing.id });

    const receipt = await fetchDeployReceipt(chainKey, txHash);
    const verifiedContract = receipt ? findVerifiedDeployedContract(receipt, factory.address, CONTRACT_DEPLOYED_EVENT, req.user.address ?? "") : null;
    if (verifiedContract !== contractAddress.toLowerCase()) {
      return reply.code(400).send({ error: "deploy_verification_failed" });
    }

    const contract = await prisma.gmContract.create({
      data: { chainKey, contractAddress: contractAddress.toLowerCase(), creatorAddress: req.user.address?.toLowerCase(), ownerId: req.user.id, deployTxHash: txHash },
    });

    return { contract };
  });

  // Random contract
  app.get("/api/gm/random", async (req, reply) => {
    const { GmRandomQuerySchema } = await import("../schemas.js");
    const gmRandom = GmRandomQuerySchema.parse(req.query);
    const chain = gmRandom.chain ?? "";
    const userAddress = (gmRandom.address || "").trim().toLowerCase();

    const where: Record<string, unknown> = chain ? { chainKey: { equals: canonicalChainKey(chain), mode: "insensitive" } } : {};
    const contracts: GmRandomContract[] = filterDisabledGmContracts(await prisma.gmContract.findMany({ where, select: { chainKey: true, contractAddress: true, id: true, creatorAddress: true } }));
    if (contracts.length === 0) return reply.code(404).send({ error: "no_contracts_available" });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    let eligible: typeof contracts = contracts;
    if (userAddress && req.user) {
      const usedToday = await prisma.onchainGm.findMany({
        where: {
          userId: req.user.id,
          contractId: { in: contracts.map((contract) => contract.id) },
          createdAt: { gte: today },
        },
        select: { contractId: true },
      });
      eligible = filterUnusedGmContracts(contracts, new Set(usedToday.map((gm) => gm.contractId)));
    }
    eligible = pickCreatorContractsFirst(eligible, userAddress);
    if (eligible.length === 0) return reply.code(404).send({ error: "no_contracts_available" });

    // Header GM (no chain filter): filter to chains where user has enough native balance for $0.05 tip
    if (!chain && userAddress && req.user) {
      const uniqueChains = [...new Set(eligible.map(c => c.chainKey))];
      const chainsWithBalance = new Set<string>();

      // Check native balance on each GM chain in parallel.
      // RPC amplification is mitigated by the anonymous gm_read rate limit (60/min).
      const balanceChecks = uniqueChains.map(async (chainKey) => {
        const rpcs = deps.getChainRpcs(chainKey);
        if (!rpcs || rpcs.length === 0) return;
        const rpc = rpcs[0]!;
        try {
          const res = await fetch(rpc, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [userAddress, "latest"] }),
            signal: AbortSignal.timeout(3000),
          });
          const data = await res.json() as { result?: string };
          const balanceWei = BigInt(data.result ?? "0x0");
          if (balanceWei === 0n) return;

          // Native price via internal API (cached 24h server-side).
          const priceRes = await fetch(`${process.env.INTERNAL_API_URL || "http://localhost:4000"}/api/price/native?chain=${chainKey}`, { signal: AbortSignal.timeout(3000) });
          const priceData = await priceRes.json() as { price?: number };
          const priceUsd = priceData.price ?? 0;
          if (priceUsd <= 0) return;

          const balanceUsd = Number(balanceWei) / 1e18 * priceUsd;
          if (balanceUsd >= 0.10) chainsWithBalance.add(chainKey);
        } catch { /* chain unreachable — skip */ }
      });

      await Promise.all(balanceChecks);

      // Filter eligible contracts to chains with sufficient balance
      const balanceEligible = eligible.filter(c => chainsWithBalance.has(c.chainKey));
      if (balanceEligible.length > 0) {
        const pick = balanceEligible[Math.floor(Math.random() * balanceEligible.length)]!;
        return { chainKey: pick.chainKey, contractAddress: pick.contractAddress };
      }
      // Fallback: no chains with sufficient balance — return any eligible contract
      // (tx will fail but at least we return something)
    }

    const pick = eligible[Math.floor(Math.random() * eligible.length)]!;
    return { chainKey: pick.chainKey, contractAddress: pick.contractAddress };
  });

    // Has deployed
  app.get("/api/gm/has-deployed", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const { ChainQuerySchema } = await import("../schemas.js");
    const chain = canonicalChainKey(ChainQuerySchema.parse(req.query).chain ?? "");
    const where: Record<string, unknown> = { ownerId: req.user.id };
    if (chain) where.chainKey = { equals: chain, mode: "insensitive" };

    let count = await prisma.gmContract.count({ where });

    // If DB has no contracts for this (user, chain) but the chain is specified
    // and user has an address, scan on-chain. This recovers contracts deployed
    // via the old fire-and-forget flow where registration may have failed silently.
    if (count === 0 && chain && req.user.address) {
      try {
        const onChain = await fetchOnChainContracts(chain, req.user.address.toLowerCase());
        for (const addr of onChain) {
          try {
            const existing = await prisma.gmContract.findFirst({
              where: { chainKey: { equals: chain, mode: "insensitive" }, contractAddress: addr.toLowerCase() },
              select: { ownerId: true },
            });
            if (existing?.ownerId && existing.ownerId !== req.user.id) continue;
            await prisma.gmContract.upsert({
              where: { chainKey_contractAddress: { chainKey: chain, contractAddress: addr.toLowerCase() } },
              update: { ownerId: req.user.id, creatorAddress: req.user.address.toLowerCase() },
              create: { chainKey: chain, contractAddress: addr.toLowerCase(), creatorAddress: req.user.address.toLowerCase(), ownerId: req.user.id },
            });
          } catch { /* duplicate */ }
        }
        count = await prisma.gmContract.count({ where });
      } catch { /* on-chain scan failed, return DB-only count */ }
    }

    return { hasDeployed: count > 0, contractCount: count };
  });

  // My contracts
  app.get("/api/gm/my-contracts", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const dbUser = await prisma.user.findUnique({ where: { id: req.user.id }, select: { address: true } });
    const userAddress = dbUser?.address?.toLowerCase() ?? "";
    const isPlatformOwner = userAddress === PLATFORM_OWNER.EVM.toLowerCase();

    // 1. Get contracts owned by this wallet address
    const owned = await prisma.gmContract.findMany({
      where: {
        OR: userAddress ? [
          { creatorAddress: userAddress },
          { owner: { address: userAddress } },
        ] : [
          { ownerId: req.user.id },
        ],
      },
      select: { id: true, chainKey: true, contractAddress: true, createdAt: true, creatorAddress: true },
      orderBy: { createdAt: "desc" },
    });
    const contracts: Array<typeof owned[0] & { role: "creator" | "platform" }> = owned.map((c: typeof owned[0]) => ({ ...c, role: "creator" as const }));

    // 2. For platform owner, include ALL contracts immediately
    if (isPlatformOwner) {
      const all = await prisma.gmContract.findMany({
        select: { id: true, chainKey: true, contractAddress: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      for (const c of all) {
        if (!contracts.some((oc: typeof contracts[0]) => oc.id === c.id)) {
          contracts.push({ ...c, role: "platform" as const, creatorAddress: null });
        }
      }
    }

    // 3. On-chain sync in background (non-blocking, 5 min cooldown per user)
    if (req.user.address) {
      const lastSync = syncCooldown.get(req.user.id);
      if (!lastSync || Date.now() - lastSync >= 300_000) {
        syncCooldown.set(req.user.id, Date.now());
        syncOnChainContracts(req.user.address.toLowerCase(), req.user.id).catch(() => {});
      }
    }

    // Batch balance reads via Multicall3, grouped by chain
    const byChain = new Map<string, typeof contracts>();
    for (const c of contracts) {
      const list = byChain.get(c.chainKey) ?? [];
      list.push(c);
      byChain.set(c.chainKey, list);
    }
    const balanceMaps = new Map<string, Map<string, { creatorBalance: string; platformBalance: string }>>();
    await Promise.all(Array.from(byChain.entries()).map(async ([chainKey, list]) => {
      const map = await readGmContractBalancesBatch(chainKey, list);
      balanceMaps.set(chainKey, map);
    }));
    const withBalances = contracts.map((contract) => {
      const balances = balanceMaps.get(contract.chainKey)?.get(contract.contractAddress)
        ?? { creatorBalance: "0", platformBalance: "0" };
      return {
        ...contract,
        creatorBalance: contract.role === "creator" ? balances.creatorBalance : "0",
        platformBalance: isPlatformOwner ? balances.platformBalance : "0",
      };
    });

    return { contracts: prepareMyContractsResponse(withBalances, isPlatformOwner) };
  });

  // Contract balance
  app.get("/api/gm/contracts/:id/balance", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const { GmContractIdParamsSchema } = await import("../schemas.js");
    const { id } = GmContractIdParamsSchema.parse(req.params);
    const contract = await prisma.gmContract.findUnique({
      where: { id },
      select: { id: true, chainKey: true, contractAddress: true, ownerId: true, creatorAddress: true },
    });
    if (!contract) return reply.code(404).send({ error: "not_found" });

    const dbUser = await prisma.user.findUnique({ where: { id: req.user.id }, select: { address: true } });
    const userAddress = (dbUser?.address ?? req.user.address).toLowerCase();
    const isContractOwner = contract.creatorAddress?.toLowerCase() === userAddress || contract.ownerId === req.user.id;
    const isPlatformOwner = userAddress === PLATFORM_OWNER.EVM.toLowerCase();

    if (!isContractOwner && !isPlatformOwner) {
      return reply.code(403).send({ error: "forbidden" });
    }

    try {
      const balances = await readGmContractBalances(contract.chainKey, contract.contractAddress);
      return {
        creatorBalance: isContractOwner ? balances.creatorBalance : "0",
        platformBalance: isPlatformOwner ? balances.platformBalance : "0",
        chainKey: contract.chainKey,
        contractAddress: contract.contractAddress,
      };
    } catch (e) {
      console.error("GM contract balance RPC error:", (e as Error).message || String(e));
      return { creatorBalance: "0", platformBalance: "0", chainKey: contract.chainKey, contractAddress: contract.contractAddress };
    }
  });
}
