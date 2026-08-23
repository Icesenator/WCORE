import { bucketChainCount, bucketWalletCount } from "./funnel-analytics";

export function roundTotalForShare(totalEur: number): string {
  const safe = Number.isFinite(totalEur) && totalEur > 0 ? totalEur : 0;
  if (safe >= 1_000_000) return `${(safe / 1_000_000).toFixed(1)}M`;
  if (safe >= 1_000) return `${(safe / 1_000).toFixed(1)}k`;
  return String(Math.round(safe));
}

export function buildShareCardUrl(
  apiUrl: string,
  input: { totalEur: number; walletCount: number; chainCount: number; cexCount?: number },
): string {
  const params = new URLSearchParams({
    total: roundTotalForShare(input.totalEur),
    cur: "eur",
    wallets: bucketWalletCount(input.walletCount),
    chains: bucketChainCount(input.chainCount),
    cex: String(Math.min(20, Math.max(0, Math.round(input.cexCount ?? 0)))),
  });
  return `${apiUrl.replace(/\/$/, "")}/api/share/clean-total-card.png?${params}`;
}
