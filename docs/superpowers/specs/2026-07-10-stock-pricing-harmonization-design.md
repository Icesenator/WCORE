# Canonical Stock Pricing Harmonization Design

**Date:** 2026-07-10

## Objective

Keep CompaniesMarketCap as the source of the Top Market Cap stock universe while making WCORE the single producer of a reliable, traceable EUR stock price. Google Sheets becomes a snapshot consumer and no longer evaluates `GOOGLEFINANCE` or maintains its own FX table.

This design covers stocks, ETFs, ADRs and receipts represented by the existing Top Market Cap and `CEX - Bitpanda Stocks` flows. It does not change crypto, commodity, fiat or other CEX pricing.

## Current Problems

- `Google Finance` stores the Top Market Cap table below a ten-row FX table and relies on hundreds of volatile formulas.
- A transient failure of `GOOGLEFINANCE(ticker; "currency")` previously defaulted a valid local price to USD. For `KRX:000660`, that interpreted KRW as USD and inflated the EUR value by roughly three orders of magnitude.
- Stock mappings, aliases and receipt ratios are split across Apps Script, the WCORE API and the stock relay.
- `Action Rebalancing` and `CEX - Bitpanda Stocks` can derive values through different paths, making parity difficult to prove.
- Formula recalculation, upstream failures and temporary blank values can overwrite or display unreliable results without a clear stale state.

## Architecture

### WCORE ownership

WCORE exposes an authenticated Top Market Cap snapshot endpoint for Google Sheets and reuses the same canonical stock module behind the existing bounded CEX stock-pricing route. The module owns:

- fetching the CompaniesMarketCap CSV;
- parsing and validating the Top Market Cap universe;
- canonical ticker and exchange mapping;
- Yahoo/relay symbol mapping;
- stock, ETF, ADR and receipt aliases;
- native-currency price retrieval;
- canonical FX conversion;
- source comparison and sanity checks;
- last-known-good caching;
- final normalized EUR output.

Google Sheets sends no user-controlled upstream URL. Authentication uses `x-gsheet-token` and `GSHEET_API_TOKEN`, matching the existing GSheet-to-WCORE trust boundary.

The snapshot endpoint controls its fixed Top N universe. `GET /api/cex/prices?bucket=stocks` remains available for explicit Bitpanda stock symbols, including securities outside the Top N, but delegates to the same mappings, cascade and cache. Its existing 50-symbol request bound remains enforced.

### Google Sheets ownership

Apps Script owns only presentation and spreadsheet-specific behavior:

- request the WCORE snapshot;
- validate the response envelope before changing cells;
- preserve `Ignore` selections by canonical ticker and company name;
- write static values into `Google Finance`;
- rebuild `Action Rebalancing` from the same snapshot values;
- apply formatting, checkboxes and timestamps;
- retain the previous healthy table when the WCORE request fails or returns an invalid snapshot.

Apps Script does not independently fetch Yahoo, infer currencies or calculate stock FX after migration.

## Canonical Data Flow

```text
CompaniesMarketCap CSV
        |
        v
Universe parser and canonical ticker mapping
        |
        +-------------------------+
        |                         |
        v                         v
Yahoo via stock relay      CompaniesMarketCap USD price
primary local quote        validation and fallback
        |                         |
        +------------+------------+
                     v
              Canonical FX cascade
                     |
                     v
          Validation and last-good cache
                     |
                     v
        Authenticated WCORE stock snapshot
                     |
                     v
       Google Finance + Action Rebalancing
```

## Price Cascade

For each canonical security:

1. Use the Yahoo quote returned by the WCORE stock relay when it has a positive finite price and a recognized currency.
2. Convert the local quote with the canonical WCORE FX convention: `priceEur = priceNative * nativeToEurRate`.
3. Compare it with the CompaniesMarketCap USD price converted through the canonical USD-to-EUR rate.
4. If Yahoo is unavailable, use the validated CompaniesMarketCap EUR conversion.
5. If all fresh sources fail, serve the last-known-good EUR price and mark the row `stale: true`.
6. If there is no valid fresh or cached price, return `priceEur: null`. Never return zero, assume USD, or invent a fixed FX rate.

Yahoo remains primary because it supplies the exchange-native quote and currency. CompaniesMarketCap remains the independent fallback because it already defines the universe and supplies a USD-denominated price.

## Source Validation

All numeric inputs must be finite and positive. A fresh Yahoo and CompaniesMarketCap EUR price pair is considered consistent when its relative difference is at most 15%. The threshold accommodates market timing, ADR handling and source update delays while still rejecting unit and currency errors.

When the difference exceeds 15%:

- do not average the values;
- prefer neither source automatically;
- use a non-conflicting last-known-good price when available and mark the row stale with a drift reason;
- otherwise return no EUR price and include a structured drift error.

Known explicit transformations, such as ordinary-share versus receipt ratios, are applied before comparison. A transformed quote records the applied ratio in the response.

## Canonical Mapping

The WCORE stock module consolidates the existing useful mappings from both environments:

- CompaniesMarketCap/Yahoo suffix to canonical exchange ticker;
- canonical ticker to Yahoo relay ticker;
- Bitpanda aliases such as `HYXS`, `SSU`, `SMSN`, `BRKB`, `BROA`, `FB`, `GOOGL`, `RDSA`, `TSFA` and `TM`;
- Samsung receipt ratio and Toyota ordinary-share normalization;
- exchange currency metadata used only as validation when Yahoo omits currency.

Mappings are pure data with focused tests. The API and Apps Script must not maintain separate copies after migration. Apps Script receives the canonical and Bitpanda aliases it needs in the snapshot.

## Snapshot Contract

The snapshot endpoint returns an envelope similar to:

```json
{
  "ok": true,
  "generatedAt": "2026-07-10T12:00:00.000Z",
  "universeSource": "companiesmarketcap",
  "rows": [
    {
      "rank": 1,
      "company": "Example Corp",
      "country": "US",
      "sourceTicker": "EXAMPLE",
      "canonicalTicker": "NASDAQ:EXAMPLE",
      "yahooTicker": "EXAMPLE",
      "bitpandaAliases": ["EXAMPLE"],
      "priceNative": 100,
      "currency": "USD",
      "priceEur": 85,
      "marketCapUsd": 1000000000,
      "marketCapEur": 850000000,
      "supply": 10000000,
      "priceSource": "yahoo:relay",
      "fallbackSource": "companiesmarketcap",
      "appliedRatio": 1,
      "stale": false,
      "updatedAt": "2026-07-10T12:00:00.000Z",
      "errors": []
    }
  ],
  "stats": {
    "requested": 300,
    "pricedFresh": 295,
    "pricedStale": 4,
    "unpriced": 1
  }
}
```

The endpoint returns at most the configured Top Market Cap count. The server controls that bound; the caller cannot request an arbitrary fan-out size.

The bounded CEX stock route keeps its existing `{ prices: { SYMBOL: { priceEur, source } } }` response for compatibility. It becomes a thin adapter over the canonical stock module rather than a separate pricing implementation.

## Cache and Failure Semantics

WCORE stores successful per-security prices and the latest complete snapshot in the shared cache.

- Fresh per-security price and complete snapshot TTLs: 1 hour.
- Snapshot cache: latest successful snapshot plus generation metadata.
- A partial refresh may reuse per-security last-good prices and marks only those rows stale.
- A total upstream failure serves the previous complete snapshot as stale when available.
- Cache write failures do not invalidate a successfully built response.

Google Sheets uses a write-after-validate strategy. It clears or replaces no existing table until the complete response has passed schema and row-count checks. On request, parsing or validation failure, the existing sheet remains untouched and the refresh status records the error.

## Sheet Migration

The `Google Finance` layout changes atomically:

- row 1 contains table headers;
- rows 2 through 301 contain the Top 300 values;
- the former FX table in rows 1 through 10 is removed;
- all `GOOGLEFINANCE`, FX lookup and stock conversion formulas are removed;
- price and market-cap columns contain static numeric EUR values from WCORE;
- `Ignore` remains a checkbox column and is restored after each refresh;
- refresh timestamp and source/stale diagnostics remain available in dedicated columns;
- `Action Rebalancing` references or receives the same `priceEur`, never an independent formula price.

All constants and range references currently based on `FIRST_ROW: 12` must migrate together. The update must not leave a mixed old/new layout.

## Security and Load Bounds

- Require `x-gsheet-token` for the snapshot endpoint.
- Reject requests when `GSHEET_API_TOKEN` is unset.
- The endpoint chooses the fixed Top N bound; no arbitrary symbols or URLs are accepted.
- The CEX stock adapter accepts at most 50 validated symbols and no upstream URLs.
- Yahoo work is sent to the relay in bounded batches.
- FX is fetched once per snapshot, not once per row.
- Source requests use explicit timeouts.
- Errors expose source names and categories but no tokens or upstream credentials.

## Observability

Each row records source, freshness and structured errors. Aggregate stats expose fresh, stale and missing counts. Logs include request duration and source counts without logging the shared token.

The Apps Script refresh status includes snapshot time and counts so a stale-but-usable table is distinguishable from a fresh table.

## Testing

### WCORE

- CompaniesMarketCap parsing and malformed row rejection.
- Consolidated ticker, alias and ratio mappings.
- Local-currency Yahoo conversion for KRW, GBp, CHF, JPY, USD and EUR.
- CompaniesMarketCap USD fallback conversion.
- 15% drift boundary and fail-closed behavior.
- Last-known-good row and full-snapshot fallback.
- Authentication and fixed Top N bounds.
- Compatibility and 50-symbol bounds for the CEX stock adapter.
- One bounded relay batch flow rather than per-symbol provider fan-out.
- Regression for `HYXS`/`KRX:000660` proving KRW cannot be interpreted as USD.

### Google Sheets

- Snapshot validation before writes.
- Preservation of the previous table on API failure.
- Preservation of `Ignore` by ticker and company.
- Header row 1 and first data row 2.
- Absence of `GOOGLEFINANCE` and the former FX table.
- `Action Rebalancing` receives the exact snapshot `priceEur`.
- Samsung and Toyota transformations remain correct.

## Migration Sequence

1. Inventory and compare all current stock mappings, sources, ratios and fallbacks in GSheet, WCORE API and relay.
2. Build the canonical WCORE stock module and tests from the best existing rules.
3. Add the authenticated snapshot endpoint and route the existing CEX stock adapter through the same module and cache.
4. Add the new Apps Script snapshot consumer behind a temporary feature flag.
5. Compare old and new output without changing the visible table.
6. Require acceptable coverage and investigate every material price drift.
7. Switch the sheet atomically to the row-1 static-value layout.
8. Remove the old formulas, FX rows and duplicated Apps Script pricing mappings.

## Acceptance Criteria

- CompaniesMarketCap remains the Top Market Cap universe source.
- WCORE is the only producer of final stock `priceEur` values.
- Top Market Cap rows and explicit Bitpanda stock symbols use the same canonical WCORE module.
- The Top 300 table contains no `GOOGLEFINANCE` formulas and no FX table.
- `KRX:000660` and other local-currency stocks cannot be interpreted as USD.
- GSheet, `Action Rebalancing` and `CEX - Bitpanda Stocks` use the same canonical EUR stock price semantics.
- A transient source or API failure never clears healthy existing sheet values.
- Every displayed price has a source and freshness state.
- Focused tests, typechecks, static Apps Script validation and diff hygiene pass before deployment.

## Out of Scope

- Crypto, fiat and commodity pricing changes.
- CEX account credential or synchronization redesign.
- General RPC, chain or token pricing harmonization.
- UI changes outside the affected spreadsheet tabs.
- Deployment or commit without an explicit later instruction.
