import type { CryptoListingRow } from "../crypto/crypto-listing-service.js";
import type { StockSnapshotRow } from "../stocks/stock-service.js";

export function toCryptoMarketCapRow(row: CryptoListingRow) {
  const logoUrl = typeof row.id === "number" && Number.isInteger(row.id) && row.id > 0
    ? `https://s2.coinmarketcap.com/static/img/coins/64x64/${row.id}.png`
    : undefined;
  return {
    rank: row.rank,
    symbol: row.symbol,
    name: row.name,
    priceEur: row.priceEur,
    marketCapEur: row.marketCapEur,
    logoUrl,
  };
}

export function toStockMarketCapRow(row: StockSnapshotRow) {
  const ticker = encodeURIComponent(row.sourceTicker.trim());
  return {
    rank: row.rank,
    symbol: row.canonicalTicker,
    name: row.company,
    priceEur: row.priceEur,
    marketCapEur: row.marketCapEur,
    country: row.country || undefined,
    logoUrl: ticker
      ? `https://companiesmarketcap.com/img/company-logos/64/${ticker}.png`
      : undefined,
  };
}
