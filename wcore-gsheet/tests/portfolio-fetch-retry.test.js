const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const stockSource = fs.readFileSync(path.join(__dirname, '..', 'src', '42_STOCK_PORTFOLIO.gs'), 'utf8');
const cryptoSource = fs.readFileSync(path.join(__dirname, '..', 'src', '43_CRYPTO_PORTFOLIO.gs'), 'utf8');

const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log('OK - ' + name);
  } catch (err) {
    failures.push({ name, err });
    console.error('FAIL - ' + name + ': ' + err.message);
  }
}

function makeContext(gsSource, fetchImpl) {
  let sleeps = 0;
  const context = {
    console,
    JSON,
    Date,
    Number,
    String,
    Array,
    Math,
    isFinite,
    parseInt,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => {
          if (key === 'WCORE_WEB_API_URL') return 'https://api.example.test';
          if (key === 'GSHEET_API_TOKEN') return 'secret';
          return null;
        },
      }),
    },
    UrlFetchApp: { fetch: fetchImpl },
    Utilities: { sleep: () => { sleeps++; } },
    Logger: { log: () => {} },
  };
  context.__getSleeps = () => sleeps;
  vm.createContext(context);
  vm.runInContext(gsSource, context);
  return context;
}

function okResponse(body) {
  return {
    getResponseCode: () => 200,
    getContentText: () => JSON.stringify(body),
  };
}

const stockSnapshot = { ok: true, generatedAt: '2026-07-14T00:00:00Z', ownerAddress: '0xabc', dynamicLimit: 300, rows: [] };
const cryptoSnapshot = { ok: true, generatedAt: '2026-07-14T00:00:00Z', rows: [] };

// --- Stock portfolio ---

test('stock snapshot fetch retries a transient "Address unavailable" network throw', () => {
  let calls = 0;
  const ctx = makeContext(stockSource, () => {
    calls++;
    if (calls < 3) throw new Error('Address unavailable: https://api-production-b5bf.up.railway.app/api/gsheet/stocks/portfolio');
    return okResponse(stockSnapshot);
  });
  const snapshot = ctx._stockPortfolioFetchSnapshot_();
  assert.equal(calls, 3, 'must retry the transient network failure before succeeding');
  assert.equal(snapshot.ok, true, 'snapshot must be returned after a successful retry');
});

test('stock snapshot fetch does not retry a genuine HTTP error status', () => {
  let calls = 0;
  const ctx = makeContext(stockSource, () => {
    calls++;
    return { getResponseCode: () => 401, getContentText: () => 'unauthorized' };
  });
  assert.throws(() => ctx._stockPortfolioFetchSnapshot_(), /HTTP 401/);
  assert.equal(calls, 1, 'a 401 is authoritative and must not be retried');
});

// --- Crypto portfolio ---

test('crypto snapshot fetch retries a transient "Address unavailable" network throw', () => {
  let calls = 0;
  const ctx = makeContext(cryptoSource, () => {
    calls++;
    if (calls < 3) throw new Error('Address unavailable: https://api-production-b5bf.up.railway.app/api/gsheet/crypto/portfolio');
    return okResponse(cryptoSnapshot);
  });
  const snapshot = ctx._cryptoPortfolioFetchSnapshot_();
  assert.equal(calls, 3, 'must retry the transient network failure before succeeding');
  assert.equal(snapshot.ok, true, 'snapshot must be returned after a successful retry');
});

test('crypto snapshot fetch retries an HTTP 200 response with an empty JSON body', () => {
  let calls = 0;
  const ctx = makeContext(cryptoSource, () => {
    calls++;
    if (calls < 3) {
      return { getResponseCode: () => 200, getContentText: () => '' };
    }
    return okResponse(cryptoSnapshot);
  });
  const snapshot = ctx._cryptoPortfolioFetchSnapshot_();
  assert.equal(calls, 3, 'must retry an incomplete HTTP 200 response before succeeding');
  assert.equal(snapshot.ok, true, 'snapshot must be returned after a complete JSON response');
});

test('crypto snapshot fetch retries an HTTP 200 response with truncated JSON', () => {
  let calls = 0;
  const ctx = makeContext(cryptoSource, () => {
    calls++;
    if (calls < 3) {
      return { getResponseCode: () => 200, getContentText: () => '{"ok":true,"rows":[' };
    }
    return okResponse(cryptoSnapshot);
  });
  const snapshot = ctx._cryptoPortfolioFetchSnapshot_();
  assert.equal(calls, 3, 'must retry truncated JSON before succeeding');
  assert.equal(snapshot.ok, true, 'snapshot must be returned after a complete JSON response');
});

test('crypto snapshot fetch stops after three incomplete HTTP 200 responses', () => {
  let calls = 0;
  const ctx = makeContext(cryptoSource, () => {
    calls++;
    return { getResponseCode: () => 200, getContentText: () => '' };
  });
  assert.throws(
    () => ctx._cryptoPortfolioFetchSnapshot_(),
    /WCORE crypto portfolio incomplete JSON response: empty body/,
  );
  assert.equal(calls, 3, 'must stop after the configured retry limit');
});

test('crypto snapshot fetch does not retry a genuine HTTP error status', () => {
  let calls = 0;
  const ctx = makeContext(cryptoSource, () => {
    calls++;
    return { getResponseCode: () => 500, getContentText: () => 'boom' };
  });
  assert.throws(() => ctx._cryptoPortfolioFetchSnapshot_(), /HTTP 500/);
  assert.equal(calls, 1, 'a 500 with a real response is authoritative and must not be retried');
});

if (failures.length) {
  console.error('\n' + failures.length + ' failing test(s)');
  process.exit(1);
}
console.log('\nportfolio fetch retry OK');
