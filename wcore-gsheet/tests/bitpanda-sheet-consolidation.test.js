const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const bitpanda = fs.readFileSync(path.join(root, 'src', '35_BITPANDA_SYNC.gs'), 'utf8');
const portfolio = fs.readFileSync(path.join(root, 'src', '42_STOCK_PORTFOLIO.gs'), 'utf8');
const details = fs.readFileSync(path.join(root, 'src', '44_XSTOCKS_SOLANA.gs'), 'utf8');
const autoHeal = fs.readFileSync(path.join(root, 'src', '16B_AUTO_HEAL.gs'), 'utf8');

assert.ok(!/COMMODITY:\s*"CEX - Bitpanda Commodity"/.test(bitpanda));
assert.ok(!/FIAT:\s*"CEX - Bitpanda Fiat"/.test(bitpanda));
assert.ok(!bitpanda.includes('SHEETS.COMMODITY'));
assert.ok(!bitpanda.includes('SHEETS.FIAT'));
assert.ok(!portfolio.includes('CEX - Bitpanda Fiat'));
assert.ok(!portfolio.includes('CEX - Bitpanda Commodity'));
assert.ok(!details.includes('EURC_FIAT_SHEET_NAME: "CEX - Bitpanda Fiat"'));
assert.ok(!details.includes('"CEX - Bitpanda Commodity"'));
assert.ok(!autoHeal.includes('"CEX - Bitpanda Fiat"'));
assert.ok(!autoHeal.includes('"CEX - Bitpanda Commodity"'));
assert.ok(details.includes('EURC_FIAT_SHEET_NAME: "CEX - Bitpanda Stocks"'));
assert.ok(details.includes('String(symbol || "").toUpperCase() === "EUR"'));
assert.ok(!details.includes('ticker: "EURC", mint: "", quantity: fiatQuantity'));

console.log('bitpanda sheet consolidation dependencies: OK');
