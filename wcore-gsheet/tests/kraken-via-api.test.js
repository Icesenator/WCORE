// v4.16.47 - P2-DATA-KRAKEN-VIA-API : en mode KRAKEN_SOURCE=API, le classeur ne parle plus
// a api.kraken.com (aucun nonce, aucune signature, aucune cle envoyee) et garde ses gardes
// locales (pause, budget, compteur de cycle). Absent/DIRECT = appel direct inchange.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const krakenSource = fs.readFileSync(path.join(root, 'src/41_KRAKEN_SYNC.gs'), 'utf8');
const API = 'https://api.example.test';

function harness(opts) {
  opts = opts || {};
  const props = new Map(opts.props || []);
  let nowMs = opts.nowMs || 1790000000000;
  const fetches = [];
  const writes = [];
  class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [nowMs])); } }
  FakeDate.now = () => nowMs;
  FakeDate.parse = Date.parse;
  const ctx = {
    console, JSON, Math, String, Number, Array, Object, Error, isFinite, parseInt, encodeURIComponent,
    Date: FakeDate,
    Logger: { log() {} },
    HttpCallCounter: { setTrigger() {}, clearTrigger() {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => { if (opts.throwOn === k) throw new Error('props down'); return props.has(k) ? props.get(k) : null; },
        setProperty: (k, v) => { props.set(k, String(v)); },
        deleteProperty: (k) => { props.delete(k); },
      }),
      getUserProperties: () => ({ getProperty: () => null, setProperty() {} }),
      getDocumentProperties: () => ({ getProperty: () => null, setProperty() {} }),
    },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => null }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 1 }, MacAlgorithm: { HMAC_SHA_512: 1 },
      computeDigest: () => [1], newBlob: () => ({ getBytes: () => [2] }), base64Decode: () => [3],
      computeHmacSignature: () => [4], base64Encode: () => 'sig', formatDate: () => '2026-11-23 21:30:00', sleep() {},
    },
    UrlFetchApp: {
      fetch(url, options) {
        fetches.push({ url, options });
        if (opts.throwTransport) throw new Error('Address unavailable: ' + url);
        const r = typeof opts.api === 'function' ? opts.api(url) : { code: 200, body: { ok: true, balances: { XXBT: '0.1', ZEUR: '5', 'NVDAx.T': '1' }, fetchedAt: '2026-11-23T20:30:00.000Z', reused: false } };
        return { getResponseCode: () => r.code, getContentText: () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) };
      },
    },
    _cexGetWebApiUrl_: () => (opts.noApiConfig ? null : opts.apiUrl || API),
    _cexGetWebApiToken_: () => (opts.noApiConfig ? null : 'test-gsheet-token-0123456789'),
  };
  vm.createContext(ctx);
  vm.runInContext(krakenSource, ctx);
  if (!opts.realCreds) ctx._krakenGetCreds_ = () => ({ key: 'k', secret: 's' });
  ctx._cexRelayFetchWithRetry_ = (fn) => fn();
  ctx._krakenWriteSheet_ = (ss, sheetName, rows) => { writes.push([sheetName, rows]); return rows.length; };
  return { ctx, props, fetches, writes, now: () => nowMs };
}

const apiMode = [['KRAKEN_SOURCE', 'API']];

test('mode API : Balance lu depuis /api/gsheet/kraken/balances, jamais api.kraken.com, aucun nonce ni cle', () => {
  const h = harness({ props: apiMode });
  const balances = h.ctx._krakenPrivatePost_('/0/private/Balance', {}, { key: 'k', secret: 's' });
  assert.deepEqual(JSON.parse(JSON.stringify(balances)), { XXBT: '0.1', ZEUR: '5', 'NVDAx.T': '1' });
  assert.equal(h.fetches.length, 1);
  assert.equal(h.fetches[0].url, API + '/api/gsheet/kraken/balances');
  assert.equal(h.fetches[0].options.method, 'post');
  assert.equal(h.fetches[0].options.headers['x-gsheet-token'], 'test-gsheet-token-0123456789');
  assert.equal(h.fetches[0].options.headers['API-Key'], undefined, 'la cle Kraken ne part jamais');
  assert.equal(h.fetches[0].options.headers['API-Sign'], undefined);
  assert.equal(h.props.has('KRAKEN_LAST_NONCE'), false, 'aucun nonce consomme cote classeur');
  assert.equal(h.ctx._KRAKEN_CYCLE_PRIVATE_CALLS, 1, 'compte comme un appel prive du cycle');
  assert.equal(String(h.props.get('KRAKEN_PRIVATE_CALLS_24H')).split(',').length, 1, 'compte dans le budget 24 h');
  assert.equal(JSON.parse(h.props.get('KRAKEN_LAST_SUCCESS')).kind, 'SUCCESS');
});

test('mode API : UPDATE_KRAKEN_SPOT ecrit Crypto et Stocks a partir des quantites de l API (classement inchange)', () => {
  const h = harness({ props: apiMode });
  const out = JSON.parse(h.ctx.UPDATE_KRAKEN_SPOT());
  assert.equal(out.ok, true);
  assert.equal(h.fetches.filter((f) => f.url.indexOf('api.kraken.com') >= 0).length, 0);
  const crypto = h.writes.find((w) => w[0] === 'CEX - Kraken Crypto')[1];
  const stocks = h.writes.find((w) => w[0] === 'CEX - Kraken Stocks')[1];
  assert.deepEqual(JSON.parse(JSON.stringify(crypto)), [['BTC', 0.1]]);
  assert.deepEqual(JSON.parse(JSON.stringify(stocks)).map((r) => r[0]).sort(), ['EUR', 'NVDAx'].sort());
});

test('sans KRAKEN_SOURCE (ou DIRECT) : appel direct inchange, l API n est pas appelee', () => {
  for (const props of [[], [['KRAKEN_SOURCE', 'DIRECT']], [['KRAKEN_SOURCE', ' direct ']]]) {
    const h = harness({ props, api: () => ({ code: 200, body: { error: [], result: { XXBT: '0.1' } } }) });
    h.ctx._krakenPrivatePost_('/0/private/Balance', {}, { key: 'k', secret: 's' });
    assert.equal(h.fetches.length, 1);
    assert.equal(h.fetches[0].url, 'https://api.kraken.com/0/private/Balance');
    assert.ok(h.props.has('KRAKEN_LAST_NONCE'));
  }
});

test('mode API : pause renvoyee par l API = pause locale armee a la meme heure, puis aucun appel', () => {
  const nowMs = 1790000000000;
  const resumeAt = new Date(nowMs + 42 * 60000).toISOString();
  const h = harness({ nowMs, props: apiMode, api: () => ({ code: 503, body: { ok: false, error: 'kraken_paused', resumeAt } }) });
  assert.throws(() => h.ctx._krakenPrivatePost_('/0/private/Balance', {}, null), /Temporary lockout/);
  assert.equal(h.props.get('KRAKEN_LOCKOUT_UNTIL_MS'), String(nowMs + 42 * 60000));
  assert.equal(JSON.parse(h.props.get('KRAKEN_LAST_REMOTE_ERROR')).kind, 'TEMPORARY_LOCKOUT');
  assert.throws(() => h.ctx._krakenPrivatePost_('/0/private/Balance', {}, null), /Kraken en pause/);
  assert.equal(h.fetches.length, 1, 'pendant la pause, ni API ni Kraken');
});

test('mode API : fin de pause aberrante bornee a +2 h, absente = 60 min', () => {
  const nowMs = 1790000000000;
  const far = harness({ nowMs, props: apiMode, api: () => ({ code: 503, body: { ok: false, error: 'kraken_paused', resumeAt: new Date(nowMs + 99 * 3600000).toISOString() } }) });
  assert.throws(() => far.ctx._krakenPrivatePost_('/0/private/Balance', {}, null));
  assert.equal(far.props.get('KRAKEN_LOCKOUT_UNTIL_MS'), String(nowMs + 2 * 3600000));
  const none = harness({ nowMs, props: apiMode, api: () => ({ code: 503, body: { ok: false, error: 'kraken_paused' } }) });
  assert.throws(() => none.ctx._krakenPrivatePost_('/0/private/Balance', {}, null));
  assert.equal(none.props.get('KRAKEN_LOCKOUT_UNTIL_MS'), String(nowMs + 3600000));
});

test('mode API : refus et erreurs = messages fixes, sans motif de rejeu automatique', () => {
  const transient = /blocked\/null response|Address unavailable:|timed out|Service Spreadsheets|Service invoked too many times|internal error|^BUSY$/i;
  const cases = [
    [{ code: 409, body: { ok: false, error: 'kraken_busy' } }, /rate limit \(kraken_busy\)/, 'RATE_LIMIT'],
    [{ code: 429, body: { ok: false, error: 'kraken_too_soon' } }, /rate limit \(kraken_too_soon\)/, 'RATE_LIMIT'],
    [{ code: 502, body: { ok: false, error: 'credentials_rejected' } }, /authentication refusee/, 'AUTH'],
    [{ code: 502, body: { ok: false, error: 'exchange_unreachable' } }, /HTTP 502 \(exchange_unreachable\)/, 'HTTP'],
    [{ code: 500, body: '<html>internal error timed out</html>' }, /HTTP 500$/, 'HTTP'],
    [{ code: 503, body: { ok: false, error: 'Bad <script>' } }, /HTTP 503$/, 'HTTP'],
  ];
  for (const [resp, re, kind] of cases) {
    const h = harness({ props: apiMode, api: () => resp });
    let err;
    try { h.ctx._krakenPrivatePost_('/0/private/Balance', {}, null); } catch (e) { err = e; }
    assert.ok(err, 'doit echouer');
    assert.match(err.message, re);
    assert.equal(transient.test(err.message), false, err.message);
    assert.equal(JSON.parse(h.props.get('KRAKEN_LAST_REMOTE_ERROR')).kind, kind);
    assert.equal(h.props.has('KRAKEN_LOCKOUT_UNTIL_MS'), false);
  }
  const t = harness({ props: apiMode, throwTransport: true });
  assert.throws(() => t.ctx._krakenPrivatePost_('/0/private/Balance', {}, null), (e) => /erreur transport \(aucun rejeu\)/.test(e.message) && !transient.test(e.message));
});

test('mode API : API non configuree = refus local, aucun appel ni compteur consomme', () => {
  const h = harness({ props: apiMode, noApiConfig: true });
  assert.throws(() => h.ctx._krakenPrivatePost_('/0/private/Balance', {}, null), /non configuree \(aucun appel envoye\)/);
  assert.equal(h.fetches.length, 0);
  assert.equal(h.props.has('KRAKEN_PRIVATE_CALLS_24H'), false);
});

test('mode API : seul Balance est relaye, tout autre chemin prive est refuse sans appel', () => {
  const h = harness({ props: apiMode });
  assert.throws(() => h.ctx._krakenPrivatePost_('/0/private/OpenOrders', {}, null), /seul Balance est relaye/);
  assert.equal(h.fetches.length, 0);
});

test('mode API : budget 24 h epuise = aucun appel API', () => {
  const nowMs = 1790000000000;
  const used = Array.from({ length: 220 }, (_, i) => String(nowMs - 1000 - i)).join(',');
  const h = harness({ nowMs, props: apiMode.concat([['KRAKEN_PRIVATE_CALLS_24H', used]]) });
  assert.throws(() => h.ctx._krakenPrivatePost_('/0/private/Balance', {}, null), /Budget appels prives Kraken epuise/);
  assert.equal(h.fetches.length, 0);
});

test('SET_KRAKEN_SOURCE bascule et revient en arriere, valeurs inconnues refusees ; KRAKEN_BUDGET_STATUS expose la source', () => {
  const h = harness();
  assert.equal(JSON.parse(h.ctx.KRAKEN_BUDGET_STATUS()).source, 'DIRECT');
  assert.equal(h.ctx.SET_KRAKEN_SOURCE('api'), 'OK: KRAKEN_SOURCE=API');
  assert.equal(JSON.parse(h.ctx.KRAKEN_BUDGET_STATUS()).source, 'API');
  assert.equal(h.ctx.SET_KRAKEN_SOURCE('DIRECT'), 'OK: KRAKEN_SOURCE=DIRECT');
  assert.throws(() => h.ctx.SET_KRAKEN_SOURCE('both'), /API ou DIRECT/);
  assert.equal(h.props.get('KRAKEN_SOURCE'), 'DIRECT');
  assert.equal(h.fetches.length, 0, 'basculer n appelle rien');
});

test('source inconnue ou illisible : aucun envoi, ni Kraken ni API', () => {
  for (const opts of [{ props: [['KRAKEN_SOURCE', 'api-typo']] }, { props: [['KRAKEN_SOURCE', 'BOTH']] }, { throwOn: 'KRAKEN_SOURCE' }]) {
    const h = harness(opts);
    assert.throws(() => h.ctx._krakenPrivatePost_('/0/private/Balance', {}, { key: 'k', secret: 's' }), /source illisible \(KRAKEN_SOURCE doit valoir API ou DIRECT, aucun appel envoye\)/);
    assert.equal(h.fetches.length, 0);
    assert.equal(h.props.has('KRAKEN_LAST_NONCE'), false, 'aucun nonce consomme');
    if (!opts.throwOn) assert.equal(JSON.parse(h.props.get('KRAKEN_LAST_LOCAL_REFUSAL')).kind, 'SOURCE_UNKNOWN');
  }
  assert.equal(JSON.parse(harness({ props: [['KRAKEN_SOURCE', 'x']] }).ctx.KRAKEN_BUDGET_STATUS()).source, 'UNKNOWN');
});

test('mode API : la cle Kraken locale n est ni lue ni exigee', () => {
  const h = harness({ props: apiMode, realCreds: true });
  assert.equal(h.ctx._krakenGetCreds_(), null);
  const out = JSON.parse(h.ctx.UPDATE_KRAKEN_SPOT());
  assert.equal(out.ok, true, 'sans cle locale, le mode API fonctionne');
  const direct = harness({ realCreds: true });
  assert.throws(() => direct.ctx._krakenGetCreds_(), /Missing KRAKEN_API_KEY/);
  assert.throws(() => direct.ctx._krakenPrivatePost_('/0/private/Balance', {}, null), /cle locale absente \(aucun appel envoye\)/);
  assert.equal(direct.fetches.length, 0);
});

test('mode API : HTTPS obligatoire, aucune redirection suivie', () => {
  const h = harness({ props: apiMode, apiUrl: 'http://api.example.test' });
  assert.throws(() => h.ctx._krakenPrivatePost_('/0/private/Balance', {}, null), /URL non HTTPS refusee \(aucun appel envoye\)/);
  assert.equal(h.fetches.length, 0);
  const ok = harness({ props: apiMode });
  ok.ctx._krakenPrivatePost_('/0/private/Balance', {}, null);
  assert.equal(ok.fetches[0].options.followRedirects, false);
});

test('mode API : continuite du nonce dans les deux sens (plancher envoye, nonce de l API adopte)', () => {
  const gasLast = '1790000000000000';
  const apiNonce = '1790000000500000';
  const h = harness({ props: apiMode.concat([['KRAKEN_LAST_NONCE', gasLast]]), api: () => ({ code: 200, body: { ok: true, balances: { XXBT: '1' }, fetchedAt: '2026-11-23T20:30:00.000Z', reused: false, nonce: apiNonce } }) });
  h.ctx._krakenPrivatePost_('/0/private/Balance', {}, null);
  assert.deepEqual(JSON.parse(h.fetches[0].options.payload), { nonceFloor: gasLast });
  assert.equal(h.props.get('KRAKEN_LAST_NONCE'), apiNonce, 'un retour en DIRECT repartira au-dessus du dernier nonce de l API');
  // Nonce plus ancien ou invalide : jamais de recul.
  const older = harness({ props: apiMode.concat([['KRAKEN_LAST_NONCE', apiNonce]]), api: () => ({ code: 200, body: { ok: true, balances: {}, nonce: gasLast } }) });
  older.ctx._krakenPrivatePost_('/0/private/Balance', {}, null);
  assert.equal(older.props.get('KRAKEN_LAST_NONCE'), apiNonce);
  const bad = harness({ props: apiMode, api: () => ({ code: 200, body: { ok: true, balances: {}, nonce: '99999999999999999999' } }) });
  bad.ctx._krakenPrivatePost_('/0/private/Balance', {}, null);
  assert.equal(bad.props.has('KRAKEN_LAST_NONCE'), false);
  // Puis retour en DIRECT : le nonce direct depasse celui de l API.
  h.props.set('KRAKEN_SOURCE', 'DIRECT');
  h.ctx._krakenPrivatePost_('/0/private/Balance', {}, { key: 'k', secret: 's' });
  assert.ok(Number(h.props.get('KRAKEN_LAST_NONCE')) > Number(apiNonce));
});

test('mode API : une pause impossible a enregistrer localement est signalee', () => {
  const h = harness({ props: apiMode, api: () => ({ code: 503, body: { ok: false, error: 'kraken_paused', resumeAt: '2026-11-23T21:00:00.000Z' } }) });
  const orig = h.ctx.PropertiesService.getScriptProperties;
  h.ctx.PropertiesService.getScriptProperties = () => { const p = orig(); return Object.assign({}, p, { setProperty: (k, v) => { if (k === 'KRAKEN_LOCKOUT_UNTIL_MS') throw new Error('quota'); p.setProperty(k, v); } }); };
  assert.throws(() => h.ctx._krakenPrivatePost_('/0/private/Balance', {}, null), /pause locale NON enregistree/);
});

test('diagnostics : aucune quantite dans le journal', () => {
  const logs = [];
  const h = harness({ api: () => ({ code: 200, body: { error: [], result: { XXBT: '0.123456', ZEUR: '7.89', 'NVDAx.T': '3.21' } } }) });
  h.ctx.Logger = { log: (m) => logs.push(String(m)) };
  h.ctx.DIAG_KRAKEN_LOOP();
  h.ctx._krakenInvalidateDiagCache_();
  h.ctx.DIAG_KRAKEN_TICKERS();
  h.ctx._krakenInvalidateDiagCache_();
  h.ctx.DIAG_KRAKEN_API();
  const text = logs.join('\n');
  assert.ok(text.length > 0);
  for (const amount of ['0.123456', '7.89', '3.21']) assert.equal(text.includes(amount), false, amount);
});

test('retour en DIRECT : drainage tant qu un appel API n est pas confirme (transport perdu, reponse illisible)', () => {
  for (const opts of [{ throwTransport: true }, { api: () => ({ code: 502, body: '<html>bad gateway</html>' }) }]) {
    const nowMs = 1790000000000;
    const h = harness(Object.assign({ nowMs, props: apiMode.slice() }, opts));
    assert.throws(() => h.ctx._krakenPrivatePost_('/0/private/Balance', {}, null));
    assert.equal(h.props.get('KRAKEN_API_UNSETTLED_MS'), String(nowMs), 'issue inconnue : drainage arme');
    h.props.set('KRAKEN_SOURCE', 'DIRECT');
    const before = h.fetches.length;
    assert.throws(() => h.ctx._krakenPrivatePost_('/0/private/Balance', {}, { key: 'k', secret: 's' }), /retour direct differe : appel API non confirme/);
    assert.equal(h.fetches.length, before, 'aucune signature directe pendant le drainage');
    assert.equal(JSON.parse(h.ctx.KRAKEN_BUDGET_STATUS()).api_drain_until_ms, nowMs + 3720000);
  }
});

test('drainage leve seulement par une issue confirmee (succes avec nonce garde, pause enregistree) ; toute issue ambigue le garde', () => {
  const ok = harness({ props: apiMode, api: () => ({ code: 200, body: { ok: true, balances: {}, nonce: '1790000000000001' } }) });
  ok.ctx._krakenPrivatePost_('/0/private/Balance', {}, null);
  assert.equal(ok.props.has('KRAKEN_API_UNSETTLED_MS'), false);
  const busy = harness({ props: apiMode, api: () => ({ code: 409, body: { ok: false, error: 'kraken_busy' } }) });
  assert.throws(() => busy.ctx._krakenPrivatePost_('/0/private/Balance', {}, null));
  assert.equal(busy.props.has('KRAKEN_API_UNSETTLED_MS'), true, 'busy : un envoi precedent peut etre en cours');
  for (const err of ['kraken_too_soon', 'exchange_unreachable', 'rate_limited_by_exchange', 'credentials_rejected']) {
    const h = harness({ props: apiMode, api: () => ({ code: 502, body: { ok: false, error: err } }) });
    assert.throws(() => h.ctx._krakenPrivatePost_('/0/private/Balance', {}, null));
    assert.equal(h.props.has('KRAKEN_API_UNSETTLED_MS'), true, err);
  }
  const paused = harness({ props: apiMode, api: () => ({ code: 503, body: { ok: false, error: 'kraken_paused', resumeAt: new Date(1790000000000 + 60000).toISOString() } }) });
  assert.throws(() => paused.ctx._krakenPrivatePost_('/0/private/Balance', {}, null));
  assert.equal(paused.props.has('KRAKEN_API_UNSETTLED_MS'), false, 'pause enregistree localement : issue confirmee');
  const noNonce = harness({ props: apiMode, api: () => ({ code: 200, body: { ok: true, balances: {} } }) });
  noNonce.ctx._krakenPrivatePost_('/0/private/Balance', {}, null);
  assert.equal(noNonce.props.has('KRAKEN_API_UNSETTLED_MS'), true, 'nonce de l API non garde : le drainage reste arme');
});

test('DIAG_KRAKEN_XSTOCK_PRICES : symboles seulement, aucune quantite', () => {
  const h = harness({ api: () => ({ code: 200, body: { error: [], result: { 'NVDAx.T': '3.21' } } }) });
  h.ctx._krakenFetchXStockPricesUsd_ = () => ({});
  const out = h.ctx.DIAG_KRAKEN_XSTOCK_PRICES();
  assert.equal(out.includes('3.21'), false, out);
  assert.deepEqual(JSON.parse(out).symbols, ['NVDAx']);
});
