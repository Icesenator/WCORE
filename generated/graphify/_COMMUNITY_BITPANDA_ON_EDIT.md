---
type: community
cohesion: 0.21
members: 13
---

# BITPANDA_ON_EDIT

**Cohesion:** 0.21 - loosely connected
**Members:** 13 nodes

## Members
- [[BITPANDA_ON_EDIT()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[CEX_QUEUE_MANUAL_JOB()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[CEX_QUEUE_OR_MARK_MANUAL_JOB()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[CEX_RUN_DIRECT_OR_QUEUE()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[CEX_SET_MANUAL_REQUEST()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpFmtStamp_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpIsManagedSheet_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpSetExternalRefreshStatus_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpSetRefreshFlag_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpSetSheetRequestFlag_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexEnqueueManualJobs_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexEnsureManualWorkerTrigger_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexManualJobKindFromLabel_()]] - code - gsheet/35_BITPANDA_SYNC.js

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/BITPANDA_ON_EDIT
SORT file.name ASC
```

## Connections to other communities
- 13 edges to [[_COMMUNITY_35_BITPANDA_SYNC.js]]
- 4 edges to [[_COMMUNITY__bpRunManualCexUpdate_]]
- 2 edges to [[_COMMUNITY__bpUpdateSelectedBuckets_]]
- 1 edge to [[_COMMUNITY_bs58]]

## Top bridge nodes
- [[_bpFmtStamp_()]] - degree 8, connects to 3 communities
- [[BITPANDA_ON_EDIT()]] - degree 8, connects to 2 communities
- [[_cexEnqueueManualJobs_()]] - degree 6, connects to 2 communities
- [[_cexEnsureManualWorkerTrigger_()]] - degree 3, connects to 2 communities
- [[CEX_QUEUE_OR_MARK_MANUAL_JOB()]] - degree 6, connects to 1 community