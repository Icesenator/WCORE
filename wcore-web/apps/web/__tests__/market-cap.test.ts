import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  PAGE_SIZE,
  filterMarketCapRows,
  getMarketSnapshotStatus,
  paginateMarketCapRows,
  parseMarketCapResponse,
  totalMarketCap,
  type MarketCapRow,
} from "../app/cmc/market-cap";

const cryptoPageSource = readFileSync(new URL("../app/cmc/crypto/page.tsx", import.meta.url), "utf8");
const stockPageSource = readFileSync(new URL("../app/cmc/stocks/page.tsx", import.meta.url), "utf8");
const sidebarSource = readFileSync(new URL("../components/Sidebar.tsx", import.meta.url), "utf8");
const tableClientSource = readFileSync(new URL("../app/cmc/CmcTableClient.tsx", import.meta.url), "utf8");

function row(
  rank: number,
  symbol: string,
  name: string,
  marketCapEur: number | null = rank * 100,
  country?: string,
): MarketCapRow {
  return { rank, symbol, name, priceEur: null, marketCapEur, country };
}

describe("filterMarketCapRows", () => {
  const rows = [
    row(1, "BTC", "Bitcoin", 1_000),
    row(2, "NVDA", "NVIDIA Corporation", 500, "United States"),
    row(3, "SAP", "SAP SE", 250, "Germany"),
  ];

  test("searches symbol, name, and country case-insensitively", () => {
    assert.deepEqual(filterMarketCapRows(rows, "btc").map(({ symbol }) => symbol), ["BTC"]);
    assert.deepEqual(filterMarketCapRows(rows, "nViDiA").map(({ symbol }) => symbol), ["NVDA"]);
    assert.deepEqual(filterMarketCapRows(rows, "gErMaNy").map(({ symbol }) => symbol), ["SAP"]);
  });

  test("trims search text and returns all rows for a blank query", () => {
    assert.deepEqual(filterMarketCapRows(rows, "  united STATES  "), [rows[1]]);
    assert.deepEqual(filterMarketCapRows(rows, "  \t "), rows);
  });

  test("does not mutate the input", () => {
    const before = [...rows];

    const result = filterMarketCapRows(rows, "a");

    assert.deepEqual(rows, before);
    assert.notStrictEqual(result, rows);
  });
});

describe("totalMarketCap", () => {
  test("sums only finite, non-negative market caps", () => {
    const rows = [
      row(1, "VALID", "Valid", 1_000),
      row(2, "ZERO", "Zero", 0),
      row(3, "NULL", "Null", null),
      row(4, "NAN", "NaN", Number.NaN),
      row(5, "INF", "Infinity", Number.POSITIVE_INFINITY),
      row(6, "NEG", "Negative", -50),
      row(7, "VALID2", "Valid 2", 500),
    ];

    assert.equal(totalMarketCap(rows), 1_500);
  });
});

describe("paginateMarketCapRows", () => {
  const rows = Array.from({ length: 301 }, (_, index) =>
    row(index + 1, `S${index + 1}`, `Asset ${index + 1}`),
  );

  test("uses 100-row pages by default and calculates four pages for 301 rows", () => {
    assert.equal(PAGE_SIZE, 100);
    assert.deepEqual(paginateMarketCapRows(rows, 2), {
      rows: rows.slice(100, 200),
      page: 2,
      totalPages: 4,
    });
  });

  test("clamps page underflow and overflow", () => {
    assert.deepEqual(paginateMarketCapRows(rows, 0), {
      rows: rows.slice(0, 100),
      page: 1,
      totalPages: 4,
    });
    assert.deepEqual(paginateMarketCapRows(rows, 99), {
      rows: rows.slice(300),
      page: 4,
      totalPages: 4,
    });
  });

  test("returns page one of one for empty rows", () => {
    assert.deepEqual(paginateMarketCapRows([], 10), { rows: [], page: 1, totalPages: 1 });
  });

  test("supports a positive integer custom page size without mutating input", () => {
    const before = [...rows];
    const result = paginateMarketCapRows(rows, 2, 25);

    assert.deepEqual(result, { rows: rows.slice(25, 50), page: 2, totalPages: 13 });
    assert.deepEqual(rows, before);
  });

  test("rejects invalid page sizes", () => {
    for (const pageSize of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => paginateMarketCapRows(rows, 1, pageSize), RangeError);
    }
  });
});

describe("parseMarketCapResponse", () => {
  const validRow = {
    rank: 1,
    symbol: "BTC",
    name: "Bitcoin",
    priceEur: 50_000,
    marketCapEur: null,
    logoUrl: "https://example.com/btc.png",
    country: "Global",
  };

  test("accepts a complete valid snapshot", () => {
    const input = {
      ok: true,
      generatedAt: "2026-07-17T12:00:00.000Z",
      stale: false,
      rows: [validRow],
    };

    assert.deepEqual(parseMarketCapResponse(input), input);
  });

  test("rejects malformed response envelopes", () => {
    for (const input of [
      null,
      { ok: false, generatedAt: "2026-07-17T12:00:00.000Z", rows: [] },
      { ok: true, generatedAt: "not-a-date", rows: [] },
      { ok: true, generatedAt: "2026-07-17T12:00:00.000Z", stale: "yes", rows: [] },
      { ok: true, generatedAt: "2026-07-17T12:00:00.000Z", rows: {} },
    ]) {
      assert.throws(() => parseMarketCapResponse(input), /invalid market snapshot/i);
    }
  });

  test("rejects the snapshot when any row is malformed", () => {
    const invalidRows = [
      { ...validRow, rank: 0 },
      { ...validRow, rank: 1.5 },
      { ...validRow, symbol: " " },
      { ...validRow, name: "" },
      { ...validRow, priceEur: Number.NaN },
      { ...validRow, marketCapEur: Number.POSITIVE_INFINITY },
      { ...validRow, logoUrl: 42 },
      { ...validRow, country: false },
    ];

    for (const invalidRow of invalidRows) {
      assert.throws(
        () => parseMarketCapResponse({
          ok: true,
          generatedAt: "2026-07-17T12:00:00.000Z",
          rows: [validRow, invalidRow],
        }),
        /invalid market snapshot/i,
      );
    }
  });
});

describe("getMarketSnapshotStatus", () => {
  test("distinguishes loading, unavailable, and retained-data failures", () => {
    assert.equal(getMarketSnapshotStatus(null, true, null), "loading");
    assert.equal(getMarketSnapshotStatus(null, false, "network failed"), "unavailable");
    assert.equal(getMarketSnapshotStatus({ stale: false }, false, "refresh failed"), "refresh-failed");
  });

  test("reports stale and current snapshots only without a refresh error", () => {
    assert.equal(getMarketSnapshotStatus({ stale: true }, false, null), "stale");
    assert.equal(getMarketSnapshotStatus({ stale: false }, false, null), "current");
  });
});

describe("market cap public labels", () => {
  test("uses the approved crypto label and metadata", () => {
    assert.match(cryptoPageSource, /title: "Market Cap Crypto \| WCORE"/);
    assert.match(cryptoPageSource, /title="Market Cap Crypto"/);
    assert.match(sidebarSource, /label: "Market Cap Crypto"/);
  });

  test("uses the approved stock label and metadata", () => {
    assert.match(stockPageSource, /title: "Market Cap Stock \| WCORE"/);
    assert.match(stockPageSource, /title="Market Cap Stock"/);
    assert.match(sidebarSource, /label: "Market Cap Stock"/);
  });

  test("removes old user-facing CMC labels", () => {
    for (const source of [cryptoPageSource, stockPageSource, sidebarSource]) {
      assert.doesNotMatch(source, /CMC Crypto|CMC Stocks/);
    }
  });
});

describe("market cap logo fallback", () => {
  test("keeps initials visible when a contained logo image fails", () => {
    assert.match(tableClientSource, /const\s+initials\s*=[\s\S]*?\.slice\(0,\s*2\)[\s\S]*?\.toUpperCase\(\)/);
    assert.match(tableClientSource, /aria-hidden="true"[\s\S]{0,160}\{initials\}/);
    assert.match(tableClientSource, /alt=""/);
    assert.match(tableClientSource, /className=\{`[^`]*object-contain[^`]*`\}/);
    assert.match(tableClientSource, /loading="lazy"/);
    assert.match(tableClientSource, /decoding="async"/);
    assert.match(tableClientSource, /referrerPolicy="no-referrer"/);
    assert.match(tableClientSource, /row\.logoUrl\s*&&\s*!broken/);
    assert.match(tableClientSource, /onError=\{\(\)\s*=>\s*setBroken\(true\)\}/);
  });
});

describe("market cap mobile layout", () => {
  test("keeps summary cards compact before the small breakpoint", () => {
    assert.match(
      tableClientSource,
      /aria-label="Market snapshot summary"[^>]*className="[^"]*grid-cols-2[^"]*sm:grid-cols-3[^"]*"/,
    );
    assert.match(tableClientSource, /col-span-2\s+sm:col-span-1/);
  });

  test("uses 44px mobile targets for search, refresh, and pagination", () => {
    for (const control of [
      /type="search"[\s\S]{0,400}className="[^"]*h-11[^"]*"/,
      /aria-label="Refresh market cap rankings"[\s\S]{0,300}className="[^"]*h-11[^"]*"/,
      /aria-label="Go to previous rankings page"[\s\S]{0,300}className="[^"]*h-11[^"]*"/,
      /aria-label="Go to next rankings page"[\s\S]{0,300}className="[^"]*h-11[^"]*"/,
    ]) {
      assert.match(tableClientSource, control);
    }
  });
});
