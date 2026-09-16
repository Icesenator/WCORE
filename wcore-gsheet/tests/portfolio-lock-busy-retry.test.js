const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const stock = fs.readFileSync(path.join(root, 'src/42_STOCK_PORTFOLIO.gs'), 'utf8');
const crypto = fs.readFileSync(path.join(root, 'src/43_CRYPTO_PORTFOLIO.gs'), 'utf8');

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

for (const [source, updateName] of [
  [stock, 'UPDATE_STOCK_PORTFOLIO'],
  [crypto, 'UPDATE_CRYPTO_PORTFOLIO_V2']
]) {
  const fn = extractFunction(source, updateName);

  // The Stock and Crypto hourly triggers fire at the same minute and contend for the
  // document lock. Regression (v4.16.77): the loser must WAIT (bounded) for the sibling
  // refresh instead of returning BUSY on the first try and freezing a stale B1 forever.
  const tryLockCount = (fn.match(/tryLock\s*\(/g) || []).length;
  assert.ok(tryLockCount >= 2, `${updateName} must retry tryLock (bounded wait), found ${tryLockCount}`);
  assert.match(fn, /Utilities\.sleep\s*\(/, `${updateName} must back off between lock retries`);
  assert.doesNotMatch(
    fn,
    /if\s*\(\s*!\s*\w*[Ll]ock\.tryLock\s*\(\s*1000\s*\)\s*\)\s*return\s+"BUSY/,
    `${updateName} must not return BUSY on the first tryLock(1000)`
  );

  // Behaviour 1: lock is busy at first, then the sibling releases it -> refresh proceeds,
  // it must NOT early-return BUSY.
  let attempts = 0;
  let sleeps = 0;
  let releases = 0;
  let spreadsheetTouched = false;
  const ctxBusy = {
    LockService: { getDocumentLock: () => ({
      tryLock: () => { attempts++; return attempts >= 3; },
      releaseLock: () => { releases++; }
    }) },
    Utilities: { sleep: () => { sleeps++; } },
    SpreadsheetApp: {
      getActiveSpreadsheet() { spreadsheetTouched = true; throw new Error('spreadsheet unavailable'); },
      openById() { spreadsheetTouched = true; throw new Error('spreadsheet unavailable'); }
    }
  };
  vm.createContext(ctxBusy);
  vm.runInContext(fn, ctxBusy);
  assert.throws(() => ctxBusy[updateName](), /spreadsheet unavailable/);
  assert.ok(spreadsheetTouched, `${updateName} must enter the refresh body once the lock frees`);
  assert.ok(sleeps >= 1, `${updateName} must back off before retrying the lock`);
  assert.strictEqual(releases, 1, `${updateName} must release the acquired lock`);

  // Behaviour 2: lock never frees -> bounded give-up (BUSY), no sheet write, no infinite loop.
  attempts = 0; sleeps = 0; spreadsheetTouched = false;
  const ctxLocked = {
    LockService: { getDocumentLock: () => ({ tryLock: () => { attempts++; return false; }, releaseLock() {} }) },
    Utilities: { sleep: () => { sleeps++; } },
    SpreadsheetApp: {
      getActiveSpreadsheet() { spreadsheetTouched = true; return null; },
      openById() { spreadsheetTouched = true; return null; }
    }
  };
  vm.createContext(ctxLocked);
  vm.runInContext(fn, ctxLocked);
  assert.match(ctxLocked[updateName](), /^BUSY:/, `${updateName} must still give up BUSY after the bounded retries`);
  assert.strictEqual(spreadsheetTouched, false, `${updateName} BUSY path must not touch sheet status`);
  assert.ok(attempts >= 2 && attempts <= 10, `${updateName} retry loop must be bounded, got ${attempts} attempts`);
}

console.log('portfolio lock BUSY bounded-wait guard OK');
