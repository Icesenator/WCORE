---
type: community
cohesion: 0.10
members: 25
---

# 35_BITPANDA_SYNC.js

**Cohesion:** 0.10 - loosely connected
**Members:** 25 nodes

## Members
- [[35_BITPANDA_SYNC.js]] - code - gsheet/35_BITPANDA_SYNC.js
- [[BITPANDA_REFRESH_WATCHDOG()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[BITPANDA_SYNC_STATUS()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[BITPANDA_TRIGGER_STATUS()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[BP_REINSTALL_CEX_TRIGGERS()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[CEX_HAS_MANUAL_REQUEST()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[CEX_HOURLY_REFRESH()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[CEX_REFRESH_WATCHDOG()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[CLEAR_BITPANDA_API_KEYS()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[DIAG_CEX_LAST_RUN()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[INSTALL_BITPANDA_REFRESH_WATCHDOG()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[INSTALL_BITPANDA_SYNC_TRIGGER()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[INSTALL_CEX_HOURLY_REFRESH()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[SETUP_BITPANDA_REFRESH_CELL()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[SET_BITPANDA_API_KEY()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpEnsureCexTriggers_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpFormatStamp_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpGetRefreshFlag_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpSheetHasRequest_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexAddStockAliases_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexClearPriceMapCache_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexFetchWebPrices_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexGetWebApiToken_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexGetWebApiUrl_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexUpdateRecapColumnB_()]] - code - gsheet/35_BITPANDA_SYNC.js

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/35_BITPANDA_SYNCjs
SORT file.name ASC
```

## Connections to other communities
- 16 edges to [[_COMMUNITY__bpUpdateSelectedBuckets_]]
- 13 edges to [[_COMMUNITY_BITPANDA_ON_EDIT]]
- 11 edges to [[_COMMUNITY__bpFetchBuckets_]]
- 11 edges to [[_COMMUNITY__bpRunManualCexUpdate_]]
- 10 edges to [[_COMMUNITY__cexComputeAndAppendTotal_]]
- 4 edges to [[_COMMUNITY_bs58]]

## Top bridge nodes
- [[35_BITPANDA_SYNC.js]] - degree 89, connects to 6 communities
- [[_cexFetchWebPrices_()]] - degree 4, connects to 1 community
- [[_bpSheetHasRequest_()]] - degree 3, connects to 1 community