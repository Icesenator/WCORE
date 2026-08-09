---
type: community
cohesion: 0.17
members: 16
---

# _bpUpdateSelectedBuckets_

**Cohesion:** 0.17 - loosely connected
**Members:** 16 nodes

## Members
- [[CEX_ACQUIRE_LOCK()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[CEX_CLEAR_MANUAL_REQUEST()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[CEX_RELEASE_LOCK()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[UPDATE_BITPANDA_CRYPTO()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[UPDATE_BITPANDA_CRYPTO_FIAT()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[UPDATE_BITPANDA_SPOT()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[UPDATE_BITPANDA_STOCKS_FIAT()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpDeleteRefreshFlag_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpGetManagedSheetRefreshPlan_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpMergeBuckets_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpRunCryptoCexRefreshDirect_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpSetStatus_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpUpdateSelectedBuckets_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexIsTransientResult_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexRequeueManualJob_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexRunManualJob_()]] - code - gsheet/35_BITPANDA_SYNC.js

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/_bpUpdateSelectedBuckets_
SORT file.name ASC
```

## Connections to other communities
- 16 edges to [[_COMMUNITY_35_BITPANDA_SYNC.js]]
- 2 edges to [[_COMMUNITY__bpFetchBuckets_]]
- 2 edges to [[_COMMUNITY_BITPANDA_ON_EDIT]]
- 2 edges to [[_COMMUNITY__bpRunManualCexUpdate_]]
- 1 edge to [[_COMMUNITY_bs58]]
- 1 edge to [[_COMMUNITY__cexComputeAndAppendTotal_]]

## Top bridge nodes
- [[_cexRunManualJob_()]] - degree 12, connects to 4 communities
- [[_bpUpdateSelectedBuckets_()]] - degree 12, connects to 3 communities
- [[_bpGetManagedSheetRefreshPlan_()]] - degree 5, connects to 2 communities
- [[UPDATE_BITPANDA_CRYPTO_FIAT()]] - degree 5, connects to 1 community
- [[UPDATE_BITPANDA_SPOT()]] - degree 4, connects to 1 community