const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const listing = stripComments(read('src/17_LISTING.gs'));
const topMarketcap = stripComments(read('src/34_TOP_MARKETCAP.gs'));
const cex = stripComments(read('src/35_BITPANDA_SYNC.gs'));
const stock = stripComments(read('src/42_STOCK_PORTFOLIO.gs'));
const cexContext = { console };
vm.createContext(cexContext);
vm.runInContext(read('src/35_BITPANDA_SYNC.gs'), cexContext);

assert.doesNotMatch(listing, /Portefeuille Crypto Details V2/,
  'details hyperlink maintenance must not target the old V2 tab name');
assert.match(listing, /getSheetByName\("Portefeuille Crypto Details"\)/,
  'details hyperlink maintenance should target the canonical Details tab');
assert.match(listing, /getName\(\) !== "Portefeuille Crypto Details"/,
  'details per-cell autolink should target the canonical Details tab');

assert.doesNotMatch(topMarketcap, /Portefeuille Crypto V2/,
  'Action rebalancing fallback market-cap lookup must not target the old V2 tab name');
assert.match(topMarketcap, /'Portefeuille Crypto'!A:E/,
  'Action rebalancing fallback market-cap lookup should target the canonical crypto tab');

assert.doesNotMatch(cex, /Portefeuille Crypto V2/,
  'CEX price map must not target the old V2 tab name');
assert.match(cex, /getSheetByName\("Portefeuille Crypto"\)/,
  'CEX price map should target the canonical crypto tab');
assert.strictEqual(typeof cexContext._cexBuildVerifFormula_, 'function',
  'CEX verification formula builder must be loadable');
const cryptoCexFormula = cexContext._cexBuildVerifFormula_('CEX - Binance');
assert.match(cryptoCexFormula, /'Portefeuille Crypto Details'!\$E:\$E/,
  'CEX verification formulas should target canonical Details');
assert.doesNotMatch(cryptoCexFormula, /Portefeuille Crypto Details V2/,
  'CEX verification formulas must not target the old V2 Details tab');

assert.doesNotMatch(stock, /Portefeuille Crypto Details V2/,
  'Portefeuille Action EUR cash formula must not target the old V2 Details tab');
assert.match(stock, /'Portefeuille Crypto Details'!E:E/,
  'Portefeuille Action EUR cash formula should target canonical Details');

console.log('crypto V2 dependency migration guard OK');
