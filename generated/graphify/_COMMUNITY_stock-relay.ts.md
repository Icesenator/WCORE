---
type: community
cohesion: 0.23
members: 14
---

# stock-relay.ts

**Cohesion:** 0.23 - loosely connected
**Members:** 14 nodes

## Members
- [[.constructor()_7]] - code - web-api/src/stocks/stock-service.ts
- [[STOCK_FX_CURRENCIES]] - code - web-api/src/cex/stock-relay.ts
- [[STOCK_QUOTE_CURRENCIES]] - code - web-api/src/cex/stock-relay.ts
- [[StockFxQuote]] - code - web-api/src/cex/stock-relay.ts
- [[StockPriceMap]] - code - web-api/src/cex/stock-relay.ts
- [[StockRelayDeps]] - code - web-api/src/cex/stock-relay.ts
- [[fetchStockFxQuotesViaRelay()]] - code - web-api/src/cex/stock-relay.ts
- [[fetchStockPricesViaRelay()]] - code - web-api/src/cex/stock-relay.ts
- [[fetchStockQuotesViaRelay()]] - code - web-api/src/cex/stock-relay.ts
- [[normalizeStockCurrency()]] - code - web-api/src/cex/stock-relay.ts
- [[normalizeStockFxCurrencies()]] - code - web-api/src/cex/stock-relay.ts
- [[stock-relay.test.ts]] - code - web-api/src/cex/stock-relay.test.ts
- [[stock-relay.ts]] - code - web-api/src/cex/stock-relay.ts
- [[stockRelayUrl()]] - code - web-api/src/stocks/stock-service.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/stock-relayts
SORT file.name ASC
```

## Connections to other communities
- 7 edges to [[_COMMUNITY_stock-service.ts]]
- 4 edges to [[_COMMUNITY_cex.ts]]
- 3 edges to [[_COMMUNITY_stock-pricing.ts]]
- 3 edges to [[_COMMUNITY_mappings.ts]]

## Top bridge nodes
- [[stock-relay.ts]] - degree 20, connects to 4 communities
- [[fetchStockQuotesViaRelay()]] - degree 7, connects to 2 communities
- [[fetchStockFxQuotesViaRelay()]] - degree 5, connects to 1 community
- [[fetchStockPricesViaRelay()]] - degree 5, connects to 1 community
- [[.constructor()_7]] - degree 4, connects to 1 community