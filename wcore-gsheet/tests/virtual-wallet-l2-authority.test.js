const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const core = fs.readFileSync(path.join(__dirname, '..', 'src', '04A_CACHE_CORE.gs'), 'utf8');
const wallet = fs.readFileSync(path.join(__dirname, '..', 'src', '04B_CACHE_WALLET.gs'), 'utf8');

const key = 'ETHEREUM_CACHE_WALLET_0x17d518736ee9341dcdc0a2498e013d33cfcdd080';
const context = {
  console, Date, JSON, Math, Number, String, Array, Object, RegExp,
  isFinite, parseInt, parseFloat,
  CK_get: (name) => name === 'walletGlobal' ? 'GLOBAL_WALLET_CACHE_V1' : name,
  ModuleRegistry: { register: () => {} },
  Logger: { log: () => {} },
  Num: { isValid: (v) => Number.isFinite(Number(v)) },
  Format: { datetime: (v) => String(v) },
  Obj: { forEach: () => {} },
  CacheManager: {},
  GLOBAL_CACHE_KEYS: {
    GLOBAL_PRICES: 'GLOBAL_PRICES', GLOBAL_FX: 'GLOBAL_FX', GLOBAL_META: 'GLOBAL_META',
    CACHE_VERSIONS: 'CACHE_VERSIONS', LAST_CLEANUP: 'LAST_CLEANUP', GLOBAL_WALLET: 'GLOBAL_WALLET_CACHE_V1',
  },
  PropertiesService: { getScriptProperties: () => ({ getProperties: () => ({}), getProperty: () => null }) },
  CacheService: { getScriptCache: () => ({ get: () => 'STALE_L1', put: () => {}, remove: () => {} }) },
};
vm.createContext(context);
vm.runInContext(core, context);
vm.runInContext(wallet, context);

context.CacheManager._VIRTUALIZE_CHAIN_CACHES = true;
context.CacheManager._isVirtualKey_ = () => true;
context.CacheManager._packedGet_ = () => 'FRESH_L2';
context.CacheManager._cache = { get: () => 'STALE_L1', put: () => {}, remove: () => {} };
context.CacheManager._props = { getProperty: () => null };

assert.equal(
  context.CacheManager.safeGet(key),
  'FRESH_L2',
  'virtualized wallet cache reads must prefer authoritative packed L2 over stale per-key L1',
);

console.log('virtual wallet L2 authority OK');
