---
type: community
cohesion: 0.25
members: 9
---

# _cexComputeAndAppendTotal_

**Cohesion:** 0.25 - loosely connected
**Members:** 9 nodes

## Members
- [[REPAIR_CEX_SHEETS_STRUCTURE()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_bpWriteRows_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexBuildVerifFormula_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexComputeAndAppendTotal_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexGetPriceMap_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexRepairSheetStructure_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexStockAliasSwitch_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexSymbolToGeckoId_()]] - code - gsheet/35_BITPANDA_SYNC.js
- [[_cexWriteVerifMap_()]] - code - gsheet/35_BITPANDA_SYNC.js

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/_cexComputeAndAppendTotal_
SORT file.name ASC
```

## Connections to other communities
- 10 edges to [[_COMMUNITY_35_BITPANDA_SYNC.js]]
- 1 edge to [[_COMMUNITY__bpFetchBuckets_]]
- 1 edge to [[_COMMUNITY__bpUpdateSelectedBuckets_]]

## Top bridge nodes
- [[_bpWriteRows_()]] - degree 4, connects to 3 communities
- [[_cexComputeAndAppendTotal_()]] - degree 7, connects to 1 community
- [[_cexBuildVerifFormula_()]] - degree 4, connects to 1 community
- [[_cexWriteVerifMap_()]] - degree 4, connects to 1 community
- [[_cexRepairSheetStructure_()]] - degree 3, connects to 1 community