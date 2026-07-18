const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const autoHeal = fs.readFileSync(path.join(root, 'src/16B_AUTO_HEAL.gs'), 'utf8');
const stock = fs.readFileSync(path.join(root, 'src/42_STOCK_PORTFOLIO.gs'), 'utf8');
const crypto = fs.readFileSync(path.join(root, 'src/43_CRYPTO_PORTFOLIO.gs'), 'utf8');
const vm = require('vm');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} not found`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} body not closed`);
}

assert.ok(/function STOCK_PORTFOLIO_HOURLY_REFRESH\(\)/.test(stock), 'Portefeuille Action hourly refresh function must exist');
assert.ok(/function CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH\(\)/.test(crypto), 'Portefeuille Crypto V2 hourly refresh function must exist');

for (const fn of ['STOCK_PORTFOLIO_HOURLY_REFRESH', 'CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH']) {
  assert.ok(autoHeal.includes(`"${fn}"`), `${fn} must be managed by auto-heal`);
  assert.ok(new RegExp(`newTrigger\\("${fn}"\\)\\.timeBased\\(\\)\\.everyHours\\(1\\)`).test(autoHeal), `${fn} must be installed hourly`);
}

for (const [source, updateName, hourlyName] of [
  [stock, 'UPDATE_STOCK_PORTFOLIO', 'STOCK_PORTFOLIO_HOURLY_REFRESH'],
  [crypto, 'UPDATE_CRYPTO_PORTFOLIO_V2', 'CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH']
]) {
  const update = extractFunction(source, updateName);
  assert.match(update, /LockService\.getDocumentLock\s*\(\)/, `${updateName} must use the shared document lock`);
  assert.match(update, /tryLock\s*\(/, `${updateName} must avoid overlap without waiting indefinitely`);
  assert.match(update, /finally\s*\{[\s\S]*releaseLock\s*\(/, `${updateName} must always release its lock`);

  let spreadsheetCalls = 0;
  const context = {
    BITPANDA_SYNC_CONFIG: { SPREADSHEET_ID: 'test' },
    LockService: { getDocumentLock: () => ({ tryLock: () => false, releaseLock() {} }) },
    SpreadsheetApp: {
      getActiveSpreadsheet() { spreadsheetCalls++; return null; },
      openById() { spreadsheetCalls++; return null; }
    }
  };
  vm.createContext(context);
  vm.runInContext(update, context);
  assert.match(context[updateName](), /^BUSY:/, `${updateName} must return a clear BUSY result`);
  assert.strictEqual(spreadsheetCalls, 0, `${updateName} BUSY path must not touch or overwrite sheet status`);

  let releases = 0;
  context.LockService = { getDocumentLock: () => ({ tryLock: () => true, releaseLock: () => { releases++; } }) };
  context.SpreadsheetApp = {
    getActiveSpreadsheet() { throw new Error('spreadsheet unavailable'); },
    openById() { throw new Error('spreadsheet unavailable'); }
  };
  assert.throws(() => context[updateName](), /spreadsheet unavailable/);
  assert.strictEqual(releases, 1, `${updateName} must release an acquired lock after failure`);

  const wrapper = extractFunction(source, hourlyName);
  assert.match(wrapper, /finally\s*\{[\s\S]*HttpCallCounter\.clearTrigger\s*\(/, `${hourlyName} must clear trigger attribution`);
}

assert.doesNotMatch(stock, /function STOCK_PORTFOLIO_RECOVERY_REFRESH\s*\(/);
assert.doesNotMatch(crypto, /function CRYPTO_PORTFOLIO_V2_RECOVERY_REFRESH\s*\(/);

console.log('portfolio hourly triggers guard OK');
