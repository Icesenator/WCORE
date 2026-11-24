// 24/11/2026 (P1-REL-BL1-NATIVE-PRICE-STALE-20261121, defaut confirme par Codex) : un scan force
// (C1=TRUE) prouve OK n'etait jamais acquitte. Sa revision inclut B1, le watchdog re-pulsait B1
// (ou s'abstenait), et l'onglet restait [REFRESH_QUEUED]. Correctif v4.16.100 : B1 transmis a
// l'enfilement, declencheur normalise, re-signature du recu par le watchdog pour son propre pulse.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..', 'src');
const pad = n => String(n).padStart(2, '0');
const fmt = ms => { const d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()); };

const parisFmt = ms => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(ms)).replace('T', ' ');
function harness(opts = {}) {
  const clock = { now: Date.UTC(2026, 10, 24, 8, 0, 0) };
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [clock.now])); } static now() { return clock.now; } }
  const store = new Map();
  const c = { Date: Clock, Math, JSON, Object, Array, String, Number, isFinite,
    CacheService: { getScriptCache: () => ({ get: k => store.get(k) || null, put: (k, v) => store.set(k, v), remove: k => store.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { parseDate: s => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16), +s.slice(17, 19))) },
    Session: { getScriptTimeZone: () => opts.paris ? 'Europe/Paris' : 'UTC' }, Format: { datetime: x => (opts.paris ? parisFmt : fmt)(Number(x)) },
    _webScanProp_: () => '', _webScanEnabled_: () => true,
    _webScanChainKey_: cfg => cfg.CHAIN.NAME, _webScanForce_: x => x === true, _webScanTokenList_: x => x || [] };
  c.cacheMs = clock.now - 7 * 3600000;
  c.scans = 0;
  c.ChainFactory = { getRegistry: () => ({ E: { getRefreshStatus: () => {
    c.scans++;
    const before = c.cacheMs; clock.now += 20000; c.cacheMs = Math.floor(clock.now / 1000) * 1000;
    c._WCORE_WEB_SCAN_QUEUE_PROOF = { before, stamp: c.cacheMs, advanced: true };
    return c.outcome || ('WEB_SCAN_OK ' + fmt(c.cacheMs)); } } }) };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(root, '41A_WEB_SCAN_QUEUE.gs'), 'utf8'), c);
  const cfg = { CHAIN: { NAME: 'E' } };
  // Evaluation de I1 dans l'ordre de 11_EVM_ENGINE : ACK, puis enfilement avec le meme B1.
  const cell = (trig, force = true, tokens = []) => {
    if (c._webScanQueueAck_('x', tokens, force, cfg, trig, c.cacheMs)) return 'WEB_SCAN_OK';
    const r = c._webScanQueueEnqueue_('x', tokens, force, cfg, force ? 'MANUAL' : 'AUTO', c.cacheMs, trig);
    return r.ok ? 'QUEUED' : r.reason;
  };
  const drain = () => c._webScanQueueDrain_({ maxItems: 8, budgetMs: 180000 });
  return { c, clock, cell, drain, id: 'E|x' };
}

test('scan force prouve OK : acquitte au pulse du watchdog, une seule fois', () => {
  const h = harness();
  const userB1 = fmt(h.clock.now);
  assert.equal(h.cell(userB1), 'QUEUED');
  h.clock.now += 60000;
  assert.equal(h.drain().results[0].outcome, 'OK');
  const wdB1 = fmt(h.clock.now);
  // Sans re-signature, le pulse du watchdog serait une nouvelle demande forcee (le defaut).
  assert.equal(h.c._webScanQueueAck_('x', [], true, { CHAIN: { NAME: 'E' } }, wdB1, h.c.cacheMs), false);
  assert.equal(h.c._webScanQueueResignForcePulse_(h.id, wdB1, userB1), true);
  assert.equal(h.cell(wdB1), 'WEB_SCAN_OK');
  // Recalcul naturel au meme B1 : toujours acquitte, aucun nouveau scan.
  assert.equal(h.cell(wdB1), 'WEB_SCAN_OK');
  assert.equal(h.drain().reason, 'IDLE');
  assert.equal(h.c.scans, 1);
});

test('B1 lu comme une Date par la fonction personnalisee : meme revision', () => {
  const h = harness();
  const userB1 = fmt(h.clock.now);
  h.cell(userB1); h.clock.now += 60000; h.drain();
  const wdMs = Math.floor(h.clock.now / 1000) * 1000;
  assert.equal(h.c._webScanQueueResignForcePulse_(h.id, fmt(wdMs), userB1), true);
  assert.equal(h.cell(new Date(wdMs)), 'WEB_SCAN_OK');
});

test("un nouveau B1 de l'utilisateur avec C1 coche relance un scan force", () => {
  const h = harness();
  const userB1 = fmt(h.clock.now);
  h.cell(userB1); h.clock.now += 60000; h.drain();
  const wdB1 = fmt(h.clock.now);
  assert.equal(h.c._webScanQueueResignForcePulse_(h.id, wdB1, userB1), true);
  assert.equal(h.cell(wdB1), 'WEB_SCAN_OK');
  h.clock.now += 5 * 60000;
  assert.equal(h.cell(fmt(h.clock.now)), 'QUEUED');
  h.clock.now += 60000; h.drain();
  assert.equal(h.c.scans, 2);
});

test('re-signature refusee : demande en file, recu non OK, recu expire, declencheur vide', () => {
  const h = harness();
  const userB1 = fmt(h.clock.now);
  h.cell(userB1); h.clock.now += 60000; h.drain();
  // Nouvelle demande de l'utilisateur deja en file : le watchdog ne l'ecrase pas.
  h.clock.now += 60000; assert.equal(h.cell(fmt(h.clock.now)), 'QUEUED');
  assert.equal(h.c._webScanQueueResignForcePulse_(h.id, fmt(h.clock.now + 1000), userB1), false);
  assert.equal(h.c._webScanQueueResignForcePulse_(h.id, '', userB1), false);

  const d = harness();
  d.c.outcome = 'WEB_SCAN_DEGRADED';
  const dB1 = fmt(d.clock.now);
  d.cell(dB1); d.clock.now += 60000;
  assert.equal(d.drain().results[0].outcome, 'DEGRADED');
  assert.equal(d.c._webScanQueueResignForcePulse_(d.id, fmt(d.clock.now), dB1), false);

  const e = harness();
  const eB1 = fmt(e.clock.now);
  e.cell(eB1); e.clock.now += 60000; e.drain();
  e.clock.now += 46 * 60000; // fenetre d'ACK (45 min) depassee
  assert.equal(e.c._webScanQueueResignForcePulse_(e.id, fmt(e.clock.now), eB1), false);
});

test('revision perimee refusee apres re-signature : autres jetons, ancien B1, mode non force', () => {
  const h = harness();
  const userB1 = fmt(h.clock.now);
  h.cell(userB1); h.clock.now += 60000; h.drain();
  const wdB1 = fmt(h.clock.now);
  assert.equal(h.c._webScanQueueResignForcePulse_(h.id, wdB1, userB1), true);
  const cfg = { CHAIN: { NAME: 'E' } };
  assert.equal(h.c._webScanQueueAck_('x', ['0xtok'], true, cfg, wdB1, h.c.cacheMs), false);
  assert.equal(h.c._webScanQueueAck_('x', [], true, cfg, userB1, h.c.cacheMs), false);
  assert.equal(h.c._webScanQueueAck_('x', [], false, cfg, wdB1, h.c.cacheMs), false);
  assert.equal(h.c._webScanQueueAck_('x', [], true, cfg, wdB1, h.c.cacheMs - 1000), false);
});

test('revision non forcee inchangee : le declencheur reste hors revision', () => {
  const h = harness();
  assert.equal(h.c._webScanQueueRevision_([], 0, '2026-11-24 08:00:00'), JSON.stringify([[], 0, '']));
  assert.equal(h.c._webScanQueueRevision_([], 1, new Date(Date.UTC(2026, 10, 24, 8, 0, 0))), JSON.stringify([[], 1, '2026-11-24 08:00:00']));
  assert.equal(h.c._webScanQueueRevision_([], 1, 'FALSE'), JSON.stringify([[], 1, '']));
});

test('chaine complete : drain force, watchdog (pulse re-signe), recalcul de I1 acquitte', () => {
  const h = harness();
  const userB1 = fmt(h.clock.now);
  assert.equal(h.cell(userB1), 'QUEUED');
  h.clock.now += 60000;
  const results = h.drain().results;
  const writes = [];
  const b1 = { Wallet: userB1, Other: userB1 };
  const ss = { getId: () => 'test-sheet', getSheetByName: name => ({ getRange: range => ({ getValue: () => b1[name], setValue: value => { b1[name] = value; writes.push({ name, range, value }); } }) }) };
  Object.assign(h.c, {
    _wd_norm_: v => String(v).trim(), _wd_isCexSheet_: () => false,
    Sheets: { Spreadsheets: { Values: { batchGet: () => ({ valueRanges: [
      { values: [['=E_REFRESH_STATUS("x";A3:A;C1;B1)']] }, { values: [['=E_REFRESH_STATUS("y";A3:A;C1;B1)']] }] }) } } }
  });
  const src = fs.readFileSync(path.join(root, '16_REFRESH.gs'), 'utf8');
  for (const n of ['_wd_ackPulseProven_', '_wd_ackPulseTargets_', '_wd_ackPulseForceTargets_', '_wd_ackPulseDrained_']) {
    const s = src.indexOf('function ' + n + '(');
    vm.runInContext(src.slice(s, src.indexOf('\n}', s) + 2), h.c);
  }
  const wdB1 = fmt(h.clock.now);
  const out = h.c._wd_ackPulseDrained_(ss, results, [{ name: 'Wallet', vC1: 'TRUE' }, { name: 'Other', vC1: 'TRUE' }], wdB1, h.clock.now + 60000);
  assert.equal(out.pulsed, 0);
  assert.equal(out.forceTargets, 1);
  assert.equal(out.forcePulsed, 1);
  assert.deepEqual(writes, [{ name: 'Wallet', range: 'B1', value: wdB1 }]);
  assert.equal(h.cell(wdB1), 'WEB_SCAN_OK');
  // Un second passage du watchdog sans nouveau drain n'ecrit rien.
  writes.length = 0;
  h.c._wd_ackPulseDrained_(ss, [], [{ name: 'Wallet', vC1: 'TRUE' }], fmt(h.clock.now + 60000), h.clock.now + 120000);
  assert.equal(writes.length, 0);
  assert.equal(h.c.scans, 1);
});

test('watchdog : cibles forcees seulement pour C1 coche et un scan OK prouve', () => {
  const src = fs.readFileSync(path.join(root, '16_REFRESH.gs'), 'utf8');
  const c = { _wd_norm_: v => String(v).trim(), _webScanQueueOpaque_: id => 'o:' + id };
  vm.createContext(c);
  for (const n of ['_wd_ackPulseProven_', '_wd_ackPulseTargets_', '_wd_ackPulseForceTargets_']) {
    const s = src.indexOf('function ' + n + '(');
    assert.ok(s >= 0, n);
    vm.runInContext(src.slice(s, src.indexOf('\n}', s) + 2), c);
  }
  const row = (name, vC1) => ({ name, vC1, formula: '=E_REFRESH_STATUS("0xA";A3:A;C1;B1)' });
  const res = (outcome, written = true) => ({ source: 'o:E|0xa', outcome, cacheWriteReread: written, queueCommitted: true });
  assert.deepEqual(JSON.parse(JSON.stringify(c._wd_ackPulseForceTargets_([res('OK')], [row('T', 'TRUE')]))), [{ name: 'T', id: 'E|0xa' }]);
  assert.equal(c._wd_ackPulseForceTargets_([res('DEGRADED')], [row('T', 'TRUE')]).length, 0);
  assert.equal(c._wd_ackPulseForceTargets_([res('OK', false)], [row('T', 'TRUE')]).length, 0);
  assert.equal(c._wd_ackPulseForceTargets_([res('OK')], [row('T', 'FALSE')]).length, 0);
  // Le passage normal continue d'exclure les lignes C1 cochees.
  assert.equal(c._wd_ackPulseTargets_([res('OK')], [row('T', 'TRUE')]).length, 0);
});

test("pulse de l'utilisateur apres le drain, recalcul pas encore fait : jamais ecrase ni acquitte", () => {
  const h = harness();
  const userB1 = fmt(h.clock.now);
  h.cell(userB1); h.clock.now += 60000; h.drain();
  h.clock.now += 1000;
  const userB2 = fmt(h.clock.now); // saisi dans B1, I1 pas encore recalcule (file vide)
  const wdB1 = fmt(h.clock.now + 1000);
  assert.equal(h.c._webScanQueueResignForcePulse_(h.id, wdB1, userB2), false);
  assert.equal(h.cell(userB2), 'QUEUED', 'la demande de l utilisateur doit donner un nouveau scan');
  h.clock.now += 60000; h.drain();
  assert.equal(h.c.scans, 2);
});

test('fuseau Europe/Paris : B1 en Date (cellule datee) et pulse texte du watchdog concordent', () => {
  const h = harness({ paris: true });
  const userMs = Math.floor(h.clock.now / 1000) * 1000;
  assert.equal(h.cell(new Date(userMs)), 'QUEUED');
  h.clock.now += 60000; h.drain();
  const wdMs = Math.floor(h.clock.now / 1000) * 1000;
  const wdB1 = parisFmt(wdMs); // Utilities.formatDate(new Date(), "Europe/Paris", ...)
  assert.notEqual(wdB1, fmt(wdMs), 'le test doit bien differer de UTC');
  assert.equal(h.c._webScanQueueResignForcePulse_(h.id, wdB1, new Date(userMs)), true);
  assert.equal(h.cell(new Date(wdMs)), 'WEB_SCAN_OK');
});