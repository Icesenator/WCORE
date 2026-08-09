---
type: community
cohesion: 0.25
members: 11
---

# _bpFetchBuckets_

**Cohesion:** 0.25 - loosely connected
**Members:** 11 nodes

## Members
- [[DIAG_BITPANDA_API()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpCanonicalSymbol_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpFetchBuckets_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpFetch_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpGetApiKey_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpParseBalance_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpPushUniqueRow_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpReclassifyCashLike_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpWalkAssetWallets_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpWalletRow_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexRelayFetchWithRetry_()]] - code - gsheet/35_BITPANDA_SYNC.js

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/_bpFetchBuckets_
SORT file.name ASC
```

## Connections to other communities
- 11 edges to [[_COMMUNITY_35_BITPANDA_SYNC.js]]
- 2 edges to [[_COMMUNITY__bpUpdateSelectedBuckets_]]
- 1 edge to [[_COMMUNITY__cexComputeAndAppendTotal_]]

## Top bridge nodes
- [[_bpFetchBuckets_()]] - degree 8, connects to 2 communities
- [[_bpParseBalance_()]] - degree 4, connects to 2 communities
- [[_bpGetApiKey_()]] - degree 3, connects to 2 communities
- [[_bpPushUniqueRow_()]] - degree 5, connects to 1 community
- [[_bpReclassifyCashLike_()]] - degree 4, connects to 1 community