const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const krakenSource = fs.readFileSync(path.join(root, 'src/41_KRAKEN_SYNC.gs'), 'utf8');
const bitpandaSource = fs.readFileSync(path.join(root, 'src/35_BITPANDA_SYNC.gs'), 'utf8');

function makeHarness(opts) {
  opts = opts || {};
  const props = new Map(opts.props || []);
  let nowMs = opts.nowMs || 1758000000000;
  class FakeDate extends Date {}
  FakeDate.now = () => nowMs;
  const fetchImpl = opts.fetch || function () { throw new Error('unexpected UrlFetchApp.fetch'); };
  const ctx = {
    console,
    JSON,
    Math,
    String,
    Number,
    Array,
    Object,
    Error,
    isFinite,
    parseInt,
    encodeURIComponent,
    Date: FakeDate,
    Logger: { log: function () {} },
    HttpCallCounter: { setTrigger: function () {}, clearTrigger: function () {} },
    PropertiesService: {
      getScriptProperties: function () {
        if (opts.propsUnavailable) throw new Error('properties unavailable');
        return {
          getProperty: function (k) { return props.has(k) ? props.get(k) : null; },
          setProperty: function (k, v) { props.set(k, String(v)); },
        };
      },
      getUserProperties: function () { return { getProperty: function () { return null; }, setProperty: function () {} }; },
      getDocumentProperties: function () { return { getProperty: function () { return null; }, setProperty: function () {} }; },
    },
    ScriptApp: {
      getProjectTriggers: function () { return []; },
      newTrigger: function () { return { timeBased: function () { return { everyHours: function () { return { create: function () {} }; } }; } }; },
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      MacAlgorithm: { HMAC_SHA_512: 'HMAC_SHA_512' },
      computeDigest: function () { return [1, 2, 3]; },
      newBlob: function () { return { getBytes: function () { return [4, 5, 6]; } }; },
      base64Decode: function () { return [7, 8, 9]; },
      computeHmacSignature: function () { return [10, 11, 12]; },
      base64Encode: function () { return 'c2ln'; },
      formatDate: function () { return '2026-09-16 00:00:00'; },
      sleep: function () {},
    },
    UrlFetchApp: { fetch: fetchImpl },
  };
  vm.createContext(ctx);
  vm.runInContext(krakenSource, ctx);
  return { ctx: ctx, props: props, setNow: function (v) { nowMs = v; } };
}

// --- 1. Le nonce doit croitre STRICTEMENT, y compris dans la meme milliseconde ---
{
  const h = makeHarness();
  const n1 = h.ctx._krakenNextNonce_();
  const n2 = h.ctx._krakenNextNonce_();
  const n3 = h.ctx._krakenNextNonce_();
  assert.ok(/^\d+$/.test(n1), 'le nonce doit etre une chaine numerique');
  assert.ok(Number(n2) > Number(n1), 'le nonce doit croitre entre deux appels (meme horloge)');
  assert.ok(Number(n3) > Number(n2), 'le nonce doit croitre a chaque appel');
  assert.equal(h.props.get('KRAKEN_LAST_NONCE'), n3, 'le dernier nonce doit etre persiste en ScriptProperties');
}

// --- 2. Nonce persiste en avance (horloge qui recule / execution anterieure) ---
{
  const nowMs = 1758000000000;
  const stored = nowMs * 1000 + 5000000000;
  const h = makeHarness({ props: [['KRAKEN_LAST_NONCE', String(stored)]], nowMs: nowMs });
  const n = Number(h.ctx._krakenNextNonce_());
  assert.ok(n > stored, 'le nonce doit rester croissant meme si un run precedent a stocke une valeur superieure');
  assert.equal(h.props.get('KRAKEN_LAST_NONCE'), String(n), 'la nouvelle valeur doit remplacer l ancienne');
}

// --- 3. Valeur persistee corrompue: on retombe sur l horloge sans casser ---
{
  const h = makeHarness({ props: [['KRAKEN_LAST_NONCE', 'not-a-number']] });
  const n = h.ctx._krakenNextNonce_();
  assert.ok(/^\d+$/.test(n) && Number(n) > 0, 'un nonce valide doit etre produit malgre une valeur corrompue');
}

// --- 4. ScriptProperties indisponible: jamais d exception, le nonce reste utilisable ---
{
  const h = makeHarness({ propsUnavailable: true });
  let n = null;
  assert.doesNotThrow(function () { n = h.ctx._krakenNextNonce_(); }, 'Properties indisponible ne doit pas lever');
  assert.ok(/^\d+$/.test(n), 'le nonce doit rester une chaine numerique');
}

// --- 5. Les DEUX jobs Kraken partagent le MÊME lock (anti collision de nonce) ---
{
  const h = makeHarness();
  const locks = [];
  h.ctx.CEX_ACQUIRE_LOCK = function (name) { locks.push(name); return false; };
  h.ctx.CEX_RELEASE_LOCK = function (name) { locks.push('release:' + name); };
  assert.equal(h.ctx.UPDATE_KRAKEN_SPOT(), 'BUSY', 'UPDATE_KRAKEN_SPOT doit sortir BUSY quand le lock est pris');
  assert.equal(h.ctx.UPDATE_KRAKEN_STOCKS_FIAT(), 'BUSY', 'UPDATE_KRAKEN_STOCKS_FIAT doit sortir BUSY quand le lock est pris');
  assert.deepEqual(locks, ['KRAKEN', 'KRAKEN'], 'les deux jobs doivent demander le lock partage "KRAKEN" (jamais un lock dedie)');
  assert.ok(!/CEX_ACQUIRE_LOCK\("KRAKEN_STOCKS"\)/.test(krakenSource), 'aucun job ne doit prendre le lock KRAKEN_STOCKS');
}

// --- 6. Temporary lockout: message explicite + aucune boucle de retry ---
{
  const h = makeHarness({
    fetch: function () {
      return {
        getResponseCode: function () { return 200; },
        getContentText: function () { return JSON.stringify({ error: ['EGeneral:Temporary lockout'], result: {} }); },
      };
    },
  });
  assert.throws(
    function () { h.ctx._krakenPrivatePost_('/0/private/Balance', {}, { key: 'k', secret: 'c2VjcmV0' }); },
    function (e) {
      return /Temporary lockout/.test(e.message) && /ne pas relancer/i.test(e.message);
    },
    'un lockout doit lever un message explicite interdisant la relance en boucle'
  );
  assert.ok(
    /msg\.indexOf\("blocked\/null response"\) >= 0/.test(bitpandaSource),
    'le retry CEX ne doit reprendre QUE sur unreachable relay (jamais sur une erreur Kraken)'
  );
}

// --- 7. Un vrai resultat Kraken n est pas affecte par la garde ---
{
  const h = makeHarness({
    fetch: function () {
      return {
        getResponseCode: function () { return 200; },
        getContentText: function () { return JSON.stringify({ error: [], result: { XXBT: '0.5' } }); },
      };
    },
  });
  const r = h.ctx._krakenPrivatePost_('/0/private/Balance', {}, { key: 'k', secret: 'c2VjcmV0' });
  assert.deepEqual(r, { XXBT: '0.5' }, 'un resultat valide doit etre retourne tel quel');
}

console.log('kraken nonce/lock OK');
