export type ScanProgressDisplayInput = {
  walletDone: number;
  walletTotal: number;
  currentChainDone: number;
  currentChainTotal: number;
  overallChainDone?: number;
  overallChainTotal?: number;
  deepScan: boolean;
};

export type ScanProgressDisplay = {
  percent: number;
  primaryLabel: string;
  secondaryLabel: string | null;
};

function percent(done: number, total: number): number {
  if (total <= 0) return 0;
  const safeDone = Math.min(done, total);
  if (safeDone <= 0) return 0;
  return Math.max(1, Math.round((safeDone / total) * 100));
}

export function getScanProgressDisplay(input: ScanProgressDisplayInput): ScanProgressDisplay {
  const walletDone = Math.min(Math.ceil(input.walletDone), input.walletTotal);
  const overallChainTotal = input.overallChainTotal ?? input.currentChainTotal;
  if (input.deepScan && overallChainTotal > 0 && walletDone < input.walletTotal) {
    const overallChainDone = Math.min(Math.ceil(input.overallChainDone ?? input.currentChainDone), overallChainTotal);
    return {
      percent: percent(overallChainDone, overallChainTotal),
      primaryLabel: `${overallChainDone}/${overallChainTotal} chain checks`,
      secondaryLabel: `${walletDone}/${input.walletTotal} wallets`,
    };
  }

  return {
    percent: percent(walletDone, input.walletTotal),
    primaryLabel: input.walletTotal > 0 ? `${walletDone}/${input.walletTotal} wallets` : "Preparing scan...",
    secondaryLabel: null,
  };
}
