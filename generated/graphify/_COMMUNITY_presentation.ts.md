---
type: community
cohesion: 0.40
members: 5
---

# presentation.ts

**Cohesion:** 0.40 - moderately connected
**Members:** 5 nodes

## Members
- [[EXCLUDED_NOTIFICATION_TYPES]] - code - web-api/src/gamification/notifications.ts
- [[NotificationIdParamsSchema]] - code - web-api/src/schemas.ts
- [[NotificationStreamQuerySchema]] - code - web-api/src/schemas.ts
- [[notifications.ts]] - code - web-api/src/gamification/notifications.ts
- [[registerNotificationRoutes()]] - code - web-api/src/gamification/notifications.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/presentationts
SORT file.name ASC
```

## Connections to other communities
- 3 edges to [[_COMMUNITY_index.ts]]
- 3 edges to [[_COMMUNITY_schemas.ts]]

## Top bridge nodes
- [[registerNotificationRoutes()]] - degree 6, connects to 2 communities
- [[notifications.ts]] - degree 3, connects to 1 community
- [[NotificationIdParamsSchema]] - degree 2, connects to 1 community
- [[NotificationStreamQuerySchema]] - degree 2, connects to 1 community