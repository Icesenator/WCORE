---
type: community
cohesion: 0.43
members: 8
---

# support.ts

**Cohesion:** 0.43 - moderately connected
**Members:** 8 nodes

## Members
- [[ChainsPluginDeps]] - code - web-api/src/plugins/chains.ts
- [[NativePriceQuerySchema]] - code - web-api/src/schemas.ts
- [[admin-auth.ts]] - code - web-api/src/admin-auth.ts
- [[chains.test.ts]] - code - web-api/src/plugins/chains.test.ts
- [[chains.ts]] - code - web-api/src/plugins/chains.ts
- [[chainsPlugin()]] - code - web-api/src/plugins/chains.ts
- [[isAdminAuthorized()]] - code - web-api/src/admin-auth.ts
- [[safeEq()]] - code - web-api/src/admin-auth.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/supportts
SORT file.name ASC
```

## Connections to other communities
- 4 edges to [[_COMMUNITY_server.ts]]
- 4 edges to [[_COMMUNITY_schemas.ts]]
- 3 edges to [[_COMMUNITY_cex.ts]]
- 3 edges to [[_COMMUNITY_gsheet.ts]]

## Top bridge nodes
- [[admin-auth.ts]] - degree 7, connects to 4 communities
- [[chains.ts]] - degree 8, connects to 2 communities
- [[isAdminAuthorized()]] - degree 6, connects to 2 communities
- [[safeEq()]] - degree 6, connects to 2 communities
- [[chainsPlugin()]] - degree 5, connects to 1 community