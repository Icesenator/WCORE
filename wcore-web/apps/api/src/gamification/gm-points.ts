const DAY_MS = 86_400_000;

export type OnchainGmPointEvent = {
  chainKey: string;
  createdAt: Date;
};

export type PerChainGmPoints = {
  chain: string;
  count: number;
  points: number;
  streak: number;
  bestStreak: number;
};

function utcDayMs(date: Date): number {
  const d = new Date(date);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function buildPerChainGmPoints(events: OnchainGmPointEvent[]): PerChainGmPoints[] {
  const byChain = new Map<string, Set<number>>();

  for (const event of events) {
    const chain = event.chainKey.toLowerCase();
    const days = byChain.get(chain) ?? new Set<number>();
    days.add(utcDayMs(event.createdAt));
    byChain.set(chain, days);
  }

  return Array.from(byChain.entries()).map(([chain, days]) => {
    const sortedDays = Array.from(days).sort((a, b) => a - b);
    let run = 0;
    let bestStreak = 0;
    let prevDay: number | null = null;
    let points = 0;

    for (const day of sortedDays) {
      run = prevDay != null && day === prevDay + DAY_MS ? run + 1 : 1;
      points += 5 + (run > 1 ? run : 0);
      bestStreak = Math.max(bestStreak, run);
      prevDay = day;
    }

    const today = utcDayMs(new Date());
    const lastDay = sortedDays.at(-1);
    let currentStreak = 0;
    if (lastDay === today || lastDay === today - DAY_MS) {
      let expectedDay = lastDay;
      for (let i = sortedDays.length - 1; i >= 0; i--) {
        const day = sortedDays[i];
        if (day === expectedDay) {
          currentStreak++;
          expectedDay -= DAY_MS;
        } else if (day != null && day < expectedDay) {
          break;
        }
      }
    }

    return { chain, count: sortedDays.length, points, streak: currentStreak, bestStreak };
  });
}
