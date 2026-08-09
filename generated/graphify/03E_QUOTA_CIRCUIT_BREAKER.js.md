---
source_file: "gsheet/03E_QUOTA_CIRCUIT_BREAKER.js"
type: "code"
community: "03E_QUOTA_CIRCUIT_BREAKER.js"
location: "L1"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/03E_QUOTA_CIRCUIT_BREAKERjs
---

# 03E_QUOTA_CIRCUIT_BREAKER.js

## Connections
- [[GET_HTTP_BREAKDOWN_24H()]] - `contains` [EXTRACTED]
- [[GET_HTTP_COUNT_LAST_24H()]] - `contains` [EXTRACTED]
- [[GET_QUOTA_BREAKER_STATUS()]] - `contains` [EXTRACTED]
- [[GET_QUOTA_PROTECTION_STATUS()]] - `contains` [EXTRACTED]
- [[INSTALL_GLOBAL_QUOTA_BREAKER()]] - `contains` [EXTRACTED]
- [[INSTALL_QUOTA_CIRCUIT_BREAKER()]] - `contains` [EXTRACTED]
- [[IS_QUOTA_EXHAUSTED()]] - `contains` [EXTRACTED]
- [[LIVE_PROBE_QUOTA_NOW()]] - `contains` [EXTRACTED]
- [[NOTE We do NOT test quota at load time to save HTTP calls]] - `rationale_for` [EXTRACTED]
- [[RESET_HTTP_COUNTER()]] - `contains` [EXTRACTED]
- [[RESET_QUOTA_BREAKER()]] - `contains` [EXTRACTED]
- [[SET_WCORE_HTTP_MODE()]] - `contains` [EXTRACTED]
- [[TRIP_QUOTA_BREAKER()]] - `contains` [EXTRACTED]
- [[WCORE_HTTP_MODE_STATUS()]] - `contains` [EXTRACTED]
- [[_autoMode()]] - `contains` [EXTRACTED]
- [[_category()]] - `contains` [EXTRACTED]
- [[_claimAutomaticProbeLease()]] - `contains` [EXTRACTED]
- [[_count()]] - `contains` [EXTRACTED]
- [[_currentTrigger()]] - `contains` [EXTRACTED]
- [[_fallbackCount()]] - `contains` [EXTRACTED]
- [[_flatten()]] - `contains` [EXTRACTED]
- [[_fmtLocal()]] - `contains` [EXTRACTED]
- [[_getEffectiveMode()]] - `contains` [EXTRACTED]
- [[_getManualMode()]] - `contains` [EXTRACTED]
- [[_getTodayUTC()]] - `contains` [EXTRACTED]
- [[_host()]] - `contains` [EXTRACTED]
- [[_httpTelemetryTransport_()]] - `contains` [EXTRACTED]
- [[_isAllowed()]] - `contains` [EXTRACTED]
- [[_isQuotaError()_1]] - `contains` [EXTRACTED]
- [[_isTripped()]] - `contains` [EXTRACTED]
- [[_loadRaw()]] - `contains` [EXTRACTED]
- [[_normalize()]] - `contains` [EXTRACTED]
- [[_purge()]] - `contains` [EXTRACTED]
- [[_readLocked()]] - `contains` [EXTRACTED]
- [[_reset()]] - `contains` [EXTRACTED]
- [[_safeFetch()]] - `contains` [EXTRACTED]
- [[_safeFetchAll()]] - `contains` [EXTRACTED]
- [[_save()]] - `contains` [EXTRACTED]
- [[_snapshotLoadRaw()]] - `contains` [EXTRACTED]
- [[_sum()]] - `contains` [EXTRACTED]
- [[_testQuotaOnce()]] - `contains` [EXTRACTED]
- [[_trackErrorAndMaybeTrip()]] - `contains` [EXTRACTED]
- [[_trip()]] - `contains` [EXTRACTED]
- [[categoryForReason()]] - `contains` [EXTRACTED]
- [[checkQuotaAndReturnCache()]] - `contains` [EXTRACTED]
- [[shouldAbortDueToQuota()]] - `contains` [EXTRACTED]
- [[testQuotaAndGetCache()]] - `contains` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/03E_QUOTA_CIRCUIT_BREAKERjs