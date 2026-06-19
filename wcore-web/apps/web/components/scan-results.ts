import type { ChainScan } from "@wcore/shared";

const MAJOR_PRICEABLE_SYMBOLS = new Set(["AAVE", "BTC", "CBETH", "DAI", "ETH", "ETHFI", "LINK", "PENDLE", "RETH", "STETH", "UNI", "USDC", "USDT", "WBTC", "WETH", "WSTETH"]);

export interface MergedScanResults {
  chains: ChainScan[];
  totalEur: number;
}

export function orderScanJobsForExecution<T extends { vm: string }>(jobs: T[]): T[] {
  return [...jobs].sort((a, b) => {
    const aPriority = a.vm === "EVM" ? 1 : 0;
    const bPriority = b.vm === "EVM" ? 1 : 0;
    return aPriority - bPriority;
  });
}

export function mergeChainResults(existing: ChainScan[], incoming: ChainScan[]): MergedScanResults {
  const byChain = new Map<string, ChainScan>();
  for (const chain of existing) byChain.set(chain.chainKey.toLowerCase(), chain);
  for (const chain of incoming) byChain.set(chain.chainKey.toLowerCase(), chain);

  const chains = Array.from(byChain.values()).sort((a, b) => b.totals.valueEur - a.totals.valueEur);
  const totalEur = Math.round(chains.reduce((sum, chain) => sum + chain.totals.valueEur, 0) * 100) / 100;
  return { chains, totalEur };
}

export function shouldCacheWalletScanResult(chains: ChainScan[], error?: string): boolean {
  if (chains.length === 0 || error) return false;
  return !chains.some((chain) => {
    const hasErrors = chain.errors.length > 0;
    const hasCriticalError = chain.errors.some((err) => {
      const message = err.message.toLowerCase();
      return message.includes("token accounts: no data") ||
        message.includes("balances fetch:") ||
        message.includes("balances http") ||
        message.includes("native balance failed on all");
    });
    const nativeBalance = Number(chain.native?.balance ?? 0);
    const nativeValue = chain.native?.valueEur ?? 0;
    const hasValue = chain.totals.valueEur > 0 || nativeValue > 0 || nativeBalance > 0 || chain.tokens.length > 0;
    return hasCriticalError || hasMajorPriceableTokenWithoutPrice(chain) || (hasErrors && !hasValue);
  });
}

function hasMajorPriceableTokenWithoutPrice(chain: ChainScan): boolean {
  for (const token of chain.tokens) {
    const symbol = token.symbol.toUpperCase();
    if (!MAJOR_PRICEABLE_SYMBOLS.has(symbol)) continue;
    if (Number(token.balance ?? 0) <= 0) continue;
    if (token.priceEur != null) continue;
    if (chain.errors.some((err) => err.message.toUpperCase().includes(`${symbol} PRICE: NO_PRICE`))) return true;
  }
  return false;
}
