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

const shared = {
  values: {},
  scriptLockHeld: false,
  blockScriptLock: false,
  // v4.16.82: number of upcoming tryLock calls that must answer false (short
  // contention), independently of blockScriptLock (permanent contention).
  failTryLockTimes: 0,
  now: 1000,
  uuid: 0,
  sleptMs: 0,
  logs: [],
};

function executionContext() {
  const context = {
    JSON,
    Math,
    String,
    Number,
    Object,
    isFinite,
    parseInt,
    Date: { now: () => shared.now },
    Utilities: {
      getUuid: () => `owner-${++shared.uuid}`,
      sleep: (ms) => { shared.sleptMs += ms; },
    },
    Logger: { log: (m) => { shared.logs.push(String(m)); } },
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
          if (shared.failTryLockTimes > 0) { shared.failTryLockTimes--; return false; }
          if (shared.blockScriptLock || shared.scriptLockHeld) return false;
          shared.scriptLockHeld = true;
          return true;
        },
        releaseLock: () => { shared.scriptLockHeld = false; },
      }),
    },
    _CEX_LOCK_TTL_MS: 10 * 60 * 1000,
    _CEX_LOCK_TRY_MS: 1000,
    _CEX_LOCK_MAX_ATTEMPTS: 3,
    _CEX_LOCK_RETRY_SLEEP_MS: 250,
  };
  vm.createContext(context);
  vm.runInContext([
    'var _CEX_LOCK_OWNERS = {};',
    extractFunction('_cexWithScriptLock_'),
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
manual.CEX_RELEASE_LOCK('BINANCE');

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

// ─── v4.16.82 — une contention COURTE ne doit pas perdre la liberation ────────────
// Avant : CEX_RELEASE_LOCK sortait de son try sur un tryLock(1 s) rate, la propriete
// CEX_LOCK_<NAME> survivait jusqu'a son TTL de 10 min et le finally oubliait le owner :
// tout appel suivant du connecteur repondait BUSY pendant 10 min, sans trace.
// Symptome observe 2026-10-01 (P1-REL-CEX-LEASE-RELEASE-LOSS) : donnees Kraken
// ecrites 18:44, puis "ERROR: BUSY" sur les deux onglets a 18:45.
{
  const leaked = executionContext();
  assert.equal(leaked.CEX_ACQUIRE_LOCK('KRAKEN'), true, 'la lease doit etre acquise');
  shared.failTryLockTimes = 1; // premiere tentative de liberation ratee
  const sleptBefore = shared.sleptMs;
  leaked.CEX_RELEASE_LOCK('KRAKEN');
  assert.equal(shared.failTryLockTimes, 0, 'la liberation doit retenter apres une contention courte');
  assert.ok(shared.sleptMs > sleptBefore, 'la retry doit attendre au lieu de boucler');
  assert.equal(shared.values.CEX_LOCK_KRAKEN, undefined, 'la lease doit etre supprimee malgre la contention courte');
  assert.equal(leaked.CEX_ACQUIRE_LOCK('KRAKEN'), true, 'le connecteur doit redevenir disponible immediatement');
  leaked.CEX_RELEASE_LOCK('KRAKEN');
  assert.equal(shared.values.CEX_LOCK_KRAKEN, undefined, 'la lease du second passage doit etre liberee');
}

// ─── v4.16.82 — la retry est bornee, la contention permanente reste fail-closed ────
{
  const busy = executionContext();
  assert.equal(busy.CEX_ACQUIRE_LOCK('OKX'), true, 'lease acquise avant saturation');
  shared.blockScriptLock = true;
  shared.failTryLockTimes = 99; // saturation durable du script lock
  const logsBefore = shared.logs.length;
  busy.CEX_RELEASE_LOCK('OKX');
  assert.equal(shared.failTryLockTimes, 96, 'la retry doit etre bornee a _CEX_LOCK_MAX_ATTEMPTS');
  assert.ok(
    shared.values.CEX_LOCK_OKX,
    'sans suppression possible, la lease reste posee jusqu a son TTL (filet de securite)',
  );
  assert.equal(shared.logs.length, logsBefore + 1, 'un abandon de liberation doit laisser une trace');
  assert.match(shared.logs[shared.logs.length - 1], /CEX_RELEASE_LOCK\(OKX\)/, 'la trace doit nommer le connecteur');
  shared.blockScriptLock = false;
  shared.failTryLockTimes = 0;
}

console.log('CEX connector lock OK');
