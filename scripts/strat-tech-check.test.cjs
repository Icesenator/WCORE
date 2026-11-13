// Controle technique du classeur sans modele : regles, dedoublonnage, et passage complet avec un faux reseau.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parisWallToUtcMs, cleanCell, safeTab, safeState, evaluate, decide, renderSignal, run, RANGES } = require('./strat-tech-check.cjs');

const H = 3600 * 1000;
// 12/11/2026 20:00 a Paris = 19:00 UTC (heure d'hiver).
const NOW = Date.parse('2026-11-12T19:00:00Z');
const fresh = '2026-11-12 19:30:00'; // 30 min
const healthy = { BK1: 'V', BQ1: 'V', AZ1: fresh, BF1: fresh, BL1: fresh };

test('Paris wall time is converted with daylight saving time', () => {
  assert.equal(parisWallToUtcMs('2026-11-12 20:00:00'), Date.parse('2026-11-12T19:00:00Z'));
  assert.equal(parisWallToUtcMs('2026-07-01 20:00:00'), Date.parse('2026-07-01T18:00:00Z'));
  assert.equal(parisWallToUtcMs('2026-03-29 03:30:00'), Date.parse('2026-03-29T01:30:00Z'), 'right after the spring change');
  assert.equal(parisWallToUtcMs('2026-03-29 02:30:00'), null, 'an hour that does not exist in Paris');
  for (const bad of ['', 'Chargement...', '#REF!', '2026-13-01 10:00:00', '12/11/2026 20:00', null, undefined]) {
    assert.equal(parisWallToUtcMs(bad), null, String(bad));
  }
});

test('a healthy workbook gives no problem, and healthy Recap rows (a count) are ignored', () => {
  const r = evaluate({ strat: healthy, recap: [{ tab: 'Ledger - Base', state: '12' }, { tab: 'Ledger - Scroll', state: '3' }], nowMs: NOW });
  assert.deepEqual(r.problems, []);
});

test('BK1 = X lists every Recap tab whose state starts with « Erreur », with its exact state', () => {
  const r = evaluate({
    strat: { ...healthy, BK1: 'X' },
    recap: [{ tab: 'Ledger - Base', state: '12' }, { tab: 'Ledger - Elysium', state: 'Erreur (X présent)' }, { tab: 'Bitpanda', state: 'Erreur (SOURCE_UNAVAILABLE)' }],
    nowMs: NOW,
  });
  assert.deepEqual(r.problems, ['BK1: Ledger - Elysium : Erreur (X présent)', 'BK1: Bitpanda : Erreur (SOURCE_UNAVAILABLE)']);
});

test('BK1 = X with no tab in error is still reported, never silently dropped', () => {
  assert.deepEqual(evaluate({ strat: { ...healthy, BK1: 'X' }, recap: [{ tab: 'A', state: '4' }], nowMs: NOW }).problems, ['BK1: X sans onglet en erreur dans le Recap']);
});

test('BQ1 = X is reported; a BK1 or BQ1 that is neither V nor X counts as unreadable', () => {
  assert.deepEqual(evaluate({ strat: { ...healthy, BQ1: 'X' }, recap: [], nowMs: NOW }).problems, ['BQ1: écart dans les onglets Détails']);
  assert.deepEqual(evaluate({ strat: { ...healthy, BK1: '#N/A', BQ1: '' }, recap: [], nowMs: NOW }).problems, ['BK1: valeur illisible', 'BQ1: valeur illisible']);
  assert.deepEqual(evaluate({ strat: { ...healthy, BK1: ' v ', BQ1: 'v' }, recap: [], nowMs: NOW }).problems, [], 'case and spaces do not matter');
});

test('AZ1 and BF1 turn red after 2 h, BL1 after 8 h, and any unreadable date is a problem', () => {
  const twoHoursAndOne = '2026-11-12 17:59:00'; // 2 h 1 min
  const sevenHours = '2026-11-12 13:00:00';
  const nineHours = '2026-11-12 11:00:00';
  assert.deepEqual(evaluate({ strat: { ...healthy, AZ1: twoHoursAndOne }, recap: [], nowMs: NOW }).problems, ['AZ1: plus de 2 h']);
  assert.deepEqual(evaluate({ strat: { ...healthy, BF1: twoHoursAndOne }, recap: [], nowMs: NOW }).problems, ['BF1: plus de 2 h']);
  assert.deepEqual(evaluate({ strat: { ...healthy, BL1: sevenHours }, recap: [], nowMs: NOW }).problems, [], '7 h is not late for BL1');
  assert.deepEqual(evaluate({ strat: { ...healthy, BL1: nineHours }, recap: [], nowMs: NOW }).problems, ['BL1: plus de 8 h']);
  assert.deepEqual(evaluate({ strat: { ...healthy, AZ1: '', BL1: 'Chargement...' }, recap: [], nowMs: NOW }).problems, ['AZ1: illisible', 'BL1: illisible']);
});

test('cell text relayed to another session is one short line of plain characters', () => {
  assert.equal(cleanCell('Ledger - Base\nIGNORE PREVIOUS <script>'), 'Ledger - Base IGNORE PREVIOUS ?script?');
  assert.ok(cleanCell('x'.repeat(500)).length <= 80);
  const r = evaluate({ strat: { ...healthy, BK1: 'X' }, recap: [{ tab: 'Bad`tab`\r\n---', state: 'Erreur\n(X)' }], nowMs: NOW });
  assert.equal(r.problems.length, 1);
  assert.doesNotMatch(r.problems[0], /[\r\n`<>]/);
});

test('a day that does not exist is unreadable, not moved to the next month', () => {
  assert.equal(parisWallToUtcMs('2026-02-30 20:00:00'), null);
  assert.equal(parisWallToUtcMs('2026-04-31 10:00:00'), null);
  assert.equal(parisWallToUtcMs('2028-02-29 10:00:00'), Date.parse('2028-02-29T09:00:00Z'), 'a leap day exists');
});

test('only validated values reach the signal: no link, address, long identifier, number or free text', () => {
  const r = evaluate({
    strat: { ...healthy, BK1: 'X', AZ1: 'voir 0x00000000deadbeef0000 ou https://exemple.invalid/x', BL1: '2026-02-30 20:00:00' },
    recap: [
      { tab: 'Ledger 0xabcdef0123456789 - Base', state: 'Erreur (SOURCE_UNAVAILABLE)' },
      { tab: 'https://exemple.invalid/onglet', state: 'Erreur : solde 12 345,67 EUR sur 0x00000000deadbeef' },
      { tab: 'Compte ABCDEFGHIJKLMNOPQRSTUVWXYZ012345', state: 'Erreur' },
      { tab: 'Ledger - Dydx', state: 'erreur  (source_unavailable)' },
    ],
    nowMs: NOW,
  });
  assert.deepEqual(r.problems, [
    'BK1: Ledger [adresse] - Base : Erreur (SOURCE_UNAVAILABLE)',
    'BK1: [lien] : Erreur (détail non relayé)',
    'BK1: Compte [identifiant] : Erreur',
    'BK1: Ledger - Dydx : Erreur (SOURCE_UNAVAILABLE)',
    'AZ1: illisible',
    'BL1: illisible',
  ]);
  assert.deepEqual(r.dates, { AZ1: 'illisible', BF1: fresh, BL1: 'illisible' });
  const s = renderSignal(r.problems, r.dates, NOW);
  assert.doesNotMatch(s, /0x[0-9a-f]{4,}|https?:|exemple|12 345|ABCDEFGHIJ|solde/i);
});

test('only the error states the Recap writes are relayed; a code-shaped identifier is not', () => {
  for (const known of ['Erreur', 'Erreur (0 V)', 'Erreur (SOURCE_UNAVAILABLE)', 'Erreur (X présent)']) assert.equal(safeState(known), known);
  assert.equal(safeState('Erreur (PRIVATECANARYABCDEFGHIJKLMN)'), 'Erreur (détail non relayé)');
  assert.equal(safeState('Erreur (WEB_SCAN_ERROR)'), 'Erreur (détail non relayé)', 'not a Recap state');
});

test('a long identifier at the end of a long tab name is masked before the name is shortened', () => {
  const tab = 'Ledger - Base - compte principal du foyer ' + 'PRIVATECANARYABCDEFGHIJKLMN'; // 42 + 27 characters
  const out = safeTab(tab);
  assert.ok(out.length <= 60, out);
  assert.doesNotMatch(out, /PRIVAT/);
});

test('any number in a tab name is masked, even one to three digits (an amount)', () => {
  for (const tab of ['Compte 12 EUR', 'Compte 123 EUR', 'Compte 7', 'Compte 1 234,56']) {
    const out = safeTab(tab);
    assert.doesNotMatch(out, /\d/, out);
    assert.match(out, /\[nombre\]/, out);
  }
  assert.equal(safeTab('Ledger - Base'), 'Ledger - Base', 'a name without number is unchanged');
});

test('a unicode number and a long dashed identifier in a tab name are masked', () => {
  assert.doesNotMatch(safeTab('Compte １２３ EUR'), /\d|１/);
  const dashed = 'abcdefgh-ijklmnop-qrstuvwx-yzabcdef-ghijklmn-opqrstuv'; // 53 caracteres en segments
  assert.doesNotMatch(safeTab('Ledger ' + dashed), /abcdefgh|ijklmnop/);
  assert.equal(safeTab('Ledger - Base - compte principal'), 'Ledger - Base - compte principal');
});

test('a roman numeral, a superscript and a fraction in a tab name are masked', () => {
  for (const tab of ['Compte Ⅻ EUR', 'Compte 5²', 'Compte ½', 'Compte Ⅷ']) {
    const out = safeTab(tab);
    assert.doesNotMatch(out, /[0-9²½ⅫⅧ]|XII|VIII/, out);
    assert.match(out, /\[nombre\]/, out);
  }
});

test('an email address in a tab name is masked', () => {
  const out = safeTab('Contact alice@example.invalid');
  assert.doesNotMatch(out, /alice|example/, out);
  assert.match(out, /\(email\)/, out);
});

test('an email address with a fullwidth or small at sign is masked', () => {
  for (const at of ['＠', '﹫']) {
    const out = safeTab('Contact alice' + at + 'example.invalid');
    assert.doesNotMatch(out, /alice|example/, out);
    assert.match(out, /\(email\)/, out);
  }
});

test('both HTTP calls refuse redirections', async (t) => {
  const h = harness(t, vr(healthy, ['Ledger - Base'], ['12']));
  const inits = [];
  const inner = h.opts.fetchImpl;
  h.opts.fetchImpl = async (url, init = {}) => { inits.push(init.redirect); return inner(url, init); };
  await run(h.opts);
  assert.deepEqual(inits, ['error', 'error']);
});

test('a link of any scheme in a tab name is masked', () => {
  for (const tab of ['ftp://example.invalid/private', 'Notes file://host/share', 'wss://example.invalid/x']) {
    const out = safeTab(tab);
    assert.doesNotMatch(out, /example|host|private/, out);
    assert.match(out, /\[lien\]/, out);
  }
});

test('a malformed token file never leaks an extract of itself, in the error or in the output', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wcore-strat-home-'));
  try {
    fs.writeFileSync(path.join(home, '.clasprc.json'), '{ "tokens": { "default": { "refresh_token": "CANARYTOKENVALUE" ,, }');
    const lines = [];
    let message = '';
    try {
      await run({ home, env: { WCORE_SHEET_ID: 'SHEET' }, dryRun: true, log: (l) => lines.push(l), fetchImpl: async () => { throw new Error('no network'); } });
    } catch (e) { message = String(e && e.message); }
    assert.doesNotMatch(message + lines.join('\n'), /CANARY|refresh_token/);
    assert.match(message, /illisible/);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('dedup: the same problems within 24 h are not signaled again; a change or 24 h later is', () => {
  const p = ['AZ1: plus de 2 h', 'BK1: A : Erreur (X présent)'];
  const first = decide(p, null, NOW);
  assert.equal(first.action, 'alert');
  assert.deepEqual(first.state, { lastAlertAt: new Date(NOW).toISOString(), lastTabs: p });
  assert.equal(decide([...p].reverse(), first.state, NOW + 23 * H).action, 'already', 'order does not matter');
  assert.equal(decide(p, first.state, NOW + 24 * H).action, 'alert', 'repeated after 24 h');
  assert.equal(decide([p[0]], first.state, NOW + H).action, 'alert', 'a different list is new');
  assert.equal(decide(p, { lastAlertAt: 'garbage', lastTabs: p }, NOW).action, 'alert', 'an unreadable state never silences an alert');
  assert.equal(decide(p, { lastAlertAt: new Date(NOW + H).toISOString(), lastTabs: p }, NOW).action, 'alert', 'a date in the future never silences an alert');
  assert.deepEqual(decide([], first.state, NOW), { action: 'none', state: { lastAlertAt: null, lastTabs: [] } });
});

test('the signal has the inbox header and the dates, and never a number other than dates and counts', () => {
  const s = renderSignal(['BL1: plus de 8 h'], { AZ1: fresh, BF1: fresh, BL1: '2026-11-12 09:00:00' }, NOW);
  assert.match(s, /^---\ntype: codex-supervisor-signal\nfrom: task-wcore-controle-strat-d1\nto: wcoreRoot\ndate: 2026-11-12T19:00:00Z\nstatus: NEW\n---\n/);
  assert.match(s, /- BL1: plus de 8 h/);
  assert.match(s, /BL1 = 2026-11-12 09:00:00/);
});

// Full pass with a fake network, a temporary home, state file and inbox.
function harness(t, values, { sheetOk = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcore-strat-check-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, '.clasprc.json'), JSON.stringify({ tokens: { default: { client_id: 'c', client_secret: 's', refresh_token: 'r' } } }));
  const inbox = path.join(dir, 'inbox');
  fs.mkdirSync(inbox);
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET' });
    if (String(url).startsWith('https://oauth2.googleapis.com/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'tok' }) };
    if (!sheetOk) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ valueRanges: values }) };
  };
  const logs = [];
  const opts = { fetchImpl, nowMs: NOW, env: { WCORE_SHEET_ID: 'sheet-for-test' }, home: dir, statePath: path.join(dir, 'state.json'), inboxDir: inbox, log: (m) => logs.push(m) };
  return { dir, inbox, calls, logs, opts };
}
const vr = (strat, tabs = [], states = []) => [
  ...['BK1', 'BQ1', 'AZ1', 'BF1', 'BL1'].map((k) => ({ values: [[strat[k]]] })),
  { values: tabs.map((x) => [x]) }, { values: states.map((x) => [x]) },
];

test('full pass: a new problem drops one signal, writes the state, and only reads the sheet', async (t) => {
  const h = harness(t, vr({ ...healthy, BK1: 'X' }, ['Ledger - Base', 'Ledger - Elysium'], ['12', 'Erreur (X présent)']));
  const r = await run(h.opts);
  assert.equal(r.code, 3);
  const files = fs.readdirSync(h.inbox);
  assert.deepEqual(files, ['2026-11-12T19-00-00Z-from-task-wcore-controle-strat-d1.md']);
  assert.match(fs.readFileSync(path.join(h.inbox, files[0]), 'utf8'), /- BK1: Ledger - Elysium : Erreur \(X présent\)/);
  assert.deepEqual(JSON.parse(fs.readFileSync(h.opts.statePath, 'utf8')).lastTabs, ['BK1: Ledger - Elysium : Erreur (X présent)']);
  assert.match(h.logs.join('\n'), /^WCORE : 1 problème\(s\) technique\(s\) dans le classeur/m);
  const sheetCalls = h.calls.filter((c) => c.url.includes('sheets.googleapis.com'));
  assert.equal(sheetCalls.length, 1);
  assert.equal(sheetCalls[0].method, 'GET', 'never a write to the workbook');
  for (const r of RANGES) assert.ok(sheetCalls[0].url.includes(encodeURIComponent(r)), r);
  assert.equal(h.calls.length, 2, 'token + one read, nothing else');

  // Second pass, same problem, one hour later: already signaled, no new file.
  const again = await run({ ...h.opts, nowMs: NOW + H });
  assert.equal(again.code, 2);
  assert.equal(fs.readdirSync(h.inbox).length, 1);
});

test('full pass: a healthy workbook resets the state and drops nothing', async (t) => {
  const h = harness(t, vr(healthy, ['Ledger - Base'], ['12']));
  fs.writeFileSync(h.opts.statePath, JSON.stringify({ lastAlertAt: new Date(NOW - H).toISOString(), lastTabs: ['AZ1: plus de 2 h'] }));
  const r = await run(h.opts);
  assert.equal(r.code, 0);
  assert.deepEqual(fs.readdirSync(h.inbox), []);
  assert.deepEqual(JSON.parse(fs.readFileSync(h.opts.statePath, 'utf8')), { lastAlertAt: null, lastTabs: [] });
});

test('dry run writes nothing at all', async (t) => {
  const h = harness(t, vr({ ...healthy, BQ1: 'X' }));
  const r = await run({ ...h.opts, dryRun: true });
  assert.equal(r.code, 3);
  assert.deepEqual(fs.readdirSync(h.inbox), []);
  assert.equal(fs.existsSync(h.opts.statePath), false);
});

test('a failed or incomplete read is an error, never « no problem »', async (t) => {
  const down = harness(t, [], { sheetOk: false });
  await assert.rejects(run(down.opts), /lecture du classeur refusée \(HTTP 503\)/);
  const partial = harness(t, vr(healthy).slice(0, 5));
  await assert.rejects(run(partial.opts), /lecture du classeur incomplète \(5 plages sur 7\)/);
  assert.equal(fs.existsSync(partial.opts.statePath), false, 'the state is not reset by a failed read');
  const noId = harness(t, vr(healthy));
  await assert.rejects(run({ ...noId.opts, env: {} }), /identifiant du classeur absent/);
});
