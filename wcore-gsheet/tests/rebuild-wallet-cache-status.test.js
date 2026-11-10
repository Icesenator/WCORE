// v4.16.92 - REBUILD_WALLET_CACHE reports what the collection really did.
//
// It now collects through getRefreshStatus (queue then filtered API) instead of a direct scan,
// so its report must tell a finished collection from a queued one and from a failure.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', '18_CLEANUP.gs'), 'utf8');

function rebuild(refreshStatus) {
  const calls = [];
  const deleted = [];
  const context = {
    console, Date, JSON, Math, Number, String, Array, Object, RegExp,
    Logger: { log: () => {} },
    Addr: { normalize: (a) => String(a).toLowerCase() },
    CacheManager: { init: () => {} },
    DegradedMode: { resetCircuitBreaker: () => {} },
    PropertiesService: { getScriptProperties: () => ({ deleteProperty: (k) => deleted.push(k) }) },
    _TESTCHAIN: {
      getConfig: () => ({ KEYS: { CACHE_PREFIX: 'WCORE_TEST_' } }),
      getRefreshStatus: (...args) => { calls.push(['refresh', args]); return refreshStatus; },
      getCachedWalletAssets: (wallet) => {
        calls.push(['cached', wallet]);
        // The existing counter looks at column 0 for INFO/META rows (unchanged behaviour).
        return [['chain_name'], ['Test', 'AAA'], ['Test', 'BBB'], ['INFO_TOTAL', '']];
      },
      getWalletAssets: () => { calls.push(['scan']); return []; },
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const out = context.REBUILD_WALLET_CACHE('0xABC', 'testchain');
  return { out: Object.fromEntries(out.map((row) => [row[0], row[1]])), calls, deleted };
}

const cases = [
  ['WEB_SCAN_OK 2026-11-10 22:00:00', 'SUCCESS [OK]'],
  ['2026-11-10 22:00:00', 'SUCCESS [OK]'],
  ['[REFRESH_QUEUED] 2026-11-10 20:03:41', 'PENDING'],
  ['[REFRESH_NOT_DUE] 2026-11-10 20:03:41', 'PENDING'],
  ['[WEB_SCAN_DEFERRED]', 'PENDING'],
  ['[WEB_SCAN_DEGRADED] 2026-11-10 22:00:00', 'PENDING'],
  ['[WEB_SCAN_PRESERVED] 2026-11-10 20:00:00', 'PENDING'],
  ['[WEB_SCAN_ERROR] 2026-11-10 22:00:00', 'ERROR'],
  ['[BLOCKED:QUOTA] 2026-11-10 22:00:00', 'ERROR'],
  ['[REFRESH_QUEUE_ERROR] 2026-11-10 22:00:00', 'ERROR'],
  ['[REFRESH_QUEUE_FULL] 2026-11-10 22:00:00', 'ERROR'],
  ['', 'PENDING'],
];

for (const [status, expected] of cases) {
  const { out, calls, deleted } = rebuild(status);
  assert.strictEqual(out.Status, expected, `status "${status}" must be reported as ${expected}`);
  assert.strictEqual(out.Refresh, status || 'UNKNOWN');
  assert.strictEqual(out['Assets Found'], 2, 'INFO rows are not counted as assets');
  assert.deepStrictEqual(calls[0], ['refresh', ['0xABC', '', '', true, false]], 'a forced refresh is requested first');
  assert.deepStrictEqual(calls.map((c) => c[0]), ['refresh', 'cached'], 'then the cache is read; no direct scan');
  assert.deepStrictEqual(deleted, [], 'the cache is never erased before the collection');
}

console.log('rebuild-wallet-cache-status: OK (' + cases.length + ' statuses)');
