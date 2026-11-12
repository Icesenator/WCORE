// P1-REL-WCORE-IS-SAFE-COUNTER-FAILCLOSED - WCORE_IS_SAFE refuses when the HTTP mode or the
// HTTP counter cannot be read (fail-closed) for normal/activity callers. Published on
// 2026-10-29, erased from the live script by the 2026-11-07 incident, restored on 2026-11-12.
// "RED" cases failed on the fail-open code; "CONTROL" cases pin the refusals and thresholds.
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const test = require('node:test');
const dir = path.join(__dirname, '..', 'src');
const read = name => fs.readFileSync(path.join(dir, name + '.gs'), 'utf8').split(String.fromCharCode(13)).join('');
function fn(text, name) { const a = text.indexOf('function ' + name + '('); assert.ok(a >= 0, name); return text.slice(a, text.indexOf('\n}', a) + 2); }
const INIT = read('01_INIT'), ACT = read('27_ACTIVITY_REFRESH'), REF = read('16_REFRESH');

const ABSENT = Symbol('absent');
const OK_COUNTER =(used = 100, quota = 20000) => ({ getToday: () => used, getQuota: () => quota });
// attested : HttpCounter.isCountValid() du 03E (total fiable obtenu dans l'exécution). Vrai par défaut pour isoler chaque cas.
function ctxWith({ counter = OK_COUNTER(), mode, block = '', attested = true } = {}) {
  const g = { BaseEngine: { detectBlockReason: () => block }, Logger: { log() {} }, HttpCounter: { isCountValid: () => attested } };
  if (counter !== ABSENT) g.HttpCallCounter = counter; // ABSENT explicite : un `undefined` retomberait sur le défaut sain
  if (mode !== undefined) g.WcoreHttpMode = mode;
  const ctx = vm.createContext(g);
  vm.runInContext(fn(INIT, 'WCORE_IS_SAFE') + '\n' + fn(INIT, 'IS_WCORE_SAFE'), ctx);
  return ctx;
}
const boom = () => { throw new Error('storage unavailable'); };
const tests = [];
const red = (n, f) => tests.push(['RED', n, f]);
const control = (n, f) => tests.push(['CONTROL', n, f]);

// Situations d'illisibilité (matrice docs/reference/wcore-is-safe-readonly-resumption-2026-10-28.md)
const UNREADABLE = {
  'getToday lève': { counter: { getToday: boom, getQuota: () => 20000 } },
  'getQuota lève': { counter: { getToday: () => 1, getQuota: boom } },
  'compteur absent': { counter: ABSENT },
  'méthodes absentes': { counter: {} },
  'used=NaN': { counter: OK_COUNTER(NaN) },
  'quota=0': { counter: OK_COUNTER(1, 0) },
  'quota négative': { counter: OK_COUNTER(1, -5) },
  'quota=NaN': { counter: OK_COUNTER(1, NaN) },
  'getEffectiveMode lève': { mode: { getMode: () => 'NORMAL', getEffectiveMode: boom, isAllowed: () => true } },
  'isAllowed lève': { mode: { getMode: () => 'NORMAL', getEffectiveMode: () => 'NORMAL', isAllowed: boom } },
};

// --- Appelant normal : IS_WCORE_SAFE() (01_INIT:667-669) ---
for (const [n, opt] of Object.entries(UNREADABLE)) {
  red('normal : ' + n + ' ⇒ refus', () => {
    const c = ctxWith(opt);
    assert.equal(c.WCORE_IS_SAFE('normal').safe, false);
    assert.notEqual(c.IS_WCORE_SAFE(), 'OK');
  });
}

// --- Appelant activity : _activityWatchdogPhaseCSignals_ (27:2109-2118), vrai WCORE_IS_SAFE injecté ---
function phaseC(opt) {
  const c = ctxWith(opt); let proceeded = false;
  c.ActivityTracker = { getAllTracked: () => { proceeded = true; return []; } };
  vm.runInContext(fn(ACT, '_activityWatchdogPhaseCSignals_'), c);
  c._activityWatchdogPhaseCSignals_();
  return proceeded;
}
for (const [n, opt] of Object.entries(UNREADABLE)) {
  red('activity phase C : ' + n + ' ⇒ ne doit pas collecter', () => {
    assert.equal(phaseC(opt), false, 'phase C a collecté malgré un compteur/mode illisible');
    assert.equal(ctxWith(opt).WCORE_IS_SAFE('activity').safe, false);
  });
}
red('activity phase C : verdict indéterminé (undefined) ⇒ ne doit pas collecter', () => {
  const c = vm.createContext({ Logger: { log() {} }, WCORE_IS_SAFE: () => undefined });
  let proceeded = false; c.ActivityTracker = { getAllTracked: () => { proceeded = true; return []; } };
  vm.runInContext(fn(ACT, '_activityWatchdogPhaseCSignals_'), c); c._activityWatchdogPhaseCSignals_();
  assert.equal(proceeded, false);
});
red('activity ACTIVITY_WATCHDOG (27:2316-2323) : garde fail-closed attendue (statique)', () => {
  const body = fn(ACT, 'ACTIVITY_WATCHDOG');
  const at = body.indexOf('WCORE_IS_SAFE("activity")'); assert.ok(at > 0);
  const guard = body.slice(at, at + 200);
  // Live : `if (safe && safe.safe === false)` laisse passer null/undefined/{} ; le contrat exige `safe.safe !== true`.
  assert.match(guard, /safe\.safe !== true/);
});

// --- Appelant recovery : watchdog 16_REFRESH:1925-1930 ---
red('recovery racine : compteur illisible ⇒ WCORE_IS_SAFE seul doit refuser', () => {
  assert.equal(ctxWith(UNREADABLE['getToday lève']).WCORE_IS_SAFE('recovery').safe, false);
});
control('recovery appelant : gate déjà fail-closed (GATE_UNAVAILABLE + COUNTER_UNATTESTED présents dans 16 live)', () => {
  assert.match(REF, /safe = \{ safe: false, reason: "COUNTER_UNATTESTED" \}/);
  assert.match(REF, /if \(!safe \|\| safe\.safe !== false\) safe = \{ safe: false, reason: "GATE_UNAVAILABLE" \}/);
});

// --- Intégration : vrais HttpCounter (03E) + HttpCallCounter (26B) live ---
// Cas réaliste : getToday() avale les erreurs et renvoie 0 (fallback) ⇒ WCORE_IS_SAFE ne voit qu'un « zéro ».
const E03 = read('03E_QUOTA_CIRCUIT_BREAKER'), B26 = read('26B_HTTP_SAVINGS');
function realStack(props) {
  const g = { Date, JSON, Math, Object, String, Number, parseInt, isFinite, Logger: { log() {} }, CK_get: k => k,
    BaseEngine: { detectBlockReason: () => '' },
    PropertiesService: { getScriptProperties: () => props },
    LockService: { getUserLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }), getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) } };
  const c = vm.createContext(g);
  vm.runInContext(E03.slice(E03.indexOf('var HttpCounter = '), E03.indexOf('var BudgetHTTP')), c);
  const a = B26.indexOf('var HttpCallCounter = (function(){'), b = B26.indexOf('\n})();', a) + 6;
  vm.runInContext(B26.slice(a, b), c);
  vm.runInContext(fn(INIT, 'WCORE_IS_SAFE'), c);
  return c;
}
const memProps = store => ({ getProperty: k => store[k] ?? null, setProperty: (k, v) => { store[k] = String(v); }, deleteProperty: k => { delete store[k]; }, getProperties: () => ({ ...store }) });
const hourNow = () => Math.floor(Date.now() / 3600000);
control('intégration : compteur sain à 100/20000 ⇒ normal OK', () => {
  const r = realStack(memProps({ WCORE_HTTP_BUCKETS_v1: JSON.stringify({ [hourNow()]: 100 }) })).WCORE_IS_SAFE('normal');
  assert.equal(r.safe, true);
});
control('intégration : compteur sain à 17000/20000 ⇒ normal refuse HTTP_BUDGET', () => {
  const r = realStack(memProps({ WCORE_HTTP_BUCKETS_v1: JSON.stringify({ [hourNow()]: 17000 }) })).WCORE_IS_SAFE('normal');
  assert.equal(r.safe, false); assert.match(r.reason, /^HTTP_BUDGET_/);
});
control('intégration : LockService indisponible (fonction personnalisée de cellule) + total sain ⇒ OK via snapshot', () => {
  const c = realStack(memProps({ WCORE_HTTP_BUCKETS_v1: JSON.stringify({ [hourNow()]: 100 }) }));
  c.LockService = { getUserLock: boom, getScriptLock: boom };
  assert.equal(c.WCORE_IS_SAFE('normal').safe, true);
});
red('intégration : ScriptProperties illisible (getProperty lève) ⇒ normal doit refuser', () => {
  const r = realStack({ getProperty: boom, setProperty: boom, deleteProperty: boom, getProperties: boom }).WCORE_IS_SAFE('normal');
  assert.equal(r.safe, false, 'fallback 0 accepté comme budget sain : ' + JSON.stringify(r));
});
red('intégration : total persisté corrompu ⇒ activity doit refuser', () => {
  const r = realStack(memProps({ WCORE_HTTP_BUCKETS_v1: '{corrupt' })).WCORE_IS_SAFE('activity');
  assert.equal(r.safe, false, 'total corrompu accepté : ' + JSON.stringify(r));
});

// --- Contrôles : refus et frontières existants à préserver ---
const NORMAL_MODE = m => ({ getMode: () => m, getEffectiveMode: () => m, isAllowed: () => m === 'NORMAL' });
control('CACHE_ONLY refuse normal et activity', () => {
  for (const p of ['normal', 'activity']) assert.equal(ctxWith({ mode: NORMAL_MODE('CACHE_ONLY') }).WCORE_IS_SAFE(p).reason, 'HTTP_MODE_CACHE_ONLY');
});
control('CACHE_ONLY reste admis pour recovery si isAllowed le permet', () => {
  const m = { getMode: () => 'CACHE_ONLY', getEffectiveMode: () => 'CACHE_ONLY', isAllowed: () => true };
  assert.equal(ctxWith({ mode: m }).WCORE_IS_SAFE('recovery').safe, true);
});
control('recovery : mode illisible reste admis (le gate 16 garde sa propre attestation ; ne pas figer le watchdog)', () => {
  assert.equal(ctxWith(UNREADABLE['getEffectiveMode lève']).WCORE_IS_SAFE('recovery').safe, true);
});
red('normal : total non attesté (isCountValid false, valeurs plausibles) ⇒ refus', () => {
  assert.equal(ctxWith({ attested: false }).WCORE_IS_SAFE('normal').safe, false);
});
control('blockReason non vide refuse', () => {
  assert.deepEqual({ ...ctxWith({ block: 'QUOTA_LOCK' }).WCORE_IS_SAFE('normal') }, { safe: false, reason: 'QUOTA_LOCK' });
});
for (const [p, thr] of [['critical', 0.99], ['high', 0.90], ['normal', 0.80], ['activity', 0.80], ['recovery', 0.80], ['low', 0.70]]) {
  control('seuil ' + p + ' = ' + thr + ' inchangé', () => {
    const q = 20000, at = Math.round(q * thr);
    assert.equal(ctxWith({ counter: OK_COUNTER(at - 1, q) }).WCORE_IS_SAFE(p).safe, true);
    const r = ctxWith({ counter: OK_COUNTER(at, q) }).WCORE_IS_SAFE(p);
    assert.equal(r.safe, false); assert.equal(r.threshold, thr);
  });
}
control('budget sain + mode NORMAL ⇒ OK', () => {
  const c = ctxWith({ mode: NORMAL_MODE('NORMAL') });
  assert.equal(c.IS_WCORE_SAFE(), 'OK');
});
for (const [kind, n, f] of tests) test(kind + ' - ' + n, f);

// --- Watchdog (16) : attestation propre du compteur avant toute admission « recovery » ---
function attestCtx({ raw, valid = true, live = 100, quota = 20000, propsThrow = false } = {}) {
  const hour = Math.floor(Date.now() / 3600000);
  const g = {
    Date, Math, JSON, Array, String, isFinite, parseInt,
    HttpCounter: { isCountValid: () => valid },
    HttpCallCounter: { getToday: () => live, getQuota: () => quota },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => { if (propsThrow) throw new Error('storage'); return raw === undefined ? JSON.stringify({ [hour]: 50, [hour - 1]: 40 }) : raw; } }) },
  };
  const ctx = vm.createContext(g);
  vm.runInContext(fn(REF, '_wdCounterAttested_'), ctx);
  return ctx._wdCounterAttested_();
}
test('watchdog : compteur attesté quand les seaux sont numériques et le total sous 80 %', () => {
  assert.equal(attestCtx(), true);
  assert.equal(attestCtx({ raw: null }), true, 'propriété absente = historique vide (premier lancement, remise à zéro)');
  assert.equal(attestCtx({ raw: null, valid: false }), false, 'absente mais total non attesté : refus');
});
test('watchdog : tout doute refuse (seaux absents, illisibles, non numériques, total non valide ou trop haut)', () => {
  const hour = Math.floor(Date.now() / 3600000);
  assert.equal(attestCtx({ propsThrow: true }), false, 'stockage illisible');
  assert.equal(attestCtx({ raw: '{not json' }), false, 'JSON invalide');
  assert.equal(attestCtx({ raw: '[1,2]' }), false, 'tableau');
  assert.equal(attestCtx({ raw: JSON.stringify({ [hour]: 'abc' }) }), false, 'seau non numérique');
  assert.equal(attestCtx({ raw: JSON.stringify({ [hour]: -3 }) }), false, 'seau négatif');
  assert.equal(attestCtx({ valid: false }), false, 'total non attesté');
  assert.equal(attestCtx({ live: NaN }), false, 'lecture non numérique');
  assert.equal(attestCtx({ quota: 0 }), false, 'quota nul');
  assert.equal(attestCtx({ raw: JSON.stringify({ [hour]: 16000 }) }), false, 'seaux à 80 % du quota');
  assert.equal(attestCtx({ live: 16000 }), false, 'compteur à 80 % du quota');
});
test('watchdog : la porte refuse sans verdict sûr et ne passe jamais sur une exception', () => {
  assert.match(REF, /try \{ safe = typeof WCORE_IS_SAFE === 'function' \? WCORE_IS_SAFE\("recovery"\) : null; \} catch \(eGate\) \{ safe = null; \}/);
  assert.match(REF, /if \(!safe \|\| safe\.safe !== true\) \{/);
});

// --- Bout en bout : vraie pile 03E + 26B + 01 + porte du watchdog (16) ---
const HEAL = read('16B_AUTO_HEAL');
function gateCtx(store) {
  const ctx = realStack(memProps(store));
  vm.runInContext(fn(REF, '_wdCounterAttested_') + `
    function __gate() {
      var safe = null;
      try { safe = typeof WCORE_IS_SAFE === 'function' ? WCORE_IS_SAFE("recovery") : null; } catch (eGate) { safe = null; }
      if (safe && safe.safe === true && (typeof _wdCounterAttested_ !== "function" || !_wdCounterAttested_())) safe = { safe: false, reason: "COUNTER_UNATTESTED" };
      if (!safe || safe.safe !== true) { if (!safe || safe.safe !== false) safe = { safe: false, reason: "GATE_UNAVAILABLE" }; }
      return safe;
    }`, ctx);
  return ctx;
}
test('bout en bout : propriétés vides (premier lancement ou remise à zéro) ⇒ watchdog admis', () => {
  const r = gateCtx({}).__gate();
  assert.equal(r.safe, true, JSON.stringify(r));
});
test('bout en bout : seaux corrompus ⇒ watchdog refusé, jamais admis sur un doute', () => {
  const r = gateCtx({ WCORE_HTTP_BUCKETS_v1: '{bad' }).__gate();
  assert.equal(r.safe, false);
});
test('la porte recopiée dans le test est bien celle du source', () => {
  assert.match(REF, /if \(safe && safe\.safe === true && \(typeof _wdCounterAttested_ !== "function" \|\| !_wdCounterAttested_\(\)\)\) safe = \{ safe: false, reason: "COUNTER_UNATTESTED" \};/);
  assert.match(REF, /setProperty\("WCORE_WD_LAST_ADMITTED_MS", String\(Date\.now\(\)\)\)/);
  const admitted = REF.indexOf('WCORE_WD_LAST_ADMITTED_MS'), gate = REF.indexOf('reason: "GATE_UNAVAILABLE" };');
  assert.ok(gate > 0 && admitted > gate, 'le battement d’admission est écrit après la porte');
  for (const reason of ['HTTP_COUNTER_UNKNOWN', 'HTTP_COUNTER_UNATTESTED', 'HTTP_MODE_UNKNOWN']) assert.ok(REF.includes('"' + reason + '"'), reason + ' dans le diagnostic');
});
test('auto-réparation : un watchdog refusé à chaque passage devient visible (Watchdog admission STALE)', () => {
  const ctx = vm.createContext({ JSON, Math, Number, String, isFinite, WCORE_AUTO_HEAL_WD_STALE_MS: 30 * 60000 });
  vm.runInContext(fn(HEAL, '_wcoreAutoHealWatchdogAdmission_'), ctx);
  const now = 1794470000000;
  const props = (o) => ({ getProperty: (k) => (k in o ? o[k] : null) });
  assert.equal(ctx._wcoreAutoHealWatchdogAdmission_(props({}), now).status, 'UNKNOWN');
  assert.equal(ctx._wcoreAutoHealWatchdogAdmission_(props({ WCORE_WD_LAST_ADMITTED_MS: String(now - 10 * 60000) }), now).status, 'OK');
  const stale = ctx._wcoreAutoHealWatchdogAdmission_(props({
    WCORE_WD_LAST_ADMITTED_MS: String(now - 3 * 3600000),
    WCORE_WD_LAST_DIAG: JSON.stringify({ stats: { mode: 'SKIPPED_UNSAFE', reason: 'HTTP_COUNTER_UNATTESTED' } }),
  }), now);
  assert.equal(stale.status, 'STALE');
  assert.match(stale.detail, /^watchdog refused since ageMin=\d+ reason=HTTP_COUNTER_UNATTESTED$/);
});

// The real WCORE_AUTO_HEAL, normal and forced: the admission row is produced in both, with its
// reason, and the report itself never asks for a trigger reinstall.
function healRun(force, store) {
  const calls = [];
  const props = { getProperty: (k) => (k in store ? store[k] : null), setProperty: (k, v) => { store[k] = String(v); } };
  const g = {
    JSON, Math, Number, String, isFinite, parseInt, Date,
    WCORE_AUTO_HEAL_WD_STALE_MS: 30 * 60000, WCORE_AUTO_HEAL_COOLDOWN_MS: 0,
    WCORE_AUTO_HEAL_LEASE_KEY: 'k', WCORE_AUTO_HEAL_LEASE_TTL_MS: 1,
    PropertiesService: { getScriptProperties: () => props },
    _wcoreAcquireLease_: () => 'owner', _wcoreReleaseLease_: () => {},
    _wcoreAutoHealStoragePressureRecovery_: () => false,
    _wcoreAutoHealEnsureTriggers_: (out, p, f) => { calls.push('triggers:' + f); },
    _wcoreAutoHealBootstrapState_: () => { calls.push('bootstrap'); },
    _wcoreAutoHealBackgroundMaintenance_: () => {},
    _wcoreAutoHealEnsurePricingWorker_: () => {},
  };
  const ctx = vm.createContext(g);
  vm.runInContext(fn(HEAL, '_wcoreAutoHealRow_') + '\n' + fn(HEAL, '_wcoreAutoHealWatchdogAdmission_') + '\n' + fn(HEAL, 'WCORE_AUTO_HEAL'), ctx);
  return { out: ctx.WCORE_AUTO_HEAL('test', force), calls };
}
test('auto-réparation réelle : la ligne « Watchdog admission » sort en mode normal et en mode forcé', () => {
  for (const force of [false, true]) {
    const store = {
      WCORE_WD_LAST_ADMITTED_MS: String(Date.now() - 3 * 3600000),
      WCORE_WD_LAST_DIAG: JSON.stringify({ stats: { mode: 'SKIPPED_UNSAFE', reason: 'HTTP_COUNTER_UNATTESTED' } }),
    };
    const r = healRun(force, store);
    const row = r.out.find((x) => x[0] === 'Watchdog admission');
    assert.ok(row, 'ligne présente (force=' + force + ')');
    assert.equal(row[1], 'STALE');
    assert.match(row[2], /reason=HTTP_COUNTER_UNATTESTED/);
    assert.deepEqual(r.calls.filter((c) => c.startsWith('triggers')), ['triggers:' + force], 'le rapport ne déclenche aucune réinstallation de plus');
  }
  const fresh = healRun(false, { WCORE_WD_LAST_ADMITTED_MS: String(Date.now() - 5 * 60000) });
  assert.equal(fresh.out.find((x) => x[0] === 'Watchdog admission')[1], 'OK');
});
test('le statut de l’auto-réparation affiche aussi l’admission', () => {
  assert.match(fn(HEAL, 'WCORE_AUTO_HEAL_STATUS'), /"WATCHDOG_FROM_RECAP admission"/);
});

test('auto-réparation : jamais admis mais dernier passage refusé ⇒ STALE avec la raison ; sans refus ⇒ libellé neutre', () => {
  const ctx = vm.createContext({ JSON, Math, Number, String, isFinite, WCORE_AUTO_HEAL_WD_STALE_MS: 30 * 60000 });
  vm.runInContext(fn(HEAL, '_wcoreAutoHealWatchdogAdmission_'), ctx);
  const now = 1794470000000;
  const props = (o) => ({ getProperty: (k) => (k in o ? o[k] : null) });
  const never = ctx._wcoreAutoHealWatchdogAdmission_(props({ WCORE_WD_LAST_DIAG: JSON.stringify({ stats: { mode: 'SKIPPED_UNSAFE', reason: 'QUOTA' } }) }), now);
  assert.equal(never.status, 'STALE');
  assert.match(never.detail, /^watchdog refused, never admitted reason=QUOTA$/);
  assert.equal(ctx._wcoreAutoHealWatchdogAdmission_(props({}), now).status, 'UNKNOWN');
  const old = ctx._wcoreAutoHealWatchdogAdmission_(props({ WCORE_WD_LAST_ADMITTED_MS: String(now - 2 * 3600000), WCORE_WD_LAST_DIAG: JSON.stringify({ stats: { mode: 'API_BATCH' } }) }), now);
  assert.equal(old.status, 'STALE');
  assert.match(old.detail, /^no admission since/);
  assert.match(HEAL, /var WCORE_AUTO_HEAL_WD_STALE_MS = 30 \* 60 \* 1000;/);
});
test('diagnostic du watchdog : la raison écrite est exécutée depuis le source, inconnue ⇒ UNKNOWN', () => {
  // The expression that computes stats.reason is cut out of the real gate and run as is.
  const start = REF.indexOf('reason: /^HTTP_BUDGET_');
  const end = REF.indexOf('httpMode:', start);
  assert.ok(start > 0 && end > start, 'expression trouvée dans la porte');
  const expr = REF.slice(start + 'reason: '.length, end).trim().replace(/,\s*$/, '');
  const run = (r) => vm.runInNewContext('(' + expr + ')', { _wdGateReason: r });
  for (const r of ['QUOTA', 'DEGRADED', 'GUARD', 'HTTP_COUNTER_UNKNOWN', 'HTTP_COUNTER_UNATTESTED', 'HTTP_MODE_UNKNOWN', 'GATE_UNAVAILABLE', 'COUNTER_UNATTESTED', 'HTTP_MODE_CACHE_ONLY']) {
    assert.equal(run(r), r, r);
  }
  assert.equal(run('HTTP_BUDGET_85%'), 'HTTP_BUDGET');
  assert.equal(run('SOMETHING_ELSE'), 'UNKNOWN');
  assert.equal(run(''), 'UNKNOWN');
});
