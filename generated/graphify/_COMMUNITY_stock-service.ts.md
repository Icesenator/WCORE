---
type: community
cohesion: 0.16
members: 31
---

# stock-service.ts

**Cohesion:** 0.16 - loosely connected
**Members:** 31 nodes

## Members
- [[.buildSnapshot()_1]] - code - web-api/src/stocks/stock-service.ts
- [[.fetchQuotesChunked()]] - code - web-api/src/stocks/stock-service.ts
- [[.getPricesForBitpandaSymbols()]] - code - web-api/src/stocks/stock-service.ts
- [[.getTopMarketCapSnapshot()]] - code - web-api/src/stocks/stock-service.ts
- [[.persistRows()]] - code - web-api/src/stocks/stock-service.ts
- [[.persistRowsFallback()]] - code - web-api/src/stocks/stock-service.ts
- [[.readPrice()]] - code - web-api/src/stocks/stock-service.ts
- [[.readPrices()]] - code - web-api/src/stocks/stock-service.ts
- [[.safeGet()_1]] - code - web-api/src/stocks/stock-service.ts
- [[.safeSet()_1]] - code - web-api/src/stocks/stock-service.ts
- [[.staleSnapshotOrThrow()_1]] - code - web-api/src/stocks/stock-service.ts
- [[CanonicalStockService]] - code - web-api/src/stocks/stock-service.ts
- [[CanonicalStockServiceDeps]] - code - web-api/src/stocks/stock-service.ts
- [[StockFxQuoteMap]] - code - web-api/src/cex/stock-relay.ts
- [[StockNativeQuoteMap]] - code - web-api/src/cex/stock-relay.ts
- [[TopMarketCapSnapshot]] - code - web-api/src/stocks/stock-service.ts
- [[distinctFxCurrencies()]] - code - web-api/src/stocks/stock-service.ts
- [[isCompleteSnapshot()_1]] - code - web-api/src/stocks/stock-service.ts
- [[isNonemptyString()_1]] - code - web-api/src/stocks/stock-service.ts
- [[isRecentIso()_1]] - code - web-api/src/stocks/stock-service.ts
- [[isRecord()_1]] - code - web-api/src/stocks/stock-service.ts
- [[isResolvedPrice()]] - code - web-api/src/stocks/stock-service.ts
- [[lastGood()]] - code - web-api/src/stocks/stock-pricing.test.ts
- [[makeSnapshot()_1]] - code - web-api/src/stocks/stock-service.ts
- [[mapWithConcurrencyLimit()_1]] - code - web-api/src/stocks/stock-service.ts
- [[markSnapshotStale()_1]] - code - web-api/src/stocks/stock-service.ts
- [[pickResolved()]] - code - web-api/src/stocks/stock-service.ts
- [[rateFor()]] - code - web-api/src/stocks/stock-service.ts
- [[sliceSnapshot()_1]] - code - web-api/src/stocks/stock-service.ts
- [[stock-service.ts]] - code - web-api/src/stocks/stock-service.ts
- [[validateLimit()_1]] - code - web-api/src/stocks/stock-service.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/stock-servicets
SORT file.name ASC
```

## Connections to other communities
- 10 edges to [[_COMMUNITY_stock-portfolio.ts]]
- 7 edges to [[_COMMUNITY_stock-relay.ts]]
- 5 edges to [[_COMMUNITY_mappings.ts]]
- 5 edges to [[_COMMUNITY_stock-pricing.ts]]
- 3 edges to [[_COMMUNITY_stock-service.test.ts]]
- 3 edges to [[_COMMUNITY_scan-plugin-routes.test.ts]]
- 2 edges to [[_COMMUNITY_server.ts]]

## Top bridge nodes
- [[stock-service.ts]] - degree 38, connects to 7 communities
- [[CanonicalStockService]] - degree 17, connects to 3 communities
- [[.getPricesForBitpandaSymbols()]] - degree 12, connects to 3 communities
- [[.buildSnapshot()_1]] - degree 10, connects to 3 communities
- [[StockNativeQuoteMap]] - degree 5, connects to 1 community