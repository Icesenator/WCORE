// Importé le 10/11/2026 : restauration de 4.16.86/87/89 (effacés du LIVE le 07/11). Charge le source du dépôt.
// Repro: worker ACK must still be visible at the next natural I1 recalculation,
// which happens only on the next B1 pulse (>= WD_PULSE_MIN = 30 min later).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..', 'src');
function pad(n){return String(n).padStart(2,'0');}
function harness() {
  const clock = { now: Date.UTC(2026, 9, 24, 8, 0, 0) };
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [clock.now])); } static now() { return clock.now; } }
  const fmt = ms => { const d = new Date(ms); return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())+' '+pad(d.getUTCHours())+':'+pad(d.getUTCMinutes())+':'+pad(d.getUTCSeconds()); };
  const store = new Map();
  const c = { Date: Clock, Math, JSON,
    CacheService: { getScriptCache: () => ({ get: k => store.get(k) || null, put: (k,v) => store.set(k,v), remove: k => store.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { parseDate: (s) => new Date(Date.UTC(+s.slice(0,4), +s.slice(5,7)-1, +s.slice(8,10), +s.slice(11,13), +s.slice(14,16), +s.slice(17,19))) },
    Session: { getScriptTimeZone: () => 'UTC' }, Format: { datetime: x => fmt(Number(x)) },
    GSHEET_WEB_SCAN_LOCK_WAIT_MS: 1, _webScanProp_: () => '', _webScanEnabled_: () => true,
    _webScanChainKey_: cfg => cfg.CHAIN.NAME, _webScanForce_: x => x === true, _webScanTokenList_: x => x || [] };
  c.cacheMs = clock.now - 7 * 3600000;
  c.ChainFactory = { getRegistry: () => ({ E: { getRefreshStatus: () => {
    const before = c.cacheMs; clock.now += 20000; c.cacheMs = Math.floor(clock.now / 1000) * 1000;
    c._WCORE_WEB_SCAN_QUEUE_PROOF = { before, stamp: c.cacheMs, advanced: true };
    return 'WEB_SCAN_OK ' + fmt(c.cacheMs); } } }) };
  vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(root, '41A_WEB_SCAN_QUEUE.gs'), 'utf8'), c);
  const cfg = { CHAIN: { NAME: 'E' } };
  // Cell evaluation: ACK first, then enqueue (same order as 11_EVM_ENGINE).
  const cell = trig => {
    if (c._webScanQueueAck_('x', [], false, cfg, trig, c.cacheMs)) return 'WEB_SCAN_OK';
    const r = c._webScanQueueEnqueue_('x', [], false, cfg, 'AUTO', c.cacheMs, trig);
    return r.ok ? 'QUEUED' : r.reason;
  };
  const drain = () => c._webScanQueueDrain_({ untilBudget: true, budgetMs: 180000 });
  return { c, clock, cell, drain, fmt };
}
test('ACK visible au pulse naturel suivant (30 min) puis consommé une seule fois', () => {
  const h = harness();
  assert.equal(h.cell(h.fmt(h.clock.now)), 'QUEUED');      // pulse P1
  h.clock.now += 60000; assert.equal(h.drain().results[0].outcome, 'OK');
  h.clock.now += 29 * 60000;                                  // pulse P2, cooldown 30 min
  assert.equal(h.cell(h.fmt(h.clock.now)), 'WEB_SCAN_OK', 'scan réussi jamais vu par la cellule');
  h.clock.now += 30 * 60000;                                  // pulse P3: nouvelle demande
  assert.equal(h.cell(h.fmt(h.clock.now)), 'QUEUED', 'ACK ne doit pas masquer la demande suivante');
});
test('ACK sans nouveau scan expire après la fenêtre de pulse', () => {
  const h = harness();
  h.cell(h.fmt(h.clock.now)); h.clock.now += 60000; h.drain();
  h.clock.now += 3 * 3600000;
  assert.equal(h.cell(h.fmt(h.clock.now)), 'QUEUED');
});
