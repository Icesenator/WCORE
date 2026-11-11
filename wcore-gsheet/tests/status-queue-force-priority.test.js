const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const candidate = process.env.WCORE_STATUS_CANDIDATE || path.resolve(__dirname, '../src');
const readSource = file => fs.readFileSync(path.join(candidate, process.env.WCORE_STATUS_CANDIDATE ? file : file.replace(/\.js$/, '.gs')), 'utf8');
function harness() {
  const store = new Map();
  const clock = { now: 1800000000000 };
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [clock.now])); } static now() { return clock.now; } }
  const calls = [];
  const c = { Date: Clock, CacheService: { getScriptCache: () => ({ get: k => store.get(k) || null, put: (k, v) => store.set(k, v), remove: k => store.delete(k) }) }, LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) }, GSHEET_WEB_SCAN_LOCK_WAIT_MS: 1, _webScanProp_: () => '', _webScanEnabled_: () => true, _webScanChainKey_: x => x.CHAIN.NAME, _webScanForce_: x => x === true, _webScanTokenList_: x => x, _webScanSetLastError_: () => {}, ChainFactory: { getRegistry: () => ({ E: { getRefreshStatus: a => { calls.push(a); return 'WEB_SCAN_OK real-cache'; } } }) } };
  vm.createContext(c); vm.runInContext(readSource('41A_WEB_SCAN_QUEUE.js'), c);
  const add = (a, d, force = false) => c._webScanQueueEnqueue_(a, [], force, { CHAIN: { NAME: 'E' } }, force ? 'FORCE' : 'AUTO', d);
  const drain = (n = 3) => c._webScanQueueDrain_({ maxItems: n, budgetMs: 240000 });
  return { c, clock, calls, add, drain, queue: () => c._webScanQueueRead_() };
}

test('file pleine de demandes AUTO anciennes : une demande forcée sur un onglet récent est admise et servie en premier', () => {
  const h = harness();
  for (let i = 0; i < 40; i++) assert.equal(h.add('auto' + i, h.clock.now - 86400000).ok, true);
  assert.equal(h.queue().length, 40);
  const forced = h.add('elysium', h.clock.now - 5400000, true);
  assert.equal(forced.ok, true, JSON.stringify(forced));
  assert.ok(forced.evicted, 'une entrée AUTO cède sa place');
  assert.equal(h.queue().length, 40);
  h.drain(1);
  assert.equal(h.calls[0], 'elysium');
});

test('sans demande forcée, une AUTO récente reste reportée devant une file d anciennes AUTO', () => {
  const h = harness();
  for (let i = 0; i < 40; i++) h.add('auto' + i, h.clock.now - 86400000);
  const r = h.add('recent', h.clock.now - 5400000);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'QUEUE_DEFERRED');
});

test('une demande forcée n évince jamais une autre demande forcée plus prioritaire', () => {
  const h = harness();
  for (let i = 0; i < 40; i++) h.add('forced' + i, h.clock.now - 86400000, true);
  const r = h.add('late', h.clock.now - 5400000, true);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'QUEUE_DEFERRED');
});

test('la règle anti-famine reste prioritaire sur une demande forcée', () => {
  const h = harness();
  h.add('starving', h.clock.now - 86400000);
  h.clock.now += 7 * 3600 * 1000;
  h.add('forced', h.clock.now - 60000, true);
  h.drain(1);
  assert.equal(h.calls[0], 'starving');
});
