import type { ChainScan } from "@wcore/shared";
import { isFailedChain, portfolioCsvFilename } from "./share-card";

export interface ExportRow {
  address: string;
  label: string;
  chains: ChainScan[];
  totalEur: number;
}

export interface HeaderKeys {
  address: string;
  label: string;
  chain: string;
  symbol: string;
  name: string;
  contract: string;
  balance: string;
  priceLabel: string;
  valueLabel: string;
}

const PORTFOLIO_HEADERS = [
  "wallet_address",
  "wallet_label",
  "chain_key",
  "chain_name",
  "vm",
  "asset_type",
  "symbol",
  "name",
  "contract",
  "balance",
  "price_eur",
  "value_eur",
  "flags",
];

export function buildPortfolioCsv(results: ExportRow[], __options: { generatedAt?: Date } = {}): string {
  const rows: Array<Array<string | number>> = [PORTFOLIO_HEADERS];
  for (const wallet of results) {
    for (const chain of wallet.chains) {
      const assets = [
        ...(chain.native ? [{ type: "native", asset: chain.native }] : []),
        ...chain.tokens.map((asset) => ({ type: "token", asset })),
      ];
      for (const { type, asset } of assets) {
        rows.push([
          wallet.address,
          wallet.label,
          chain.chainKey,
          chain.chainName,
          chain.vm,
          type,
          asset.symbol,
          asset.name,
          asset.contract,
          asset.balance,
          asset.priceEur ?? "",
          asset.valueEur ?? "",
          asset.flags?.join("|") ?? "",
        ]);
      }
    }
  }
  return stringifyCsv(rows);
}

/** A failed chain has no data: drop it instead of serializing its placeholder zero native as a balance. */
export function withoutFailedChains(results: ExportRow[]): ExportRow[] {
  return results.map((wallet) => ({ ...wallet, chains: wallet.chains.filter((chain) => !isFailedChain(chain)) }));
}

/** True when the rows about to be exported contain at least one failed chain (same scope as the file). */
export function hasFailedChains(results: ExportRow[]): boolean {
  return results.some((wallet) => wallet.chains.some((chain) => isFailedChain(chain)));
}

export function exportCSV(results: ExportRow[], __headers: HeaderKeys, options: { partial?: boolean } = {}) {
  const csv = buildPortfolioCsv(withoutFailedChains(results));
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = portfolioCsvFilename(new Date(), options.partial === true);
  a.click();
  URL.revokeObjectURL(url);
}

function stringifyCsv(rows: Array<Array<string | number>>): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string | number): string {
  const raw = neutralizeFormula(String(value));
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function neutralizeFormula(value: string): string {
  if (/^[=+@|]/.test(value)) return `'${value}`;
  if (/^-/.test(value) && !/^-\d+(\.\d*)?$/.test(value)) return `'${value}`;
  return value;
}
