const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const keysSource = fs.readFileSync(path.join(root, 'src/00C_CACHE_KEYS.gs'), 'utf8');
const webSource = fs.readFileSync(path.join(root, 'src/41_GSHEET_WEB_SCAN.gs'), 'utf8');

function balancedBody(source, bodyStart, name) {
  let depth = 0;
  let state = 'code';
  let escaped = false;
  let quote = '';
  let regexClass = false;
  for (let i = bodyStart; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (state === 'line') { if (ch === '\n') state = 'code'; continue; }
    if (state === 'block') { if (ch === '*' && next === '/') { state = 'code'; i++; } continue; }
    if (state === 'string' || state === 'template') {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if ((state === 'string' && ch === quote) || (state === 'template' && ch === '`')) state = 'code';
      continue;
    }
    if (state === 'regex') {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '[') regexClass = true;
      if (ch === ']') regexClass = false;
      if (ch === '/' && !regexClass) state = 'code';
      continue;
    }
    if (ch === '/' && next === '/') { state = 'line'; i++; continue; }
    if (ch === '/' && next === '*') { state = 'block'; i++; continue; }
    if (ch === '"' || ch === "'") { state = 'string'; quote = ch; continue; }
    if (ch === '`') { state = 'template'; continue; }
    if (ch === '/') {
      const before = source.slice(0, i).trimEnd();
      const word = before.match(/([A-Za-z_$][\w$]*)$/);
      const previous = before.charAt(before.length - 1);
      if (!previous || /[([{,:;=!?&|+\-*%^~<>]/.test(previous) || (word && /^(return|case|throw|typeof|instanceof|in|of)$/.test(word[1]))) {
        state = 'regex';
        regexClass = false;
        continue;
      }
    }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return i;
  }
  throw new Error(`${name} body not closed`);
}

function extractFunction(source, name) {
  const match = new RegExp(`\\bfunction\\s+${name}\\s*\\([^)]*\\)\\s*\\{`).exec(source);
  assert(match, `${name} not found`);
  const bodyStart = match.index + match[0].lastIndexOf('{');
  return source.slice(match.index, balancedBody(source, bodyStart, name) + 1);
}

const trickyFunction = 'function compact (x){const a="}";/* { ignored */return /[}]/.test(a)&&x;}function after(){return false;}';
assert.equal(extractFunction(trickyFunction, 'compact'), 'function compact (x){const a="}";/* { ignored */return /[}]/.test(a)&&x;}');

function runtime(shared, options = {}) {
  class FakeDate extends Date {
    static now() { return shared.nowMs; }
  }
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
    get(key) {
      if (!shared.lockHeld && !options.allowUnlockedCacheRead) throw new Error('shared cache read without ScriptLock');
      const entry = shared.cache.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= shared.nowMs) { shared.cache.delete(key); return null; }
      return entry.value;
    },
    put(key, value, ttl) {
      if (!shared.lockHeld) throw new Error('shared cache write without ScriptLock');
      shared.puts.push({ key, value, ttl });
      shared.cache.set(key, { value: String(value), expiresAt: shared.nowMs + ttl * 1000 });
    },
    remove(key) { if (!shared.lockHeld) throw new Error('shared cache remove without ScriptLock'); shared.cache.delete(key); }
  };
  const originalFetch = () => {
    assert.equal(shared.lockHeld, false, 'ScriptLock must be released before HTTP');
    shared.fetches++;
    return options.response ? options.response() : successfulResponse();
  };
  const context = {
    console, Date: FakeDate, JSON, Math, String, Number, Boolean, Array, Object, RegExp,
    encodeURIComponent, isFinite, parseInt,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => Object.prototype.hasOwnProperty.call(props, key) ? props[key] : null,
      setProperty: (key, value) => { assert.equal(shared.lockHeld, false, 'ScriptLock must be released before diagnostics'); props[key] = String(value); },
      getProperties: () => Object.assign({}, props)
    }) },
    CacheService: { getScriptCache: () => cache },
    LockService: {
      getScriptLock: () => { shared.scriptLockRequests++; return lock; },
      getUserLock: () => { shared.userLockRequests++; return lock; }
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: (_algorithm, value) => {
        if (options.digestFails) throw new Error(`digest failed for ${value}`);
        return Array.from(crypto.createHash('sha256').update(String(value)).digest(), (byte) => byte > 127 ? byte - 256 : byte);
      },
      formatDate: () => '2026-07-18 12:00:00',
      sleep() {}
    },
    Session: { getScriptTimeZone: () => 'Europe/Paris' },
    UrlFetchApp: { fetch() { throw new Error('patched fetch must not be selected'); } },
    _originalUrlFetch: originalFetch,
    _httpTelemetryTransport_: () => ({ fetch: originalFetch, explicitTelemetry: true }),
    WalletCache: {
      load: () => { assert.equal(shared.lockHeld, false, 'ScriptLock must be released before wallet cache load'); return options.walletCache || null; },
      save: (_key, value) => { assert.equal(shared.lockHeld, false, 'ScriptLock must be released before wallet cache save'); shared.saved.push(value); },
      getLastUpdateStr: () => '2026-07-18 12:00:00'
    },
    CacheManager: { init() {} },
    Format: { now: () => '2026-07-18 12:00:00', datetime: () => '2026-07-18 12:00:00' },
    QuotaCircuitBreaker: options.quota || { isTripped: () => false, handleError: () => false },
    HttpCounter: { record() {} },
    HttpCallCounter: { increment() {} },
    Logger: { log() {} },
    __props: props
  };
  vm.createContext(context);
  vm.runInContext(keysSource, context);
  vm.runInContext(webSource, context);
  return context;
}

function state() {
  return { cache: new Map(), puts: [], saved: [], fetches: 0, lockAttempts: 0, scriptLockRequests: 0, userLockRequests: 0, lockHeld: false, nowMs: Date.parse('2026-07-18T12:00:00Z') };
}

function breakerState(shared) {
  const entry = shared.cache.get('WSCAN_BREAKER:v1');
  return entry ? JSON.parse(entry.value) : { failures: [], openUntil: 0 };
}

function httpResponse(code, body = '{}') {
  return { getResponseCode: () => code, getContentText: () => body };
}

function successfulResponse() {
  return httpResponse(200, JSON.stringify({
    ok: true,
    native: { symbol: 'ETH', balance: 1, priceEur: 1, valueEur: 1 },
    tokens: [],
    errors: [],
    degraded: false,
    fxRate: 0.9,
    scanMs: 1,
  }));
}

{
  const shared = state();
  shared.cache.set('WSCAN_BREAKER:v1', {
    value: JSON.stringify({ failures: [shared.nowMs - 2, shared.nowMs - 1], openUntil: shared.nowMs + 1000 }),
    expiresAt: shared.nowMs + 2000,
  });
  const ctx = runtime(shared, { allowUnlockedCacheRead: true });
  assert.deepEqual(JSON.parse(JSON.stringify(ctx._webScanBreakerStatus_())), {
    open: true,
    openUntil: shared.nowMs + 1000,
    failures: 2,
  });
  assert.equal(shared.scriptLockRequests, 0, 'read-only breaker status must not acquire ScriptLock');
  assert.equal(shared.userLockRequests, 0, 'read-only breaker status must not acquire UserLock');
  assert.equal(shared.puts.length, 0, 'read-only breaker status must not mutate cache');
  assert.equal(shared.fetches, 0, 'read-only breaker status must not make HTTP calls');
  assert.equal(shared.saved.length, 0, 'read-only breaker status must not save wallet cache');
}

{
  const shared = state();
  const ctx = runtime(shared, { allowUnlockedCacheRead: true });
  ctx.CacheService.getScriptCache = () => { throw new Error('cache unavailable'); };
  assert.deepEqual(JSON.parse(JSON.stringify(ctx._webScanBreakerStatus_())), {
    open: true,
    openUntil: 0,
    failures: 0,
    unavailable: true,
  }, 'cache read failure must report fail-closed automatic admission');
}

{
  const shared = state();
  const ctx = runtime(shared, { allowUnlockedCacheRead: true });
  const rows = JSON.parse(JSON.stringify(ctx.DIAG_WEB_SCAN_STATUS()));
  assert.deepEqual(rows.slice(-6), [
    ['breaker_open', false],
    ['breaker_open_until', 0],
    ['breaker_failures', 0],
    ['breaker_unavailable', false],
    ['automatic_attempts', 1],
    ['manual_attempts', 2],
  ]);
  assert.equal(shared.scriptLockRequests, 0);
  assert.equal(shared.fetches, 0);
}

{
  const shared = state();
  const result = runtime(shared)._webScanWallet_('0xgloballock', [], false, { CHAIN: { KEY: 'BASE' } });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(shared.scriptLockRequests, 2, 'automatic admission and breaker update use ScriptLock');
  assert.equal(shared.userLockRequests, 0, 'shared ScriptCache state must not use UserLock');
}

{
  const ctx = runtime(state());
  assert.equal(ctx.CK_get('webApiFailureState'), 'WSCAN_BREAKER:v1');
}

{
  const ctx = runtime(state());
  const evmLower = '0xabcdef0123456789abcdef0123456789abcdef01';
  const evmMixed = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
  assert.equal(ctx._webScanWalletHash_(evmLower), ctx._webScanWalletHash_(evmMixed), 'canonical EVM case variants must share a lease');
  assert.notEqual(ctx._webScanWalletHash_('EQAbCdEf123TonLike'), ctx._webScanWalletHash_('eqabcdef123tonlike'), 'TON-like case variants must keep separate leases');
  assert.notEqual(ctx._webScanWalletHash_('AbCdEf123SvmLike'), ctx._webScanWalletHash_('abcdef123svmlike'), 'SVM-like case variants must keep separate leases');
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
  const address = '0xabcdef0123456789abcdef0123456789abcdef01';
  const config = { CHAIN: { KEY: 'BASE', NAME: 'Base' } };
  assert.equal(runtime(shared)._webScanWallet_(address, [], false, config).deferred, false);
  assert.equal(runtime(shared)._webScanWallet_(address, [], false, config).deferred, true, 'unexpired lease suppresses a duplicate fetch');
  shared.nowMs += 120001;
  assert.equal(runtime(shared)._webScanWallet_(address, [], false, config).deferred, false, 'expired lease admits a new fetch');
  assert.equal(shared.fetches, 2);
}

{
  const shared = state();
  const wallet = 'CaseSensitiveWalletSecret';
  const ctx = runtime(shared, { digestFails: true });
  const result = ctx._webScanWallet_(wallet, [], false, { CHAIN: { KEY: 'SOLANA' } });
  assert.equal(result.deferred, true);
  assert.equal(ctx.__props.GSHEET_WEB_SCAN_LAST_ERROR, 'WEB_SCAN_ADMISSION_ERROR');
  assert(!ctx.__props.GSHEET_WEB_SCAN_LAST_ERROR.includes(wallet), 'admission diagnostics must not expose the wallet');
  assert(!ctx.__props.GSHEET_WEB_SCAN_LAST_ERROR.includes('secret'), 'admission diagnostics must not expose secrets');
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

{
  const shared = state();
  const ctx = runtime(shared, { response: () => { throw new Error('Address unavailable: WCORE API'); } });
  const result = ctx._webScanWallet_('0xauto', [], false, { CHAIN: { KEY: 'BASE' } });
  assert.equal(shared.fetches, 1, 'automatic scan gets exactly one HTTP attempt');
  assert.equal(result.ok, false);
  assert.equal(result.transient, true);
  assert.equal(breakerState(shared).failures.length, 1);
}

{
  const shared = state();
  const ctx = runtime(shared, { response: () => { throw new Error('Address unavailable: WCORE API'); } });
  const result = ctx._webScanWallet_('0xmanual', [], true, { CHAIN: { KEY: 'BASE' } });
  assert.equal(shared.fetches, 2, 'explicit force scan may retry one transient failure');
  assert.equal(result.transient, true);
  assert.equal(breakerState(shared).failures.length, 1, 'one failed operation records one failure, not one per attempt');
}

{
  const shared = state();
  for (let i = 0; i < 3; i++) {
    runtime(shared, { response: () => { throw new Error('network unavailable'); } })
      ._webScanWallet_(`0xbreaker${i}`, [], false, { CHAIN: { KEY: 'BASE' } });
  }
  const opened = breakerState(shared);
  assert.equal(opened.failures.length, 3);
  assert.equal(opened.openUntil, shared.nowMs + 30 * 60 * 1000, 'third transient opens breaker for 30 minutes');

  const blocked = runtime(shared)._webScanWallet_('0xblocked', [], false, { CHAIN: { KEY: 'BASE' } });
  assert.equal(shared.fetches, 3, 'open breaker suppresses the next automatic HTTP fetch');
  assert.equal(blocked.deferred, true);
  assert.equal(blocked.deferredReason, 'WEB_BREAKER_OPEN');

  shared.nowMs += 30 * 60 * 1000 + 1;
  const afterExpiry = runtime(shared)._webScanWallet_('0xexpired', [], false, { CHAIN: { KEY: 'BASE' } });
  assert.equal(afterExpiry.ok, true, 'breaker expiry permits a new fetch');
  assert.equal(shared.fetches, 4);
}

{
  const shared = state();
  for (let i = 0; i < 2; i++) {
    runtime(shared, { response: () => { throw new Error('network unavailable'); } })
      ._webScanWallet_(`0xresetfail${i}`, [], false, { CHAIN: { KEY: 'BASE' } });
  }
  assert.equal(breakerState(shared).failures.length, 2);
  const success = runtime(shared)._webScanWallet_('0xresetsuccess', [], false, { CHAIN: { KEY: 'BASE' } });
  assert.equal(success.ok, true);
  assert.deepEqual(breakerState(shared), { failures: [], openUntil: 0 }, 'success clears transient failure state');
}

for (const code of [400, 401, 403, 404]) {
  const shared = state();
  const result = runtime(shared, { response: () => httpResponse(code, '{"error":"permanent"}') })
    ._webScanWallet_(`0x${code}`, [], true, { CHAIN: { KEY: 'BASE' } });
  assert.equal(shared.fetches, 1, `HTTP ${code} must not retry`);
  assert.equal(result.transient, false);
  assert.equal(breakerState(shared).failures.length, 0, `HTTP ${code} must not increment the breaker`);
}

for (const code of [408, 425]) {
  const shared = state();
  const result = runtime(shared, { response: () => httpResponse(code, '{"error":"transient"}') })
    ._webScanWallet_(`0xauto${code}`, [], false, { CHAIN: { KEY: 'BASE' } });
  assert.equal(shared.fetches, 1, `automatic HTTP ${code} gets exactly one attempt`);
  assert.equal(result.transient, true, `HTTP ${code} must be transient`);
  assert.equal(breakerState(shared).failures.length, 1, `HTTP ${code} must increment the breaker`);
}

for (const code of [408, 425]) {
  const shared = state();
  const result = runtime(shared, { response: () => httpResponse(code, '{"error":"transient"}') })
    ._webScanWallet_(`0xmanual${code}`, [], true, { CHAIN: { KEY: 'BASE' } });
  assert.equal(shared.fetches, 2, `manual HTTP ${code} may retry once`);
  assert.equal(result.transient, true);
  assert.equal(breakerState(shared).failures.length, 1, `manual HTTP ${code} records one failed operation`);
}

{
  const shared = state();
  const result = runtime(shared, { response: () => httpResponse(503, '{"error":"unavailable"}') })
    ._webScanWallet_('0xauto503', [], false, { CHAIN: { KEY: 'BASE' } });
  assert.equal(shared.fetches, 1, 'automatic HTTP 503 gets exactly one attempt');
  assert.equal(result.transient, true, 'HTTP 503 must be transient');
  assert.equal(breakerState(shared).failures.length, 1, 'HTTP 503 must increment the breaker');
}

{
  const shared = state();
  let attempts = 0;
  const ctx = runtime(shared, {
    response: () => ++attempts === 1 ? httpResponse(503, '{"error":"unavailable"}') : successfulResponse(),
  });
  const result = ctx._webScanWallet_('0xmanualrecovery', [], true, { CHAIN: { KEY: 'BASE' } });
  assert.equal(result.ok, true);
  assert.equal(shared.fetches, 2);
  assert.equal(ctx.__props.GSHEET_WEB_SCAN_LAST_ERROR, '', 'successful retry clears stale transport diagnostics');
}

{
  const shared = state();
  const outcomes = [
    () => httpResponse(429, '{"error":"rate_limited"}'),
    () => httpResponse(500, '{"error":"upstream"}'),
    () => { throw new Error('network unavailable'); },
  ];
  outcomes.forEach((response, index) => {
    runtime(shared, { response })._webScanWallet_(`0xtransient${index}`, [], false, { CHAIN: { KEY: 'BASE' } });
  });
  assert.equal(shared.fetches, 3);
  assert.equal(breakerState(shared).failures.length, 3, '429, 5xx, and network exceptions count as transient');
  assert(breakerState(shared).openUntil > shared.nowMs);
}

{
  const shared = state();
  shared.cache.set('WSCAN_BREAKER:v1', {
    value: JSON.stringify({ failures: [shared.nowMs - 2, shared.nowMs - 1, shared.nowMs], openUntil: shared.nowMs + 30 * 60 * 1000 }),
    expiresAt: shared.nowMs + 35 * 60 * 1000,
  });
  const forced = runtime(shared)._webScanWallet_('0xforcebypass', [], true, { CHAIN: { KEY: 'BASE' } });
  assert.equal(forced.ok, true, 'force may bypass Web breaker admission');
  assert.equal(shared.fetches, 1);
}

for (const mode of ['lock', 'cache']) {
  const shared = state();
  const ctx = runtime(shared, mode === 'lock' ? { lockFails: true } : {});
  if (mode === 'cache') ctx.CacheService.getScriptCache = () => { throw new Error('cache unavailable'); };
  const forced = ctx._webScanWallet_(`0xforce${mode}`, [], true, { CHAIN: { KEY: 'BASE' } });
  assert.equal(forced.ok, true, `force may proceed through Web admission on ${mode} failure`);
  assert.equal(shared.fetches, 1);
}

{
  const shared = state();
  const quota = {
    isTripped: () => shared.fetches >= 1,
    handleError: () => false,
  };
  const result = runtime(shared, {
    quota,
    response: () => { throw new Error('network unavailable'); },
  })._webScanWallet_('0xquotabetweenattempts', [], true, { CHAIN: { KEY: 'BASE' } });
  assert.match(result.status, /^\[BLOCKED:QUOTA\]/, 'quota tripped after attempt one blocks the retry');
  assert.equal(shared.fetches, 1, 'quota re-check prevents a second manual fetch');
  assert.equal(breakerState(shared).failures.length, 0, 'Google quota transition does not increment the Web breaker');
}

{
  const shared = state();
  let handled = 0;
  const quota = {
    isTripped: () => false,
    handleError: (err) => { handled++; return String(err && err.message || err).includes('Service invoked too many times'); },
  };
  const result = runtime(shared, {
    quota,
    response: () => { throw new Error('Service invoked too many times for one day: urlfetch.'); },
  })._webScanWallet_('0xquotaerror', [], false, { CHAIN: { KEY: 'BASE' } });
  assert.match(result.status, /^\[BLOCKED:QUOTA\]/);
  assert.equal(handled, 1);
  assert.equal(breakerState(shared).failures.length, 0, 'Google quota exceptions do not increment the Web breaker');
}

{
  const shared = state();
  const quota = { isTripped: () => true, handleError: () => { throw new Error('must not handle pre-tripped quota'); } };
  const result = runtime(shared, { quota })._webScanWallet_('0xquotaforce', [], true, { CHAIN: { KEY: 'BASE' } });
  assert.match(result.status, /^\[BLOCKED:QUOTA\]/);
  assert.equal(shared.fetches, 0, 'force must never bypass QuotaCircuitBreaker');
  assert.equal(breakerState(shared).failures.length, 0);
}

for (const file of ['11_EVM_ENGINE.gs', '14_SVM_ENGINE.gs', '15_COSMOS_ENGINE.gs', 'TON.gs']) {
  const engine = fs.readFileSync(path.join(root, 'src', file), 'utf8');
  assert(engine.includes('_webScanWallet_('), `${file} must consume the shared Web result`);
  assert(!engine.includes('_webScanDeferredResult_('), `${file} must not duplicate defer logic`);
}
assert.match(webSource, /ok:\s*true[\s\S]*deferred:\s*true[\s\S]*WEB_SCAN_DEFERRED/);

const breakerStatusSource = extractFunction(webSource, '_webScanBreakerStatus_');
const diagStatusSource = extractFunction(webSource, 'DIAG_WEB_SCAN_STATUS');
assert.doesNotMatch(breakerStatusSource + diagStatusSource, /UrlFetchApp|_originalUrlFetch|_webScanWallet_\(|\.put\(|\.remove\(|WalletCache\.save|ScriptApp\.newTrigger/,
  'status diagnostics must remain read-only and network-free');
const networkDiagnosticCallers = Array.from(webSource.matchAll(/\bfunction\s+([A-Z][A-Z0-9_]*)\s*\(/g))
  .map((match) => ({ name: match[1], source: extractFunction(webSource, match[1]) }))
  .filter((entry) => /_webScanWallet_\(/.test(entry.source))
  .map((entry) => entry.name);
assert.deepEqual(networkDiagnosticCallers, ['LIVE_PROBE_WEB_SCAN_CHAIN'], 'only LIVE_PROBE may expose a network-making Web diagnostic');

console.log('web quota protection OK');
