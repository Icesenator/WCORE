// Generateurs des formules Portefeuille Crypto / Action / Action Rebalancing (22/11/2026) :
// plus aucune RECHERCHEH a indice de ligne fixe vers Strat ou Budget (elle se decalait des qu'une ligne
// etait inseree dans Strat), et le drapeau U1 de Portefeuille Crypto/Action est une case a cocher (TRUE).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (f) => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
for (const f of ['34_TOP_MARKETCAP.gs', '42_STOCK_PORTFOLIO.gs', '43_CRYPTO_PORTFOLIO.gs']) {
  const src = read(f);
  assert.equal(/HLOOKUP\(/i.test(src), false, f + ' : plus de RECHERCHEH');
}

function rowFormulas(file, fnName, config, sheetRow, first) {
  const ctx = { Logger: { log() {} } };
  vm.createContext(ctx);
  vm.runInContext(read(file), ctx);
  const row = Array(25).fill('');
  row[0] = first;
  ctx[fnName](row, sheetRow);
  return row;
}

const crypto = rowFormulas('43_CRYPTO_PORTFOLIO.gs', '_cryptoPortfolioApplyFormulasToRow_', null, 7, 'BTC');
assert.ok(crypto[9].includes('IF($U$1=TRUE;INDEX(Strat!$33:$33;MATCH(MAX(Strat!$2:$2)-1;Strat!$2:$2;0));INDEX(Strat!$33:$33;MATCH(MAX(Strat!$2:$2);Strat!$2:$2;0)))'), 'Crypto J : ligne 33 de Strat par EQUIV sur la ligne 2');
assert.ok(crypto[9].includes('$U$1=TRUE);INDEX(Strat!$44:$44;'), 'Crypto J : ligne 44 (EURC)');
assert.ok(!crypto[9].includes('$U$1="X"'), 'Crypto J : U1 est une case a cocher');
assert.equal(crypto[9].split('(').length, crypto[9].split(')').length, 'parentheses equilibrees');

const stock = rowFormulas('42_STOCK_PORTFOLIO.gs', '_stockPortfolioApplyFormulasToRow_', null, 7, 'AAPL');
assert.ok(stock[9].includes('INDEX(Strat!$84:$84;MATCH(MAX(Strat!$2:$2);Strat!$2:$2;0))>0'), 'Action J : ligne 84');
assert.ok(stock[9].includes('IF($U$1=TRUE;INDEX(Strat!$80:$80;'), 'Action J : ligne 80, U1 case a cocher');
assert.ok(stock[9].includes('INDEX(Strat!$90:$90;'), 'Action J : ligne 90 (EUR)');
assert.equal(stock[9].split('(').length, stock[9].split(')').length, 'parentheses equilibrees');

const eur = rowFormulas('42_STOCK_PORTFOLIO.gs', '_stockPortfolioApplyFormulasToRow_', null, 3, 'EUR');
assert.ok(eur[6].includes('-IF(U1=TRUE;INDEX(Budget!$133:$133;MATCH(MAX(Budget!$1:$1)-1;Budget!$1:$1;0));INDEX(Budget!$133:$133;MATCH(MAX(Budget!$1:$1);Budget!$1:$1;0)))'), 'Action G (EUR) : ligne 133 de Budget');

console.log('portfolio-formulas-index-match: OK');
