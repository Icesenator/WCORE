const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
    get(key) {
      if (!shared.lockHeld) throw new Error('cache admission read without UserLock');
      const entry = shared.cache.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= shared.nowMs) { shared.cache.delete(key); return null; }
      return entry.value;
    },
    put(key, value, ttl) {
      if (!shared.lockHeld) throw new Error('cache admission write without UserLock');
      shared.puts.push({ key, value, ttl });
      shared.cache.set(key, { value: String(value), expiresAt: shared.nowMs + ttl * 1000 });
    },
    remove(key) { if (!shared.lockHeld) throw new Error('cache admission remove without UserLock'); shared.cache.delete(key); }
  };
  const context = {
    console, Date, JSON, Math, String, Number, Boolean, Array, Object, RegExp,
    encodeURIComponent, isFinite, parseInt,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => Object.prototype.hasOwnProperty.call(props, key) ? props[key] : null,
      setProperty: (key, value) => { assert.equal(shared.lockHeld, false, 'UserLock must be released before diagnostics'); props[key] = String(value); },
      getProperties: () => Object.assign({}, props)
    }) },
    CacheService: { getScriptCache: () => cache },
    LockService: { getUserLock: () => lock },
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
    _originalUrlFetch() { assert.equal(shared.lockHeld, false, 'UserLock must be released before HTTP'); shared.fetches++; return options.response ? options.response() : { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, native: { symbol: 'ETH', balance: 1, priceEur: 1, valueEur: 1 }, tokens: [], errors: [], degraded: false, fxRate: 0.9, scanMs: 1 }) }; },
    WalletCache: {
      load: () => { assert.equal(shared.lockHeld, false, 'UserLock must be released before wallet cache load'); return options.walletCache || null; },
      save: (_key, value) => { assert.equal(shared.lockHeld, false, 'UserLock must be released before wallet cache save'); shared.saved.push(value); },
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
  return { cache: new Map(), puts: [], saved: [], fetches: 0, lockAttempts: 0, lockHeld: false, nowMs: Date.parse('2026-07-18T12:00:00Z') };
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

for (const file of ['11_EVM_ENGINE.gs', '14_SVM_ENGINE.gs', '15_COSMOS_ENGINE.gs', 'TON.gs']) {
  const engine = fs.readFileSync(path.join(root, 'src', file), 'utf8');
  assert(engine.includes('_webScanWallet_('), `${file} must consume the shared Web result`);
  assert(!engine.includes('_webScanDeferredResult_('), `${file} must not duplicate defer logic`);
}
assert.match(webSource, /ok:\s*true[\s\S]*deferred:\s*true[\s\S]*WEB_SCAN_DEFERRED/);

console.log('web quota protection OK');
