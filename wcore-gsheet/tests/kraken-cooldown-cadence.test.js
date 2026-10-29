'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/41_KRAKEN_SYNC.gs'), 'utf8');
const cex = fs.readFileSync(path.join(__dirname, '../src/35_BITPANDA_SYNC.gs'), 'utf8');
const MIN = 60000, HOUR = 60 * MIN, START = Date.UTC(2026, 9, 25, 12, 43, 52);
function harness(props = new Map(), time = START) {
  let now = time, response = { error: [], result: {} }, allowed = false, duration = 0;
  const calls = [], writes = [];
  const store = { getProperty: k => props.get(k) || null, setProperty: (k, v) => props.set(k, String(v)), deleteProperty: k => props.delete(k) };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const ctx = { Date: Clock, Logger: { log() {} }, PropertiesService: {
    getScriptProperties: () => store, getUserProperties: () => ({ getProperty: () => null, setProperty() {} }),
    getDocumentProperties: () => ({ getProperty: () => null, setProperty() {} }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { getUuid: () => 'synthetic-owner', sleep() {}, formatDate: d => d.toISOString() },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => null }) },
    HttpCallCounter: { setTrigger() {}, clearTrigger() {} },
    UrlFetchApp: { fetch(url, options) {
      assert.equal(allowed, true, 'fetch interdit dans cet etat');
      // Incrément 3 : AssetPairs public n'est pas un appel privé ; OpenOrders vide synthétique.
      if (url.indexOf('/0/public/AssetPairs') >= 0) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ error: [], result: {} }) };
      calls.push({ url, nonce: Number(new URLSearchParams(options.payload).get('nonce')) });
      now += duration;
      if (response instanceof Error) throw response;
      const body = url.endsWith('/OpenOrders') && response.result && !response.result.open && !(response.error || []).length ? { error: [], result: { open: {} } } : response;
      return { getResponseCode: () => response.http || 200, getContentText: () => JSON.stringify(body) };
    } }
  };
  vm.createContext(ctx);
  // Vrais locks/leases et vrai wrapper retry du module 35, sans son code non pertinent.
  vm.runInContext(cex.slice(cex.indexOf('var _CEX_LOCK_TTL_MS'), cex.indexOf('function CEX_RELEASE_LOCK')) +
    cex.slice(cex.indexOf('function CEX_RELEASE_LOCK'), cex.indexOf('\nfunction ', cex.indexOf('function CEX_RELEASE_LOCK') + 10)) +
    cex.slice(cex.indexOf('var CEX_RELAY_MAX_RETRIES')), ctx);
  vm.runInContext(source, ctx);
  ctx._krakenSign_ = () => 'synthetic-signature';
  ctx._krakenGetCreds_ = () => ({ key: 'synthetic-api-key', secret: 'synthetic-private-key' });
  ctx._krakenWriteSheet_ = (ss, name, rows) => { writes.push(name); return rows.length; };
  return { ctx, props, calls, writes, now: () => now, at: t => { now = t; },
    reply: (r, ms = 0) => { response = r; duration = ms; allowed = true; }, forbid: () => { allowed = false; },
    status: () => JSON.parse(ctx.KRAKEN_BUDGET_STATUS()),
    post: () => ctx._krakenPrivatePost_('/0/private/Balance', {}, ctx._krakenGetCreds_()) };
}
function lockout(h, ms = 0) {
  h.reply({ error: ['EGeneral:Temporary lockout'], result: {} }, ms);
  const out = JSON.parse(h.ctx.UPDATE_KRAKEN_SPOT());
  assert.equal(out.ok, false);
  assert.equal(h.calls.length, 1, 'lockout jamais retry');
  h.forbid();
  return h.now();
}
test('pause 60 min armee a la reception du lockout, pas au debut du cycle', () => {
  const h = harness(); const received = lockout(h, 2 * MIN);
  assert.equal(Number(h.props.get('KRAKEN_LOCKOUT_UNTIL_MS')), received + HOUR);
});
// Revue de securite ses_e8c71002dffe5KwOD2jKxneNuO : le cooldown est REVERTI a 60 min
// (LOCKOUT_COOLDOWN_MS = 3600000), identique au LIVE 4.16.43. Gain d'une pause 55 min = 0 :
// le trigger est everyHours(1) (minute fixe). Si le lockout est arme en H+6, une pause de
// 55 min expire en H+61 donc le trigger H+60 est refuse et le prochain H+120 -> 114 min de
// silence, identique au cas 60 min (H+66 -> H+120 = 114 min). En plus, si le ban Kraken
// dure 55-60 min, la pause de 55 min expire avant la fin du ban et relance un appel interdit.
// Les 60 min actuels couvrent la borne superieure de la doc Kraken (~15-60 min).
// Consequence : le cycle H+1 n'est PAS garanti de reprendre ; le prochain passage utile est
// H+120 (2 h de silence), meme chose qu'avec 60 min. Ci-dessous, verification de cette
// borne : a la reception d'un lockout, le cycle H+1 est refuse, et le H+120 reprend.
for (const jitter of [-120000, -5000, 0, 5000]) {
  test(`cycle H+1 refuse (cooldown 60 min), reprise H+120 avec gigue ${jitter} ms`, () => {
    const h = harness(); lockout(h, 2 * MIN);
    h.at(START + HOUR + jitter); h.reply({ error: [], result: {} });
    assert.throws(() => h.ctx._krakenPrivatePost_('/0/private/Balance', {}, h.ctx._krakenGetCreds_()), /pause/);
    assert.equal(h.calls.length, 1, 'un seul appel pendant le lockout, pas de retry');
    h.forbid();
    // Le cycle H+120 (2 h apres le debut) est au-dela de la pause (H+2+60 = H+62).
    h.at(START + 2 * HOUR + jitter); h.reply({ error: [], result: {} });
    assert.equal(JSON.parse(h.ctx.UPDATE_KRAKEN_SPOT()).ok, true);
    // Recovery : un appel Balance par cycle utile.
    assert.equal(h.calls.length, 2, 'un appel prive par cycle utile');
    h.forbid();
    assert.equal(JSON.parse(h.ctx.UPDATE_KRAKEN_STOCKS_FIAT({ triggerUid: 'synthetic' })).skipped, 'shared_balance_recent');
    assert.equal(h.calls.length, 2);
    assert.equal(h.props.has('CEX_LOCK_KRAKEN'), false, 'lease liberee');
  });
}

for (const delta of [-120000, -5000, -1, 0, 5000, 120000]) {
  test(`frontiere stricte expiration ${delta} ms, redemarrage et UTC`, () => {
    const first = harness(); const received = lockout(first);
    const until = received + HOUR;
    const h = harness(first.props, until + delta); // nouvelle VM, aucune memoire d execution
    const before = h.props.get('KRAKEN_LAST_NONCE');
    if (delta < 0) {
      assert.throws(h.post, /pause apres Temporary lockout/);
      assert.equal(h.calls.length, 0);
      assert.equal(h.props.get('KRAKEN_LAST_NONCE'), before);
      assert.equal(h.status().private_calls_24h, 1);
      assert.equal(h.status().lastLocalRefusal.kind, 'LOCKOUT_COOLDOWN');
    } else {
      h.reply({ error: [], result: {} }); h.post();
      assert.equal(h.calls.length, 1);
      assert.ok(h.calls[0].nonce > Number(before));
      assert.equal(h.status().lastSuccess.ts, new Date(until + delta).toISOString());
    }
    assert.equal(h.status().lockout_until_ms, until, 'expiration persistante meme apres reprise');
    assert.equal(h.status().lastRemoteError.kind, 'TEMPORARY_LOCKOUT');
    assert.equal(h.status().lastRemoteError.ts, new Date(received).toISOString());
  });
}
test('nouveau lockout rearme, refus local preserve cause et succes, diagnostic readonly', () => {
  const h = harness(); lockout(h);
  const error = h.status().lastRemoteError;
  h.at(START + 10 * MIN); assert.throws(h.post, /pause/);
  assert.deepEqual(h.status().lastRemoteError, error);
  h.at(START + HOUR); h.reply({ error: [], result: {} }); h.post();
  const success = h.status().lastSuccess;
  h.reply({ error: ['EGeneral:Temporary lockout'] });
  assert.throws(h.post, /Temporary lockout/);
  assert.equal(Number(h.props.get('KRAKEN_LOCKOUT_UNTIL_MS')), h.now() + HOUR);
  h.forbid(); assert.throws(h.post, /pause/);
  assert.deepEqual(h.status().lastSuccess, success);
  const snapshot = [...h.props]; h.status(); h.status();
  assert.deepEqual([...h.props], snapshot, 'diagnostic necrit rien');
  assert.equal(h.status().private_calls_24h, 3);
  assert.equal(h.status().private_budget_max, 220);
});
test('lock partage bloque execution reentrante, nonce monotone malgre recul horloge', () => {
  const h = harness(); h.reply({ error: [], result: {} });
  const write = h.ctx._krakenWriteSheet_;
  h.ctx._krakenWriteSheet_ = (...args) => {
    assert.equal(h.ctx.UPDATE_KRAKEN_STOCKS_FIAT(), 'BUSY');
    return write(...args);
  };
  assert.equal(JSON.parse(h.ctx.UPDATE_KRAKEN_SPOT()).ok, true);
  const firstNonce = h.calls[0].nonce;
  const history = h.props.get('KRAKEN_PRIVATE_CALLS_24H');
  h.at(START - 1000);
  assert.throws(h.post, /compteur prive indisponible/, 'compteur futur après recul horloge : admission refusée');
  assert.equal(h.calls.length, 1, 'aucun fetch supplémentaire sur compteur futur');
  assert.equal(h.props.get('KRAKEN_PRIVATE_CALLS_24H'), history, 'historique conservé');
  // Le générateur de nonce reste monotone indépendamment du refus de budget.
  const next = Number(h.ctx._krakenNextNonce_());
  assert.ok(next > firstNonce);
});
test('budget epuise inchange, aucun fetch ni nonce et refus local distinct', () => {
  const h = harness(); h.props.set('KRAKEN_PRIVATE_CALLS_24H', Array(220).fill(START).join(','));
  assert.throws(h.post, /Budget appels prives/);
  assert.equal(h.calls.length, 0); assert.equal(h.props.has('KRAKEN_LAST_NONCE'), false);
  assert.equal(h.status().lastLocalRefusal.kind, 'PRIVATE_BUDGET');
});
for (const [message, kind] of [['EAPI:Invalid nonce', 'INVALID_NONCE'], ['EAPI:Rate limit exceeded', 'RATE_LIMIT'],
  ['EAPI:Invalid key', 'AUTH'], ['unknown', 'OTHER'], ['EGeneral:Temporary lockout', 'TEMPORARY_LOCKOUT']]) {
  test(`preuve distante allowlist ${kind}, jamais message brut ni secret`, () => {
    const h = harness();
    h.reply({ error: [message + ' synthetic-api-key synthetic-private-key synthetic-signature nonce=12345 ' + 'x'.repeat(500)] });
    assert.throws(h.post);
    const st = h.status(); assert.equal(st.lastRemoteError.kind, kind);
    assert.deepEqual(Object.keys(st.lastRemoteError).sort(), ['kind', 'ts']);
    const exposed = JSON.stringify(st);
    assert.doesNotMatch(exposed, /synthetic-|nonce|12345|xxxxx/);
    assert.ok(h.props.get('KRAKEN_LAST_REMOTE_ERROR').length < 100);
  });
}
test('HTTP et erreur transport classes sans contenu distant', () => {
  for (const response of [{ http: 503, error: [], sensitive: 'synthetic-secret' }, new Error('synthetic-secret')]) {
    const h = harness(); h.reply(response); assert.throws(h.post);
    assert.equal(h.status().lastRemoteError.kind, response instanceof Error ? 'OTHER' : 'HTTP');
    assert.doesNotMatch(JSON.stringify(h.status()), /synthetic-secret/);
  }
});
test('une pause historique de 60 min deja armee nest jamais raccourcie', () => {
  const h = harness(new Map([['KRAKEN_LOCKOUT_UNTIL_MS', String(START + HOUR)]]), START + 58 * MIN);
  assert.throws(h.post, /pause/); assert.equal(h.calls.length, 0);
  assert.equal(h.status().lockout_until_ms, START + HOUR);
});
test('limite explicite : reception tardive de 6 min conserve la pause au cycle trop precoce', () => {
  const h = harness(); lockout(h, 6 * MIN);
  h.at(START + HOUR - 2 * MIN);
  assert.throws(h.post, /pause/); assert.equal(h.calls.length, 1);
});
test('diagnostic filtre les proprietes evenement malformees et leurs champs supplementaires', () => {
  const h = harness();
  h.props.set('KRAKEN_LAST_REMOTE_ERROR', JSON.stringify({ ts: new Date(START).toISOString(), kind: 'OTHER', message: 'synthetic-secret' }));
  assert.deepEqual(Object.keys(h.status().lastRemoteError).sort(), ['kind', 'ts']);
  h.props.set('KRAKEN_LAST_SUCCESS', JSON.stringify({ ts: 'synthetic-secret', kind: 'SUCCESS' }));
  assert.equal(h.status().lastSuccess, null);
  assert.doesNotMatch(JSON.stringify(h.status()), /synthetic-secret/);
});
test('A1 refuse pendant pause sans queue ni fetch, preserve preuve distante', () => {
  const h = harness(); lockout(h);
  let queued = false;
  h.ctx.CEX_QUEUE_OR_MARK_MANUAL_JOB = () => { queued = true; };
  const cell = { setValue() { return this; }, setNumberFormat() { return this; } };
  const sheet = { getName: () => 'CEX - Kraken Stocks', getRange: () => cell };
  assert.equal(h.ctx.KRAKEN_ON_EDIT({ value: 'TRUE', triggerUid: 'synthetic', range: { getA1Notation: () => 'A1', getSheet: () => sheet, setValue() {} } }), true);
  assert.equal(queued, false); assert.equal(h.calls.length, 1);
  assert.equal(h.status().lastRemoteError.kind, 'TEMPORARY_LOCKOUT');
  assert.equal(h.status().lastLocalRefusal.kind, 'LOCKOUT_COOLDOWN');
});
