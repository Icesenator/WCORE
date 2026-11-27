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
