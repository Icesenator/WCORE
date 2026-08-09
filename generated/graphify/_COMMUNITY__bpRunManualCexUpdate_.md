---
type: community
cohesion: 0.27
members: 10
---

# _bpRunManualCexUpdate_

**Cohesion:** 0.27 - loosely connected
**Members:** 10 nodes

## Members
- [[CEX_GET_SPREADSHEET()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[CEX_RUN_MANUAL_UPDATE()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpExtractStampText_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpGetSheetCellText_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpGetSpreadsheet_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpRunManualCexUpdate_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpSetSheetStatus_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexWriteManualJobRetryStatus_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexWriteManualJobStatus_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexWriteManualQueuedStatusBatch_()]] - code - gsheet/35_BITPANDA_SYNC.js

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/_bpRunManualCexUpdate_
SORT file.name ASC
```

## Connections to other communities
- 11 edges to [[_COMMUNITY_35_BITPANDA_SYNC.js]]
- 4 edges to [[_COMMUNITY_BITPANDA_ON_EDIT]]
- 2 edges to [[_COMMUNITY__bpUpdateSelectedBuckets_]]

## Top bridge nodes
- [[_cexWriteManualJobStatus_()]] - degree 7, connects to 3 communities
- [[_bpRunManualCexUpdate_()]] - degree 7, connects to 2 communities
- [[_cexWriteManualJobRetryStatus_()]] - degree 4, connects to 2 communities
- [[_cexWriteManualQueuedStatusBatch_()]] - degree 4, connects to 2 communities
- [[_bpGetSpreadsheet_()]] - degree 5, connects to 1 community