// Garde — P1-OBS-GSHEET-HTTP-ATTRIBUTION
// Cause PROUVEE (lecture de code 03E) : `count()` lit via `_loadRaw()` TOLERANT (JSON invalide
// -> {}), tandis que `snapshot()` lisait les CARTES host/trigger via `_snapshotLoadRaw()` qui
// LEVE une exception. Une seule propriete de breakdown corrompue vidait donc le snapshot entier
// (available:false, categories:{}, hosts:{}) alors que le total restait correct -> exactement
// "byHost total = 0" face a un total de 132.
// Correctif : le TOTAL garde la lecture fail-closed ; les CARTES passent en lecture tolerante.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const CHAIN = ['00C_CACHE_KEYS.gs', '02_UTILS.gs', '03_HTTP.gs', '26B_HTTP_SAVINGS.gs', '03E_QUOTA_CIRCUIT_BREAKER.gs'];
const KEY = 'WCORE_HTTP_BUCKETS_v1';
const TRIGGER_KEY = 'WCORE_HTTP_TRIGGERS_v2';
const HOST_KEY = 'WCORE_HTTP_HOSTS_v1';

function harness() {
  const props = {};
  const ctx = {
    console, Logger: { log() {} }, Date, JSON, Math, Object, Array, String, Number, isNaN, parseInt, parseFloat, RegExp, Error,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: (k) => { delete props[k]; }, getKeys: () => Object.keys(props), getProperties: () => Object.assign({}, props) }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }), getUserCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    LockService: { getUserLock: () => ({ tryLock: () => true, releaseLock: () => {} }), getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: { sleep: () => {}, formatDate: () => 'x', getUuid: () => 'u' },
    Session: { getScriptTimeZone: () => 'Europe/Paris', getActiveUserLocale: () => 'fr' },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ create: () => {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => null, openById: () => null },
    UrlFetchApp: { fetch: () => ({ getContentText: () => '{}', getResponseCode: () => 200 }), fetchAll: () => [] },
  };
  vm.createContext(ctx);
  CHAIN.forEach((f) => vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f }));
  return { ctx, props };
}

const N = 3;
const URL = 'https://api.coingecko.com/api/v3/simple/price';

function seed(h) {
  for (let i = 0; i < N; i++) h.ctx.HttpCounter.record(1, 'TEST', URL);
}

function run() {
  // --- 1. Baseline saine ---
  {
    const h = harness(); seed(h);
    const c = h.ctx.HttpCounter.count();
    const s = h.ctx.HttpCounter.snapshot();
    assert.strictEqual(c, N, 'baseline count() != ' + N);
    assert.strictEqual(s.total, N, 'baseline snapshot().total != ' + N);
    assert.ok(Object.keys(s.hosts).length > 0, 'baseline hosts vide');
    assert.ok(Object.keys(s.categories).length > 0, 'baseline categories vide');
    console.log('OK baseline count=' + c + ' total=' + s.total + ' hosts=' + JSON.stringify(s.hosts));
  }

  // --- 2. HOST corrompu : le total ET l'autre carte doivent survivre ---
  {
    const h = harness(); seed(h);
    h.props[HOST_KEY] = '{not-json';
    const c = h.ctx.HttpCounter.count();
    const s = h.ctx.HttpCounter.snapshot();
    assert.strictEqual(c, N, 'HOST corrompu: count() != ' + N);
    assert.strictEqual(s.available, true, 'HOST corrompu: snapshot disponible=false (breakdown a vide le snapshot)');
    assert.strictEqual(s.total, N, 'HOST corrompu: snapshot().total != ' + N);
    assert.ok(Object.keys(s.categories).length > 0, 'HOST corrompu: categories videes (divergence reproduite)');
    console.log('OK host-corrupt available=' + s.available + ' total=' + s.total + ' categories=' + JSON.stringify(s.categories));
  }

  // --- 3. TRIGGER corrompu : symetrique ---
  {
    const h = harness(); seed(h);
    h.props[TRIGGER_KEY] = '[]';
    const s = h.ctx.HttpCounter.snapshot();
    assert.strictEqual(s.available, true, 'TRIGGER corrompu: snapshot disponible=false');
    assert.strictEqual(s.total, N, 'TRIGGER corrompu: snapshot().total != ' + N);
    console.log('OK trigger-corrupt available=' + s.available + ' total=' + s.total + ' hosts=' + JSON.stringify(s.hosts));
  }

  // --- 4. Total corrompu : fail-closed PRESERVE (le total ne doit jamais etre presente comme fiable) ---
  {
    const h = harness(); seed(h);
    h.props[KEY] = '{not-json';
    const s = h.ctx.HttpCounter.snapshot();
    assert.strictEqual(s.available, false, 'TOTAL corrompu: le fail-closed a ete perdu (total presente comme fiable)');
    console.log('OK total-corrupt available=' + s.available + ' (fail-closed preserve)');
  }
  console.log('PASS http-counter-snapshot-attribution');
}

try { run(); } catch (e) { console.error('FAIL http-counter-snapshot-attribution -> ' + e.message); process.exit(1); }
