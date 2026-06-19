import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const quests = [
    { key: "first_scan", title: "First Scan", description: "Scan your first wallet", scoreReward: 25, type: "once" },
    { key: "scan_10_chains", title: "Explorer", description: "Scan 10+ chains in one request", scoreReward: 50, type: "daily" },
    { key: "whale_watch", title: "Whale Watch", description: "Scan a wallet with > $10,000 value", scoreReward: 100, type: "daily" },
    { key: "multi_wallet", title: "Multi-Wallet", description: "Scan 3+ wallets at once", scoreReward: 30, type: "daily" },
    { key: "daily_gm", title: "GM", description: "Say GM today", scoreReward: 10, type: "daily" },
  ];

  const badges = [
    { key: "first_scan", title: "Pioneer", description: "Completed your first wallet scan", icon: "🔍" },
    { key: "streak_7", title: "7-Day Streak", description: "Said GM for 7 consecutive days", icon: "🔥" },
    { key: "streak_30", title: "Monthly Warrior", description: "Said GM for 30 consecutive days", icon: "⚔️" },
    { key: "streak_100", title: "Centurion", description: "Said GM for 100 consecutive days", icon: "👑" },
    { key: "scan_100_chains", title: "Chain Master", description: "Scanned 100+ different chains", icon: "⛓️" },
    { key: "millionaire", title: "Millionaire", description: "Scanned a wallet with > $1M value", icon: "💎" },
    { key: "multi_chain", title: "Multi-VM", description: "Scanned wallets across EVM + SVM + Cosmos", icon: "🌐" },
  ];

  for (const q of quests) {
    await prisma.quest.upsert({ where: { key: q.key }, update: {}, create: q });
  }

  for (const b of badges) {
    await prisma.badge.upsert({ where: { key: b.key }, update: {}, create: b });
  }

  console.log(`Seeded ${quests.length} quests + ${badges.length} badges`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
