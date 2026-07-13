# Portefeuille Action Autonomous Sheet Design

**Date:** 2026-07-11

## Objective

Create a new `Portefeuille Action` sheet that combines the useful stock-universe data currently held in `Google Finance` with the strategy and rebalancing behavior currently held in `Action Rebalancing`.

The new sheet is introduced in parallel. During phase 1 it must not modify, replace, or become a dependency of `Google Finance` or `Action Rebalancing`. After parity is proven, phase 2 will redirect consumers and remove the old dependencies.

`Portefeuille Action` is autonomous from:

- `Google Finance`;
- `Action Rebalancing`;
- `CEX - Bitpanda Stocks`.

It may continue to read shared strategy parameters from `Strat`.

## Scope

This design covers:

- the CompaniesMarketCap stock universe;
- stocks, ETFs, ADRs and receipts held in the owner's Bitpanda account;
- canonical EUR stock prices;
- the current Action Rebalancing calculations and signals;
- creation and refresh of the new spreadsheet tab;
- shadow comparison with the existing stock tabs.

It does not alter crypto, commodity, fiat or other CEX portfolio behavior.

## Ownership

### WCORE

WCORE owns all external stock data and produces one validated portfolio snapshot:

- CompaniesMarketCap ranking;
- Bitpanda stock positions for the configured owner;
- canonical ticker, exchange and alias mappings;
- Yahoo native quotes through the stock relay;
- canonical FX conversion;
- CompaniesMarketCap fallback prices;
- source drift checks;
- fresh and last-known-good caches;
- final EUR prices and held values;
- dynamic universe size.

### Apps Script

Apps Script owns spreadsheet presentation and strategy formulas:

- create and format `Portefeuille Action`;
- fetch and validate the WCORE snapshot;
- write static source data;
- preserve user-controlled include/exclude cells;
- install formulas equivalent to the current Action Rebalancing logic;
- maintain the refresh checkbox and status;
- compare the new output with the old tabs;
- preserve the previous healthy content when refresh fails.

Apps Script does not independently fetch CompaniesMarketCap, Yahoo, FX or Bitpanda for the new sheet.

## Owner Binding

The GSheet integration token is associated server-side with:

```text
GSHEET_OWNER_ADDRESS=<normalized owner wallet address>
```

WCORE resolves the authenticated user by this address, then selects that user's Bitpanda CEX account. The spreadsheet never sends or stores a Bitpanda API key or internal account ID.

If the owner or Bitpanda account cannot be resolved, the endpoint fails closed and returns no other user's data.

## Dynamic Universe

The universe starts from CompaniesMarketCap and always contains every current Bitpanda stock position.

For positions with a CompaniesMarketCap rank:

```text
dynamicLimit = max(300, ceil(maxHeldRank * 1.20))
```

This provides a 20% rank margin after the lowest-ranked held position.

Rules:

- parse a bounded full CompaniesMarketCap universe, not only the first 300 rows;
- cap the automatically expanded ranked universe at 5,000 rows for operational safety;
- append every held position beyond that cap;
- append every held position absent from CompaniesMarketCap;
- never remove a held position because it is unranked or outside the bound;
- unranked appended rows have `rank: null` and are excluded from rank-based target calculations unless explicitly included by strategy rules.

Yahoo and FX calls are chunked into bounded batches. No relay request exceeds its existing server limit.

## Holdings Refresh

The portfolio endpoint uses the configured Bitpanda account.

1. Attempt a live read-only Bitpanda synchronization.
2. If the live synchronization succeeds, use the fresh stock positions and persist them through the existing CEX account storage flow.
3. If it fails transiently, use the latest healthy stored holdings and mark the holdings snapshot stale.
4. If neither fresh nor stored holdings exist, fail without replacing the sheet.

A successful empty Bitpanda stock response is authoritative and represents no current stock positions.

## Canonical Pricing

Each security uses the canonical WCORE cascade:

1. Yahoo native quote via the relay.
2. Canonical native-currency-to-EUR conversion.
3. Comparison with CompaniesMarketCap USD price converted to EUR.
4. CompaniesMarketCap fallback when Yahoo is unavailable.
5. Last-known-good WCORE price when fresh sources fail.
6. `priceEur: null` when no valid fresh or cached value exists.

Unknown or missing currency never defaults to USD. Conflicting sources are not averaged. ADR and receipt ratios are applied exactly once and are exposed in the response.

## API Contract

Add an authenticated endpoint:

```text
GET /api/gsheet/stocks/portfolio
x-gsheet-token: <GSHEET_API_TOKEN>
```

The endpoint accepts no owner, account, upstream URL or arbitrary symbol parameters.

Response shape:

```json
{
  "ok": true,
  "generatedAt": "2026-07-11T12:00:00.000Z",
  "ownerAddress": "0x...",
  "dynamicLimit": 360,
  "holdingsStale": false,
  "rows": [
    {
      "canonicalTicker": "KRX:000660",
      "sourceTicker": "000660.KS",
      "yahooTicker": "000660.KS",
      "bitpandaSymbol": "HYXS",
      "bitpandaAliases": ["HYXS"],
      "rank": 2,
      "company": "SK Hynix",
      "country": "South Korea",
      "priceNative": 2180000,
      "currency": "KRW",
      "priceEur": 1270,
      "marketCapUsd": 1085569484906,
      "marketCapEur": 950000000000,
      "supply": 709856589.31,
      "heldQuantity": 0.01625873,
      "heldValueEur": 20.65,
      "unitsPerReceipt": 1,
      "priceSource": "yahoo:relay",
      "fallbackSource": "companiesmarketcap",
      "priceStale": false,
      "holdingStale": false,
      "updatedAt": "2026-07-11T12:00:00.000Z",
      "errors": []
    }
  ],
  "stats": {
    "ranked": 360,
    "held": 18,
    "heldOutsideRankedUniverse": 1,
    "pricedFresh": 355,
    "pricedStale": 5,
    "unpriced": 1
  }
}
```

The endpoint validates row uniqueness, rank ordering, held-position coverage, stats consistency and all numeric fields before returning or caching a snapshot.

## Sheet Layout

`Portefeuille Action` follows the operational pattern of `Portefeuille Crypto V2`:

- row 1: controls and aggregate indicators;
- row 2: column headers;
- rows 3 onward: EUR cash row followed by the dynamic stock universe;
- first column frozen;
- first two rows frozen;
- refresh checkbox and visible status;
- conditional formatting for rank, target, gap and action signals.

### Visible strategy area

Columns `A:R` retain the current Action Rebalancing semantics to minimize migration risk:

| Column | Meaning |
|---|---|
| A | Stock / canonical ticker |
| B | Active rank |
| C | Market cap EUR |
| D | Price EUR |
| E | Target total reference |
| F | Held value EUR |
| G | Include |
| H | Stable allocation input |
| I | Square-root market-cap dominance |
| J | Theoretical target |
| K | Stable component |
| L | Target allocation |
| M | Actual allocation |
| N | Gap EUR |
| O | Primary action ticker |
| P | Action direction |
| Q | Secondary action ticker |
| R | Company name |

The exact existing Action Rebalancing formulas and row-1 controls are migrated with references rewritten to local technical columns and `Strat` only.

### Technical source area

Columns `AG:AT` contain WCORE source data and diagnostics. This leaves `S:AF` available for the existing row-1 controls and status cells. The technical columns may be hidden after validation:

| Column | Meaning |
|---|---|
| AG | Source ticker |
| AH | Yahoo ticker |
| AI | Bitpanda symbol |
| AJ | Bitpanda aliases |
| AK | Raw CMC rank |
| AL | Price native |
| AM | Currency |
| AN | Price source |
| AO | Market cap USD |
| AP | Supply |
| AQ | Country |
| AR | Held quantity |
| AS | Price stale |
| AT | Updated at / errors summary |

The visible area never references the old stock sheets.

## User-Controlled State

The initial sheet preserves the behavior of the old stock flow:

- include/exclude controls;
- any explicit ignored security;
- strategy parameters from `Strat`;
- EUR cash row behavior;
- continuous active rank after exclusions.

User state is keyed by canonical ticker, with normalized company name as fallback. Refreshes do not overwrite preserved controls.

## Atomic Refresh

Refresh flow:

1. Fetch snapshot without changing cells.
2. Validate the complete response.
3. Read and preserve user-controlled cells.
4. Build the full value and formula matrices in memory.
5. Write the complete managed ranges in one Sheets API batch.
6. Apply formatting and validation metadata.
7. Update refresh status only after success.

On HTTP, auth, parsing or validation failure, the existing healthy sheet remains unchanged. Only the status cell records the error.

## Phase 1: Parallel Creation

Phase 1 creates `Portefeuille Action` without changing the old tabs or their consumers.

- Do not delete or clear `Google Finance`.
- Do not delete or clear `Action Rebalancing`.
- Do not redirect formulas in other sheets.
- Do not change the existing `Action Rebalancing!Z1` refresh flow.
- Use a separate refresh checkbox and status in `Portefeuille Action`.
- Keep the new endpoint and sheet behind an explicit feature/setup function until comparison passes.

## Shadow Comparison

After each successful refresh, compare the new sheet with the old outputs by canonical ticker:

- price EUR;
- held quantity;
- held value EUR;
- market cap EUR;
- active rank;
- target allocation;
- actual allocation;
- gap EUR;
- buy/sell signal;
- included/excluded state.

The diagnostic reports missing rows and relative/absolute differences. It does not modify either old sheet.

Material mismatches must be investigated. They are not silently tolerated or overwritten.

## Phase 2: Dependency Migration

Phase 2 begins only after phase-1 parity is accepted.

1. Inventory every formula and script reading `Google Finance` or `Action Rebalancing`.
2. Redirect one consumer group at a time to `Portefeuille Action`.
3. Verify each redirect with fresh output comparisons.
4. Move remaining refresh and strategy ownership into `Portefeuille Action`.
5. Remove old formulas and dependencies only when no consumer remains.
6. Delete the old tabs only after an explicit final approval.

Phase 2 is not part of the initial creation task.

## Tests

### WCORE

- owner address lookup and fail-closed account selection;
- Bitpanda live success, authoritative empty and stale stored fallback;
- no cross-user account access;
- dynamic limit minimum 300 and 20% margin;
- 5,000 ranked-row safety cap;
- held rows beyond the cap and unranked rows are always appended;
- all held positions appear exactly once;
- chunked quote and FX requests;
- canonical stock pricing and ratio application;
- snapshot validation and cache preservation;
- endpoint token authentication and parameter rejection.

### Apps Script

- setup creates `Portefeuille Action` only when absent;
- old sheets remain unchanged;
- exact row-1 controls and row-2 headers;
- first two rows and column A frozen;
- snapshot validation before writes;
- no old-sheet references in formulas;
- `Strat` remains the only strategy-sheet dependency;
- include/exclude state preservation;
- EUR row and continuous active rank;
- previous content preserved on failures;
- shadow comparison is read-only.

## Acceptance Criteria

- `Portefeuille Action` exists and refreshes independently of the three old stock data tabs.
- Every Bitpanda stock position is present exactly once.
- The ranked universe includes a 20% margin after the lowest-ranked held position, with the safety rules above.
- WCORE is the only external data and EUR pricing producer.
- Current Action Rebalancing calculations and signals are reproduced.
- `Strat` is the only permitted strategy-sheet dependency.
- Old tabs and their consumers remain unchanged during phase 1.
- A failed refresh never erases healthy existing output.
- Shadow comparison exposes all material differences before phase 2.
- No deployment, deletion or commit occurs without a later explicit instruction.

## Out of Scope

- Removing `Google Finance` or `Action Rebalancing` in phase 1.
- Redirecting unrelated spreadsheet consumers in phase 1.
- Crypto portfolio restructuring.
- Supporting a second stock broker in the initial version.
- Editing trading strategy rules beyond reproducing current behavior.
