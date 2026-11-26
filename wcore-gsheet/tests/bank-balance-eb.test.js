// Enable Banking read access from the workbook: credentials only in USER properties, one GET, no amount returned.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const test = require('node:test');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', '16D_BANK_BALANCE.gs'), 'utf8');
// Markers assembled so that no secret scanner mistakes the test for a key.
const B = '-----BEGIN ' + 'PRIVATE KEY-----';
const E = '-----END ' + 'PRIVATE KEY-----';
const PEM = B +'\nAAAA\n' + E;
const PEM_ONE_LINE = B + ' AAAABBBB CCCC ' + E;
const OK = { getResponseCode: () => 200, getContentText: () => '{"balances":[{"balance_amount":{"amount":"12.34"}}]}' };

function harness(opts = {}) {
  const user = Object.assign({}, opts.props || {});
  const scriptProps = {};
  const fetches = [];
  const bag = (store) => ({
    getProperty: (k) => (k in store ? store[k] : null),
    setProperties: (o) => Object.assign(store, o),
  });
  const sandbox = {
    JSON, Object, String, Math, Date, Array, encodeURIComponent,
    PropertiesService: { getUserProperties: () => bag(user), getScriptProperties: () => bag(scriptProps) },
    Utilities: {
      base64EncodeWebSafe: (v) => Buffer.from(v).toString('base64url') + '==',
      computeRsaSha256Signature: (input, key) => {
        if (opts.badKey) throw new Error('bad');
        return opts.sign ? [...opts.sign(input, key)] : [1, 2, 3];
      },
    },
    UrlFetchApp: { fetch: (url, o) => { fetches.push({ url, o }); return opts.resp || OK; } },
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return { sandbox, user, scriptProps, fetches };
}
const conf = { EB_PRIVATE_KEY: PEM, EB_APPLICATION_ID: 'app', EB_FORTUNEO_ACCOUNT_UID: 'u/1' };

test('store: refuse une cle invalide ou illisible, enregistre, refuse d ecraser sans overwrite', () => {
  const h = harness();
  assert.strictEqual(h.sandbox._wcoreEbStore_('nope', 'app', 'uid').reason, 'INVALID');
  assert.strictEqual(harness({ badKey: true }).sandbox._wcoreEbStore_(PEM, 'a', 'u').reason, 'KEY_REJECTED');
  assert.strictEqual(Object.keys(h.user).length, 0);
  assert.strictEqual(h.sandbox._wcoreEbStore_(PEM, 'app', 'uid').stored, true);
  assert.strictEqual(h.sandbox._wcoreEbStore_(PEM, 'app2', 'uid2').reason, 'ALREADY_SET');
  assert.strictEqual(h.user.EB_APPLICATION_ID, 'app');
  assert.strictEqual(h.sandbox._wcoreEbStore_(PEM, 'app2', 'uid2', true).stored, true);
});

test('rien n est jamais ecrit dans les proprietes du script (visibles des diagnostics et purges)', () => {
  const h = harness();
  h.sandbox._wcoreEbStore_(PEM, 'app', 'uid');
  assert.deepStrictEqual(h.scriptProps, {});
  assert.ok(!/getScriptProperties/.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '')));
});

test('probe: un seul GET, JWT sans remplissage, ne renvoie jamais de montant', () => {
  const h = harness({ props: conf });
  const out = JSON.parse(JSON.stringify(h.sandbox._wcoreEbProbe_()));
  assert.deepStrictEqual(out, { code: 200 });
  assert.strictEqual(h.fetches.length, 1);
  assert.strictEqual(h.fetches[0].url, 'https://api.enablebanking.com/accounts/u%2F1/balances');
  assert.match(h.fetches[0].o.headers.Authorization, /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.ok(!JSON.stringify(out).includes('12.34'));
  assert.strictEqual(h.fetches[0].o.followRedirects, false);
});

test('probe: autre compte (proprietes vides) ou signature en echec = code 0 sans appel reseau ; 429 sans nouvel essai', () => {
  const none = harness();
  assert.strictEqual(none.sandbox._wcoreEbProbe_().code, 0);
  assert.strictEqual(none.fetches.length, 0);
  const failing = harness({ props: conf, badKey: true });
  assert.strictEqual(failing.sandbox._wcoreEbProbe_().code, 0);
  assert.strictEqual(failing.fetches.length, 0);
  const h = harness({ props: conf, resp: { getResponseCode: () => 429, getContentText: () => '{}' } });
  assert.strictEqual(h.sandbox._wcoreEbProbe_().code, 429);
  assert.strictEqual(h.fetches.length, 1);
});

test('JWT RS256 reel : cle PKCS#8 generee, signature verifiable avec la cle publique', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const h = harness({ props: Object.assign({}, conf, { EB_PRIVATE_KEY: pem }), sign: (input, key) => crypto.sign('RSA-SHA256', Buffer.from(input), key) });
  assert.strictEqual(h.sandbox._wcoreEbProbe_().code, 200);
  const [head, body, sig] = h.fetches[0].o.headers.Authorization.slice(7).split('.');
  assert.deepStrictEqual(JSON.parse(Buffer.from(head, 'base64url')), { typ: 'JWT', alg: 'RS256', kid: 'app' });
  assert.ok(crypto.verify('RSA-SHA256', Buffer.from(head + '.' + body), publicKey, Buffer.from(sig, 'base64url')));
  assert.ok(!/=/.test(sig));
});

test('installation : PEM collee sur une ligne reconstruit, INSTALL ne renvoie ni n affiche la cle', () => {
  const h = harness();
  assert.strictEqual(h.sandbox._wcoreEbStore_(PEM_ONE_LINE, 'app', 'uid').stored, true);
  assert.strictEqual(h.user.EB_PRIVATE_KEY, B + '\nAAAABBBBCCCC\n' + E);
  assert.strictEqual(harness().sandbox._wcoreEbStore_(B + '\n!!!\n' + E, 'a', 'u').reason, 'INVALID');
  const answers = ['app', 'uid', PEM_ONE_LINE]; const alerts = [];
  const h2 = harness();
  h2.sandbox.SpreadsheetApp = { getUi: () => ({
    ButtonSet: { OK_CANCEL: 1, YES_NO: 2, OK: 3 }, Button: { OK: 'OK', YES: 'YES' },
    prompt: () => ({ getSelectedButton: () => 'OK', getResponseText: () => answers.shift() }),
    alert: (t, m) => { alerts.push(t + '|' + m); return 'OK'; },
  }) };
  h2.sandbox.WCORE_EB_INSTALL();
  assert.deepStrictEqual(alerts, ['Acces bancaire|Installe.']);
  assert.ok(!alerts.join().includes('AAAA'));
  assert.strictEqual(h2.user.EB_APPLICATION_ID, 'app');
});
