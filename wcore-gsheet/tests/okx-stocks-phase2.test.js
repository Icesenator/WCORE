// P2-DATA-OKX-CRYPTO-STOCKS-SPLIT, phase 2 : Portefeuille Action et Action Details lisent « CEX - OKX Stocks »,
// les alertes reconnaissent X+ticker dans l'onglet OKX Stocks, et le routage Stocks est actif.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (n) => fs.readFileSync(path.join(__dirname, '../src', n), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));

function load(...files) {
  const context = { Logger: { log() {} }, console };
  vm.createContext(context);
  for (const f of files) vm.runInContext(read(f), context, { filename: f });
  return context;
}

test('le routage Stocks est actif par defaut dans le code publie', () => {
  const ctx = load('40_OKX_SYNC.gs');
  assert.equal(ctx.OKX_STOCKS_ROUTING_ENABLED, true);
  assert.equal(ctx._okxIsStockToken_('XNFLX'), true);
  assert.equal(ctx._okxIsStockToken_('XRP'), false, 'une crypto en X reste en Crypto');
});

test('Action Details : une ligne par titre OKX Stocks, source = onglet, ticker brut, symbole canonique', () => {
  const ctx = load('40_OKX_SYNC.gs', '44_XSTOCKS_SOLANA.gs');
  const okx = [['XNFLX', 2, 'funding'], ['XNFLX', 1, 'trading'], ['xspcx', 3, 'earn'], ['XFLEX', 0, 'funding'], ['.', 'INFO_TOTAL', 'okx']];
  const rows = plain(ctx._xstocksBuildActionDetailsRows_(2, [], [], ['NFLX', 'SPCX', 'FLEX', 'AAPL'], null, {}, [], okx));
  const mine = rows.filter((r) => r[4] === 'CEX - OKX Stocks');
  assert.deepEqual(mine.map((r) => [r[2], r[5]]).sort(), [['NFLX', 'XNFLX'], ['SPCX', 'XSPCX']], 'un titre a quantite nulle et la ligne INFO_TOTAL sont ignores, un ticker en double n est ecrit qu une fois');
  const nflx = mine.find((r) => r[2] === 'NFLX');
  assert.match(nflx[7], /SUMIFS\('CEX - OKX Stocks'!B:B;'CEX - OKX Stocks'!A:A;F\d+\)/, 'la quantite additionne toutes les sources OKX du ticker');
});

test('Action Details : sans OKX Stocks (absent, vide ou omis) le resultat est identique a avant', () => {
  const ctx = load('40_OKX_SYNC.gs', '44_XSTOCKS_SOLANA.gs');
  const bp = [['AAPL', 1.5, 'x']];
  const a = plain(ctx._xstocksBuildActionDetailsRows_(2, bp, [], ['AAPL'], null, {}, []));
  assert.deepEqual(plain(ctx._xstocksBuildActionDetailsRows_(2, bp, [], ['AAPL'], null, {}, [], [])), a);
  assert.deepEqual(plain(ctx._xstocksBuildActionDetailsRows_(2, bp, [], ['AAPL'], null, {}, [], null)), a);
  assert.equal(a.filter((r) => r[4] === 'CEX - OKX Stocks').length, 0);
});

test('Portefeuille Action : la quantite vient d Action Details (SUMIFS par symbole canonique), donc une ligne OKX suffit', () => {
  // La colonne G de la feuille est =SUMIFS('Portefeuille Action Details'!K:K; ...!C:C; A)*C ; le generateur de formules du script est
  // refuse depuis le 22/11 (en retard sur la feuille) et ne doit pas etre modifie pour OKX : aucun terme additif, aucun double comptage.
  const src = read('42_STOCK_PORTFOLIO.gs');
  assert.ok(!src.includes('CEX - OKX Stocks'), '42_STOCK_PORTFOLIO.gs ne cite pas OKX Stocks');
  assert.ok(read('42_STOCK_PORTFOLIO.gs').includes('_stockPortfolioLegacyFormulaGuard_'), 'la garde du generateur reste en place');
});
test('alertes : XNFLX dans OKX Stocks vaut NFLX, jamais dans OKX Crypto ni pour une crypto en X', () => {
  const ctx = load('40_OKX_SYNC.gs', '16C_STRAT_ALERT.gs');
  const canon = { NFLX: 'NFLX', XRP: 'XRP' };
  assert.equal(ctx._wcoreStratAlertMatchSymbol_('XNFLX', 'CEX - OKX Stocks', canon), 'NFLX');
  assert.equal(ctx._wcoreStratAlertMatchSymbol_('xnflx', 'CEX - OKX Stocks', canon), 'NFLX');
  assert.equal(ctx._wcoreStratAlertMatchSymbol_('XNFLX', 'CEX - OKX Crypto', canon), '', 'jamais dans un onglet Crypto');
  assert.equal(ctx._wcoreStratAlertMatchSymbol_('XRP', 'CEX - OKX Stocks', { XRP: 'XRP', RP: 'RP' }), 'XRP', 'un symbole identique reste direct');
  assert.equal(ctx._wcoreStratAlertMatchSymbol_('XLM', 'CEX - OKX Stocks', { LM: 'LM' }), '', 'XLM n est pas une action tokenisee connue');
  assert.equal(ctx._wcoreStratAlertMatchSymbol_('XNFLX', 'CEX - Kraken Stocks', canon), '', 'le suffixe/prefixe ne s applique qu a son courtier');
});

// ---- Action Details reconstruit par la lecture OKX quand un titre detenu n'y a pas sa ligne ----
function detailsContext(detailsRows, { refresh = true, routing = true } = {}) {
  const calls = { refresh: 0 };
  const ctx = load('40_OKX_SYNC.gs');
  ctx.OKX_STOCKS_ROUTING_ENABLED = routing;
  if (refresh) ctx.REFRESH_STOCK_PORTFOLIO_DETAILS = () => { calls.refresh++; return 'OK: details rebuilt'; };
  const sheet = detailsRows === null ? null : {
    getLastRow: () => detailsRows.length + 1,
    getRange: (r, c, nr, nc) => ({ getValues: () => detailsRows.slice(r - 2, r - 2 + nr).map((row) => row.slice(0, nc)) }),
  };
  const ss = { getSheetByName: (n) => (n === 'Portefeuille Action Details' ? sheet : null) };
  return { ctx, ss, calls };
}
const HELD = [['XNFLX', '2', 'funding'], ['XSPCX', 0, 'earn']];

test('Action Details : un titre OKX detenu sans ligne declenche UNE reconstruction', () => {
  const { ctx, ss, calls } = detailsContext([['CEX - Bitpanda Stocks', 'AAPL']]);
  assert.match(ctx._okxEnsureActionDetails_(ss, HELD), /^REFRESHED:/);
  assert.equal(calls.refresh, 1);
});

test('Action Details : la ligne existe deja (source OKX Stocks, ticker brut) : aucune reconstruction', () => {
  const { ctx, ss, calls } = detailsContext([['CEX - OKX Stocks', 'xnflx'], ['CEX - Bitpanda Stocks', 'AAPL']]);
  assert.equal(ctx._okxEnsureActionDetails_(ss, HELD), 'OK');
  assert.equal(calls.refresh, 0);
  // meme ticker mais autre source : ne compte pas
  const other = detailsContext([['CEX - Kraken Stocks', 'XNFLX']]);
  assert.match(other.ctx._okxEnsureActionDetails_(other.ss, HELD), /^REFRESHED:/);
});

test('Action Details : rien de detenu, onglet absent ou fonction absente : jamais d erreur, jamais de reconstruction inutile', () => {
  const none = detailsContext([]);
  assert.equal(none.ctx._okxEnsureActionDetails_(none.ss, [['XNFLX', 0, 'funding'], ['.', 'INFO_TOTAL', 'okx']]), 'NONE');
  assert.equal(none.calls.refresh, 0);
  const absent = detailsContext(null);
  assert.equal(absent.ctx._okxEnsureActionDetails_(absent.ss, HELD), 'NO_DETAILS_SHEET');
  const nofn = detailsContext([], { refresh: false });
  assert.equal(nofn.ctx._okxEnsureActionDetails_(nofn.ss, HELD), 'NO_REFRESH_FUNCTION');
  const boom = detailsContext([]);
  boom.ctx.REFRESH_STOCK_PORTFOLIO_DETAILS = () => { throw new Error('Service Spreadsheets timed out'); };
  assert.equal(boom.ctx._okxEnsureActionDetails_(boom.ss, HELD), 'ERROR', 'une erreur de reconstruction n est jamais fatale');
});

test('lecture OKX : la reconstruction n est tentee que routage actif et Stocks non vide', () => {
  const calls = { refresh: 0, written: [] };
  const mk = (routing) => {
    const ctx = load('40_OKX_SYNC.gs');
    ctx.OKX_STOCKS_ROUTING_ENABLED = routing;
    ctx.Utilities = { formatDate: () => '2026-11-27 22:00:00' };
    ctx._cexComputeAndAppendTotal_ = (ss, name, rows) => { calls.written.push([name, rows.length]); };
    ctx.REFRESH_STOCK_PORTFOLIO_DETAILS = () => { calls.refresh++; return 'OK'; };
    return ctx;
  };
  const sheets = new Map();
  const make = (name) => ({ getName: () => name, getMaxColumns: () => 26, getRange: () => ({ getValue: () => 'cryptocoin_symbol' }), getLastRow: () => 1 });
  const ss = { getSheetByName: (n) => { if (['CEX - OKX Crypto', 'CEX - OKX Stocks', 'Portefeuille Action Details'].includes(n)) { if (!sheets.has(n)) sheets.set(n, make(n)); return sheets.get(n); } return null; }, insertSheet: (n) => make(n) };
  const spot = [['BTC', '1', 'earn', '1', '1'], ['XNFLX', '2', 'funding', '1', '1']];
  assert.equal(mk(true)._okxWriteSheet_(ss, { spot }).details.startsWith('REFRESHED'), true);
  assert.equal(calls.refresh, 1);
  assert.equal(mk(false)._okxWriteSheet_(ss, { spot }).details, 'SKIPPED');
  assert.equal(mk(true)._okxWriteSheet_(ss, { spot: [['BTC', '1', 'earn', '1', '1']] }).details, 'SKIPPED');
  assert.equal(calls.refresh, 1, 'ni routage coupe, ni Stocks vide ne reconstruisent');
});

// ---- Reconstruction d'Action Details : jamais d'ecrasement des lignes manuelles si leur lecture echoue ----
function coreContext({ existingReadFails, okxRows, okxReadFails = false }) {
  const calls = { batch: [], clear: 0 };
  const ctx = load('40_OKX_SYNC.gs', '44_XSTOCKS_SOLANA.gs');
  const detailsSheet = {
    getLastRow() { if (existingReadFails) throw new Error('Service Spreadsheets timed out'); return 2; },
    getRange: () => ({ getValues: () => [['', '', 'MU', '', 'CEX - Kraken Stocks', 'MUX', '', 5, 0, 0, '', '']] }),
  };
  const grid = (rows) => ({ getMaxRows: () => rows.length + 2, getRange: () => ({ getValues: () => rows }) });
  const sheets = {
    'Portefeuille Action Details': detailsSheet,
    'CEX - Bitpanda Stocks': grid([['AAPL', 1.5]]),
    'CEX - OKX Stocks': okxReadFails ? { getMaxRows: () => { throw new Error('Service Spreadsheets timed out'); }, getRange: () => ({ getValues: () => [] }) } : (okxRows ? grid(okxRows) : null),
    'Portefeuille Action': grid([['NFLX', 5], ['MU', 8], ['AAPL', 1]]),
  };
  const ss = { getSheetByName: (n) => sheets[n] || null, getId: () => 'id', getSheets: () => [] };
  ctx.SpreadsheetApp = { getActiveSpreadsheet: () => ss, openById: () => ss };
  ctx.Sheets = { Spreadsheets: { Values: { batchUpdate: (req) => { calls.batch.push(req); }, clear: () => { calls.clear++; } } } };
  ctx._stockPortfolioDetailsEnsureLayout_ = () => {};
  return { ctx, calls };
}

test('reconstruction d Action Details : lecture des lignes existantes impossible = on s arrete sans rien ecrire (lignes Kraken manuelles preservees)', () => {
  const { ctx, calls } = coreContext({ existingReadFails: true, okxRows: [['XNFLX', 2]] });
  const out = ctx._refreshStockPortfolioDetailsCore_();
  assert.match(out, /^ABORTED/);
  assert.equal(calls.batch.length, 0, 'aucune ecriture');
  assert.equal(calls.clear, 0, 'aucun effacement');
});

test('reconstruction d Action Details : lecture normale = lignes Kraken manuelles conservees et ligne OKX ajoutee', () => {
  const { ctx, calls } = coreContext({ existingReadFails: false, okxRows: [['XNFLX', 2]] });
  const out = ctx._refreshStockPortfolioDetailsCore_();
  assert.match(out, /^OK/);
  assert.equal(calls.batch.length, 1);
  const rows = plain(calls.batch[0].data[0].values);
  assert.ok(rows.some((r) => r[4] === 'CEX - Kraken Stocks' && r[5] === 'MUX'), 'ligne Kraken manuelle conservee');
  assert.ok(rows.some((r) => r[4] === 'CEX - OKX Stocks' && r[5] === 'XNFLX' && r[2] === 'NFLX'), 'ligne OKX ajoutee');
  assert.ok(rows.some((r) => r[4] === 'CEX - Bitpanda Stocks'), 'ligne Bitpanda conservee');
});

test('reconstruction d Action Details : un statut non OK n est pas annonce comme reconstruit', () => {
  const { ctx, ss } = detailsContext([]);
  ctx.REFRESH_STOCK_PORTFOLIO_DETAILS = () => 'ABORTED: existing rows unreadable';
  assert.match(ctx._okxEnsureActionDetails_(ss, HELD), /^NOT_REFRESHED:/);
});

test('reconstruction d Action Details : onglet OKX Stocks illisible = arret sans ecriture (ses lignes de Details ne disparaissent pas)', () => {
  const { ctx, calls } = coreContext({ existingReadFails: false, okxReadFails: true });
  assert.match(ctx._refreshStockPortfolioDetailsCore_(), /^ABORTED: CEX - OKX Stocks unreadable/);
  assert.equal(calls.batch.length, 0);
  assert.equal(calls.clear, 0);
  // onglet OKX Stocks absent (pas encore cree) : pas une erreur, aucune ligne OKX
  const absent = coreContext({ existingReadFails: false, okxRows: null });
  assert.match(absent.ctx._refreshStockPortfolioDetailsCore_(), /^OK/);
});
