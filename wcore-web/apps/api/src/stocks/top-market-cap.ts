import { mapTopMarketCapTicker } from "./mappings.js";

export interface TopMarketCapSourceRow {
  rank: number;
  company: string;
  sourceTicker: string;
  marketCapUsd: number;
  priceUsd: number;
  country: string;
}

interface ColumnIndexes {
  rank: number;
  company: number;
  sourceTicker: number;
  marketCapUsd: number;
  priceUsd: number;
  country: number;
}

interface HeaderResolution {
  columns: ColumnIndexes | null;
  recognizedCount: number;
}

const POSITIONAL_COLUMNS: ColumnIndexes = {
  rank: 0,
  company: 1,
  sourceTicker: 2,
  marketCapUsd: 3,
  priceUsd: 4,
  country: 5,
};

const HEADER_NAMES: Record<keyof ColumnIndexes, ReadonlySet<string>> = {
  rank: new Set(["rank", "ranking", "position"]),
  company: new Set(["name", "company", "companyname"]),
  sourceTicker: new Set(["symbol", "ticker"]),
  marketCapUsd: new Set(["marketcap", "marketcapusd", "marketcapitalization", "marketcapitalizationusd", "cap"]),
  priceUsd: new Set(["price", "priceusd", "shareprice", "sharepriceusd"]),
  country: new Set(["country", "location"]),
};

export function parseTopMarketCapCsv(csv: string, requestedLimit = 300): TopMarketCapSourceRow[] {
  const records = parseCsv(String(csv ?? ""));
  if (records.length === 0) return [];

  const firstRecord = records[0]!;
  const header = resolveHeader(firstRecord);
  if (header.columns === null && header.recognizedCount > 0) return [];
  const firstRank = parsePositiveNumber(firstRecord[POSITIONAL_COLUMNS.rank]);
  const hasHeader = header.columns !== null || firstRank === null;
  const columns = header.columns ?? POSITIONAL_COLUMNS;
  const limit = clampLimit(requestedLimit);
  const output: TopMarketCapSourceRow[] = [];
  const seen = new Set<string>();

  for (let index = hasHeader ? 1 : 0; index < records.length && output.length < limit; index++) {
    const fields = records[index]!;
    const rank = parsePositiveNumber(fields[columns.rank]);
    const marketCapUsd = parsePositiveNumber(fields[columns.marketCapUsd]);
    const priceUsd = parsePositiveNumber(fields[columns.priceUsd]);
    const company = readField(fields, columns.company);
    const sourceTicker = readField(fields, columns.sourceTicker).toUpperCase();
    const country = readField(fields, columns.country);

    if (rank === null || marketCapUsd === null || priceUsd === null) continue;
    if (!Number.isInteger(rank) || !company || !sourceTicker || !country) continue;

    const canonicalTicker = mapTopMarketCapTicker(sourceTicker).canonicalTicker;
    if (!canonicalTicker || seen.has(canonicalTicker)) continue;
    seen.add(canonicalTicker);
    output.push({ rank, company, sourceTicker, marketCapUsd, priceUsd, country });
  }

  return output;
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return 300;
  return Math.min(5_000, Math.max(1, Math.trunc(value)));
}

function readField(fields: string[], index: number): string {
  return String(fields[index] ?? "").trim();
}

function parsePositiveNumber(value: string | undefined): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveHeader(header: string[]): HeaderResolution {
  const normalized = header.map(normalizeHeader);
  const result = {} as ColumnIndexes;
  let recognizedCount = 0;

  for (const key of Object.keys(HEADER_NAMES) as Array<keyof ColumnIndexes>) {
    const index = normalized.findIndex((name) => HEADER_NAMES[key].has(name));
    if (index < 0) continue;
    result[key] = index;
    recognizedCount++;
  }
  return {
    columns: recognizedCount === Object.keys(HEADER_NAMES).length ? result : null,
    recognizedCount,
  };
}

function normalizeHeader(value: string): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
      if (character === "\r" && input[index + 1] === "\n") index++;
    } else {
      field += character;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}
