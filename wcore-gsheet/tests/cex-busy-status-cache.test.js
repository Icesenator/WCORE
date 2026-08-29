const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourceFiles = [
  'src/01_INIT.gs',
  'src/02_UTILS.gs',
  'src/03_HTTP.gs',
  'src/04A_CACHE_CORE.gs',
  'src/04B_CACHE_WALLET.gs',
  'src/04C_CACHE_GLOBAL.gs',
  'src/05_RPC.gs',
  'src/06_TOKENS.gs',
  'src/07_PRICES.gs',
  'src/08_ASSETS.gs',
  'src/10A_BASE_ENGINE.gs',
].map(f => path.join(__dirname, '..', f));

const source = sourceFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');

  function makeMockWalletCache(assets, updatedAt) {
  return { assets: assets || [], updatedAt: updatedAt != null ? updatedAt : null };
}

function runTest(name, busyUntilMs, mockCache, expectedResult) {
  const propsStore = {};
  propsStore['CEX_MANUAL_ACTIVE_UNTIL_MS'] = busyUntilMs ? String(busyUntilMs) : '';

  const context = {
    console,
    Logger: { log() {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => propsStore[key] || null,
        setProperty() {},
        deleteProperty() {}
      })
    },
    CacheService: { getScriptCache: () => ({ get() {}, put() {}, remove() {} }) },
    LockService: { getScriptLock: () => null },
    Utilities: { sleep() {}, formatDate() { return 'mock-date'; }, base64Encode() { return ''; }, computeDigest() { return []; } },
    Session: { getActiveUserLocale: () => 'fr', getScriptTimeZone: () => 'Europe/Paris' },
    ScriptApp: { newTrigger() { return { create() {} }; }, Script: { newId() { return 'mock-id'; } } },
    SpreadsheetApp: { getActiveSpreadsheet: () => null, openById() { return null; } },
  };

  // Mock Format.datetime to mirror real behavior (02_UTILS.gs):
  // invalid/absent ts → "N/A", valid ts → formatted string.
  context.Format = {
    datetime(ts) {
      if (typeof ts !== 'number' || !isFinite(ts) || ts <= 0) return 'N/A';
      return 'formatted-' + ts;
    },
    now() { return 'formatted-now'; }
  };

  vm.createContext(context);

  // Load real source files FIRST (01_INIT, 02_UTILS, ..., 10A_BASE_ENGINE).
  // This defines BaseEngine.cexBusyStatus and the real Format object.
  sourceFiles.forEach(f => {
    try {
      const src = fs.readFileSync(f, 'utf8');
      vm.runInContext(src, context);
    } catch (e) {}
  });

  // Now inject test mocks. These override the real implementations loaded above.
  context.Format = {
    datetime(ts) {
      if (typeof ts !== 'number' || !isFinite(ts) || ts <= 0) return 'N/A';
      return 'formatted-' + ts;
    },
    now() { return 'formatted-now'; }
  };

  let walletCacheLoadCalled = false;
  let walletCacheLoadArgs = [];

  context.CacheManager = {
    init() {}
  };
  context.WalletCache = {
    load(key, unused, config) {
      walletCacheLoadCalled = true;
      walletCacheLoadArgs.push({ key, config });
      return mockCache;
    }
  };

  const result = context.BaseEngine.cexBusyStatus('test-wallet-key', {});

  let pass;
  if (typeof expectedResult === 'function') {
    pass = expectedResult(result);
  } else {
    pass = result === expectedResult;
  }

  if (!pass) {
    console.error('FAIL [' + name + '] expected: ' + JSON.stringify(expectedResult) + ', got: ' + JSON.stringify(result));
    process.exitCode = 1;
  } else {
    console.log('OK   [' + name + '] => ' + JSON.stringify(result));
  }
}

// ─── BUSY absent ───────────────────────────────────────────────────────────────
runTest(
  'BUSY absent → empty string',
  null,  // no CEX_MANUAL_ACTIVE_UNTIL_MS
  null,
  ''  // should return "" when no BUSY flag
);

// ─── BUSY active, no cache → [BUSY:CEX] <now> ─────────────────────────────
runTest(
  'BUSY active + no cache (null) → [BUSY:CEX] <now>',
  Date.now() + 60000,  // BUSY flag active
  null,
  '[BUSY:CEX] formatted-now'
);

// ─── BUSY active, cache with updatedAt but no assets → [BUSY:CEX] <ts> ───────
runTest(
  'BUSY active + cache.updatedAt only → [BUSY:CEX] <ts>',
  Date.now() + 60000,
  makeMockWalletCache(null, Date.now() - 3600000),  // 1h ago, no assets
  (result) => {
    return result.indexOf('[BUSY:CEX]') === 0 && result !== '[BUSY:CEX] N/A' && result.indexOf('N/A') < 0;
  }
);

// ─── BUSY active, cache with assets → [CACHE_ONLY] <ts> (amélioration) ──────
runTest(
  'BUSY active + cache with assets → [CACHE_ONLY] <ts> (new behavior)',
  Date.now() + 60000,
  makeMockWalletCache([{ contract: '0x123', balance: 1.5 }], Date.now() - 3600000),
  (result) => {
    // The new behavior: when wallet has cached assets during BUSY, serve with
    // [CACHE_ONLY] marker so the user sees data instead of [BUSY:CEX] N/A.
    return result.indexOf('[CACHE_ONLY]') === 0;
  }
);

// ─── BUSY active, cache with assets + recent timestamp → [CACHE_ONLY] <ts> ─
runTest(
  'BUSY active + cache with fresh assets → [CACHE_ONLY] <ts>',
  Date.now() + 60000,
  makeMockWalletCache([{ contract: '0x456', balance: 0.5 }], Date.now() - 120000),
  (result) => {
    return result.indexOf('[CACHE_ONLY]') === 0;
  }
);

if (!process.exitCode) {
  console.log('\ncex-busy-status-cache OK');
}
