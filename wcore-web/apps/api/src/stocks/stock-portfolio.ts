import type { GsheetStockPortfolioSnapshot, GsheetStockPortfolioRow } from "../plugins/gsheet.js";
import { getBitpandaSecurity } from "./mappings.js";
import type { ResolvedStockPrice } from "./stock-pricing.js";
import type { StockSnapshotRow } from "./stock-service.js";

export interface StockPortfolioHoldingInput {
  symbol: string;
  balance: number;
  updatedAt?: string | Date | null;
}

export interface BuildGsheetStockPortfolioSnapshotInput {
  generatedAt: string;
  ownerAddress: string;
  rankedRows: StockSnapshotRow[];
  holdings: StockPortfolioHoldingInput[];
  holdingsStale: boolean;
  heldPrices?: Record<string, ResolvedStockPrice>;
}

interface NormalizedHolding extends StockPortfolioHoldingInput {
  symbol: string;
  canonicalTicker: string;
  unitsPerReceipt: number;
  aliases: string[];
}

const RANK_MARGIN = 1.2;
const MIN_DYNAMIC_LIMIT = 300;
const RANKED_SAFETY_CAP = 300;
const RANKED_HOLDING_ALIASES: Readonly<Record<string, readonly string[]>> = {
  NVO: ["NOVO", "NOVO-B"],
  TSM: ["TSFA", "TPE:2330", "2330.TW"],
};

export function buildGsheetStockPortfolioSnapshot(input: BuildGsheetStockPortfolioSnapshotInput): GsheetStockPortfolioSnapshot {
  const holdings = normalizeHoldings(input.holdings);
  const holdingsByCanonical = new Map<string, NormalizedHolding>();
  for (const holding of holdings) holdingsByCanonical.set(holding.canonicalTicker, holding);
  const holdingsBySymbol = new Map(holdings.map((holding) => [holding.symbol, holding]));

  const maxHeldRank = input.rankedRows.reduce((max, row) => (
    holdingForRankedRow(row, holdingsByCanonical, holdingsBySymbol) ? Math.max(max, row.rank) : max
  ), 0);
  const dynamicLimit = Math.max(MIN_DYNAMIC_LIMIT, maxHeldRank > 0 ? Math.ceil(maxHeldRank * RANK_MARGIN) : MIN_DYNAMIC_LIMIT);
  const rankedLimit = Math.min(dynamicLimit, RANKED_SAFETY_CAP, input.rankedRows.length);
  const includedCanonicals = new Set<string>();
  const includedHoldingSymbols = new Set<string>();
  const rows: GsheetStockPortfolioRow[] = [];

  for (const ranked of input.rankedRows.slice(0, rankedLimit)) {
    includedCanonicals.add(ranked.canonicalTicker);
    const holding = holdingForRankedRow(ranked, holdingsByCanonical, holdingsBySymbol);
    if (holding) includedHoldingSymbols.add(holding.symbol);
    rows.push(rowFromRanked(ranked, holding, input.holdingsStale));
  }

  for (const holding of holdings) {
    if (includedCanonicals.has(holding.canonicalTicker) || includedHoldingSymbols.has(holding.symbol)) continue;
    rows.push(rowFromUnrankedHolding(holding, input.heldPrices?.[holding.symbol], input.holdingsStale, input.generatedAt));
  }

  return {
    ok: true,
    generatedAt: input.generatedAt,
    ownerAddress: input.ownerAddress,
    dynamicLimit,
    holdingsStale: input.holdingsStale,
    rows,
    stats: {
      ranked: Math.min(dynamicLimit, input.rankedRows.length),
      held: holdings.length,
      heldOutsideRankedUniverse: rows.filter((row) => row.heldQuantity > 0 && row.rank === null).length,
      pricedFresh: rows.filter((row) => row.priceEur !== null && !row.priceStale).length,
      pricedStale: rows.filter((row) => row.priceEur !== null && row.priceStale).length,
      unpriced: rows.filter((row) => row.priceEur === null).length,
    },
  };
}

function holdingForRankedRow(
  row: StockSnapshotRow,
  holdingsByCanonical: Map<string, NormalizedHolding>,
  holdingsBySymbol: Map<string, NormalizedHolding>,
): NormalizedHolding | null {
  const byCanonical = holdingsByCanonical.get(row.canonicalTicker);
  if (byCanonical) return byCanonical;
  const rankedSymbols = [row.sourceTicker, row.canonicalTicker, ...(RANKED_HOLDING_ALIASES[row.canonicalTicker] ?? [])];
  for (const symbol of rankedSymbols) {
    const byRankedSymbol = holdingsBySymbol.get(String(symbol ?? "").toUpperCase());
    if (byRankedSymbol) return byRankedSymbol;
  }
  for (const alias of row.bitpandaAliases) {
    const byAlias = holdingsBySymbol.get(alias.toUpperCase());
    if (byAlias) return byAlias;
  }
  return null;
}

function normalizeHoldings(holdings: StockPortfolioHoldingInput[]): NormalizedHolding[] {
  const byCanonical = new Map<string, NormalizedHolding>();
  for (const raw of holdings) {
    const symbol = String(raw.symbol ?? "").trim().toUpperCase();
    const balance = Number(raw.balance);
    if (!symbol || !Number.isFinite(balance) || balance <= 0) continue;
    const mapping = getBitpandaSecurity(symbol);
    const existing = byCanonical.get(mapping.canonicalTicker);
    if (existing) {
      existing.balance += balance;
      if (!existing.aliases.includes(symbol)) existing.aliases.push(symbol);
      continue;
    }
    byCanonical.set(mapping.canonicalTicker, {
      symbol,
      balance,
      updatedAt: raw.updatedAt,
      canonicalTicker: mapping.canonicalTicker,
      unitsPerReceipt: mapping.unitsPerReceipt ?? 1,
      aliases: mapping.bitpandaAliases.length ? mapping.bitpandaAliases : [symbol],
    });
  }
  return [...byCanonical.values()];
}

function rowFromRanked(row: StockSnapshotRow, holding: NormalizedHolding | null, holdingStale: boolean): GsheetStockPortfolioRow {
  const unitsPerReceipt = holding?.unitsPerReceipt ?? 1;
  const heldQuantity = holding?.balance ?? 0;
  const effectivePriceEur = row.priceEur === null ? null : row.priceEur * unitsPerReceipt;
  return {
    canonicalTicker: row.canonicalTicker,
    sourceTicker: row.sourceTicker,
    yahooTicker: row.yahooTicker,
    bitpandaSymbol: holding?.symbol ?? null,
    bitpandaAliases: holding?.aliases ?? [...row.bitpandaAliases],
    rank: row.rank,
    company: row.company,
    country: row.country,
    priceNative: row.priceNative,
    currency: row.currency,
    priceEur: effectivePriceEur,
    marketCapUsd: row.marketCapUsd,
    marketCapEur: row.marketCapEur,
    supply: row.supply,
    heldQuantity,
    heldValueEur: effectivePriceEur === null ? null : heldQuantity * effectivePriceEur,
    unitsPerReceipt,
    priceSource: row.priceSource,
    fallbackSource: row.fallbackSource,
    priceStale: row.stale,
    holdingStale,
    updatedAt: row.updatedAt,
    errors: row.errors.map((error) => ({ ...error })),
  };
}

function rowFromUnrankedHolding(
  holding: NormalizedHolding,
  price: ResolvedStockPrice | undefined,
  holdingStale: boolean,
  generatedAt: string,
): GsheetStockPortfolioRow {
  return {
    canonicalTicker: holding.canonicalTicker,
    sourceTicker: null,
    yahooTicker: null,
    bitpandaSymbol: holding.symbol,
    bitpandaAliases: [...holding.aliases],
    rank: null,
    company: holding.canonicalTicker,
    country: null,
    priceNative: price?.priceNative ?? null,
    currency: price?.currency ?? null,
    priceEur: price?.priceEur ?? null,
    marketCapUsd: null,
    marketCapEur: null,
    supply: null,
    heldQuantity: holding.balance,
    heldValueEur: price?.priceEur == null ? null : holding.balance * price.priceEur,
    unitsPerReceipt: holding.unitsPerReceipt,
    priceSource: price?.priceSource ?? null,
    fallbackSource: price?.fallbackSource ?? null,
    priceStale: price?.stale ?? false,
    holdingStale,
    updatedAt: price?.updatedAt ?? generatedAt,
    errors: price?.errors.map((error) => ({ ...error })) ?? [{ code: "price_unavailable", message: "No valid stock price is available" }],
  };
}
