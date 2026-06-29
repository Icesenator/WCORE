const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', '10A_BASE_ENGINE.gs'), 'utf8');

const context = {
  console,
  Date,
  JSON,
  Math,
  Number,
  String,
  Array,
  Object,
  RegExp,
  isFinite,
  parseFloat,
  parseInt,
  BaseEngine: {},
  Num: {
    isValid: (v) => Number.isFinite(Number(v)),
    isValidPositive: (v) => Number.isFinite(Number(v)) && Number(v) > 0,
    isPositive: (v) => Number.isFinite(Number(v)) && Number(v) > 0,
  },
  Obj: {
    keyCount: (o) => (o && typeof o === 'object' ? Object.keys(o).length : 0),
    forEach: (o, fn) => Object.keys(o || {}).forEach((k) => fn(k, o[k])),
  },
  Format: {
    datetime: (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' '),
  },
  Addr: { normalize: (v) => String(v).toLowerCase() },
  Logger: { log: () => {} },
};

vm.createContext(context);
vm.runInContext(source, context);

{
  const cache = {
    assets: [
      { contract: 'native', balance: 1, price_eur: 2000 },
      { contract: '0x0000000000000000000000000000000000000001', balance: 10, price_eur: 1 },
      { contract: '0x0000000000000000000000000000000000000002', balance: 20, price_eur: null },
      { contract: '0x0000000000000000000000000000000000000003', balance: 0, price_eur: null },
    ],
    priceMap: {
      native: 2000,
      '0x0000000000000000000000000000000000000001': 1,
    },
  };

  assert.equal(
    context.BaseEngine.countMissingPricesFromCache(cache),
    1,
    'stats fallback must count visible balance-positive tokens without price',
  );
}

{
  const cache = {
    updatedAt: Date.UTC(2026, 5, 28, 10, 30, 0),
    assets: [],
    priceMap: {},
    priceTsMap: {},
    balanceTsMap: {},
    attemptTsMap: {},
    purgedTsMap: {},
    scanStats: {
      source: 'wcore-web',
      scanMs: 456,
      vm: 'EVM',
      fullCycleComplete: true,
    },
  };

  context.WalletCache = {
    getLastRunUpdateStr: () => '2026-06-28 10:30:00',
    getLastUpdateStr: () => '2026-06-28 10:30:00',
  };
  context.GlobalPriceCache = { load: () => ({ priceMap: {}, priceTsMap: {} }) };
  context.MetaCache = { load: () => ({}) };
  context.RpcHealth = { loadFromCache: () => {}, _state: {} };
  context.ActivityTracker = {
    getInfo: () => null,
    hasRecentActivity: () => false,
  };

  const rows = context.BaseEngine.buildStatsBase(
    '0xwallet',
    cache,
    {
      CHAIN: { NAME: 'Camp' },
      CACHE: { WALLET_TTL_MS: 86400000 },
      KEYS: { NATIVE_PRICE: 'native@camp' },
      VERSION: 'CAMP_EVM_v4.15.51',
    },
    'Ledger - Camp',
    'EVM',
    { elapsed: () => 123 },
  );
  const stats = Object.fromEntries(rows.slice(1));

  assert.equal(stats.exec_ms, '123 ms', 'Recap Portfolio must find exact exec_ms metric');
  assert.equal(
    stats.last_cache_update,
    '2026-06-28 10:30:00',
    'Recap Portfolio must find exact last_cache_update metric',
  );
}

console.log('base engine stats OK');
