const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', '04B_CACHE_WALLET.gs'), 'utf8');

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
  CacheManager: {},
  GLOBAL_CACHE_KEYS: {
    GLOBAL_PRICES: 'GLOBAL_PRICES',
    GLOBAL_FX: 'GLOBAL_FX',
    GLOBAL_META: 'GLOBAL_META',
    CACHE_VERSIONS: 'CACHE_VERSIONS',
    LAST_CLEANUP: 'LAST_CLEANUP',
    GLOBAL_WALLET: 'GLOBAL_WALLET_CACHE_V1',
  },
  Obj: { forEach: () => {} },
  Logger: { log: () => {} },
};

vm.createContext(context);
vm.runInContext(source, context);

{
  const payload = {
    version: 64,
    updatedAt: Date.now(),
    assets: [
      { contract: 'native', balance: 1, symbol: 'ETH', name: 'Ether', decimals: 18 },
      { contract: '0x0000000000000000000000000000000000000001', balance: 10, symbol: 'MISS', name: 'Missing Price', decimals: 18 },
    ],
    priceMap: { native: 2100 },
    priceTsMap: { native: 12345 },
    scanStats: {
      source: 'wcore-web',
      fullCycleComplete: false,
      totalContracts: 1,
      scannedCount: 1,
      missingPrices: 1,
      missingMeta: 0,
    },
  };

  const compact = context.CacheManager._deflateWalletPayload_(payload);
  const inflated = context.CacheManager._inflateWalletPayload_(compact);

  assert.equal(inflated.version, 64, 'packed wallet cache must preserve logical cache version');
  assert.equal(inflated.priceTsMap.native, 12345, 'packed wallet cache must preserve price timestamps');
  assert.equal(inflated.scanStats.source, 'wcore-web', 'packed wallet cache must preserve web scan stats');
  assert.equal(inflated.scanStats.missingPrices, 1, 'packed wallet cache must preserve missing price count');
  assert.equal(inflated.scanStats.fullCycleComplete, false, 'packed wallet cache must preserve incomplete cycle status');
}

console.log('packed wallet cache OK');
