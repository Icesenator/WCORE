const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', '44_CEX_BULK.gs'), 'utf8');
const calls = [];
const props = {};
let binanceMustFail = false;

const context = {
  console,
  Date,
  JSON,
  Math,
  String,
  Number,
  Array,
  Object,
  RegExp,
  isFinite,
  encodeURIComponent,
  HttpCallCounter: { setTrigger: () => {} },
  LockService: {
    getScriptLock: () => ({
      tryLock: () => true,
      releaseLock: () => {},
    }),
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (key) => props[key] || null,
      setProperty: (key, value) => { props[key] = String(value); },
    }),
  },
  UPDATE_BINANCE_SPOT: () => {
    calls.push('BINANCE');
    if (binanceMustFail) throw new Error('binance failed');
    return 'BINANCE_OK';
  },
  UPDATE_BYBIT_SPOT: () => { calls.push('BYBIT'); return 'BYBIT_OK'; },
  UPDATE_COINBASE_SPOT: () => { calls.push('COINBASE'); return 'COINBASE_OK'; },
  UPDATE_OKX_SPOT: () => { calls.push('OKX'); return 'OKX_OK'; },
};
vm.createContext(context);
vm.runInContext(source, context);

assert.equal(typeof context.UPDATE_CEX_RELAY_ROTATION, 'function', 'UPDATE_CEX_RELAY_ROTATION must exist');
for (let i = 0; i < 4; i++) {
  const before = calls.length;
  context.UPDATE_CEX_RELAY_ROTATION();
  assert.equal(calls.length, before + 1, 'rotation must execute exactly one provider per invocation');
}
assert.deepEqual(calls, ['BINANCE', 'BYBIT', 'COINBASE', 'OKX'], 'rotation must use Binance, Bybit, Coinbase, OKX order');

calls.length = 0;
props.CEX_RELAY_ROTATION_CURSOR = '0';
binanceMustFail = true;
assert.throws(() => context.UPDATE_CEX_RELAY_ROTATION(), /binance failed/);
assert.equal(props.CEX_RELAY_ROTATION_CURSOR, '1', 'cursor must advance durably before the provider call fails');
binanceMustFail = false;
context.UPDATE_CEX_RELAY_ROTATION();
assert.deepEqual(calls, ['BINANCE', 'BYBIT'], 'provider failure must not block the next provider on the next invocation');

console.log('CEX relay rotation OK');
