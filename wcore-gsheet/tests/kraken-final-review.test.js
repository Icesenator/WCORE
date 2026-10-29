'use strict';
// Revue finale P1-DATA-KRAKEN-STOCKS-OPEN-ORDERS : borne réelle de fetchs privés par parcours,
// formules Details évaluées (pas seulement inspectées), version candidate.
// Fixtures synthétiques, aucun réseau, aucun secret.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/41_KRAKEN_SYNC.gs'), 'utf8');
const cex = fs.readFileSync(path.join(__dirname, '../src/35_BITPANDA_SYNC.gs'), 'utf8');
const slice = (a, b) => cex.slice(cex.indexOf(a), cex.indexOf(b, cex.indexOf(a) + a.length));

// ---------------------------------------------------------------- harnais fetch
function harness(opts = {}) {
  const props = new Map(opts.props || []), cache = new Map(), priv = [], pub = [], queue = [];
  const logs = [];
  const store = { getProperty: k => { if (opts.failGet && opts.failGet(k)) throw new Error('Address unavailable: REMOTE_SENTINEL'); return props.has(k) ? props.get(k) : null; }, setProperty: (k, v) => { if (opts.failSet && opts.failSet(k)) throw new Error('storage'); props.set(k, String(v)); }, deleteProperty: k => props.delete(k) };
  const json = b => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(b) });
  const ctx = {
    Logger: { log: v => logs.push(String(v)) },
    PropertiesService: { getScriptProperties: () => { if (opts.propsDown) throw new Error('properties unavailable'); return store; }, getUserProperties: () => store, getDocumentProperties: () => store },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) || null, put: (k, v) => cache.set(k, v) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { getUuid: () => 'synthetic-' + Math.random(), sleep() {}, formatDate: d => new Date(d).toISOString() },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => null }) },
    HttpCallCounter: { setTrigger() {}, clearTrigger() {} },
    UrlFetchApp: { fetch(url) {
      if (url.indexOf('/0/public/') >= 0) { pub.push(url); if (opts.onPublic) return opts.onPublic(url); return json({ error: [], result: {} }); }
      priv.push(url.replace('https://api.kraken.com', ''));
      if (opts.onPrivate) { const r = opts.onPrivate(url, priv.length); if (r !== undefined) return r; }
      return url.endsWith('/OpenOrders') ? json({ error: [], result: { open: {} } }) : json({ error: [], result: { ZEUR: { balance: '5', hold_trade: '1', credit: '0', credit_used: '0' } } });
    } }
  };
  vm.createContext(ctx);
  // Vrais locks/leases, vrai wrapper retry, vrai classement transitoire et vrai worker manuel du module 35.
  vm.runInContext(cex.slice(cex.indexOf('var _CEX_LOCK_TTL_MS'), cex.indexOf('function CEX_RELEASE_LOCK')) +
    cex.slice(cex.indexOf('function CEX_RELEASE_LOCK'), cex.indexOf('\nfunction ', cex.indexOf('function CEX_RELEASE_LOCK') + 10)) +
    cex.slice(cex.indexOf('var CEX_RELAY_MAX_RETRIES')) + '\n' +
    slice('var _CEX_MANUAL_JOB_MAX_RETRIES', 'function _cexRequeueManualJob_') + '\n' +
    slice('function _cexRunManualJob_', 'function _cexWriteManualJobStatus_'), ctx);
  vm.runInContext(source, ctx);
  ctx._krakenSign_ = () => 'synthetic-signature';
  ctx._krakenGetCreds_ = () => ({ key: 'synthetic-api-key', secret: 'synthetic-private-key' });
  ctx._krakenWriteSheet_ = opts.write || ((ss, name, rows) => rows.length);
  ctx._cexRequeueManualJob_ = job => queue.push(job);
  ctx._cexWriteManualJobRetryStatus_ = () => {};
  ctx._cexWriteManualJobStatus_ = () => {};
  ctx.CEX_CLEAR_MANUAL_REQUEST = () => {};
  ctx._bpFmtStamp_ = () => 'synthetic-stamp';
  // Exécute un job manuel A1 jusqu'à épuisement réel de la file de relance du worker.
  const runManual = kind => { queue.push({ kind }); let n = 0; while (queue.length && n++ < 10) ctx._cexRunManualJob_(queue.shift()); return n; };
  return { ctx, props, priv, pub, runManual, logs };
}
const json = b => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(b) });
const maxPrivate = (h) => h.priv.length;
const results = {};

const scenarios = [
  ['trigger SPOT nominal', {}, h => h.ctx.UPDATE_KRAKEN_SPOT({ triggerUid: 't' }), 1],
  ['filet Stocks nominal', {}, h => h.ctx.UPDATE_KRAKEN_STOCKS_FIAT({ triggerUid: 't' }), 1],
  ['filet Stocks après SPOT récent (skip partagé)', {}, h => { h.ctx.UPDATE_KRAKEN_SPOT({ triggerUid: 't' }); h.ctx.UPDATE_KRAKEN_STOCKS_FIAT({ triggerUid: 't' }); }, 1],
  ['A1 manuel Stocks nominal', {}, h => h.runManual('KRAKEN_STOCKS'), 1],
  ['A1 manuel Crypto nominal', {}, h => h.runManual('KRAKEN'), 1],
  ['A1 manuel : écriture Sheets « timed out » après 1 privé (worker ne rejoue pas)',
    { write: () => { throw new Error('Service Spreadsheets timed out while accessing document'); } }, h => h.runManual('KRAKEN_STOCKS'), 1],
  ['A1 manuel : premier appel transport null', { onPrivate: () => null }, h => h.runManual('KRAKEN_STOCKS'), 1],
  ['A1 manuel : Balance transport null', { onPrivate: (u, n) => n === 1 ? null : undefined }, h => h.runManual('KRAKEN_STOCKS'), 1],
  ['trigger : premier appel lockout', { onPrivate: () => json({ error: ['EGeneral:Temporary lockout'] }) }, h => { h.ctx.UPDATE_KRAKEN_SPOT({ triggerUid: 't' }); h.ctx.UPDATE_KRAKEN_STOCKS_FIAT({ triggerUid: 't' }); }, 1],
  ['trigger : Balance lockout', { onPrivate: (u, n) => n === 1 ? json({ error: ['EGeneral:Temporary lockout'] }) : undefined }, h => h.ctx.UPDATE_KRAKEN_SPOT({ triggerUid: 't' }), 1],
  ['trigger : premier appel « Address unavailable »', { onPrivate: () => { throw new Error('Address unavailable: synthetic'); } }, h => h.ctx.UPDATE_KRAKEN_SPOT({ triggerUid: 't' }), 1],
  ['nonce indisponible (persistance)', { failSet: k => k === 'KRAKEN_LAST_NONCE' }, h => h.runManual('KRAKEN_STOCKS'), 0],
  ['compteur budget indisponible', { failSet: k => k === 'KRAKEN_PRIVATE_CALLS_24H' }, h => h.runManual('KRAKEN_STOCKS'), 0],
  ['budget restant 1 (dernier Balance admis)', { props: [['KRAKEN_PRIVATE_CALLS_24H', Array(219).fill(Date.now()).join(',')]] }, h => h.runManual('KRAKEN_STOCKS'), 1],
  ['diagnostic DIAG_KRAKEN_API ×3 (cache 4 min)', {}, h => { h.ctx.DIAG_KRAKEN_API(); h.ctx.DIAG_KRAKEN_TICKERS(); h.ctx.DIAG_KRAKEN_XSTOCK_PRICES(); }, 1],
  ['diagnostic DIAG_KRAKEN_LOOP', {}, h => h.ctx.DIAG_KRAKEN_LOOP(), 1],
  ['concurrence : job pendant lock tenu', {}, h => { h.ctx.CEX_ACQUIRE_LOCK('KRAKEN'); h.ctx.UPDATE_KRAKEN_SPOT({ triggerUid: 't' }); h.runManual('KRAKEN_STOCKS'); h.ctx.DIAG_KRAKEN_API(); h.ctx.DIAG_KRAKEN_LOOP(); }, 0],
  ['concurrence : job réentrant pendant écriture', {}, h => { const inner = h.ctx._krakenWriteSheet_; h.ctx._krakenWriteSheet_ = (...a) => { assert.equal(h.ctx.UPDATE_KRAKEN_STOCKS_FIAT(), 'BUSY'); assert.match(h.ctx.DIAG_KRAKEN_API(), /BUSY/); return inner(...a); }; h.ctx.UPDATE_KRAKEN_SPOT({ triggerUid: 't' }); }, 1]
  ,['AUTH Balance worker manuel sans rejeu', { onPrivate: () => json({ error: ['EAPI:Invalid key'] }) }, h => h.runManual('KRAKEN_STOCKS'), 1]
];
for (const [name, opts, run, expected] of scenarios) test('borne fetchs privés — ' + name, () => {
  const h = harness(opts);
  run(h);
  results[name] = maxPrivate(h);
  assert.equal(h.priv.length, expected, JSON.stringify(h.priv));
  assert.ok(h.priv.every(p => /^\/0\/private\/(Balance)$/.test(p)));
});
test('borne : aucune requête privée ne porte de paramètre de filtre (cl_ord_id/userref)', () => {
  const bodies = [];
  const h = harness({ onPrivate: () => undefined });
  const fetch = h.ctx.UrlFetchApp.fetch;
  h.ctx.UrlFetchApp.fetch = (url, o) => { if (o && o.payload) bodies.push(o.payload); return fetch(url, o); };
  h.ctx.UPDATE_KRAKEN_SPOT({ triggerUid: 't' });
  assert.equal(bodies.length, 1);
  for (const b of bodies) assert.deepEqual([...new URLSearchParams(b).keys()], ['nonce']);
});
test.after(() => { if (process.env.WCORE_KRAKEN_TEST_REPORT === '1') fs.writeFileSync(path.join(__dirname, '../../.tmp/kraken-final-fetch-bounds.json'), JSON.stringify(results, null, 1)); });

for (const message of ['Address unavailable: REMOTE_SENTINEL', 'blocked/null response REMOTE_SENTINEL']) {
  test('nonce local au premier appel : aucun rejeu ni fuite — ' + message, () => {
    const h = harness();
    const original = h.ctx._krakenNextNonce_;
    let nonces = 0;
    h.ctx._krakenNextNonce_ = () => { if (++nonces === 1) throw new Error(message); return original(); };
    h.runManual('KRAKEN_STOCKS');
    assert.equal(h.priv.length, 0);
    assert.equal(nonces, 1);
    assert.doesNotMatch(JSON.stringify([...h.props]) + h.logs.join(''), /REMOTE_SENTINEL/);
  });
}
for (const when of [1, 2, 3, 4]) test('lecture compteur fail-closed sans écrasement — lecture ' + when, () => {
  let reads = 0;
  const history = String(Date.now() - 1000);
  const h = harness({ props: [['KRAKEN_PRIVATE_CALLS_24H', history]], failGet: k => k === 'KRAKEN_PRIVATE_CALLS_24H' && ++reads === when });
  const result = h.ctx.UPDATE_KRAKEN_SPOT({ triggerUid: 't' });
  assert.equal(JSON.parse(result).ok, false);
  assert.equal(h.priv.length, 0);
  const entries = h.props.get('KRAKEN_PRIVATE_CALLS_24H').split(',');
  assert.equal(entries[0], history);
  assert.equal(entries.length, 1);
  assert.doesNotMatch(result + JSON.stringify([...h.props]) + h.logs.join(''), /REMOTE_SENTINEL/);
  assert.ok(h.ctx.CEX_ACQUIRE_LOCK('KRAKEN'), 'lock libéré');
  if (when === 4) assert.ok(Number(h.props.get('KRAKEN_LAST_NONCE')) > 0);
  else assert.equal(h.props.has('KRAKEN_LAST_NONCE'), false);
});
for (const when of [1, 2]) test('écriture compteur fail-closed — appel ' + when, () => {
  let writes = 0;
  const history = String(Date.now() - 1000);
  const h = harness({ props: [['KRAKEN_PRIVATE_CALLS_24H', history]], failSet: k => k === 'KRAKEN_PRIVATE_CALLS_24H' && ++writes === when });
  if (when === 2) assert.equal(JSON.parse(h.ctx.UPDATE_KRAKEN_SPOT()).ok, true);
  const result = JSON.parse(h.ctx.UPDATE_KRAKEN_SPOT());
  assert.equal(result.ok, false);
  assert.equal(h.priv.length, when - 1);
  assert.equal(h.props.get('KRAKEN_PRIVATE_CALLS_24H').split(',')[0], history);
  assert.equal(h.props.get('KRAKEN_PRIVATE_CALLS_24H').split(',').length, when);
  assert.ok(Number(h.props.get('KRAKEN_LAST_NONCE')) > 0);
  assert.ok(h.ctx.CEX_ACQUIRE_LOCK('KRAKEN'));
});
test('diagnostic compteur absent : zéro connu, distinct de UNKNOWN', () => {
  const h = harness();
  const result = JSON.parse(h.ctx.KRAKEN_BUDGET_STATUS());
  assert.equal(result.private_calls_24h, 0);
  assert.equal(result.budget_remaining, 220);
});
test('diagnostic compteur illisible : UNKNOWN, jamais zéro ni admission maintenant', () => {
  const h = harness({ failGet: k => k === 'KRAKEN_PRIVATE_CALLS_24H' });
  const result = JSON.parse(h.ctx.KRAKEN_BUDGET_STATUS());
  assert.equal(result.private_calls_24h, null);
  assert.equal(result.budget_remaining, null);
  assert.equal(result.next_safe_manual_refresh, 'UNKNOWN');
  assert.equal(h.priv.length, 0);
});
for (const failure of ['transport', 'json', 'null', 'http', 'api']) for (const route of ['SPOT', 'STOCKS', 'DIAG', 'DIRECT']) {
  test('prix public sans fuite — ' + route + ' / ' + failure, () => {
    const h = harness({ onPublic: () => {
      if (failure === 'transport') throw new Error('REMOTE_SENTINEL');
      if (failure === 'null') return null;
      if (failure === 'http') return { getResponseCode: () => 503, getContentText: () => 'REMOTE_SENTINEL' };
      if (failure === 'api') return json({ error: ['REMOTE_SENTINEL'] });
      return { getResponseCode: () => 200, getContentText: () => 'REMOTE_SENTINEL' };
    } });
    // Les prix sont réellement appelés par le writer nominal ; aucune écriture réseau.
    const sheetWrites = [];
    const sheet = { getMaxColumns: () => 17, getLastRow: () => 2, getRange: () => ({ setValues: v => sheetWrites.push(v), clearContent() {} }) };
    h.ctx.SpreadsheetApp.openById = () => ({ getSheetByName: () => sheet });
    vm.runInContext(source.slice(source.indexOf('function _krakenWriteSheet_'), source.indexOf('function _krakenSharedRecent_')), h.ctx);
    h.ctx._cexComputeAndAppendTotal_ = () => {};
    const fetch = h.ctx.UrlFetchApp.fetch;
    h.ctx.UrlFetchApp.fetch = (url, o) => url.endsWith('/Balance') ? (h.priv.push('/0/private/Balance'), json({ error: [], result: { 'AAPLx': '3' } })) : fetch(url, o);
    h.ctx._krakenDiagBuckets_ = () => ({ xstocks: [['AAPLx', 3]] });
    let result;
    try {
      result = route === 'SPOT' ? h.ctx.UPDATE_KRAKEN_SPOT({ triggerUid: 't' }) : route === 'STOCKS' ? h.ctx.UPDATE_KRAKEN_STOCKS_FIAT({ triggerUid: 't' }) : route === 'DIAG' ? h.ctx.DIAG_KRAKEN_XSTOCK_PRICES() : h.ctx._krakenFetchXStockPricesUsd_([['AAPLx', 3]]);
    } catch (e) { result = e.message; }
    assert.doesNotMatch(JSON.stringify(result) + JSON.stringify([...h.props]) + h.logs.join('') + JSON.stringify(sheetWrites), /REMOTE_SENTINEL/);
    assert.match(String(result), /prix xStocks UNKNOWN/);
    assert.ok(h.pub.some(url => url.includes('/Ticker?')), 'fetch prix réellement exécuté');
    assert.ok(h.priv.length <= 2);
  });
}

// ------------------------------------------------- mini-évaluateur de formules
// Sous-ensemble Sheets : IF, AND, EXACT, ISNUMBER, NOW, SUMPRODUCT, références, chaînes,
// nombres, + - * /, = <= >= < > <>. Cellule vide = "" ; "" en arithmétique = 0.
function evaluate(formula, book, here, now) {
  const src = formula.replace(/^=/, ''); let i = 0;
  const peek = () => src[i], eat = c => { if (src[i] !== c) throw new Error('attendu ' + c + ' à ' + i + ' : ' + src); i++; };
  // Sheets : "" et FALSE -> 0, TRUE -> 1 en arithmétique ; texte non numérique -> #VALUE!.
  // L'erreur est une VALEUR propagée (comme Sheets) : IF n'est en erreur que si la branche choisie l'est.
  const ERR = { error: '#VALUE!' };
  const num = v => Array.isArray(v) ? v.map(num) : v === ERR ? ERR : v === '' || v === false ? 0 : v === true ? 1 : typeof v === 'number' ? v : ERR;
  const arith = f => (x, y) => { const a = num(x), b = num(y); return a === ERR || b === ERR ? ERR : f(a, b); };
  const bin = (a, b, f) => Array.isArray(a) || Array.isArray(b) ? (Array.isArray(a) ? a : b).map((_, k) => f(Array.isArray(a) ? a[k] : a, Array.isArray(b) ? b[k] : b)) : f(a, b);
  const cell = (sheet, ref) => { const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref); const v = book[sheet][m[1] + m[2]]; return v === undefined ? '' : v; };
  const range = (sheet, a, b) => { const ca = /^\$?([A-Z]+)\$?(\d+)$/.exec(a), cb = /^\$?([A-Z]+)\$?(\d*)$/.exec(b); const last = cb[2] ? Number(cb[2]) : book[sheet].__rows; const out = []; for (let r = Number(ca[2]); r <= last; r++) out.push(cell(sheet, ca[1] + r)); return out; };
  function primary() {
    if (peek() === '(') { eat('('); const v = expr(); eat(')'); return v; }
    if (peek() === '"') { i++; let s = ''; while (src[i] !== '"' || src[i + 1] === '"') { if (src[i] === '"') i++; s += src[i++]; } i++; return s; }
    if (peek() === '-') { i++; return bin(primary(), 0, arith(a => -a)); }
    let m = /^\d+(\.\d+)?/.exec(src.slice(i)); if (m) { i += m[0].length; return Number(m[0]); }
    let sheet = here;
    if (peek() === "'") { const j = src.indexOf("'!", i + 1); sheet = src.slice(i + 1, j); i = j + 2; }
    m = /^\$?[A-Z]+\$?\d*(:\$?[A-Z]+\$?\d*)?/.exec(src.slice(i));
    const fm = /^([A-Z]+)\(/.exec(src.slice(i));
    if (fm) { i += fm[1].length; eat('('); const args = []; if (peek() !== ')') { args.push(expr()); while (peek() === ';') { eat(';'); args.push(expr()); } } eat(')'); return call(fm[1], args); }
    if (m && /\d/.test(m[0])) { i += m[0].length; const [a, b] = m[0].split(':'); return b ? range(sheet, a, b) : cell(sheet, a); }
    throw new Error('jeton inattendu à ' + i + ' : ' + src.slice(i, i + 20));
  }
  function call(f, a) {
    if (f === 'IF') { if (a[0] === ERR) return ERR; return a[0] === true || (typeof a[0] === 'number' && a[0] !== 0) ? a[1] : (a.length > 2 ? a[2] : false); }
    if (a.some(x => x === ERR)) return ERR; // les autres fonctions propagent l'erreur
    if (f === 'AND') return a.every(x => x === true || (typeof x === 'number' && x !== 0));
    if (f === 'EXACT') return bin(a[0], a[1], (x, y) => String(x) === String(y));
    if (f === 'ISNUMBER') return typeof a[0] === 'number';
    if (f === 'NOW') return now;
    if (f === 'SUMPRODUCT') { // Sheets : valeurs non numériques (dont booléens) comptées comme 0 dans SUMPRODUCT.
      const arrs = a.map(x => Array.isArray(x) ? x : [x]); let s = 0;
      for (let k = 0; k < arrs[0].length; k++) s += arrs.reduce((p, arr) => p * (typeof arr[k] === 'number' ? arr[k] : 0), 1);
      return s;
    }
    throw new Error('fonction non supportée ' + f);
  }
  function mul() { let v = primary(); while (peek() === '*' || peek() === '/') { const op = src[i++]; const r = primary(); v = bin(v, r, arith((x, y) => op === '*' ? x * y : x / y)); } return v; }
  function add() { let v = mul(); while (peek() === '+' || peek() === '-') { const op = src[i++]; const r = mul(); v = bin(v, r, arith((x, y) => op === '+' ? x + y : x - y)); } return v; }
  function expr() { let v = add(); const m = /^(<=|>=|<>|=|<|>)/.exec(src.slice(i)); if (m) { i += m[0].length; const r = add(); const op = m[0]; v = bin(v, r, (x, y) => { if (x === ERR || y === ERR) return ERR; if (op === '=') return x === y; if (op === '<>') return x !== y; return arith((p, q) => op === '<=' ? p <= q : op === '>=' ? p >= q : op === '<' ? p < q : p > q)(x, y); }); } return v; }
  const v = expr(); if (i !== src.length) throw new Error('reste non analysé : ' + src.slice(i));
  if (v === ERR || (Array.isArray(v) && v.includes(ERR))) throw new Error('#VALUE!');
  return v;
}

const SHEET = 'CEX - Kraken Stocks', DET = 'Portefeuille Action Details';
const NOW = 46000.5, MIN = 1 / 1440;
function book(i1, collectedSerial, holds) {
  const k = { __rows: 6, A3: 'EUR', B3: 100, A4: 'AAPLx', B4: 3, A5: 'BRK.Bx', B5: 2, A6: '.', B6: 'INFO_TOTAL', I1: i1, J1: collectedSerial };
  ['H3', 'H4', 'H5'].forEach((c, n) => { if (holds[n] !== undefined) k[c] = holds[n]; });
  return { [SHEET]: k, [DET]: { __rows: 3, E2: SHEET, F2: 'AAPLx', D2: 10, E3: SHEET, F3: 'EUR', D3: 1, E4: 'CEX - Bitpanda Stocks', F4: 'AAPLx', D4: 10 } };
}
// L reste la formule existante de production K*D (non modifiée par ce chantier).
function evalRow(b, row) {
  const h = harness();
  const f = h.ctx._krakenStocksDetailsFormulas_(row);
  const d = b[DET];
  d['K' + row] = evaluate(f.K, b, DET, NOW);
  d['J' + row] = evaluate(f.J, b, DET, NOW);
  d['H' + row] = evaluate(f.H, b, DET, NOW);
  d['L' + row] = evaluate('=K' + row + '*D' + row, b, DET, NOW);
  return { H: d['H' + row], J: d['J' + row], K: d['K' + row], L: d['L' + row] };
}
const unknownRow = { H: '', J: '', K: 3, L: 30 };
const formulaCases = [
  ['OK frais : Libre = détenu − hold, Lock = hold', 'OK', NOW - 5 * MIN, [1, 1, 0], { H: 2, J: 1, K: 3, L: 30 }],
  ['OK frais, hold 0 explicite', 'OK', NOW - 5 * MIN, [1, 0, 0], { H: 3, J: 0, K: 3, L: 30 }],
  ['UNKNOWN : Libre/Lock inconnus, total et valorisation conservés', 'UNKNOWN', NOW - 5 * MIN, [1, 1, 0], unknownRow],
  ['STALE', 'STALE', NOW - 5 * MIN, [1, 1, 0], unknownRow],
  ['BUSY/échec de cycle : I1 OK resté d\'un ancien succès > 90 min', 'OK', NOW - 120 * MIN, [1, 1, 0], unknownRow],
  ['erreur d\'écriture : I1 OK mais horodatage J1 absent', 'OK', '', [1, 1, 0], unknownRow],
  ['erreur d\'écriture : I1 OK mais horodatage J1 texte', 'OK', '2026-10-25T20:00:00Z', [1, 1, 0], unknownRow],
  ['horodatage futur', 'OK', NOW + 10 * MIN, [1, 1, 0], unknownRow]
];
for (const [name, i1, j1, holds, expected] of formulaCases) test('formules Details évaluées — ' + name, () => {
  const b = book(i1, j1, holds);
  assert.deepEqual(evalRow(b, 2), expected);
  if (expected.J === '') assert.notEqual(evalRow(b, 2).H, 3, 'jamais tout le détenu présenté comme libre');
});
test('formules Details : EUR séparé, ligne non Kraken jamais alimentée', () => {
  const b = book('OK', NOW - 5 * MIN, [20, 1, 0]);
  assert.deepEqual(evalRow(b, 3), { H: 80, J: 20, K: 100, L: 100 });
  assert.deepEqual(evalRow(b, 4), { H: '', J: '', K: 0, L: 0 });
});
test('formules Details : aucune constante injectée hors numéro de ligne, ticker par référence', () => {
  const h = harness();
  const f = h.ctx._krakenStocksDetailsFormulas_(7);
  for (const v of Object.values(f)) assert.doesNotMatch(v, /AAPLx|EUR"|BRK/);
});

// ------------------------------------------------------- projection J1 numérique
test('projection OK écrit J1 en date (numérique Sheets), pas en texte ISO', () => {
  const h = harness();
  const cells = [['', '', '', '', '', '', '', '', 'UNKNOWN'], ['h', 'b'], ['AAPLx', 3]];
  const sheet = { getLastRow: () => cells.length, getRange: (r, c, n = 1, m = 1) => ({
    getValues: () => Array.from({ length: n }, (_, a) => Array.from({ length: m }, (_, k) => (cells[r + a - 1] || [])[c + k - 1] ?? '')),
    setValues: v => v.forEach((row, a) => row.forEach((x, k) => { cells[r + a - 1] ??= []; cells[r + a - 1][c + k - 1] = x; })) }) };
  const collectedAt = Date.now();
  assert.equal(h.ctx._krakenWriteStocksProjection_(sheet, { collectedAt, balance: { status: 'OK', AAPLx: { balance: 3, hold_trade: 1 } }, orders: { status: 'OK', _xstockCount: 0 } }), 'OK');
  assert.equal(cells[0][8], 'OK');
  assert.equal(Object.prototype.toString.call(cells[0][9]), '[object Date]');
  assert.equal(cells[0][9].getTime(), collectedAt);
});

// ------------------------------------------------------------------ version
test('version candidate 4.16.45 (recovery Balance seul), recovery statique Balance seul', () => {
  assert.match(source, /var\s+KRAKEN_SYNC_VERSION\s*=\s*"4\.16\.45"\s*;/);
  assert.match(source.split('\n').slice(0, 6).join('\n'), /v4\.16\.45/);
});
