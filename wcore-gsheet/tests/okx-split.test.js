// P2-DATA-OKX-CRYPTO-STOCKS-SPLIT : OKX alimente « CEX - OKX Crypto » et « CEX - OKX Stocks » depuis une seule lecture.
// Le routage des actions tokenisees vers Stocks est derriere OKX_STOCKS_ROUTING_ENABLED (faux tant que
// Portefeuille Action / Action Details ne lisent pas OKX Stocks) : les tests le forcent a vrai quand ils verifient la repartition.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const okxSource = fs.readFileSync(path.join(__dirname, '../src/40_OKX_SYNC.gs'), 'utf8');
const bpSource = fs.readFileSync(path.join(__dirname, '../src/35_BITPANDA_SYNC.gs'), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));

function okxContext({ routing = false, ...extra } = {}) {
  const calls = [];
  const context = {
    Logger: { log() {} },
    Utilities: { formatDate: () => '2026-11-27 20:00:00' },
    _cexComputeAndAppendTotal_: (ss, sheetName, rows, provider, values) => { calls.push({ sheetName, rows, provider, values }); },
    ...extra,
  };
  vm.createContext(context);
  vm.runInContext(okxSource, context);
  context.OKX_STOCKS_ROUTING_ENABLED = routing;
  return { context, calls };
}

function fakeSpreadsheet(names, { legacyHeader = 'cryptocoin_symbol' } = {}) {
  const sheets = new Map();
  const log = { renamed: [], inserted: [] };
  const make = (name) => ({
    name,
    getName() { return this.name; },
    setName(n) { log.renamed.push([this.name, n]); sheets.delete(this.name); this.name = n; sheets.set(n, this); },
    getMaxColumns() { return 26; },
    getRange: () => ({ getValue: () => (name === 'CEX - OKX' ? legacyHeader : 'cryptocoin_symbol') }),
  });
  for (const n of names) sheets.set(n, make(n));
  return {
    log,
    sheets,
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => { log.inserted.push(n); const sh = make(n); sheets.set(n, sh); return sh; },
  };
}

const SPOT = [
  ['BTC', '0.5', 'earn', '40000', '80000'],
  ['XNFLX', '2', 'funding', '300', '150'],
  ['xspcx', '1', 'trading', '120', '120'],
  ['XRP', '10', 'earn', '8', '0.8'],
  ['XBX', '5', 'funding', '1', '0.2'], // X+quelque chose absent de la liste explicite : reste en Crypto
  ['EURC', '119.6', 'funding', '120', '1'],
];

test('les actions tokenisees OKX sont reconnues par une liste explicite (casse indifferente)', () => {
  const { context } = okxContext({ routing: true });
  for (const stock of ['XNFLX', 'xspcx', ' XLRCX ', 'XCGNX', 'XFLEX']) assert.equal(context._okxIsStockToken_(stock), true, stock);
  for (const crypto of ['BTC', 'XRP', 'XBX', 'XLM', 'AAPLx', 'XSNXX', 'XMINIMAX', '', null, undefined]) assert.equal(context._okxIsStockToken_(crypto), false, String(crypto));
  assert.equal(context._okxCanonicalStockSymbol_('XNFLX'), 'NFLX');
  assert.equal(context._okxCanonicalStockSymbol_('xspcx'), 'SPCX');
  assert.equal(context._okxCanonicalStockSymbol_('XYZ'), 'XYZ', 'un symbole inconnu est renvoye tel quel');
});

test('par defaut le routage est inactif : tout reste en Crypto, Stocks est vide', () => {
  const { context } = okxContext();
  assert.equal(context.OKX_STOCKS_ROUTING_ENABLED, false);
  assert.equal(context._okxIsStockToken_('XNFLX'), false);
  assert.equal(context._okxIsListedStockToken_('XNFLX'), true, 'la liste existe, seul le routage est coupe');
  const split = context._okxSplitSpot_({ spot: SPOT });
  assert.equal(split.stocks.spot.length, 0);
  assert.equal(split.crypto.spot.length, SPOT.length);
});

test('routage actif : actions en Stocks, tout le reste, y compris un X+ticker inconnu, en Crypto', () => {
  const { context } = okxContext({ routing: true });
  const split = context._okxSplitSpot_({ spot: SPOT });
  assert.deepEqual(plain(split.stocks.spot.map((r) => r[0])), ['XNFLX', 'xspcx']);
  assert.deepEqual(plain(split.crypto.spot.map((r) => r[0])), ['BTC', 'XRP', 'XBX', 'EURC']);
  assert.equal(split.stocks.spot.length + split.crypto.spot.length, SPOT.length, 'aucune ligne perdue ni doublee');
  assert.deepEqual(plain(context._okxSplitSpot_({ spot: [] }).stocks.spot), [], 'sans action, Stocks est vide');
  assert.deepEqual(plain(context._okxSplitSpot_(null).crypto.spot), []);
});

test('une lecture ecrit les deux onglets et ne renvoie pas de ligne en double', () => {
  const { context, calls } = okxContext({ routing: true });
  const ss = fakeSpreadsheet(['CEX - OKX Crypto', 'CEX - OKX Stocks']);
  const out = context._okxWriteSheet_(ss, { spot: SPOT });
  assert.deepEqual({ crypto: out.crypto, stocks: out.stocks }, { crypto: 4, stocks: 2 });
  assert.deepEqual(calls.map((c) => c.sheetName), ['CEX - OKX Crypto', 'CEX - OKX Stocks']);
  assert.ok(calls.every((c) => c.provider === 'okx'));
  assert.deepEqual(plain(calls[1].rows.map((r) => r[0])), ['XNFLX', 'xspcx']);
  assert.equal(calls[1].values[1][0], 'cryptocoin_symbol', 'en-tetes conserves');
  assert.deepEqual(ss.log.inserted, []);
  assert.deepEqual(ss.log.renamed, []);
});

test('avant la migration, l ancien onglet « CEX - OKX » est renomme en Crypto au lieu d en creer un second', () => {
  const { context } = okxContext();
  const ss = fakeSpreadsheet(['CEX - OKX', 'CEX - OKX Stocks']);
  context._okxWriteSheet_(ss, { spot: SPOT });
  assert.deepEqual(ss.log.renamed, [['CEX - OKX', 'CEX - OKX Crypto']]);
  assert.deepEqual(ss.log.inserted, []);
  assert.ok(ss.getSheetByName('CEX - OKX Crypto'));
  assert.equal(ss.getSheetByName('CEX - OKX'), null);
});

test('un onglet « CEX - OKX » non reconnu (ou illisible) n est ni renomme ni double : la lecture echoue sans rien ecrire', () => {
  const { context, calls } = okxContext();
  const ss = fakeSpreadsheet(['CEX - OKX', 'CEX - OKX Stocks'], { legacyHeader: 'autre chose' });
  assert.throws(() => context._okxWriteSheet_(ss, { spot: SPOT }), /OKX_LEGACY_SHEET_UNRECOGNISED/);
  assert.deepEqual(ss.log.renamed, []);
  assert.deepEqual(ss.log.inserted, [], 'aucun second onglet Crypto');
  assert.deepEqual(calls, [], 'rien ecrit');
  assert.ok(ss.getSheetByName('CEX - OKX'), 'l onglet inconnu reste intact');
});

test('Stocks vide ou onglets absents : creation, jamais d erreur', () => {
  const { context, calls } = okxContext();
  const ss = fakeSpreadsheet([]);
  const out = context._okxWriteSheet_(ss, { spot: [['BTC', '1', 'earn', '1', '1']] });
  assert.deepEqual({ crypto: out.crypto, stocks: out.stocks }, { crypto: 1, stocks: 0 });
  assert.deepEqual(ss.log.inserted, ['CEX - OKX Crypto', 'CEX - OKX Stocks']);
  assert.deepEqual(plain(calls[1].rows), []);
});

test('le clic A1 de chaque onglet OKX (et de l ancien nom) lance la meme lecture', () => {
  for (const name of ['CEX - OKX Crypto', 'CEX - OKX Stocks', 'CEX - OKX']) {
    const queued = [];
    const { context } = okxContext({ CEX_QUEUE_OR_MARK_MANUAL_JOB: (sheet, prop, label) => { queued.push(label); } });
    const range = { getA1Notation: () => 'A1', getSheet: () => ({ getName: () => name }), getValue: () => true, setValue() {} };
    assert.equal(context.OKX_ON_EDIT({ range, value: 'TRUE', triggerUid: 'x' }), true, name);
    assert.deepEqual(queued, ['OKX'], name);
  }
  const { context } = okxContext();
  const other = { getA1Notation: () => 'A1', getSheet: () => ({ getName: () => 'CEX - Bybit' }), getValue: () => true, setValue() {} };
  assert.equal(context.OKX_ON_EDIT({ range: other, value: 'TRUE', triggerUid: 'x' }), false);
});

test('la file manuelle et la reparation connaissent les deux onglets OKX, et Stocks est verifie contre Portefeuille Action Details', () => {
  assert.ok(bpSource.includes('kind === "OKX" || kind === "OKX_STOCKS"'), 'OKX_STOCKS lance UPDATE_OKX_SPOT');
  assert.ok(bpSource.includes('key === "OKX_STOCKS"'), 'le libelle OKX_STOCKS devient un type de job');
  assert.ok(bpSource.includes('kind: "OKX_STOCKS"') && bpSource.includes('OKX_STOCKS_ROUTING_ENABLED === true'), 'le lot T2 (Stocks) met OKX_STOCKS en file seulement routage actif');
  const repair = bpSource.slice(bpSource.indexOf('function REPAIR_CEX_SHEETS_STRUCTURE'));
  assert.ok(repair.includes('"CEX - OKX Crypto"') && repair.includes('"CEX - OKX Stocks"'));
  assert.ok(!/"CEX - OKX"\s*\n/.test(repair.slice(0, repair.indexOf('}'))), 'plus d ancien nom dans la reparation');
  const bp = { Logger: { log() {} } };
  vm.createContext(bp);
  vm.runInContext(bpSource, bp);
  assert.ok(bp._cexBuildVerifFormula_('CEX - OKX Stocks').includes('Portefeuille Action Details'));
  assert.ok(bp._cexBuildVerifFormula_('CEX - OKX Crypto').includes('Portefeuille Crypto Details'));
  assert.ok(bpSource.includes('_okxCanonicalStockSymbol_(row[0])') && bpSource.includes('_okxCanonicalStockSymbol_(rawBalanceSymbol)'), 'le prix des actions OKX part du ticker boursier');
});

test('une notification partie avant la scission (ancien nom « CEX - OKX ») relit l onglet Crypto', () => {
  const alert = fs.readFileSync(path.join(__dirname, '../src/16C_STRAT_ALERT.gs'), 'utf8');
  assert.ok(alert.includes('if (name === "CEX - OKX") name = "CEX - OKX Crypto";'));
  assert.ok(alert.includes('if (!sheet && name === "CEX - OKX Crypto") sheet = ss && ss.getSheetByName("CEX - OKX");'), 'repli sur l ancien onglet pendant la bascule');
  assert.ok(alert.includes('renommage survenu entre les deux recherches'), 'nouvelle recherche si le renommage a lieu entre les deux');
  const heal = fs.readFileSync(path.join(__dirname, '../src/16B_AUTO_HEAL.gs'), 'utf8');
  assert.ok(heal.includes('"CEX - OKX Crypto"') && heal.includes('"CEX - OKX Stocks"') && !/"CEX - OKX",/.test(heal), 'la fraicheur B1 suit les deux onglets');
});

// ---- Bascule : le VRAI calcul d'ecriture (35_BITPANDA_SYNC.gs) avec l'ancien contenu de l'onglet ----

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing function ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

const WRITER = ['_cexEmptyAnswerKey_', '_cexEmptyAnswerProps_', '_cexEmptyAnswerHeldSince_', '_cexEmptyAnswerHeldSinceKey_', '_cexComputeAndAppendTotal_']
  .map((n) => extractFunction(bpSource, n)).join('\n')
  + '\nvar CEX_EMPTY_CONFIRM_MIN_MS = 45 * 60 * 1000; var CEX_EMPTY_EPISODE_MAX_MS = 48 * 60 * 60 * 1000;';

function makeSheet(rows) {
  const grid = rows.map((row) => row.slice());
  const cell = (r, c) => (grid[r - 1] && grid[r - 1][c - 1] !== undefined ? grid[r - 1][c - 1] : '');
  const range = (r, c, nr, nc) => ({
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(r + i, c + j))),
    clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) { if (grid[r - 1 + i]) grid[r - 1 + i][c - 1 + j] = ''; } return this; },
    setValues(values) { values.forEach((row, i) => { grid[r - 1 + i] = grid[r - 1 + i] || []; row.forEach((v, j) => { grid[r - 1 + i][c - 1 + j] = v; }); }); return this; },
    setNumberFormat() { return this; },
    insertCheckboxes() { return this; },
    setValue() { return this; },
  });
  return { grid, getMaxColumns: () => 7, getMaxRows: () => 100, getLastRow: () => grid.length, insertColumnsAfter() {}, getRange: (a, b, c, d) => (typeof a === 'string' ? range(1, 1, 1, 1) : range(a, b, c === undefined ? 1 : c, d === undefined ? 1 : d)) };
}

function writerHarness(previous, routing) {
  const sheet = makeSheet(previous);
  const store = new Map();
  const context = {
    Math, Number, String, Array, Object, JSON, isFinite, Date,
    Logger: { log() {} },
    Utilities: { formatDate: () => '2026-11-27 20:00:00' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (store.has(k) ? store.get(k) : null), setProperty: (k, v) => store.set(k, v), deleteProperty: (k) => store.delete(k), getKeys: () => [...store.keys()] }) },
    WCORE_STABLECOINS: { getType: () => null },
    _cexGetPriceMap_: () => ({}),
    _cexFetchWebPrices_: () => ({ BTC: 100000, NFLX: 100, SPCX: 50 }),
    _cexSymbolToGeckoId_: () => null,
    _bpStripNewStockSuffix_: (s) => s,
    _cexBuildVerifFormula_: () => '=V',
    _cexWriteVerifMap_: () => {},
  };
  vm.createContext(context);
  vm.runInContext(okxSource, context);
  context.OKX_STOCKS_ROUTING_ENABLED = routing;
  vm.runInContext(WRITER, context);
  const run = (name, balances) => {
    const values = [['', '2026-11-27 20:00:00', '', ''], ['cryptocoin_symbol', 'balance', 'source', 'updated_at']].concat(balances.map((r) => [r[0], r[1], r[2], '2026-11-27 20:00:00']));
    return context._cexComputeAndAppendTotal_({ getSheetByName: () => sheet }, name, balances, 'okx', values);
  };
  const rowsOf = () => sheet.grid.slice(2).filter((r) => r[0] && r[0] !== '.').map((r) => r[0]);
  return { sheet, run, rowsOf };
}

// L'onglet « CEX - OKX » d'avant la scission : une action tokenisee en funding, du BTC en earn.
const BEFORE = [
  ['', '2026-11-27 19:50:00', '', ''],
  ['cryptocoin_symbol', 'balance', 'source', 'updated_at', 'value_eur', 'Vérif'],
  ['BTC', 0.5, 'earn', '2026-11-27 19:50:00', 50000, '=V'],
  ['XNFLX', 2, 'funding', '2026-11-27 19:50:00', 200, '=V'],
  ['.', 'INFO_TOTAL', 'okx', '2026-11-27 19:50:00', '', '', 50200],
];

test('bascule, routage actif : l action restee dans l ancien onglet n est pas reprise en Crypto (pas de double comptage)', () => {
  const crypto = writerHarness(BEFORE, true);
  // Le nouvel onglet Crypto ne recoit plus que le BTC (source earn) ; la source « funding » de l ancien contenu a disparu.
  crypto.run('CEX - OKX Crypto', [['BTC', 0.5, 'earn']]);
  assert.deepEqual(crypto.rowsOf(), ['BTC'], 'XNFLX n est ni reprise ni gardee dans Crypto');
  const stocks = writerHarness([['', '', '', ''], ['cryptocoin_symbol', 'balance', 'source', 'updated_at'], ['.', 'INFO_TOTAL', 'okx', '', '', '', 0]], true);
  stocks.run('CEX - OKX Stocks', [['XNFLX', 2, 'funding']]);
  assert.deepEqual(stocks.rowsOf(), ['XNFLX']);
});

test('routage inactif : la reprise garde son comportement actuel (rien ne change pour OKX Crypto)', () => {
  const crypto = writerHarness(BEFORE, false);
  crypto.run('CEX - OKX Crypto', [['BTC', 0.5, 'earn']]);
  assert.deepEqual(crypto.rowsOf().sort(), ['BTC', 'XNFLX'], 'la source manquante est reprise comme avant la scission');
});

test('Stocks sans aucune action : l onglet est ecrit avec un total de 0, sans erreur', () => {
  const stocks = writerHarness([], true);
  const total = stocks.run('CEX - OKX Stocks', []);
  assert.equal(total, 0);
  const info = stocks.sheet.grid.find((r) => r[1] === 'INFO_TOTAL');
  assert.ok(info && info[6] === 0, 'INFO_TOTAL = 0');
});
