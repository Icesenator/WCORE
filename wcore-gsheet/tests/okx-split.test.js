// P2-DATA-OKX-CRYPTO-STOCKS-SPLIT : OKX alimente « CEX - OKX Crypto » et « CEX - OKX Stocks » depuis une seule lecture.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const okxSource = fs.readFileSync(path.join(__dirname, '../src/40_OKX_SYNC.gs'), 'utf8');
const bpSource = fs.readFileSync(path.join(__dirname, '../src/35_BITPANDA_SYNC.gs'), 'utf8');

function okxContext(extra = {}) {
  const calls = [];
  const context = {
    Logger: { log() {} },
    Utilities: { formatDate: () => '2026-11-27 20:00:00' },
    _cexComputeAndAppendTotal_: (ss, sheetName, rows, provider, values) => { calls.push({ sheetName, rows, provider, values }); },
    ...extra,
  };
  vm.createContext(context);
  vm.runInContext(okxSource, context);
  return { context, calls };
}

function fakeSpreadsheet(names) {
  const sheets = new Map();
  const log = { renamed: [], inserted: [] };
  const make = (name) => {
    const sh = {
      name,
      getName() { return this.name; },
      setName(n) { log.renamed.push([this.name, n]); sheets.delete(this.name); this.name = n; sheets.set(n, this); },
      getMaxColumns() { return 26; },
    };
    return sh;
  };
  for (const n of names) sheets.set(n, make(n));
  return {
    log,
    sheets,
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => { log.inserted.push(n); const sh = make(n); sheets.set(n, sh); return sh; },
  };
}

const plain = (x) => JSON.parse(JSON.stringify(x));

const SPOT = [
  ['BTC', '0.5', 'earn', '40000', '80000'],
  ['XNFLX', '2', 'funding', '300', '150'],
  ['xspcx', '1', 'trading', '120', '120'],
  ['XRP', '10', 'earn', '8', '0.8'],
  ['XBX', '5', 'funding', '1', '0.2'], // X+quelque chose absent de la liste explicite : reste en Crypto
  ['EURC', '119.6', 'funding', '120', '1'],
];

test('les actions tokenisees OKX sont reconnues par une liste explicite (casse indifferente)', () => {
  const { context } = okxContext();
  assert.equal(context._okxIsStockToken_('XNFLX'), true);
  assert.equal(context._okxIsStockToken_('xspcx'), true);
  assert.equal(context._okxIsStockToken_(' XLRCX '), true);
  for (const crypto of ['BTC', 'XRP', 'XBX', 'XLM', 'AAPLx', '', null, undefined]) assert.equal(context._okxIsStockToken_(crypto), false, String(crypto));
  assert.equal(context._okxCanonicalStockSymbol_('XNFLX'), 'NFLX');
  assert.equal(context._okxCanonicalStockSymbol_('xspcx'), 'SPCX');
  assert.equal(context._okxCanonicalStockSymbol_('XYZ'), 'XYZ', 'un symbole inconnu est renvoye tel quel');
});

test('la repartition envoie les actions en Stocks et tout le reste, y compris un X+ticker inconnu, en Crypto', () => {
  const { context } = okxContext();
  const split = context._okxSplitSpot_({ spot: SPOT });
  assert.deepEqual(plain(split.stocks.spot.map((r) => r[0])), ['XNFLX', 'xspcx']);
  assert.deepEqual(plain(split.crypto.spot.map((r) => r[0])), ['BTC', 'XRP', 'XBX', 'EURC']);
  assert.equal(split.stocks.spot.length + split.crypto.spot.length, SPOT.length, 'aucune ligne perdue ni doublee');
  assert.deepEqual(plain(context._okxSplitSpot_({ spot: [] }).stocks.spot), [], 'sans action, Stocks est vide');
  assert.deepEqual(plain(context._okxSplitSpot_(null).crypto.spot), []);
});

test('une lecture ecrit les deux onglets et ne renvoie pas de ligne en double', () => {
  const { context, calls } = okxContext();
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
  assert.ok(bpSource.includes('kind: "OKX_STOCKS"'), 'le lot T2 (Stocks) met OKX_STOCKS en file');
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
  const heal = fs.readFileSync(path.join(__dirname, '../src/16B_AUTO_HEAL.gs'), 'utf8');
  assert.ok(heal.includes('"CEX - OKX Crypto"') && heal.includes('"CEX - OKX Stocks"') && !/"CEX - OKX",/.test(heal), 'la fraicheur B1 suit les deux onglets');
});