// Bank balances for Securisation!G5:G8: reading rules, one attempt per bank, guarded write. Synthetic data only.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');

const SRC = ['16D_BANK_BALANCE.gs', '16E_BANK_SYNC.gs'].map((f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')).join('\n');
const B = '-----BEGIN ' + 'PRIVATE KEY-----';
const E = '-----END ' + 'PRIVATE KEY-----';
const SELF = 'TESTNOM PRENOM|PRENOM TESTNOM';
const tx = (d, ind, amt, lab) => ({ booking_date: d, credit_debit_indicator: ind, transaction_amount: { amount: amt }, remittance_information: [lab] });
const FO_TX = [tx('2026-11-20', 'DBIT', '100.00', 'VIR Livret Novembre'), tx('2026-11-22', 'CRDT', '50.00', 'VIR Retrait Livret X'), tx('2026-11-24', 'CRDT', '50.00', 'SALAIRE')];
const CE_TX = [tx('2026-11-21', 'CRDT', '10.00', 'VIR PRENOM TESTNOM'), tx('2026-11-23', 'DBIT', '30.00', 'VIR PRENOM TESTNOM'), tx('2026-11-25', 'DBIT', '40.00', 'VIR PRENOM TESTNOM')];

function harness(opts = {}) {
  const user = Object.assign({ EB_PRIVATE_KEY: B + '\nAAAA\n' + E, EB_APPLICATION_ID: 'app', EB_FORTUNEO_ACCOUNT_UID: 'fo', EB_CE_ACCOUNT_UID: 'ce', EB_SELF_PATTERN: SELF }, opts.props || {});
  const fetches = [];
  const cells = { 'G5:G8': opts.anchor || [[240], [400], [500], [1000]] };
  const writes = [];
  const bag = (store) => ({ getProperty: (k) => (k in store ? store[k] : null), setProperty: (k, v) => { store[k] = v; }, setProperties: (o) => Object.assign(store, o) });
  const sheet = (name) => ({
    getRange: (a) => ({
      getValue: () => (name === 'Strat' && a === 'BW1' ? (opts.bw1 === undefined ? true : opts.bw1) : null),
      getValues: () => cells[a].map((r) => r.slice()),
      setValues: (v) => { writes.push({ a, v }); cells[a] = v; },
    }),
  });
  const sandbox = {
    JSON, Object, String, Number, Math, Date, Array, RegExp, isFinite, encodeURIComponent, Logger: { log: () => {} },
    WCORE_SPREADSHEET_ID: 'sheet',
    SpreadsheetApp: { flush: () => {}, openById: () => ({ getSheetByName: (n) => (n === 'Strat' || n === 'S\u00e9curisation' ? sheet(n) : null) }) },
    PropertiesService: { getUserProperties: () => bag(user) },
    LockService: { getScriptLock: () => ({ tryLock: () => !opts.lockBusy, releaseLock: () => {} }) },
    Utilities: { base64EncodeWebSafe: (v) => Buffer.from(v).toString('base64url') + '==', computeRsaSha256Signature: () => [1, 2, 3] },
    UrlFetchApp: { fetch: (url) => {
      fetches.push(url);
      if (opts.onFetch) opts.onFetch(cells, url);
      const reply = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
      const isCe = url.includes('/accounts/ce/');
      if (isCe && opts.ceCode) return reply(opts.ceCode, {});
      if (opts.ceLoop && isCe && url.includes('/transactions')) return reply(200, { transactions: [], continuation_key: 'same' });
      if (url.includes('/balances')) return reply(200, { balances: [{ balance_amount: { amount: isCe ? '200.00' : '500.00' } }] });
      return reply(200, { transactions: isCe ? CE_TX : FO_TX });
    } },
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return { sandbox, user, fetches, writes, cells };
}
const run = (h, write) => JSON.parse(JSON.stringify(h.sandbox._wcoreEbRefreshSecurisation_(write)));

test('lecture complete : soldes, Livret+ et Livret A estimes comme le lecteur local, ecrits ensemble', () => {
  const h = harness();
  const r = run(h, true);
  assert.strictEqual(r.reason, 'WRITTEN');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(h.writes)), [{ a: 'G5:G8', v: [[200], [500], [540], [950]] }]);
  assert.strictEqual(h.fetches.filter((u) => u.includes('/balances')).length, 2);
});

test('lecture a blanc : rien n est ecrit, le retour ne contient aucun montant, les valeurs ne vont que dans la fenetre du proprietaire', () => {
  const h = harness();
  assert.strictEqual(run(h, false).reason, 'DRY_RUN_OK');
  assert.strictEqual(h.writes.length, 0);
  const alerts = [];
  h.sandbox.SpreadsheetApp.getUi = () => ({ ButtonSet: { OK: 1 }, alert: (t, m) => { alerts.push(m); } });
  const logs = [];
  h.sandbox.Logger.log = (m) => logs.push(m);
  assert.strictEqual(JSON.stringify(h.sandbox.WCORE_EB_DRYRUN()), '{"reason":"DRY_RUN_OK"}');
  assert.match(alerts[0], /200\.00 ; 500\.00 ; 540\.00 ; 950\.00/);
  assert.strictEqual(logs.length, 0);
  assert.strictEqual(h.writes.length, 0);
});

test('hors mode securisation (Strat!BW1 faux) : aucun appel bancaire, aucune ecriture', () => {
  const h = harness({ bw1: false });
  assert.strictEqual(run(h, true).reason, 'NOT_SECURING_MODE');
  assert.strictEqual(h.fetches.length, 0);
  assert.strictEqual(h.writes.length, 0);
});

test('jour de la derniere saisie introuvable : rien n est ecrit', () => {
  const h = harness({ anchor: [[240], [123.45], [500], [1000]] });
  assert.strictEqual(run(h, true).reason, 'LIVRET_PLUS_SAVED_DAY_NOT_FOUND');
  assert.strictEqual(h.writes.length, 0);
  const h2 = harness({ anchor: [[999], [400], [500], [1000]] });
  assert.strictEqual(run(h2, true).reason, 'LIVRET_A_SAVED_DAY_NOT_FOUND');
  assert.strictEqual(h2.writes.length, 0);
});

test('429 : un seul essai, rien d ecrit, pause de la banque, pas de nouvel appel', () => {
  const h = harness({ ceCode: 429 });
  assert.strictEqual(run(h, true).reason, 'CE_429');
  assert.strictEqual(h.writes.length, 0);
  const n = h.fetches.length;
  assert.strictEqual(run(h, true).reason, 'CE_BUDGET_OR_PAUSE');
  assert.strictEqual(h.fetches.length, n);
  assert.ok(JSON.parse(h.user.EB_PAUSE_UNTIL)['caisse-epargne'] > Date.now());
});

test('budget de lectures : au plus 2 par banque et par 24 h', () => {
  const h = harness({ props: { EB_READS_LOG: JSON.stringify({ fortuneo: [Date.now() - 1000, Date.now() - 2000] }) } });
  assert.strictEqual(run(h, true).reason, 'FORTUNEO_BUDGET_OR_PAUSE');
  assert.strictEqual(h.fetches.length, 0);
});

test('cellules modifiees pendant la lecture : rien n est ecrit', () => {
  const h = harness({ onFetch: (cells) => { cells['G5:G8'] = [[240], [401], [500], [1000]]; } });
  assert.strictEqual(run(h, true).reason, 'SHEET_CHANGED_DURING_READ');
  assert.strictEqual(h.writes.length, 0);
});

test('non configure ou motif de nom invalide : refus sans appel', () => {
  assert.strictEqual(run(harness({ props: { EB_CE_ACCOUNT_UID: '' } }), true).reason, 'NOT_CONFIGURED');
  const h = harness({ props: { EB_SELF_PATTERN: '(' } });
  assert.strictEqual(run(h, true).reason, 'BAD_SELF_PATTERN');
  assert.strictEqual(h.fetches.length, 0);
});

test('virement entre les deux comptes courants : apparie et exclu des mouvements de livret', () => {
  const h = harness();
  const a = Object.assign(tx('2026-11-10', 'DBIT', '70.00', 'VIR PRENOM TESTNOM'), { _bank: 'fortuneo' });
  const b = Object.assign(tx('2026-11-11', 'CRDT', '70.00', 'VIR PRENOM TESTNOM'), { _bank: 'caisse-epargne' });
  const cross = h.sandbox._wcoreEbCrossBank_([a, b], /TESTNOM/i);
  assert.strictEqual(cross.length, 2);
  assert.strictEqual(h.sandbox._wcoreEbLivretMove_(b, cross, /TESTNOM/i), null);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(h.sandbox._wcoreEbLivretMove_(b, [], /TESTNOM/i))), { livret: 'Livret A', sens: -1 });
});


test('verrou occupe : aucun appel ; curseur de pagination qui boucle : arret sans ecriture', () => {
  const busy = harness({ lockBusy: true });
  assert.strictEqual(run(busy, true).reason, 'LOCK_BUSY');
  assert.strictEqual(busy.fetches.length, 0);
  const loop = harness({ ceLoop: true });
  assert.strictEqual(run(loop, true).reason, 'CE_-5');
  assert.strictEqual(loop.writes.length, 0);
  assert.ok(loop.fetches.length <= 8);
});

test('solde recurrent : meme estimation = accepte ; estimations differentes = refus (jour de saisie ambigu)', () => {
  const same = harness({ anchor: [[240], [400], [500], [1000]] });
  const e = same.sandbox._wcoreEbEstimateLivret_('fortuneo', FO_TX.map((x) => Object.assign({}, x, { _bank: 'fortuneo' })), [], /X/, 500, 400, 1000);
  assert.strictEqual(e.ok, true);
  // deux jours avec le meme solde de fin de journee (400) mais des mouvements de livret entre eux
  const txs = [tx('2026-11-20', 'CRDT', '100.00', 'SALAIRE'), tx('2026-11-21', 'CRDT', '50.00', 'VIR Retrait Livret'), tx('2026-11-22', 'DBIT', '50.00', 'ACHAT')].map((x) => Object.assign({}, x, { _bank: 'fortuneo' }));
  const amb = harness().sandbox._wcoreEbEstimateLivret_('fortuneo', txs, [], /X/, 400, 400, 1000);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(amb)), { ok: false, reason: 'SAVED_DAY_AMBIGUOUS' });
});

test('virement entre comptes : montants compares au centime (formats differents)', () => {
  const h = harness();
  const a = Object.assign(tx('2026-11-10', 'DBIT', '70.0', 'VIR PRENOM TESTNOM'), { _bank: 'fortuneo' });
  const b = Object.assign(tx('2026-11-10', 'CRDT', '70.00', 'VIR PRENOM TESTNOM'), { _bank: 'caisse-epargne' });
  assert.strictEqual(h.sandbox._wcoreEbCrossBank_([a, b], /TESTNOM/i).length, 2);
});

test('exception inattendue : seul un code de raison sort, rien n est journalise, meme sans fenetre', () => {
  const h = harness();
  h.sandbox.SpreadsheetApp.openById = () => { throw new Error('SECRET-LEAK 123.45'); };
  const logs = [];
  h.sandbox.Logger.log = (m) => logs.push(m);
  const r = run(h, true);
  assert.deepStrictEqual(r, { ran: false, wrote: false, reason: 'UNEXPECTED' });
  assert.ok(!JSON.stringify(r).includes('SECRET'));
  assert.strictEqual(h.writes.length, 0);
  h.sandbox.SpreadsheetApp.getUi = () => { throw new Error('no ui'); };
  assert.strictEqual(h.sandbox.WCORE_EB_DRYRUN().reason, 'UNEXPECTED');
  assert.strictEqual(logs.length, 0);
});
