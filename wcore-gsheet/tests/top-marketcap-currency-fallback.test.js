const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', '34_TOP_MARKETCAP.gs'), 'utf8');
const context = {
  console,
  ScriptApp: { WeekDay: {} },
};

vm.createContext(context);
vm.runInContext(source, context);

assert.strictEqual(typeof context._topMcCurrencyFallbackFormula_, 'function');

const fallback = context._topMcCurrencyFallbackFormula_(13);
assert.match(fallback, /A13/);
assert.match(fallback, /"KRX";"KRW"/);
assert.match(fallback, /"KOSDAQ";"KRW"/);

assert.match(
  String(context.UPDATE_TOP_MARKETCAP),
  /_topMcCurrencyFallbackFormula_\(row\)/,
  'Currency formula must use the exchange-aware fallback instead of assuming USD'
);

console.log('Top market-cap currency fallback guard OK');
