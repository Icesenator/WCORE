const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const krakenSource = fs.readFileSync(path.join(root, 'src/41_KRAKEN_SYNC.gs'), 'utf8');
const HOUR = 3600000;

function harness(opts) {
  opts = opts || {};
  const props = new Map(opts.props || []);
  let nowMs = opts.nowMs || 1790000000000;
  const fetches = [];
  const writes = [];
  class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [nowMs])); } }
  FakeDate.now = () => nowMs;
  const ctx = {
    console, JSON, Math, String, Number, Array, Object, Error, isFinite, parseInt, encodeURIComponent,
    Date: FakeDate,
    Logger: { log() {} },
    HttpCallCounter: { setTrigger() {}, clearTrigger() {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => { props.set(k, String(v)); },
        deleteProperty: (k) => { props.delete(k); },
      }),
      getUserProperties: () => ({ getProperty: () => null, setProperty() {} }),
      getDocumentProperties: () => ({ getProperty: () => null, setProperty() {} }),
    },
    SpreadsheetApp: { openById: () => ({}) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 1 }, MacAlgorithm: { HMAC_SHA_512: 1 },
      computeDigest: () => [1], newBlob: () => ({ getBytes: () => [2] }), base64Decode: () => [3],
      computeHmacSignature: () => [4], base64Encode: () => 'sig', formatDate: () => '2026-09-28 20:00:00', sleep() {},
    },
    UrlFetchApp: {
      fetch(url) {
        fetches.push(url);
        const body = opts.lockout
          ? { error: ['EGeneral:Temporary lockout'], result: {} }
          : { error: [], result: { XXBT: '0.1', ZEUR: '5', 'NVDAx.T': '1' } };
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify(body) };
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(krakenSource, ctx);
  ctx._krakenGetCreds_ = () => ({ key: 'k', secret: 's' });
  ctx._cexRelayFetchWithRetry_ = (fn) => fn();
  ctx._krakenWriteSheet_ = (ss, sheetName, rows) => {
    if (opts.failStocksWrite && sheetName === 'CEX - Kraken Stocks') throw new Error('stocks write failed');
    writes.push(sheetName);
    return rows.length;
  };
  return { ctx, props, fetches, writes, setNow: (v) => { nowMs = v; }, now: () => nowMs };
}

// 1. Un lockout arme une pause persistante de 60 minutes.
{
  const h = harness({ lockout: true });
  assert.throws(() => h.ctx._krakenPrivatePost_('/0/private/Balance', {}, { key: 'k', secret: 's' }), /Temporary lockout/);
  assert.equal(h.props.get('KRAKEN_LOCKOUT_UNTIL_MS'), String(h.now() + HOUR), 'le lockout doit armer une pause de 60 min');
}

// 2. Pendant la pause, aucun appel prive Kraken n est emis.
{
  const nowMs = 1790000000000;
  const h = harness({ nowMs, props: [['KRAKEN_LOCKOUT_UNTIL_MS', String(nowMs + 10 * 60000)]] });
  assert.throws(() => h.ctx._krakenPrivatePost_('/0/private/Balance', {}, { key: 'k', secret: 's' }), /Kraken en pause apres Temporary lockout/);
  assert.equal(h.fetches.length, 0, 'aucun fetch pendant la pause');
  const out = JSON.parse(h.ctx.UPDATE_KRAKEN_SPOT());
  assert.equal(out.ok, false, 'la pause est un echec visible, jamais un succes');
  assert.equal(h.fetches.length, 0, 'UPDATE_KRAKEN_SPOT ne doit pas appeler Kraken pendant la pause');
  assert.equal(h.writes.length, 0, 'les lignes existantes ne sont pas reecrites pendant la pause');
}

// 3. Apres la pause, l appel reprend normalement.
{
  const nowMs = 1790000000000;
  const h = harness({ nowMs, props: [['KRAKEN_LOCKOUT_UNTIL_MS', String(nowMs - 1)]] });
  const r = h.ctx._krakenPrivatePost_('/0/private/Balance', {}, { key: 'k', secret: 's' });
  assert.equal(r.XXBT, '0.1');
  assert.equal(h.fetches.length, 1);
}

// 4. Un seul appel Balance alimente Crypto ET Stocks.
{
  const h = harness();
  const out = JSON.parse(h.ctx.UPDATE_KRAKEN_SPOT());
  assert.equal(out.ok, true);
  const privateCalls = h.fetches.filter((u) => u.indexOf('/0/private/') >= 0);
  assert.equal(privateCalls.length, 1, 'un seul appel prive');
  assert.deepEqual(h.writes, ['CEX - Kraken Crypto', 'CEX - Kraken Stocks']);
  assert.equal(h.props.get('KRAKEN_SHARED_BALANCE_OK_MS'), String(h.now()), 'le succes partage est horodate');
}

// 5. Le trigger Stocks ne rappelle pas Kraken si le passage partage est recent.
{
  const nowMs = 1790000000000;
  const h = harness({ nowMs, props: [['KRAKEN_SHARED_BALANCE_OK_MS', String(nowMs - 30 * 60000)]] });
  const out = JSON.parse(h.ctx.UPDATE_KRAKEN_STOCKS_FIAT({ triggerUid: 'hourly' }));
  assert.equal(out.skipped, 'shared_balance_recent');
  assert.equal(h.fetches.length, 0, 'aucun appel Kraken pour le trigger Stocks');
  assert.equal(h.writes.length, 0, 'l onglet Stocks garde l horodatage du vrai passage');
}

// 6. Trigger Stocks avec passage partage trop ancien : il interroge Kraken.
{
  const nowMs = 1790000000000;
  const h = harness({ nowMs, props: [['KRAKEN_SHARED_BALANCE_OK_MS', String(nowMs - 2 * HOUR)]] });
  const out = JSON.parse(h.ctx.UPDATE_KRAKEN_STOCKS_FIAT({ triggerUid: 'hourly' }));
  assert.equal(out.ok, true);
  assert.equal(h.fetches.filter((u) => u.indexOf('/0/private/') >= 0).length, 1);
}

// 7. Un rafraichissement manuel Stocks interroge toujours Kraken (hors pause).
{
  const nowMs = 1790000000000;
  const h = harness({ nowMs, props: [['KRAKEN_SHARED_BALANCE_OK_MS', String(nowMs - 60000)]] });
  const out = JSON.parse(h.ctx.UPDATE_KRAKEN_STOCKS_FIAT());
  assert.equal(out.ok, true);
  assert.equal(h.fetches.filter((u) => u.indexOf('/0/private/') >= 0).length, 1);
}

// 8. Echec d ecriture Stocks : Crypto reste a jour, mais le trigger Stocks n est pas saute.
{
  const h = harness({ failStocksWrite: true });
  const out = JSON.parse(h.ctx.UPDATE_KRAKEN_SPOT());
  assert.equal(out.ok, true, 'le passage Crypto reussit');
  assert.ok(/stocks write failed/.test(out.stocksError), 'l erreur Stocks est remontee');
  assert.ok(!h.props.has('KRAKEN_SHARED_BALANCE_OK_MS'), 'pas de saut du trigger Stocks si Stocks n a pas ete ecrit');
}

// --- v4.16.43 : budget d appels prives, cache de diagnostic, garde du refresh manuel ---

// 9. Chaque appel prive est compte, et KRAKEN_BUDGET_STATUS ne consomme AUCUN appel.
{
  const h = harness();
  h.ctx._krakenPrivatePost_('/0/private/Balance', {}, { key: 'k', secret: 's' });
  h.ctx._krakenPrivatePost_('/0/private/Balance', {}, { key: 'k', secret: 's' });
  assert.equal(h.fetches.length, 2);
  const st = JSON.parse(h.ctx.KRAKEN_BUDGET_STATUS());
  assert.equal(st.private_calls_24h, 2, 'deux appels prives comptes');
  assert.equal(h.fetches.length, 2, 'KRAKEN_BUDGET_STATUS ne doit emettre aucun appel');
  assert.equal(st.lockout_active, false);
}

// 10. Budget epuise : echec VISIBLE, aucun appel envoye, aucun nonce consomme.
{
  const nowMs = 1790000000000;
  const h = harness({ nowMs, props: [] });
  // Remplit le compteur jusqu au plafond via des appels reels.
  for (let i = 0; i < 220; i++) h.ctx._krakenPrivatePost_('/0/private/Balance', {}, { key: 'k', secret: 's' });
  assert.equal(h.fetches.length, 220);
  const nonceBefore = h.props.get('KRAKEN_LAST_NONCE');
  const callsBefore = h.fetches.length;
  assert.throws(() => h.ctx._krakenPrivatePost_('/0/private/Balance', {}, { key: 'k', secret: 's' }),
    /Budget appels prives Kraken epuise/);
  assert.equal(h.fetches.length, callsBefore, 'aucun appel envoye apres epuisement');
  assert.equal(h.props.get('KRAKEN_LAST_NONCE'), nonceBefore, 'aucun nonce consomme apres epuisement');
  const st = JSON.parse(h.ctx.KRAKEN_BUDGET_STATUS());
  assert.equal(st.private_calls_24h, 220);
  assert.equal(st.budget_remaining, 0);
}

// 11. Le compteur est GLISSANT : les appels de plus de 24 h ne comptent plus.
{
  const nowMs = 1790000000000;
  const old = nowMs - 25 * HOUR;
  const h = harness({ nowMs, props: [['KRAKEN_PRIVATE_CALLS_24H', String(old) + ',' + String(old - 1000) + ',' + String(old - 2000)]] });
  const st = JSON.parse(h.ctx.KRAKEN_BUDGET_STATUS());
  assert.equal(st.private_calls_24h, 0, 'les appels hors fenetre 24 h sont purges');
  h.ctx._krakenPrivatePost_('/0/private/Balance', {}, { key: 'k', secret: 's' });
  assert.equal(h.fetches.length, 1, 'le budget purge ne bloque pas un appel legitime');
}

// 12. Quatre diagnostics consecutifs = UN seul appel prive (cache 4 min).
{
  const h = harness();
  h.ctx.DIAG_KRAKEN_API();
  h.ctx.DIAG_KRAKEN_TICKERS();
  h.ctx.DIAG_KRAKEN_XSTOCK_PRICES();
  const privates = h.fetches.filter((u) => u.indexOf('/0/private/') >= 0);
  assert.equal(privates.length, 1, 'le cache de diagnostic supprime les appels prives repetes');
}

// 13. Une ecriture reussie purge le cache : le diagnostic suivant relit Kraken.
{
  const h = harness();
  h.ctx.DIAG_KRAKEN_API();
  assert.equal(h.fetches.filter((u) => u.indexOf('/0/private/') >= 0).length, 1);
  h.ctx.UPDATE_KRAKEN_SPOT();
  h.ctx.DIAG_KRAKEN_API();
  // DIAG(1) + SPOT(1) + DIAG relit(1) = 3 : le cache a bien ete purge.
  assert.equal(h.fetches.filter((u) => u.indexOf('/0/private/') >= 0).length, 3,
    'apres un refresh reussi, le diagnostic doit relire le vrai etat');
}

// 14. Le pipeline horaire n utilise JAMAIS le cache (il doit voir l etat reel).
{
  const nowMs = 1790000000000;
  const h = harness({ nowMs });
  h.ctx.DIAG_KRAKEN_API();
  h.ctx.UPDATE_KRAKEN_SPOT();
  assert.equal(h.fetches.filter((u) => u.indexOf('/0/private/') >= 0).length, 2,
    'le refresh horaire interroge toujours Kraken meme si un diagnostic vient de tourner');
}

console.log('kraken lockout cooldown OK');
