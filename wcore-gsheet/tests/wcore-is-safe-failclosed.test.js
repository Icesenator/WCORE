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
});
test('watchdog : tout doute refuse (seaux absents, illisibles, non numériques, total non valide ou trop haut)', () => {
  const hour = Math.floor(Date.now() / 3600000);
  assert.equal(attestCtx({ raw: null }), false, 'propriété absente');
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
