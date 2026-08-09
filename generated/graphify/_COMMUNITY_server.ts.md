---
type: community
cohesion: 0.09
members: 37
---

# server.ts

**Cohesion:** 0.09 - loosely connected
**Members:** 37 nodes

## Members
- [[ApiConfig]] - code - web-api/src/config.ts
- [[IMPORTANT Do NOT call app.close() in an `after` hook.]] - rationale - web-api/test/cache-integration.test.ts
- [[IMPORTANT Solana addresses are case-sensitive base58. Do NOT lowercase.]] - rationale - web-api/test/cache-integration.test.ts
- [[MetricsPluginDeps]] - code - web-api/src/plugins/metrics-plugin.ts
- [[PLAN_LIMITS]] - code - web-api/src/server.ts
- [[TEST_ACCOUNT]] - code - web-api/src/auth.test.ts
- [[admin-plugins.test.ts]] - code - web-api/test/admin-plugins.test.ts
- [[app]] - code - web-api/src/server.ts
- [[auth.test.ts]] - code - web-api/src/auth.test.ts
- [[authHeader()]] - code - web-api/src/auth.test.ts
- [[cache-integration.test.ts]] - code - web-api/test/cache-integration.test.ts
- [[circuitBreakers]] - code - web-api/src/server.ts
- [[gamification.security.test.ts]] - code - web-api/test/gamification.security.test.ts
- [[getCircuitBreaker()]] - code - web-api/src/server.ts
- [[getScanLimit()]] - code - web-api/src/server.ts
- [[getUserPlan()]] - code - web-api/src/server.ts
- [[makeToken()]] - code - web-api/src/share.test.ts
- [[makeToken()_1]] - code - web-api/src/support.test.ts
- [[makeToken()_2]] - code - web-api/test/gamification.security.test.ts
- [[makeToken()_3]] - code - web-api/test/wallet-plugins.test.ts
- [[metrics-plugin.ts]] - code - web-api/src/plugins/metrics-plugin.ts
- [[metricsPlugin()]] - code - web-api/src/plugins/metrics-plugin.ts
- [[nonceTargetAddress()]] - code - web-api/src/server.ts
- [[prisma]] - code - web-api/src/server.ts
- [[rateLimitIdentity()_1]] - code - web-api/src/server.ts
- [[recordOpsEvent()]] - code - web-api/src/server.ts
- [[resolveCustomTokens()]] - code - web-api/src/server.ts
- [[seedGmContracts()]] - code - web-api/src/gamification/index.ts
- [[server.ts]] - code - web-api/src/server.ts
- [[share.test.ts]] - code - web-api/src/share.test.ts
- [[snapshotMetrics()]] - code - web-api/src/server.ts
- [[support.test.ts]] - code - web-api/src/support.test.ts
- [[test-secret.ts]] - code - web-api/src/test-secret.ts
- [[userPlanCacheKey()]] - code - web-api/src/server.ts
- [[validateCustomToken()]] - code - web-api/src/server-helpers.ts
- [[wallet-plugins.test.ts]] - code - web-api/test/wallet-plugins.test.ts
- [[warnSingleRpcChains()]] - code - web-api/src/server.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/serverts
SORT file.name ASC
```

## Connections to other communities
- 8 edges to [[_COMMUNITY_index.ts]]
- 6 edges to [[_COMMUNITY_schemas.ts]]
- 6 edges to [[_COMMUNITY_chainbase-staking.ts_1]]
- 5 edges to [[_COMMUNITY_stock-portfolio.ts]]
- 4 edges to [[_COMMUNITY_support.ts]]
- 4 edges to [[_COMMUNITY_auth.ts]]
- 4 edges to [[_COMMUNITY_scan-utils.ts]]
- 3 edges to [[_COMMUNITY_config.ts]]
- 2 edges to [[_COMMUNITY_crypto-listing-service.ts]]
- 2 edges to [[_COMMUNITY_cex.ts]]
- 2 edges to [[_COMMUNITY_gsheet.ts]]
- 2 edges to [[_COMMUNITY_stock-service.ts]]

## Top bridge nodes
- [[server.ts]] - degree 68, connects to 12 communities
- [[ApiConfig]] - degree 6, connects to 3 communities
- [[test-secret.ts]] - degree 7, connects to 2 communities
- [[app]] - degree 9, connects to 1 community
- [[prisma]] - degree 8, connects to 1 community