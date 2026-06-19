import type { FastifyInstance } from "fastify";
import { PrismaClient, Prisma } from "@wcore/db";

export async function registerLeaderboardRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  deps: {
    PLATFORM_OWNER: { EVM: string; SVM: string };
  },
) {
  const { PLATFORM_OWNER } = deps;

  app.get("/api/leaderboard", async () => {
    const users = await prisma.user.findMany({
      select: { address: true, score: true, gmStreak: true, longestStreak: true },
      orderBy: { score: "desc" },
      take: 51, // +1 to account for possible admin exclusion
    });
    const filtered = users.filter((u: { address: string }) => u.address.toLowerCase() !== PLATFORM_OWNER.EVM).slice(0, 50);
    return { leaderboard: filtered };
  });

  app.get("/api/leaderboard/stats", async (req) => {
    const { LeaderboardStatsQuerySchema } = await import("../schemas.js");
    const { period: rawPeriod } = LeaderboardStatsQuerySchema.parse(req.query);
    const period = rawPeriod ?? "all";
    const since =
      period === "7d"
        ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        : period === "30d"
          ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          : null;

    const users = await prisma.user.findMany({
      select: { id: true, address: true, score: true, gmStreak: true, longestStreak: true },
      orderBy: { score: "desc" },
      take: 51,
    });
    const filtered = users.filter((u: { address: string }) => u.address.toLowerCase() !== PLATFORM_OWNER.EVM).slice(0, 50);
    const userIds = filtered.map((u: { id: string }) => u.id);

    // Batch aggregate: contracts deployed per user
    const contractsAgg = await prisma.gmContract.groupBy({
      by: ["ownerId"],
      _count: { id: true },
      where: { ownerId: { in: userIds }, ...(since ? { createdAt: { gte: since } } : {}) },
    });
    const contractsMap = new Map(contractsAgg.map((c: { ownerId: string | null; _count: { id: number } }) => [c.ownerId, c._count.id]));

    // Batch aggregate: GM count per user
    const gmAgg = await prisma.onchainGm.groupBy({
      by: ["userId"],
      _count: { id: true },
      where: { userId: { in: userIds }, ...(since ? { createdAt: { gte: since } } : {}) },
    });
    const gmMap = new Map(gmAgg.map((g: { userId: string; _count: { id: number } }) => [g.userId, g._count.id]));

    // Batch aggregate: tips received per user (contract owner)
    const tipsAgg = since
      ? await prisma.$queryRaw`
          SELECT c."ownerId", COUNT(g.id) as count
          FROM "gm_contracts" c
          JOIN "onchain_gms" g ON g."contractId" = c.id
          WHERE c."ownerId" IN (${Prisma.join(userIds)})
            AND g."createdAt" >= ${since}
          GROUP BY c."ownerId"
        `
      : await prisma.$queryRaw`
          SELECT c."ownerId", COUNT(g.id) as count
          FROM "gm_contracts" c
          JOIN "onchain_gms" g ON g."contractId" = c.id
          WHERE c."ownerId" IN (${Prisma.join(userIds)})
          GROUP BY c."ownerId"
        `;
    const tipsMap = new Map((tipsAgg as Array<{ ownerId: string; count: number }>).map((t: { ownerId: string; count: number }) => [t.ownerId, Number(t.count)]));

    const leaderboard = filtered.map((user: { id: string; address: string; score: number; gmStreak: number; longestStreak: number }) => ({
      address: user.address,
      score: user.score,
      gmStreak: user.gmStreak,
      longestStreak: user.longestStreak,
      totalContractsDeployed: contractsMap.get(user.id) ?? 0,
      totalTipsReceived: tipsMap.get(user.id) ?? 0,
      streakRecord: user.longestStreak,
      gmCount: gmMap.get(user.id) ?? 0,
    }));

    return { leaderboard, period };
  });

  app.get("/api/quests", async (req) => {
    const quests = await prisma.quest.findMany({ orderBy: { key: "asc" } });
    if (!req.user) return { quests: quests.map((q: Record<string, unknown>) => ({ ...q, completed: false })) };

    const completions = await prisma.userQuest.findMany({
      where: { userId: req.user.id },
      select: { questId: true },
    });
    const completedIds = new Set(completions.map((c: { questId: string }) => c.questId));

    return {
      quests: quests.map((q: Record<string, unknown>) => ({
        ...q,
        completed: completedIds.has(q["id"] as string),
      })),
    };
  });

  app.post("/api/quests/:questId/complete", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const { QuestParamsSchema } = await import("../schemas.js");
    const { questId } = QuestParamsSchema.parse(req.params);

    const quest = await prisma.quest.findUnique({ where: { id: questId } });
    if (!quest) return reply.code(404).send({ error: "quest_not_found" });

    const existing = await prisma.userQuest.findUnique({
      where: { userId_questId: { userId: req.user.id, questId } },
    });
    if (existing) return { error: "already_completed" };

    await prisma.userQuest.create({ data: { userId: req.user.id, questId } });
    await prisma.user.update({
      where: { id: req.user.id },
      data: { score: { increment: quest.scoreReward as number } },
    });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    return { completed: true, scoreReward: quest.scoreReward, totalScore: user?.score };
  });

  app.get("/api/badges", async (req) => {
    const badges = await prisma.badge.findMany({ orderBy: { key: "asc" } });
    if (!req.user) return { badges: badges.map((b: Record<string, unknown>) => ({ ...b, unlocked: false })) };

    const unlocked = await prisma.userBadge.findMany({
      where: { userId: req.user.id },
      select: { badgeId: true },
    });
    const unlockedIds = new Set(unlocked.map((u: { badgeId: string }) => u.badgeId));

    return {
      badges: badges.map((b: Record<string, unknown>) => ({
        ...b,
        unlocked: unlockedIds.has(b["id"] as string),
      })),
    };
  });
}
