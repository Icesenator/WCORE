---
type: community
cohesion: 0.10
members: 33
---

# auth.ts

**Cohesion:** 0.10 - loosely connected
**Members:** 33 nodes

## Members
- [[ADR-0036]] - concept - web-api/src/auth.ts
- [[AuthUser]] - code - web-api/src/auth.ts
- [[COOKIE_OPTS]] - code - web-api/src/auth.ts
- [[FastifyRequest]] - code - web-api/src/auth.ts
- [[JwtAuthPayload]] - code - web-api/src/auth.ts
- [[LinkedWalletAddBodySchema]] - code - web-api/src/schemas.ts
- [[LinkedWalletPatchBodySchema]] - code - web-api/src/schemas.ts
- [[LoginBodySchema]] - code - web-api/src/schemas.ts
- [[NonceQuerySchema]] - code - web-api/src/schemas.ts
- [[OnchainGmPointEvent]] - code - web-api/src/gamification/gm-points.ts
- [[PerChainGmPoints]] - code - web-api/src/gamification/gm-points.ts
- [[ProfileParamsSchema]] - code - web-api/src/schemas.ts
- [[WalletIdParamsSchema]] - code - web-api/src/schemas.ts
- [[WalletNonceQuerySchema]] - code - web-api/src/schemas.ts
- [[_siweAllowedDomains]] - code - web-api/src/auth.ts
- [[auth-access-token.test.ts]] - code - web-api/src/auth-access-token.test.ts
- [[auth.ts]] - code - web-api/src/auth.ts
- [[authPlugin()]] - code - web-api/src/auth.ts
- [[buildPerChainGmPoints()]] - code - web-api/src/gamification/gm-points.ts
- [[claimAndRevokeToken()]] - code - web-api/src/auth.ts
- [[clearAuthCookies()]] - code - web-api/src/auth.ts
- [[fastify_2]] - code - web-api/src/auth.ts
- [[gm-points.test.ts]] - code - web-api/src/gamification/gm-points.test.ts
- [[gm-points.ts]] - code - web-api/src/gamification/gm-points.ts
- [[isTokenRevoked()]] - code - web-api/src/auth.ts
- [[isUsableAccessPayload()]] - code - web-api/src/auth.ts
- [[revokeJwtIfPresent()]] - code - web-api/src/auth.ts
- [[revokeToken()]] - code - web-api/src/auth.ts
- [[setAuthCookies()]] - code - web-api/src/auth.ts
- [[signAccessToken()]] - code - web-api/src/auth.ts
- [[signRefreshToken()]] - code - web-api/src/auth.ts
- [[utcDay()]] - code - web-api/src/gamification/gm-points.test.ts
- [[utcDayMs()]] - code - web-api/src/gamification/gm-points.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/authts
SORT file.name ASC
```

## Connections to other communities
- 8 edges to [[_COMMUNITY_schemas.ts]]
- 4 edges to [[_COMMUNITY_server.ts]]
- 1 edge to [[_COMMUNITY_config.ts]]

## Top bridge nodes
- [[auth.ts]] - degree 31, connects to 3 communities
- [[authPlugin()]] - degree 19, connects to 1 community
- [[auth-access-token.test.ts]] - degree 3, connects to 1 community
- [[LinkedWalletAddBodySchema]] - degree 3, connects to 1 community
- [[LinkedWalletPatchBodySchema]] - degree 3, connects to 1 community