import type { ChainScan } from "@wcore/shared";

export type CexProvider = "binance" | "bitpanda" | "bitfinex" | "bybit" | "coinbase" | "okx" | "kraken";

export interface WalletResultLike {
  address: string;
  label: string;
  chains: ChainScan[];
  totalEur: number;
  isCex?: boolean;
}

export interface CexAccountSummary {
  id: string;
  provider: CexProvider;
  label: string | null;
  totalEur: number;
}

export interface CexWalletListItem {
  address: string;
  label: string;
  chainType: "CEX";
  isCex: true;
  cexId: string;
  cexProvider: CexProvider;
  totalEur: number;
  icon: string;
}

const CEX_PROVIDER_META: Record<CexProvider, { label: string; icon: string }> = {
  binance: { label: "Binance", icon: "https://cdn.simpleicons.org/binance/F0B90B" },
  bitpanda: { label: "Bitpanda", icon: "https://www.bitpanda.com/favicon.ico" },
  bitfinex: { label: "Bitfinex", icon: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/37.png" },
  bybit: { label: "Bybit", icon: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/521.png" },
  coinbase: { label: "Coinbase", icon: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/89.png" },
  okx: { label: "OKX", icon: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/294.png" },
  kraken: { label: "Kraken", icon: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/24.png" },
};

export function getCexProviderMeta(provider: CexProvider) {
  return CEX_PROVIDER_META[provider];
}

export function sortWalletResultsByValueDesc<T extends WalletResultLike>(wallets: T[]): T[] {
  return [...wallets].sort((a, b) => b.totalEur - a.totalEur);
}

export function buildCexWalletListItem(account: CexAccountSummary): CexWalletListItem {
  const meta = getCexProviderMeta(account.provider);
  return {
    address: `cex:${account.provider}:${account.id}`,
    label: account.label ?? meta.label,
    chainType: "CEX",
    isCex: true,
    cexId: account.id,
    cexProvider: account.provider,
    totalEur: account.totalEur,
    icon: meta.icon,
  };
}

export function parseCexWalletAddress(address: string): { provider: CexProvider; id: string } | null {
  const match = /^cex:(binance|bitpanda|bitfinex|bybit|coinbase|okx|kraken):(.+)$/i.exec(address);
  if (!match) return null;
  return { provider: match[1]!.toLowerCase() as CexProvider, id: match[2]! };
}

export function isCexSyntheticContract(contract: string | null | undefined): boolean {
  return /^[A-Z0-9.-]+:[a-z0-9-]+$/i.test(String(contract ?? ""));
}
