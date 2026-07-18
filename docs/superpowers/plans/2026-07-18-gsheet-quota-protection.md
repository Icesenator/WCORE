# GSheet Quota Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep normal automatic WCORE Apps Script traffic below 1,000 observed UrlFetch calls per rolling 24 hours while preserving cached output, manual refresh capacity, authoritative Google quota protection, and observable recovery behavior.

**Architecture:** Put all delegated Web admission in `41_GSHEET_WEB_SCAN.gs`: an address-safe `CacheService` lease and shared transient-failure breaker are updated only while a short `UserLock` is held, and no lock spans HTTP or sheet work. Return a common successful deferred result so EVM, SVM, Cosmos, and TON reuse cache or expose a stable `[WEB_SCAN_DEFERRED]` marker without entering `[WEB_SCAN_ERROR]` retry loops; retain `QuotaCircuitBreaker` as the non-bypassable outer gate. Add bounded watchdog error state and atomic rolling telemetry, then expose read-only diagnostics and reinstall the changed watchdog trigger through the existing auto-heal trigger spec.

**Tech Stack:** Google Apps Script `.gs`, `CacheService`, `PropertiesService`, `LockService.getUserLock()`, Node.js `assert`/`vm` test guards, npm scripts, PowerShell `safe-push.ps1`, Git.

---

### Task 1: Canonical Web Admission Keys, Lease, and Shared Deferred Result

**Files:**
- Modify: `wcore-gsheet/src/00C_CACHE_KEYS.gs:12-20`
- Modify: `wcore-gsheet/src/41_GSHEET_WEB_SCAN.gs:42-44,56-65,117-119,571-699`
- Create: `wcore-gsheet/tests/quota-protection-web.test.js`
- Test: `wcore-gsheet/tests/web-scan-adapter.test.js`

- [ ] **Step 1: Write the failing canonical-key and lease tests**

Create `wcore-gsheet/tests/quota-protection-web.test.js` with a VM harness that loads `00C_CACHE_KEYS.gs` followed by `41_GSHEET_WEB_SCAN.gs`, shares one cache map across contexts, tracks whether the `UserLock` is held, records fetch count, and supplies a wallet cache with `updatedAt = Date.parse('2026-07-18T10:00:00Z')`. Use these exact assertions:

```javascript
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const keysSource = fs.readFileSync(path.join(root, 'src/00C_CACHE_KEYS.gs'), 'utf8');
const webSource = fs.readFileSync(path.join(root, 'src/41_GSHEET_WEB_SCAN.gs'), 'utf8');

function runtime(shared, options = {}) {
  const props = Object.assign({
    GSHEET_WEB_SCAN_ENABLED: 'true',
    GSHEET_WEB_SCAN_REQUIRE: 'true',
    GSHEET_WEB_SCAN_ALLOWLIST: 'ALL',
    WCORE_WEB_API_URL: 'https://api-production-b5bf.up.railway.app',
    GSHEET_API_TOKEN: 'secret'
  }, options.props || {});
  const lock = {
    tryLock() { shared.lockAttempts++; if (options.lockFails) return false; shared.lockHeld = true; return true; },
    releaseLock() { shared.lockHeld = false; }
  };
  const cache = {
    get(key) { if (!shared.lockHeld) throw new Error('cache admission read without UserLock'); return shared.cache.get(key) || null; },
    put(key, value, ttl) { if (!shared.lockHeld) throw new Error('cache admission write without UserLock'); shared.puts.push({ key, value, ttl }); shared.cache.set(key, String(value)); },
    remove(key) { if (!shared.lockHeld) throw new Error('cache admission remove without UserLock'); shared.cache.delete(key); }
  };
  const context = {
    console, Date, JSON, Math, String, Number, Boolean, Array, Object, RegExp,
    encodeURIComponent, isFinite, parseInt,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => Object.prototype.hasOwnProperty.call(props, key) ? props[key] : null,
      setProperty: (key, value) => { props[key] = String(value); },
      getProperties: () => Object.assign({}, props)
    }) },
    CacheService: { getScriptCache: () => cache },
    LockService: { getUserLock: () => lock },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: (_algorithm, value) => Array.from(Buffer.from(String(value))).concat([17, 29, 43, 71]),
      formatDate: () => '2026-07-18 12:00:00',
      sleep() {}
    },
    Session: { getScriptTimeZone: () => 'Europe/Paris' },
    UrlFetchApp: { fetch() { throw new Error('patched fetch must not be selected'); } },
    _originalUrlFetch() { shared.fetches++; return options.response ? options.response() : { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, native: { symbol: 'ETH', balance: 1, priceEur: 1, valueEur: 1 }, tokens: [], errors: [], degraded: false, fxRate: 0.9, scanMs: 1 }); }; },
    WalletCache: {
      load: () => options.walletCache || null,
      save: (_key, value) => { shared.saved.push(value); },
      getLastUpdateStr: () => '2026-07-18 12:00:00'
    },
    CacheManager: { init() {} },
    Format: { now: () => '2026-07-18 12:00:00', datetime: () => '2026-07-18 12:00:00' },
    QuotaCircuitBreaker: options.quota || { isTripped: () => false, handleError: () => false },
    HttpCounter: { record() {} },
    HttpCallCounter: { increment() {} },
    Logger: { log() {} }
  };
  vm.createContext(context);
  vm.runInContext(keysSource, context);
  vm.runInContext(webSource, context);
  return context;
}

function state() {
  return { cache: new Map(), puts: [], saved: [], fetches: 0, lockAttempts: 0, lockHeld: false };
}

{
  const shared = state();
  const first = runtime(shared);
  const second = runtime(shared, { walletCache: { updatedAt: Date.parse('2026-07-18T10:00:00Z'), assets: [{ contract: 'native', balance: 1 }] } });
  const config = { CHAIN: { KEY: 'BASE', NAME: 'Base', NATIVE_SYMBOL: 'ETH' }, CACHE_VERSION: 1 };
  assert.equal(first._webScanWallet_('0xAbC', [], false, config).ok, true);
  const deferred = second._webScanWallet_('0xAbC', [], false, config);
  assert.equal(shared.fetches, 1, 'two automatic executions must produce one Web fetch');
  assert.equal(deferred.deferred, true);
  assert.match(deferred.status, /^\[CACHE_ONLY\] 2026-07-18 12:00:00$/);
  assert.equal(shared.lockHeld, false, 'UserLock must be released before HTTP and cache rendering');
  assert(shared.puts[0].key.startsWith('WSCAN_LEASE:BASE:'));
  assert(!shared.puts[0].key.toLowerCase().includes('0xabc'), 'canonical lease key must not expose the wallet address');
}

{
  const shared = state();
  const ctx = runtime(shared);
  const result = ctx._webScanWallet_('0xdef', [], false, { CHAIN: { KEY: 'BASE', NAME: 'Base' } });
  assert.equal(result.deferred, false, 'lease owner performs the request');
  const contender = runtime(shared)._webScanWallet_('0xdef', [], false, { CHAIN: { KEY: 'BASE', NAME: 'Base' } });
  assert.equal(contender.deferred, true);
  assert.equal(contender.status, '[WEB_SCAN_DEFERRED] N/A', 'missing cache must return a stable timestamp-free marker');
}

for (const mode of ['lock', 'cache']) {
  const shared = state();
  const ctx = runtime(shared, mode === 'lock' ? { lockFails: true } : {});
  if (mode === 'cache') ctx.CacheService.getScriptCache = () => { throw new Error('cache unavailable'); };
  const automatic = ctx._webScanWallet_('0x123', [], false, { CHAIN: { KEY: 'BASE' } });
  assert.equal(automatic.deferred, true, `${mode} failure must fail closed for automatic work`);
  assert.equal(shared.fetches, 0);
}

console.log('web quota protection OK');
```

- [ ] **Step 2: Run the focused test to verify RED**

Run: `rtk node tests/quota-protection-web.test.js` from `wcore-gsheet`.

Expected: FAIL because `CK_get('webScanLease', ...)`, `_webScanAcquireAdmission_`, and the successful deferred result do not exist; current behavior makes a second HTTP request.

- [ ] **Step 3: Add canonical bounded keys**

Add these exact registry entries in `CK_REGISTRY`:

```javascript
webScanLease: { vars: ["chainKey", "walletHash"], pattern: "WSCAN_LEASE:{chainKey}:{walletHash}" },
webApiFailureState: { vars: [], pattern: "WSCAN_BREAKER:v1" },
watchdogWebBackoff: { vars: [], pattern: "WD_WEB_BACKOFF:v1" },
httpDroppedTelemetry: { vars: [], pattern: "HTTP_DROPPED:v1" },
```

The lease key receives only `_webScanChainKey_(config)` and a 16-byte lowercase hexadecimal digest; never pass or log the raw address.

- [ ] **Step 4: Implement short lease admission and the shared deferred result**

In `41_GSHEET_WEB_SCAN.gs`, add these constants and helpers before `_webScanWallet_`:

```javascript
var GSHEET_WEB_SCAN_LEASE_SEC = 120;
var GSHEET_WEB_SCAN_LOCK_WAIT_MS = 250;

function _webScanForce_(forceFull) {
  return forceFull === true || String(forceFull || '').toUpperCase() === 'TRUE';
}

function _webScanWalletHash_(address) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(address || '').trim().toLowerCase());
  var hex = '';
  for (var i = 0; i < bytes.length && i < 16; i++) hex += ('0' + ((bytes[i] + 256) % 256).toString(16)).slice(-2);
  if (hex.length !== 32) throw new Error('wallet_hash_unavailable');
  return hex;
}

function _webScanDeferredResult_(address, cacheKey, config, reason) {
  var cached = null;
  try { cached = WalletCache.load(String(cacheKey || address || '').trim(), null, config); } catch (eLoad) {}
  var stamp = '';
  try { stamp = cached && cached.updatedAt ? Format.datetime(cached.updatedAt) : ''; } catch (eFmt) {}
  return {
    ok: true,
    deferred: true,
    deferredReason: String(reason || 'ADMISSION'),
    status: stamp ? '[CACHE_ONLY] ' + stamp : '[WEB_SCAN_DEFERRED] N/A',
    cache: cached || null
  };
}

function _webScanAcquireAdmission_(address, chainKey, forceFull) {
  if (_webScanForce_(forceFull)) return { allowed: true, bypassed: true };
  var lock = null;
  var acquired = false;
  try {
    lock = LockService.getUserLock();
    if (!lock || !lock.tryLock(GSHEET_WEB_SCAN_LOCK_WAIT_MS)) return { allowed: false, reason: 'LOCK_BUSY' };
    acquired = true;
    var cache = CacheService.getScriptCache();
    if (!cache) return { allowed: false, reason: 'CACHE_UNAVAILABLE' };
    var key = CK_get('webScanLease', { chainKey: chainKey, walletHash: _webScanWalletHash_(address) });
    if (cache.get(key)) return { allowed: false, reason: 'LEASE_HELD' };
    cache.put(key, '1', GSHEET_WEB_SCAN_LEASE_SEC);
    return { allowed: true, leaseKey: key };
  } catch (e) {
    return { allowed: false, reason: 'ADMISSION_ERROR' };
  } finally {
    if (acquired) try { lock.releaseLock(); } catch (eRelease) {}
  }
}
```

At the start of `_webScanWallet_`, preserve this order: validate Web configuration, derive the chain, reject immediately if `_webScanQuotaTripped_()` is true, then call `_webScanAcquireAdmission_`. If admission is denied, return `_webScanDeferredResult_(address, cacheKey, config, admission.reason)` before selecting `fetchFn`. Do not release a successful lease at function exit: its 120-second TTL suppresses concurrent and immediate duplicate recalculations. Do not put `UrlFetchApp`, `WalletCache.load/save`, `Utilities.sleep`, spreadsheet calls, or logging inside the lock block.

- [ ] **Step 5: Verify shared engine semantics without four engine-specific branches**

Append exact source guards to `quota-protection-web.test.js`:

```javascript
for (const file of ['11_EVM_ENGINE.gs', '14_SVM_ENGINE.gs', '15_COSMOS_ENGINE.gs', 'TON.gs']) {
  const engine = fs.readFileSync(path.join(root, 'src', file), 'utf8');
  assert(engine.includes('_webScanWallet_('), `${file} must consume the shared Web result`);
  assert(!engine.includes('_webScanDeferredResult_('), `${file} must not duplicate defer logic`);
}
assert.match(webSource, /ok:\s*true[\s\S]*deferred:\s*true[\s\S]*WEB_SCAN_DEFERRED/);
```

This deliberately leaves the four engines unchanged: their existing `webScan && webScan.ok && webScan.status` branch consumes cached and no-cache deferrals as successful admission outcomes, so `_webScanErrorStatus_` remains reserved for actual failures.

- [ ] **Step 6: Run focused and existing adapter tests to verify GREEN**

Run: `rtk node tests/quota-protection-web.test.js`

Expected: PASS with `web quota protection OK`.

Run: `rtk npm run test:web-scan-adapter`

Expected: PASS with `web scan adapter OK` and `web scan engine integration OK`; existing cache preservation tests remain green.

- [ ] **Step 7: Commit the admission slice**

```bash
rtk git add wcore-gsheet/src/00C_CACHE_KEYS.gs wcore-gsheet/src/41_GSHEET_WEB_SCAN.gs wcore-gsheet/tests/quota-protection-web.test.js
rtk git commit -m "feat(gsheet): gate duplicate web scans"
```

Expected: one commit containing only the three listed quota-protection files.

### Task 2: Automatic Attempt Limit and Transient Web API Circuit Breaker

**Files:**
- Modify: `wcore-gsheet/src/41_GSHEET_WEB_SCAN.gs:42-44,172-182,582-699,701-720`
- Modify: `wcore-gsheet/tests/quota-protection-web.test.js`
- Modify: `wcore-gsheet/tests/web-scan-adapter.test.js:843-882,912-926`

- [ ] **Step 1: Add failing attempt, classification, breaker, and quota-precedence tests**

Extend the focused test with these scenarios, creating a new runtime for each outcome and counting `_originalUrlFetch` calls:

```javascript
const transient = () => { throw new Error('Address unavailable: WCORE API'); };

{
  const shared = state();
  const ctx = runtime(shared, { response: transient });
  const result = ctx._webScanWallet_('0xaaa', [], false, { CHAIN: { KEY: 'BASE' } });
  assert.equal(shared.fetches, 1, 'automatic scan gets one attempt');
  assert.equal(result.ok, false);
  assert.equal(result.transient, true);
}

{
  const shared = state();
  const ctx = runtime(shared, { response: transient });
  ctx._webScanWallet_('0xbbb', [], true, { CHAIN: { KEY: 'BASE' } });
  assert.equal(shared.fetches, 2, 'explicit force scan may retry one transient failure');
}

for (const code of [400, 401, 403, 404]) {
  const shared = state();
  const ctx = runtime(shared, { response: () => ({ getResponseCode: () => code, getContentText: () => '{"error":"permanent"}' }) });
  ctx._webScanWallet_('0x' + code, [], true, { CHAIN: { KEY: 'BASE' } });
  assert.equal(shared.fetches, 1, `HTTP ${code} must not retry`);
}

{
  const shared = state();
  for (let i = 0; i < 3; i++) runtime(shared, { response: transient })._webScanWallet_('0x' + i, [], false, { CHAIN: { KEY: 'BASE' } });
  const blocked = runtime(shared)._webScanWallet_('0xfourth', [], false, { CHAIN: { KEY: 'BASE' } });
  assert.equal(shared.fetches, 3, 'open breaker suppresses the fourth automatic call');
  assert.equal(blocked.deferred, true);
  assert.equal(blocked.deferredReason, 'WEB_BREAKER_OPEN');
}

{
  const shared = state();
  const stateKey = 'WSCAN_BREAKER:v1';
  shared.cache.set(stateKey, JSON.stringify({ failures: [1, 2, 3], openUntil: Date.now() + 1800000 }));
  const forced = runtime(shared)._webScanWallet_('0xmanual', [], true, { CHAIN: { KEY: 'BASE' } });
  assert.equal(forced.ok, true, 'force may bypass Web admission breaker');
  assert.equal(shared.fetches, 1);
}

{
  const shared = state();
  const quota = { isTripped: () => true, handleError: () => true };
  const result = runtime(shared, { quota })._webScanWallet_('0xquota', [], true, { CHAIN: { KEY: 'BASE' } });
  assert.match(result.status, /^\[BLOCKED:QUOTA\]/);
  assert.equal(shared.fetches, 0, 'force must never bypass QuotaCircuitBreaker');
}
```

Add a success-after-two-failures case and assert `JSON.parse(shared.cache.get('WSCAN_BREAKER:v1')).failures.length === 0`. Add an HTTP 429 and HTTP 503 case that each count as transient, and assert a Google quota exception returns `[BLOCKED:QUOTA]` without adding a timestamp to `WSCAN_BREAKER:v1`.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `rtk node tests/quota-protection-web.test.js`

Expected: FAIL because automatic scans still use two attempts, there is no shared Web breaker, 5xx/429 responses are not classified for retry, and Google quota precedence is not represented in Web breaker state.

- [ ] **Step 3: Implement exact attempt and transient classification policy**

Replace `GSHEET_WEB_SCAN_MAX_ATTEMPTS` with explicit policy constants:

```javascript
var GSHEET_WEB_SCAN_AUTO_ATTEMPTS = 1;
var GSHEET_WEB_SCAN_MANUAL_ATTEMPTS = 2;
var GSHEET_WEB_BREAKER_THRESHOLD = 3;
var GSHEET_WEB_BREAKER_WINDOW_MS = 5 * 60 * 1000;
var GSHEET_WEB_BREAKER_OPEN_SEC = 30 * 60;
var GSHEET_WEB_BREAKER_STATE_TTL_SEC = 35 * 60;
```

Add `_webScanHttpClass_(code)` returning `success` for 2xx, `transient` for `0`, `408`, `425`, `429`, and 5xx, and `permanent` for every other 4xx. Network exceptions are transient only after `_webScanHandleQuotaError_` declines them. Calculate attempts as `_webScanForce_(forceFull) ? GSHEET_WEB_SCAN_MANUAL_ATTEMPTS : GSHEET_WEB_SCAN_AUTO_ATTEMPTS`; retry only `transient`, sleep 250 ms only between the two manual attempts, and never retry permanent 4xx or authoritative quota errors.

- [ ] **Step 4: Implement bounded shared Web breaker state under short UserLock sections**

Add helpers with these exact state semantics:

```javascript
function _webScanReadBreakerState_() {
  var raw = CacheService.getScriptCache().get(CK_get('webApiFailureState'));
  var state = raw ? JSON.parse(raw) : {};
  return { failures: Array.isArray(state.failures) ? state.failures.slice(-3) : [], openUntil: Number(state.openUntil || 0) };
}

function _webScanUpdateBreaker_(outcome) {
  var lock = null;
  var acquired = false;
  try {
    lock = LockService.getUserLock();
    if (!lock || !lock.tryLock(GSHEET_WEB_SCAN_LOCK_WAIT_MS)) return false;
    acquired = true;
    var cache = CacheService.getScriptCache();
    var key = CK_get('webApiFailureState');
    var state = _webScanReadBreakerState_();
    var now = Date.now();
    if (outcome === 'success') state = { failures: [], openUntil: 0 };
    if (outcome === 'transient') {
      state.failures = state.failures.filter(function(ts) { return now - Number(ts) <= GSHEET_WEB_BREAKER_WINDOW_MS; });
      state.failures.push(now);
      state.failures = state.failures.slice(-GSHEET_WEB_BREAKER_THRESHOLD);
      if (state.failures.length >= GSHEET_WEB_BREAKER_THRESHOLD) state.openUntil = now + GSHEET_WEB_BREAKER_OPEN_SEC * 1000;
    }
    cache.put(key, JSON.stringify(state), GSHEET_WEB_BREAKER_STATE_TTL_SEC);
    return true;
  } catch (e) {
    return false;
  } finally {
    if (acquired) try { lock.releaseLock(); } catch (eRelease) {}
  }
}
```

Make `_webScanAcquireAdmission_` read breaker state while it already owns the `UserLock`; automatic work returns `{ allowed:false, reason:'WEB_BREAKER_OPEN' }` when `openUntil > Date.now()`. If lock/cache/state parsing fails, automatic work remains deferred. Force work bypasses lease and Web breaker admission, but only after `_webScanQuotaTripped_()` has returned false. Record one `transient` outcome per failed scan operation, not once per retry attempt; permanent 4xx and Google quota do not update this breaker. A valid 2xx payload calls `_webScanUpdateBreaker_('success')` before wallet cache save and clears prior failures.

- [ ] **Step 5: Update existing retry expectations and make live diagnostics explicit**

In `web-scan-adapter.test.js`, change the automatic transient test at lines 843-858 to expect one attempt and an unsuccessful result. Add a force-full variant expecting two attempts and success on the second response. Keep the quota test expecting exactly one handler call and no retry.

Rename the network-making `DIAG_WEB_SCAN_CHAIN(chain,address)` function to `LIVE_PROBE_WEB_SCAN_CHAIN(chain,address)` and update its existing test call. Keep `DIAG_WEB_SCAN_STATUS()` and `DIAG_WEB_SCAN_LAST_ERROR()` read-only; neither may invoke `_webScanWallet_`.

- [ ] **Step 6: Run focused and adapter tests to verify GREEN**

Run: `rtk node tests/quota-protection-web.test.js`

Expected: PASS; automatic attempts equal one, force attempts equal two only for transient outcomes, breaker opens after three qualifying failures, success clears it, and quota errors never affect the Web breaker.

Run: `rtk npm run test:web-scan-adapter`

Expected: PASS with the updated automatic/manual attempt contract and `LIVE_PROBE_WEB_SCAN_CHAIN` diagnostic name.

- [ ] **Step 7: Commit the Web breaker slice**

```bash
rtk git add wcore-gsheet/src/41_GSHEET_WEB_SCAN.gs wcore-gsheet/tests/quota-protection-web.test.js wcore-gsheet/tests/web-scan-adapter.test.js
rtk git commit -m "feat(gsheet): add web scan circuit breaker"
```

Expected: one commit containing only the three listed files.

### Task 3: Ten-Minute Watchdog, Five-Pulse Budget, and Bounded Error Backoff

**Files:**
- Modify: `wcore-gsheet/src/16_REFRESH.gs:94-110,245-310,338-456,633-655,779-978,1059-1298`
- Modify: `wcore-gsheet/src/16B_AUTO_HEAL.gs:24-35,73-87,222-295`
- Modify: `wcore-gsheet/tests/watchdog-quota-guard.test.js`
- Modify: `wcore-gsheet/tests/auto-heal-new-ledgers.test.js:158-168`

- [ ] **Step 1: Write failing cadence, pulse-budget, defer, and backoff tests**

In `watchdog-quota-guard.test.js`, change the static cap assertion from `15` to `5`. Extend `loadWatchdogHelpers()` with `_wd_loadWebBackoff_`, `_wd_saveWebBackoff_`, `_wd_pruneWebBackoff_`, and `_wd_webErrorDecision_`, plus a mutable ScriptProperties map and `CK_get('watchdogWebBackoff') => 'WD_WEB_BACKOFF:v1'`.

Add these exact behavioral assertions using `t0 = Date.parse('2026-07-18T00:00:00Z')`:

```javascript
const delays = [30, 120, 360, 1440].map((minutes) => minutes * 60000);
const state = { 'Ledger - Error': { attempts: 0, lastPulseMs: t0, lastErrorMs: t0 } };
const nextDelays = [delays[1], delays[2], delays[3], delays[3]];
for (let attempt = 0; attempt < delays.length; attempt++) {
  const at = state['Ledger - Error'].lastPulseMs + delays[attempt];
  const decision = helpers._wd_webErrorDecision_(state, 'Ledger - Error', at, t0);
  assert.equal(decision.allowed, true, `attempt ${attempt + 1} becomes eligible at its boundary`);
  assert.equal(decision.nextDelayMs, nextDelays[attempt]);
}

const beforeBoundary = helpers._wd_webErrorDecision_({ 'Ledger - Error': { attempts: 2, lastPulseMs: t0 } }, 'Ledger - Error', t0 + 2 * 3600000 - 1, t0);
assert.equal(beforeBoundary.allowed, false, 'second retry waits the full two hours');

const deferred = helpers._wd_needsRefresh_('', '[WEB_SCAN_DEFERRED] N/A', t0, 5 * 3600000);
assert.deepEqual(deferred, { needsPulse: false, reason: 'deferred', blockedReason: null, useBlockedCooldown: false });

const healthyState = { 'Ledger - Healthy': { attempts: 4, lastPulseMs: t0 } };
helpers._wd_webErrorDecision_(healthyState, 'Ledger - Healthy', t0 + 1, null);
assert.equal(healthyState['Ledger - Healthy'], undefined, 'healthy timestamp clears error backoff');
```

Build 12 stale/error candidates plus 3 partial candidates through the same collection path and assert that the returned actions contain no more than five `B1` pulses total. Add 250 synthetic backoff entries, including entries older than 48 hours, call `_wd_pruneWebBackoff_`, and assert old entries are removed and no more than 200 remain.

In `auto-heal-new-ledgers.test.js`, add:

```javascript
assert.match(autoHealSource, /newTrigger\("WATCHDOG_FROM_RECAP"\)\.timeBased\(\)\.everyMinutes\(10\)\.create\(\)/);
assert.match(autoHealSource, /watchdog10/);
assert.doesNotMatch(autoHealSource, /newTrigger\("WATCHDOG_FROM_RECAP"\)\.timeBased\(\)\.everyMinutes\(5\)/);
```

- [ ] **Step 2: Run watchdog tests to verify RED**

Run: `rtk npm run test:watchdog-quota`

Expected: FAIL because `WD_MAX_PULSES_PER_RUN` is 15, `[WEB_SCAN_ERROR]` uses the normal 30-minute cooldown forever, and `[WEB_SCAN_DEFERRED]` is currently classified as an error through the generic text check.

Run: `rtk npm run test:auto-heal-new-ledgers`

Expected: FAIL because `_wcoreAutoHealCreateManagedTriggers_()` still creates `WATCHDOG_FROM_RECAP` every five minutes and the trigger spec has no `watchdog10` marker.

- [ ] **Step 3: Implement one bounded watchdog Web-error state map**

Set:

```javascript
var WD_MAX_PULSES_PER_RUN = 5;
var WD_WEB_ERROR_BACKOFF_MS = [30 * 60000, 2 * 3600000, 6 * 3600000, 24 * 3600000];
var WD_WEB_BACKOFF_MAX_ENTRIES = 200;
var WD_WEB_BACKOFF_RETENTION_MS = 48 * 3600000;
```

Store one JSON object under `CK_get('watchdogWebBackoff')`, keyed by sheet name with `{ attempts, lastPulseMs, lastErrorMs }`. `_wd_loadWebBackoff_()` returns `{}` on malformed data. `_wd_pruneWebBackoff_()` removes entries whose newest timestamp is older than 48 hours, sorts remaining entries by newest timestamp descending, and retains at most 200. `_wd_saveWebBackoff_()` persists only the pruned map.

Implement `_wd_webErrorDecision_(state,sheetName,nowMs,errorTimestampMs)` with these rules:

```javascript
function _wd_webErrorDecision_(state, sheetName, nowMs, errorTimestampMs) {
  var entry = state[sheetName];
  if (errorTimestampMs == null) {
    if (entry) delete state[sheetName];
    return { allowed: false, nextDelayMs: 0 };
  }
  if (!entry || Number(entry.lastErrorMs || 0) !== Number(errorTimestampMs)) {
    entry = state[sheetName] = { attempts: 0, lastPulseMs: Number(errorTimestampMs), lastErrorMs: Number(errorTimestampMs) };
  }
  var index = Math.min(Number(entry.attempts || 0), WD_WEB_ERROR_BACKOFF_MS.length - 1);
  var delay = WD_WEB_ERROR_BACKOFF_MS[index];
  if (nowMs - Number(entry.lastPulseMs || 0) < delay) return { allowed: false, nextDelayMs: delay };
  entry.attempts = Math.min(index + 1, WD_WEB_ERROR_BACKOFF_MS.length);
  entry.lastPulseMs = nowMs;
  return { allowed: true, nextDelayMs: WD_WEB_ERROR_BACKOFF_MS[Math.min(entry.attempts, WD_WEB_ERROR_BACKOFF_MS.length - 1)] };
}
```

Load the map once in `_wd_collectGlobalRefreshActions_`, apply this decision only to `[WEB_SCAN_ERROR]`, clear the sheet entry when I1 has a healthy parseable timestamp, and save once after collection. If loading or saving PropertiesService state fails, suppress `[WEB_SCAN_ERROR]` pulses for that run; healthy and stale five-hour scheduling remains unchanged.

- [ ] **Step 4: Keep deferred and quota states out of normal retries**

In `_wd_needsRefresh_`, test `[WEB_SCAN_DEFERRED]` before the generic `error` substring calculation and return `reason:'deferred', needsPulse:false`. Continue returning no normal pulse for `[BLOCKED:QUOTA]`; only `QUOTA_RECOVERY_SWEEP` and its successful real probe may release those rows. Do not sync J1 from `[WEB_SCAN_DEFERRED] N/A`, because it is not a real success timestamp.

- [ ] **Step 5: Enforce one five-pulse budget across stale, error, and partial work**

Change `_wd_checkPartialCycles_(ss,nowMs,maxPulses)` to collect candidate actions rather than directly writing unlimited B1 values. Feed partial candidates into `_wd_collectGlobalRefreshActions_` with the other candidates, sort by the existing priority/staleness rules, and slice once with `WD_MAX_PULSES_PER_RUN`. Apply the same collection helper in `_wd_watchdogFromRecapViaSheetsApi_`; remove its independent pre-loop partial writes. J1 sync actions do not consume the B1 pulse budget.

The main `WATCHDOG_FROM_RECAP` may continue holding its existing `ScriptLock` for sheet coordination. The new backoff property helpers must not acquire `ScriptLock`; later counter updates use `UserLock`, preventing self-deadlock.

- [ ] **Step 6: Change cadence and force trigger reinstall through the spec**

In `_wcoreAutoHealCreateManagedTriggers_`, replace only the watchdog builder with:

```javascript
ScriptApp.newTrigger("WATCHDOG_FROM_RECAP").timeBased().everyMinutes(10).create();
```

Bump `WCORE_AUTO_HEAL_TRIGGER_SPEC` by replacing `recap5` with `watchdog10`. Keep `WATCHDOG_FROM_RECAP` in both `managed` and `required`, so a spec mismatch deletes the existing five-minute trigger before creating the ten-minute trigger. Update `WCORE_AUTO_HEAL_VERSION` and source version comments in the touched `.gs` files.

- [ ] **Step 7: Run watchdog and auto-heal tests to verify GREEN**

Run: `rtk npm run test:watchdog-quota`

Expected: PASS with a five-pulse total cap, exact 30m/2h/6h/24h boundaries, health clearing, bounded pruning, no normal quota pulse, and no deferred retry loop.

Run: `rtk npm run test:auto-heal-new-ledgers`

Expected: PASS with a ten-minute watchdog trigger and bumped trigger spec.

- [ ] **Step 8: Commit the watchdog slice**

```bash
rtk git add wcore-gsheet/src/16_REFRESH.gs wcore-gsheet/src/16B_AUTO_HEAL.gs wcore-gsheet/tests/watchdog-quota-guard.test.js wcore-gsheet/tests/auto-heal-new-ledgers.test.js
rtk git commit -m "feat(gsheet): back off watchdog web errors"
```

Expected: one commit containing only the four listed files.

### Task 4: Atomic Explicit Telemetry and WCORE Host Attribution

**Files:**
- Modify: `wcore-gsheet/src/03E_QUOTA_CIRCUIT_BREAKER.gs:583-718,1081-1127,1235-1275`
- Modify: `wcore-gsheet/src/26B_HTTP_SAVINGS.gs:335-658`
- Modify: `wcore-gsheet/src/41_GSHEET_WEB_SCAN.gs:608-699`
- Modify: `wcore-gsheet/src/16_REFRESH.gs:1412-1435`
- Create: `wcore-gsheet/tests/http-counter-atomicity.test.js`
- Modify: `wcore-gsheet/tests/quota-recovery-state.test.js:561-589`

- [ ] **Step 1: Write failing atomic counter and explicit attribution tests**

Create `wcore-gsheet/tests/http-counter-atomicity.test.js`. Extract and VM-load `HttpCounter` from `03E_QUOTA_CIRCUIT_BREAKER.gs` and `HttpCallCounter` from `26B_HTTP_SAVINGS.gs`. Use a shared property map whose `getProperty` returns the latest value, a `UserLock` that exposes `held`, and assertions that every counter `getProperty`/`setProperty` occurs while `held === true`.

Simulate stale execution-local state by constructing two runtimes before either records, then call:

```javascript
first.HttpCounter.record(1, 'WEB_SCAN', 'https://api-production-b5bf.up.railway.app/api/gsheet/scan');
second.HttpCounter.record(1, 'QUOTA_PROBE', 'https://httpbin.org/status/200');
assert.equal(third.HttpCounter.count(), 2, 'fresh reload under UserLock preserves both increments');
assert.deepEqual(JSON.parse(JSON.stringify(third.HttpCounter.byTrigger())), { WEB_SCAN: 1, QUOTA_PROBE: 1 });
assert.equal(third.HttpCounter.byHost()['api-production-b5bf.up.railway.app'], 1);
assert.equal(third.HttpCounter.byHost()['httpbin.org'], 1);
```

Set global property `WCORE_CURRENT_TRIGGER='WATCHDOG_FROM_RECAP'`, call `record(1,'WEB_SCAN',wcoreUrl)`, and assert the category is `WEB_SCAN`, not `WATCHDOG_FROM_RECAP`. Call `record(1,null,'https://legacy.example/test')` and assert it appears as `approx:WATCHDOG_FROM_RECAP`.

Make `tryLock()` return false, call `record`, and assert no HTTP exception is thrown and `HttpCounter.dropped() === 1`. Restore the lock, call `record`, and assert the persisted dropped total is at least one. For `HttpCallCounter.flush()`, pre-seed a persistent count after buffering an increment, flush, and assert the fresh persistent count plus the buffered count is saved rather than the earlier snapshot.

- [ ] **Step 2: Run the telemetry test to verify RED**

Run: `rtk node tests/http-counter-atomicity.test.js`

Expected: FAIL because both counters perform unlocked read-modify-write, `HttpCounter.record` has no explicit category/URL parameters or host map, and dropped telemetry is not exposed.

- [ ] **Step 3: Make `HttpCounter` the atomic rolling telemetry source**

Add canonical-property constants derived from `CK_get` where applicable:

```javascript
var HOST_KEY = "WCORE_HTTP_HOSTS_v1";
var DROPPED_KEY = CK_get('httpDroppedTelemetry');
var LOCK_WAIT_MS = 100;
```

Change `record` to `record(n, explicitCategory, url)`. It must acquire `LockService.getUserLock().tryLock(LOCK_WAIT_MS)`, then reload `KEY`, `TRIGGER_KEY`, `HOST_KEY`, and `DROPPED_KEY` from ScriptProperties after acquiring the lock, purge them, apply the increment, save all changed maps, and release in `finally`. Remove `_cache`, `_triggerCache`, and `_loaded`; no execution-local object may be used as the persisted base.

Normalize categories as explicit uppercase names when supplied. Without an explicit category, use `approx:` plus `_currentTrigger()` to preserve legacy attribution while marking it approximate. Parse host with the existing `https?://([^/]+)` rule and lowercase it. Add `byHost()` and `dropped()` read APIs. On lock/cache/property failure, increment an in-memory `_droppedPending`; best-effort persist it on the next successful locked record before clearing the pending value. Telemetry failure returns without throwing and never suppresses a legitimate HTTP call.

Keep the global UrlFetch patch calls as `HttpCounter.record(1, null, url)` and one call per `fetchAll` request URL. This preserves approximate attribution for callers not yet converted.

- [ ] **Step 4: Make legacy `HttpCallCounter.flush` atomic without nested ScriptLock**

Change `increment(url, explicitCategory)` to store the explicit category when supplied and `approx:` plus `_readTrigger()` otherwise. In `flush()`, acquire a short `UserLock`, reload each day-key property only after acquisition, merge `_mem`, `_hostMem`, and `_triggerMem`, persist, then clear only the amounts that were successfully merged. On lock contention, leave buffers intact for a later flush and increment the shared dropped counter through `HttpCounter.noteDropped()`; never wait more than 100 ms.

Do not use `LockService.getScriptLock()` in either counter. `WATCHDOG_FROM_RECAP` already holds that lock when its HTTP/telemetry paths run, so a ScriptLock counter would deadlock.

- [ ] **Step 5: Attribute bypassed HTTP calls explicitly**

In `_webScanWallet_`, immediately before each `_originalUrlFetch` attempt, call:

```javascript
HttpCounter.record(1, "WEB_SCAN", baseUrl + "/api/gsheet/scan");
HttpCallCounter.increment(baseUrl + "/api/gsheet/scan", "WEB_SCAN");
```

Remove `HttpCallCounter.setTrigger('WATCHDOG_FROM_RECAP')` from the Web adapter. This records the actual WCORE API host even for `_originalUrlFetch` and cannot be overwritten by mutable global trigger context.

In `QuotaCircuitBreaker._testQuotaOnce` and `_recoveryProbeQuota_`, record the real probe URL with category `QUOTA_PROBE` through both counters. Do not classify it as `QUOTA_BREAKER_TEST` or `QUOTA_RECOVERY_SWEEP`. Keep Google quota errors owned by `QuotaCircuitBreaker`.

- [ ] **Step 6: Rename the quota network diagnostic to state its side effect**

Rename `TEST_QUOTA_NOW()` to `LIVE_PROBE_QUOTA_NOW()`. Keep `GET_QUOTA_BREAKER_STATUS()` read-only. Update `quota-recovery-state.test.js` to extract and invoke `LIVE_PROBE_QUOTA_NOW`, assert it passes `true` to `QuotaCircuitBreaker.testOnce`, and assert `GET_QUOTA_BREAKER_STATUS` contains neither `_originalUrlFetch` nor `.testOnce(`.

Do not retain a network-making compatibility alias named `TEST_QUOTA_NOW`; the specification requires every network diagnostic to state `LIVE_PROBE` in its name.

- [ ] **Step 7: Run telemetry and quota recovery tests to verify GREEN**

Run: `rtk node tests/http-counter-atomicity.test.js`

Expected: PASS with two preserved increments, explicit category precedence, WCORE API host coverage, approximate legacy labels, and dropped telemetry accounting.

Run: `rtk npm run test:quota-recovery-state`

Expected: PASS with `LIVE_PROBE_QUOTA_NOW` recovery scheduling and unchanged combined, deduplicated, sequential portfolio recovery.

Run: `rtk npm run test:web-scan-adapter`

Expected: PASS; bypassed Web scans remain counted once and cache behavior is unchanged.

- [ ] **Step 8: Commit the telemetry slice**

```bash
rtk git add wcore-gsheet/src/03E_QUOTA_CIRCUIT_BREAKER.gs wcore-gsheet/src/26B_HTTP_SAVINGS.gs wcore-gsheet/src/41_GSHEET_WEB_SCAN.gs wcore-gsheet/src/16_REFRESH.gs wcore-gsheet/tests/http-counter-atomicity.test.js wcore-gsheet/tests/quota-recovery-state.test.js
rtk git commit -m "feat(gsheet): make HTTP telemetry atomic"
```

Expected: one commit containing only the six listed files.

### Task 5: Read-Only Quota Diagnostics and Integrated Regression Suite

**Files:**
- Modify: `wcore-gsheet/src/03E_QUOTA_CIRCUIT_BREAKER.gs:1134-1291`
- Modify: `wcore-gsheet/src/41_GSHEET_WEB_SCAN.gs:701-720`
- Modify: `wcore-gsheet/package.json:6-28`
- Modify: `wcore-gsheet/tests/http-counter-atomicity.test.js`
- Modify: `wcore-gsheet/tests/quota-protection-web.test.js`

- [ ] **Step 1: Add failing read-only diagnostic contract tests**

Extend `http-counter-atomicity.test.js` to call `GET_QUOTA_PROTECTION_STATUS()` with seeded rolling totals, categories, hosts, dropped count, Web breaker state, and watchdog constants. Assert the returned rows include these exact metric names and values:

```javascript
assert.deepEqual(rows.find((r) => r[0] === 'Observed rolling 24h calls'), ['Observed rolling 24h calls', 2]);
assert.deepEqual(rows.find((r) => r[0] === 'Category WEB_SCAN'), ['Category WEB_SCAN', 1]);
assert.deepEqual(rows.find((r) => r[0] === 'Category QUOTA_PROBE'), ['Category QUOTA_PROBE', 1]);
assert.deepEqual(rows.find((r) => r[0] === 'Host api-production-b5bf.up.railway.app'), ['Host api-production-b5bf.up.railway.app', 1]);
assert.deepEqual(rows.find((r) => r[0] === 'Dropped telemetry updates'), ['Dropped telemetry updates', 1]);
assert.deepEqual(rows.find((r) => r[0] === 'Watchdog cadence minutes'), ['Watchdog cadence minutes', 10]);
assert.deepEqual(rows.find((r) => r[0] === 'Watchdog pulse cap'), ['Watchdog pulse cap', 5]);
assert(rows.some((r) => r[0] === 'Scope' && /WCORE project only/.test(r[1])));
assert(rows.some((r) => r[0] === 'Authority' && /not the authoritative Google account quota/.test(r[1])));
```

Extract the diagnostic function source and assert it contains none of `UrlFetchApp`, `_originalUrlFetch`, `.testOnce(`, `.reset(`, `WalletCache.save`, or `ScriptApp.newTrigger`.

- [ ] **Step 2: Run the telemetry test to verify RED**

Run: `rtk node tests/http-counter-atomicity.test.js`

Expected: FAIL because `GET_QUOTA_PROTECTION_STATUS()` does not exist.

- [ ] **Step 3: Implement one read-only diagnostic**

Add `GET_QUOTA_PROTECTION_STATUS()` to `03E_QUOTA_CIRCUIT_BREAKER.gs`. It must return a two-column array with, in order: observed rolling calls; one row per sorted category from `HttpCounter.byTrigger()`; one row per sorted host from `HttpCounter.byHost()`; dropped updates; Google breaker status; Web breaker status from a read-only `_webScanBreakerStatus_()`; watchdog cadence `10`; pulse cap from `WD_MAX_PULSES_PER_RUN`; healthy freshness hours from `WD_STALE_I1_HOURS`; Web error backoff text `30m,2h,6h,24h`; scope `WCORE project only`; authority `Observed counts are not the authoritative Google account quota`.

Implement `_webScanBreakerStatus_()` as a read-only cache parse returning `{ open, openUntil, failures }`. Cache read failure returns `{ open:true, openUntil:0, failures:0, unavailable:true }` to represent fail-closed automatic admission. It must not acquire a long lock, mutate state, clear state, or make HTTP.

Update `DIAG_WEB_SCAN_STATUS()` to append read-only breaker fields and the automatic/manual attempt policy. Keep the network-making function named `LIVE_PROBE_WEB_SCAN_CHAIN` only.

- [ ] **Step 4: Register focused tests in npm**

Add scripts:

```json
"test:quota-protection-web": "node tests/quota-protection-web.test.js",
"test:http-counter-atomicity": "node tests/http-counter-atomicity.test.js"
```

Insert both immediately after `test:web-scan-adapter` in the top-level `test` chain, so `npm test` executes static validation, existing recovery/watchdog/Web tests, both focused guards, and all remaining suites.

- [ ] **Step 5: Run targeted regression tests**

Run: `rtk npm run test:quota-protection-web`

Expected: PASS with `web quota protection OK`.

Run: `rtk npm run test:http-counter-atomicity`

Expected: PASS with `HTTP counter atomicity OK`.

Run: `rtk npm run test:quota-recovery-state`

Expected: PASS with `quota recovery state guard OK`.

Run: `rtk npm run test:watchdog-quota`

Expected: PASS with `watchdog quota guard OK`.

Run: `rtk npm run test:web-scan-adapter`

Expected: PASS with both adapter and engine integration messages.

Run: `rtk npm run test:auto-heal-new-ledgers`

Expected: PASS with `auto-heal new ledgers OK`.

- [ ] **Step 6: Run static validation and the full suite**

Run: `rtk npm run validate:static`

Expected: PASS with no duplicate/missing GAS global function errors after the live-probe renames.

Run: `rtk npm test`

Expected: PASS for static validation, quota recovery, watchdog, listing recap headers, Web adapter, both new focused guards, packed cache, base engine stats, wallet-cache price preservation/expansion, auto-heal, action rebalancing, CEX, market-cap, portfolio, trigger, and fetch-retry suites.

- [ ] **Step 7: Review the final diff and commit diagnostics/test integration only**

Run: `rtk git status --short`

Expected: quota-plan implementation files may be modified; unrelated pre-existing dirty files may also appear and must not be staged.

Run: `rtk git diff -- wcore-gsheet/src/03E_QUOTA_CIRCUIT_BREAKER.gs wcore-gsheet/src/41_GSHEET_WEB_SCAN.gs wcore-gsheet/package.json wcore-gsheet/tests/http-counter-atomicity.test.js wcore-gsheet/tests/quota-protection-web.test.js`

Expected: only read-only diagnostics, npm registration, and focused test refinements not committed in earlier slices.

```bash
rtk git add wcore-gsheet/src/03E_QUOTA_CIRCUIT_BREAKER.gs wcore-gsheet/src/41_GSHEET_WEB_SCAN.gs wcore-gsheet/package.json wcore-gsheet/tests/http-counter-atomicity.test.js wcore-gsheet/tests/quota-protection-web.test.js
rtk git diff --cached --name-only
rtk git commit -m "test(gsheet): cover quota protection policy"
```

Expected staged names: only the five explicitly listed paths. Never stage `graphify-out/`, `.tmp/graphify-input/`, `generated/graphify/`, or unrelated dirty files.

### Task 6: Safe Deployment and No-HTTP Post-Push Verification

**Files:**
- Verify only: `wcore-gsheet/src/00C_CACHE_KEYS.gs`
- Verify only: `wcore-gsheet/src/03E_QUOTA_CIRCUIT_BREAKER.gs`
- Verify only: `wcore-gsheet/src/16_REFRESH.gs`
- Verify only: `wcore-gsheet/src/16B_AUTO_HEAL.gs`
- Verify only: `wcore-gsheet/src/26B_HTTP_SAVINGS.gs`
- Verify only: `wcore-gsheet/src/41_GSHEET_WEB_SCAN.gs`
- Verify only: `wcore-gsheet/package.json`
- Verify only: `wcore-gsheet/tests/quota-protection-web.test.js`
- Verify only: `wcore-gsheet/tests/http-counter-atomicity.test.js`
- Verify only: `wcore-gsheet/tests/quota-recovery-state.test.js`
- Verify only: `wcore-gsheet/tests/watchdog-quota-guard.test.js`
- Verify only: `wcore-gsheet/tests/web-scan-adapter.test.js`
- Verify only: `wcore-gsheet/tests/auto-heal-new-ledgers.test.js`

- [ ] **Step 1: Confirm commits contain only intended quota files**

Run: `rtk git status --short`

Expected: no uncommitted changes in the listed quota implementation/test files. Unrelated dirty files may remain and must not be modified, staged, or cleaned.

Run: `rtk git log --oneline -10`

Expected: the quota commits from Tasks 1-5 are visible.

Run: `rtk git diff HEAD~5..HEAD --name-only`

Expected: only the source, tests, and `package.json` listed in Tasks 1-5; no Graphify or unrelated path. If the branch had a different number of new quota commits, use the first quota commit's parent instead of `HEAD~5` and inspect the same bounded name list.

- [ ] **Step 2: Re-run release verification immediately before push**

Run: `rtk npm test` from `wcore-gsheet`.

Expected: PASS for the complete suite with no failures.

Run: `rtk npm run validate:static` from `wcore-gsheet`.

Expected: PASS with no static GAS validation errors.

- [ ] **Step 3: Deploy through the repository safety wrapper**

Run: `rtk powershell -File safe-push.ps1` from `wcore-gsheet`.

Expected: backup, remote pull/merge, validation, and clasp push complete successfully; `safe-push.ps1` restores its temporary state. Do not use direct `clasp push`.

- [ ] **Step 4: Reinstall the changed trigger schedule once**

Run `WCORE_AUTO_HEAL_FORCE()` once from the Apps Script editor under the authorized WCORE account. This is trigger/sheet administration only and must not call `LIVE_PROBE_QUOTA_NOW`, `LIVE_PROBE_WEB_SCAN_CHAIN`, `_webScanWallet_`, or any forced wallet refresh.

Expected return rows include `Triggers | REINSTALLED` with the `watchdog10` trigger spec. If authorization is requested, authorize trigger management and spreadsheet access; do not authorize or launch a quota probe.

- [ ] **Step 5: Verify trigger inventory without HTTP**

Run `WCORE_AUTO_HEAL_STATUS()` from the Apps Script editor or inspect its output in the existing diagnostic sheet cell.

Expected: `WATCHDOG_FROM_RECAP = 1`, trigger spec contains `watchdog10`, and no five-minute watchdog trigger remains. Confirm in Apps Script Triggers UI that `WATCHDOG_FROM_RECAP` is scheduled every 10 minutes.

- [ ] **Step 6: Verify read-only diagnostics without probing quota**

Evaluate `GET_QUOTA_PROTECTION_STATUS()` in a scratch cell or from the editor and inspect its returned/logged rows.

Expected: rolling observed calls, `WEB_SCAN`/`QUOTA_PROBE` categories, WCORE API host when previously observed, dropped updates, Web breaker state, watchdog `10` minutes/`5` pulses/`5` healthy hours, and both project-only/non-authoritative disclaimers. The function makes zero network calls and does not reset either breaker.

Do not run `LIVE_PROBE_QUOTA_NOW()`, `LIVE_PROBE_WEB_SCAN_CHAIN()`, `TEST_QUOTA_NOW()`, `DIAG_RUN_WATCHDOG_SHEETS_API_FALLBACK()`, a force-full refresh, or any command that invokes `_originalUrlFetch` while Google reports exhausted UrlFetch quota.

- [ ] **Step 7: Verify cached portfolio behavior without HTTP**

Read existing spreadsheet values through the Google Sheets API/service-account path, not Apps Script refresh functions:

```powershell
rtk node -e "const {JWT}=require('google-auth-library');const k=require('C:/Users/strau/.config/gsheets-mcp/service-account.json');const c=new JWT({email:k.client_email,key:k.private_key,scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});(async()=>{await c.authorize();for(const r of ['Recap Portfolio!A1:G10','Portefeuille Crypto!A1:B10']){const x=await c.request({url:'https://sheets.googleapis.com/v4/spreadsheets/1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4/values/'+encodeURIComponent(r)});console.log(r,JSON.stringify(x.data.values||[]));}})().catch(e=>{console.error(e.message);process.exit(1)})"
```

Expected: existing cached portfolio rows remain populated; no new `[WEB_SCAN_ERROR]` storm appears; `[BLOCKED:QUOTA]`, `[CACHE_ONLY]`, or `[WEB_SCAN_DEFERRED] N/A` may remain visible according to existing state. This command calls only the Sheets API with the service account and does not consume the Apps Script account's UrlFetch quota.

- [ ] **Step 8: Confirm repository state after deployment**

Run: `rtk git status --short`

Expected: no new tracked modifications from deployment. Preserve all unrelated pre-existing dirty changes exactly as found; do not stage, reset, clean, or commit them. No Graphify file has been read, generated, modified, staged, or deployed by this plan.

---

### Spec Coverage Self-Review

- [ ] **Objective and traffic policy:** Tasks 2-3 enforce one automatic Web attempt, two force attempts only for transient outcomes, ten-minute cadence, five total B1 pulses, and unchanged five-hour healthy freshness.
- [ ] **Duplicate suppression and failure behavior:** Task 1 uses canonical address-safe keys, a 120-second lease, short `UserLock`, cache/deferred results, fail-closed automatic admission, force admission bypass, and no cache overwrite on defer/failure.
- [ ] **Web API breaker:** Task 2 opens after three transient network/408/425/429/5xx scan outcomes in five minutes, remains open 30 minutes, clears on success, excludes permanent 4xx and Google quota, and keeps force behind `QuotaCircuitBreaker`.
- [ ] **Watchdog backoff and recovery:** Task 3 implements 30m/2h/6h/24h per-sheet retries, bounded/pruned state, health clearing, no deferred loop, no normal quota pulse, and leaves recovery combined/deduplicated/sequential under existing regression coverage.
- [ ] **Atomic telemetry and attribution:** Task 4 reloads fresh state under `UserLock`, never uses the watchdog-held `ScriptLock`, retains dropped updates, supports explicit/approximate categories, records WCORE API host, and attributes probes as `QUOTA_PROBE`.
- [ ] **Diagnostics:** Task 5 reports rolling calls/categories/hosts/drops/breakers/watchdog policy with project-only and non-authoritative disclaimers; all non-`LIVE_PROBE` diagnostics are read-only and network-free.
- [ ] **Cache keys:** Task 1 adds all four canonical bounded keys and hashes wallet identity before key construction or logging.
- [ ] **Testing:** Tasks 1-5 cover concurrency, contention, attempts, breaker classification/open/reset, quota precedence, watchdog cadence/cap/backoff, atomic increments, explicit attribution, static validation, existing suites, and full `npm test`.
- [ ] **Deployment:** Task 6 limits commits to intended files, uses `safe-push.ps1`, forces auto-heal reinstall once, verifies ten-minute inventory/diagnostics/cache through no-HTTP paths, and forbids live probes while quota is exhausted.
- [ ] **Out of scope:** No Railway queue migration, cross-project quota accounting, five-hour freshness change, licensing/quota increase, Graphify operation, source restructuring, or chain-specific engine hack is included.
