// Garde-fou: un statut cache-only doit porter la date du cache, jamais "N/A".
//
// Incident 2026-08-06 sur "Ledger - Degen": I1 valait "[CACHE_ONLY] [FRESH] N/A"
// alors que le cache datait du 2026-08-04 00:01:02. Cause: cache.updatedAt est
// produit par CacheManager._fromEpochSec_, qui rend une CHAINE dans le fuseau du
// script, tandis que Format.datetime exige un nombre (Num.isValid teste
// typeof === "number") et retourne "N/A" sinon. Les appelants testaient la
// valeur en truthy - une chaine passe - puis la formataient.
//
// Un statut sans horodatage n'est pas seulement illisible: le watchdog extrait
// une date de I1 (_wd_extractTimestamp_ / _wd_shouldSyncJ1_), donc la feuille
// devient inexploitable pour la planification du rafraichissement.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', '11_EVM_ENGINE.gs'), 'utf8');

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

// On extrait le helper seul: charger tout le moteur exigerait l'environnement GAS.
const helperMatch = src.match(/function _evmCacheStatusDatetime_[\s\S]*?\n}/);
assert.ok(helperMatch, '_evmCacheStatusDatetime_ introuvable dans 11_EVM_ENGINE.gs');

function makeContext(webScanImpl) {
  const context = {
    console,
    isFinite,
    Date,
    Number,
    String,
    Num: { isValid: (x) => typeof x === 'number' && isFinite(x) },
    // Reproduit fidelement 02_UTILS.gs: refuse tout ce qui n'est pas un nombre.
    Format: {
      datetime: (ts) => {
        if (typeof ts !== 'number' || !isFinite(ts) || ts <= 0) return 'N/A';
        const d = new Date(ts);
        const pad = (n) => (n < 10 ? '0' + n : String(n));
        return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) +
          ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
      },
    },
  };
  if (webScanImpl) context._webScanCacheTimestamp_ = webScanImpl;
  vm.createContext(context);
  vm.runInContext(helperMatch[0], context);
  return context;
}

// Implementation reelle de 41_GSHEET_WEB_SCAN.gs
function realWebScanTimestamp(cache) {
  if (!cache || typeof cache !== 'object') return 0;
  const raw = cache.updatedAt || cache.u || cache.last_run_update_ms || 0;
  let ts = Number(raw);
  if (!isFinite(ts) || ts <= 0) {
    try { ts = new Date(raw).getTime(); } catch (e) { ts = 0; }
  }
  if (!isFinite(ts) || ts <= 0) return 0;
  if (ts < 20000000000) ts *= 1000;
  return ts;
}

test('un cache dont updatedAt est une chaine rend une date, pas "N/A"', () => {
  const ctx = makeContext(realWebScanTimestamp);
  const cache = { updatedAt: '2026-08-04T00:01:02Z' };
  const out = ctx._evmCacheStatusDatetime_(cache, cache.updatedAt);
  assert.notEqual(out, 'N/A', 'le format chaine est celui produit par _fromEpochSec_');
  assert.ok(out, 'un horodatage est attendu');
  assert.ok(/2026-08-04/.test(out), `date attendue dans "${out}"`);
});

test('un cache dont updatedAt est un epoch ms reste correctement formate', () => {
  const ctx = makeContext(realWebScanTimestamp);
  const ms = Date.UTC(2026, 7, 4, 0, 1, 2);
  const out = ctx._evmCacheStatusDatetime_({ updatedAt: ms }, ms);
  assert.ok(/2026-08-04/.test(out), `date attendue dans "${out}"`);
});

test('un cache sans aucune date ne fabrique pas un horodatage', () => {
  const ctx = makeContext(realWebScanTimestamp);
  assert.equal(ctx._evmCacheStatusDatetime_({}, 0), '');
  assert.equal(ctx._evmCacheStatusDatetime_(null, null), '');
});

test('la chaine brute sert de dernier recours si le resolveur est absent', () => {
  // 41_GSHEET_WEB_SCAN est charge apres 11_EVM_ENGINE: la reference doit tolerer
  // son absence sans effacer une date pourtant disponible.
  const ctx = makeContext(null);
  const out = ctx._evmCacheStatusDatetime_({ updatedAt: '2026-08-04 00:01:02' }, '2026-08-04 00:01:02');
  assert.equal(out, '2026-08-04 00:01:02');
});

test('le statut construit ne contient jamais "N/A" quand le cache porte une date', () => {
  const ctx = makeContext(realWebScanTimestamp);
  const status = '[FRESH] ' + ctx._evmCacheStatusDatetime_({ updatedAt: '2026-08-04T00:01:02Z' }, '2026-08-04T00:01:02Z');
  assert.ok(!/N\/A/.test(status), `statut degrade: "${status}"`);
});

if (failures.length) {
  console.error('\n' + failures.length + ' failing test(s)');
  process.exit(1);
}
console.log('\ncache status timestamp OK');
