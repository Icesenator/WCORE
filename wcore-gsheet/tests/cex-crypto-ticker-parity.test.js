const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = process.env.CEX_PARITY_SOURCE || path.join(__dirname, '../src/35_BITPANDA_SYNC.gs');
const source = fs.readFileSync(sourcePath, 'utf8');
const context = { Logger: { log() {} } };
vm.createContext(context);
vm.runInContext(source, context);

const literalTickerCriterion = 'SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(s;"~";"~~");"*";"~*");"?";"~?")';
// Modele local des criteres COUNTIFS : ~ echappe le caractere suivant, * et ? sont des jokers.
function matchesCriterion(value, criterion) {
  let pattern = '^';
  for (let i = 0; i < criterion.length; i++) {
    const ch = criterion[i];
    if (ch === '~' && i + 1 < criterion.length) {
      pattern += criterion[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (ch === '*') pattern += '.*';
    else if (ch === '?') pattern += '.';
    else pattern += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(pattern + '$', 'i').test(value);
}
function escapeCriterion(value) {
  return value.replace(/~/g, '~~').replace(/\*/g, '~*').replace(/\?/g, '~?');
}
const formulaForLiteral = context._cexBuildVerifFormula_('CEX - Binance');
const tickerCriterionSource = formulaForLiteral.split("'Portefeuille Crypto Details'!$F:$F;")[1]?.split(')>0;')[0];
assert.ok(tickerCriterionSource === 's' || tickerCriterionSource === literalTickerCriterion, 'le modele ne doit accepter que le critere brut ou la chaine SUBSTITUTE exacte');
for (const [ticker, other] of [['A*B', 'AXXB'], ['A?B', 'AXB'], ['A~B', 'AB'], ['A~*?', 'A*Z']]) {
  const criterion = tickerCriterionSource === 's' ? ticker : escapeCriterion(ticker);
  assert.ok(matchesCriterion(ticker, criterion), `${ticker} doit accepter son ticker litteral`);
  assert.ok(!matchesCriterion(other, criterion), `${ticker} ne doit pas accepter ${other} par wildcard`);
}
assert.ok(formulaForLiteral.includes(`$F:$F;${literalTickerCriterion}`), 'le ticker F doit etre un critere litteral');
const positionFormula = context._cexBuildVerifFormula_('CEX - A~*?');
assert.ok(positionFormula.includes(`$E:$E;"${escapeCriterion('CEX - A~*?')}"`), 'la position E doit aussi etre un critere litteral');

const cryptoSheets = ['CEX - Binance', 'CEX - Bitfinex', 'CEX - Bitpanda Crypto', 'CEX - Bybit', 'CEX - Coinbase', 'CEX - Kraken Crypto', 'CEX - OKX'];
for (const sheet of cryptoSheets) {
  const formula = context._cexBuildVerifFormula_(sheet);
  assert.ok(formula.includes(`'Portefeuille Crypto Details'!$F:$F;${literalTickerCriterion}`), `${sheet} doit rapprocher le ticker F, pas le canonique C`);
  assert.ok(!formula.includes('$C:$C'), `${sheet} ne doit pas rapprocher le canonique C`);
  assert.ok(formula.includes(`'Portefeuille Crypto Details'!$E:$E;"${sheet}"`), `${sheet} doit borner la position E`);
  assert.ok(formula.includes('"V";"X"'), `${sheet} doit signaler les tickers inconnus X`);
}
assert.ok(context._cexBuildVerifFormula_('CEX - "Crypto"').includes("'Portefeuille Crypto Details'!$E:$E;\"CEX - \"\"Crypto\"\"\""), 'les guillemets du nom de position Crypto doivent être échappés');
for (const sheet of ['CEX - Kraken Stocks', 'CEX - Bitpanda Stocks']) {
  const expected = '=MAP(A3:A;B3:B;LAMBDA(s;b;IF(s="";"";IF(N(b)<=0;"";IF(COUNTIFS(\'Portefeuille Action Details\'!$E:$E;"' + sheet + '";\'Portefeuille Action Details\'!$F:$F;s)>0;"V";"X")))))';
  assert.equal(context._cexBuildVerifFormula_(sheet), expected, `${sheet} doit conserver exactement la branche Actions`);
}
let storedFormula = '=ancienne_formule_C';
const writes = [];
const sheet = { getRange(row, column) { return {
  getValue() { return 'Vérif'; }, getFormula() { return storedFormula; },
  setValue(value) { writes.push({ row, column, value }); },
  setFormula(value) { storedFormula = value; writes.push({ row, column, formula: value }); },
}; } };
context._cexWriteVerifMap_(sheet, 'CEX - OKX');
assert.ok(storedFormula.includes(`'Portefeuille Crypto Details'!$F:$F;${literalTickerCriterion}`), 'une synchronisation doit régénérer le contrôle F');
const count = writes.length;
context._cexWriteVerifMap_(sheet, 'CEX - OKX');
assert.equal(writes.length, count, 'la seconde écriture inchangée doit rester idempotente');
console.log('PASS — sept CEX Crypto, deux Actions inchangées, régénération et idempotence Vérif');
