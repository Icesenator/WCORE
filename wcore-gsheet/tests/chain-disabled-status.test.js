// Garde-fou: une chaine desactivee ne doit plus etre rafraichie.
//
// FLAGS.DISABLE_CHAIN etait declare dans 14 configs sans aucun lecteur cote
// Apps Script: le drapeau n'agissait que sur le web (/api/chains). Les onglets
// Ledger de ces chaines restaient donc pulses, et chaque pulse declenche un
// appel HTTP vers l'API alors qu'aucun scan ne peut aboutir (RPC morts).
//
// Mesure du 2026-08-06 sur "Ledger - DuckChain": B1 re-pulse a 13:45:55 puis
// 15:36:00, boucle entretenue par [WEB_SCAN_PRESERVED] qui force needsPulse
// sans condition (16_REFRESH.gs).

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcDir = path.join(__dirname, '..', 'src');
const baseEngine = fs.readFileSync(path.join(srcDir, '10A_BASE_ENGINE.gs'), 'utf8');
const refresh = fs.readFileSync(path.join(srcDir, '16_REFRESH.gs'), 'utf8');
const evm = fs.readFileSync(path.join(srcDir, '11_EVM_ENGINE.gs'), 'utf8');
const svm = fs.readFileSync(path.join(srcDir, '14_SVM_ENGINE.gs'), 'utf8');
const cosmos = fs.readFileSync(path.join(srcDir, '15_COSMOS_ENGINE.gs'), 'utf8');

const failures = [];
function test(name, fn) {
  try {
    fn();
    console.log('OK - ' + name);
  } catch (err) {
    failures.push(name);
    console.error('FAIL - ' + name + ': ' + err.message);
  }
}

function extract(source, header) {
  const start = source.indexOf(header);
  assert.ok(start >= 0, header + ' introuvable');
  let depth = 0;
  let i = source.indexOf('{', start);
  const from = i;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('bloc non termine pour ' + header + ' (depuis ' + from + ')');
}

// --- Statut renvoye par les moteurs ---

function makeStatusContext(cacheTimestampMs) {
  const context = {
    console,
    isFinite,
    Date,
    Number,
    String,
    BaseEngine: {},
    CacheManager: { init: () => {} },
    WalletCache: { load: () => ({ updatedAt: cacheTimestampMs }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    Format: {
      datetime: (ts) => (typeof ts === 'number' && ts > 0 ? 'DATE(' + ts + ')' : 'N/A'),
      now: () => 'NOW',
    },
    _webScanCacheTimestamp_: (cache) => {
      if (!cache) return 0;
      const n = Number(cache.updatedAt);
      return isFinite(n) && n > 0 ? n : 0;
    },
  };
  vm.createContext(context);
  vm.runInContext(extract(baseEngine, 'BaseEngine.chainDisabledStatus = function'), context);
  return context;
}

test('une chaine desactivee renvoie un statut terminal date de la tentative', () => {
  const ctx = makeStatusContext(1234567890000);
  const out = ctx.BaseEngine.chainDisabledStatus('wallet', { FLAGS: { DISABLE_CHAIN: true } });
  assert.ok(out.indexOf('[CHAIN_DISABLED]') === 0, `statut inattendu: "${out}"`);
  // I1/J1 datent le passage du systeme. Reprendre la date du cache ferait
  // reculer J1, or J1 est le latch qui declenche le recalcul de A1: un latch
  // fige empeche la ligne ERROR d'etre reactualisee.
  assert.ok(/NOW/.test(out), `la date de tentative est attendue, pas celle du cache: "${out}"`);
  assert.ok(!/DATE\(1234567890000\)/.test(out), "l'age de la donnee appartient a la ligne ERROR");
});

test('une chaine active ne renvoie aucun statut, le scan normal continue', () => {
  const ctx = makeStatusContext(1234567890000);
  assert.equal(ctx.BaseEngine.chainDisabledStatus('wallet', { FLAGS: {} }), '');
  assert.equal(ctx.BaseEngine.chainDisabledStatus('wallet', {}), '');
  assert.equal(ctx.BaseEngine.chainDisabledStatus('wallet', null), '');
});

test('un drapeau non strictement true ne desactive pas la chaine', () => {
  const ctx = makeStatusContext(1234567890000);
  assert.equal(ctx.BaseEngine.chainDisabledStatus('wallet', { FLAGS: { DISABLE_CHAIN: 'false' } }), '');
  assert.equal(ctx.BaseEngine.chainDisabledStatus('wallet', { FLAGS: { DISABLE_CHAIN: 1 } }), '');
});

// --- Decision du watchdog ---

function makeWatchdogContext() {
  const context = { console, isFinite, Date, Number, String, parseInt };
  vm.createContext(context);
  for (const header of [
    'function _wd_norm_',
    'function _wd_isLastUpdateFormat_',
    'function _wd_parseLocalDateTimeToMs_',
    'function _wd_extractTimestamp_',
    'function _wd_isBlocked_',
    'function _wd_needsRefresh_',
  ]) {
    context.__src = extract(refresh, header);
    vm.runInContext(context.__src, context);
  }
  return context;
}

test('le watchdog ne re-pulse jamais une chaine desactivee', () => {
  const ctx = makeWatchdogContext();
  const now = Date.now();
  const res = ctx._wd_needsRefresh_('', '[CHAIN_DISABLED] 2026-07-31 02:48:44', now, 5 * 3600000, '2026-08-06 15:36:00');
  assert.equal(res.needsPulse, false, 'un re-pulse ne peut rien produire et coute un appel HTTP');
});

test('le watchdog continue de re-pulser un cache preserve sur chaine active', () => {
  const ctx = makeWatchdogContext();
  const now = Date.now();
  const res = ctx._wd_needsRefresh_('', '[WEB_SCAN_PRESERVED] 2026-08-06 15:36:32', now, 5 * 3600000, '2026-08-06 15:36:00');
  assert.equal(res.needsPulse, true, 'ce comportement ne doit pas etre affaibli');
});

test("l'horodatage reste extractible d'un statut desactive, sinon J1 gele", () => {
  const ctx = makeWatchdogContext();
  assert.equal(ctx._wd_extractTimestamp_('[CHAIN_DISABLED] 2026-07-31 02:48:44'), '2026-07-31 02:48:44');
});

// --- Cablage dans les trois moteurs ---

test('les trois moteurs consultent le statut avant de lancer un scan', () => {
  for (const [name, source] of [['EVM', evm], ['SVM', svm], ['Cosmos', cosmos]]) {
    assert.ok(
      /BaseEngine\.chainDisabledStatus/.test(source),
      `${name}: getRefreshStatus doit consulter chainDisabledStatus`,
    );
  }
});

test('une chaine desactivee est signalee comme telle, pas comme une panne', () => {
  assert.ok(
    /CHAINE DESACTIVEE - donnee conservee du /.test(evm),
    'le message doit nommer la cause reelle',
  );
  assert.ok(
    /_chainOff \|\| \(Date\.now\(\) - _staleMs\) >= _staleAlertMs/.test(evm),
    "l'age attendu d'une chaine desactivee ne doit pas dependre du seuil de fraicheur",
  );
});

if (failures.length) {
  console.error('\n' + failures.length + ' failing test(s)');
  process.exit(1);
}
console.log('\nchain disabled status OK');
