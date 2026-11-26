// "C'est fait" button of the low-balance alert: the watchdog takes each tap once and runs one guarded re-read.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');

const SRC = ['16D_BANK_BALANCE.gs', '16E_BANK_SYNC.gs', '16F_VIREMENT_ACK.gs'].map((f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')).join('\n');
const B = '-----BEGIN ' + 'PRIVATE KEY-----';
const E = '-----END ' + 'PRIVATE KEY-----';
const SERVER = 'https://ntfy.example.test';
const TOPIC = 'ackTopicFictif0123456789';
const tx = (d, ind, amt, lab) => ({ booking_date: d, credit_debit_indicator: ind, transaction_amount: { amount: amt }, remittance_information: [lab] });
const FO_TX = [tx('2026-11-20', 'DBIT', '100.00', 'VIR Livret Novembre'), tx('2026-11-22', 'CRDT', '50.00', 'VIR Retrait Livret X'), tx('2026-11-24', 'CRDT', '50.00', 'SALAIRE')];
const CE_TX = [tx('2026-11-21', 'CRDT', '10.00', 'VIR PRENOM TESTNOM'), tx('2026-11-23', 'DBIT', '30.00', 'VIR PRENOM TESTNOM'), tx('2026-11-25', 'DBIT', '40.00', 'VIR PRENOM TESTNOM')];
const NOW = Date.parse('2026-11-26T18:00:00Z');
const tap = (token, minAgo, project = 'wcoreRoot') => JSON.stringify({ event: 'message', time: Math.floor((NOW - minAgo * 60000) / 1000), message: project + ':' + token });

function harness(opts = {}) {
  const user = Object.assign({ EB_PRIVATE_KEY: B + '\nAAAA\n' + E, EB_APPLICATION_ID: 'app', EB_FORTUNEO_ACCOUNT_UID: 'fo', EB_CE_ACCOUNT_UID: 'ce', EB_SELF_PATTERN: 'TESTNOM PRENOM|PRENOM TESTNOM', EB_NTFY_SERVER: SERVER, EB_NTFY_ACK_TOPIC: TOPIC }, opts.props || {});
  const fetches = []; const writes = [];
  const cells = { 'G5:G8': [[240], [400], [500], [1000]] };
  const bag = (store) => ({ getProperty: (k) => (k in store ? store[k] : null), setProperty: (k, v) => { store[k] = v; }, setProperties: (o) => Object.assign(store, o) });
  const sheet = (name) => ({ getRange: (a) => ({ getValue: () => (name === 'Strat' && a === 'BW1' ? (opts.bw1 === undefined ? true : opts.bw1) : null), getValues: () => cells[a].map((r) => r.slice()), setValues: (v) => { writes.push(v); cells[a] = v; } }) });
  const sandbox = {
    JSON, Object, String, Number, Math, Date: class extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }, Array, RegExp, isFinite, encodeURIComponent, Logger: { log: () => {} },
    WCORE_SPREADSHEET_ID: 'sheet',
    SpreadsheetApp: { flush: () => {}, openById: () => ({ getSheetByName: (n) => (n === 'Strat' || n === 'S\u00e9curisation' ? sheet(n) : null) }) },
    PropertiesService: { getUserProperties: () => bag(user) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: { base64EncodeWebSafe: (v) => Buffer.from(v).toString('base64url') + '==', computeRsaSha256Signature: () => [1, 2, 3] },
    UrlFetchApp: { fetch: (url, o) => {
      fetches.push({ url, o });
      const reply = (code, body) => ({ getResponseCode: () => code, getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)) });
      if (url.startsWith(SERVER)) return opts.ntfyCode ? reply(opts.ntfyCode, '') : reply(200, (opts.taps || []).join('\n'));
      const isCe = url.includes('/accounts/ce/');
      if (url.includes('/balances')) return reply(200, { balances: [{ balance_amount: { amount: isCe ? '200.00' : '500.00' } }] });
      return reply(200, { transactions: isCe ? CE_TX : FO_TX });
    } },
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return { sandbox, user, fetches, writes, cells };
}
const check = (h) => JSON.parse(JSON.stringify(h.sandbox._wcoreCheckVirementAck_()));
const ebCalls = (h) => h.fetches.filter((f) => f.url.includes('enablebanking')).length;

test('un appui recent : une seule relecture, ecriture groupee, appui marque comme traite', () => {
  const h = harness({ taps: [tap('virement-20261126-19', 5)] });
  const r = check(h);
  assert.deepStrictEqual(r, { ran: true, reason: 'WRITTEN', taken: 1 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(h.writes)), [[[200], [500], [540], [950]]]);
  assert.ok(JSON.parse(h.user.EB_ACK_DONE).includes('virement-20261126-19'));
  const n = ebCalls(h);
  h.user.EB_ACK_POLLED_AT = '0';
  assert.strictEqual(check(h).reason, 'NONE');
  assert.strictEqual(ebCalls(h), n);
});

test('le meme appui n est jamais traite deux fois, plusieurs appuis = une seule relecture', () => {
  const h = harness({ taps: [tap('virement-20261126-19', 5), tap('virement-20261126-19', 4), tap('virement-20261126-20', 3)] });
  assert.strictEqual(check(h).taken, 2);
  assert.strictEqual(h.fetches.filter((f) => f.url.includes('/accounts/fo/balances')).length, 1);
});

test('appuis ignores : trop vieux, autre projet, jeton hors format, trop dans le futur', () => {
  const h = harness({ taps: [tap('virement-20261126-19', 180), tap('virement-20261126-19', 5, 'autreProjet'), tap('Virement-X', 5), tap('virement-ok', -30), 'pas du json'] });
  const r = check(h);
  assert.deepStrictEqual(r, { ran: true, reason: 'NONE', taken: 0 });
  assert.strictEqual(ebCalls(h), 0);
});

test('non configure ou serveur ntfy en erreur : aucune relecture ; interrogation espacee', () => {
  assert.strictEqual(check(harness({ props: { EB_NTFY_ACK_TOPIC: '' } })).reason, 'NOT_CONFIGURED');
  const bad = harness({ ntfyCode: 503, taps: [tap('virement-20261126-19', 5)] });
  assert.strictEqual(check(bad).reason, 'HTTP_503');
  assert.strictEqual(ebCalls(bad), 0);
  const h = harness({ taps: [tap('virement-20261126-19', 5)] });
  check(h);
  assert.strictEqual(check(h).reason, 'TOO_SOON');
});

test('hors mode securisation : l appui est consomme, aucune ecriture', () => {
  const h = harness({ bw1: false, taps: [tap('virement-20261126-19', 5)] });
  assert.strictEqual(check(h).reason, 'NOT_SECURING_MODE');
  assert.strictEqual(h.writes.length, 0);
  assert.ok(JSON.parse(h.user.EB_ACK_DONE).length === 1);
});

test('jeton ntfy en en-tete, jamais dans l URL ; exception = code ERROR sans message', () => {
  const h = harness({ props: { EB_NTFY_TOKEN: 'tk_fictif' }, taps: [] });
  check(h);
  assert.strictEqual(h.fetches[0].o.headers.Authorization, 'Bearer tk_fictif');
  assert.ok(!h.fetches[0].url.includes('tk_fictif'));
  assert.strictEqual(h.fetches[0].o.followRedirects, false);
  const boom = harness({ taps: [] });
  boom.sandbox.UrlFetchApp.fetch = () => { throw new Error('SECRET-LEAK ' + TOPIC); };
  const r = check(boom);
  assert.deepStrictEqual(r, { ran: false, reason: 'ERROR', taken: 0 });
});

test('installation : adresse https et sujet valides exiges, rien n est affiche', () => {
  const answers = [SERVER + '/', TOPIC, ''];
  const alerts = [];
  const h = harness({ props: { EB_NTFY_SERVER: '', EB_NTFY_ACK_TOPIC: '' } });
  h.sandbox.SpreadsheetApp.getUi = () => ({ ButtonSet: { OK_CANCEL: 1, OK: 2 }, Button: { OK: 'OK' }, prompt: () => ({ getSelectedButton: () => 'OK', getResponseText: () => answers.shift() }), alert: (t, m) => { alerts.push(m); } });
  h.sandbox.WCORE_EB_INSTALL_NTFY();
  assert.deepStrictEqual(alerts, ['Installe.']);
  assert.strictEqual(h.user.EB_NTFY_SERVER, SERVER);
  const bad = harness({ props: { EB_NTFY_SERVER: '', EB_NTFY_ACK_TOPIC: '' } });
  const a2 = ['http://pas-https.example.test', TOPIC, ''];
  bad.sandbox.SpreadsheetApp.getUi = () => ({ ButtonSet: { OK_CANCEL: 1, OK: 2 }, Button: { OK: 'OK' }, prompt: () => ({ getSelectedButton: () => 'OK', getResponseText: () => a2.shift() }), alert: () => {} });
  bad.sandbox.WCORE_EB_INSTALL_NTFY();
  assert.strictEqual(bad.user.EB_NTFY_SERVER, '');
});
