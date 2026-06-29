# GSheet Web Scan Delegation - All Chains

## Context

GSheet currently refreshes ledger rows by pulsing `B1`, which recalculates `*_REFRESH_STATUS(...)` in `I1`. The Apps Script engines then perform balance, metadata, pricing, FX, and RPC work through `UrlFetchApp`. This consumes the Google Apps Script UrlFetch quota and can leave the sheet stuck in `[BLOCKED:QUOTA]` for long periods.

The roadmap already defines Phase 4, GSheet-to-Web Scan Delegation. The previous increment proposed starting with BSC only. This design supersedes that rollout scope: implement delegation for all supported VMs behind a global kill-switch and safe fallback.

## Goal

Let GSheet delegate wallet scans to WCORE Web for EVM, SVM, Cosmos, and TON chains. GSheet should use one authenticated call to WCORE Web per chain refresh instead of running the full Apps Script engine locally.

The immediate goal is to reduce Apps Script UrlFetch consumption for balance, price, and metadata refreshes while preserving existing GSheet formulas, output format, and cache semantics.

## Non-Goals

- Do not remove the existing Apps Script engines.
- Do not change existing ledger formulas.
- Do not migrate all GSheet cache/state to Redis in this increment.
- Do not make the sheet hard-dependent on WCORE Web for visible cached output.
- Do not overwrite valid local cache with empty or failed web responses.

## Web API

Add an authenticated endpoint under the existing GSheet plugin:

```text
POST /api/gsheet/scan
```

Auth remains `x-gsheet-token` using `GSHEET_API_TOKEN`.

Request body:

```json
{
  "address": "0x... or svm/cosmos/ton address",
  "chain": "BASE",
  "forceRefresh": false,
  "strictTokens": true,
  "customTokens": ["0x..."]
}
```

Response body:

```json
{
  "ok": true,
  "chain": "BASE",
  "chainName": "Base",
  "vm": "EVM",
  "timestamp": "2026-06-26T17:00:00.000Z",
  "native": {
    "symbol": "ETH",
    "balance": 0.01,
    "priceEur": 2100,
    "valueEur": 21
  },
  "tokens": [
    {
      "symbol": "USDC",
      "name": "USD Coin",
      "contract": "0x...",
      "balance": 10,
      "decimals": 6,
      "priceEur": 0.86,
      "valueEur": 8.6
    }
  ],
  "totalValueEur": 29.6,
  "errors": [],
  "degraded": false,
  "fxRate": 0.86,
  "scanMs": 3200,
  "cacheStats": { "hits": 0, "misses": 0, "stale": 0, "skipped": 0 }
}
```

The endpoint should call the existing web scan engine path rather than duplicating scan logic. It should support all VMs that `@wcore/core` supports: EVM, SVM, Cosmos, and TON.

## GSheet Runtime

Add a new adapter file, for example `41_GSHEET_WEB_SCAN.gs`.

Core responsibilities:

- Read `WCORE_WEB_API_URL`, `GSHEET_API_TOKEN`, `GSHEET_WEB_SCAN_ENABLED`, and optional allowlist settings from `ScriptProperties`.
- Build a web scan request from the existing GSheet chain config, wallet address, `forceFull`, and token range.
- Call `POST /api/gsheet/scan` once per refresh attempt. Apps Script does not reliably enforce `UrlFetchApp` timeouts, so the adapter must use a strict execution-time budget and must not chain additional native HTTP work after a slow or failed web call.
- Convert the web response into the existing `WalletCache` shape used by `CACHED_WALLET_ASSETS_*`.
- Preserve local cache if the web response is empty, invalid, or failed.
- Return a compact status string for `I1`, for example `WEB_SCAN_OK <timestamp>` or `[WEB_SCAN_DEGRADED] <timestamp>`.

Integration point:

- At the start of `getRefreshStatus` for EVM/SVM/Cosmos/TON, try `_webScanWallet_()` when enabled.
- On success, save the converted cache and return the web status.
- On web failure, fall back to the native Apps Script engine only if the Apps Script quota breaker is not already tripped.
- If Apps Script quota is already tripped, do not run the native fallback. Return existing quota-blocked behavior and preserve cache.

## Configuration

Use simple script properties:

- `GSHEET_WEB_SCAN_ENABLED`: `true` or `false`.
- `GSHEET_WEB_SCAN_ALLOWLIST`: `ALL` by default for this rollout, or comma-separated chain keys for rollback/debug.
- `WCORE_WEB_API_URL`: base URL for WCORE Web API.
- `GSHEET_API_TOKEN`: shared secret for `/api/gsheet/*`.

Default behavior should be safe: if configuration is missing, web scan is disabled and existing Apps Script paths continue.

## Cache And Output Semantics

The adapter must write a local `WalletCache` object compatible with existing renderers. Existing formulas should continue to work:

- `I1` triggers the refresh.
- `J1` latches the last refresh timestamp.
- `A1`/`A2` reads cache-only via `CACHED_WALLET_ASSETS_*`.

The web response must not be allowed to destructively overwrite valid cache. Empty or failed scans are not saved unless they are explicitly confirmed empty by the web engine and meet the same invariants already used by WCORE Web scan caching.

## Error Handling

- Unauthorized web response: disable only that request path and fall back if quota allows.
- Slow or failed web call: preserve cache, fall back only if quota allows and enough execution budget remains.
- Invalid payload: preserve cache and return a diagnostic status.
- Web degraded but useful data: save cache with degraded scan stats and return `[WEB_SCAN_DEGRADED]`.
- Apps Script quota tripped: do not run native fallback, because that re-enters the quota failure loop.

## Diagnostics

Add GSheet diagnostics:

- `DIAG_WEB_SCAN_STATUS()` returns config, enabled state, allowlist, and last error summary.
- `DIAG_WEB_SCAN_CHAIN(chain, address)` performs one controlled web scan and returns the parsed status without modifying visible ledger cells unless explicitly requested.

Add web-side tests and logs for `/api/gsheet/scan`, including auth failures, invalid body, unsupported chain, and successful mocked scans for each VM family.

## Rollout

1. Implement web endpoint with tests.
2. Implement GSheet adapter with tests using mocked web responses.
3. Deploy web API.
4. Deploy GSheet adapter disabled by default.
5. Enable `GSHEET_WEB_SCAN_ENABLED=true` with `GSHEET_WEB_SCAN_ALLOWLIST=ALL`.
6. Validate representative chains: `Base`, `Solana`, `Cosmos Hub`, and `TON`.
7. Monitor `Recap Portfolio` timestamps and quota breaker status.

## Success Criteria

- A ledger refresh uses one WCORE Web request from Apps Script instead of many RPC/pricing requests from Apps Script.
- `B1` pulses still refresh stale or partial data.
- GSheet refreshes consume at most one Apps Script `UrlFetch` for the web scan path instead of many RPC/pricing calls. If the Google quota is already fully exhausted, that single web call can still fail; recovery then waits for the quota probe as today.
- Existing GSheet outputs keep the same visible shape.
- Valid local cache is preserved on web or RPC failure.
- Rollback is possible by setting `GSHEET_WEB_SCAN_ENABLED=false`.
