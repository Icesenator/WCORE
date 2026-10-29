const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = f => fs.readFileSync(process.env.WCORE_STATUS_CANDIDATE
  ? path.join(process.env.WCORE_STATUS_CANDIDATE, f.replace(/\.gs$/, '.js'))
  : path.join(__dirname, '../src', f), 'utf8');

const RealDate = Date;

function harness(opts = {}) {
  const clock = { now: opts.now || 1761200000000 };
  function FakeDate(...args) { return args.length ? new RealDate(...args) : new RealDate(clock.now); }
  FakeDate.now = () => clock.now;
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  FakeDate.prototype = RealDate.prototype;

  const kv = new Map();
  const puts = [];
  const cache = {
    get: k => (kv.has(k) ? kv.get(k) : null),
    put: (k, v) => {
      if (opts.cachePutThrows) throw new Error('cache unavailable');
      puts.push(k); kv.set(k, String(v));
    },
    remove: k => kv.delete(k)
  };
  const props = new Map(Object.entries({
    WCORE_WEB_API_URL: 'https://api.invalid',
    GSHEET_API_TOKEN: 'synthetic-token',
    GSHEET_WEB_SCAN_ENABLED: 'true',
    GSHEET_WEB_SCAN_REQUIRE: 'true',
    ...(opts.queueProp ? { GSHEET_WEB_SCAN_QUEUE: opts.queueProp } : {})
  }));
  const calls = { fetch: 0, scans: [] };
  const ctx = {
    console,
    Date: FakeDate,
    Logger: { log() {} },
    CacheService: { getScriptCache: () => cache },
    LockService: { getScriptLock: () => ({ tryLock: () => opts.lockBusy ? false : true, releaseLock() {} }) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => props.set(k, String(v)),
        deleteProperty: k => props.delete(k)
      })
    },
    ChainFactory: { getRegistry: () => opts.registry || {} },
    Utilities: { sleep() {} },
    Addr: { normalize: x => String(x).toLowerCase() },
    Format: { now: () => 'CURRENT', datetime: x => (typeof x === 'number' ? 'CACHE_TIME:' + x : 'N/A') },
    CacheManager: { init() {} },
    WalletCache: { load: () => opts.cache || null },
    createTimer: () => ({ remaining: () => 18000 }),
    BaseEngine: {
      httpSnapshot: () => 0,
      shouldSkipRefreshForSameTrigger: () => false,
      shouldSkipNoTriggerRecentScan: () => false,
      wrapCacheOnlyMarker: x => '[CACHE_ONLY] ' + x
    },
    _webScanCacheTimestamp_: x => (x && x.updatedAt) || 0
  };
  vm.createContext(ctx);
  vm.runInContext(src('41_GSHEET_WEB_SCAN.gs'), ctx);
  vm.runInContext(src('41A_WEB_SCAN_QUEUE.gs'), ctx);
  vm.runInContext(src('11_EVM_ENGINE.gs'), ctx);
  ctx._webScanWallet_ = (addr, tokens, force) => {
    calls.fetch++;
    calls.scans.push({ addr, tokens, force });
    return opts.scan ? opts.scan(addr, tokens, force) : { ok: true, status: 'WEB_SCAN_OK ' + 'CACHE_TIME' };
  };

  const run = (forceFull = false, trigger = null) => ctx.EvmEngine.getRefreshStatus(
    'synthetic-wallet', null, [], forceFull, trigger, { CHAIN: { NAME: 'ETHEREUM' } }, {});
  const queue = () => ctx._webScanQueueRead_();
  return { ctx, clock, kv, calls, run, queue, props };
}

test('queue enabled: status returns a queued marker without starting a fetch', () => {
  const h = harness({ cache: { updatedAt: 1700000000000 } });
  const status = h.run(false, new Date(1700000000000).toISOString());
  assert.equal(h.calls.fetch, 0);
  assert.match(status, /^\[REFRESH_QUEUED\]/);
  assert.equal(status, '[REFRESH_QUEUED] CACHE_TIME:1700000000000');
  assert.equal(h.queue().length, 1);
  assert.equal(h.queue()[0].c, 'ETHEREUM');
});

test('queued marker never substitutes the current time for a missing cache date', () => {
  const h = harness({ cache: null });
  const status = h.run(false, null);
  assert.match(status, /AGE_UNKNOWN/);
  assert.doesNotMatch(status, /CURRENT/);
});

test('duplicate requests dedup per chain+wallet and escalate a manual force', () => {
  const h = harness({ cache: { updatedAt: 1700000000000 } });
  h.run(false, new Date(1700000000000).toISOString());
  h.run(false, new Date(1700000000000).toISOString());
  assert.equal(h.queue().length, 1);
  assert.equal(h.queue()[0].f, 0);
  h.run(true, new Date(1700000000000).toISOString());
  assert.equal(h.queue().length, 1);
  assert.equal(h.queue()[0].f, 1);
});

test('a full queue refuses new work without evicting pending entries', () => {
  const h = harness({ cache: { updatedAt: 1700000000000 } });
  for (let i = 0; i < h.ctx.GSHEET_WEB_SCAN_QUEUE_MAX_ITEMS; i++) {
    const res = h.ctx._webScanQueueEnqueue_('wallet-' + i, [], false, { CHAIN: { NAME: 'ETHEREUM' } }, 'AUTO');
    assert.equal(res.ok, true, 'entry ' + i);
  }
  const refused = h.ctx._webScanQueueEnqueue_('wallet-overflow', [], false, { CHAIN: { NAME: 'ETHEREUM' } }, 'AUTO');
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'QUEUE_DEFERRED');
  assert.equal(h.queue().length, h.ctx.GSHEET_WEB_SCAN_QUEUE_MAX_ITEMS);
});

test('status surfaces a queue failure instead of falling back to the unbounded fetch', () => {
  const h = harness({ cache: { updatedAt: 1700000000000 }, cachePutThrows: true });
  const status = h.run(false, null);
  assert.match(status, /^\[REFRESH_QUEUE_ERROR\]/);
  assert.equal(h.calls.fetch, 0);
});

test('explicit queue opt-out preserves the legacy synchronous path', () => {
  const h = harness({ cache: { updatedAt: 1700000000000 }, queueProp: 'off' });
  const status = h.run(false, null);
  assert.equal(h.calls.fetch, 1);
  assert.match(status, /WEB_SCAN_OK/);
  assert.equal(h.queue().length, 0);
});

test('drain flag keeps the status path synchronous (no recursion into the queue)', () => {
  const h = harness({ cache: { updatedAt: 1700000000000 } });
  h.ctx._WCORE_WEB_SCAN_QUEUE_DRAINING = true;
  h.run(false, null);
  assert.equal(h.calls.fetch, 1);
  assert.equal(h.queue().length, 0);
});

test('drain resolves the chain registry, scans with a null trigger, then clears the entry', () => {
  const scans = [];
  const h = harness({
    cache: { updatedAt: 1700000000000 },
    registry: {
      ETHEREUM: {
        getRefreshStatus: (a, r, t, f, tr) => {
          scans.push({ a, f, tr });
          return 'WEB_SCAN_OK CACHE_TIME';
        }
      }
    }
  });
  h.ctx._webScanQueueEnqueue_('synthetic-wallet', ['0xtoken'], false, { CHAIN: { NAME: 'ETHEREUM' } }, 'AUTO');
  const res = h.ctx._webScanQueueDrain_({ maxItems: 1, budgetMs: 120000 });
  assert.equal(res.ran, true);
  assert.equal(res.results[0].outcome, 'OK');
  assert.deepEqual(scans, [{ a: 'synthetic-wallet', f: false, tr: null }]);
  assert.equal(h.queue().length, 0);
});

test('drain backs off on WEB_SCAN_ERROR then drops after max attempts with a cooldown', () => {
  const h = harness({
    cache: { updatedAt: 1700000000000 },
    registry: { ETHEREUM: { getRefreshStatus: () => '[WEB_SCAN_ERROR] CURRENT' } }
  });
  h.ctx._webScanQueueEnqueue_('synthetic-wallet', [], false, { CHAIN: { NAME: 'ETHEREUM' } }, 'AUTO');
  for (let attempt = 0; attempt < h.ctx.GSHEET_WEB_SCAN_QUEUE_MAX_ATTEMPTS; attempt++) {
    const list = h.queue();
    list.forEach(e => { e.nx = 0; });
    h.ctx._webScanQueueWrite_(list);
    h.clock.now += 1;
    const res = h.ctx._webScanQueueDrain_({ maxItems: 1, budgetMs: 120000 });
    assert.equal(res.results[0].outcome, 'ERROR');
  }
  assert.equal(h.queue().length, 0);
  const refused = h.ctx._webScanQueueEnqueue_('synthetic-wallet', [], false, { CHAIN: { NAME: 'ETHEREUM' } }, 'AUTO');
  assert.equal(refused.reason, 'QUEUE_COOLDOWN');
});

test('drain never starts a second scan once the budget is exhausted', () => {
  const h = harness({
    cache: { updatedAt: 1700000000000 },
    registry: {
      ETHEREUM: {
        getRefreshStatus: () => { h.clock.now += 25000; return 'WEB_SCAN_OK CACHE_TIME'; }
      }
    }
  });
  h.ctx._webScanQueueEnqueue_('wallet-a', [], false, { CHAIN: { NAME: 'ETHEREUM' } }, 'AUTO');
  h.ctx._webScanQueueEnqueue_('wallet-b', [], false, { CHAIN: { NAME: 'ETHEREUM' } }, 'AUTO');
  const res = h.ctx._webScanQueueDrain_({ maxItems: 5, budgetMs: 30000 });
  assert.equal(res.results.length, 1);
  assert.equal(res.reason, 'BUDGET_EXHAUSTED');
  assert.equal(h.queue().length, 1);
});

test('cache eviction never certifies success and a natural recalculation readmits the request', () => {
  const h = harness({ cache: { updatedAt: 1700000000000 } });
  assert.match(h.run(false, null), /^\[REFRESH_QUEUED\]/);
  h.kv.delete(h.ctx.GSHEET_WEB_SCAN_QUEUE_KEY);
  const drained = h.ctx._webScanQueueDrain_({ maxItems: 1, budgetMs: 120000 });
  assert.equal(drained.reason, 'IDLE');
  assert.equal(drained.results.length, 0);
  assert.equal(h.calls.fetch, 0);
  assert.match(h.run(false, null), /^\[REFRESH_QUEUED\]/);
  assert.equal(h.queue().length, 1);
  assert.equal(h.calls.fetch, 0);
});

test('unresolved chain is retried then dropped with the reason recorded', () => {
  const h = harness({ cache: { updatedAt: 1700000000000 }, registry: {} });
  h.ctx._webScanQueueEnqueue_('synthetic-wallet', [], false, { CHAIN: { NAME: 'GHOSTCHAIN' } }, 'AUTO');
  for (let attempt = 0; attempt < h.ctx.GSHEET_WEB_SCAN_QUEUE_MAX_ATTEMPTS; attempt++) {
    const list = h.queue();
    list.forEach(e => { e.nx = 0; });
    h.ctx._webScanQueueWrite_(list);
    h.ctx._webScanQueueDrain_({ maxItems: 1, budgetMs: 120000 });
  }
  assert.equal(h.queue().length, 0);
});
