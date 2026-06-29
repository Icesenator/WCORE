# Spec: Web-Backed GSheet Cache

**Date**: 2026-06-26
**Status**: captured for a later session, not implemented

## Context

During the 2026-06-26 recovery session, `WCORE_AUTO_HEAL_FORCE` failed because Apps Script could not write to `ScriptProperties`:

```text
Exception: You have exceeded the property storage quota. Please remove some properties and try again.
```

The immediate recovery path was to run `WCORE_EMERGENCY_PURGE_NOW`, which uses `CacheManager._emergencyPurge_` and protects `GLOBAL_WALLET_CACHE_V1`. That is only a recovery action, not a durable architecture fix.

The durable direction chosen by the user is option 3: migrate all reconstructible GSheet cache/state to WCORE Web where practical. WCORE Web already has better storage primitives through Railway services, Redis, Postgres, and API code that can be tested more easily than Apps Script.

## Problem

GSheet currently stores too much operational state in Apps Script `ScriptProperties`, which has a hard 500 KB limit. When it fills up, unrelated systems fail together:

- Auto-heal and trigger repair cannot persist state reliably.
- Activity tracker writes fail repeatedly.
- Output snapshots, HTTP counters, retry maps, pricing attempts, and cache metadata compete with critical state.
- CEX refresh state and watchdog state become harder to reason about.
- Emergency purges are required, and even safe purges are operationally risky.

The key architectural problem is not one bad key. It is that GSheet is acting as both UI and cache database.

## Chosen Direction

Move all reconstructible cache/state to WCORE Web-backed storage.

GSheet should keep only:

- Secrets and endpoint configuration: `WCORE_WEB_API_URL`, `GSHEET_API_TOKEN`, provider setup values when they cannot live in Railway.
- Minimal kill-switches and mode flags.
- Small UI coordination fields where spreadsheet formulas need them, such as B1/I1/J1 timestamps.
- Last-known emergency breadcrumbs small enough to fit even during degraded mode.

WCORE Web should own:

- Pricing cache and FX cache.
- Token price attempt cooldowns.
- HTTP budget/counter telemetry.
- Output snapshots.
- Wallet/asset cache entries or cache references.
- Scan-result cache for web-backed chains.
- Activity bookkeeping that can be rebuilt from on-chain data or sheet state.
- GSheet cache health metadata and purge decisions.

## Target Architecture

### Web API

Add a GSheet cache API namespace under the existing authenticated GSheet plugin:

```text
POST /api/gsheet/cache/get
POST /api/gsheet/cache/set
POST /api/gsheet/cache/batch-get
POST /api/gsheet/cache/batch-set
POST /api/gsheet/cache/delete
POST /api/gsheet/cache/stats
```

Auth remains `x-gsheet-token` using `GSHEET_API_TOKEN`.

The API should classify data by namespace rather than exposing raw Redis keys:

- `price`
- `fx`
- `scan`
- `wallet`
- `snapshot`
- `activity`
- `http-budget`
- `cex-status`

Each write should include a TTL or use a namespace default TTL. The API should reject unbounded payloads and return explicit errors for oversized entries.

### Web Storage

Use Redis for fast TTL-backed data and Postgres only for state that must survive Redis eviction or must be inspectable historically.

Initial storage preference:

- Redis: pricing, FX, scan results, output snapshots, cooldowns, activity queues, HTTP counters.
- Postgres: optional cache audit snapshots, long-lived GSheet integration state, cache health history.

No user wallet secrets should be introduced into the cache API.

### GSheet Runtime

Introduce a small cache adapter layer in GSheet, for example `41_GSHEET_WEB_CACHE.gs`, that centralizes web-backed cache calls.

The adapter should expose narrow functions rather than arbitrary key/value writes:

```javascript
WebCache.getPrice(contract, chainKey)
WebCache.setPrice(contract, chainKey, value, ttlSec)
WebCache.getSnapshot(snapshotKey)
WebCache.setSnapshot(snapshotKey, rows, ttlSec)
WebCache.getWalletCache(wallet, chainKey)
WebCache.setWalletCache(wallet, chainKey, cacheObj, ttlSec)
WebCache.getStats()
```

Existing cache callers should migrate gradually behind this adapter.

## Migration Strategy

### Increment 1: Read-through Web cache for pricing and snapshots

- Keep existing GSheet caches as fallback.
- Add web-backed reads before writing new large `ScriptProperties` entries.
- Route new output snapshots to WCORE Web first.
- Keep local emergency snapshots only as a tiny last-resort fallback.

### Increment 2: Move retry/cooldown and HTTP counters

- Move `WCORE_HTTP_*`, retry maps, attempt maps, and category trackers to web-backed TTL storage.
- Keep a local in-memory fallback for the current execution only.
- Stop allowing these reconstructible counters to consume persistent `ScriptProperties` quota.

### Increment 3: Move wallet/asset cache references

- Replace large local wallet cache writes with web-backed wallet cache entries.
- Keep GSheet-visible outputs compatible with current formulas.
- Keep `GLOBAL_WALLET_CACHE_V1` only during migration and compact it aggressively.
- Once stable, shrink local wallet storage to references plus last-known timestamps.

### Increment 4: Auto-heal and observability

- Add `GET_WEB_CACHE_STATUS()` and `DIAG_WEB_CACHE_*` diagnostics in GSheet.
- Add `/api/gsheet/cache/stats` for namespace sizes, entry counts, and eviction/error counters.
- Add a health warning when local `ScriptProperties` exceeds a low threshold, for example 350 KB.

## Failure Handling

GSheet must not hard-depend on WCORE Web for visible spreadsheet operation.

If web cache is unavailable:

- Reads return `null` and callers use existing local fallback if available.
- Writes are best-effort and must not throw through user-facing custom functions.
- Visible output should degrade explicitly with existing `[DEGRADED]`, `[CACHE_ONLY]`, or `[BLOCKED:QUOTA]` semantics.
- Critical local secrets and triggers must still work.

If local `ScriptProperties` is near quota:

- New reconstructible writes should be skipped or redirected to web.
- Emergency purge should never delete protected wallet cache keys.
- Auto-heal should prioritize trigger repair over telemetry writes.

## Non-Goals

- Do not remove the native GSheet scan engine in the first increment.
- Do not make GSheet unusable when WCORE Web is down.
- Do not store provider API secrets in Redis.
- Do not rewrite all cache code in one pass.
- Do not expose arbitrary unauthenticated cache access from the web API.

## Open Questions For Next Session

- Should Redis be treated as sufficient for wallet cache, or should wallet cache use Postgres for durability?
- Which GSheet cache namespace should move first after pricing: snapshots or HTTP/retry counters?
- Should the cache API be generic key/value with namespaces, or only typed endpoints per cache class?
- Should Phase 4 web scan proxy be completed first, or should Phase 5 cache offload start with pricing/snapshots independently?

## Resume Checklist

1. Read this spec and `ROADMAP.md` Phase 5.
2. Inspect current web Redis cache abstractions and API `gsheet` plugin.
3. Inspect current GSheet cache writers that touch `ScriptProperties`.
4. Choose Increment 1 scope.
5. Write an implementation plan before editing runtime code.
6. Add tests on the web API side before implementation.
7. Add static validation for any new GSheet adapter functions.
