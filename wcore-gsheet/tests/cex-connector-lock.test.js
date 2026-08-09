const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', '35_BITPANDA_SYNC.gs'), 'utf8');
assert.match(source, /var _CEX_LOCK_TTL_MS = 10 \* 60 \* 1000;/, 'provider lease TTL must cover the 6-minute GAS limit plus margin');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

const shared = { values: {}, scriptLockHeld: false, blockScriptLock: false, now: 1000, uuid: 0 };

function executionContext() {
  const context = {
    JSON,
    Math,
    String,
    Number,
    Object,
    isFinite,
    Date: { now: () => shared.now },
    Utilities: { getUuid: () => `owner-${++shared.uuid}` },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => shared.values[key] || null,
        setProperty: (key, value) => { shared.values[key] = String(value); },
        deleteProperty: (key) => { delete shared.values[key]; },
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          if (shared.blockScriptLock || shared.scriptLockHeld) return false;
          shared.scriptLockHeld = true;
          return true;
        },
        releaseLock: () => { shared.scriptLockHeld = false; },
      }),
    },
    _CEX_LOCK_TTL_MS: 10 * 60 * 1000,
    _CEX_LOCK_TRY_MS: 1000,
  };
  vm.createContext(context);
  vm.runInContext([
    'var _CEX_LOCK_OWNERS = {};',
    extractFunction('CEX_ACQUIRE_LOCK'),
    extractFunction('CEX_RELEASE_LOCK'),
  ].join('\n'), context);
  return context;
}

const rotation = executionContext();
const manual = executionContext();

assert.equal(rotation.CEX_ACQUIRE_LOCK('BINANCE'), true, 'rotation must acquire the provider lease');
assert.equal(manual.CEX_ACQUIRE_LOCK('BINANCE'), false, 'manual run must not overlap rotation for the same provider');
rotation.CEX_RELEASE_LOCK('BINANCE');
assert.equal(manual.CEX_ACQUIRE_LOCK('BINANCE'), true, 'manual run may acquire after rotation releases');

shared.blockScriptLock = true;
assert.equal(rotation.CEX_ACQUIRE_LOCK('OKX'), false, 'ScriptLock contention must fail closed');
assert.equal(shared.values.CEX_LOCK_OKX, undefined, 'contended acquisition must not claim a connector lease');
shared.blockScriptLock = false;

assert.equal(rotation.CEX_ACQUIRE_LOCK('BYBIT'), true, 'rotation must acquire a second provider lease');
shared.now += 91 * 1000;
assert.equal(manual.CEX_ACQUIRE_LOCK('BYBIT'), false, 'provider lease must remain held beyond the old 90-second TTL');
shared.now += (10 * 60 * 1000) - (91 * 1000) + 1;
assert.equal(manual.CEX_ACQUIRE_LOCK('BYBIT'), true, 'provider lease may be replaced after the 10-minute TTL');
rotation.CEX_RELEASE_LOCK('BYBIT');
assert.ok(shared.values.CEX_LOCK_BYBIT, 'an expired owner must not release the replacement owner lease');
manual.CEX_RELEASE_LOCK('BYBIT');
assert.equal(shared.values.CEX_LOCK_BYBIT, undefined, 'current owner must release its own lease');

console.log('CEX connector lock OK');
