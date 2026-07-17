export interface MarketCapRow {
  rank: number;
  symbol: string;
  name: string;
  priceEur: number | null;
  marketCapEur: number | null;
  logoUrl?: string;
  country?: string;
}

export interface MarketCapResponse {
  ok: true;
  generatedAt: string;
  stale?: boolean;
  rows: MarketCapRow[];
}

export type MarketKind = "crypto" | "stock";

export type MarketSnapshotStatus = "loading" | "unavailable" | "refresh-failed" | "stale" | "current";

export const PAGE_SIZE = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isMarketCapRow(value: unknown): value is MarketCapRow {
  if (!isRecord(value)) return false;
  return typeof value.rank === "number"
    && Number.isInteger(value.rank)
    && value.rank > 0
    && typeof value.symbol === "string"
    && value.symbol.trim().length > 0
    && typeof value.name === "string"
    && value.name.trim().length > 0
    && isNullableFiniteNumber(value.priceEur)
    && isNullableFiniteNumber(value.marketCapEur)
    && (!("logoUrl" in value) || typeof value.logoUrl === "string")
    && (!("country" in value) || typeof value.country === "string");
}

export function parseMarketCapResponse(value: unknown): MarketCapResponse {
  if (
    !isRecord(value)
    || value.ok !== true
    || typeof value.generatedAt !== "string"
    || value.generatedAt.trim().length === 0
    || !Number.isFinite(Date.parse(value.generatedAt))
    || ("stale" in value && typeof value.stale !== "boolean")
    || !Array.isArray(value.rows)
    || !value.rows.every(isMarketCapRow)
  ) {
    throw new TypeError("Invalid market snapshot response");
  }
  return value as unknown as MarketCapResponse;
}

export function getMarketSnapshotStatus(
  snapshot: Pick<MarketCapResponse, "stale"> | null,
  loading: boolean,
  error: string | null,
): MarketSnapshotStatus {
  if (!snapshot) return loading ? "loading" : "unavailable";
  if (error) return "refresh-failed";
  if (snapshot.stale) return "stale";
  return "current";
}

export function filterMarketCapRows(rows: MarketCapRow[], search: string): MarketCapRow[] {
  const query = search.trim().toLowerCase();
  if (!query) return rows.slice();

  return rows.filter((row) =>
    [row.symbol, row.name, row.country].some((value) => value?.toLowerCase().includes(query)),
  );
}

export function totalMarketCap(rows: MarketCapRow[]): number {
  return rows.reduce((total, row) => {
    const value = row.marketCapEur;
    return value !== null && Number.isFinite(value) && value >= 0 ? total + value : total;
  }, 0);
}

export function paginateMarketCapRows(
  rows: MarketCapRow[],
  requestedPage: number,
  pageSize = PAGE_SIZE,
): { rows: MarketCapRow[]; page: number; totalPages: number } {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new RangeError("pageSize must be a positive integer");
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const normalizedPage = Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1;
  const page = Math.min(totalPages, Math.max(1, normalizedPage));
  const start = (page - 1) * pageSize;

  return { rows: rows.slice(start, start + pageSize), page, totalPages };
}
