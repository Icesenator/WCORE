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

    // Classement par nombre de GM on-chain sur la periode (decision de Florian, 24/11/2026), puis par
    // points a egalite. Les GM sont comptes avant de choisir les 50 : un tri sur les points d'abord
    // laisserait de cote un utilisateur tres actif sur la periode mais peu dote en points.
    const gmAgg = await prisma.onchainGm.groupBy({
      by: ["userId"],
      _count: { id: true },
      where: since ? { createdAt: { gte: since } } : {},
      orderBy: { _count: { id: "desc" } },
    });
    // Frontiere : le 100e compteur (large marge sur les 50 affiches et l'exclusion du proprietaire de la
    // plateforme). Tous les ex aequo de la frontiere sont gardes : une coupe nette (take) pourrait ecarter
    // un utilisateur au meilleur score parmi des egalites avant le depart par points.
    const gmCutoff = gmAgg.length > 100 ? (gmAgg[99] as { _count: { id: number } })._count.id : 0;
    const gmKept = gmAgg.filter((g: { _count: { id: number } }) => g._count.id >= gmCutoff);
    const gmMap = new Map(gmKept.map((g: { userId: string; _count: { id: number } }) => [g.userId, g._count.id]));
    const gmUserIds = gmKept.map((g: { userId: string }) => g.userId);
    const candidates = gmUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: gmUserIds } },
          select: { id: true, address: true, score: true, gmStreak: true, longestStreak: true },
        })
      : [];
    const filtered = candidates
      .filter((u: { address: string }) => u.address.toLowerCase() !== PLATFORM_OWNER.EVM)
      .sort((a: { id: string; score: number; address: string }, b: { id: string; score: number; address: string }) =>
        ((gmMap.get(b.id) as number) ?? 0) - ((gmMap.get(a.id) as number) ?? 0)
        || b.score - a.score
        || a.address.localeCompare(b.address))
      .slice(0, 50);
    const userIds = filtered.map((u: { id: string }) => u.id);
    // Prisma.join([]) leve une erreur : sans utilisateur hors proprietaire, la route repondait 500 et le site
    // affichait le meme message vide qu'un classement sans points.
    if (userIds.length === 0) return { leaderboard: [], period };

    // Batch aggregate: contracts deployed per user
    const contractsAgg = await prisma.gmContract.groupBy({
      by: ["ownerId"],
      _count: { id: true },
      where: { ownerId: { in: userIds }, ...(since ? { createdAt: { gte: since } } : {}) },
    });
    const contractsMap = new Map(contractsAgg.map((c: { ownerId: string | null; _count: { id: number } }) => [c.ownerId, c._count.id]));

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
