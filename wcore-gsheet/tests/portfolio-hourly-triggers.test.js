const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const autoHeal = fs.readFileSync(path.join(root, 'src/16B_AUTO_HEAL.gs'), 'utf8');
const stock = fs.readFileSync(path.join(root, 'src/42_STOCK_PORTFOLIO.gs'), 'utf8');
const crypto = fs.readFileSync(path.join(root, 'src/43_CRYPTO_PORTFOLIO.gs'), 'utf8');

assert.ok(/function STOCK_PORTFOLIO_HOURLY_REFRESH\(\)/.test(stock), 'Portefeuille Action hourly refresh function must exist');
assert.ok(/function CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH\(\)/.test(crypto), 'Portefeuille Crypto V2 hourly refresh function must exist');

for (const fn of ['STOCK_PORTFOLIO_HOURLY_REFRESH', 'CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH']) {
  assert.ok(autoHeal.includes(`"${fn}"`), `${fn} must be managed by auto-heal`);
  assert.ok(new RegExp(`newTrigger\\("${fn}"\\)\\.timeBased\\(\\)\\.everyHours\\(1\\)`).test(autoHeal), `${fn} must be installed hourly`);
}

console.log('portfolio hourly triggers guard OK');
