export interface FunnelEventRow {
  event: string;
  campaign: string;
  surface: string;
  variant: string;
  dimensionKey: string;
  count: number;
}

export interface FunnelStats {
  landingEvents: number;
  scanStarts: number;
  scanOutcomes: number;
  startRate: number | null;
  outcomeRate: number | null;
  successRate: number | null;
  eventCounts: Record<string, number>;
  portfolioActions: Record<string, number>;
}

export function processFunnelEvents(rows: FunnelEventRow[], campaign: string): FunnelStats {
  const eventCounts: Record<string, number> = {};
  const portfolioActions: Record<string, number> = {};
  let landing = 0;
  let starts = 0;
  let completed = 0;
  let failed = 0;

  for (const row of rows) {
    if (row.campaign !== campaign) continue;
    eventCounts[row.event] = (eventCounts[row.event] ?? 0) + row.count;
    if (row.event === "campaign_landing_viewed") landing += row.count;
    if (row.event === "scan_started") starts += row.count;
    if (row.event === "scan_completed") completed += row.count;
    if (row.event === "scan_failed") failed += row.count;
    if (row.event === "portfolio_action") {
      const match = row.dimensionKey.match(/action=(\w+)/);
      const action = match?.[1];
      if (action) {
        portfolioActions[action] = (portfolioActions[action] ?? 0) + row.count;
      }
    }
  }

  const outcomes = completed + failed;
  return {
    landingEvents: landing,
    scanStarts: starts,
    scanOutcomes: outcomes,
    startRate: landing > 0 ? starts / landing : null,
    outcomeRate: starts > 0 ? outcomes / starts : null,
    successRate: outcomes > 0 ? completed / outcomes : null,
    eventCounts,
    portfolioActions,
  };
}

export function formatFunnelRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}
