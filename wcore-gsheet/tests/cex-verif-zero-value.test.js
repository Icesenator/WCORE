// Verif CEX crypto (v4.16.83) : une ligne valorisee a 0 EUR en colonne E n'est ni V ni X (decision de Florian, 22/11/2026).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/35_BITPANDA_SYNC.gs'), 'utf8');
const context = { Logger: { log() {} } };
vm.createContext(context);
vm.runInContext(source, context);

const crypto = context._cexBuildVerifFormula_('CEX - OKX');
assert.ok(crypto.startsWith('=MAP(A3:A;B3:B;E3:E;LAMBDA(s;b;v;'), 'la colonne E (value_eur) entre dans le MAP');
assert.ok(crypto.includes('IF(AND(ISNUMBER(v);v=0);"";'), 'une valeur numerique de 0 EUR donne une cellule vide');
// Le test de valeur passe avant la recherche dans Details : une ligne a 0 EUR n'est jamais X.
assert.ok(crypto.indexOf('ISNUMBER(v)') < crypto.indexOf('COUNTIFS('), 'le test 0 EUR precede la recherche dans Details');
assert.equal((crypto.match(/\(/g) || []).length, (crypto.match(/\)/g) || []).length, 'parentheses equilibrees');

// Branche Actions/Fiat inchangee.
const stocks = context._cexBuildVerifFormula_('CEX - Kraken Stocks');
assert.ok(!stocks.includes('E3:E'), 'la branche Actions ne change pas');

console.log('cex-verif-zero-value: OK');
