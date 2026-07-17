# Market Cap Pages Design

**Status:** Approved on 2026-07-17.

## Goal

Replace the user-facing `CMC Crypto` and `CMC Stocks` naming with `Market Cap Crypto` and `Market Cap Stock`, then turn both routes into polished WCORE market rankings. CoinMarketCap informs the crypto density and identity treatment. CompaniesMarketCap informs the stock ranking, country context, and restrained tabular presentation.

## Scope

- Keep `/cmc/crypto`, `/cmc/stocks`, and `/api/cmc/*` stable.
- Rename sidebar labels, page metadata, headings, and supporting copy.
- Enrich API rows with exact logo URLs. Add country context for stocks.
- Add a summary strip for asset count, aggregate market cap, and snapshot freshness.
- Combine logo, name, and ticker into one strong identity column.
- Add client-side search and 100-row pagination.
- Make controls and table behavior usable on narrow screens.
- Preserve the WCORE dark palette, lime accent, and full-width data-page layout.

## Data Contract

The shared listing response remains backward compatible and adds optional fields:

```ts
interface MarketCapRow {
  rank: number;
  symbol: string;
  name: string;
  priceEur: number | null;
  marketCapEur: number | null;
  logoUrl?: string;
  country?: string;
}

interface MarketCapResponse {
  ok: true;
  generatedAt: string;
  stale?: boolean;
  rows: MarketCapRow[];
}
```

Crypto keeps the CoinMarketCap numeric asset ID during normalization and derives `https://s2.coinmarketcap.com/static/img/coins/64x64/{id}.png`. Stocks derive the CompaniesMarketCap logo from the source ticker and expose the parsed country. Invalid optional branding data must not invalidate an otherwise valid listing row.

## Interface

Each page contains:

1. A compact market header with title, source-oriented description, search, and refresh.
2. Three summary cards: ranked assets, aggregate market cap, and snapshot status/time.
3. A bordered ranking surface with a sticky header and subdued row hover.
4. A primary asset/company cell with logo fallback, name, and ticker.
5. Right-aligned price and market cap columns; stocks also show country.
6. Pagination controls below the table with 100 rows per page and search resetting to page one.

On mobile, controls stack, summary cards remain a compact grid, country is hidden first, and the identity/price/market-cap columns remain readable through a minimum table width and horizontal overflow. Refresh keeps existing rows visible while loading.

## Error And Empty States

- Initial load uses table skeleton rows rather than a blank page.
- Refresh errors keep the previous snapshot visible and show a compact error banner.
- An empty search result displays a dedicated row.
- Broken logos fall back to the existing token/company initial treatment.
- Snapshot age and stale state remain visible so last-good data is not presented as fresh.

## Testing

- API service tests cover crypto ID/logo and stock country/logo propagation.
- Route or mapping tests cover the optional enriched fields without changing existing values.
- Web tests cover renamed labels, pagination/search behavior where practical, and logo fallback markup.
- Run API, web, shared, lint, typecheck, and production build checks for touched packages.

## Non-Goals

- No route migration or redirects.
- No watchlist, authentication, sparklines, price-change columns, category filters, or new charting dependency.
- No copying of CoinMarketCap or CompaniesMarketCap visual identity.
- No changes to the separate `/wallet` redesign inspired by Jumper and DeBank.
