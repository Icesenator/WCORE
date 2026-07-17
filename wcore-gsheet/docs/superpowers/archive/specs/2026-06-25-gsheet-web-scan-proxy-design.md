# Spec: GSheet Web Scan Proxy (Increment 1)

**Date**: 2026-06-25
**Status**: draft, not yet implemented

## Context

WCORE GSheet currently runs scans entirely in Apps Script: RPC calls for balances, DefiLlama/GT/DexScreener/CoinGecko for prices, and `ScriptProperties` for wallet cache. This consumes HTTP quota (20k/day), storage quota (500KB), and 30s execution limits.

`wcore-web` already has a production-ready `/api/scan` endpoint with caching (Redis), consensus RPC, multi-source pricing, and scam filtering. Connecting GSheet to reuse this endpoint would:
- Reduce GSheet HTTP quota consumption
- Reduce `ScriptProperties` usage (less cache data locally)
- Use web-grade pricing (better than GSheet cascade)
- Keep GSheet as lightweight UI layer

## Design: Optional Scan Proxy per Wallet/Chain

### Approach (confirmed)

Approach 1 — proxy scan web optional. GSheet keeps its native engine by default; a new optional code path sends a single HTTP call to `wcore-web` for 1 wallet × 1 chain and writes the result into the existing GSheet output/cache flow.

### Endpoint

#### `POST /api/gsheet/scan`

**Auth**: `x-gsheet-token` header (must match `GSHEET_API_TOKEN` on server). No user session required.

**Body**:
```json
{
  "address": "0xd5b0DbD75056A30411Be789775E40664ec858E51",
  "chain": "BSC",
  "forceRefresh": true,
  "strictTokens": true,
  "customTokens": ["0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c"]
}
```

**Response** (200):
```json
{
  "ok": true,
  "chainKey": "BSC",
  "timestamp": "2026-06-25T21:00:00.000Z",
  "native": {
    "symbol": "BNB",
    "balance": 0.00244,
    "priceEur": 489.14,
    "valueEur": 1.20
  },
  "tokens": [
    {
      "symbol": "BTCB",
      "name": "BTCB Token",
      "contract": "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c",
      "balance": 0.002034,
      "priceEur": 147636.56,
      "valueEur": 300.39,
      "scam": false
    }
  ],
  "totalValueEur": 301.59,
  "errors": [],
  "degraded": false,
  "fxRate": 0.8796,
  "scanMs": 3200
}
```

### GSheet Side

New file: `src/41_GSHEET_WEB_SCAN.gs`

Core function:
```javascript
function _webScanWallet_(address, chainKey, config, forceFull, tokensRange) {
  // 1. Check quota/breaker — if tripped, return null (fallback to native engine)
  // 2. POST to GSHEET_WEB_API_URL + "/api/gsheet/scan"
  // 3. Parse response
  // 4. Convert to OutputBuilder format matching existing GSheet conventions
  // 5. Save to WalletCache via existing _saveAllCaches
  // 6. Return rows in OutputBuilder format
}
```

Integration into `_SETUP_WCORE.gs`:
```javascript
var GSHEET_WEB_API_URL = ...; // already set by onOpen
var GSHEET_WEB_SCAN_ENABLED = true; // global kill-switch
```

Integration into `11_EVM_ENGINE.gs`:
```javascript
getWalletAssets: function(address, rpc, tokensRange, force, trig, config, walletNames) {
  // NEW: optional web proxy path
  if (GSHEET_WEB_SCAN_ENABLED && _webScanAvailable_()) {
    var webResult = _webScanWallet_(address, config.chainKey, config, force, tokensRange);
    if (webResult) return webResult;
  }
  // ... existing native engine path ...
}
```

### Safety

- **Global kill-switch**: `GSHEET_WEB_SCAN_ENABLED = false` disables all web proxy.
- **Per-chain opt-in**: start with only `BSC` in `GSHEET_WEB_SCAN_CHAINS` allowlist.
- **Fallback automatic**: if web call fails (timeout, 503, quota breaker), the native engine runs as before.
- **No dependency**: GSheet startup does NOT require web API to be available.
- **scratch/test first**: expose `DIAG_WEB_SCAN_BSC(addr)` as a manual test function before wiring into the engine automatically.

### Implementation Steps (Increment 1)

1. **Web side**: Add `POST /api/gsheet/scan` to `apps/api/src/plugins/gsheet.ts`
   - Reuse existing `/api/scan` engine internally
   - Auth via `x-gsheet-token`
   - Return simplified row-based format
   - Tests: `gsheet.test.ts`

2. **GSheet side**: Add `src/41_GSHEET_WEB_SCAN.gs`
   - `DIAG_WEB_SCAN_BSC(addr)` — manual test function
   - `_webScanWallet_(address, chainKey, config, force, tokensRange)` — core proxy
   - `_webScanAvailable_()` — guard (token set, URL set, breaker OK)
   - Global vars: `GSHEET_WEB_SCAN_ENABLED`, `GSHEET_WEB_SCAN_CHAINS`

3. **Wiring**: Add guard in `11_EVM_ENGINE.gs` `getWalletAssets`
   - Call `_webScanWallet_` before native engine if enabled and chain in allowlist
   - Fallback to native engine on any failure

4. **Test**: Manual via `=DIAG_WEB_SCAN_BSC("0xd5b0...")` on scratch cell

5. **Deploy**: Push GSheet → deploy web API → verify

### Increment 2 (future)

- Extend allowlist to all chains
- Wire into SVM/Cosmos engines
- Consider replacing `WalletCache` for web-backed chains with lightweight reference

### Non-Goals (NOT in this increment)

- Replacing `GlobalPriceCache` with web-backed pricing (separate increment)
- Migrating `GLOBAL_WALLET_CACHE_V1` to Redis (separate project)
- Removing native engine code (keep both paths)
- Changing the existing watchdog/trigger flow (B1/I1/J1 stays as-is)
