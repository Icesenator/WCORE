const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../src/35_BITPANDA_SYNC.gs'), 'utf8');
const helper = source.slice(source.indexOf('var CEX_RELAY_MAX_RETRIES ='), source.indexOf('\n}', source.indexOf('function _cexRelayFetchWithRetry_(')) + 2);

function runtime() {
  const sleeps = [];
  const context = { Logger: { log() {} }, Utilities: { sleep(ms) { sleeps.push(ms); } } };
  vm.runInNewContext(helper, context);
  return { retry: context._cexRelayFetchWithRetry_, sleeps };
}

test('Address unavailable is retried before returning a fresh result', () => {
  const { retry, sleeps } = runtime();
  let calls = 0;
  const result = retry(() => {
    if (++calls < 3) throw new Error('Exception: Address unavailable: https://relay.example.test/okx');
    return { spot: ['fresh'] };
  }, 'OKX');
  assert.deepEqual(result, { spot: ['fresh'] });
  assert.equal(calls, 3);
  assert.equal(sleeps.length, 2);
});

test('Address unavailable exhausts bounded attempts then preserves the error', () => {
  const { retry, sleeps } = runtime();
  let calls = 0;
  assert.throws(() => retry(() => {
    calls++;
    throw new Error('Exception: Address unavailable: https://relay.example.test/coinbase');
  }, 'COINBASE'), /Address unavailable/);
  assert.equal(calls, 3);
  assert.equal(sleeps.length, 2);
});

test('non-network errors are not retried', () => {
  const { retry, sleeps } = runtime();
  let calls = 0;
  assert.throws(() => retry(() => {
    calls++;
    throw new Error('Relay HTTP 401: unauthorized');
  }, 'OKX'), /401/);
  assert.equal(calls, 1);
  assert.equal(sleeps.length, 0);
});
