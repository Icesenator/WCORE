// Importé le 10/11/2026 : restauration de 4.16.86/87/89 (effacés du LIVE le 07/11). Charge le source du dépôt.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const readSource = file => fs.readFileSync(require('node:path').join(__dirname, '..', 'src', file.replace(/\.js$/, '.gs')), 'utf8');
const retryMs = 30 * 60 * 1000;
function harness() {
  const store = new Map();
  const clock = { now: 1800000000000 };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const calls = [];
  const c = {
    Date: Clock,
    CacheService: { getScriptCache: () => ({
      get: key => store.get(key) || null,
      put: (key, value) => store.set(key, value),
      remove: key => store.delete(key)
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    _webScanProp_: () => '', _webScanEnabled_: () => true,
    _webScanChainKey_: config => config.CHAIN.NAME,
    _webScanForce_: value => value === true, _webScanTokenList_: value => value,
    ChainFactory: { getRegistry: () => ({ E: { getRefreshStatus: address => {
      calls.push(address);
      return c.scan(address);
    } } }) }
  };
  vm.createContext(c);
  vm.runInContext(readSource('41A_WEB_SCAN_QUEUE.js'), c);
  const add = (address, stamp = clock.now - 1000) => c._webScanQueueEnqueue_(
    address, [], false, { CHAIN: { NAME: 'E' } }, 'AUTO', stamp);
  const drain = () => c._webScanQueueDrain_({ maxItems: 1, budgetMs: 240000 });
  const scan = (outcome, proven = true) => {
    c.scan = () => {
      if (proven) c._WCORE_WEB_SCAN_QUEUE_PROOF = {
        before: clock.now - 1000, stamp: clock.now, advanced: true
      };
      return 'WEB_SCAN_' + outcome + ' cache';
    };
  };
  return { c, clock, calls, add, drain, scan, queue: () => c._webScanQueueRead_(),
    receipt: () => c._webScanQueueReceipt_('E|x') };
}

test('a. DEGRADED prouvé : réadmission sans rescan avant 30 minutes', () => {
  const h = harness();
  h.scan('DEGRADED');
  assert.equal(h.add('x').ok, true);
  const first = h.drain().results[0];
  assert.equal(first.cacheWriteReread, true);
  assert.equal(first.queueCommitted, true);
  const receipt = h.receipt();
  assert.equal(receipt.l, 'DEGRADED');
  assert.equal(receipt.q, 0);
  assert.equal(receipt.n, 0);
  assert.equal(receipt.nx, h.clock.now + retryMs);
  assert.equal(h.add('x').ok, true);
  assert.equal(h.queue()[0].nx, receipt.nx);
  assert.equal(h.drain().results.length, 0);
  assert.equal(h.calls.length, 1);
  h.clock.now += retryMs - 1;
  assert.equal(h.drain().results.length, 0);
  h.clock.now += 60001;
  assert.equal(h.drain().results.length, 1);
  assert.equal(h.calls.length, 2);
});

test('b. DEGRADED ancien : ancienneté réinitialisée, source fraîche prioritaire', () => {
  const h = harness();
  h.scan('DEGRADED');
  h.add('x');
  const oldQ = h.queue()[0].q;
  h.clock.now += 7 * 3600000;
  assert.equal(h.drain().results[0].cacheWriteReread, true);
  const admittedAt = h.clock.now;
  assert.equal(h.add('x', admittedAt).ok, true);
  const requeued = h.queue()[0];
  h.clock.now += 1000;
  assert.equal(h.add('fresh', h.clock.now - 86400000).ok, true);
  h.clock.now += 31 * 60000;
  h.drain();
  assert.equal(h.calls[1], 'fresh');
  assert.equal(requeued.q, admittedAt);
  assert.notEqual(requeued.q, oldQ);
});

for (const [outcome, proven] of [['DEGRADED', false], ['PRESERVED', false], ['PRESERVED', true]]) {
  test(`c. ${outcome}, preuve=${proven} : réadmission et rescan immédiats inchangés`, () => {
    const h = harness();
    h.scan(outcome, proven);
    h.add('x');
    const q = h.queue()[0].q;
    h.clock.now += 1000;
    assert.equal(h.drain().results[0].cacheWriteReread, proven);
    assert.equal(h.receipt().l, outcome);
    assert.equal(h.receipt().q, q);
    assert.equal(h.receipt().nx, 0);
    assert.equal(h.add('x').ok, true);
    assert.equal(h.drain().results.length, 1);
    assert.equal(h.calls.length, 2);
  });
}

test('d. OK prouvé : NOT_DUE et ACK conservés ; DEGRADED ne donne jamais un ACK', () => {
  const h = harness();
  h.scan('OK');
  h.add('x');
  const q = h.queue()[0].q;
  assert.equal(h.drain().results[0].cacheWriteReread, true);
  const receipt = h.receipt();
  assert.equal(receipt.q, q);
  assert.equal(receipt.nx, h.clock.now + h.c.GSHEET_WEB_SCAN_QUEUE_ACK_WINDOW_MS);
  assert.equal(h.add('x', receipt.s).reason, 'QUEUE_NOT_DUE');
  const ack = () => h.c._webScanQueueAck_('x', [], false, { CHAIN: { NAME: 'E' } }, undefined, receipt.s);
  assert.equal(ack(), true);
  // Keep every ACK condition valid except the outcome, isolating the OK gate.
  h.c._webScanQueueReceipt_('E|x', { ...receipt, l: 'DEGRADED' });
  assert.equal(ack(), false);
  for (const proven of [false, true]) {
    const degraded = harness();
    degraded.scan('DEGRADED', proven);
    degraded.add('x');
    degraded.drain();
    assert.equal(degraded.c._webScanQueueAck_('x', [], false,
      { CHAIN: { NAME: 'E' } }, undefined, degraded.clock.now), false);
  }
});

test('e. watchdog : un résultat DEGRADED prouvé seul pulse le B1 correspondant', () => {
  const h = harness();
  h.scan('DEGRADED');
  h.add('x');
  const results = h.drain().results;
  const writes = [];
  const rows = [{ name: 'Wallet', vC1: 'FALSE' }, { name: 'Other', vC1: 'FALSE' }];
  const ss = {
    getId: () => 'test-sheet',
    getSheetByName: name => ({ getRange: range => ({
      setValue: value => writes.push({ name, range, value })
    }) })
  };
  Object.assign(h.c, {
    _wd_norm_: value => String(value).trim(), _wd_isCexSheet_: () => false,
    Sheets: { Spreadsheets: { Values: { batchGet: (id, options) => {
      assert.equal(id, 'test-sheet');
      assert.equal(options.valueRenderOption, 'FORMULA');
      assert.deepEqual(Array.from(options.ranges), ["'Wallet'!I1", "'Other'!I1"]);
      return { valueRanges: ['x', 'other'].map(address => ({
        values: [[`=E_REFRESH_STATUS("${address}";A3:A;C1;B1)`]]
      })) };
    } } } }
  });
  const src = readSource('16_REFRESH.js');
  for (const name of ['_wd_ackPulseProven_', '_wd_ackPulseTargets_', '_wd_ackPulseDrained_']) {
    const start = src.indexOf('function ' + name + '(');
    if (start < 0) continue;
    const end = src.indexOf('\n}', start);
    assert.ok(end > start);
    vm.runInContext(src.slice(start, end + 2), h.c);
  }
  assert.equal(typeof h.c._wd_ackPulseDrained_, 'function');
  const pulse = h.c._wd_ackPulseDrained_(ss, results, rows, 'pulse-test', h.clock.now + 60000);
  assert.equal(pulse.targets, 1);
  assert.equal(pulse.pulsed, 1);
  assert.equal(pulse.reason, 'OK');
  assert.deepEqual(writes, [{ name: 'Wallet', range: 'B1', value: 'pulse-test' }]);
});
