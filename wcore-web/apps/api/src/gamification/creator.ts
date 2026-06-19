import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@wcore/db";

export async function registerCreatorRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  _deps: {
    readGmContractBalances: (chainKey: string, contractAddress: string) => Promise<{ creatorBalance: string; platformBalance: string }>;
  },
) {
  app.get("/api/creator/stats", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });

    const contracts = await prisma.gmContract.findMany({
      where: { ownerId: req.user.id },
      select: { id: true, chainKey: true, contractAddress: true },
    });

    if (contracts.length === 0) {
      return {
        revenueByDay: {},
        totalRevenue: 0,
        totalEthReceived: "0",
        byChain: {},
        topSenders: [],
        gmLog: [],
        contracts: 0,
      };
    }

    const contractIds = contracts.map((c: { id: string }) => c.id);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // All-time data (totalEthReceived, byChain, topSenders are lifetime, not 30d)
    const [allGms, recentGms] = await Promise.all([
      prisma.onchainGm.findMany({
        where: { contractId: { in: contractIds } },
        include: {
          user: { select: { address: true } },
          contract: { select: { chainKey: true } },
        },
      }),
      prisma.onchainGm.findMany({
        where: { contractId: { in: contractIds }, createdAt: { gte: thirtyDaysAgo } },
        include: {
          user: { select: { address: true } },
          contract: { select: { chainKey: true, contractAddress: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // All-time totals
    let totalEthWei = 0n;
    const byChain: Record<string, string> = {};
    const senderMap = new Map<string, bigint>();

    for (const gm of allGms as unknown as Array<{
      tipWei: string | null;
      user: { address: string };
      contract: { chainKey: string };
    }>) {
      const tip = gm.tipWei ? BigInt(gm.tipWei) : 0n;
      totalEthWei += tip;
      const chain = gm.contract.chainKey;
      byChain[chain] = (BigInt(byChain[chain] ?? "0") + tip).toString();
      const sender = gm.user.address.toLowerCase();
      senderMap.set(sender, (senderMap.get(sender) ?? 0n) + tip);
    }

    const topSenders = Array.from(senderMap.entries())
      .sort(([, a], [, b]) => (b > a ? 1 : b < a ? -1 : 0))
      .slice(0, 5)
      .map(([address, wei]) => ({ address, eth: (Number(wei) / 1e18).toFixed(6) }));

    // 30-day daily breakdown
    const revenueByDay: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      revenueByDay[d.toISOString().split("T")[0]!] = 0;
    }
    for (const gm of recentGms as unknown as Array<{
      createdAt: Date;
      tipWei: string | null;
    }>) {
      const day = gm.createdAt.toISOString().split("T")[0]!;
      const tip = gm.tipWei ? Number(BigInt(gm.tipWei)) / 1e18 : 0;
      revenueByDay[day] = (revenueByDay[day] || 0) + tip;
    }

    const gmLog = (recentGms as unknown as Array<{
      createdAt: Date;
      tipWei: string | null;
      user: { address: string };
      txHash: string;
      contract: { chainKey: string; contractAddress: string };
    }>).map((gm) => ({
      date: gm.createdAt.toISOString(),
      from: gm.user.address,
      amount: gm.tipWei ? Number(BigInt(gm.tipWei)) / 1e18 : 0,
      chain: gm.contract.chainKey,
      txHash: gm.txHash,
      contractAddress: gm.contract.contractAddress,
    }));

    return {
      revenueByDay,
      totalRevenue: recentGms.length,
      totalEthReceived: totalEthWei.toString(),
      byChain,
      topSenders,
      gmLog,
      contracts: contracts.length,
    };
  });
}
