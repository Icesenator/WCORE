---
type: community
cohesion: 0.12
members: 34
---

# scan-utils.ts

**Cohesion:** 0.12 - loosely connected
**Members:** 34 nodes

## Members
- [[BYPASS_PREFIXES]] - code - web-api/src/plugins/scan-utils.ts
- [[BalanceCacheEntry]] - code - web-api/src/plugins/scan-utils.ts
- [[BatchScanRequestBodySchema]] - code - web-api/src/schemas.ts
- [[MAJOR_PRICEABLE_SYMBOLS]] - code - web-api/src/plugins/scan-utils.ts
- [[ScanJobParamsSchema]] - code - web-api/src/schemas.ts
- [[ScanRequestBodySchema]] - code - web-api/src/schemas.ts
- [[TimeoutHandle]] - code - web-api/src/plugins/scan-utils.ts
- [[applyDeFiPositionMirrorsToWalletAssets()]] - code - web-api/src/plugins/gsheet.ts
- [[assets()_1]] - code - web-api/src/scan-cache-policy.test.ts
- [[calcCleanChainValue()]] - code - web-api/src/plugins/scan-utils.ts
- [[errorMessage()]] - code - web-api/src/plugins/scan-utils.ts
- [[fetchFxRate()]] - code - web-api/src/plugins/scan.ts
- [[finalizeDeFiAssets()]] - code - web-api/src/plugins/scan.ts
- [[getBalanceCacheKey()]] - code - web-api/src/plugins/scan-utils.ts
- [[getEngineCacheForScan()]] - code - web-api/src/plugins/scan-utils.ts
- [[getScanResultCacheKey()]] - code - web-api/src/plugins/scan-utils.ts
- [[hasCachedValue()]] - code - web-api/src/plugins/scan-utils.ts
- [[hasMajorPriceableTokenWithoutPrice()]] - code - web-api/src/plugins/scan-utils.ts
- [[hasUnfinalizedDeFiAssets()]] - code - web-api/src/plugins/scan.ts
- [[isRetriableNonEvmResult()]] - code - web-api/src/plugins/scan-utils.ts
- [[makeAssets()]] - code - web-api/src/plugins/scan-utils.test.ts
- [[makeBypassingCache()]] - code - web-api/src/plugins/scan-utils.ts
- [[makeChainScan()]] - code - web-api/src/plugins/scan-utils.test.ts
- [[readBalanceCache()]] - code - web-api/src/plugins/scan-utils.ts
- [[resolveScanChainLimit()]] - code - web-api/src/plugins/scan.ts
- [[runWithTimeout()]] - code - web-api/src/plugins/scan-utils.ts
- [[scan-cache-policy.test.ts]] - code - web-api/src/scan-cache-policy.test.ts
- [[scan-job.ts]] - code - web-api/src/plugins/scan-job.ts
- [[scan-timeout.test.ts]] - code - web-api/src/scan-timeout.test.ts
- [[scan-utils.test.ts]] - code - web-api/src/plugins/scan-utils.test.ts
- [[scan-utils.ts]] - code - web-api/src/plugins/scan-utils.ts
- [[scan.ts]] - code - web-api/src/plugins/scan.ts
- [[scanPlugin()]] - code - web-api/src/plugins/scan.ts
- [[shouldCacheAssets()]] - code - web-api/src/plugins/scan-utils.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/scan-utilsts
SORT file.name ASC
```

## Connections to other communities
- 6 edges to [[_COMMUNITY_gsheet.ts]]
- 5 edges to [[_COMMUNITY_server-helpers.ts]]
- 5 edges to [[_COMMUNITY_chainbase-staking.ts_1]]
- 4 edges to [[_COMMUNITY_server.ts]]
- 4 edges to [[_COMMUNITY_schemas.ts]]
- 2 edges to [[_COMMUNITY_config.ts]]
- 1 edge to [[_COMMUNITY_TestCache]]

## Top bridge nodes
- [[scan.ts]] - degree 38, connects to 6 communities
- [[scan-job.ts]] - degree 30, connects to 3 communities
- [[scanPlugin()]] - degree 27, connects to 3 communities
- [[scan-utils.test.ts]] - degree 13, connects to 1 community
- [[applyDeFiPositionMirrorsToWalletAssets()]] - degree 5, connects to 1 community