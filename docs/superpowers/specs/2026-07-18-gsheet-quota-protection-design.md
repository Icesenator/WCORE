# GSheet Quota Protection Design

**Date:** 2026-07-18
**Status:** Approved design

## Objective

Keep automatic WCORE Apps Script traffic below 1,000 observed UrlFetch calls per 24 hours during normal operation, preserve a large reserve for manual refreshes and CEX jobs, and prevent API outages or spreadsheet recalculation storms from exhausting the Google account quota.

## Evidence

- Google returned the authoritative error `Service invoked too many times for one day: urlfetch`.
- The measured daily breakdown attributed 77.7% of instrumented calls to custom functions and 22.3% to `WATCHDOG_FROM_RECAP`.
- `WATCHDOG_FROM_RECAP` runs every five minutes and can pulse 15 sheets per run, allowing 4,320 automatic refresh attempts per day before Web retries.
- A delegated Web scan can make two attempts, doubling the worst-case automatic load.
- While quota was tripped, independent custom-function executions could each bypass the breaker for a recovery probe. Version 4.16.33 now limits those probes to one per 15 minutes.
- `HttpCounter` and `HttpCallCounter` use unlocked read-modify-write updates in `ScriptProperties`; concurrent executions overwrite counts.
- Delegated `_originalUrlFetch` calls require manual instrumentation and are absent from the current host breakdown.
- Google Apps Script quotas are per user, so WCORE telemetry cannot account for calls made by other Apps Script projects owned by the same account.

## Traffic Policy

### Normal Scheduling

- Run `WATCHDOG_FROM_RECAP` every 10 minutes instead of every five minutes.
- Pulse at most five sheets per watchdog run instead of 15.
- Keep the existing five-hour freshness threshold.
- This capacity can refresh 30 sheets per hour and all approximately 120 wallet-chain sheets within four hours.

### Web Scan Attempts

- Automatic scans make one Web API attempt.
- Explicit manual or force-full refreshes may make a second attempt for transient failures.
- Authoritative Google quota errors never retry.
- A response with a permanent 4xx status never retries.

### Duplicate Suppression

- Add a short per-wallet/per-chain Web scan lease in `CacheService` using canonical `CK_get` keys.
- Serialize only lease acquisition with a short `UserLock`; never hold the lock during HTTP or sheet work.
- If another execution owns the lease, serve the existing wallet cache when available and otherwise return a deferred status without making HTTP.
- A deferred result must not be treated as a fresh API failure.

### Web API Circuit Breaker

- Track consecutive transient Web API failures in a short-lived shared state.
- Open the Web API breaker after three transient failures within five minutes.
- Keep it open for 30 minutes.
- While open, make no Web API calls and serve cache/deferred status.
- A successful Web response clears the failure state.
- Google quota errors remain owned by `QuotaCircuitBreaker`, not the Web API breaker.

### Watchdog Error Backoff

- Healthy and stale sheets retain the normal five-hour policy.
- `WEB_SCAN_ERROR` retries use per-sheet backoff: 30 minutes, two hours, six hours, then 24 hours.
- A healthy timestamp clears the sheet's error retry state.
- `BLOCKED:QUOTA` is never pulsed by the normal watchdog; only `QUOTA_RECOVERY_SWEEP` can release it after a successful real probe.
- Recovery refreshes remain combined, deduplicated, and sequential.

## Telemetry

### Atomic Updates

- Protect persistent counter read-modify-write sections with a short `UserLock`.
- Load fresh property state after acquiring the lock; do not save an execution-local stale snapshot.
- On lock contention, preserve a separate dropped-telemetry count rather than delaying HTTP work indefinitely.
- Do not hold a lock across `UrlFetchApp`, sleeps, spreadsheet writes, or trigger creation.

### Attribution

- Extend counter APIs with an optional explicit trigger/category.
- Record delegated scans as `WEB_SCAN`, not as the global mutable `WCORE_CURRENT_TRIGGER` value.
- Record the WCORE API host for delegated scans even though they use `_originalUrlFetch`.
- Track recovery probes separately as `QUOTA_PROBE`.
- Keep legacy trigger attribution for callers that cannot provide an explicit category, but label it approximate.

### Diagnostics

- Report rolling observed calls, calls by category, calls by host, dropped telemetry updates, Web breaker state, and current watchdog policy.
- Diagnostics must state that counts cover this WCORE project only and are not the authoritative Google account quota.
- No diagnostic may reset Google's breaker or make a network request unless its name explicitly states that it is a live probe.

## Cache Keys

Add canonical entries to `00C_CACHE_KEYS.gs` for:

- per-wallet Web scan lease;
- Web API failure state;
- watchdog Web error backoff state;
- dropped telemetry accounting if persisted outside existing counter objects.

Keys must be bounded and must not expose wallet addresses in logs.

## Failure Behavior

- Cache data is never overwritten by a failed, deferred, quota-blocked, or circuit-open scan.
- Missing cache plus a deferred scan returns a stable deferred marker, not a misleading success timestamp.
- Telemetry failure never blocks a legitimate HTTP call, but quota admission controls do.
- If `CacheService`, `PropertiesService`, or lock acquisition fails, duplicate suppression and Web breaker checks fail closed for automatic work and remain bypassable only by an explicit manual force refresh.

## Testing

Add executable Node/VM guards that prove:

- watchdog cadence and five-pulse cap;
- one automatic attempt and two manual attempts;
- concurrent scans produce one lease owner and no duplicate fetch;
- lease contention serves cache or deferred status;
- Web breaker opens, suppresses calls, and resets on success;
- watchdog backoff follows 30m, 2h, 6h, and 24h and clears on health;
- counter updates reload state under lock and do not lose sequentially simulated concurrent increments;
- explicit `WEB_SCAN` and `QUOTA_PROBE` attribution overrides global mutable context;
- quota errors do not retry or open the wrong breaker;
- existing portfolio recovery, watchdog, Web scan, static validation, and full `npm test` suites remain green.

## Deployment

- Commit only quota-protection source and test files.
- Deploy with `safe-push.ps1` after the source tree is clean.
- Run `WCORE_AUTO_HEAL_FORCE` once after deployment so the new 10-minute watchdog trigger replaces the existing five-minute trigger.
- Do not run manual live probes while Google still reports exhausted quota.
- Verify trigger inventory, diagnostics, and cached portfolio behavior without forcing a Web refresh.

## Out Of Scope

- Moving the complete scan queue from Apps Script to Railway.
- Measuring UrlFetch usage from unrelated Apps Script projects under the same Google account.
- Changing the five-hour healthy-data freshness target.
- Increasing the Google account quota or changing account licensing.
