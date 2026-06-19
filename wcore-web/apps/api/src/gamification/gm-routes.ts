import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@wcore/db";
import { createGmHelpers } from "./gm-helpers.js";

type ChainStatusRow = { chainKey: string };

export function buildGmStatusResponse(
  contracts: ChainStatusRow[],
  gmsToday: ChainStatusRow[],
): Record<string, { deployed: boolean; gmDone: boolean }> {
  const result: Record<string, { deployed: boolean; gmDone: boolean }> = {};
  for (const c of contracts) {
    const chainKey = c.chainKey.toLowerCase();
    result[chainKey] ??= { deployed: false, gmDone: false };
    result[chainKey]!.deployed = true;
  }
  for (const g of gmsToday) {
    const chainKey = g.chainKey.toLowerCase();
    result[chainKey] ??= { deployed: false, gmDone: false };
    result[chainKey]!.gmDone = true;
  }
  return result;
}

export async function registerGmRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  deps: {
    startOfUtcDay: (date: Date) => Date;
    checkStreakBadges: (tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">, userId: string, streak: number) => Promise<void>;
    addReferralBonus: (userId: string, pointsEarned: number) => Promise<void>;
    getChainRpcs: (chainKey: string) => string[] | undefined;
    rpcFetch: (rpcs: string[], body: unknown) => Promise<{ result?: unknown; error?: unknown }>;
    FACTORIES: Record<string, { address: string; chainId: number }>;
    CONTRACT_DEPLOYED_EVENT: string;
    extractDeployedContractAddresses: (logs: Array<{ topics: string[] }>, creatorAddress: string) => string[];
    getChainMaxLogRange?: (chainKey: string) => number | undefined;
  },
) {
  const { startOfUtcDay, checkStreakBadges, addReferralBonus } = deps;
  const { createNotification, syncCooldown, syncOnChainContracts } = createGmHelpers({ ...deps, prisma });

  // 5 minutes per user — same cadence as /api/gm/my-contracts. Keeps the global
  // status cheap while still recovering on-chain state within a few page loads
  // after a fresh deploy whose API registration silently failed.
  const STATUS_SYNC_COOLDOWN_MS = 5 * 60 * 1000;

  // General off-chain GM (free, once per day)
  app.post("/api/gm", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });

    const now = new Date();
    const today = startOfUtcDay(now);
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    if (!user) return reply.code(404).send({ error: "user_not_found" });

    if (user.lastGmDate) {
      const lastGmDay = startOfUtcDay(new Date(user.lastGmDate));
      if (lastGmDay.getTime() >= today.getTime()) {
        return { error: "already_gm_today", streak: user.gmStreak };
      }

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (lastGmDay.getTime() >= yesterday.getTime()) {
        const newStreak = user.gmStreak + 1;
        const newLongest = Math.max(newStreak, user.longestStreak);
        const scoreGain = 10 + (newStreak > 1 ? newStreak : 0);

        const updated = await prisma.user.updateMany({
          where: { id: user.id, OR: [{ lastGmDate: null }, { lastGmDate: { lt: today } }] },
          data: {
            gmStreak: newStreak,
            longestStreak: newLongest,
            lastGmDate: now,
            score: { increment: scoreGain },
          },
        });
        if (updated.count === 0) return { error: "already_gm_today", streak: user.gmStreak };

        await checkStreakBadges(prisma, user.id, newStreak);
        if (newStreak > 0 && newStreak % 7 === 0) {
          createNotification(user.id, "gm_streak", `${newStreak}-day GM Streak!`, `You've reached a ${newStreak}-day GM streak. Keep it going!`);
        }
        addReferralBonus(user.id, scoreGain).catch(() => {});
        return { streak: newStreak, longestStreak: newLongest, scoreGain, totalScore: user.score + scoreGain };
      }
    }

    const newLongest = Math.max(1, user.longestStreak);
    const updated = await prisma.user.updateMany({
      where: { id: user.id, OR: [{ lastGmDate: null }, { lastGmDate: { lt: today } }] },
      data: { gmStreak: 1, longestStreak: newLongest, lastGmDate: now, score: { increment: 10 } },
    });
    if (updated.count === 0) return { error: "already_gm_today", streak: user.gmStreak };

    createNotification(user.id, "gm_first", "First GM!", "Welcome to WCORE! You've completed your first GM. Check out your streak on the leaderboard.");
    addReferralBonus(user.id, 10).catch(() => {});
    return { streak: 1, longestStreak: newLongest, scoreGain: 10, totalScore: user.score + 10 };
  });

  // GM status for current user (general + per-chain).
  // Also runs a per-user-cooldown on-chain scan for any factory chain that
  // doesn't have a row in DB. Without this, a deploy whose API registration
  // silently failed would leave the user stuck on the "Deploy" button until
  // they reloaded /api/gm/my-contracts. See gm-helpers.fetchOnChainContracts.
  app.get("/api/gm/status", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dbUser = await prisma.user.findUnique({ where: { id: req.user.id }, select: { address: true } });
    const userAddress = dbUser?.address?.toLowerCase() ?? req.user.address?.toLowerCase() ?? "";

    const contracts = await prisma.gmContract.findMany({
      where: userAddress ? {
        OR: [
          { ownerId: req.user.id },
          { creatorAddress: userAddress },
          { owner: { address: userAddress } },
        ],
      } : { ownerId: req.user.id },
      select: { chainKey: true },
    });

    // Recover on-chain state for factory chains that the DB has no row for.
    // Shared targeted sync (gm-helpers.syncOnChainContracts) — same mechanism
    // as /api/gm/my-contracts, gated by the same 5-minute per-user cooldown.
    if (userAddress) {
      const lastSync = syncCooldown.get(req.user.id) ?? 0;
      if (Date.now() - lastSync >= STATUS_SYNC_COOLDOWN_MS) {
        syncCooldown.set(req.user.id, Date.now());
        try {
          const syncedKeys = await syncOnChainContracts(userAddress, req.user.id);
          for (const chainKey of syncedKeys) {
            contracts.push({ chainKey });
          }
        } catch (e) { console.error("status on-chain sync failed:", (e as Error).message || String(e)); }
      }
    }

    const gmsToday = await prisma.onchainGm.findMany({
      where: { userId: req.user.id, createdAt: { gte: today } },
      select: { chainKey: true },
    });
    return buildGmStatusResponse(contracts, gmsToday);
  });
}
